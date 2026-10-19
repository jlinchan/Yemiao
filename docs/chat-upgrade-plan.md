# 夜喵对话页升级规划（2026-10-14）

## 0. 目标

首页冻结（用户决定：练习卡折叠后不再改）。本轮聚焦对话页：

1. **「+」面板**：输入条左侧加号，展开三块：咨询师能力（专家卡）、助眠练习（技能）、助眠声（快捷播放）。
2. **独特 SVG 功能图标**：对话页全部功能图标改为夜喵专属内联 SVG（24 视框、1.6 圆头描边、星屑细节），与消息操作图标同一语言。
3. **独特发送**：发送/停止从圆形改为金色方圆角（squircle），配定制箭头图标；面板入口「+」展开时旋转成「×」。

## 1. 「+」面板规格

- 位置：输入条内左侧（`[＋][输入][发送]`）；面板在输入条**下方**展开（与键盘同位，微信习惯），输入条随之上移。
- 动效：`max-height 0 → 内容高` + 透明度 + 内容 `translateY(14rpx) → 0`，320ms `--ease-out`；「+」旋转 45° 260ms。
- 收起时机：再点「+」/ 输入框聚焦 / 发送 / 选完专家或技能 / 关闭对话。
- 板块（顺序）：
  1. **咨询师能力**：横向专家卡（夜喵本体 + `experts/registry.list()`），选中金边高亮；选中后卡下列出该专家 starters，点 starter 填入输入框；输入条上方出现「亚隆视角 · 点按切回」胶囊。
  2. **助眠练习**（技能，`skillPermissions !== 'off'` 才显示）：星夜慢行（bedtime_guide night）、身体扫描（bedtime_guide body）、取回心事（park_thoughts recall）、停止播放（stop_sound）。
  3. **助眠声**：雨声 / 微风 / 湖水 / 白噪音（play_sound ×30 分钟）。
- 手动点按 = 明确意图：直接 `skillRegistry.executeNow`（不再确认）；结果走既有技能反馈气泡（含订阅授权卡与引导 followups）。
- 专家切换：`nightPreferences.save({ expert })`；反馈气泡「已切换到「欧文·亚隆 · 存在主义视角」…」/「已切回夜喵本体的陪伴。」；`''` = 夜喵本体。
- 注入链路不变：`agentClient.chat({ expert: expertRegistry.buildActivePrompt() })`。

## 2. 图标系统（utils/agent-icons.js 扩展）

- 新增：`plus`、`back`、`tune`（日轮齿轮）、`sendInk` / `sendMuted`、`emblemStar`（夜喵：月牙+星）、`emblemRipple`（亚隆：涟漪）、`guideNight`、`guideBody`（扫描线）、`recall`（回环箭头）、`pause`、`rain`、`breeze`、`lake`、`noise`（频谱柱）。
- 色彩：`MUTED #8a9b9b` / `GOLD #e8c887` / `RED #c98a8a` / `INK #24312c`（发送箭头深墨）。
- 形式：data-URI 内联，无新增包内文件；既有 like/dislike/copy/regenerate/stop 不动。
- 对话页头部返回、设置按钮由 PNG 换成内联 SVG（首页不动）。

## 3. 发送按钮

- `.chat-send` / `.chat-stop`：圆形 → 圆角方形（88rpx，radius 28rpx），保留金色渐变 + 内高光 + spring 按压。
- 发送图标：`sendInk`（箭头 + 星屑尾迹）；禁用态换 `sendMuted` + 现灰底。

## 4. 校验

- 单测 `tests/agent-panel.test.js`：面板初始态、开关、专家选择持久化 + 气泡、切回夜本体、快捷技能执行 + 收起、off 技能过滤。
- `verify-nightcat.js`：门禁后新增 —— 开面板（板块数、专家 ≥2、技能 4、声音 4、触控 ≥43.9px、面板贴底、流区不挤没）→ 点「雨声」（气泡含「雨声」、面板收起）→ 切「亚隆」（`localStorage` expert=yalom、胶囊出现）→ 点胶囊切回（expert 清空）。截图 `preview-chat-panel.png`、`preview-chat-expert.png`。
- 预览器 `app` 桩补 `playSound/pauseSound`，让声音技能在预览里真实成功。

## 5. 风险

- 320×640 下 面板 + 头部 + 输入条可能挤压流区 → 面板内容高度受控（≈700rpx），校验断言流区 > 40px。
- 专家卡横向滚动：预览器用 `overflow-x: auto` 兜底；真机走 scroll-view。
- 面板与键盘不同时出现：开面板必先 `hideKeyboard`；输入框聚焦必收面板。

## 6. 执行状态（2026-10-14 完成）

