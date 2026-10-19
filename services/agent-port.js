// 夜喵 Agent 端口：整个小程序为 Agent 预留的统一接入点。
// 每个板块在这里注册一个适配器，声明两件事：
//   1. snapshot(now)：对话时 Agent 能看到的该板块摘要（只读，一行以内，没有记录就返回空串）；
//   2. events：板块会向 Agent 汇报的事件；text 进「近况」上下文行，
//      带 chatText 的事件还会在用户回到对话时留一句回执。
// 汇报由板块页面在用户完成动作时调用 publish；对话内技能执行不重复汇报——
// 对话本身就是记录。记忆 / 约定 / 心事 / 消息中心是 Agent 自己的家，不走端口。

const storage = require('./storage');

const EVENT_LIMIT = 40;
const RECENT_WINDOW_MS = 72 * 60 * 60 * 1000;
const RECENT_LIMIT = 4;
const HANDOFF_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const GUIDE_HISTORY_LIMIT = 60;

const FEELING_LABELS = { 1: '很差', 2: '较差', 3: '一般', 4: '不错', 5: '很好' };
const OUTCOME_LABELS = { relieved: '放松', same: '差不多', tense: '还紧绷' };
const SOUND_NAMES = { rain: '雨声', breeze: '微风', lake: '湖水', white: '白噪音' };

function safeValue(reader, fallback) {
  try {
    const value = reader();
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function textItems(entry, limit) {
  return (Array.isArray(entry.items) ? entry.items : [])
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, limit);
}

// 板块清单：snapshot 给对话上下文，events 是向 Agent 的汇报口径。
const MODULES = [
  {
    id: 'breathe',
    title: '呼吸练习',
    skills: [],
    snapshot(now) {
      const sessions = safeValue(() => storage.getSessions(), []);
      if (!Array.isArray(sessions) || !sessions.length) return '';
      const totalCycles = sessions.reduce((sum, item) => sum + (Number(item.cycles) || 0), 0);
      const bodyCount = sessions.filter((item) => item && (item.bodyPart || item.bodyPartName)).length;
      const summary = safeValue(() => storage.getSevenDaySummary(now, sessions), null);
      if (!summary) return '';
      const { completedSessions, activeDays, outcomes } = summary;
      const feeling = `放松 ${outcomes.relieved} 次、差不多 ${outcomes.same} 次、还紧绷 ${outcomes.tense} 次`;
      return `用户累计完成 ${totalCycles} 轮呼吸${bodyCount ? `（含身体扫描 ${bodyCount} 次）` : ''}；近 7 天完成练习 ${completedSessions} 次（${activeDays} 天有练习），练后自评：${feeling}。`;
    },
    events: {
      practice_done: {
        text(data) {
          const cycles = Number(data.cycles) || 0;
          return data.mode === 'body' ? `完成身体扫描 ${cycles} 轮` : `完成呼吸练习 ${cycles} 轮`;
        },
        chatText(data) {
          const cycles = Number(data.cycles) || 0;
          if (data.mode === 'body') return data.completed ? `「身体扫描」走完了，${cycles} 轮。` : `你刚做了一段身体扫描，停在 ${cycles} 轮也很好。`;
          return data.completed ? `你刚做完 ${cycles} 轮呼吸练习。` : `你刚做了 ${cycles} 轮呼吸练习，先到这里也很好。`;
        }
      },
      practice_rated: {
        text(data) {
          return `练后自评：${OUTCOME_LABELS[data.outcome] || '已记录'}`;
        }
      }
    }
  },
  {
    id: 'sleep',
    title: '睡眠记录',
    skills: [],
    snapshot() {
      const records = safeValue(() => storage.read(storage.KEYS.sleep, []), []);
      const last = Array.isArray(records) ? records[0] : null;
      if (!last || !last.bedTime) return '';
      const when = last.nightDate || last.date || '最近一晚';
      const duration = last.duration || '时长未记录';
      const raw = Number(last.feeling);
      const feeling = FEELING_LABELS[raw] || (last.feeling ? String(last.feeling) : '未记录');
      return `最近一晚睡眠（${when}）：${last.bedTime} 上床，${last.wakeTime || '起床时间未记录'} 起床，${duration}，感受「${feeling}」。`;
    },
    events: {
      sleep_saved: {
        text(data) {
          return `记下「${data.date || '这一晚'}」的睡眠`;
        },
        chatText(data) {
          const when = data.date || '这一晚';
          return data.duration ? `记下了 ${when} 这一晚的睡眠：${data.duration}。` : `记下了 ${when} 这一晚的睡眠。`;
        }
      }
    }
  },
  {
    id: 'journal',
    title: '感恩日记',
    skills: ['journal', 'dream_log'],
    snapshot() {
      const entries = safeValue(() => storage.read(storage.KEYS.journal, []), []);
      if (!Array.isArray(entries) || !entries.length) return '';
      const lines = [];
      const last = entries.find((item) => item && item.kind !== 'dream');
      if (last) {
        const items = textItems(last, 3);
        if (items.length) lines.push(`最近的感恩日记（${last.date || '日期未记录'}）：${items.join('；')}。`);
      }
      const dream = entries.find((item) => item && item.kind === 'dream');
      if (dream) {
        const items = textItems(dream, 3);
        if (items.length) lines.push(`最近记下的梦（${dream.date || '日期未记录'}）：${items.join('；')}。`);
      }
      return lines.join('\n');
    },
    events: {
      journal_saved: {
        text() {
          return '写下了感恩日记';
        },
        chatText() {
          return '今天的感恩日记收好了。';
        }
      }
    }
  },
  {
    id: 'guide',
    title: '入睡引导',
    skills: ['bedtime_guide'],
    snapshot(now) {
      const saved = safeValue(() => storage.read(storage.KEYS.guideSessions, []), []);
      const since = now - 7 * 24 * 60 * 60 * 1000;
      const recent = (Array.isArray(saved) ? saved : []).filter((item) => item && item.completed && Number(item.at) >= since);
      if (!recent.length) return '';
      const counts = {};
      recent.forEach((item) => {
        const title = item.title || '入睡引导';
        counts[title] = (counts[title] || 0) + 1;
      });
      const detail = Object.keys(counts).map((title) => `${title} ${counts[title]} 次`).join('、');
      return `用户近 7 天走完了 ${recent.length} 次入睡引导（${detail}）。`;
    },
    events: {
      guide_done: {
        text(data) {
          return `走完入睡引导「${data.title || '入睡引导'}」`;
        },
        chatText(data) {
          return `「${data.title || '入睡引导'}」走完了。晚安，睡个好觉。`;
        }
      },
      guide_ended: {
        text(data) {
          return `入睡引导「${data.title || '入睡引导'}」中途停下`;
        }
      }
    }
  },
  {
    id: 'sound',
    title: '环境声',
    skills: ['play_sound', 'stop_sound'],
    snapshot() {
      const app = typeof getApp === 'function' ? getApp() : null;
      const state = app && app.globalData ? app.globalData.audioState : null;
      if (!state || !state.playing) return '';
      const name = SOUND_NAMES[String(state.sound || '')] || '环境声';
      return `此刻正给用户放着${name}（${Number(state.timerMinutes) || 30} 分钟定时）。`;
    },
    events: {
      sound_played: {
        text(data) {
          const name = SOUND_NAMES[data.sound] || '环境声';
          return data.minutes ? `开始听${name}（${data.minutes} 分钟定时）` : `开始听${name}`;
        }
      },
      sound_stopped: {
        text(data) {
          const name = SOUND_NAMES[data.sound] || '环境声';
          return `关掉了${name}`;
        }
      }
    }
  },
  {
    id: 'focus',
    title: '关灯',
    skills: [],
    // 关灯没有历史落盘，只报动作：快照恒为空，不占上下文行。
    snapshot() {
      return '';
    },
    events: {
      focus_started: {
        text() {
          return '开始关灯，准备休息';
        },
        chatText() {
          return '关灯了。屏幕安静下来，剩下的交给明天。';
        }
      }
    }
  }
];

function byId(moduleId) {
  return MODULES.find((item) => item.id === moduleId) || null;
}

function readEvents() {
  const saved = storage.read(storage.KEYS.agentEvents, []);
  return Array.isArray(saved) ? saved : [];
}

function writeEvents(events) {
  return storage.write(storage.KEYS.agentEvents, events.slice(0, EVENT_LIMIT));
}

function buildText(builder, data) {
  try {
    const text = builder ? builder(data) : '';
    return typeof text === 'string' ? text.trim() : '';
  } catch (error) {
    return '';
  }
}

// 板块页面完成动作时调用：落一条事件，返回落库的那条；未知模块 / 未知事件静默忽略。
function publish(moduleId, kind, data) {
  const adapter = byId(moduleId);
  const spec = adapter && adapter.events ? adapter.events[kind] : null;
  if (!spec) return null;
  const payload = data && typeof data === 'object' ? data : {};
  const text = buildText(spec.text, payload);
  const chat = buildText(spec.chatText, payload);
  if (!text && !chat) return null;
  const at = Date.now();
  const event = {
    id: `evt-${at}-${Math.random().toString(36).slice(2, 7)}`,
    module: moduleId,
    kind,
    text,
    chat,
    at,
    handed: false
  };
  writeEvents([event].concat(readEvents()));
  return event;
}

// 对话上下文里的板块摘要行（每板块一行，没有内容的板块不出行）。
function snapshotLines(nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  return MODULES.map((adapter) => safeValue(() => adapter.snapshot(now), '')).filter(Boolean);
}

function dayLabel(at, now) {
  const date = new Date(at);
  const base = new Date(now);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, base)) return '今天';
  if (sameDay(date, new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1))) return '昨天';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

