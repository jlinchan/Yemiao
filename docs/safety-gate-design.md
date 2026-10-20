# 夜喵危机安全介入：设计与维护手册（2026-10-16）

> 实装文件：`utils/safety-gate.js`（判定与文案）、`services/agent-client.js`（@@SAFE@@ 协议与
> system prompt）、`pages/agent/index.js`（面板落卡接线）、`pages/agent/index.wxml` / `index.wxss`（求助卡 UI）。
> 设计来源：`.workbuddy/reports/夜喵Agent方向调研-2026-10-16.html` 方案 A；
> 「高压 vs 高危」判别与硬触发思路借鉴 infometa 风险识别与转介 skill（机制借鉴，词表自建）。

## 1. 为什么必须是产品层介入

自伤风险的防线不能只依赖模型自觉：模型可能顺着倾诉接话、可能在 600 token 截断中丢掉安全建议、
也可能把危险细节复述出来。初版采用「命中即绕过大模型、直接走安全模板」的硬门（竞品共识做法）；
2026-10-16 晚按产品决策调整为**「模型主导 + 确定性兜底」**：罐头回复不智能、丢掉了模型的共情能力，
改为端内词表扫描负责「检测 + 注入强指令 + 漏标兜底」，模型负责「识别 + 自然接住 + 以 @@SAFE@@
标记调起求助面板」。

## 2. 三级判定

| 级别 | 含义 | 动作 |
| --- | --- | --- |
| `critical` | 死亡意愿 / 自伤方法 / 死亡联结自贬 / 涉他危险 | 不绕过大模型：`criticalDirective()` 注入本轮 context，要求模型自然接住并以 @@SAFE@@ 收尾；模型漏标时端内兜底落卡 |
| `elevated` | 高压情绪但无行动指向（崩溃、撑不住、想消失…） | 不打断对话；向 system prompt 注入 `elevatedNote()` 安全提示段 |
| `normal` | 其余 | 正常对话 |

判别原则（参考 infemta skill 的「高压 vs 高危」）：**看话里有没有伤害自己/他人的具体指向**。
「我快崩溃了」是情绪表达，走 elevated；「不想活了」「想割腕」是行动信号，触发 critical 介入。

## 3. 词表与匹配

- `CRITICAL_TERMS`（约 50 词）分四组：死亡意愿直接表达、死亡联结自贬、自伤方法与计划、涉他危险。
- `ELEVATED_TERMS`（约 22 词）：高压情绪，无行动指向。刻意排除「难受」「哭」等高频词，避免提示段稀释。
- 匹配两遍：第一遍在原文（小写）上 `indexOf`（cutIndex 保留给未来可能的窄口径流式拦截）；
  未命中再在**去分隔符归一化文本**上扫一遍（防御「不 想 活」「自——杀」「想*死*」），
  归一化命中只判级（cutIndex = -1）。
- 第三遍拼音/缩写层（`PINYIN_TERMS`，2026-10-16 用户实测「zisha」漏检后补）：全拼（≥4 字符）
  任意位置命中（zisha / wobuxianghuole / bu xiang huo）；声母缩写与中英混写（zs / xs / bxh /
  tl / gw / zc / 自s / s了 / 4了）要求字母边界（命中前后非 a-z），settle 不会撞 tl。elevated 只收
  全拼（bengkui / juewang / chengbuzhu / xiangxiaoshi），缩写太泛不收。
- 原则：**宁滥勿缺**。已知误报源（如「不想 活动被取消」跨词拼接、紫砂=zisha、英文 shale=杀了）
  由柔和的安全文案兜底代价。

## 4. 接线点（pages/agent/index.js + services/agent-client.js）

**架构（2026-10-16 晚调整）：模型主导 + 确定性兜底，不再绕过大模型。**

1. 常驻 system prompt：`safetyGate.buildCrisisPromptSection()` 进入 `buildSystemPrompt`——教会模型
   识别高危信号（含 zisha/zs/自s 等拼音避讳写法）、自然共情、不给方法细节，回复末尾单独一行输出
   `@@SAFE@@`（不带 JSON）；平常对话禁止输出。
2. `sendMessage` 入口：`scan(message)` 仅定级——critical 时把 `criticalDirective()` 强指令拼进本轮
   context（自然接住 + 必须以 @@SAFE@@ 收尾），elevated 拼 `elevatedNote()`；`safetyLevel` 存入
   `lastTurn`，重试/重新生成保持注入。critical 不再越过验证码门禁；唯一例外：AI 未解锁（模型不可用）
   时走 `deliverSafetyTurn` 确定性兜底直接落卡，不让高危求助被门禁挡住。
3. `@@SAFE@@` 协议：`splitResponse` 剥离标记并返回 `safe` 标志（与四类卡片标记正交；流式期间
   `onDelta(splitResponse(full).text)` 同样不外泄）。页面 `onComplete` 在
   `result.safe || turn.safetyLevel === 'critical'` 时追加 `role: 'safety'` 求助卡（横幅舟 + 可复制
   热线 + 地区目录）并轻震动——模型漏标时端内兜底落卡（宁滥勿缺）。
4. 旧 `guardStreamSafety` 流式截断已下线：共情回应需要复述用户的词，字面截断会打断对话；若实测发现
   模型输出危险方法细节，再评估恢复窄口径拦截。

