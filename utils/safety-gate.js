// 夜喵危机安全硬门：输入与流式输出的确定性兜底，不依赖模型自觉。
// 设计依据：.workbuddy/reports/夜喵Agent方向调研-2026-10-16.html 方案 A。
// 「高压 vs 高危」判别与硬触发思路借鉴 infometa 风险识别与转介 skill（机制借鉴，
// 词表按校园睡前场景自建）；S3 危机表达分类参考 chatopera/efaqa-corpus-zh（仅作设计参照）。

const { SAFETY_REGIONS } = require('./safety-hotlines');
//
// 三级判定：
// - critical：死亡意愿 / 自伤方法 / 强烈死亡联结 / 涉他危险 —— 命中后不绕过大模型，
//   由 criticalDirective() 把强指令注入本轮 context，让模型自然接住并以 @@SAFE@@ 收尾；
//   模型漏标时端内兜底落卡（宁可误报，不可漏报）。
// - elevated：高压情绪但无行动指向 —— 不打断对话，向 system prompt 注入安全提示段。
// - normal：正常对话。
//
// 已知局限（README 有记录）：数字谐音（17了 等）未覆盖；全拼任意位置匹配会撞英文单词
// （如 shale=杀了）、紫砂=zisha；归一化匹配可能产生「不想 活动被取消」类误报
// ——安全回复为柔和的求助指引，误报代价可控，原则是宁滥勿缺。

// 高危词表（critical）。命中任意一个即触发硬门。
const CRITICAL_TERMS = [
  // 死亡意愿的直接表达
  '想死', '不想活', '活不下去', '寻死', '轻生', '自杀', '去死', '了结自己', '了结一切',
  '结束生命', '结束这一切', '一了百了', '离开这个世界', '告别这个世界', '解脱',
  // 自贬与死亡联结
  '没有我会更好', '我消失了就好', '我死了就好', '死掉算了', '死了算了', '我死了',
  '想从这个世界上消失',
  // 绝望与无意义感（SOS-1K 高危帖高频：低唤醒、无行动词的慢性绝望，由语料回归守住）
  '没盼头', '没有盼头', '活着没意思', '活着好没意思',
  // 自伤的方法与计划
  '自残', '自伤', '割腕', '割手', '割自己', '划自己', '用刀划', '跳楼', '跳桥', '跳河',
  '从楼上跳', '跳下去', '上吊', '勒死自己', '吞药', '吞安眠药', '吃安眠药自杀',
  '烧炭', '开煤气', '站在天台', '站在楼顶', '在天台上', '在楼顶', '拿刀对着自己',
  '囤了好多药', '买了好多药', '买了很多药',
  // 遗书与临终安排（细粒度标注里的「计划与紧迫度」信号）
  '遗书', '告别信', '不会再醒', '永远睡', '睡个很长', '长眠', '最后一晚',
  // 相约轻生（SOS-1K 校准暴露的最大缺口：树洞语境的邀约句式，占留出集漏报近半）
  '约死', '一起死', '死一死', '约炭', '割一刀',
  // 涉他危险
  '杀人', '杀了', '杀死', '掐死', '捅死', '拿刀捅', '报复社会', '拉人垫背', '同归于尽'
];

// 高压情绪词表（elevated）。无行动指向，不拦对话，只提示模型更谨慎。
const ELEVATED_TERMS = [
  '崩溃', '撑不住', '撑不下去', '受不了', '熬不住', '熬不下去', '好绝望', '绝望',
  '活着好难', '活着好累', '做人好累', '没人在乎', '没人管我', '孤立无援',
  '想消失', '想逃', '喘不上气', '绷不住', '想哭', '生无可恋', '心里堵', 'emo'
];