- **图标与发送**：`utils/agent-icons.js` 新增 15 枚内联 SVG（plus/back/tune/emblem/send/quick 系）；`.chat-send/.chat-stop` 改 88rpx 方圆角（radius 28rpx）；面板入口「+」展开旋转 45°。对话页头部返回/设置 PNG → SVG。
- **面板**：实现与 §1 一致；四处细节落定 —— ①专家确认气泡文案取 label：`好，接下来我会带着「亚隆」的视角陪你。`；②切回文案 `好，切回夜喵本体的陪伴。`；③快速动作直执后必收面板并震动；④专家 starters 面板内以虚线芯片列出，点按填草稿并聚焦输入框。
- **预览保真修复**：`.chat-input/.chat-gate-input` 显式 `background: transparent`（真机默认透明，预览器 HTML input 默认白底 + 描边会污染截图）；预览器全局重置补 `input,textarea{border:0;background:transparent}`（需重启预览服务进程生效）。
- **校验结果**：`node --test` 126/126（含 `tests/agent-panel.test.js` 7 例）；`verify-nightcat` 320/375/430 全绿 —— 面板 3 板块 / 2 专家卡 / 4 技能 / 4 声音、全部触控 ≥43.9px、面板贴底 812、流区剩 208.7px；点「雨声」真实播放出「已为你播放雨声 · 30 分钟定时」并收纳面板；选亚隆后 `sleepwell.night.preferences.v1.expert=yalom` 落盘、胶囊出现、3 枚 starters 可填草稿；点胶囊切回、偏好清空。截图：`preview-chat-panel.png`、`preview-chat-expert.png`、`preview-chat-send-ready.png`（金色发送激活态）。
- **遗留接线（批次 2 后续）**：专家卡 `sources` 字段一旦由 `tools/build-experts.js` 产出（专家团来源档案硬标准），面板专家卡需补「来源档案」展示入口。
- 未提交：与仓库内并行未提交改动共存，待用户经微信开发者工具走查后一并处理。

## 7. 修订 v2：面板瘦身 + 右侧抽屉（2026-10-14 二轮）

用户反馈「+ 面板太过臃肿」→ 面板只留即时直执，详细/有状态功能迁移到右侧抽屉，安眠曲先占位。

- **「+」面板瘦身**：三板块 → 两板块（助眠练习 / 助眠声），芯片由等宽网格改自适应胶囊单行排布（`flex-wrap` 兜底 320px）；专家卡移出面板。面板高 208px（原 ≈420px），校验加 `height ≤ 240` 防回胖守卫 + 断言面板内专家卡为 0。
- **右侧抽屉（`chat-more`「…」入口）**：宽 `min(76%, 620rpx)`，贴右全高，遮罩 + 滑入 300ms；内容三节：
  1. **咨询师能力**：竖向详版专家行（徽记 / 名称 / 头衔 / 两行简介），夜喵本体在内；选中后下方展开 starters（全宽左对齐芯片）；点按选中即收起抽屉 + 胶囊 + 气泡。
  2. **工具**：新对话（`startNewSession`：摘要旧对话→重置为单条问候，保留专家视角）、对话设置（跳 `night-settings`，取代头部原设置钮）。
  3. **安眠曲占位**：摇篮曲 / 夜航钢琴 / 森林低语，虚线行 +「即将上线」徽标，点按 toast「正在调音，很快上线」，不假装播放。
- **互斥**：面板与抽屉互斥；输入聚焦 / 发送 / 开面板 / 关对话 / 选专家 / 选 starter 均收抽屉。
- **新图标**：`dots`、`close`、`newChat`（气泡+加号）、`lullaby`（八分音符+星）。
- **校验**：`node --test` 140/140（`agent-panel` 增抽屉互斥 / 新对话保留专家 / 占位 toast，harness 补 showToast 捕获）；`verify-nightcat` 面板断言更新 + 新增抽屉块：2 专家行 / 2 工具行 / 3 安眠曲 / 3 徽标、触控 ≥43.9px、贴右（right=375）全高、宽 285<320、点安眠曲 toast 含「很快上线」且抽屉不关、新对话后 user=0/agent=1、亚隆选中落盘、× 与遮罩两种收起全部通过；截图 `preview-chat-drawer.png`、`preview-chat-drawer-starters.png` 新增；修复：starter 芯片基础样式随面板瘦身一并迁移到 `.drawer .starter-*`（否则只剩 min-height，边框/底色丢失）。预览器 `wx.showToast` 桩改为记录 `window.lastToast`（需重启预览服务）。
- **仍未提交**：同上，与仓库内并行未提交改动共存。

