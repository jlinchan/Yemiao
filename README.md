# 呼吸空间（SleepWell）微信小程序

一个打开即可互动的轻量放松小程序，现包含“夜喵”AI Agent 入口、呼吸练习和睡眠/感恩记录。用户第一次按住屏幕启动后，可完成 4 秒吸气、7 秒屏气和 8 秒呼气循环。

## 2026-10-19 最新完整版

当前仓库已补齐完整可导入版本，不再只是局部模块。包含 `app.js`、`app.json`、`app.wxss`、全部页面、组件、服务、知识文档、测试工具、图片与音频资源。

本次重点更新：

- 陪伴者首页顺序：睡眠陪伴师 → 欧文·亚隆 → 共情陪伴师。
- 欧文·亚隆使用用户提供的头像，首页只显示“跨时空对话”，完整列表显示“跨时空对话、深度共情”。
- 睡眠陪伴师首页只显示“睡眠引导”，完整列表保留全部标签。
- 对话页名称、发送者、开场语和输入提示按当前 `counselorId` 动态显示。
- 书中技能新增统一书籍目录、六本书各三项精选技能、动态书籍介绍页和技能知识上下文。
- 首页与完整列表中《失眠的认知行为治疗》固定第一。
- 书籍介绍页底部“开始对话”直接进入聊天，保留全站书籍列表。
- 全量测试 395 项：389 通过、0 失败、6 个既有安全词表 TODO。
- 主包约 1985KB，低于 2048KB 限制。

快速开始：

1. 克隆仓库。
2. 在微信开发者工具中导入仓库根目录。
3. 使用 `project.config.json` 中的 AppID，或改为自己的 AppID/测试号。
4. 编译后从首页进入陪伴者或书中技能板块。

本版本不包含 `services/secrets.js`、`project.private.config.json` 等本机私有文件；模型网关配置请参考 `services/secrets.example.js`。

## 2026-10-17 修复：三个话题页整体下移，避让顶部导航

「考试焦虑」「睡前胡思乱想」「宿舍难放松」共用 `pages/topic/index`。旧版正文使用绝对定位并从 `top: 0` 开始，导致标题、介绍与状态栏、微信胶囊导航重叠。本次把页面改成纵向布局：顶部导航单独占位，正文滚动区域接在导航下方，标题上方另留 40rpx 间距。

- 三个话题的标题、介绍、步骤和操作按钮整体下移，按设备实际导航栏高度排布。
- 正文占用剩余屏幕高度，小屏可滚动查看底部说明；底部预留安全区域。
- 返回按钮避开状态栏，两个操作按钮居中，步骤文字在窄屏自动换行。

查看方式：使用当前文件夹在微信开发者工具中重新编译，从首页底部的三个话题入口分别进入页面。确认标题完整显示在「今晚的话题」导航下方；小屏向下滚动应能看到两个操作按钮和说明，返回按钮始终保留在顶部。若通过 GitHub 更新，需使用包含本节和 `topic-scroll` 布局的版本；PR 尚未合并时，仅重新下载目标分支不会包含修复。

修改文件：`pages/topic/index.wxml`、`pages/topic/index.wxss`。`tools/nightcat-preview.js` 增加话题页预览路由，`tools/verify-topic.js` 提供自动复查。

验证：320×568、375×812、390×844、430×932 四种尺寸与不同状态栏高度，三个话题共 12 组浏览器检查全部通过，覆盖顶部间距、横向溢出、滚动到底部、返回按钮和呼吸页/对话页跳转。微信开发者工具的命令行服务端口当前关闭，因此未完成微信模拟器自动验证，需按上面的步骤在工具中确认。

复查命令（需要 Playwright 和 Microsoft Edge；依赖已安装在项目可解析的位置时无需设置环境变量）：

```powershell
$env:NIGHTCAT_NODE_MODULES='C:\Users\xinxin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/verify-topic.js
```

命令会自动启动临时预览服务，检查完成后关闭服务，并生成浏览器效果图：[考试焦虑](docs/design/topic-layout/exam-390.png)、[睡前胡思乱想](docs/design/topic-layout/thoughts-390.png)、[宿舍难放松](docs/design/topic-layout/dorm-390.png)。

## 2026-10-17 修正：首页书籍按钮文案

首页「书中技能」下三本书的按钮统一显示「开始对话」，无障碍标签同步使用「开始对话：书名」。目标分支已包含这一文案，原本地下载副本中的「开始练习」也已修正。

点击按钮继续进入对应书籍的对话。本次 PR 补充使用说明，现有页面代码无需重复修改。

查看方式：更新到 `codex/current-sleepwell` 的最新代码，在微信开发者工具中打开项目并重新编译。进入首页，确认三本书的按钮均显示「开始对话」；分别点击按钮，确认进入相应书籍的对话。若仍显示旧文案，请确认开发者工具导入的是更新后的项目目录，再清除编译缓存并重新编译。

代码位置：`pages/home/index.wxml`。验证：`node --test tests/book-skills.test.js`，6 项全部通过，覆盖三个首页书籍入口与全部技能列表的对话路由一致性；已另行核对首页按钮文字和无障碍标签。

## 已实现

### 月光涟漪动画

在微信开发者工具中导入项目根目录（包含 `app.json`、`project.config.json`），
使用自己的 AppID 或工具允许的测试模式，编译后进入呼吸页，点击底部
「呼吸世界」，选择「月光涟漪」。已有设置中的 `mist` 场景会沿用此入口。

月光湖面使用本地 8 张图片连续交叉过渡，每张过渡 800 毫秒，6.4 秒循环。
动画独立于呼吸倒计时；原有吸气、屏息、呼气交互保持不变。
素材位于 `assets/moonlit/lake-0.jpg` 至 `lake-7.jpg`，无需额外 npm 依赖。

背景铺满页面并保持比例，屏幕比例不同时可能裁去部分边缘。
顶部操作、呼吸提示和底部导航叠加在背景之上；导航使用原有半透明渐暗背景，
按钮后方仍能看见湖面。场景采用普通图片层，不使用月光 Canvas 覆盖页面，
避免遮挡「身体、呼吸世界、记录」及场景选择弹窗。

页面隐藏或组件卸载时停止播放定时器，返回页面恢复播放。
若仍显示旧雾气，请确认导入的是本次分支目录，并重新编译。

开发检查：`node --test tests/*.test.js`。
月光专项测试覆盖循环首尾过渡、隐藏/恢复、卸载清理和尺寸变化后的播放。
微信开发者工具与真机上的视觉、点击、性能和资源包大小仍需验收。

- 第一次按住启动，后续自动循环并记录完整呼气轮次
- 默认 6 轮、1-3 分钟弹性睡前流程；每轮为 4 秒吸气、7 秒停留、8 秒呼气
- 完成后直接选择身体扫描或安静结束（上游最新版已移除自评评分）
- 8 个呼吸世界：蒲公英、月光涟漪、薰衣草花海、云、星空海、萤火虫、鲸鱼、呼吸光团
- 长按底部「呼吸世界」快速切换，切换时实时预览
- 呼吸设置：节奏、次数、声音、触觉反馈、结束提示音
- 3 轮呼吸后的身体觉察引导，可随时跳过
- 直接点击人体位置进入身体呼吸，不显示器官名称
- 身体呼吸与首页共用自动 4-7-8 节奏和停止操作
- 本地环境声音：雨声、微风、湖水、白噪音；循环播放和音量调节
- 身体扫描使用中性透明人体剪影，支持人体热点和底部横向部位选择
- 环境声音支持 15/30/60 分钟定时，并在结束前渐弱
- 感恩日记：每条最多 120 字，编辑页最多 3 条，本地保存
- 睡眠记录：上床/起床时间、睡眠感受、自动计算时长
- 一键关灯引导：通过 `FocusModeService` 提供系统设置 Guide 模式
- 呼吸、日记、睡眠和设置数据均使用微信本地存储
- 夜喵首页提供场景对话、个性化声音推荐和夜喵/呼吸/记录底部导航
- 危机安全介入：模型识别高危表达（含 zisha 等拼音避讳写法）后自然接住，并以 @@SAFE@@ 标记调起求助卡面板（浙大心理中心 88982525、24 小时热线 12356，号码可一键复制）；端内词表扫描负责注入强指令并在模型漏标时兜底落卡；高压情绪对话自动注入安全提示
- AI 对话背景：夜喵对话页铺用户生成的夜湖背景图（`assets/agent/chat-bg.jpg`，750×1332 约 97KB，原图 2MB PNG 压缩 -95%），上叠深色渐变遮罩保住夜色主题与浅色文字可读；顶栏/消息流/输入条/快捷面板 z-index 抬升盖在背景上
- 记录页提供月历、上床时间分类、周统计和感恩日记；设置页可分别清除个人记录或恢复默认偏好

## 2026-10-17 更新：夜喵语音（WechatSI）+ 安全门语料回归 + CI 门禁

### 动机

夜喵 Agent 方向调研的三大短板之一是「语音空白」（方案 E）。本轮接入微信官方「同声传译」插件（WechatSI）补齐 TTS 朗读与按住说话输入；同时按调研计划，把危机安全门从「拍脑袋词表」升级为「语料回归守护」——用 SOS-1K（中文社交媒体自杀风险数据集）本地校准词表召回与误报轮廓，并把脱敏自建回归语料固化成测试。顺带落地 GitHub 侧工程化：CI 测试门禁 + gitleaks 密钥扫描（组件选型依据见 `.workbuddy/reports/GitHub组件嵌入推荐-2026-10-17.html`）。

### 改动说明

**语音（services/voice-service.js，新增）**

- 封装 WechatSI 插件：`speak()` 朗读（`textToSpeech` 换音频 URL → `innerAudioContext` 顺序播放，长回复按句读分块 `chunkText`）、`createRecognizer()` 按住说话（`getRecordRecognitionManager`，增量 `onPartial` 回填输入框、松手 `onFinal` 定稿，由用户确认后手动发送）。
- `stripForSpeech()` 朗读前清洗：剥离 `@@SAFE@@/@@REC@@/@@PUSH@@` 等协议标记、markdown 符号与 URL，只念人话。
- 全链路软降级：插件未在 app.json 声明 / 未在 mp 后台添加时 `isAvailable()` 返回 false，页面隐藏语音入口，其余功能零影响。**因此本次没有改动 app.json**——插件配置必须在后台添加插件之后才能写入，否则小程序无法运行。
- 页面接线（pages/agent）：顶栏新增朗读开关（金色高亮 = 开启，持久化在 `night-preferences.ttsEnabled`，默认关）；输入行新增麦克风（按住说话）。回复完成（含安全轮的求助回复）自动朗读；发送新消息、停止生成、切后台、离开页面都会立刻停读。录音权限拒绝时弹窗引导去设置页。
- 图标（utils/agent-icons.js）：mic / micActive / speakerOn / speakerOff / speakerActive，延续内联 SVG data-URI 风格，零包体文件成本。

**安全门语料回归（tests/safety-gate-corpus.test.js + tests/fixtures/safety-corpus.json，新增）**

- 脱敏自建回归语料 115 条：critical 65（直接表达/方法计划/紧迫度/自贬/涉他/拼音/混写/分隔变体/相约轻生）+ elevated 20 + normal 30。类别框架参照 SOS-1K 细粒度标注与 PsyCrisis-Bench 三分类的设计维度，条目全部自写改述，不含数据集原文。
- 断言原则与「宁滥勿缺」一致：critical 零漏报、elevated 不回落 normal、normal 零误报；6 个已知且接受的误报（紫砂 zisha、英文 shale、影视名「杀死」、跳楼机、考完试「解脱了」、「不 想 活动被取消」）用 todo 用例固化，防止词表收窄时无人在场。
- 词表扩充（utils/safety-gate.js）：绝望与无意义感（没盼头/活着没意思）、遗书与临终安排（遗书/告别信/不会再醒/永远睡/睡个很长/长眠/最后一晚）、备药（囤了好多药 等）、**相约轻生**（约死/一起死/死一死/约炭/割一刀）；拼音层补 gaobiexin（放弃 yishu=遗书，与「艺术」同形会误伤正常兴趣话题）。

