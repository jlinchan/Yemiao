> 2026-10-20 修复说明：本文中的客户端直填 API Key 方式仅供历史参考。当前请按 [夜喵修复与安全部署](agent-chat-repair.md) 配置服务端代理，供应商密钥不得放入小程序。

# 夜喵 × Dify 接入指南

两种接法都已落地，可任选：

- **接法 A（直连）**：`agent-client.js` 内置 Dify 模式，配置 `secrets.dify` 即切换。改动集中、无后端，但 API Key 会被打包进小程序，只建议调试用。
- **接法 B（中间层，生产推荐）**：`server/dify-bridge.js` 把 Dify 包装成 OpenAI 兼容接口，小程序侧零改动（把 `modelGateway.baseUrl` 指过去），Key 留在服务端。

两种模式下，端上技能、推荐卡片、思考路径、安全门、规则引擎回退全部保留。**不配置 Dify 时行为与原来完全一致**（大赛模型网关）。

## 从零到生产：完整步骤

### 第 1 步 · Dify 侧准备（网页操作，约 15 分钟）

1. 注册/登录 Dify（云版 https://dify.ai 或自部署实例）。
2. 左侧「知识库」→ 创建知识库 → 上传睡眠知识文档 → 等待索引完成（分段+向量化）。
   **现成文档**：`docs/dify-kb/`（项目自研方法库，见该目录 README）+ `docs/books/` 两份书卡 md；
   外部资源可用 **Peace Lab Database**（4,922+ 篇疗愈 Markdown 语料，CC BY-NC-SA，含睡眠优化路径与危机资源层）。
3. 「知识库 → API」页：生成**知识库 API 密钥**（`dataset-` 开头），并记下**知识库 ID**（API 文档示例里的 dataset_id）。
4. （仅接法 A/B 需要此步，纯协作模式可跳过）「工作室」→ 创建**聊天助手** → 系统提示词填一行 `{{prompt}}` → 发布 → 「访问 API」生成**应用 API 密钥**（`app-` 开头）。

### 第 2 步 · 小程序本地调试（2 处配置）

复制 `services/secrets.example.js` 里新增的块到 `services/secrets.js`，按需填写：

```js
// 协作模式（推荐先做）：知识检索走 Dify，对话仍走大赛网关
difyKnowledge: {
  baseUrl: 'https://api.dify.ai/v1',
  apiKey: 'dataset-xxxx',   // 第 1.3 步的 dataset- Key
  datasetId: 'xxxx',        // 第 1.3 步的知识库 ID
  topK: 3
},
// （可选）接法 A：直连 Dify 对话调试
dify: { baseUrl: 'https://api.dify.ai/v1', apiKey: 'app-xxxx', promptVariable: 'prompt' }
```

微信开发者工具：详情 → 本地设置 → 勾选**「不校验合法域名」**→ 重新编译 → 打开夜喵对话说一句话 → Network 面板应看到 `datasets/xxx/retrieve`（检索）+ 对话请求两次调用。

### 第 3 步 · 生产部署（桥接服务，备案域名）

知识检索直连 `api.dify.ai` 过不了小程序合法域名校验，生产环境**对话和检索都走桥接**。服务器上：

```bash
DIFY_API_KEY=app-xxx \          # 接法 B 才需要；纯协作模式可不填
DIFY_DATASET_KEY=dataset-xxx \  # 知识库代理：dataset- Key（服务端持有，不进小程序）
DIFY_DATASET_IDS=xxx \          # 可选：知识库 ID 白名单
AUTH_TOKEN=自定义访问令牌 \
PORT=8787 \
node server/dify-bridge.js      # pm2/systemd 守护；Nginx 反代 443 + HTTPS
```

小程序 `services/secrets.js` 生产配置：

```js
modelGateway: {
  baseUrl: 'https://你的备案域名/v1/chat/completions',
  apiKey: '与 AUTH_TOKEN 相同的访问令牌',
  ...
},
difyKnowledge: {
  baseUrl: 'https://你的备案域名/v1',   // 检索走桥接代理
  apiKey: '与 AUTH_TOKEN 相同的访问令牌',
  datasetId: 'xxx',
  topK: 3
}
```

