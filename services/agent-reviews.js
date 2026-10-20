// 夜喵收到的评价：赞 / 踩 + 「为什么」理由，逐条挂在消息上，可改口、可撤回。
// 与 agentFeedback（只有累计计数）互补：这里保留能读进 memory.md 的明细。

const storage = require('./storage');

const LIMIT = 30;
const REASON_MAX = 60;
const QUOTE_MAX = 24;
const VALUES = ['like', 'dislike'];

function list() {
  try {
    const stored = storage.read(storage.KEYS.agentReviews, []);
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function find(messageId) {
  if (!messageId) return null;
  return list().find((item) => item.messageId === messageId) || null;
}

// 写一条评价（按 messageId 合并，最新在前）：
// - value 传 '' 表示只留言不投票；非法值按 '' 处理。
// - reason / quote 传 undefined 表示保留上一次的值（改赞/踩时理由不会丢）。
// - value 与 reason 都为空则整条移除，不留下空格子。
function upsert(input) {
  const source = input || {};
  const messageId = typeof source.messageId === 'string' ? source.messageId.trim() : '';
  if (!messageId) return null;
  const previous = find(messageId);
  const value = VALUES.indexOf(source.value) >= 0 ? source.value : '';
  const reason = typeof source.reason === 'string'
    ? source.reason.trim().slice(0, REASON_MAX)
    : ((previous && previous.reason) || '');
  const quote = typeof source.quote === 'string' && source.quote.trim()
    ? source.quote.trim().slice(0, QUOTE_MAX)
    : ((previous && previous.quote) || '');
  if (!value && !reason) {
    remove(messageId);
    return null;
  }
  const entry = { messageId, value, reason, quote, at: Date.now() };
  const rest = list().filter((item) => item.messageId !== messageId);
  if (!storage.write(storage.KEYS.agentReviews, [entry].concat(rest).slice(0, LIMIT))) return null;
  return entry;
}

function remove(messageId) {
  if (!messageId) return false;
  const current = list();
  const rest = current.filter((item) => item.messageId !== messageId);
  if (rest.length === current.length) return false;
  return storage.write(storage.KEYS.agentReviews, rest);
}

function valueLabel(value) {
  if (value === 'like') return '赞';
  if (value === 'dislike') return '踩';
  return '留言';
}

// 近期评价聚合成一段可注入 system prompt 的风格反馈（agent-context 每轮实时读取）。
// 只带理由的条目才有指导性；纯点赞踩没有信息量，不进 prompt。
// 原则：避其所嫌、扬其所好，原文引用理由但不复述回复内容，避免模型自我指涉。
function feedbackLine(limit) {
  const cap = Number(limit) > 0 ? Number(limit) : 4;
  const withReason = list().filter((item) => item.reason);
  if (!withReason.length) return '';
  const parts = [];
  const dislikes = withReason.filter((item) => item.value === 'dislike').slice(0, Math.ceil(cap / 2));
  const likes = withReason.filter((item) => item.value === 'like').slice(0, Math.ceil(cap / 2));
  dislikes.forEach((item) => parts.push('用户不喜欢的表达：' + item.reason));
  likes.forEach((item) => parts.push('用户喜欢的表达：' + item.reason));
  if (!parts.length) return '';
  return [
    '用户近期对夜喵回复的反馈（实时调整表达风格：避开不喜欢的说法，多做喜欢的样子；不要向用户提及这些反馈本身）：',
    parts.map((item) => '- ' + item).join('\n')
  ].join('\n');
}

module.exports = { list, find, upsert, remove, valueLabel, feedbackLine };
