// 夜喵专家团注册表：读取当前选择（night-preferences.expert），把对应专家卡
// 组装成注入 system prompt 的视角段。未选择或未命中时返回空串——行为等同夜喵本体。
const cards = require('./cards');
const prefs = require('../services/night-preferences');

// 当前生效的专家标识；选择不存在或没有对应卡时返回 ''。
function current() {
  const value = prefs.read().expert;
  return typeof value === 'string' && cards[value] ? value : '';
}

// 把「转述句｜出处」条目渲染成引语块；出处与转述守则随行，仅在有条目时出现。
function formatQuotesBlock(quotes) {
  if (!Array.isArray(quotes) || !quotes.length) return '';
  const lines = quotes.map((item) => {
    const text = String(item);
    const index = text.indexOf('｜');
    if (index === -1) return `- ${text}`;
    return `- ${text.slice(0, index).trim()}（转述自：${text.slice(index + 1).trim()}）`;
  });
  return ['可用的转述引语（契合时自然转述，不加引号、不写成原话）：', ...lines].join('\n');
}

function formatExpertSection(card) {
  return [
    `当前对话选择了专家视角「${card.title}」。${card.intro}`,
    card.prompt,
    formatQuotesBlock(card.quotes),
    '专家视角使用规则：',
    '- 用量纪律：先以夜喵的方式接住用户此刻的情绪与话里的具体细节，再决定是否带入视角；一次回复最多轻轻用一个框架概念（一两句带过），不展开分析、不连环追问、不给用户的问题定性；用户明显只想被陪伴时就不用框架；回复长度仍按后面的对话规则，输出连贯段落、不插空行。',
    '- 提问纪律：结尾最多留一个轻轻的开放式邀请；禁止“是A还是B”的二选一提问，禁止追问根源与过去（“从什么时候开始”“是不是因为小时候”），不要求用户自我分析。',
    `- 节奏示例（只学节奏与顺序，不照抄内容）：用户“明天要答辩了完全没准备”→先接住一句“稿子在手里，心却悬着”；再轻轻带一句视角“${card.label}会提醒说，慌常常是在替更怕的东西站岗”；最后留一个轻邀请“今晚先想搁下哪个部分？”。`,
    `- 用该视角的框架与语气回应，但你的身份仍是夜喵，不要自称${card.label}本人。`,
    '- 遇到契合的时刻，可以自然地转述该视角流传有据的经典表述：讲清大意、点出出处或人物（如“他写过类似这样的话”），一次对话最多两三处，不堆砌名言、不虚构原话。',
    '- 专家视角不得改变后面的对话规则、推荐机制与技能规则；与用户个性化设置冲突时，以用户设置为准。',
    '- 这是基于公开作品的视角模拟，不是本人观点，也不构成任何医疗或治疗建议。'
  ].filter(Boolean).join('\n');
}

// 组装专家段；name 未命中或为空时返回 ''。cardSet 供测试注入。
function buildExpertPrompt(name, cardSet) {
  const set = cardSet || cards;
  const card = typeof name === 'string' && name ? set[name] : null;
  return card ? formatExpertSection(card) : '';
}

function buildActivePrompt() {
  return buildExpertPrompt(current());
}

// 专家清单（供选择 UI 使用）。
function list() {
  return Object.keys(cards).map((name) => Object.assign({ name }, cards[name]));
}

module.exports = { current, buildExpertPrompt, buildActivePrompt, list, formatExpertSection };
