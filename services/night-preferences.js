const storage = require('./storage');
const KEY = 'sleepwell.night.preferences.v1';
const DEFAULTS = { personality: '温柔陪伴', voice: '温柔女声', bedtime: '23:00', companion: '温柔陪伴', concerns: [], memoryEnabled: false, suggestions: true, question: '什么让你难以放松？', display: '完整模式', fontSize: '标准', expert: '', book: '', ttsEnabled: false, chatMode: 'Reframe' };
// 对话模式归一化（2026-10-19 Reflex/Reframe/Reflect 纯英文值）：
// 兼容历史残留值（如「深度 Reflect」「均衡 Mindful」），未知值回落 Reframe。
function normalizeChatMode(value) {
  const text = String(value || '');
  if (text.indexOf('Reflect') !== -1) return 'Reflect';
  if (text.indexOf('Reframe') !== -1 || text.indexOf('Mindful') !== -1) return 'Reframe';
  if (text.indexOf('Reflex') !== -1) return 'Reflex';
  return 'Reframe';
}
function read() { return Object.assign({}, DEFAULTS, storage.read(KEY, {})); }
function save(changes) { const next = Object.assign({}, read(), changes); return storage.write(KEY, next) ? next : null; }
function clearMemory() { return save({ bedtime: '23:00', companion: '温柔陪伴', concerns: [], memoryEnabled: false }); }
// 「清除个人记录」联动：只清个人数据（心事清单/记忆开关/求助地区），
// 人格、音色、就寝时间、显示偏好等纯设置保留。
function clearPersonalData() { return save({ concerns: [], memoryEnabled: false, safetyRegion: '' }); }
module.exports = { read, save, clearMemory, clearPersonalData, normalizeChatMode };
