# 夜喵 Agent 深度构建：记忆档案 + 技能系统

日期：2026-10-12
状态：待确认

## 目标

把夜喵从「会聊天的陪伴」升级为「能做事的陪伴」：记忆有档案、行动有技能。
对比赛的意义：一个跑在微信小程序里的、带持久记忆和工具调用闭环的轻量 Agent。

## 现状与可复用资产

| 资产 | 位置 | 现状 |
| --- | --- | --- |
| 对话客户端 | services/agent-client.js | 流式 + @@REC@@ 推荐 + 规则兜底 |
| 跨会话记忆 | services/agent-memory.js | 摘要存 storage，注入 prompt 和开场白 |
| 上下文注入 | utils/agent-context.js | 练习/睡眠/日记/记忆四类摘要 |
| 全局音频 | app.js | playSound/pauseSound/setSoundVolume，rain/breeze/lake/white 四声 |
| 感恩日记 | storage.KEYS.journal | `{id, createdAt, date, items[]}`，存 30 条 |
| 睡眠记录 | storage.KEYS.sleep | `{nightDate, bedTime, wakeTime, feeling(1-5), duration}`，按夜 upsert |
| 推荐卡片 | pages/agent | 点击跳转 sound 页 |

## 设计

### 一、标记协议：从 @REC 到 @DO

现有 `@@REC@@{json}` 只驱动推荐卡片。扩展统一标记协议：

```
@@REC@@{"sound":"rain","minutes":30,...}        # 保留：推荐卡片（用户确认后跳转）
@@DO@@{"skill":"play_sound","args":{...}}        # 新增：直接执行技能
```

`@@DO@@` 解析规则与 @@REC@@ 相同：流式期间隐藏标记及之后内容，JSON 闭合后触发执行。

### 二、技能框架

```
skills/registry.js      # 注册表 + system prompt 技能段生成 + 标记分发
skills/play-sound.js    # 播放/停止环境声（app.playSound/pauseSound）
skills/journal.js       # 把用户口述的感恩内容写入日记
skills/sleep-log.js     # 把口述的上床/起床时间写入睡眠记录
skills/breath.js        # 跳转呼吸练习页（可带节奏参数）
skills/query-records.js # 查询记录并返回结果给模型（needsResult 型）
```

技能模块契约：

```js
module.exports = {
  name: 'journal',
  description: '记录用户口述的感恩内容',
  prompt: '用户表达了感恩或想记点什么时调用。args: { items: string[] }',
  needsResult: false,          // true 时执行结果回传模型补一轮生成
  execute(args) {
    // 返回 { ok: boolean, message: string }，message 用于气泡内反馈
  }
};
```

agent-client 改造：

1. system prompt 末尾注入 registry 生成的技能清单段
2. `splitRecommendation` 扩展为同时解析 `@@DO@@`（保持向后兼容）
3. 检测到完整 @@DO@@ → 执行技能 → 页面显示技能反馈气泡（`已为你播放雨声 · 30 分钟`）
4. `needsResult` 技能：结果以 `role: user`（tool 结果伪装）回传，再发一轮补全，深度限制 1 层防循环

### 三、memory.md 记忆档案

两层记忆：

- 结构化记忆（已有）：摘要数组，机器消费
- **memory.md**：人类可读档案，写入 `wx.env.USER_DATA_PATH/memory.md`，由 agent-context 的全部摘要 + 记忆时间线渲染生成

页面：`pages/night-settings` 增加「夜喵的记忆」入口 → 新增查看页（只读渲染 + 一键清除）。价值：透明可控（用户能看到 AI 记了什么、能删），也是答辩演示点。

同步策略：每次 closeChat 摘要完成后、以及记录变化时重写 md（低成本全量重写，文件很小）。

### 四、顺手修复

- buildSleepLine 中 feeling 是 1-5 数字，直接拼进 prompt 不友好 → 映射为文字（1 很差 … 5 很好）

## 分期

- **M1（本次执行）**：标记协议扩展 + 技能框架 + play_sound + journal + memory.md 档案与查看页
- **M2（下次）**：sleep-log + breath + query-records（needsResult 回传闭环）
- **M3（待定）**：语音输入（视网关 ASR）、OCR（视场景）

## 测试计划

- registry：分发、未知技能、参数清洗、prompt 生成
- play-sound/journal：mock getApp/storage 验证写入契约
- agent-client：@@DO@@ 流式隐藏、闭合触发、与 @@REC@@ 共存
- 记忆档案：渲染、清除联动
- 全量回归 node --test

## 风险

- 模型输出 @@DO@@ 格式错误的概率：解析失败静默忽略（不执行也不报错），prompt 中给格式示例降低概率
- 双标记并存（REC + DO）：prompt 里明确互斥规则——DO 直接执行、REC 是卡片，模型只选其一
- 写入类技能误触发：journal 仅在用户明确表达"记下来/感恩"意图时调用，prompt 约束 + 无确认直接写（用户亲口说的内容，风险低）
