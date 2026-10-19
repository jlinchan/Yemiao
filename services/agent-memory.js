// 夜喵的跨会话记忆：每次对话结束后，在后台调用网关生成一句话摘要并保存。
// 下次对话时注入上下文并个性化开场白。摘要属于个人记录，随「清除个人记录」一起删除。

const storage = require('./storage');
const agentThoughts = require('./agent-thoughts');
const agentReviews = require('./agent-reviews');
const agentVector = require('./agent-vector');

let secrets;
try {
  secrets = require('./secrets');
} catch (error) {
  secrets = require('./secrets.example.js');
}

// 容量（2026-10-16 三因子改造扩容）：上下文注入按打分选 top-K 而非全量，扩容不增加 token 预算。
const MEMORY_LIMIT = 8;
const FACTS_LIMIT = 15;
// 同主题判定阈值（agent-vector 余弦，探针实测校准）：同题改述对 0.62-0.73（考研 0.725、雨声 0.618），
// 异题对 ≤0.46；mem0 的 ADD/UPDATE/DELETE 由 LLM 判定，端内用余弦启发式近似（sameTopic）。
const RELATED_TOPIC_COSINE = 0.6;
const SUMMARY_MAX_CHARS = 40;
const REQUEST_TIMEOUT_MS = 15000;

// 重要性端内启发式（0.3-1.0）：Generative Agents 由 LLM 自评（0-255 归一化），
// 端内零请求改为关键词规则——危机/高压表达优先，用户明确委托次之，具体事件/数字再加分。
const IMPORTANCE_RULES = [
  { weight: 0.3, words: ['记住', '帮我记', '别忘了', '以后', '我最', '我喜欢', '我讨厌', '我怕', '我害怕', '我在准备', '我要', '下周', '下个月', '明天'] },
  { weight: 0.2, words: ['考试', '面试', '考研', '论文', '答辩', '实习', '比赛', '生病', '失眠', '熬夜', '吵架', '分手', '搬家', '生日', '家里', '爸妈', '父母', '导师'] },
  { weight: 0.1, words: ['压力', '焦虑', '紧张', '崩溃', '睡不着', 'emo', '内耗', '想哭', '好累'] }
];

function estimateImportance(text) {
  const value = String(text || '');
  if (!value.trim()) return 0.3;
  let score = 0.3;
  let danger = 0;
  try {
    if (require('../utils/safety-gate').scan(value).level !== 'normal') danger = 0.6;
  } catch (error) { /* 安全门不可用时只走关键词规则 */ }
  IMPORTANCE_RULES.forEach((rule) => {
    if (rule.words.some((word) => value.indexOf(word) !== -1)) score += rule.weight;
  });
  if (/\d|[一二两三四五六七八九十]{1,3}(点|天|次|号|月|周|年)/.test(value)) score += 0.1;
  return Math.min(1, score + danger);
}