**校准工具（tools/safety-corpus-calibrate.js，新增）**

- `node tools/safety-corpus-calibrate.js` 对 SOS-1K 留出测试集（251 条）量化词表门：高危召回、低危命中轮廓、细粒度 0-10 级分布。数据集仓库无 LICENSE，原始语料仅本地克隆（.workbuddy/tmp/，gitignore 已覆盖），只读、不进仓库、不进上传包；README 只记录数字。
- 校准结论：补词表前高危召回 66.4%（79/119），补后 **74.8%（89/119）**；最大缺口是树洞语境的「相约轻生」句式（约死/一起死/约炭，占漏报近半），已补齐。剩余漏报多为脱离线程无法判读的上下文依赖句（「有一起的吗」「要一起吗」），词表层已到合理上限。
- 低危标注命中 67.2%（88/131）——人工抽查其中大多数实为高危表达（「我也想去死一死」「我活着很多余」），说明 SOS-1K 二分类的「低危」与我们陪伴场景的「必须接住」口径不同；宁滥勿缺原则下该轮廓可接受，误报代价是柔和的求助卡而非打断。

**存储键位补漏（services/storage.js + services/night-preferences.js）**

- `storage.KEYS.nightPreferences` 注册（此前 `sleepwell.night.preferences.v1` 未注册，「清除数据」清不掉它，README 已知问题）。
- `nightPreferences.clearPersonalData()`：清个人数据字段（concerns/memoryEnabled/safetyRegion），保留人格、音色、就寝时间等纯偏好；接入 `clearPersonalRecords()`（函数内 require，规避 storage ↔ night-preferences 加载环）。

**CI 门禁（.github/workflows/ci.yml，新增）**

- push / PR 自动跑：`node --check` 全部 js（secrets.js 已 gitignore 不在列表）→ `node --test tests/*.test.js` → `node tools/pack-budget.js`（超 2MB 直接红）；另起 gitleaks job 扫描密钥泄露。零 npm 依赖，与项目「无 package.json」约定一致。
- `project.config.json` packOptions.ignore 补 `.github` 目录（workflow 文件不进上传包）。

### 语音插件接入步骤（演示/上线前）

1. 登录 mp.weixin.qq.com →「设置 → 第三方服务 → 添加插件」→ 搜索「微信同声传译」并添加（需确认本 AppID 主体可用，以后台为准）。
2. app.json 增加配置块：
   ```json
   "plugins": { "WechatSI": { "version": "0.3.3", "provider": "wx069ba97219f66d99" } }
   ```
3. 开发者工具重新编译 → 对话页顶栏出现朗读开关、输入行出现麦克风；真机验证录音授权与 TTS 播放。

### 验证状态

- `node --test tests/*.test.js` 全量 **378 项：372 通过、0 失败、6 todo**。新增测试全绿（语料回归 11 项含 6 todo、语音服务 7 项）；6 个 todo 是安全门已接受的词表误报固化用例。编辑中途曾观察到 `world-integration.test.js` 短暂失败（页面接线分步落盘的暂态），全部改动完成后单独复跑与全量均通过。
- SOS-1K 校准：高危召回 74.8%（89/119）、低危命中 67.2%（88/131，宁滥勿缺口径下接受）；细粒度 0-10 级分布见 `node tools/safety-corpus-calibrate.js` 输出。
- `node --check`：voice-service / storage / night-preferences / agent-icons / pages/agent/index.js 全部通过。
- `node tools/pack-budget.js`：主包 1998.1KB、breathe-worlds 1211.4KB 均在限内。本轮新增文件全部位于 packOptions.ignore 目录（tests/、tools/、.github/、.workbuddy/），**上传包体积零变化**；注意工作区未提交的首页重塑资源已把主包余量压到 49.9KB，下次提交前建议再过一轮压图。
- 尚需真机验证：TTS 播放音质与打断体验、录音授权流程、朗读开关的金色高亮在深色主题下的可读性。

## 2026-10-17 更新：夜喵对话免验证码（关闭访问码门禁）

### 动机

验证码门禁的正确值配置在 `services/secrets.js` 的 `modelGateway.verificationCode`，而该文件被 `.gitignore` 排除、不随仓库分发。队友或评委拿到代码后没有 `secrets.js`，`services/access-code.js` 回退读取 `secrets.example.js` 的占位符，导致输入任何验证码（包括 123456）都报「验证码不正确」。大赛演示场景不需要这层门禁，本次直接关闭。

### 改动说明

- `services/secrets.js`：`verificationCode` 由 `'123456'` 改为 `''`（留空 = 不设限）
- `services/access-code.js`：未改动——`required()` 返回空时 `isValid()` 直接放行，`save()` 不再写本地存储
- `pages/agent/index.js`：未改动——`aiLocked: !accessCode.isUnlocked()` 在空码下初始为 `false`，验证码输入卡片（`wx:if="{{aiLocked}}"`）不再渲染
- `services/agent-client.js`：未改动——`gatewayHeaders()` 的 `if (code)` 守卫保证空码时请求不带 `X-Verification-Code` 头
- `tests/agent-access-code.test.js`：原测试强假设「必须配置了验证码」（`assert.ok(need)`），空码模式下必挂；改为空码/有码双态分支，两种配置下断言都成立（队友无 `secrets.js` 回退占位符时走有码分支）
- `tools/verify-nightcat.js`：Playwright 门禁流程条件化，空码模式下断言 `.chat-gate` 不渲染且 `aiLocked === false`，不再等待输入框导致超时

### 验证状态

- `node --test` 全量 341 个用例：341 通过、0 失败
- 本次改造后复跑时发现首轮记录的两个存量失败已被外部修复（非本次改动所致）：
  - `agent-client.test.js`「模型漏标时端内补一张推荐卡」：`agent-client.js` 的 `buildFallbackRecommendation` 兜底补卡逻辑在位（首轮跑测时该文件处于中间状态）
  - `experts.test.js`「expert section carries dosage and questioning discipline」：断言文案已对齐 `experts/registry.js` 实际文本（「不要求用户自我分析」）
- 上传包体积无变化（未动资源与 `packOptions.ignore`）

### 分包组件路径修复（同日，用户报 WXML 编译 ENOENT）

- **现象**：开发者工具报 `ENOENT: no such file or directory, open 'D:\Sleepwell\components\cloud-scene\index.wxml'`，但文件实际在 `pages/breathe/components/cloud-scene/` 且四件套齐全。
- **根因**：`pages/breathe` 是分包（`app.json` subPackages root），其 `index.json` 用绝对路径 `/pages/breathe/components/cloud-scene/index` 注册包内组件；开发者工具（2.02.2608080）会把分包 root 从绝对路径中剥掉后从项目根重拼，得到不存在的 `components/cloud-scene/index.wxml`。代码中无任何路径能静态解析到该文件，属工具对「分包 + 包内绝对路径」的解析缺陷。
- **修复**：`pages/breathe/index.json` 中 5 个包内组件（cloud/firefly/orb/whale/lavender-scene）改为相对路径 `./components/xxx/index`（官方推荐写法，从页面 json 所在目录解析）；主包组件 world-visual / night-tabbar 保持绝对路径不动。`tests/world-integration.test.js` 同步断言相对路径并注释原因。
- **验证**：全量测试 346/346 通过；全局已无 `/pages/breathe/components` 形式的组件引用残留。

### 「更多」抽屉精简（同日晚，用户反馈「太乱、很多功能不能用」）

- **诊断**：编译期（`cli preview` 全量通过）与测试层面（全绿）均无断裂；「功能不能用」的主因是模拟器跑的产物与高频并行改动不同步（当日 19:35–22:04 工作区持续被并行会话写入，`agent-chat-store.js`/`voice-service.js` 等新模块不断加入），模拟器增量编译没有跟上源码。冷重启工具后应恢复。
- **精简改动**（`pages/agent/index.wxml/js/wxss`）：
  - 移除「安眠曲」「深夜频道」两个占位板块——点按只弹「即将上线/正在搭建」toast，未上线的占位只贡献噪音；`tapLullaby`/`tapChannel` 与数据、样式一并删除，副标题「视角 · 内容 · 工具」改「视角 · 工具」
  - 专家/书卡卡片删除两行 intro 长文本（registry 层 intro 字段保留，注入不受影响），卡片 padding 20→16rpx、列表 gap 14→12rpx、min-height 104→96rpx
  - 保留：视角切换、来源档案（折叠态）、开场白 chips、新对话、对话设置
- **同步**：`tests/agent-panel.test.js` 删占位数据断言与 2 个 toast 用例；`tools/verify-nightcat.js` 抽屉断言删 lullaby/channel 计数、专家行数 3→4（旧断言漏算了阿德勒卡）
- **验证**：全量测试 376 用例 0 失败（6 个 TODO 为已知误报标记）

## 2026-10-17 更新：咨询师页面移除搜索入口

「首页 → 咨询师 → 查看全部」页面已移除搜索按钮及对应的搜索输入框，同时清理页面中的搜索状态、事件和样式。六个分类筛选、五位咨询师卡片、咨询跳转和返回导航继续保留，空状态文案同步改为仅提示切换分类。

在微信开发者工具中导入项目目录并重新编译，进入上述页面即可查看；若仍显示旧图标，请清除缓存后重新编译。可依次切换「全部 / 情绪支持 / 认知成长 / 关系沟通 / 自我探索 / 睡眠放松」，确认列表筛选及「点击咨询」入口正常。

相关文件：`pages/counselors/index.wxml`、`index.wxss`、`index.js` 和 `tests/counselors.test.js`。

验证：`node --test tests/counselors.test.js`，7 项测试全部通过，覆盖分类筛选、重置、咨询跳转、返回导航、本地图片引用及搜索入口移除检查。尚未在微信开发者工具或真机验证页面效果。

## 2026-10-17 最终更新：统一呼吸世界按钮与页面外壳

八个呼吸世界现在统一运行在 `pages/breathe` 公共外壳中，世界组件只负责背景、视觉元素和动画。

> 本次按钮、导航、完成页与 README 已同步到分支 `codex/current-sleepwell`。

- 顶部左侧为呼吸设置与“关灯”，两者保留 `28rpx` 间距；原左侧圆形退出按钮已删除。
- 设置图标使用固定 `40rpx × 40rpx` 画布进行几何与光学居中。
- 中下方金色按压圆位于场景高度的 `79%`，保持在运行后的“停止”按钮上方。
- 底栏统一复用首页 `components/night-tabbar`，入口为“首页 / 放松 / 记录”，图标、文字、选中态、安全区和路由完全一致。
- 在任意呼吸世界点击底部“放松”会直接打开与设置页相同的八世界选择器。
- 记录页也使用同一个 `night-tabbar`，不再保留独立的“夜喵 / 呼吸 / 记录”底栏。
- 呼吸页底栏为透明主题变体：按钮本身无背景，宿主无白色底，仅使用每个世界约 `14%–32%` 的低透明度暗色渐变保证可读性。
- 设置面板和八个世界选择器都只有一份，由 `pages/breathe` 直接管理。
- “我的呼吸世界”标题和右侧选择按钮已拆成独立元素：标题绝对居中，世界名称与箭头固定在整行右端。
- 完成页移除了“现在感觉 / 松一点 / 差不多 / 还紧绷 / 看看身体”，保留“几次呼吸 / 可以停在这里 / 从信息流里回来一点点 / 再呼吸一会儿 / 就到这里”。
- 萤火虫使用 120 个独立光点：尺寸 `2.2–12rpx`，亮度独立变化，吸气时从四周聚成约 `176rpx` 的圆形光团，停留保持，呼气散开。
- 呼吸光团直接渲染 `assets/breath-orb/orb-source.png`，显示范围约 `590rpx`，不依赖可能在 Skyline 中空白的 Canvas。
- 云、萤火虫、鲸鱼、呼吸光团运行中不再显示中央浅色触摸大圆；金色按压按钮保留。
- 四个旧独立页面及路由已经删除，项目不再保留旧云、萤火虫、呼吸光团和鲸鱼场景。

### 本地查看

1. 在微信开发者工具中导入项目根目录。
2. 执行「工具」→「清除缓存」→「清除文件缓存」。
3. 按 `Ctrl + B` 重新编译。
4. 分别检查八个呼吸世界的设置、关灯、中央按压按钮和底部导航。