// 去掉空白与常见干扰符号，防御「想*死」「不,想,活」「自——杀」类分隔变体。
const NOISE_PATTERN = /[\s\u200b-\u200d\ufeff*~\-—–_·•.,，。!！?？;；:：'"'『』「」`（）()【】\[\]{}<>《》|\\/@#￥$%^&+=]/g;

function normalize(text) {
  return String(text || '').toLowerCase().replace(NOISE_PATTERN, '');
}

// 拼音与字母缩写变体：中文用户避讳直书时常用全拼、声母缩写或中英混写（zisha / zs /
// wobuxianghuole / 自s / s了）。from 仅用于 matched 报告可读。两档匹配策略：
// - 全拼（term.length >= 4）：任意位置命中，连续拼音不打断也能抓到（wobuxianghuole）；
//   代价是可能撞上英文单词或紫砂=zisha 这类同形词，宁滥勿缺原则下接受。
// - 声母缩写（<4 字符）：要求字母边界（命中前后不是 a-z），防止 settle 撞 tl、
//   英文长串内嵌误伤；标准拼音音节不以 z/x/t/g/w/b/c/s 收尾，缩写不会在连续拼音
//   中自然产生，边界不损失避讳写法的检出率。
const PINYIN_TERMS = [
  // 死亡意愿
  { term: 'zisha', from: '自杀' }, { term: 'zs', from: '自杀' },
  { term: 'xiangsi', from: '想死' }, { term: 'xs', from: '想死' },
  { term: 'buxianghuo', from: '不想活' }, { term: 'buxianghuole', from: '不想活了' }, { term: 'bxh', from: '不想活' },
  { term: 'huobuxiaqu', from: '活不下去' }, { term: 'xunsi', from: '寻死' },
  { term: 'qingsheng', from: '轻生' }, { term: 'qusi', from: '去死' }, { term: 'jietuo', from: '解脱' },
  { term: 'liaojieziji', from: '了结自己' }, { term: 'jieshushengming', from: '结束生命' },
  { term: 'yiliaobailiao', from: '一了百了' },
  // 自伤方法与计划
  { term: 'zican', from: '自残' }, { term: 'zc', from: '自残' }, { term: 'zishang', from: '自伤' },
  { term: 'gewan', from: '割腕' }, { term: 'gw', from: '割腕' },
  { term: 'tiaolou', from: '跳楼' }, { term: 'tl', from: '跳楼' },
  { term: 'tiaoqiao', from: '跳桥' }, { term: 'tiaohe', from: '跳河' }, { term: 'tiaoxiaqu', from: '跳下去' },
  { term: 'shangdiao', from: '上吊' }, { term: 'tunyao', from: '吞药' },
  { term: 'shaotan', from: '烧炭' }, { term: 'kaimeiqi', from: '开煤气' },
  { term: 'zhantiantai', from: '站在天台' }, { term: 'zaitiantai', from: '在天台' }, { term: 'zailouding', from: '在楼顶' },
  { term: 'gaobiexin', from: '告别信' },
  // 涉他危险
  { term: 'sharen', from: '杀人' }, { term: 'shasi', from: '杀死' }, { term: 'shale', from: '杀了' },
  // 中英混写避讳（s=死、4=死的谐音）
  { term: '自s', from: '自杀' }, { term: 's了', from: '死' }, { term: '4了', from: '死' },
  // elevated：只收全拼，缩写太泛不收
  { term: 'bengkui', from: '崩溃', level: 'elevated' },
  { term: 'juewang', from: '绝望', level: 'elevated' },
  { term: 'chengbuzhu', from: '撑不住', level: 'elevated' },
  { term: 'xiangxiaoshi', from: '想消失', level: 'elevated' }
];

// 拼音匹配：<4 字符（缩写/混写）要求字母边界，>=4 字符任意位置命中。
// 返回首次命中的下标（在传入的串上），未命中返回 -1。
function matchPinyin(haystack, needle) {
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return -1;
    if (needle.length >= 4) return index;
    const before = index > 0 ? haystack[index - 1] : '';
    const after = haystack[index + needle.length] || '';
    const isLetter = (ch) => ch >= 'a' && ch <= 'z';
    if (!isLetter(before) && !isLetter(after)) return index;
    from = index + 1;
  }
  return -1;
}

// 扫描一段文本。返回 { level, matched, cutIndex }：
// - level：'critical' | 'elevated' | 'normal'
// - matched：命中的词与位置（index 为原文小写位置，归一化命中时为 -1）
// - cutIndex：critical 在原文中最先命中的下标（供流式截断）；未命中原文时为 -1
function scan(rawText) {
  const text = String(rawText || '');
  const lowered = text.toLowerCase();
  const compact = normalize(text);
  const matched = [];
  let level = 'normal';
  let cutIndex = -1;
  CRITICAL_TERMS.forEach((term) => {
    const index = lowered.indexOf(term);
    if (index !== -1) {
      level = 'critical';
      matched.push({ term, index });
      if (cutIndex === -1 || index < cutIndex) cutIndex = index;
      return;
    }
    if (compact.indexOf(term) !== -1) {
      level = 'critical';
      matched.push({ term, index: -1 });
    }
  });
  // 拼音/缩写层：中文词表未定级 critical 时才需要扫（critical 已定级则直接短路）。
  if (level !== 'critical') {
    PINYIN_TERMS.forEach((item) => {
      const isCritical = item.level !== 'elevated';
      const loweredHit = matchPinyin(lowered, item.term);
      if (loweredHit !== -1) {
        if (isCritical) {
          level = 'critical';
          matched.push({ term: `${item.term}(${item.from})`, index: loweredHit });
          if (cutIndex === -1 || loweredHit < cutIndex) cutIndex = loweredHit;
        } else {
          matched.push({ term: `${item.term}(${item.from})`, index: -1 });
          if (level === 'normal') level = 'elevated';
        }
        return;
      }
      // 分隔变体（zi sha / bu xiang huo）：归一化后拼回，命中时无原文下标（-1）。
      if (matchPinyin(compact, item.term) !== -1) {
        matched.push({ term: `${item.term}(${item.from})`, index: -1 });
        if (isCritical) level = 'critical';
        else if (level === 'normal') level = 'elevated';
      }
    });
  }
  if (level === 'critical') return { level, matched, cutIndex };
  ELEVATED_TERMS.forEach((term) => {
    if (lowered.indexOf(term) !== -1 || compact.indexOf(term) !== -1) {
      level = 'elevated';
      matched.push({ term, index: -1 });
    }
  });
  return { level, matched, cutIndex };
}

// critical 命中时夜喵的直接回复（不经过大模型）。语气仍是夜喵，但指令必须明确。
// 渠道信息来自浙江大学心理中心官方页面（xlzx.zju.edu.cn，用户提供，2026-10 核对）。
function buildSafetyReply() {
  return [
    '谢谢你肯把这句话说出来。听到你这么难受，我很想认真陪你面对——但在这个时刻，比聊天更有用的是真人的帮助。',
    '值班时间请直接拨打浙大心理中心电话 88982525；其他时间可以联系院系辅导员，或拨打 24 小时心理援助热线 12356（全国免费）、96525（浙江省）。此刻若处在危险里，直接拨 120 或 110。',
    '你不需要一个人扛。我在这里，但我更希望你被真正能帮你的人接住。'
  ].join('\n');
}

// 求助卡内容（role: 'safety' 的消息体）：每条渠道可一键复制号码。
// 渠道与值班时间来自浙大心理中心官方口径（xlzx.zju.edu.cn/main.htm）；
// 12356 为全国兜底，紧急情况 120/110。
function buildHelpCard() {
  return {
    title: '此刻可以抓住的手',
    sub: '每一条背后，都是能真正帮你的人',
    // 顶部插画（夜湖灯舟，880x399 JPG 约 62KB）：WXML 里 wx:if 有值才渲染，留空即退回无图版。
    banner: '/assets/agent/safety-banner.jpg',
    channels: [
      { key: 'center', strong: true, name: '心理中心值班电话', contact: '88982525', desc: '危机个案 · 浙大心理中心 · 值班时间直接拨打', copy: '88982525' },
      { key: 'province', name: '浙江省统一心理援助热线', contact: '96525', desc: '24 小时 · 省内通用 · 默认按浙江显示，可切省份', copy: '96525' },
      { key: 'hotline', name: '全国统一心理援助热线', contact: '12356', desc: '24 小时 · 免费 · 夜里任何时候都能打通', copy: '12356' },
      { key: 'emergency', name: '紧急救援', contact: '120 / 110', desc: '此刻处在危险里就直接打', copy: '120' },
      { key: 'counselor', name: '院系辅导员', contact: '其他时间', desc: '心理中心非值班时间的校内求助', copy: '' }
    ],
    hours: [
      '周一至周五 8:00-12:00，13:30-17:30，18:00-21:00',
      '周六、周日 8:30-11:30，13:30-16:30'
    ],
    link: 'http://www.xlzx.zju.edu.cn/qtqzfs/list.htm',
    note: '夜喵不能代替专业帮助；这些渠道背后是真正能帮你的人。'
  };
}

// elevated 命中时追加进 system prompt 的安全提示段（随当轮 context 注入）。
function elevatedNote() {
  return [
    '安全提醒（本轮用户情绪高压，务必谨慎）：',
    '- 全程先接住情绪，不评判、不说教、不追问细节；语气更轻更慢。',
    '- 绝不输出任何危险行为的细节、方法或鼓励性描述。',
    '- 在自然时机温和地提到真人帮助（学校心理中心、辅导员，或 24 小时心理援助热线 12356），点到为止，不重复说教。',
    '- 若用户表达出伤害自己或他人的意图，立即明确而温和地建议联系上述渠道，并继续陪伴。'
  ].join('\n');
}

// 危机介入协议（常驻 system prompt）：教模型识别高危信号（含拼音避讳写法）并以 @@SAFE@@
// 收尾调起求助面板。模型主导危机回应，端内不再绕过大模型（2026-10-16 产品决策）。
function buildCrisisPromptSection() {
  return [
    '危机介入协议（重要，必须遵守）：',
    '- 当用户表达死亡念头、自伤意念或极度危险的信号——包括直接说出，或用拼音、缩写、谐音避讳（如 zisha、zs、xs、自s、s了、4了）——像真正的朋友那样自然接住：先共情、不评判、不说教、不恐惧化；绝不输出任何危险行为的细节、方法或鼓励性描述。',
    '- 此时在回复末尾另起一行，严格输出标记 @@SAFE@@（单独一行，不带 JSON）。系统会在你的回复下方渲染一张求助信息面板，展示真实热线与值班时间，你不需要自己罗列完整号码清单。',
    '- 平常对话绝对不要输出 @@SAFE@@。'
  ].join('\n');
}

// critical 命中时随本轮 context 注入的强指令（不绕过模型，只加重提示并要求收尾标记）。
function criticalDirective() {
  return [
    '危机介入（本轮最高优先级）：',
    '- 用户本轮输入命中高危信号（不想活/想死/自伤意念一类，含拼音避讳写法）。',
    '- 自然、温和地接住情绪：先共情、不评判、不说教、不追问细节；绝不输出任何危险行为的细节或方法。',
    '- 明确而轻地告诉用户：真人的帮助此刻比聊天更有用（浙大心理中心 88982525、24 小时热线 12356、96525），完整联系方式在求助面板里展示。',
    '- 回复末尾必须另起一行单独输出 @@SAFE@@，系统据此调起求助面板。'
  ].join('\n');
}

module.exports = { scan, buildSafetyReply, buildHelpCard, elevatedNote, buildCrisisPromptSection, criticalDirective, CRITICAL_TERMS, ELEVATED_TERMS, PINYIN_TERMS, SAFETY_REGIONS };