小程序后台「开发管理 → 服务器域名」把 `https://你的备案域名` 加入 **request 合法域名**。端上技能、推荐卡、思考路径、安全门全链路不变。

### 第 4 步 · 验证清单

- [ ] 开发者工具：对话正常、流式输出、思考路径折叠面板出现
- [ ] Network：每轮先 `retrieve` 后对话请求；检索失败时对话不受影响
- [ ] 技能：说"想听雨声"→ 播放卡/技能正常执行（端侧能力不走 Dify）
- [ ] 生产：真机（非开发者工具）跑通同一套流程

## 原理

- 对话请求从 OpenAI 兼容的 `chat/completions` 切到 Dify 的 `/v1/chat-messages`（流式 SSE）。
- 提示词仍在端上拼装（`services/agent-client.js` 的 `buildSystemPrompt`），完整产物通过 `inputs.prompt` 传给 Dify；Dify 应用模板里用 `{{prompt}}` 引用即可，**不用在 Dify 里重写提示词**。
- `@@THINK@@ / @@REC@@ / @@PUSH@@ / @@ASK@@ / @@DO@@` 等标记是纯文本约定，模型在 Dify 里照样输出，端上解析逻辑不变。
- 会话记忆由 Dify 的 `conversation_id` 服务端维护：首条事件返回、端上捕获、后续回带；本地无历史时视为新会话自动重置。

## Dify 侧配置

1. 在 Dify 创建一个**聊天助手**（或 Chatflow），发布应用。
2. 系统提示词填一行：`{{prompt}}`（进阶玩法：模板里改用 `{{topic}}`、`{{context}}`、`{{persona}}`、`{{expert}}`、`{{book}}`、`{{voice}}`、`{{knowledge}}`、`{{crisis}}`、`{{push_cards}}`、`{{skills}}` 这些分块变量自行组织，端上都会传入）。
3. 「访问 API」页生成 API 密钥（`app-` 开头），记下 API 服务器地址（云版为 `https://api.dify.ai/v1`）。

## 协作模式：知识检索走 Dify，对话技能走现有链路（推荐起步）

不必二选一。`services/dify-knowledge.js` 是一个检索桥：对话请求发出前，先把用户消息发给 **Dify 知识库检索 API**（`/v1/datasets/{id}/retrieve`，语义检索），命中段落以「知识库实时检索」块注入 system prompt（静态知识库 `agent-knowledge` 保留，叠加不替换）。

配置（`services/secrets.js`）：

```js
difyKnowledge: {
  baseUrl: 'https://api.dify.ai/v1',
  apiKey: 'dataset-xxxx',   // 「知识库」页生成的 dataset- Key（≠ 应用的 app- Key）
  datasetId: 'xxxx',
  topK: 3
}
```

特点：

- **与三种对话通道自由组合**：现有网关 / Dify 直连（接法 A）/ 桥接（接法 B），检索块都会注入（网关走 prompt、Dify 走 `inputs.knowledge` + `inputs.prompt`）。
- **失败零代价**：未配置、检索失败、5s 超时都静默降级为空块，绝不阻塞对话主链路；未配置时行为与原来完全一致。
- **技能体系不动**：@@DO@@ 端侧技能、兜底推荐卡、安全门全部照旧——这正是"两边各干擅长的事"。
- 每轮多一次检索请求（串行，约 0.3~1s），介意延迟可把知识库内容预热、或未来改并行。

## 接法 B：中间层桥接（生产推荐）

`server/dify-bridge.js` 是零依赖的 Node 服务（18+），对小程序暴露 OpenAI 兼容的 `POST /v1/chat/completions`，背后转发 Dify：

```bash
# 服务器上运行（或 pm2 / systemd 守护）
DIFY_API_KEY=app-xxx \
DIFY_BASE_URL=https://api.dify.ai/v1 \
AUTH_TOKEN=自定义访问令牌 \
PORT=8787 \
node server/dify-bridge.js
```

小程序侧只需改 `services/secrets.js`：