// 近三天的板块动态行：同一类事只留最新一条，最多四条。
function recentSummary(nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const events = readEvents().filter((item) => item && item.text && item.at && now - item.at <= RECENT_WINDOW_MS && now - item.at >= 0);
  const seen = {};
  const picked = [];
  events.forEach((item) => {
    const key = `${item.module}:${item.kind}`;
    if (seen[key]) return;
    seen[key] = true;
    if (picked.length < RECENT_LIMIT) picked.push(item);
  });
  if (!picked.length) return '';
  const items = picked.map((item) => `${dayLabel(item.at, now)}${item.text}`);
  return `最近几天用户在其他板块做过的事（自动记录，相关时自然带一句）：${items.join('；')}。`;
}

// 回到对话时取回执：只认半天内、带 chatText 的事件（旧的静默作废），取回即标已消费。
// 返回按发生时间从早到晚排列，对话里按顺序逐条浮现。
function takeHandoffs(nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const events = readEvents();
  const chosen = [];
  let changed = false;
  const next = events.map((item) => {
    if (!item || !item.chat || item.handed) return item;
    changed = true;
    if (now - item.at <= HANDOFF_MAX_AGE_MS) chosen.push(item);
    return Object.assign({}, item, { handed: true });
  });
  if (changed) writeEvents(next);
  return chosen.reverse();
}

module.exports = {
  MODULES,
  GUIDE_HISTORY_LIMIT,
  byId,
  publish,
  snapshotLines,
  recentSummary,
  takeHandoffs
};