## 8. 修订 v3：抽屉精修 + 未来板块入口（2026-10-14 三轮）

- **抽屉精修**：头部加副标题「视角 · 内容 · 工具」；关闭钮改环形描边圆钮；抽屉底叠右上径向金光；正文开合时 340ms 上浮入场（`drawer-rise`）；激活专家行右端加「当前」胶囊标记（随选中切换）。
- **板块重排**：咨询师能力 → 安眠曲 → 深夜频道 → 工具（工具类动作沉底，内容板块聚拢，抽屉读起来更顺）。
- **深夜频道（未来板块入口）**：听书（夜航书架 · 睡前伴读）/ 电台（深夜人声 · 陪你入眠），行内「搭建中」徽标 + 右向箭头提示「将可跳转」；点按 toast「X板块正在搭建，很快见面」，不假跳转；页面建成后把 `navigateTo` 接进 `tapChannel` 即可，入口无需再动。
- **新图标**：`listen`（耳机）、`radio`（话筒）、`chevron`（右向箭头 + 星屑）。
- **校验**：`node --test` 150/150（新增 `tapChannel` toast 用例、channels 数据断言）；`verify-nightcat` 抽屉断言扩到 channels=2 / chevrons=2 / 「当前」标记=1，频道点按 toast 含「搭建」且抽屉保持展开；截图 `preview-chat-drawer.png`、`preview-chat-drawer-starters.png` 复查通过。
- **顺带同步**：`tests/storage-helpers.test.js` 期望列表补 `KEYS.agentReviews`——并行改动（对话评价）已把该键写进 `clearPersonalRecords` 但测试未同步，导致全量套件 1 例红；补齐后全绿（非本轮 UI 工作）。
- **仍未提交**：同上。

## 9. 修订 v4：对话页流体优化——流式路径更新 + 动效去重绘 + 反馈手感（2026-10-14 四轮）

- **流式渲染改数据路径**：`flushAgentText` 由「整张 messages 重传」改为只发 `messages[i].text`（每帧仅增量文本过桥，渲染层不再回传整表）；节流 80ms→33ms（约 30fps 流体节奏）；定时器到点回读 `latestStreamText`（不再渲染旧帧文本）；`onComplete` 终稿并入当次收尾 setData（每轮少一次整表），用户停止同路径一次收尾。
- **动效去重绘（合成层内完成）**：输入条去掉 `backdrop-filter`（改 .96 近实心底，滚动优先）；发送涟漪与停止呼吸环改为「伪元素静态 box-shadow + 只动 transform/opacity」，生成期间不再逐帧重绘阴影；消息入场 `rise-in` 补 `scale(.985)` 云感微缩放；顶栏返回/更多按钮弹性按压（spring 回弹 + 淡金底）。
- **修复**：开场问候气泡常驻闪烁光标（`intro` 补 `done: true`，此前 verify 载荷可见 `什么让你难以放松？▍`）。
- **测试基建**：新增 `tests/page-set-data.js`（与小程序一致的 `messages[3].text` 数据路径语义）；5 个页面 harness 接入；`agent-ui` 新增用例断言流式只发路径、不发整表；预览器 `page.setData` 同步支持数据路径（改动后需重启预览服务）。同步说明：`agent-ui` 中 4 处 `find(role===\"agent\" && item.done)` 选择器补 `item.id !== \"intro\"`，恢复其「首条已完成的回复」原义（intro 现在也 done）。
- **校验**：`node --test` 169/169；`verify-nightcat` 全绿（Conversation 载荷确认 intro 无 ▍；Home/Panel/Drawer/Expert/Keyboard/二级页全过）；截图 `preview-chat.png`、`preview-chat-send-ready.png` 复查通过。
- **仍未提交**：同上；本轮未触碰并行会话的未提交改动。

## 10. 修订 v5：图标族/发送按钮精修 + 面板状态回显 + 来源档案补线（2026-10-16 五轮）