```powershell
node --test "tests/world-integration.test.js"
node --test "tests/*.test.js"
```

## 2026-10-17 更新：书中技能排版与统一对话入口

首页和「书中技能 → 查看全部」中的同一本书，现在通过同一个对话入口打开夜喵聊天，并携带相同的书名提示。

| 页面 / 区域 | 最新变化 |
| --- | --- |
| 首页书中技能 | 三本书的按钮由「开始练习」改为「开始对话」，点击后直接进入对应书籍的聊天。 |
| 书中技能列表顶部 | 标题统一为「书中技能」；删除搜索入口、「从经典心理学中……」、「精选 5 本书中技能」及「把理解变成练习……」说明，分类栏下方直接展示书籍。 |
| 分类栏 | 分类按钮使用明确的小尺寸，左右保留间距，可横向滑动，避免默认按钮样式撑宽及右侧被裁切。 |
| 书籍卡片 | 缩小「开始对话」按钮和箭头，将按钮放在卡片右侧，与标签在同一行并垂直居中。 |
| 列表底部 | 删除「练习脚本保存在小程序本地……」说明，保留底部安全区间距。 |

### 如何查看本次修改

1. 在微信开发者工具导入此项目并重新编译；若仍出现旧文案，清除缓存后再次编译。
2. 首页找到「书中技能」，确认三本书均显示「开始对话」，点击任意一本进入书籍聊天。
3. 返回首页，点击书中技能旁的「查看全部」，确认标题、分类栏、卡片按钮及已删除的说明文字。
4. 在完整列表中点击同一本书的「开始对话」，应进入相同聊天并携带相同书籍提示；切换分类后仍可点击对应书籍，空分类可通过「查看全部技能」恢复列表。

这里复用目标分支已有的夜喵聊天页面与书籍开场提示，不改变原有模型服务、访问验证或对话处理。共享入口为 `services/skill-conversation.js`，页面代码位于 `pages/home/` 和 `pages/skills/`。

### 本次验证

```powershell
node --test tests/book-skills.test.js
```

- 6 项专项测试通过，覆盖五本书的对话地址、无效书籍校验、分类筛选，以及首页三本书与完整列表的入口一致性。
- 浏览器预览检查了 320px、375px、430px 宽度，包含分类栏可见范围、按钮尺寸、标签与按钮同行且不重叠，以及两处按钮的实际点击结果；完整列表额外模拟了小程序默认按钮样式。
- 基于目标分支 `c694c6a` 验证：原有 331 项测试通过；加入本轮 6 项专项测试后，全量 337 项测试通过。下方历史更新中的旧版失败记录不代表本次目标分支的测试结果。
- 原生组件效果仍需在微信开发者工具和真机确认。

## 2026-10-17 更新：界面按钮位置与日记体验

本次主要调整首页和二级页面的按钮位置，并修复日记连续输入和列表右侧被裁切的问题。

| 页面 / 区域 | 最新变化 |
| --- | --- |
| 首页「咨询师」「书中技能」 | 两个「查看全部」统一靠右，说明小字与标题同行；缩小入口文字与箭头，避免挤占标题空间。 |
| 二级页面返回按钮 | 感恩日记列表、写日记、睡眠记录、设置、环境声音、身体扫描、关灯、咨询师、书中技能及详情等共 13 个页面 / 视图的返回入口靠左，点击区域至少为 44×44px。 |
| 写日记提示 | 文案改为「一件小事也可以，最多写三条。」。 |
| 日记输入 | 使用固定行标识，输入时只更新对应文本，修复打几个字就失去焦点、需要重新点击的问题。 |
| 全部感恩日记列表 | 滚动容器的留白移到内部内容层，卡片左右边框与「···」操作完整显示；日期保持一行，长摘要仍可点击卡片查看全文。 |

### 如何查看

1. 将包含这些修改的项目目录导入微信开发者工具，重新编译，进入首页检查两个「查看全部」的位置。
2. 进入「记录 → 感恩日记 → 全部」，检查返回按钮、卡片右边框、日期和「···」操作；点击卡片可查看全文。
3. 点击「写日记」，分别在三个输入框中连续输入、删除和换行，再点击「留在今天」，确认保存内容完整。
4. 在咨询师、书中技能、设置、睡眠记录等二级页面检查返回按钮的位置与点击效果。

日记仍保存在当前设备，已保存日记的数据格式保持兼容。每篇最多三条，每条最多 120 字。

### 验证与相关文件

```powershell
node --test tests/journal-input.test.js tests/storage-helpers.test.js tests/counselors.test.js tests/skills.test.js tests/body-selection.test.js tests/sleep-calendar.test.js
node --test "tests/*.test.js"
```

- 专项测试覆盖日记行标识稳定性、连续内容更新、空白校验、保存与清空，以及相关目录和存储行为。
- 浏览器预览已检查 320px、375px、430px 宽度下的标题与返回按钮、首页入口、日记卡片边界、长文详情、更多操作和列表滚动；仍需在微信开发者工具和真机确认原生组件的实际表现。
- 全量测试在目标分支原版本有两项失败，均位于 `tests/home-navigation.test.js`：旧页面返回路由与测试预期不同，以及首页 / 目录页缺少测试要求的公共样式导入。本次修改后仍为相同两项失败。
- 主要代码位于 `app.wxss`、`pages/home/index.wxss`、各二级页返回按钮样式、`pages/journal/index.js` / `index.wxml`、`pages/record/index.wxml` / `index.wxss`；新增回归测试为 `tests/journal-input.test.js`。

## 2026-10-17 修复：四套沉浸式场景并入原呼吸系统

四套新视觉已替换原世界入口，但不再作为独立页面运行。它们现在是
`pages/breathe` 内的场景组件，与蒲公英共用提示、按压呼吸、设置、声音、
触觉反馈和底部导航。

| 世界 ID | 展示名称 | 场景组件 | 路由 |
| --- | --- | --- | --- |
| `firefly` | 萤火虫 | `components/firefly-scene` | `/pages/breathe/index?world=firefly` |
| `water` | 云 | `components/cloud-scene` | `/pages/breathe/index?world=water` |
| `orb` | 呼吸光团 | `components/orb-scene` | `/pages/breathe/index?world=orb` |
| `warmLight` | 鲸鱼 | `components/whale-scene` | `/pages/breathe/index?world=warmLight` |

`dandelion`（蒲公英）、`mist`（月光涟漪）、`moon`（薰衣草花海）和
`stardust`（星空海）继续使用原来的场景实现。

### 交互与路由

- 世界选择器直接在当前 `pages/breathe` 页面切换场景，不再保存设置后二次跳转。
- 顶部显示「按住，慢慢吸气」「4秒后，跟随提示自然呼吸」及阶段动态文案。
- 按压、松开、节奏、次数、声音、触觉反馈、结束提示音均由原呼吸状态机统一处理。
- 底部「首页」「放松」「记录」在八个世界中使用同一个 `night-tabbar` 组件。
- 左上角「关灯」沿用项目真实原逻辑，进入 `/pages/focus/index` 系统设置引导，不存在原地亮度切换或伪黑幕状态。
- 参考页面没有独立的右下角悬浮设置入口；最右侧公共入口是底栏「记录」。
- 旧的云、萤火虫、呼吸光团、鲸鱼独立页面及路由已删除，不再保留兼容页面或第二套场景实现。

### 主要文件

```text
pages/breathe/                         统一呼吸页面与公共交互
components/firefly-scene/              萤火虫视觉
components/cloud-scene/                云层视觉
components/orb-scene/                  呼吸光团视觉
components/whale-scene/                鲸鱼视觉
utils/world-navigation.js              八世界入口校验
utils/firefly-particles.js             萤火虫粒子逻辑
utils/cloud-breath.js                  云层视觉节奏
utils/breath-orb-machine.js            呼吸光团视觉状态
utils/whale-breath-machine.js          鲸鱼视觉状态
```

### 验证

- 相关自动测试覆盖八世界映射、旧地址一次重定向、公共提示/设置/导航和四个视觉组件边界。
- 需要重新编译后，在微信开发者工具或真机确认 Canvas 层级、胶囊避让、安全区与动画帧率。

## 2026-10-16 更新：夜喵危机安全介入（P0 安全兜底）

### 动机与设计

夜喵面向深夜独自、情绪可能脆弱的大学生，此前自伤风险的唯一防线是 system prompt 里的一句话（模型自觉）。本轮先落了「端内词表硬门」（critical 绕过大模型直接给罐头回复），当晚按产品决策调整为**「模型主导 + 确定性兜底」**：不绕过大模型，让模型识别高危信号后自然接住，并以 @@SAFE@@ 标记调起求助面板。设计依据见 `.workbuddy/reports/夜喵Agent方向调研-2026-10-16.html` 方案 A 与 `docs/safety-gate-design.md`：

- 新增 `utils/safety-gate.js`（纯函数、零 wx 依赖）：`scan(text)` 返回 `critical / elevated / normal` 三级判定。critical（死亡意愿、自伤方法、死亡联结自贬、涉他危险，约 50 词）命中后**不再绕过大模型**，而是把 `criticalDirective()` 强指令注入本轮 context，要求模型自然接住并以 @@SAFE@@ 收尾；elevated（崩溃、撑不住等高压情绪但无行动指向）不打断对话，仅向 context 注入 `elevatedNote()` 安全提示段；匹配前先做分隔符归一化，防御「不 想 活」「自——杀」类变体。
- 危机面板调用链（`@@SAFE@@` 新标记协议，与 @@REC@@/@@PUSH@@/@@ASK@@/@@DO@@ 正交）：① 常驻 system prompt 教会模型危机介入协议（识别含拼音避讳的高危信号 → 自然共情、不给方法细节 → 末尾单独一行输出 @@SAFE@@）；② `splitResponse` 把 @@SAFE@@ 从可见文本剔除并返回 `safe` 标志（流式期间同样不外泄）；③ 页面 `onComplete` 在 `result.safe || turn.safetyLevel === 'critical'` 时追加 `role: 'safety'` 求助卡（横幅舟 + 可复制热线 + 地区目录）并轻震动，模型漏标时端内兜底落卡（宁滥勿缺）。旧 `guardStreamSafety` 流式截断下线；罐头回复 `deliverSafetyTurn` 仅保留给 AI 未解锁（模型不可用）时的确定性兜底。
- 书卡接线补齐：对话请求新增 `book: books/registry.buildActivePrompt()` 参数（此前 `expert` 已接线而 `book` 漏传，导致书卡功能实际不生效）；书卡选择 UI 仍待在 night-settings 落地（`docs/expert-team-plan.md §5`）。
- 复制交互加固：`wx.setClipboardData` 改回调式——成功才 toast，失败弹窗把号码/网址亮出来（旧写法失败时无任何反馈，开发者工具失焦或系统限制下表现为「复制不可用」）；求助卡渠道、地区热线、消息复制按钮统一走 `copyToClipboard`。
- 拼音避讳变体层：`PINYIN_TERMS` 第三遍匹配（全拼任意位置命中 + 缩写/混写字母边界命中），「zisha」「zs」「xs」「自s」「s了」等不再漏检；源自用户实测反馈，端内安全兜底更完整。
- 方案核对结论：`utils/agent-voice.js` 已内置 3 组少样本示例对话（角色卡 mes_example 机制），本轮不再重复实装。

### 已知局限

- 拼音变体已覆盖常用形态（2026-10-16 用户实测「zisha」漏检后补）：全拼任意位置命中（zisha / wobuxianghuole）、声母缩写字母边界命中（zs / xs / bxh / tl / gw / zc）、中英混写（自s / s了 / 4了）；数字谐音（17了 等）仍未覆盖。全拼任意位置匹配会撞同形词（紫砂=zisha、英文 shale=杀了）；归一化匹配存在「不想 活动被取消」类误报可能——安全回复为柔和的求助指引，误报代价可控，原则是宁滥勿缺。
- 旧「流式截断兜底」已随架构调整下线：模型回复中的高危词不再触发截断（共情回应需要复述用户的词，字面拦截会打断对话）。剩余风险由三道防线缓解——常驻危机协议 + critical 强指令注入 + 漏标时端内兜底落卡；若实测发现模型输出危险方法细节，再评估恢复窄口径的流式拦截。
- 高危词表需定期人工复核误报/漏报（计划用 chatopera/efaqa-corpus-zh 的 S3 样例做本地回归语料，仅测试用、不随包分发）。
- 求助信息（12356 / 120 / 110 / 校内渠道）发布前需按上线地区复核。

