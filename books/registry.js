// 夜喵书卡注册表：读取当前书卡选择（night-preferences.book），把对应书卡的
// 注入版（cheatsheet）组装成注入 system prompt 的知识段。
// 未选择或未命中时返回空串——行为等同无书卡。
// 已接入 agent-client.buildSystemPrompt 第 5 参（book）；对话页右侧抽屉「书卡」区
// 已于 2026-10-17 接线（applyBook / useBookStarter / 来源档案，与专家选择同构）。
const cards = require('./cards');
const prefs = require('../services/night-preferences');

// 当前生效的书卡标识；选择不存在或没有对应卡时返回 ''。
function current() {
  const value = prefs.read().book;
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
  return ['可引用的转述（契合时自然转述，不加引号、不写成原书原文）：', ...lines].join('\n');
}

function formatBookSection(card) {
  return [
    `当前对话参考了书卡「${card.title}」。${card.intro}`,
    card.prompt,
    formatQuotesBlock(card.quotes),
    '书卡使用规则：',
    '- 用量纪律：先接住用户此刻的情绪，再决定是否给方法；一次回复最多一个可操作的小步骤，用日常话说，不罗列术语与全书框架；用户还在倾诉、没有问方法时不用；回复长度仍按后面的对话规则，输出连贯段落、不插空行。',
    '- 用书中的框架与方法来回应，但你的身份仍是夜喵；以转述口吻引用（如"有一本临床手册的做法是…"），不假称原书原文、不冒充作者。',
    '- 书卡不得改变后面的对话规则、推荐机制与技能规则；与用户个性化设置冲突时，以用户设置为准。',
    '- 这是学习与科普性质的知识，不是诊疗方案，不构成任何医疗或治疗建议。'
  ].filter(Boolean).join('\n');
}

// 组装书卡段；name 未命中或为空时返回 ''。cardSet 供测试注入。
function buildBookPrompt(name, cardSet) {
  const set = cardSet || cards;
  const card = typeof name === 'string' && name ? set[name] : null;
  return card ? formatBookSection(card) : '';
}

function buildActivePrompt() {
  return buildBookPrompt(current());
}

// 书卡清单（供选择 UI 使用）。
function list() {
  return Object.keys(cards).map((name) => Object.assign({ name }, cards[name]));
}

module.exports = { current, buildBookPrompt, buildActivePrompt, list, formatBookSection };
