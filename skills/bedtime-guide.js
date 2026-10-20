// 技能：入睡引导。正文只留一句接手的话，真正的内容在 pages/guide 全屏页里逐段展开；
// 走完后页面把回执写进 globalData，对话页 onShow 时补一条收尾。
const { SCRIPTS } = require('../utils/sleep-guide');

module.exports = {
  name: 'bedtime_guide',
  label: '入睡引导',
  prompt: [
    'bedtime_guide：用户说睡不着、想让你带着入睡、想要一段引导时调用。',
    '参数：{"skill":"bedtime_guide","args":{"script":"night"}}',
    'script 只能取 night（星夜慢行）或 body（身体扫描），犹豫时用 night。',
    '调用后正文只写一句很短的开场，引导内容会在全屏引导页里逐段展开，不要自己背引导词句。'
  ].join('\n'),
  needsResult: false,
  writes: [],
  // 可用性边界（2026-10-18 调整）：面板点按 = 明确意图，任何时段都直接打开全屏引导页，
  // 不再限制只在夜里开放——此前白天点按只回一句文本，功能等于摆设。
  execute(args) {
    const key = SCRIPTS[args && args.script] ? args.script : 'night';
    const script = SCRIPTS[key];
    return {
      ok: true,
      message: `好，我来带你走一段「${script.title}」。跟着这一页慢慢来。`,
      action: { type: 'guide', script: key, title: script.title }
    };
  }
};