## 5. 求助信息（真实渠道，2026-10 用户提供，发布前需再次核对）

来源：浙江大学心理中心官方页面（xlzx.zju.edu.cn/main.htm）。

| 渠道 | 号码/入口 | 说明 |
| --- | --- | --- |
| 心理中心值班电话（strong） | 88982525 | 危机个案，值班时间直接拨打 |
| 24 小时心理援助热线 | 12356 | 全国通用 · 免费 · 夜间兜底 |
| 紧急救援 | 120 / 110 | 此刻处在危险里直接拨打 |
| 院系辅导员 | 其他时间 | 心理中心非值班时间的校内求助 |

值班时间（卡内展示两行）：
- 周一至周五 8:00-12:00，13:30-17:30，18:00-21:00
- 周六、周日 8:30-11:30，13:30-16:30

其他求助方式：http://www.xlzx.zju.edu.cn/qtqzfs/list.htm（卡内「复制网址」可取完整 URL）。

### 5.2 地区热线目录（按省份）

`utils/safety-hotlines.js` 收录 32 组地区清单（浙江默认 + 全国 + 30 个省区市，约 60 条热线），
求助卡内「按地区查看更多热线」展开：picker 切换省份 → 显示当地热线（名称/时段/号码）→ 逐条复制。
号码的 `copy` 字段统一为可拨号形态（纯数字 + 连字符，`0471-12320 转 5` 这类分机写进说明行）。

**关于「按 IP 定位」**：纯端内小程序没有可用的 IP 归属地服务（无服务端、wx 无此 API）。
当前方案 = 默认浙江（校园语境）+ 手动切换省份 + `night-preferences.safetyRegion` 本地记忆；
接入服务端后可在会话建立时按 IP 归属下发默认省份（用户仍可改）。
数据为用户提供的静态清单（2026-10），发布前需抽查核对；号码变动只需改 `safety-hotlines.js`
单文件，测试 `tests/safety-hotlines.test.js` 会做结构与关键号码断言。
北京同志中心跨性别热线已收录（仅电话与时段），其第三方表单链接未收录（小程序无法打开外链）。

### 5.1 顶部横幅插画（已接线，2026-10-16）

横幅图 `assets/agent/safety-banner.jpg`（880×399，约 62KB，JPEG q74 progressive）：
由用户 ChatGPT 生成的夜湖灯舟原图（941×1672 PNG，2.3MB）经 Pillow 裁切中部 2.2:1 横带
（灯舟、灯光倒影与芦苇萤光）并压缩而来。`buildHelpCard().banner` 已指向该路径，
WXML `wx:if` + `aspectFill`（容器 180rpx 高）适配；字段留空仍可退回无图版，换图只需替换文件。
生成提示词存档：深蓝夜湖、一盏暖金灯的小舟、水面光路、芦苇萤光、绘本质感、无文字。

## 6. 测试与回归

- `tests/safety-gate.test.js`（11 项）：高危直击、分隔变体、归一化命中不截断、elevated/normal 边界、
  cutIndex 一致性、安全回复与求助卡内容（含 banner 路径断言）、拼音/缩写/混写变体与字母边界、
  elevated 提示段内容、空输入容错。
- `tests/safety-hotlines.test.js`（5 项）：结构、默认浙江组、全国组、省份覆盖、可拨号格式。
- `tests/agent-ui.test.js`（危机相关 7 项）：critical 模型主导 + 漏标端内兜底落卡（断言模型原话保留、
  卡片含 banner）、模型 @@SAFE@@ 调起面板且标记不外泄、拼音避讳（zisha）模型路径触发求助卡含舟横幅、
  求助卡逐渠道复制（断言成功 toast）、复制失败弹窗兜底、elevated 保持模型路径且重试保持注入、
  地区列表默认浙江/切换/持久化。
- `tests/agent-client.test.js`：@@SAFE@@ 剥离与 `safe` 标志、与 @@REC@@ 等卡片标记正交。
- 计划补充：从 chatopera/efaqa-corpus-zh 的 S3（SOS）样例摘取 10–15 条做本地回归语料
  （**仅测试用**——春松许可证限研究用途，不随包分发、不商用）；日常对话 50 条做误报率统计，目标 <5%。

## 7. 升级路径（按优先级）

1. 词表人工评审 + 真机回归（上线前必做）。
2. efaqa S3 语料回归 + 误报率基线。
3. 数字谐音（17了、要4走了 等）与象形变体补充匹配；拼音全拼/缩写/混写已覆盖（见 §2 拼音层）。
4. 高危会话本地标记（`highRisk`），在 night-memory 档案里温和提示「那天夜喵给过你求助信息」。
5. 若赛后迁移服务端：扫描与兜底落卡仍保留在端内（离线可用），服务端只做二次审计与数据加密留存。

## 8. 边界声明

夜喵是日常放松与睡前陪伴工具，不是医疗或心理治疗产品；求助面板是兜底不是干预；
所有求助信息指向真人渠道。@@SAFE@@ 面板出现之后，对话仍由模型以陪伴语气继续，
不追问危险细节、不复述危险方法（常驻危机协议 + elevatedNote/criticalDirective 已注入约束）。
