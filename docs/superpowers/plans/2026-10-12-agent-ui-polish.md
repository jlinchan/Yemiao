# 夜喵 Agent 界面精修：对话基础能力 + 专属 SVG 图标 + 丝滑动效

日期：2026-10-12（第二轮精修）
状态：执行中

## 目标

把 agent 对话界面从「能用」提升到「精致」：补齐主流 AI 对话产品的基础交互（赞/踩/复制/重新生成/停止生成），换上为夜喵定制的 SVG 图标体系，加入克制丝滑的动效。

## 一、对话基础能力

| 能力 | 位置 | 行为 |
| --- | --- | --- |
| 复制 | 每条消息 | wx.setClipboardData，系统 toast 确认 |
| 赞 / 踩 | 每条夜喵回复 | 互斥切换；点赞金色点亮、点踩暗红；聚合计数写入 storage（agentFeedback），纳入清除个人记录 |
| 重新生成 | 最后一条夜喵回复 | 清空该气泡重跑上一轮（复用 lastTurn，不重复用户消息） |
| 停止生成 | 输入行（发送键位置） | 流式期间显示停止键；中断后保留已流出文本，状态回 idle 而非报错 |
| 完成态动作行 | 夜喵气泡下方 | 回复完成后淡入一排幽灵图标按钮 |

## 二、专属 SVG 图标（utils/agent-icons.js）

- 采用 `data:image/svg+xml;charset=utf-8,` + encodeURIComponent 内联，避免包内文件与格式兼容风险，源码可读可改
- 设计语言：24 视框、1.6 描边、圆头圆角、每枚带一点「星屑」细节（呼应星穹主题），与现有 PNG 线性图标区分
- 清单：like / like-active / dislike / dislike-active / copy / regenerate / stop（金）
- 状态色：默认 #8a9b9b，激活金 #e8c887，点踩 #c98a8a

## 三、动效（纯 WXSS，克制为先）

1. 消息入场：opacity 0→1 + translateY(12rpx)→0，240ms，cubic-bezier(.22,.61,.36,1)
2. 动作行：延迟 60ms 淡入 180ms
3. 推荐卡片：scale(.98)→1 + 淡入 260ms
4. 等待态：单点脉冲改为三点波浪（stagger 120ms）
5. 按钮触感：hover-class + transition transform scale(.96) 120ms
6. 停止键：微弱呼吸环

## 四、验证码接入

- secrets 增加 verificationCode: '123456'
- agent-client 请求头附带 X-Verification-Code（网关当前忽略则无副作用，开始校验即生效）
- 待用户确认校验码的真实出现位置后，如需改字段名一处即可切换

## 五、测试

- 赞踩互斥与聚合计数、复制调用、重新生成不重复消息、停止保留部分文本
- storage-helpers 清除清单同步更新
- 全量 node --test 回归
