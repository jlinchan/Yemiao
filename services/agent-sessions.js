// 夜喵会话档案：多会话管理与上下文隔离（2026-10-18）。
// 背景：旧版 agent-chat-store 只有一个「当前对话现场」，任何入口（首页咨询师卡 /
// 话题页 / 技能详情 / 首页输入框 / 分享）进来都恢复同一段上下文——换了入口还带着
// 上一段对话，上下文串台。改为「会话档案」：
//   - 每段对话是一个会话：独立 id / 标题 / 消息 / 专家 / 书卡；
//   - 带话进来的入口（prompt / draft）总是开新会话——每次新对话新上下文；
//   - 无话进入（呼吸页 / 分享直达）恢复当前会话，回到上次没聊完的话；
//   - 当前会话归档后进入「会话档案」，可在对话页回看、继续、删除；
//   - 隐私边界不变：全部数据只在本机，随「清除聊天记忆 / 清除个人记录」一起删除。
// 消息清洗规则沿用 agent-chat-store 的白名单（交互卡与未完成流式气泡不入档）。

const storage = require('./storage');

// 归档会话上限：超出裁最旧（滚动窗口，老对话自然沉淀）。
const SESSION_LIMIT = 30;
// 单会话消息上限：与旧对话现场一致（40 条），保证恢复后模型上下文可控。
const MAX_MESSAGES = 40;
// 当前会话的恢复窗口：超过视为「隔了一觉」，自动归档、下次进入开新会话。
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
// 会话标题长度：取首条用户消息的前 16 字。
const TITLE_MAX_CHARS = 16;
// AI 会话总结长度上限（对齐 agent-memory.SUMMARY_MAX_CHARS）。
const SUMMARY_MAX_CHARS = 40;

const allowedRoles = ['user', 'agent', 'skill', 'safety'];

// 单条消息白名单清洗：角色白名单 + 字段裁剪；未作答的选项卡恢复后再点会错位，一律摘除。
function sanitizeMessage(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.error) return null;
  if (allowedRoles.indexOf(item.role) === -1) return null;
  const text = typeof item.text === 'string' ? item.text : '';
  if (item.role === 'agent' && item.done === false) return null; // 流式未完成
  if (!text.trim() && !item.safety) return null;
  const clean = { id: String(item.id || ''), role: item.role, text, done: item.done !== false };
  if (item.safety) clean.safety = true;
  if (Array.isArray(item.push) && item.push.length) clean.push = item.push;
  if (item.ask && item.ask.done) clean.ask = { question: item.ask.question, options: item.ask.options, done: item.ask.done };
  if (item.feedback) clean.feedback = item.feedback;
  return clean;
}

function sanitizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map(sanitizeMessage)
    .filter(Boolean)
    .slice(-MAX_MESSAGES);
}

function readActive() {
  try {
    const saved = storage.read(storage.KEYS.agentActive, null);
    if (!saved || typeof saved !== 'object') return null;
    return saved;
  } catch (error) {
    return null;
  }
}

function writeActive(session) {
  return storage.write(storage.KEYS.agentActive, session || '');
}

