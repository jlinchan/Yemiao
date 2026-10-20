# 夜喵 · 全局返回键设计规范 v1

> 2026-10-18 统一收敛。规范样式唯一来源：`styles/nav-back.wxss`（由 `app.wxss` 全局引入，页面无需重复 import）。

## 一、收敛前的差异（审查结论）

| 页面 | 旧实现 | 图标 | 触控区 | 底色 | 按压反馈 | 问题 |
|---|---|---|---|---|---|---|
| 陪伴者 counselors | `.directory-back` | PNG 窄箭头（18×32rpx） | 44px | 透明 | 仅 opacity .72 | 图标语言与全站不一致 |
| 书中技能 skills | `.skills-back` | 文本字形「‹」（56rpx） | 两套规则冲突（44px vs 54×64rpx） | 透明 | 仅 opacity .72 | 字形渲染不稳定、尺寸规则打架 |
| 书中对话 skill-detail / 今晚的话题 topic | `.icon-button--back` + CSS 画箭头 | CSS border 绘制 | 44px | 白玻璃圆 | **无 hover-class，无按压反馈** | 反馈缺失 |
| 夜喵对话 agent | `.chat-back` | SVG 线性 chevron | 88rpx | 夜色玻璃 + 金线描边 | scale(.86) 弹簧回弹 | ✓ 最完整，定为基准 |
| night 设置/消息/记忆 | `.ns-back` | arrow-left-muted.png | 44px | 透明 | opacity+scale（settings 漏配 hover-class） | 图标另一套；left=16px 与他页不一致；night-memory 选择器 `.ns-page .ns-back` 与根类 `nm-page` 不匹配，实际未生效 |

## 二、统一规范

**结构（唯一写法）**

```xml
<button class="nav-back" hover-class="is-pressed" bindtap="goBack" aria-label="返回…">
  <image class="nav-back-icon" src="/assets/agent/icons/chevron-right-muted.png" mode="aspectFit"/>
</button>
```

- **触控区**：44×44px（`max(88rpx, 44px)`）圆形，满足最小触控标准。
- **图标**：统一复用 `chevron-right-muted.png`，CSS `rotate(180deg)` 成左箭头，40rpx 显示 + 暖金微光（drop-shadow），与 `agent-icons` 线性描边同语言。单一资产、单一方向变换，不再各页自备箭头。
- **底**：夜色玻璃渐变 `rgba(20,44,46,.78)→rgba(8,24,26,.62)` + 金线 hairline 描边 `rgba(232,200,135,.22)` + 内高光 + 投影。
- **按压**（`hover-class="is-pressed"`，必配）：`scale(.88)` + 金边加深 + 轻微提亮，弹簧曲线回弹 260ms。
- **位置**：规范不锚定位置，由容器决定——
  - topbar 页（日记/设置/睡眠记录/声音/身体扫描/引导等）：`app.wxss` 的 `.topbar .nav-back`，`left:8px; bottom:8px`；
  - 头图页（陪伴者/书中技能）：页面规则 `absolute; left:8px; top:50%; translateY(-50%)`，标题行 `padding-left: max(60px, 120rpx)` 预留；
  - 夜页（night-settings/messages/memory）：`night-settings` 的 `.ns-top .nav-back`，`left:8px; bottom:4px`（三页共用）；
  - agent 对话页：flex 三段布局左位（88rpx 固定占位，标题恒居中）。
- **返回逻辑**：统一 `navigation.backOrHome()`（栈空 reLaunch 回首页兜底）；agent 页例外使用 `closeChat`（含对话摘要持久化与状态清理），落点一致。

**已迁移页面**：counselors、skills、skill-detail、topic、agent、night-settings、night-messages、night-memory、journal、settings、sleep、sound、body、body/part、guide（共 15 处）。

**唯一例外**：`pages/focus`（呼吸进行中的沉浸页）保留其定制的弱存在感返回键，不套玻璃圆钮规范。

**验收脚本**：`tools/verify-nightcat.js` 的选择器已同步（`.ns-back`/`.icon-button--back` → `.nav-back`）。

## 三、新增/变更文件清单

- 新增 `styles/nav-back.wxss`
- `app.wxss`：引入规范；`.topbar .nav-back` 锚定；删除 `.icon-button--back`/`.back-arrow`
- `styles/night-theme.wxss`：删除旧 44px 兜底规则
- `utils/agent-icons.js`：`back` 指向统一资产
- `data/counselor-directory.js`：`assets.back` 指向统一资产
- 各页面 wxml/wxss：按上表迁移；删除孤儿规则（sleep、guide、night-messages、night-memory）