```js
modelGateway: {
  baseUrl: 'https://你的备案域名/v1/chat/completions',
  apiKey: 'AUTH_TOKEN 的值',   // 桥接层用它做访问令牌校验
  ...
}
```

**会话记忆**两种方式（桥接层自动适配）：

1. 请求带 `X-Session-Id` 头（已支持）：客户端 `gatewayHeaders()` 会自动携带当前会话 id（`agent-sessions.activeId()`），桥接层据此维护 Session → Dify `conversation_id` 映射，上下文由 Dify 服务端记忆；
2. 不带头（兜底）：每轮新开 Dify 会话，桥接层把近 10 轮历史折叠进输入衔接上下文。

**部署硬约束**（小程序后端通用要求）：

- 域名 HTTPS + ICP 备案，配置进小程序后台的 request 合法域名；
- 合法域名不支持指定端口，桥接服务要套 Nginx 反代到 443；
- 开发阶段可在开发者工具勾"不校验合法域名"先用 IP:端口跑通。

## 接法 A：小程序直连（调试用）

复制 `services/secrets.example.js` 里新增的 `dify` 块到 `services/secrets.js`（不要动 example）：

```js
dify: {
  baseUrl: 'https://api.dify.ai/v1',   // 自部署就填自己的域名
  apiKey: 'app-xxxxxxxx',              // 填入真实 key 即启用，留空则继续走网关
  promptVariable: 'prompt'
}
```

## 接法 A 发布前的两个硬约束

1. **合法域名**：小程序正式版要求 request 域名 HTTPS + ICP 备案。`api.dify.ai` 过不了备案校验（开发者工具勾"不校验合法域名"仅供调试）；自部署 Dify 挂自己备案的域名即可。
2. **Key 安全**：`secrets.js` 会被打包进小程序，App Key 有泄露风险。调试用可以，生产建议在 Dify 侧限流/限额，或改走自己的中间层。

## 代码改动清单

| 文件 | 改动 |
| --- | --- |
| `services/agent-client.js` | 新增 `difyEnabled / difyChat / difyInputs / resetDifyConversation`；`chat()` 入口按配置分流；收尾逻辑（入睡兜底卡、规则引擎回退）抽成 `createRunner` 供两模式共用 |
| `utils/llm-stream.js` | 新增 `parseDifyEvent`：解析 Dify SSE 事件（`message` / `agent_message` 增量、`conversation_id` 捕获、`error` 标记） |
| `services/secrets.example.js` | 新增 `dify` 配置模板 |
| `server/dify-bridge.js` | 新增接法 B 桥接服务：OpenAI 兼容 `/v1/chat/completions` → Dify `/v1/chat-messages`，流式/阻塞双向转换，Session → conversation_id 映射（TTL 2h），可选 AUTH_TOKEN 门禁，历史折叠兜底 |
| `tests/dify-adapter.test.js` | 新增 7 个用例：事件解析、流式完成、失败回退、blocking 降级、网关模式不受影响 |
| `tests/dify-bridge.test.js` | 新增 7 个用例：messages 拆解、历史折叠、流式转换 + 会话映射、blocking 转换、令牌校验、上游失败映射 502、X-Session-Id 携带 |
| `services/dify-knowledge.js` | 新增协作模式检索桥：Dify 知识库语义检索 → prompt 知识块，与静态知识库叠加，失败静默降级 |
| `tests/dify-knowledge.test.js` | 新增 6 个用例：配置判定、命中格式化、检索请求、失败降级、prompt 注入、未配置零请求 |

## 已知边界

- `agent-memory.js` 仍直连模型网关（未走 Dify），如需一并切换另行处理。
- 本地会话历史只用于展示与网关模式；Dify 模式下上下文靠 `conversation_id`，本地记录被清后 Dify 侧记忆仍在，如需"彻底重开"调用 `resetDifyConversation()`（会话为空时自动触发）。
- 验证码门禁（`X-Verification-Code`）只在网关模式生效，Dify 模式下以 user 标签携带验证码（`nightcat-<code>`）便于在 Dify 日志里区分。