### 求助渠道（真实信息，2026-10 用户提供）

求助卡渠道表与值班时间取自浙江大学心理中心官方口径（xlzx.zju.edu.cn/main.htm）：

- 心理中心值班电话 88982525（危机个案，值班时间直接拨打）
- 值班时间：周一至周五 8:00-12:00，13:30-17:30，18:00-21:00；周六、周日 8:30-11:30，13:30-16:30
- 浙江省统一心理援助热线 96525（24 小时）、全国 12356（24 小时免费）
- 其他时间：联系院系辅导员，或拨打 24 小时心理援助热线 12356（全国兜底）；更多方式见 xlzx.zju.edu.cn/qtqzfs/list.htm（卡内可复制完整网址）
- 紧急情况：120 / 110

卡片为渠道表结构（每条可一键复制号码），顶部横幅插画已接线：夜湖灯舟图 `assets/agent/safety-banner.jpg`（880×399，约 62KB）。
卡内「按地区查看更多热线」收录 32 组地区清单（`utils/safety-hotlines.js`，约 60 条全国省市级
热线）：默认浙江、picker 切换省份、选择本地记忆（`night-preferences.safetyRegion`）。
纯端内无 IP 归属服务，接入服务端后可升级为按 IP 自动默认；清单发布前需抽查核对。

### 求助卡插画（已接线）

横幅图 `assets/agent/safety-banner.jpg` 由用户 ChatGPT 生成的原图（941×1672 PNG，2.3MB）
裁切中部灯舟横带压缩而来：Pillow 裁 2.2:1 → 880×399 → JPEG q74 progressive，62.5KB（-97%）。
`buildHelpCard().banner` 已指向该路径，WXML `wx:if` + `aspectFill` 适配；换图只需替换文件，
生成提示词与过程留档 `docs/safety-gate-design.md` §5.1。

### 验证状态

- `node --test tests/*.test.js`：244 项通过，0 项失败（危机介入批次累计：`tests/safety-gate.test.js` 11 项——含 banner 路径与拼音变体断言；`tests/safety-hotlines.test.js` 5 项；`tests/agent-ui.test.js` 危机相关 7 项——critical 模型主导+漏标兜底落卡、@@SAFE@@ 模型调起且不外泄、拼音避讳 zisha 模型路径触发求助卡、逐渠道复制（成功 toast）、复制失败弹窗兜底、elevated 保持注入、地区列表默认/切换/持久化；`tests/agent-client.test.js` 新增 @@SAFE@@ 剔除与正交性断言）。真实语感探针：zs / xs / zisha / wobuxianghuole / 自s / 4了 全命中，我想睡觉 / 晚上睡不着（拼音）/ settle / little star 等正常输入零误伤。
- `node --check`：`pages/agent/index.js`、`utils/safety-gate.js`、两个测试文件退出码均为 0；`git diff --check` 通过。
- 尚需在微信开发者工具与真机验证：求助卡样式与深色主题适配、安全轮之后继续对话的体验、模拟器与真机的 `vibrateShort` 行为；安全门上线前建议再过一轮人工词表评审。

## 2026-10-17 更新：上游同步（非 agent 部分）+ 呼吸世界分包化 + 底栏三图标

### 上游同步范围与策略

以 `origin/codex/current-sleepwell`（86ca8bc，无 agent 的纯应用最新版）为基线，**除 agent 方向外全部替换**：四套沉浸式呼吸世界重构（云/萤火虫/鲸鱼/呼吸光团场景组件 + 8 个场景 utils）、`data/counselor-directory.js` 咨询师目录、上游删除的 guide/night-memory/night-messages 三页及对应清理。agent 家族（夜喵对话页、专家/书卡、技能、记忆、危机安全、agent-port 事件总线、night-settings 权限 UI、night-tabbar 规范）全部保留本地实现。回填接线：五个板块页（breathe/sleep/journal/focus/sound）补 `agentPort.publish` 事件上报；`pages/home` 两处入口恢复 `wx.reLaunch`（agent 是入口页，navigateTo 会叠栈）；breathe 页 `goAgent` 目标由上游的 home 改回 agent。上游已删评分 UI，`practice_rated` 事件自然不再触发（agent-port 优雅降级）。

### 分包化：breathe-worlds（包体红线的结构性解法）

同步后纯压缩无解（新增代码把基线推到 ~2.77MB），将整个呼吸世界拆为独立分包 `pages/breathe`（root 同名，路由仍为 `/pages/breathe/index`，所有既有跳转零改动）：5 个场景组件、8 个场景 utils、5 个资产目录整体搬入；`world-navigation`/`starfield-layout` 留主包（页面 require 字符串不变）；场景组件 require `'../../utils/X'` 解析自动落分包内，无需改字符串。app.json 配 `subPackages` + `preloadRule`（首页预下载）。核查确认无跨包悬空引用（主包无任何文件 require 分包内模块、无 wxml 引用分包组件/资产）。

### 包体整治（tools/pack-budget.js 已改分包感知，每包独立 2MB 判定）

- 同步后基线：主包 2769.8KB ✗ / 分包 3409.3KB ✗
- 压缩后：**主包 1965.5KB ✓（余 82.5KB）/ breathe-worlds 1210.1KB ✓（余 837.9KB）**
- 手段（`tools/compress-assets.py`，带幂等 guard 可重跑）：咨询师头像 6 张 256 色量化（单张 134KB→21KB，肉眼无差）；鲸鱼/光团光晕 PNG 量化（whale-full-glow 645KB→98KB）；薰衣草花枝 284KB→56KB；星空背景 PNG→JPG（71KB→7.3KB）；薰衣草双背景原生分辨率 q68-70；agent 页 recommendation-cover 按显示尺寸缩放（moon-lake 750×750→300×380，64KB→18.7KB）；环境音 48kbps→40kbps（-39.5KB）；星空呼吸背景 q70
- 删除死资产：`assets/agent/night-cat.jpg`（37.8KB，全仓零引用）；`assets/agent/icons/cat.png`（底栏夜喵项删除后零引用）
- 教训：agent/books 的 jpg 已在此前批次压到最优点（q70-72），再压只会变大或 generation loss——压缩前先试压测体积，勿凭感觉调参数

### 底栏三图标（用户 2026-10-17 决策）

底栏由四项（夜喵/首页/放松/记录）改为三项（首页/放松/记录），删除夜喵 tab；agent 入口保留在首页（咨询师卡片/输入框直发）与 breathe/record 页头小夜喵按钮。`cat-muted.png` 仍被 record 页头导航使用故保留。tests 增加三项断言（home-navigation + world-integration）。

### 上游两处测试自身不一致（已按我们的设计统一并修测试）

1. 上游 `pages/record` 的 goNight 跳 agent，但其测试断言跳 home——按我们的设计（record 页头夜喵→agent）改断言；
2. 上游 nightcat import 断言与页面实际 import 不符——按合并后现实（skill-detail/topic 共享 nightcat.wxss；home/counselors/skills 自包含）改断言。

### 验证状态

- `node --test`：333/333 通过（`tests/skills.test.js` 已更名 `tests/agent-skills.test.js`，避免被上游同名测试覆盖）
- `node tools/pack-budget.js`：两包均在限内（退出码 0）
- 跨包引用核查：无悬空 require / 组件 / 资产路径
- **注意**：分包化属结构性改动，微信开发者工具必须「清除缓存 → 重新编译」后才能看到新版呼吸世界，增量编译会显示旧版
- 尚需真机验收：四个沉浸世界的动画与性能、分包预下载行为、压缩后画质（头像/薰衣草背景/鲸鱼光晕）

## 2026-10-12 更新：夜喵 Agent、记录页与星尘动画

### 夜喵首页与对话流程

- 新增 `pages/agent/index` 夜喵首页，保留深绿色、金色和猫咪夜景视觉风格。
- 首页包含“初始 / 对话 / 推荐”三种状态。点击“考试焦虑”“论文 / 科研压力”“宿舍难以放松”“脑子停不下来”等场景后，在当前页展开 2–3 轮对话，不再直接跳转聊天页；完成后生成个性化声音推荐卡片，点击卡片进入 `/pages/sound/index` 播放页。
- `utils/agent-guide.js` 目前使用本地关键词和规则生成引导与推荐，并未接入真实大模型。推荐使用现有自然声音（微风、雨声、湖水、白噪音），播放仍由用户在播放器中控制。
- 当前可见输入框支持文字消息；AI 语音合成、语音转文字和豆包式“按住说话”尚未完成。项目中保留的旧录音代码不代表当前页面已经启用语音聊天。
- 底部导航统一为“夜喵 / 呼吸 / 记录”。夜喵首页右上角进入夜喵设置；对话状态进入带 `from=chat` 参数的 AI 设置。

### 记录页与数据语义

- 新增 `pages/record/index`：睡眠月历、早睡周统计、感恩日记入口与最近记录、全部列表、详情和删除确认均在同一页面完成。
- 日历默认显示当前月，周日为第一列，支持四至六行月份；今天标记和选中状态独立于记录颜色，并提供文字图例和无记录状态。
- 统计依据是“上床时间”，不是精确入睡时间：早睡为 `[21:00, 23:00)`，稍晚为 `[23:00, 24:00)` 与 `[00:00, 00:30)`，晚睡为 `[00:30, 05:00)`；00:00–04:59 归入前一晚。周统计按周一至周日计算。
- 睡眠记录现在保存完整 `nightDate` 并按夜晚日期更新；旧的仅有月日记录保留在历史中，但无法可靠确定年份，因此不计入月历和统计。
- 原有夜喵/呼吸页面中的“呼吸记录、环境声音”弹层入口已移除；呼吸页的记录入口改为打开新的记录页。原生睡眠表单也已修正为紧凑按钮和“上床至起床”文案。

### 设置分工

- 首页设置只保留显示与提醒及账户、数据、引导、关于等内容；睡前提醒、早睡打卡、感恩日记提醒合并为一条“提醒设置”。
- 夜喵右上角设置只保留 AI 相关项：夜喵性格、声音、默认模型、猜你想问、默认引导问题和高级 API 设置。偏好、模型、通知、登录等数据目前仅本地保存，相关云端能力尚未接入。

### 星尘动画与包体

- `components/world-visual` 已用 `assets/animation/starfield-rest.jpg` 和 `starfield-inhale.jpg` 替换“星尘”状态下的视觉素材，通过吸气、屏息、呼气阶段控制亮度、缩放和淡入淡出；呼吸状态机和默认 4-7-8 节奏未改变。原始 GIF 不进入上传包。
- 针对微信 `80051`（上传源文件超过 2MB）错误，已排除未使用的大型资源并压缩实际 PNG。当前本地上传包估算约 1739KB，低于 2MB 限制约 309KB；最终大小仍以微信开发者工具编译上传结果为准。

### 验证状态

- 已完成 WXML/JavaScript 检查、记录页主要状态和路由检查，以及 375px/390px 宽度下的布局检查。
- 仍需在微信开发者工具和真机上确认 Skyline 渲染、音频播放、系统安全区和最终上传包大小；README 中未将本地规则引导或静态原型描述为真实 AI 服务。

## 技术方案

- 原生微信小程序：WXML、WXSS、JavaScript
- 无 npm、无第三方 UI 库、无云开发依赖
- 呼吸首页使用页面级 Skyline + glass-easel；其他页面保留 WebView，形成渐进式混合渲染
- 蒲公英默认使用 `useCanvas: false` 的摄影图片分层：静态花茎、可动花冠和独立种子；Canvas/Skyline Worklet 代码仍保留作为实验和兼容路径，但不是当前可见主渲染
- 不支持图片层时仍可保留 Canvas 2D 动画；低性能设备的 Canvas 路径会降低绒毛数量和帧率
- 8 个世界共用 `components/world-visual`，首页和身体呼吸保持同一套视觉语言
- 运行时使用本地 MP3，可离线播放；WAV 源文件由 `tools/generate-sounds.ps1` 生成，不进入上传包。

