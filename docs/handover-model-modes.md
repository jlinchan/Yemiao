# 夜喵模型三档架构 · 交接速览（2026-10-19）

> 交接对象：夜喵 Agent 对话链路的后续维护者。读完这份 + `docs/dify-integration.md` 即可接手。

## 一、三档模式（设置页「对话模式」/ 对话页「+」面板可切）

| 模式 | 心理学概念 | 模型 | 通道 | 定位 |
|---|---|---|---|---|
| Reflex | 反射 | deepseek-v4-flash-780k-local | modelgateway.zju.edu.cn（大赛网关）| 极速（流式 ~40 字/s）|
| Reframe | 重构 | deepseek-v4-flash-0731 | token.zju.edu.cn（非流式+伪流式回放）| 默认均衡档，上限 200 字 |
| Reflect | 反思 | glm-5.3-flash | token.zju.edu.cn（真流式）| 深度专业，上限约 400 字 |

- 通道与密钥全部在 `services/secrets.js`（不入 git，**上传包必须保留**）。
- 模式存储值：`nightPreferences` 的 `chatMode`（'Reflex'/'Reframe'/'Reflect' 纯英文）；`normalizeChatMode` 兼容历史值。
- **安全轮（elevated/critical）自动强制 deep**，不受用户档位影响。

## 二、两阶段流水线（仅 Reframe/Reflect；Reflex 保持单轮）

```
用户消息 → Stage A 意图分析（780k 流式短请求，15s 超时，出 JSON 计划）
        → Stage B 按计划瘦身 prompt 回答（reframe=非流式+伪流式回放 / deep=真流式）
```

- Stage A prompt：`buildAnalysisPrompt`；计划 sanitize：`parsePlan`（`{need,use,rec,sound,minutes}` 白名单）。
- Stage B 瘦身：`buildSystemPrompt` 第 9 参 `plan`——选材/推荐决策由计划接管（砍掉知识库规则长段与推荐机制 7 条），**Reflect 保留「专业产出要求」段**（4-8 句思考、点名条目与机制、适用边界、概念配人话）。
- 计划注入：`buildPlanDirective`（计划 + 选中材料全文）；检索块整段注入只在无 plan 时。
- **降级链**：Stage A 失败/超时/解析失败 → plan=null → Stage B 用完整 prompt（单阶段老路，零劣化）。

## 三、关键链路与传输方式（踩过的坑都在这）

1. **token.zju.edu.cn 流式被限速 ~9 字/s**（366 字爬 42s），**非流式聚合正常**——所以 Reframe 走非流式（4.8s 全文）+ `replayNonStreaming` 伪流式回放（40 帧/1.2s）。**大赛网关相反**：流式 ~40 字/s 快，**非流式会挂起**——780k 一切请求必须流式。
2. **glm 的 reasoning_content 会吃满输出预算**（deep 长回复 reasoning 实测 6k 字）→ `channels.deep.maxTokens: 20000`；请求超时 `REQUEST_TIMEOUT_MS=90s` 按最慢通道实测耗时定。
3. **glm 流式的 `delta.reasoning_content` 先于正文流出** → `parseReasoningDelta` 流式进思考面板；`mergeThinking` 统一合并：planSummary（执行计划摘要）→ reasoning → @@协议@@思考，流式/partial/兜底全路径不丢。
4. 空内容防御：非流式 content trim 后为空视同失败 → 规则兜底（`guide.next`），**用户永远不会看到空气泡或无限三个点**。
5. 等待期进度反馈：`startProgress(agentId, mode)` 阶段性文案（「正在组织回答…」→「想得深一点…」→「快好了…」），首个增量到达即清。

## 四、Markdown 轻排版

- `utils/markdown-lite.js`（零依赖 ~4KB）：分段/`**加粗**`/`####` 小标题/有序无序列表/`>` 引用 → rich-text nodes + **内联夜间主题样式**（rich-text 内部不继承页面 wxss，必须内联）。
- 安全：先 HTML 实体转义再只生成白名单标签；`<script>` 以实体显示，无注入面。
- 接入：`flushAgentText` 里 `textNodes = markdownLite.toNodes(text)`，流式每帧全量重转（<1ms）；未闭合 `**` 按原文显示（流式自然容错）；user 消息与旧存档回退纯文本。
- prompt 侧排版指令：方法步骤 2-4 条短列表/关键词加粗/原句 > 引用/10 字内小标题；「日常一两句的回应不要排版」。

## 五、知识援引卡

- **分析器把关（2026-10-19）**：Stage A 的 use 为空 = 检索材料与本轮不贴 → 知识援引卡不展示（launch 里 knowledgeHits 置 null）——语义级过滤「迷参考」，比分数阈值更准。技能调用不受影响（协议仍在 Stage B 自主判断，buildPlanDirective 尾部有明确说明）。

- 数据：`result.knowledge`（dify 检索命中，agent-client 挂到完成结果）；**双保险**：plan 模式需 Stage A 选中（planSummary 存在）**且** Stage B 正文后输出 `@@KB@@` 自证引用（kbCited），二者都同意才挂卡；降级模式（无 plan）维持有命中即挂。UI：`kb-card`（气泡下方，默认收起，点按展开来源+摘要，序号徽章+逐条淡入）。
- 阈值：`difyKnowledge.scoreThreshold: 0.45`；检索超时 3s。

## 六、常见坑速查

| 坑 | 结论 |
|---|---|
| token 网关 780k 404 | 780k 只在大赛网关（modelgateway），token 网关已下线 |
| 大赛网关非流式挂起 | 780k 一切请求用流式 |
| 测试构造 SSE 报文 | content 内层 JSON 引号必须 `JSON.stringify` 编码，手写转义错一层 → parse 静默失败、plan=null |
| 流式 mock 测试 | 必须手动调 `opts.success` 收尾，否则 done 永远 undefined |
| 改对话模式默认值 | 连锁影响所有「默认走流式」假设的测试（agent-ui harness 已预置 chatMode='Reflex' 基线） |
| 改长度文案 | 同步 agent-voice 的场景长度策略断言 |
| 主包超 2MB | 跑 `tools/pack-budget.js`；大头优化：books background 管线截断（已做，-10KB）、生成卡 minify（已做） |

## 七、测试

全量：`node --test tests/*.test.js`（**逐文件跑**，本机路径含括号目录模式会炸）。当前 0 失败。
关键文件：`tests/agent-client.test.js`（协议/通道/plan）、`tests/agent-ui.test.js`（页面级流式/流水线）、`tests/markdown-lite.test.js`。
