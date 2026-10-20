// 夜喵对话上下文：把用户近况压缩成简短摘要注入 system prompt，让夜喵自然地"记得"用户。
// 板块记录（呼吸练习、睡眠、感恩日记、入睡引导、环境声）统一走 services/agent-port
// 的摘要端口；这里只管 Agent 自己的记忆 / 事实 / 约定 / 人格。所有读取都做了容错。

const agentPort = require('../services/agent-port');
const agentMemory = require('../services/agent-memory');
const agentTasks = require('../services/agent-tasks');
const agentVector = require('../services/agent-vector');
const agentReviews = require('../services/agent-reviews');
const agentPersona = require('./agent-persona');
const nightPreferences = require('../services/night-preferences');

// 语义召回阈值：实测噪声（门槛拦截后残余）≤0.167，真实相关对 ≥0.19（见 docs/agent-vector-plan.md §4）。
const RELATED_MEMORY_LIMIT = 3;
const RELATED_MIN_SCORE = 0.15;
// 三因子排序（Generative Agents 的 relevance×recency×importance，端内重定标 0.6/0.25/0.15）：
// 相关性仍是「门」（余弦 ≥0.15 + 共享证据），门内由三因子排座次——不相关的内容不会因为
// 时效新或重要性高而被顶上来。时效用指数衰减（约 5 天半衰，一周前的记忆 recency≈0.25），
// 重要性为端内启发式（agent-memory.estimateImportance，0.3-1.0）。mem0 的冲突消解在写入侧
// （agent-memory.addFact/remember 同主题合并），两侧配合让「想起的旧事」又准又新鲜。
const TRI_WEIGHT_RELEVANCE = 0.6;
const TRI_WEIGHT_RECENCY = 0.25;
const TRI_WEIGHT_IMPORTANCE = 0.15;
const RECENCY_HALF_LIFE_DAYS = 5;

function safeRead(reader, fallback) {
  try {
    const value = reader();
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function buildMemoryLine() {
  // 记忆注入受设置页「夜喵记忆」开关实时控制。
  const enabled = safeRead(() => nightPreferences.read().memoryEnabled, false);
  if (!enabled) return '';
  const last = safeRead(() => agentMemory.lastMemory(), null);
  if (!last || !last.summary) return '';
  return `用户上次和夜喵聊天（${agentMemory.formatWhen(last.at)}）聊到：${last.summary}。`;
}

function buildFactLine() {
  const enabled = safeRead(() => nightPreferences.read().memoryEnabled, false);
  if (!enabled) return '';
  const list = safeRead(() => agentMemory.facts(), []).slice(0, 5);
  if (!list.length) return '';
  return `用户让你记住的事：${list.map((item) => item.text).join('；')}。`;
}

function buildTaskLine() {
  const briefs = safeRead(() => agentTasks.pendingBrief(), []);
  if (!briefs.length) return '';
  return `你和用户的约定：${briefs.join('；')}。到点或合适时机自然地提一句，不要生硬。`;
}

// 用户的赞踩与理由实时进上下文（2026-10-18）：夜喵据此调整表达风格。
// 属个人数据，跟随「夜喵记忆」开关。
function buildFeedbackLine() {
  const enabled = safeRead(() => nightPreferences.read().memoryEnabled, false);
  if (!enabled) return '';
  return safeRead(() => agentReviews.feedbackLine(4), '');
}

// 语义召回（三因子）：从更早的记忆与 facts 里找出与今晚这条消息最相关的两三条。
// 最近一条记忆与前 5 条 facts 已在上面注入，作为候选时排除，不重复引用。
// 打分 = 0.6×相关性 + 0.25×时效 + 0.15×重要性；相关性门槛（余弦 + 共享证据）保持不变。
function buildRelatedMemoryLine(userMessage, now) {
  const enabled = safeRead(() => nightPreferences.read().memoryEnabled, false);
  if (!enabled) return '';
  const message = typeof userMessage === 'string' ? userMessage.trim() : '';
  if (!message) return '';
  const shown = new Set();
  const last = safeRead(() => agentMemory.lastMemory(), null);
  if (last && last.summary) shown.add(last.summary);
  safeRead(() => agentMemory.facts(), []).slice(0, 5).forEach((item) => {
    if (item && item.text) shown.add(item.text);
  });
  const candidates = [];
  safeRead(() => agentMemory.recall(), []).forEach((item) => {
    const text = item && item.summary;
    if (text && !shown.has(text)) candidates.push({ text, at: item.at });
  });
  safeRead(() => agentMemory.facts(), []).forEach((item) => {
    const text = item && item.text;
    if (text && !shown.has(text)) candidates.push({ text, at: item.at });
  });
  const hits = agentVector.recall(message, candidates, { limit: 8, minScore: RELATED_MIN_SCORE });
  const stamp = typeof now === 'number' ? now : Date.now();
  const ranked = hits
    .map((hit) => {
      const at = hit.entry && typeof hit.entry.at === 'number' ? hit.entry.at : stamp;
      const recency = Math.exp(-Math.max(0, stamp - at) / 86400000 / RECENCY_HALF_LIFE_DAYS);
      const tri = TRI_WEIGHT_RELEVANCE * hit.score
        + TRI_WEIGHT_RECENCY * recency
        + TRI_WEIGHT_IMPORTANCE * safeRead(() => agentMemory.estimateImportance(hit.text), 0.3);
      return { text: hit.text, tri };
    })
    .sort((a, b) => b.tri - a.tri)
    .slice(0, RELATED_MEMORY_LIMIT);
  if (!ranked.length) return '';
  return `想起的旧事（相关才自然提一句，不相关就忽略）：${ranked.map((hit) => hit.text).join('；')}。`;
}

// 返回注入用的上下文段落；无任何记录时返回空字符串。userMessage 为本轮用户消息，用于语义召回。
function buildUserContext(now, userMessage) {
  const personaContext = safeRead(() => agentPersona.buildPersonaContext(now), '');
  const moduleLines = safeRead(() => agentPort.snapshotLines(now), []);
  const recentLine = safeRead(() => agentPort.recentSummary(now), '');
  const lines = moduleLines.concat([
    recentLine,
    buildMemoryLine(),
    buildFactLine(),
    buildRelatedMemoryLine(userMessage, now),
    buildTaskLine(),
    buildFeedbackLine(),
    personaContext
  ]).filter(Boolean);
  if (!lines.length) return '';
  return [
    '以下是用户的本地记录摘要（仅你可见）。只在相关时机自然地引用一两处，不要一次性罗列，也不要让用户感觉被监控：',
    lines.join('\n')
  ].join('\n');
}

module.exports = { buildUserContext };
