// 端内轻量语义向量：把短文本映射为定长稠密向量（特征哈希 + 随机投影），
// 用于夜喵记忆的语义召回。零依赖、零网络、全本地计算。
// 方案背景、实测依据与局限见 docs/agent-vector-plan.md。
//
// 约定：
// - embed() 输出 L2 归一化向量（余弦即点积），同一文本恒产出同一向量；
//   无状态、可随时重算——语料只有几十条短句，无需持久化向量。
// - recall() 带「共享证据」门槛：至少共享一个非停用词二元组/英文词才考虑召回。
//   实测（docs/agent-vector-plan.md §4）：无门槛时短查询（「唉」「睡不着」）
//   靠哈希碰撞就能拿到 ~0.3 假余弦，门槛是压噪关键；宁缺勿噪。

const DIM = 256;
const CJK_MIN = 0x4e00;
const CJK_MAX = 0x9fff;

// 停用词（时间/话语/人称类二元组）：高频低信息，「今天好累」不该召回「今天晚霞很好看」。
// 只过滤二元组与词，单字照常参与（权重本就减半）。
const STOP_TOKENS = new Set([
  '今天', '明天', '昨天', '后天', '最近', '现在', '刚才',
  '以后', '之前', '然后', '下周', '这周', '上周',
  '感觉', '觉得', '有点', '一些',
  '什么', '怎么', '我们', '你们', '他们', '自己', '一下', '一点'
]);

function isCjk(code) {
  return (code >= CJK_MIN && code <= CJK_MAX) || (code >= 0x3400 && code <= 0x4dbf);
}

function isAsciiWord(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
}

// 分词：CJK 单字 + 相邻 CJK 二元组（中文短句里最稳的近似语义单元），
// ASCII 字母/数字按词切分并小写化。标点与空白丢弃。
function tokenize(text) {
  const value = String(text || '').toLowerCase();
  const tokens = [];
  let word = '';
  let prevCjk = '';
  const flushWord = () => {
    if (word) { tokens.push(word); word = ''; }
  };
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (isCjk(code)) {
      flushWord();
      tokens.push(ch);
      if (prevCjk) tokens.push(prevCjk + ch);
      prevCjk = ch;
    } else if (isAsciiWord(ch)) {
      prevCjk = '';
      word += ch;
    } else {
      flushWord();
      prevCjk = '';
    }
  }
  flushWord();
  return tokens;
}

// 强证据 token：CJK 二元组或英文/数字词（长度 ≥2），比单字更能代表语义。
// 停用词不算证据（如「今天」两字都占却毫无信息量）。
function isEvidenceToken(token) {
  if (STOP_TOKENS.has(token)) return false;
  if (token.length >= 2 && isCjk(token.codePointAt(0)) && isCjk(token.codePointAt(1))) return true;
  if (/^[a-z0-9]{2,}$/.test(token)) return true;
  return false;
}

// 单字权重减半：单字多是虚词或半截词，叠加会放大噪声。停用词直接不进向量。
function tokenWeight(token) {
  return isEvidenceToken(token) ? 1 : 0.5;
}

// FNV-1a 32 位；两个不同 seed 分别决定哈希桶与符号（signed hashing 降碰撞偏差）。
function hash32(token, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 文本 → L2 归一化定长向量；空文本返回全零向量（与任何文本相似度 0）。
function embed(text) {
  const vector = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) return vector;
  const counts = new Map();
  tokens.forEach((token) => {
    if (STOP_TOKENS.has(token)) return;
    counts.set(token, (counts.get(token) || 0) + 1);
  });
  counts.forEach((count, token) => {
    const index = hash32(token, 0x9747b28c) % DIM;
    const sign = hash32(token, 0x1b873593) & 1 ? 1 : -1;
    vector[index] += sign * tokenWeight(token) * (1 + Math.log(count)); // 次线性词频
  });
  let norm = 0;
  for (let i = 0; i < DIM; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (!norm) return vector;
  for (let i = 0; i < DIM; i += 1) vector[i] = Math.round((vector[i] / norm) * 10000) / 10000;
  return vector;
}

// 余弦相似度；向量已归一化，点积即余弦。维度不符返回 0（旧数据容错）。
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function similarity(textA, textB) {
  return cosine(embed(textA), embed(textB));
}

// 是否共享至少一个证据 token（二元组/词，排除停用词）。
function sharesEvidence(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.some((token) => isEvidenceToken(token) && setB.has(token));
}

// 从候选集中语义召回：entries 支持字符串或 { text, ...meta }；
// 返回按相似度降序的 { text, score, entry }。
// options：limit（默认 3）、minScore（默认 0，门槛为主时保持低值）、requireShared（默认 true）。
function recall(queryText, entries, options) {
  const opts = options || {};
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 3;
  const minScore = typeof opts.minScore === 'number' ? opts.minScore : 0;
  const requireShared = opts.requireShared !== false;
  const queryTokens = tokenize(queryText);
  const query = embed(queryText);
  const scored = [];
  (Array.isArray(entries) ? entries : []).forEach((item) => {
    const text = typeof item === 'string' ? item : (item && item.text);
    if (typeof text !== 'string' || !text.trim()) return;
    if (requireShared && !sharesEvidence(queryTokens, tokenize(text))) return;
    const score = cosine(query, embed(text));
    if (score > 0 && score >= minScore) scored.push({ text, score, entry: item });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { DIM, STOP_TOKENS, tokenize, isEvidenceToken, embed, cosine, similarity, recall };
