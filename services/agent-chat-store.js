// 夜喵对话现场：把当前对话的消息列表存进本地存储，重进对话页时原样恢复。
// 解决 reLaunch/重启后「首页进对话就清空、只能靠摘要续」的割裂感——
// 恢复的是真实消息（最多 40 条），模型也因此拿到完整上下文而不只是一句摘要。
// 只存安全字段：交互卡（技能确认/订阅授权）与未完成的流式气泡不入档；
// 超过 12 小时自动失效（睡前场景跨天自然开新篇）。
const storage = require('./storage');

const MAX_MESSAGES = 40;
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;

// 单条消息白名单清洗：角色白名单 + 字段裁剪；未作答的选项卡恢复后再点会错位，一律摘除。
function sanitizeMessage(item) {
  if (!item || typeof item !== 'object') return null;
  const allowedRoles = ['user', 'agent', 'skill', 'safety'];
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

// 保存当前对话；只有开场白（≤1 条）时清空存档而不是写垃圾数据。
function save(messages, topic, scope) {
  const list = (Array.isArray(messages) ? messages : [])
    .map(sanitizeMessage)
    .filter(Boolean)
    .slice(-MAX_MESSAGES);
  if (list.length <= 1) return clear();
  return storage.write(storage.KEYS.agentChat, {
    at: Date.now(),
    topic: topic || '',
    scope: scope || '',
    messages: list
  });
}

// 读取可恢复的对话现场；缺失、只剩开场白或超过新鲜窗口时返回 null。
function read(scope) {
  const saved = storage.read(storage.KEYS.agentChat, null);
  if (!saved || !Array.isArray(saved.messages) || saved.messages.length <= 1) return null;
  if (!saved.at || Date.now() - saved.at > FRESH_WINDOW_MS) return null;
  if ((saved.scope || '') !== (scope || '')) return null;
  return saved;
}

function clear() {
  return storage.write(storage.KEYS.agentChat, '');
}

module.exports = { save, read, clear, sanitizeMessage, MAX_MESSAGES, FRESH_WINDOW_MS };