- **图标族精修**（`utils/agent-icons.js`）：`sendArrow` 加双星屑尾迹（主箭头 + 两枚错位星点，发送按钮更有夜航感）；`dots` 三点半径差异化（1.35/1.6/1.85，打字指示不再呆板）；`copy` 补折页细节；`regenerate` 星点重新定位。
- **发送按钮**：激活态 `is-ready` 播放 `send-pop`（0.8→1.07→1 回弹，340ms spring）——首次可发送时按钮「醒过来」；按压 `is-send-pressed` 缩到 0.86。
- **面板芯片 v2（图标收进金描边圆井）**：`.chip-icon` 36rpx 金描边圆井 + 24rpx 图标；芯片同步收紧（padding 10rpx、gap 8rpx、image 24rpx）。调参有据：首版 46rpx 圆井使技能芯片 92px → 4 枚换行 → 面板 258px 触发 ≤240 防回胖守卫；实测标签精确 46px（11.5px × 4 字），收紧后芯片 80px、行右缘 354 ≤ 359（375px 视口余 5px），面板回到 208px 单行。
- **播放态回显**：`syncSoundState()` 读 `app.globalData.audioState`，在 `onShow` 与每次技能落定（`appendSkillOutcome` / `confirmSkill`）后刷新——播放中的声音芯片亮金（`is-playing` + 金点 `live-pulse`）、板块提示改「X 播放中」、「停止播放」芯片亮金（`is-live`）。
- **来源档案补线（补齐硬标准遗留）**：专家卡 `sources`（亚隆 26 项）此前从未上屏，违反「UI 须展示来源档案」硬标准；抽屉专家卡新增档案行「来源档案 · N 项」+ 折角指示，`catchtap` 开合（阻断冒泡，不误触专家选择），展开列虚拟清单，与选中态互相独立。
- **面板入场 stagger**：`panel-inner` 子块 `panel-rise` 300ms，按 40/80/120ms 级联上浮；消息操作栏按压反馈补 `is-act-pressed` 淡底。
- **校验**：`node --test` 217/217（`agent-panel` 新增 2 例：播放态镜像全局音频、来源档案开合独立于选择；harness 补 `getApp` 桩）；`verify-nightcat` 全绿收尾——Panel 高 208 ≤ 240、技能 4 枚单行；播放态断言（`is-playing`=1、金点=1、提示含「播放中」、停止芯片 `is-live`=1）；来源档案展开 ≥20 行、抽屉保持、二次点按收起；专家选择改点名称（卡片底部档案行 `catchtap` 吞冒泡，整卡中心点按不再可靠）；`drawerTaps` 触控检查补 `.expert-source`。**并行同步披露**：①抽屉专家行 2→3（并行会话新增森田卡，随 `experts/cards.js` 同步）；②引擎端口回执校验块为并行会话新增，本次仅在其运行受阻时做了最小修复——页面引导改显式 `browser.newContext()`（`browser.newPage()` 的隐式 context 在本运行时不可再开页，且同 context 才能共享端口存储）；③harness 韧性：首个 `page.goto` 放宽 20s、默认等待 5s→10s（本机并发/扫描致截图与首载偶发超时；断言内容未变）；④预览器 `nightcat-preview.js` 的 clientRuntime 在服务启动时固化，并行改动（textarea 渲染支持）需重启服务才生效。新截图 `preview-chat-panel-playing.png`、`preview-chat-drawer-sources.png`、`preview-chat-handoff.png`（并行块）；`preview-chat-panel.png`、`preview-chat-drawer.png` 复查。修复：播放态截图原先未等 stagger 动画落定、来源档案截图未等 220ms 淡入，均补等待后重截。
- **仍未提交**：同上；未触碰并行会话未提交改动。

## 11. 走查前置审计 + 场景修复（2026-10-16，DevTools 走查前）

- **补齐 `pages/night-messages/index.json`**：该页自绘 `.ns-top` 顶栏，却缺页面配置——DevTools/真机会在自绘顶栏上方再叠一条系统导航栏（消息页是对话页头部入口，走查会直接看到）。补 `navigationStyle: custom` + `backgroundColor: #061719`（与 night-memory 同款）。已核实预览器全程不读页面 json（`nightcat-preview.js` 无 `.json` 引用、不模拟 navigationStyle），该文件只影响 DevTools/真机，不影响既有校验链路。
- **静态审计全部通过**：`app.json` 14 页 js/wxml/json 齐全；`utils/agent-icons.js` 29 枚 SVG data-URI 全部可解码，wxml 18 处字面引用 + `icons[item.icon]` 数据驱动引用全部命中；topic 网格 PNG 图标全部存在；WXSS 无 `:has()`/`aspect-ratio`/`@container` 等高风险语法（`max()/grid/backdrop-filter/gap` 为项目既有通行模式，基础库 3.5.6 支持）；`project.config.json` es6/postcss 编译开。
- **校验**：`node --test` 220/220（本轮收尾快照 217/217 之后并入并行会话的 agent-port 新用例，复跑全绿）；全量 `verify-nightcat` 当前组合树 18:56 全绿（并行会话在并入 focus 端口段后自跑，Home 320 composer 精确贴 nav）；当晚 18:54 有一次 home-320 composer 底缘超 nav 顶 7.6px 瞬态失败（无对应代码改动、下一次运行恢复，与此前观察到的 composer 瞬态同类）。
- **仍未提交**：同上；未触碰并行会话未提交改动。
