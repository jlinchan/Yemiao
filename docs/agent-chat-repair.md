# 夜喵对话修复与部署（2026-10-20）

本轮仅修改实际对话链路、错误处理、会话隔离和安全配置，没有修改任何 WXML、WXSS 或图片。

## 具体故障证据

1. 原 `services/agent-client.js:939` 的 Dify `catch` 调用 `failoverOrFallback()`，该函数只在原 `chat()` 内部的 `launch()` 中定义（原 641 行），Dify 路径会抛 ReferenceError。已用统一请求传输层替换两个重复实现，消除该越界引用。
2. 原流式请求固定 `max_tokens: MAX_TOKENS`（原 707 行，2000），没有使用 Reflect 通道配置的 20000。思考模型可能只返回推理而没有正文。现在严格发送当前模式预算，正文为空明确报错。
3. 原 success 回调未检查 HTTP 状态；Dify SSE error 事件也没有进入失败处理。401、403、429、500、空内容和网络错误都可能被本地规则话术掩盖。现已取消聊天失败时的模板回复，保留现有开场语、工具回执和推荐卡。
4. 原不支持分块时先 abort 再发 blocking，abort 的同步 fail 回调可能提前结算；迟到 chunk 也能继续改写文本。现用请求代次和终止状态统一隔离，取消和超时只通知一次。
5. 原 SSE 逐块替换 CRLF，会丢失恰好拆开的 `\r\n` 事件边界；服务端对每块 Buffer 直接 toString，也可能破坏中文；最后无空行事件没有 flush。客户端与服务端均已修复。
6. 原知识库代理把以 `/v1` 结束的 baseUrl 再拼 `/v1/datasets/...`，得到 `/v1/v1/...`；原桥接只保留第一条 system，丢失最后插入的检索/计划。现已修复路径与全部 system 拼接。
7. 原所有模式强制先分析再回答，取消时没有管理分析/检索任务；历史中工具卡和失败空泡也被当成 assistant 上下文。现普通聊天只生成一次，分析显式可选且失败继续生成；过滤失败/未完成/非对话角色，保留至多40条历史，与会话档案上限一致。
8. 原 Dify 全局单个 conversation_id 没有按会话隔离；页面重复使用 `agent-1` 等 ID，仅以气泡 ID 匹配迟到回调。现在 Dify 按本地会话区分，页面同时校验请求代次和会话 ID；代理采用携带完整历史的无状态模式，重试/重新生成不会复用旧 Dify 记忆。
9. 原客户端含真实模型、知识库及未使用 OCR 配置密钥。交付中已移除，供应商凭据只通过服务器环境变量读取；`server` 目录已加入小程序打包排除，客户端只配置代理地址。

## 部署步骤

1. 将 `server/` 和其依赖的 `utils/llm-stream.js` 部署到有 Node 20+ 的服务器。也可部署完整源码目录，但不要将源码和 `.env` 暴露为静态下载。
2. 复制 `server/.env.example` 为服务器上的 `server/.env`，设置有效 `MODEL_API_KEY`。Reflex/Reframe 示例使用已验证的 token 网关和 `deepseek-v4-flash-0731`，Reflect 使用 `glm-5.3-flash` 与20000预算。模型名和权限必须与供应商实际配置一致。也支持单独配置三种模式的地址/密钥/模型；不会把客户端任意地址当作上游。
3. 在项目根目录运行 `node --env-file=server/.env server/dify-bridge.js`，确认本地 `/healthz` 返回 `ok`。该健康检查只代表进程存活，不代表模型已连通。
4. 在你拥有的已备案域名配置 HTTPS 反向代理，将 `/v1/chat/completions` 转发到服务监听地址。流式路由关闭代理缓冲（如 Nginx 的 `proxy_buffering off`），并设置至少100秒读取超时。不要将示例域名视为已部署服务。
5. 修改小程序 `services/secrets.js` 中 `modelGateway.baseUrl` 为真实 `https://你的域名/v1/chat/completions`。`apiKey` 保持空，或接入自己的登录后代理访问凭证；不能填写供应商密钥。默认示例地址会明确提示“尚未配置”，不会发送虚假的模型回复。
6. 微信公众平台 → 开发管理 → 开发设置 → 服务器域名，将代理的 HTTPS 域名加入 **request 合法域名**。重新导入/编译小程序，并通过预览或体验版在真机测试。开发者工具“不校验合法域名”只供本地调试，不能替代正式配置；这些域名不在 app.json 中声明。

### Dify 可选部署

如使用 Dify 聊天应用，清空 `MODEL_*` 配置，仅在服务器设置 `DIFY_BASE_URL`、`DIFY_API_KEY`，并在 Dify 应用中声明 `prompt` 输入，系统提示词引用该变量。客户端仍使用同一个代理路由，不填 app- Key。

知识检索单独可选：服务器设置 `DIFY_DATASET_KEY`、`DIFY_DATASET_IDS`；客户端 `difyKnowledge` 设 `useProxy: true`、`baseUrl: 'https://你的代理域名/v1'`、实际 `datasetId`。不向客户端填 dataset- Key。知识库3秒超时、报错或没有命中均继续普通聊天。

原项目的 `docs/dify-integration.md` 已标记为历史接法，不应再按照其中的客户端直填 Key 示例发布。

## 验证

自动化：`node --test tests/*.test.js`；JavaScript 语法：`node --check 文件路径`。

最终复核：483项测试，477通过，0失败，6项TODO。6项TODO均为原项目已有的安全语料误报用例（修复前466项测试中也有同样6项TODO），没有将其计为已解决。全部179个JavaScript文件通过语法检查。新增测试覆盖五轮上下文、三种模式、流式/非流式、HTTP错误、网络恢复、超时、取消、迟到回调、会话隔离及历史保存。

真实模型验证：先配置同样的服务器环境变量，再运行 `node --env-file=server/.env tools/verify-agent-live.js`。它启动临时本地桥接，使用真正的 `services/agent-client.js`，按序测试五轮 Reframe 上下文，再测试 Reflex/Reflect 流式。测试会产生正常 API 调用；没有模型配置会明确退出，不会用 Mock 补成功。

本次真实验证结果：Reframe 五轮成功，并记住“小林”；Reflex 流式正文成功（20次增量）；Reflect 流式正文成功（600次增量，约28.7秒）。Reflex/Reframe 验证使用原包中 token 网关的0731模型；原 modelgateway 地址25秒探测超时，未将它计为连通。Dify 原包未配置聊天应用 Key，因此 Dify 聊天实际连接未验证；适配、检索路径、中文流和错误处理由本地协议测试覆盖。

公网代理、正式 HTTPS 证书、微信域名后台、开发者工具编译与真机体验尚未验证，需要项目所有者完成上述部署与操作。交付代码不会凭空获得可用公网服务。

原包曾包含真实凭据，建议在供应商后台轮换这些凭据，并仅把新凭据放到服务器环境变量。修复源码已扫描，未发现原包中的5个密钥值。