function recall() {
  try {
    const list = storage.read(storage.KEYS.agentMemory, []);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function lastMemory() {
  return recall()[0] || null;
}

// 同主题判定：余弦 ≥0.6，或「短侧证据 token 被长侧覆盖 ≥0.6」。后者补偿长摘要摊薄余弦的问题
// （「我在准备考研复习，每天学到半夜还是睡不好」对「最近在准备考研」余弦只有 0.507，
// 但短侧证据 token 全部被长侧覆盖）；mem0 用 LLM 判定，端内以覆盖率近似。
function sameTopic(textA, textB) {
  if (agentVector.similarity(textA, textB) >= RELATED_TOPIC_COSINE) return true;
  const tokensA = agentVector.tokenize(textA).filter(agentVector.isEvidenceToken);
  const tokensB = agentVector.tokenize(textB).filter(agentVector.isEvidenceToken);
  const short = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const long = short === tokensA ? tokensB : tokensA;
  if (!short.length) return false;
  const pool = new Set(long);
  const covered = short.filter((token) => pool.has(token)).length;
  return covered / short.length >= 0.6;
}

function remember(entry) {
  const summary = entry && typeof entry.summary === 'string' ? entry.summary.trim().slice(0, SUMMARY_MAX_CHARS) : '';
  if (!summary) return false;
  const at = entry.at || Date.now();
  const list = recall();
  // 同主题摘要：新摘要信息量明显更大（长 8 字以上）才替换，否则只刷新时间戳——
  // 表达「最近一次聊到这件事」，避免同一主题每晚会话把记忆容量堆满。
  const sameIndex = list.findIndex((item) => sameTopic(summary, item.summary));
  if (sameIndex !== -1) {
    const old = list[sameIndex];
    const next = summary.length > old.summary.length + 8
      ? { at, topic: entry.topic || old.topic, summary }
      : { at: Math.max(at, old.at), topic: old.topic, summary: old.summary };
    list.splice(sameIndex, 1);
    list.unshift(next);
    return storage.write(storage.KEYS.agentMemory, list.slice(0, MEMORY_LIMIT));
  }
  list.unshift({ at, topic: entry.topic || '', summary });
  return storage.write(storage.KEYS.agentMemory, list.slice(0, MEMORY_LIMIT));
}

// 用户明确要求记住的事：长期保留，出现在 memory.md 档案里，可随「清除聊天记忆」删除。
function facts() {
  try {
    const list = storage.read(storage.KEYS.agentFacts, []);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function addFact(text, at) {
  const fact = typeof text === 'string' ? text.trim().slice(0, SUMMARY_MAX_CHARS) : '';
  if (!fact) return '';
  // mem0 式冲突消解（端内近似）：与既有条目同主题（余弦或证据覆盖率）视为同一件事的更新——
  // 新表述替换旧条（用户后说的状态为准），精确重复自然被此规则覆盖；否则作为新事实插入。
  const list = facts();
  const sameIndex = list.findIndex((item) => sameTopic(fact, item.text));
  if (sameIndex !== -1) list.splice(sameIndex, 1);
  list.unshift({ at: at || Date.now(), text: fact });
  if (!storage.write(storage.KEYS.agentFacts, list.slice(0, FACTS_LIMIT))) return '';
  writeMemoryFile();
  return fact;
}

function formatWhen(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '上次';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

const FEELING_LABELS = { 1: '很差', 2: '较差', 3: '一般', 4: '不错', 5: '很好' };

function memoryFilePath() {
  return `${wx.env.USER_DATA_PATH}/memory.md`;
}

// 把夜喵的全部记忆渲染为人类可读的 markdown 档案。
function renderMemoryMarkdown() {
  const lines = ['# 夜喵的记忆', '', '> 这些内容只保存在你的手机上，你可以随时查看或清除。', ''];
  const sessions = Array.isArray(storage.getSessions()) ? storage.getSessions() : [];
  const totalCycles = sessions.reduce((sum, item) => sum + (Number(item.cycles) || 0), 0);
  if (totalCycles > 0) {
    const summary = storage.getSevenDaySummary(Date.now(), sessions);
    lines.push('## 练习近况', '', `- 累计完成 ${totalCycles} 轮呼吸`);
    lines.push(`- 近 7 天练习 ${summary.completedSessions} 次（${summary.activeDays} 天有练习），练后感到放松 ${summary.outcomes.relieved} 次、差不多 ${summary.outcomes.same} 次、还紧绷 ${summary.outcomes.tense} 次`, '');
  }
  const sleepRecords = Array.isArray(storage.read(storage.KEYS.sleep, [])) ? storage.read(storage.KEYS.sleep, []) : [];
  if (sleepRecords.length) {
    lines.push('## 最近几晚的睡眠', '');
    sleepRecords.slice(0, 3).forEach((item) => {
      const feeling = FEELING_LABELS[item.feeling] || item.feeling || '未记录';
      lines.push(`- ${item.nightDate || item.date || '最近'}：${item.bedTime || '—'} 上床，${item.wakeTime || '—'} 起床，${item.duration || '时长未记录'}，感受「${feeling}」`);
    });
    lines.push('');
  }
  const journals = Array.isArray(storage.read(storage.KEYS.journal, [])) ? storage.read(storage.KEYS.journal, []) : [];
  const gratitude = journals.filter((entry) => entry.kind !== 'dream').slice(0, 3);
  const dreams = journals.filter((entry) => entry.kind === 'dream').slice(0, 3);
  if (gratitude.length) {
    lines.push('## 最近的感恩日记', '');
    gratitude.forEach((entry) => {
      const items = (Array.isArray(entry.items) ? entry.items : []).filter(Boolean);
      if (items.length) lines.push(`- ${entry.date || '某天'}：${items.join('；')}`);
    });
    lines.push('');
  }
  if (dreams.length) {
    lines.push('## 最近记下的梦', '');
    dreams.forEach((entry) => {
      const items = (Array.isArray(entry.items) ? entry.items : []).filter(Boolean);
      if (items.length) lines.push(`- ${entry.date || '某天'}：${items.join('；')}`);
    });
    lines.push('');
  }
  const memories = recall();
  if (memories.length) {
    lines.push('## 我们聊过', '');
    memories.forEach((item) => lines.push(`- ${formatWhen(item.at)}：${item.summary}`));
    lines.push('');
  }
  const factList = facts();
  if (factList.length) {
    lines.push('## 你让我记住的事', '');
    factList.forEach((item) => lines.push(`- ${item.text}`));
    lines.push('');
  }
  const parkedThoughts = agentThoughts.parked();
  if (parkedThoughts.length) {
    lines.push('## 你寄存在我这的心事', '');
    parkedThoughts.forEach((item) => lines.push(`- ${item.text}`));
    lines.push('');
  }
  const reviews = agentReviews.list();
  if (reviews.length) {
    lines.push('## 夜喵收到的评价', '');
    reviews.slice(0, 8).forEach((item) => {
      const label = agentReviews.valueLabel(item.value);
      const quote = item.quote ? `「${item.quote}」` : '';
      const reason = item.reason ? `${quote ? '——' : ''}原因：${item.reason}` : '';
      lines.push(`- ${formatWhen(item.at)} · ${label}${quote}${reason}`);
    });
    lines.push('');
  }
  if (lines.length <= 5) lines.push('夜喵还没有记住什么。多聊几次、多做几次练习，这里会慢慢丰富起来。');
  lines.push('---', '', `更新于 ${new Date().toLocaleString('zh-CN')}`);
  return lines.join('\n');
}

// 把档案写入用户文件目录；失败静默（档案页每次打开都会重新渲染）。
function writeMemoryFile() {
  if (typeof wx === 'undefined' || !wx.getFileSystemManager) return false;
  try {
    wx.getFileSystemManager().writeFileSync(memoryFilePath(), renderMemoryMarkdown(), 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function readMemoryFile() {
  if (typeof wx === 'undefined' || !wx.getFileSystemManager) return '';
  try {
    return wx.getFileSystemManager().readFileSync(memoryFilePath(), 'utf8');
  } catch (error) {
    return '';
  }
}

// 仅清除对话记忆（摘要、记住的事、寄存的心事、留下的评价、对话现场）并重写档案；用户的练习/睡眠/日记记录不受影响。
function clearConversationMemory() {
  const chatStore = require('./agent-chat-store');
  const cleared = storage.write(storage.KEYS.agentMemory, []) && storage.write(storage.KEYS.agentFacts, []) && storage.write(storage.KEYS.agentThoughts, []) && storage.write(storage.KEYS.agentReviews, []) && chatStore.clear();
  writeMemoryFile();
  return cleared;
}

// 把一次对话的消息列表压缩成给摘要模型的输入。
function buildTranscript(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .slice(-8)
    .map((item) => `${item.role === 'user' ? '用户' : '夜喵'}：${item.text.trim()}`)
    .join('\n');
}

// 对话结束后台摘要：done(summary|null) 可选；wx 不可用或请求失败时静默跳过。
function summarizeConversation(messages, topic, done) {
  const transcript = buildTranscript(messages);
  const hasUserTurn = transcript.split('\n').some((line) => line.indexOf('用户：') === 0);
  if (!transcript || !hasUserTurn) {
    if (done) done(null);
    return;
  }
  if (typeof wx === 'undefined' || !wx.request) {
    if (done) done(null);
    return;
  }
  try {
    wx.request({
      url: secrets.modelGateway.baseUrl,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      header: require('./agent-client').gatewayHeaders(),
      data: {
        model: secrets.modelGateway.model,
        stream: false,
        temperature: 0.3,
        max_tokens: 80,
        messages: [
          { role: 'system', content: `你在为睡前陪伴应用生成对话记忆。用不超过30个字概括这位大学生用户倾诉的主要困扰和情绪。只输出概括本身，不要引号、标点结尾或任何解释。` },
          { role: 'user', content: transcript }
        ]
      },
      success(res) {
        const content = res && res.data && res.data.choices && res.data.choices[0]
          && res.data.choices[0].message && res.data.choices[0].message.content;
        const summary = typeof content === 'string' ? content.trim().slice(0, SUMMARY_MAX_CHARS) : '';
        if (summary) {
          remember({ at: Date.now(), topic, summary });
          writeMemoryFile(); // 记忆更新后同步刷新档案
        }
        if (done) done(summary || null);
      },
      fail() {
        if (done) done(null);
      }
    });
  } catch (error) {
    if (done) done(null);
  }
}

module.exports = { recall, lastMemory, remember, facts, addFact, summarizeConversation, buildTranscript, formatWhen, estimateImportance, RELATED_TOPIC_COSINE, MEMORY_LIMIT, FACTS_LIMIT, renderMemoryMarkdown, writeMemoryFile, readMemoryFile, clearConversationMemory };