function readArchive() {
  try {
    const list = storage.read(storage.KEYS.agentSessions, []);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function writeArchive(list) {
  return storage.write(storage.KEYS.agentSessions, list.slice(0, SESSION_LIMIT));
}

// 会话标题：首条用户消息截 16 字；还没有用户发言的会话不归档，因此只作兜底。
function titleOf(messages) {
  const firstUser = (Array.isArray(messages) ? messages : []).find((item) => item && item.role === 'user' && typeof item.text === 'string' && item.text.trim());
  if (!firstUser) return '一段悄悄话';
  return firstUser.text.trim().slice(0, TITLE_MAX_CHARS);
}

// 归档一个会话：只有带实质消息（>1 条，即除了开场白还有往来）才值得收进档案。
function archiveSession(session) {
  if (!session || !Array.isArray(session.messages) || session.messages.length <= 1) return null;
  const entry = {
    id: session.id,
    title: session.title || titleOf(session.messages),
    summary: session.summary || '',
    topic: session.topic || '',
    expert: session.expert || '',
    book: session.book || '',
    counselor: session.counselor || '',
    entry: session.entry || '',
    messages: session.messages,
    createdAt: session.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  const rest = readArchive().filter((item) => item.id !== entry.id);
  writeArchive([entry].concat(rest));
  return entry;
}

// 开新会话：当前会话先归档（有实质内容才入档），然后创建空会话设为当前。
// meta: { topic, expert, book, counselor, entry }，均来自当时的真实选择，供恢复时校验与档案展示。
function start(meta) {
  const source = meta || {};
  archiveActive();
  const now = Date.now();
  const session = {
    id: `sess-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    topic: source.topic || '',
    expert: source.expert || '',
    book: source.book || '',
    counselor: source.counselor || '',
    entry: source.entry || '',
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  writeActive(session);
  return session;
}

// 读取可恢复的当前会话：缺失、只剩开场白或超过恢复窗口时返回 null（过期自动归档）。
function readActiveSession(nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const session = readActive();
  if (!session) return null;
  if (!Array.isArray(session.messages) || session.messages.length <= 1) return null;
  if (!session.updatedAt || now - session.updatedAt > FRESH_WINDOW_MS) {
    archiveSession(session);
    writeActive('');
    return null;
  }
  return session;
}

// 保存当前会话：清洗消息（白名单 + 40 条上限），并刷新标题与视角快照。
function save(messages, meta) {
  const source = meta || {};
  let session = readActive();
  if (!session) {
    // 没有当前会话（异常路径，如存储被系统清理）：重建一个再存，不让对话丢失。
    session = createFallback(source);
    writeActive(session);
  }
  const clean = sanitizeMessages(messages);
  // 只剩开场白（或孤立单条）时不写消息入档：对齐旧对话现场语义，恢复判断也以 >1 条为准。
  session.messages = clean.length > 1 ? clean : [];
  session.topic = source.topic !== undefined ? (source.topic || '') : (session.topic || '');
  if (source.expert !== undefined) session.expert = source.expert || '';
  if (source.book !== undefined) session.book = source.book || '';
  if (source.counselor !== undefined) session.counselor = source.counselor || '';
  if (source.entry !== undefined) session.entry = source.entry || '';
  session.title = titleOf(clean);
  session.updatedAt = Date.now();
  writeActive(session);
  return session;
}

// 当前会话 id（供对话页把后台 AI 摘要回填到正确的会话）；无当前会话返回空串。
function activeId() {
  const session = readActive();
  return session && session.id ? String(session.id) : '';
}

// 回填 AI 会话总结（closeChat / 新开对话后台摘要完成后调用）。
// 优先写归档（摘要返回时对话通常已结束归档）；会话还在当前位（用户又点开了它）则写当前位。
function updateSummary(id, summary) {
  const text = typeof summary === 'string' ? summary.trim().slice(0, SUMMARY_MAX_CHARS) : '';
  if (!id || !text) return false;
  const archive = readArchive();
  let hit = false;
  const next = archive.map((item) => {
    if (!item || item.id !== id) return item;
    hit = true;
    return Object.assign({}, item, { summary: text });
  });
  if (hit) return writeArchive(next);
  const active = readActive();
  if (active && active.id === id) {
    active.summary = text;
    return writeActive(active);
  }
  return false;
}

function createFallback(meta) {
  const source = meta || {};
  const now = Date.now();
  return {
    id: `sess-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    topic: source.topic || '',
    expert: source.expert || '',
    book: source.book || '',
    counselor: source.counselor || '',
    entry: source.entry || '',
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

// 归档当前会话并清空当前位；无实质内容时只清位、不入档。返回归档的会话或 null。
function archiveActive() {
  const session = readActive();
  const archived = archiveSession(session);
  writeActive('');
  return archived;
}

// 归档会话列表（新 → 旧），不含完整消息，供档案列表渲染。
function list() {
  return readArchive().map((item) => ({
    id: item.id,
    title: item.title || titleOf(item.messages),
    summary: item.summary || '',
    topic: item.topic || '',
    expert: item.expert || '',
    book: item.book || '',
    counselor: item.counselor || '',
    entry: item.entry || '',
    count: Array.isArray(item.messages) ? item.messages.length : 0,
    createdAt: item.createdAt || 0,
    updatedAt: item.updatedAt || 0
  }));
}

// 取归档会话的完整消息（供恢复渲染）。
function getMessages(id) {
  const found = readArchive().find((item) => item.id === id);
  return found && Array.isArray(found.messages) ? found.messages.slice() : null;
}

// 继续一段归档会话：当前会话先归档，再从最新档案里把目标会话移回当前位。返回会话或 null。
function open(id) {
  if (!id) return null;
  archiveActive();
  const archive = readArchive();
  const found = archive.find((item) => item.id === id);
  if (!found) return null;
  writeArchive(archive.filter((item) => item.id !== id));
  writeActive(Object.assign({}, found, { updatedAt: Date.now() }));
  return found;
}

function remove(id) {
  if (!id) return false;
  const archive = readArchive();
  const rest = archive.filter((item) => item.id !== id);
  if (rest.length === archive.length) return false;
  return writeArchive(rest);
}

// 清空档案与当前会话：「清除聊天记忆 / 清除个人记录」联动调用。
function clearAll() {
  const clearedArchive = writeArchive([]);
  const clearedActive = writeActive('');
  return clearedArchive && clearedActive;
}

module.exports = {
  SESSION_LIMIT,
  MAX_MESSAGES,
  FRESH_WINDOW_MS,
  TITLE_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  sanitizeMessage,
  sanitizeMessages,
  start,
  readActiveSession,
  save,
  activeId,
  updateSummary,
  archiveActive,
  list,
  getMessages,
  open,
  remove,
  clearAll,
  titleOf
};