## 2026-09-07 更新：呼吸提示去重与首页分享入口

### 改动说明

- 首页和身体呼吸页的吸气主提示由“深呼吸”统一改为“缓缓吸气”，明确当前动作；`utils/breath-view.js` 中的阶段标签及已有测试预期同步更新。
- 两个页面的倒计时改为 `{{countdown}} 秒`，例如“4 秒”。主标题继续显示阶段动作，辅助提示保留，避免倒计时再次重复“吸气 / 停留 / 呼气”。
- 首页 `onShow` 通过 `wx.showShareMenu` 启用 `shareAppMessage` 和 `shareTimeline`；用户从微信右上角菜单选择“转发给朋友”或“分享到朋友圈”。
- `onShareAppMessage` 返回标题“呼吸空间（SleepWell）”和路径 `/pages/breathe/index`；`onShareTimeline` 使用同一标题和空 `query`，分享当前首页，不附带个人记录或呼吸进度参数。
- 分享能力仅补在首页，不代表其他页面也已启用。朋友圈发布仍需用户在微信中确认，不会自动发布。
- 本次未改变呼吸时长、状态机、触摸处理、蒲公英动效和素材，也未增加页面按钮或修改布局样式。

### 验证与发布状态

- `node --test tests/*.test.js`：23 项通过，0 项失败。
- 修改的 JavaScript 已通过 `node --check`，`git diff --check` 通过。
- 使用模拟微信 API 调用首页生命周期和两种分享回调，已检查菜单参数、好友分享首页路径、朋友圈空查询参数及两种标题一致性。这是代码级检查，不是实际发送验证。
- 尚未完成本次文案和分享功能的 Skyline / 微信真机验收。需重新编译，检查两个页面的提示不重复，并在手机首页检查好友和朋友圈菜单、分享卡片及接收方打开结果；实际入口还受微信客户端和平台支持情况影响。
- 推送 GitHub 不会自动更新微信线上版本。普通用户获得更新仍需上传新版本，并完成相应审核和发布；开发版或体验版的访问权限限制仍然适用。

## 2026-09-06 更新：导航优化与上传包瘦身

对应代码提交：[`098a8c9`](https://github.com/oraclehhh/Sleepwell/commit/098a8c98319b80f76f6736e1e04a872a971376fc)。以下记录以该提交和本次验证结果为准；后文蒲公英复盘保留此前阶段的历史证据。

### 顶部控件与底部导航

修改位于 `pages/breathe/index.wxml`、`pages/breathe/index.wxss`：

- 顶部控件改为横向 flex 分组，退出和设置位于左组，关灯位于右组；退出图标采用真实线条节点，关灯文字保持横向、不换行。
- 底部三个入口保持“身体、呼吸世界、记录”的文案及原有点击绑定；呼吸世界保留长按切换场景。
- 三个导航图标统一使用 `48rpx` 方形占位盒和约 `2rpx` 线宽，以真实 WXML 节点构成人体肩颈、四向扩散、文档图形。底部不再使用动态 `currentWorld.glyph`，场景选择器仍保留原来的 glyph。
- 未选中图标使用 `rgba(255,255,255,.52)`；选中项通过 `is-selected`、暖金色 `#e7d2aa` 和真实 `nav-active-indicator` 节点表示，不依赖点击焦点或放大图标。
- 三个导航项采用等宽 flex，最小高度 `112rpx`，图标与文字间距 `8rpx`；保留 `safe-bottom` 和底部安全区内边距。
- 导航上方的小点及数字对应 `cycle-dots`、`cycle-count`，属于呼吸轮次业务内容，未删除；`stop-breath` 也保留。

此提交没有修改呼吸状态机、计时与触摸 JavaScript、蒲公英动画代码、呼吸球代码、设置或音频逻辑。导航的实际点击区域、长按、底部安全区和轮次指示间距仍需 Skyline 真机回归；不能仅凭 rpx 数值或测试通过声称所有设备验收通过。

### 上传包超限修复

2026-09-06 上传曾报错 `80051: source size 12517KB exceed max limit 2MB`。本地按旧忽略规则估算约 `12534KiB`，与错误提示接近。主要体积来自未排除的检查截图、多套历史蒲公英素材，以及实际使用的较大 PNG。

`project.config.json` 的 `packOptions.ignore` 新增排除 `.git`、`.worktrees`、`assets/dandelion/checks/`、`assets/dandelion/build_layers.py`，以及该目录中的 `photo-full.png`、`photo-loosened.png`、`photo-sparse.png`、`photo-sparse-v2.png`。这些文件仍保留在本地或历史仓库中，只从微信上传包中排除。原有 `Fig`、文档、测试、工具及 WAV 排除规则保留。

实际使用的三张 crown、`stem-static.png`、`seed.png`、人体剪影和五个 MP3 均保留在上传资源中。四张大图进行了轻微有损 RGB 色阶压缩，文件尺寸如下（单位为字节）：

| 素材 | 压缩前 | 压缩后 | 画布尺寸 |
| --- | ---: | ---: | --- |
| `assets/dandelion/crown-full.png` | 523662 | 358089 | 660 × 825 |
| `assets/dandelion/crown-loosened.png` | 522486 | 357100 | 660 × 825 |
| `assets/dandelion/crown-sparse.png` | 511039 | 344128 | 660 × 825 |
| `assets/body-silhouette-v2.png` | 667007 | 295466 | 887 × 1774 |

压缩将 RGB 各通道量化为 32 级后仍保存为 RGBA PNG；完全透明像素的 RGB 清零。可见像素每个颜色通道最大误差为 `4/255`，alpha 通道逐像素不变，画布尺寸和定位基准不变。白色、红色及深墨绿色背景的本地压缩前后对比未见明显变化；这不构成新的 Skyline 动画验证。

修改后按排除规则扫描的本地源文件总量为 `1805849` 字节，约 `1.722MiB`，距 `2MiB` 约剩 `284.5KiB`。这是本地估算，编译后的实际包体以微信开发者工具为准。用户随后反馈上传成功；本次没有另存实际上传包体统计。

### AppID 与验证记录

- `project.config.json` 已从 `touristappid` 改为正式 AppID `wx9fe54c8fa871a2de`。开发者工具项目详情和微信公众平台后台应使用同一个 AppID。
- AppID 是应用标识；代码上传私钥属于凭据，未写入配置、README 或 Git，也不进入小程序包。
- 提交前执行 `node --test tests/*.test.js`：23 项通过，0 项失败。
- `node --check pages/breathe/index.js`、`node --check components/world-visual/index.js` 和 `git diff --check` 均通过。
- 已核对运行时静态图片引用和动态音频对应的五个 MP3，文件存在且未被打包规则排除。
- 导航代码已实现，Skyline 画面未验证。此前 CLI 曾成功打开项目和启用自动化，但游客 AppID 的自动预览失败，未获得本次导航修改后的新截图。后文历史截图不能替代本次验证。
- 上传成功不等于审核通过或发布上线。发布前仍需在正式 AppID 下真机检查导航点击、长按切换、各阶段画面、音频和记录入口，并在公众平台完成审核与发布。

## 蒲公英呼吸动效实现与故障复盘

本节保留提交 `f5c9cd6` 时的阶段性复盘；其中“当前”“本次”和截图结论均指该历史检查点，不代表后续导航或图片压缩版本已完成 Skyline 验收。结论依据当时组件代码、素材 alpha 检查、Git 历史、自动化测试和本地保存的微信开发者工具 Skyline 截图。历史现象来自本线程中的修改记录；没有截图或工具证据的项目不会写成“画面已验证”。

### 1. 设计目标

目标视觉是暖金色、具有摄影质感的蒲公英，而不是纯 CSS 线稿：

- `idle` 显示完整花冠、花芯、静态花茎和根部。
- `inhale` 只让花冠围绕花茎连接点单向连续旋转，持续 4 秒。
- `hold` 停止吸气旋转，只让花冠柔和地左右摇晃。
- `exhale` 让花冠继续单向旋转，同时从花冠边缘释放大量种子。
- `completed` 停止主体动画，保留少量种子残影并淡出。
- 花茎和根部在所有阶段固定；任何阶段都不能旋转整张带花茎的蒲公英图片。

这些是设计目标，不等同于每项都已通过 Skyline 自动化验收；画面证据见“实际 Skyline 验证”。

### 2. 当前组件结构

当前 WXML 位于 `components/world-visual/index.wxml`，蒲公英相关职责如下：

| 层 | 当前职责 |
| --- | --- |
| `.dandelion-photo-layer` | 图片蒲公英的公共绝对定位层，把花茎、花冠和种子放在同一视觉区域；不绑定花冠旋转。 |
| `.dandelion-stem-static` | `/assets/dandelion/stem-static.png`，只显示静态花茎和根部，固定 `translate(-50%, -50%)`，并使用 `animation: none !important`。 |
| `.dandelion-crown-anchor` | 以测得的花芯坐标定位花冠支点；当前为 `left: calc(50% + 28.36rpx)`、`top: calc(43% - 57.91rpx)`，宽高为 0。 |
| `.dandelion-crown-motion` | 花冠运动容器，当前尺寸为 `520rpx × 650rpx`，支点为 `transform-origin: 55.45% 41.09%`，只承载旋转和缩放动画。 |
| `.dandelion-crown--full` | `idle`/`inhale` 使用的完整花冠素材。 |
| `.dandelion-crown--loosened` | `hold` 使用的轻微稀疏花冠；呼气时作为低透明度过渡层。 |
| `.dandelion-crown--sparse` | `exhale` 主显示层和 `completed` 残留层。 |
| `.photo-seeds` | 以花芯/花冠中心为原点的零尺寸种子坐标层，`overflow: visible`，不参与花冠旋转。 |
| `.photo-seed` | 单颗种子容器；每颗有明确起点、动画路径、延迟和层级，内部 `.photo-seed-image` 只显示 `seed.png`。 |

`components/world-visual/index.js` 的 `ready()` 明确设置 `useCanvas: false`，所以当前可见动效必须看图片层；Canvas 初始化和 Worklet 方法仍存在，但在当前配置下不是主画面。

### 3. 呼吸阶段与动画映射

下表以当前 `index.wxss` 的选择器和当前 WXML 类名为准：

| 阶段 | 可见花冠 | 主体动画 | 种子状态 | 花茎状态 |
| --- | --- | --- | --- | --- |
| `idle` | `crown-full`（`.98`） | 无 | 默认隐藏 | `stem-static` 固定显示 |
| `inhale` | `crown-full`（`1`） | `crownFerrisRotate`，4 秒、`linear`、`0deg -> 360deg` | 不显示 | 固定，不参与动画 |
| `hold` | `crown-loosened`（`1`） | `crownHoldSway`，1.8 秒、`ease-in-out`、`-10deg -> 10deg -> -10deg` | 仅 preview 少量预览 | 固定，不参与动画 |
| `exhale` | `crown-sparse`（`.82`）与 `crown-loosened`（`.18`）短时交叉 | `crownExhaleRotate`，7.6 秒、`linear`、`0deg -> 300deg` | 60 颗种子按固定路径并行飞散 | 固定，不参与动画 |
| `completed` | `crown-sparse`（`.74`） | `.dandelion-crown-motion { animation: none; }` | 前 4 颗保留低透明度残影，其余隐藏 | 固定，不参与动画 |

### 4. 种子飞散实现

当前 `createPhotoSeeds()` 在 `index.js` 中生成 60 个不同 id 的对象，WXML 通过 `wx:for` 实际渲染 60 个 `.photo-seed` 节点。每个节点都有自己的 `photo-seed--0` 到 `photo-seed--59` 类，CSS 给出不同起点和动画延迟；动画路径复用 12 组固定关键帧，但起点、方向、延迟和尺寸层级均有变化。

- 近层、中层、远层由 `layer` 字段循环分配：近层 `64rpx × 78rpx`、图片透明度约 `.96`；中层 `52rpx × 64rpx`、约 `.78`；远层 `40rpx × 50rpx`、约 `.48`。当前版本没有额外 blur，以控制 Skyline 节点和滤镜成本。
- 60 个起点均以 `.photo-seeds` 的花芯中心为坐标基准，分布到右上、右侧、左上、上方、左侧和少量下侧；飞散终点保持在视觉舞台附近，避免页面左上角凭空出现。
- 呼气延迟从 `0ms` 逐步错开到 `4680ms`，覆盖首批、主批和更晚的远层种子。每颗种子在关键帧中同时改变 `translate3d`、旋转、缩放和透明度；不能只改变 `opacity`，否则看起来只是闪烁而不是脱离花冠。
- 关键帧直接写入固定数值，没有使用 `var(--seed-x)`、`var(--seed-y)` 等 CSS 自定义变量，降低 Skyline 对自定义变量和动态插值的依赖。
- `hold` 阶段只显示少量 preview 种子；`idle`/`inhale` 不显示飞散种子；`completed` 只保留少量残影。

种子曾从左上角出现，是因为早期 `.photo-seeds` 使用整块视觉区域或页面百分比作为定位上下文，`left/top` 百分比没有对应花冠位置。后续改成零尺寸、`overflow: visible` 的花芯中心坐标层，并把每颗种子改成固定 `rpx` 起点。代码层面已实现；是否覆盖所有屏幕比例仍需 Skyline 多机型截图验证。

### 5. 主要问题复盘

#### 蒲公英没有位于视觉区域中心

- **现象**：早期截图中蒲公英相对视觉舞台偏移，花冠和种子起点不在同一中心。
- **根因**：整体图片/Canvas 的舞台中心、`top: 43%` 花冠位置和种子定位上下文没有统一。
- **当时采用的方案**：先后调整视觉区域居中、图片层定位和花冠 anchor。
- **方案结果**：当前以 `.dandelion-photo-layer` 充满蒲公英区域，以 `43%` 垂直参考点，并单独给花芯 anchor 偏移。
- **引入的新故障**：固定区域修正过程中暴露出整图旋转支点错误和种子左上角问题。
- **后续修正**：将花冠和种子改为以测得的花芯坐标定位。
- **当前状态**：当前 Skyline 截图中花冠位于视觉舞台中部；响应式尺寸的全面覆盖尚未自动化验证。
- **验证方式**：`assets/dandelion/checks/skyline-inhale-final.png`、`skyline-hold-final-a.png`、`skyline-exhale-final.png`。

#### 呼气时种子动画没有触发

- **现象**：`phase="exhale"` 时节点存在，但种子不动或不可见。
- **根因**：早期选择器依赖 `.photo-seeds--exhale`，阶段类没有稳定落到实际可见节点；同时曾有 Skyline image 节点动画兼容性风险。
- **当时采用的方案**：核对 `phase` 类链路，将动画绑定到可见的 `.photo-seed` 容器，并保留 `animation-play-state: running`。
- **方案结果**：当前 WXML 直接输出 `photo-seeds--{{phase}}`，CSS 对 `photo-seeds--exhale .photo-seed` 逐颗赋予动画。
- **引入的新故障**：动画触发后暴露出起点坐标错误、数量不足和方向单一。
- **后续修正**：统一花芯坐标基准，扩展至 60 颗并增加固定多方向路径。
- **当前状态**：代码已实现，保存的 exhale Skyline 截图能看到种子；没有对每个节点的运行时 `animation-name` 做自动化断言。
- **验证方式**：`skyline-exhale-final.png`、`skyline-exhale-final-end.png`，以及 23 个自动化测试（测试不覆盖 CSS 画面）。

#### 种子从页面左上角出现

- **现象**：种子从屏幕左上角或页面边缘凭空出现，而不是从花冠边缘飞出。
- **根因**：`.photo-seeds` 曾覆盖整个 `.dandelion` 区域，`left/top` 百分比相对于错误容器计算。
- **当时采用的方案**：把种子层改成花芯中心、`width/height: 0`、`overflow: visible`，每颗种子使用明确 `rpx` 起点。
- **方案结果**：当前 60 个 `.photo-seed--N` 的起点都围绕花芯中心，关键帧从 `translate3d(0, 0, 0)` 开始。
- **引入的新故障**：部分早期路径仍会被舞台边界截断，且花冠素材分层问题被同时暴露。
- **后续修正**：限制终点范围并把种子层放在可见图片层内，保留 `overflow: visible`。
- **当前状态**：已保存 Skyline 截图中未观察到左上角种子；不同屏幕比例仍需复测。
- **验证方式**：`skyline-exhale-final.png` 和 `skyline-exhale-final-end.png`。

#### 种子数量太少、方向单一

- **现象**：早期约 6-20 颗种子，大多沿右上方向移动，吹散反馈不明显。
- **根因**：早期只有少量 class 和少数组合路径，延迟与层级不足。
- **当时采用的方案**：`createPhotoSeeds()` 扩展到 60；CSS 增加 0-59 的明确位置，并提供 12 组方向路径、近中远三层。
- **方案结果**：当前代码实际渲染 60 个节点，延迟覆盖到 4.68 秒，路径含右上、正右、左上、上方、左侧和少量下侧。
- **引入的新故障**：CSS 体量明显增加，远层节点若使用大量滤镜会增加 Skyline 成本。
- **后续修正**：远层只降低尺寸和透明度，不使用额外 blur；仍保持 60 个节点。
- **当前状态**：代码和 exhale 截图支持“有种子群”；没有逐帧自动统计 7、5、3 秒同屏数量。
- **验证方式**：`index.js` 的 60 项数组、`index.wxss` 的 `photo-seed--0` 至 `--59` 规则、exhale Skyline 截图。

#### 屏气动画绑定在不可见或不稳定的 image 节点

- **现象**：屏气时只看到 scale 或完全不摇晃，真实图片层动画不稳定。
- **根因**：动画曾直接绑定 Skyline `<image>`，并与 image 的基础 transform、transition、full/loosened 交叉透明度竞争。
- **当时采用的方案**：引入 `.dandelion-crown-motion` 运动容器，让 image 只负责素材和 opacity，hold 动画绑定运动容器。
- **方案结果**：当前 `.world--dandelion.phase--hold .dandelion-crown-motion` 使用 `crownHoldSway`，full 隐藏、loosened 显示。
- **引入的新故障**：运动容器仍需要和素材的真实花芯坐标校准，否则支点会偏离。
- **后续修正**：测量 660×825 素材花芯 `(366, 339)`，采用 `55.45% 41.09%` 和对应 anchor 偏移。
- **当前状态**：连续 hold 截图显示花冠方向变化；代码已实现，Skyline 画面已截图但没有帧级位移测量。
- **验证方式**：`skyline-hold-final-a.png` 与 `skyline-hold-final-b.png` 的连续画面对比。

#### 吸气动画做成往返摇晃，而不是单向旋转

- **现象**：吸气时 `-18deg -> 18deg -> -12deg` 看起来像左右摇摆，不是连续转动。
- **根因**：关键帧把角度写成往返区间，并曾配合 `alternate`。
- **当时采用的方案**：改为 `crownFerrisRotate`，4 秒 `linear`，`0deg -> 360deg`，不使用 `alternate`。
- **方案结果**：当前 inhale 选择器只绑定 `crownFerrisRotate`，hold 才使用往返摇晃。
- **引入的新故障**：如果整张带花茎 PNG 参与旋转，根部会随图片绕圈；这不是角度曲线本身能解决的问题。
- **后续修正**：拆出静态花茎和独立花冠运动层。
- **当前状态**：代码已实现；`skyline-inhale-final.png` 支持可见旋转，但没有视频或逐帧角度记录。
- **验证方式**：CSS 关键帧、Git 历史 `7d6a31e` 及 inhale Skyline 截图。

#### 旋转整张 PNG 导致根部和花茎漂移

- **现象**：花冠跑到右下角/左侧，花茎变成水平，根部不再固定。
- **根因**：完整 `photo-full.png` 同时包含花冠、花茎和根部，整图绕错误几何中心旋转。
- **当时采用的方案**：先尝试 `transform-origin` 和 root anchor，随后将静态根茎与 crown 运动职责拆开。
- **方案结果**：当前 WXML 使用独立 `stem-static.png` 和 `dandelion-crown-motion`；只有后者有 rotate/scale。
- **引入的新故障**：分层素材制作不正确时会形成两根花茎、断层或半个花冠。
- **后续修正**：对 crown/stem 读取 alpha 通道并生成检查图，再绑定 CSS。
- **当前状态**：当前 Skyline 截图中未观察到花茎水平甩出或第二根花茎；素材分层仍需在更多背景和设备上复核。
- **验证方式**：`stem-static-transparent-check.png`、`layers-deep-green.png`、inhale/hold/exhale Skyline 截图。

#### `transform-origin` 设置错误导致花冠大范围绕圈

- **现象**：曾使用约 `50% 76%`，花冠绕花芯下方很远的点旋转，产生大范围偏移。
- **根因**：76% 是原始整图比例上的猜测，不是实际花芯坐标。
- **当时采用的方案**：从 660×825 crown 图测得花芯 `(366, 339)`，换算为 `55.45% 41.09%`。
- **方案结果**：当前 `.dandelion-crown-motion` 和 anchor 使用同一测量结果，关键帧只写 rotate/scale。
- **引入的新故障**：anchor 仍需和静态花茎顶部在实际 rpx 尺寸下对齐，单靠百分比无法证明连接点完美重合。
- **后续修正**：保存合成检查图与 Skyline 截图，观察根部和花芯位置。
- **当前状态**：数值已统一；没有自动化工具在动画期间采样花芯屏幕坐标，因此仍保留视觉回归风险。
- **验证方式**：当前 CSS、alpha 检查记录及 `skyline-inhale-final.png`。

#### 引入 root-anchor 后整张图片仍参与旋转

- **现象**：即使 anchor 自身不动，完整图片仍把花茎和根部带入旋转。
- **根因**：anchor 只是定位容器；如果子节点仍是完整 PNG，旋转对象的有效像素仍包含花茎。
- **当时采用的方案**：废弃“anchor + 整图旋转”作为最终分层，改为静态 stem 与 crown 独立素材。
- **方案结果**：当前 motion 容器内只有三张 crown 图片，stem 在 motion 外部。
- **引入的新故障**：旧 crown 文件曾被误认为已裁掉花茎，实际 alpha 中仍残留长花茎。
- **后续修正**：进行 alpha bbox 和中心底部连续像素检查，并在 README 中保留这个风险。
- **当前状态**：当前四张生产素材已通过本地 alpha 检查的基本分层条件；不能仅凭文件名认为永久正确。
- **验证方式**：本地检查图和 alpha 检查结果，未提交检查脚本/图片。

#### 拆分花冠和花茎后出现半个花冠、矩形断层

- **现象**：裁切 crown 为 660×430 后只剩上半圆，下方出现矩形断层，花冠和花茎不衔接。
- **根因**：裁切高度不足，且 `aspectFit` 容器比例与素材画布不一致。
- **当时采用的方案**：恢复与原始 660×825 对齐的 crown 画布，保留完整花冠区域，不再用固定高度裁切。
- **方案结果**：当前 crown 三张均为 660×825 画布，alpha bbox 到约 y=666，中央 y>=680 无连续长花茎像素。
- **引入的新故障**：素材生成过程又暴露出扇形透明缺口和层间内容未真正分离的问题。
- **后续修正**：改用 alpha 检查和白/红/深墨绿色合成检查图。
- **当前状态**：检查图中未观察到矩形黑边；没有在每个微信设备上自动化比较 alpha。
- **验证方式**：`crown-full-transparent-check.png`、`asset-background-matrix.png`、三张 `layers-*.png`。

#### crown 素材出现扇形透明缺口

- **现象**：三个 crown 状态在相同位置出现扇形透明楔形，吸气、屏气、呼气都存在。
- **根因**：素材抠图/裁切时 alpha 通道误删了花冠内部区域，属于素材问题，不是 rotate 或定位问题。
- **当时采用的方案**：回到 `photo-full.png` 参考，不再用圆形、扇形或多边形遮罩掩盖；重新生成三张同画布素材。
- **方案结果**：当前检查图用于确认背景变化下没有明显透明楔形；代码没有增加 CSS 遮罩。
- **引入的新故障**：重新生成素材时仍可能把花茎一起带入 crown，导致分层真假难辨。
- **后续修正**：加入“中心底部连续像素为 0”和 stem 上半部无花冠像素的 alpha 检查。
- **当前状态**：本地检查未发现用户描述的扇形缺口；未做像素级形态学完整性证明，因此仍需人工回归。
- **验证方式**：`asset-background-matrix.png`、`layers-white.png`、`layers-red.png`、`layers-deep-green.png`。

#### crown 素材实际仍残留长花茎

- **现象**：文件名叫 crown，但有效像素仍从花芯向画布底部延伸，旋转时花茎被带动。
- **根因**：只看文件名或肉眼缩略图，没有读取 alpha 和中央纵向连续像素。
- **当时采用的方案**：以原始 photo 为参考重新构造 crown，并检查 crown 的底部中央区域。
- **方案结果**：当前三张 crown 的 alpha bbox 分别为 `(33,0,659,666)`、`(33,0,659,666)`、`(65,42,657,663)`；记录的 y>=680 中央花茎检查为 0。
- **引入的新故障**：花冠底部连接绒毛容易被误删，可能造成断层。
- **后续修正**：保持三张同画布、同中心，不再用过度裁切去除花茎。
- **当前状态**：基本 alpha 检查通过；“没有任何花茎像素”不能仅由 bbox 证明，仍应在原图放大和多背景下人工复核。
- **验证方式**：alpha 记录及 crown 合成检查图。

#### stem-static 素材实际仍残留花冠

- **现象**：stem-static 另外叠加了一朵接近完整的花冠，造成双重花冠或黑色重影。
- **根因**：stem 生成时只做了粗略裁切，没有验证上部 alpha 是否存在大面积圆形花冠。
- **当时采用的方案**：重新生成静态根茎，并检查 `stem-static.png` 的 alpha bbox 和上部区域。
- **方案结果**：当前 bbox 为 `(291,335,373,824)`，记录的 y<250 花冠区域有效像素为 0。
- **引入的新故障**：如果 stem 顶部保留连接短段的范围不一致，可能出现花冠与花茎缝隙。
- **后续修正**：用合成检查图观察连接点，同时让 anchor 以测得花芯坐标定位。
- **当前状态**：没有发现大面积残留花冠；连接点仍需要实机尺寸下人工复核。
- **验证方式**：`stem-static-transparent-check.png` 和三种背景合成图。

#### 两张接近完整的蒲公英叠加导致重影和错位

- **现象**：动态层和静态层同时显示花冠、花茎，出现双花芯、三角断层或错位。
- **根因**：full/loosened/sparse 和 stem 的职责边界没有通过 alpha 验证，且多层透明度交叉时间过长。
- **当时采用的方案**：WXML 固定为一张静态 stem + 三张互斥/短时交叉的 crown；exhale 仅让 loosened `.18`、sparse `.82`。
- **方案结果**：当前 CSS 不再使用完整 `photo-full.png` 作为 crown 层，motion 容器内只有 crown 文件。
- **引入的新故障**：素材中心坐标稍有误差仍会造成连接处重叠，即使 CSS 结构正确。
- **后续修正**：统一 660×825 画布和 `(366,339)` 花芯参考点。
- **当前状态**：已保存 Skyline 截图未观察到双重花冠；仍需在素材更新后重新检查 alpha。
- **验证方式**：WXML 结构、CSS opacity 选择器和 `skyline-*.png`。

#### 花冠内部放射状细茎颜色过黑

- **现象**：花芯周围的内部细茎/花丝呈黑色或深棕块，与浅暖白绒毛质感不一致。
- **根因**：问题位于 crown PNG 内部像素颜色，给整个组件加 brightness 会同时改变花芯和外圈绒毛。
- **当时采用的方案**：将修复目标限定为花芯向外的放射状细茎，目标色范围为浅暖白到暖金；不改变深色花芯中心和外部静态花茎。
- **方案结果**：当前素材和检查图作为阶段性检查点；仓库没有单独的像素取样测试证明每条细茎颜色都达到目标范围。
- **引入的新故障**：过度提亮会抹平摄影纹理或让花芯变白。
- **后续修正**：保持 full/loosened/sparse 的中心和颜色基准一致，要求在深墨绿色背景下人工查看。
- **当前状态**：代码没有使用全局 brightness 掩盖；局部颜色是否完全符合参考图，Skyline 未做自动化色差验证。
- **验证方式**：深墨绿色合成检查图；代码检查无法替代像素色彩检查。

#### 呼气旋转与种子飞散需要并行

- **现象**：只启动种子时花冠静止，或只旋转花冠时缺少吹散反馈。
- **根因**：花冠 motion 和 photo-seed 的 `transform` 属于两个独立节点，不能用同一动画覆盖；状态选择器也曾互相停止动画。
- **当时采用的方案**：exhale 同时绑定 `.dandelion-crown-motion` 的 `crownExhaleRotate` 和 `.photo-seeds--exhale .photo-seed` 的飞散关键帧。
- **方案结果**：当前 CSS 明确有两个并行动画，且 `photo-seeds` 不在 crown motion 内。
- **引入的新故障**：loosened/sparse 交叉透明度过高会造成花冠发黑或重影。
- **后续修正**：exhale 采用 `.18 + .82` 的短时交叉，并在 completed 停止 motion。
- **当前状态**：exhale Skyline 截图同时显示旋转中的花冠和散出的种子；没有逐帧同步时间戳记录。
- **验证方式**：`skyline-exhale-final.png`、`skyline-exhale-final-end.png` 及 CSS 选择器。

#### 自动化测试通过但视觉效果仍然错误

- **现象**：呼吸状态机和粒子工具测试通过时，画面仍可能出现偏移、断层或动画未触发。
- **根因**：现有测试主要覆盖 JavaScript 状态、计时和粒子计算，不会加载 WXSS、解码 PNG alpha，也不会采集 Skyline 帧。
- **当时采用的方案**：将代码测试、`node --check`、`git diff --check` 与素材检查图、真实 Skyline 截图分开记录。
- **方案结果**：当前 23 个测试通过只能说明逻辑回归通过，不能推出视觉正确。
- **引入的新故障**：若只看 CI 输出，容易错误地宣称“动画已验证”。
- **后续修正**：README 明确区分代码检查和 Skyline 画面验证，并列出截图文件。
- **当前状态**：代码检查已通过；当前保存的截图支持本次检查点的主要状态，但没有完整自动化视觉验收。
- **验证方式**：三条命令结果 + `assets/dandelion/checks/skyline-*.png`。

### 6. 失败方案与经验

以下做法已在本线程中证明不能作为可靠修复：

- **仅增加 rotate 数值**：错误的旋转对象或支点不会因为角度变大而正确，反而会把整图甩得更远。
- **对整张带花茎 PNG 旋转**：根部、花茎和花冠共享一个 bitmap，任何旋转都会带动根部，无法满足“根部固定”。
- **只调整 `transform-origin`**：origin 只能改变旋转支点，不能从素材中移除花茎，也不能修复错误的 alpha 分层。
- **将动画直接绑定在 Skyline image 节点**：image 同时承担素材、定位、opacity 和 transform 时容易被状态样式覆盖；运动容器更容易隔离职责。
- **用透明度掩盖飞散**：opacity 变化没有空间位移，用户看不到种子从花冠脱离；每颗种子必须同时改变 `translate3d`、旋转和缩放。
- **未检查 alpha 就认为素材已经分层**：肉眼缩略图和文件名无法证明 crown 没有长花茎、stem 没有花冠。
- **只看文件名判断 crown/stem 内容**：命名不等于有效像素职责；必须检查 bbox、连续区域和多背景合成。
- **只运行单元测试就声称视觉验证通过**：测试没有渲染 WXSS、PNG 或 Skyline 帧；最多只能说明 JS 逻辑没有回归。
- **用硬边圆形或扇形遮罩处理素材**：会制造新的扇形缺口、矩形边缘和不自然的透明边界，不能替代重新生成透明素材。
- **full、loosened、sparse 多层高透明度叠加**：同一花芯/花丝被重复绘制会发黑、重影和错位；交叉淡化必须短且总视觉透明度稳定。

### 7. 当前已知问题

当前检查点的已知状态如下，未把风险写成已解决：

- crown 三张 PNG 已完成基本 alpha 检查：画布为 660×825，中央底部没有记录到连续长花茎；但这不是逐像素“所有花茎像素为零”的证明，仍需人工放大复核。
- `stem-static.png` alpha bbox 为 `(291,335,373,824)`，上部 y<250 无有效像素记录，未发现大面积花冠；花冠与花茎连接点仍需按设备尺寸复核。
- 当前 CSS 使用实测 `transform-origin: 55.45% 41.09%`，但没有自动化动画期间的屏幕坐标采样；支点与真实花芯在不同 DPR/设备上的误差仍是风险。
- 已保存的 inhale/hold/exhale Skyline 截图中未观察到花冠被甩到右下角、第二根花茎、黑色矩形或明显扇形断层；这属于有限截图证据，不是全设备保证。
- exhale 代码实现了 60 颗种子和并行花冠旋转，但尚未用脚本对倒计时 7、5、3 秒逐帧统计“同时可见数量”。
- 花冠内部放射状细茎的局部暖白色修复没有色差自动化测试；深墨绿色背景检查仍需人工确认摄影质感。
- 微信开发者工具已确认本次截图使用 Skyline 模式，但没有建立可重复的 CLI 截图流水线；不能把未保存的运行状态声称为已验证。
- `assets/dandelion/checks/` 和 `build_layers.py` 是本地检查产物/辅助脚本，本次提交不纳入生产文件；生产素材和代码提交后需要重新生成检查图复核。

### 8. 正确的后续修复顺序

1. 检查四张 PNG 的 alpha 通道。
2. 真正分离纯花冠和纯花茎。
3. 统一三张 crown 的画布、花芯坐标和边界。
4. 测量花芯真实像素坐标。
5. 让 crown anchor、花芯和旋转支点重合。
6. 确认花茎静止且根部屏幕坐标不变。
7. 再绑定 `inhale`、`hold`、`exhale` 动画。
8. 最后验证种子与花冠动画同时运行。
9. 在 Skyline 中分别截图验证各阶段和倒计时节点。

### 9. 可重复验证清单

#### 素材检查

1. 将四张 PNG 分别放在白色、红色和深墨绿色背景。
2. 检查没有黑色背景、扇形透明缺口、矩形边缘或明显裁切边。
3. 检查 crown 从顶部到最底部外圈绒毛完整，且没有通往画布底部的连续长花茎。
4. 检查 stem 只有花茎和根部，没有大面积圆形花冠。
5. 检查三张 crown 的画布尺寸、花芯中心和连接点一致。

本地检查图（当前未纳入 Git 提交）包括：

```text
assets/dandelion/checks/crown-full-transparent-check.png
assets/dandelion/checks/stem-static-transparent-check.png
assets/dandelion/checks/asset-background-matrix.png
assets/dandelion/checks/layers-white.png
assets/dandelion/checks/layers-red.png
assets/dandelion/checks/layers-deep-green.png
```

#### 状态检查

1. `idle`：只有一朵完整花冠和一根静态花茎。
2. `inhale`：只有花冠单向连续旋转，花芯不绕大圆，花茎和根部不动。
3. `hold`：只有花冠左右摇晃，连续观察至少 4 秒，花茎不动。
4. `exhale`：花冠继续单向旋转，种子同时从花冠边缘飞散。
5. `completed`：主体动画停止，少量残留种子淡出。
6. 呼气倒计时 7、5、3 秒分别截图，检查种子数量、方向和起点。
7. 对比动画前后根部屏幕坐标，确认根部固定。
8. 在 Skyline 模式而不是仅在代码编辑器中检查实际画面。

#### 代码检查命令

```powershell
node --test tests\*.test.js
node --check components/world-visual/index.js
git diff --check
```

当前本次检查结果：23 个测试全部通过（0 失败）；`node --check` 退出码为 0；`git diff --check` 退出码为 0。这三项是代码/文本检查，不替代 Skyline 画面验证。

#### 已保存的 Skyline 证据

```text
assets/dandelion/checks/skyline-inhale-final.png
assets/dandelion/checks/skyline-hold-final.png
assets/dandelion/checks/skyline-hold-final-a.png
assets/dandelion/checks/skyline-hold-final-b.png
assets/dandelion/checks/skyline-exhale-final.png
assets/dandelion/checks/skyline-exhale-final-end.png
```

这些截图支持“本次截图中的 idle/inhale/hold/exhale 画面未观察到主要偏移和重叠故障”，但不构成所有设备、所有倒计时帧的自动化证明。准确结论是：代码已实现，Skyline 画面已在上述截图对应的本地会话中实际检查；未建立完整的可重复 Skyline 自动截图流水线。

## 项目结构




```text
D:\SleepWell
├─ assets/audio/                 本地环境声音（运行时使用 MP3，WAV 为源文件且不打包）
├─ components/world-visual/      8 个世界的公共视觉组件
├─ pages/
│  ├─ breathe/                   呼吸首页
│  ├─ body/                      身体选择与部位呼吸
│  ├─ settings/                  完整设置页
│  ├─ focus/                     一键关灯引导
│  ├─ sound/                     环境声音播放器
│  ├─ journal/                   感恩日记
│  └─ sleep/                     睡眠记录
├─ services/                     本地存储与 FocusModeService
├─ tools/                        音频生成脚本
├─ utils/                        场景、节奏、身体部位常量
├─ app.js / app.json / app.wxss
└─ project.config.json
```

## 在微信开发者工具中运行

1. 打开微信开发者工具，选择「导入项目」。
2. 项目目录选择 `D:\SleepWell`。
3. 仓库中的 `project.config.json` 使用正式 AppID `wx9fe54c8fa871a2de`；确认开发者工具项目详情与对应微信公众平台账号一致。
4. 调试和上传需登录具备该小程序相应权限的微信账号。维护本项目时无需恢复为 `touristappid`；复用为其他小程序时请改为自己的 AppID。上传私钥不放进项目目录或 Git。
5. 编译后首页应直接显示呼吸空间，无需额外点击开始。

本项目不需要执行安装命令，也不需要启动本地服务器。

## 核心验收路径

1. 首次进入首页看到一句话提示；按住后主标题显示「缓缓吸气」，独立倒计时显示「4 秒」，并提示「感受腹部向外扩张」。
2. 检查停留阶段的主标题与「7 秒」倒计时分开显示；进入呼气后主标题显示「呼气」，倒计时显示「8 秒」，辅助提示为「感受腹部慢慢回落」。
3. 呼气结束自动回到「按住开始深呼吸」；呼气期间再次按下会放弃当前轮次并立即开始新的吸气。
4. 完成默认 6 轮：出现可跳过的状态自评，点击进入身体扫描或安静结束。
5. 选择「肩」并点击「把呼吸带到这里」：按住身体光点完成 3 轮 4-7-8 呼吸，出现完成反馈。
5. 首页长按底部「呼吸世界」：选择任一场景，松开确认；身体页继续使用该场景。
6. 打开记录：进入感恩日记和睡眠记录，保存后重新进入确认本地数据仍存在。
7. 打开环境声音：选择声音、播放并设置 15/30/60 分钟定时，声音应渐弱停止。

## 自动测试

```powershell
node --test tests\*.test.js
```

测试覆盖呼吸状态机、误触和中断、目标完成、旧记录兼容、7 天本地汇总、声音定时和渐弱计算。

## 隐私与产品边界

- 首版不采集匿名分析，不接入账号、云同步或通知。
- 呼吸、日记和睡眠记录只保存在本机，可在设置中分别清除记录或恢复默认偏好。
- SleepWell 是日常放松工具，不提供医疗诊断、治疗或保证入睡效果。

## 产品与平台边界

### 一键关灯

微信小程序无权限直接修改 iOS/Android 的灰度、屏幕使用时间或勿扰模式。本项目没有伪造这些权限：`services/focus-mode.js` 当前明确使用 `guide` 模式，仅提供操作引导。未来迁移到原生 App 时，可保留页面接口并替换服务实现。

### 环境声音

仓库内的音频是体积较小的程序化占位环境声，适合 MVP 验收。正式发布前建议替换为拥有明确商用授权、经过无缝循环处理的音频，并控制主包总体积。替换时保留以下文件名即可：

```text
assets/audio/rain.mp3
assets/audio/breeze.mp3
assets/audio/lake.mp3
assets/audio/white.mp3
```

重新生成占位音频：

```powershell
PowerShell -ExecutionPolicy Bypass -File .\tools\generate-sounds.ps1
```

## 本地数据键

```text
sleepwell.settings.v1
sleepwell.sessions.v1
sleepwell.journal.v1
sleepwell.sleep.v1
```

删除微信开发者工具中的本地缓存即可重置全部 MVP 数据。

## 2026-10 按钮与交互优化

- 呼吸世界选择面板改为两列大尺寸按钮，整块按钮区域可点击，支持按压反馈和当前场景标记。
- 点击底部呼吸世界入口即可打开选择面板；点击面板外可关闭，选择场景后自动收起。
- 呼吸世界、呼吸设置弹层移除关闭叉号，点击面板外收起。此分支的记录入口继续打开独立记录页。
- 关灯页面返回按钮固定在顶部左侧，采用清晰的左箭头，保留 48px 点击热区并适配安全区。

重新编译微信开发者工具即可查看。

验证：36 项自动测试通过，修改的 JavaScript 语法检查和 Git 差异空白检查通过。尚需在微信开发者工具与真机确认小屏幕滚动、场景点选及返回按钮实际位置。本次 PR 仅包含按钮优化；月光涟漪动画见 PR #5。

## 2026-10-17 深夜：AI 回答质量修复（实测驱动）

用户反馈「AI 回答质量不高」。直连大赛网关采样复现（探针法：当前 system prompt × 典型用户输入 × 3 次/例），定位三个稳定复现的缺陷并修复：

1. **推荐卡 `@@REC@@` 概率性丢失（3/3 不出）**——用户明说「我想静静睡一觉」，收尾文本完美但标记从不输出，推荐卡不亮。模型对标记触发只有约五成概率（同 prompt 两次采样 3/3 ✓ 与 0/3 ✗ 都出现过），prompt 层无法根治。**修复**：推荐规则改为「每次回复都必须做的二选一」（关键词清单 + 「出现信号就输出，哪怕正文很短」），同时按项目既有安全门架构加**端内确定性兜底**——`buildFallbackRecommendation()`：用户末句命中入睡强信号（想.+睡/晚安/困了/想安静…，剥否定「不想睡」，「睡不着」留给模型判断）而模型漏标时，端内补一张推荐卡（提到室友/吵 → 白噪音，其余雨声）；模型自己出牌时不覆盖。
2. **专家满载滑向分析式追问（3/3 出现）**——选亚隆后回复变成「你怕的是考砸，还是考砸之后某个画面？」式二选一剖析，违背陪伴基调。**修复**：专家/书卡包裹层（registry）新增**用量纪律 + 提问纪律**——先接住情绪再轻轻带一个框架概念（一两句），禁止二选一提问、禁止追问根源、禁止让用户自我分析，长度仍守 60-150 字；附节奏示例（接住→一句视角→轻邀请）。示例域特意避开考试场景以防逐字照抄（初版示例确实被 3/3 照抄开头）。
3. **满载回复变薄 + 多余空行**——专家+书卡 7000 字 prompt 下回复缩到 30 字、句间插空行。**修复**：用量纪律带长度锚点；对话规则新增「输出连贯段落，不插空行」；二选一禁令同时进基础规则（基础模式也有此毛病，非专家模式特有）。

修复后复测：REC 3/3 ✓；亚隆满载 3/3 干净（接住具体→一句视角→一个开放邀请）；阿德勒+CBT-I 从 30 字薄回复变为 130 字双框架自然运用；危机协议不受影响（依旧优秀）。

## 2026-10-17 深夜：书卡选择 UI 接线（「到应用中」最后一块）

三份蒸馏记忆体（阿德勒专家卡、蛤蟆先生书卡、CBT-I 书卡）此前只有专家有选择入口，书卡注册表 `list()` 就绪但无 UI。本次按专家同构接线：

- 对话页右侧抽屉新增「书卡」区：不带书（默认）+ 两张书卡（徽记/一句话/来源档案可展开/「当前」标记），选中后输入框上方出书卡胶囊，点按取消；书卡开场白（各 3 条，已补进源卡 frontmatter 并重跑 `tools/build-books.js`）。
- 专家与书卡是**两个独立维度**（专家定「谁陪你」，书卡定「带哪本方法」），可同时生效，注入顺序 persona→expert→book→context 由 agent-client 保证；新对话不清空选择。
- 新增 `utils/agent-icons` 的 `emblemBook`（摊开的书 + 星屑，内联 SVG 零包体成本）。

验证：`node --test tests/*.test.js` **346/346 通过**（新增 12 项：兜底关键词/否定/白噪音分流/模型牌优先/书卡选择/清空/开场白/新对话保持）；`tools/pack-budget.js` 主包 **1971.6KB / 2048KB ✓**（余量 76.4KB，比此前 184KB 收窄——首页资产增长所致，后续加素材需先查预算）。方案与实测记录见 `docs/agent-quality-fix-20261017.md`。

**遗留**：night-settings 设置页仍无专家/书卡分组（对话抽屉已可完整操作）；首页 counselors 页的 `nightcat.counselor` 选择体系与专家/书卡注册表尚未打通（两套选择语义不同，待产品决策）。

## 2026-10-17 深夜：对话现场持久化 + 转场丝滑化

### Agent 能力：对话不再「一进就忘」

- 新增 `services/agent-chat-store.js`（键 `sleepwell.agent.chat.v1`）：把当前对话消息存本地，重进对话页/重启小程序时**原样恢复**（最多 40 条），而不是只剩一句摘要开场。模型也因此拿到完整上下文，连续性明显提升。
- 入档清洗（白名单）：技能确认卡/订阅授权卡不入档（恢复后再点会错位）、流式未完成气泡不入档、未作答的选项提问摘除；`push` 卡、已作答选项、赞踩反馈、求助面板卡保留。
- **12 小时新鲜窗口**：跨天自动失效，睡前场景自然开新篇；「新对话」主动清档；「清除聊天记忆」（night-memory 页）与「清除个人记录」都会连带清掉对话现场。
- 持久化时机：一轮回复完成、技能回执、到点补发、选项作答、安全轮、关闭对话、切后台——存储写入失败全部静默，不影响对话。
- 恢复时 `answers` 按历史用户轮数预填：消息 id（`user-${answers.length}`）不与恢复的历史撞车。

### 转场丝滑：夜喵入口全面 navigateTo 化

- 旧注释「agent 是应用入口页需 reLaunch」已失效（全局首页 = pages/home 后 agent 只是普通对话页）。首页输入框、咨询师卡、呼吸页页头夜喵全部改 **navigateTo**：来源页实例保留在栈里，agent 顶部返回 = `navigateBack` 原地回来，**零重建**（此前每次回首页都要 skyline 重新初始化 1.5-2s）。
- agent 的 `goHome`：栈里有上一页就 navigateBack（回哪来回哪去），分享直达等栈空场景 reLaunch 首页兜底。
- 对话页 `.chat-screen` 已有 screen-in 入场动画；恢复历史时 scroll-into-view 直落底部。

### 验证

- `node --test tests/*.test.js`：**372 通过 / 0 失败**（+9：存档清洗/40 条上限/12h 过期/清档联动/恢复/answers 预填/closeChat 落档/新对话清档/goHome 分流；world-integration 改断言 navigateTo 语义）。另有 6 个 todo 占位（并行安全词料库批次的已知误报记录，非失败）。
- `tools/pack-budget.js`：主包 1998.1KB / 2048KB ✓——**余量只剩 49.9KB**（本批 +26KB 与并行语音批次的增长叠加），加素材前必须先跑预算。
- 注意：本批与并行会话（voice-service / safety-corpus，方案 E 语音实装）同仓施工，合并时注意 `services/` 与 `tests/` 的交叉改动。
