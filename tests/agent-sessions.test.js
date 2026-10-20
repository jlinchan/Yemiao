const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('../services/agent-sessions');
const storage = require('../services/storage');
const agentMemory = require('../services/agent-memory');

const INTRO = { id: 'intro', role: 'agent', text: '今晚有什么让你难以放松？', done: true };
const USER = (text, id) => ({ id: id || `u-${text}`, role: 'user', text, done: true });

function harnessStore() {
  const bag = {};
  global.wx = {
    getStorageSync: (key) => (key in bag ? bag[key] : ''),
    setStorageSync: (key, value) => { bag[key] = value; return true; }
  };
  return bag;
}

test('sanitizeMessage keeps safe fields and drops interactive or unfinished bubbles', () => {
  assert.equal(sessions.sanitizeMessage(null), null);
  assert.equal(sessions.sanitizeMessage({ role: 'skill-confirm', text: '确认卡' }), null, '技能确认卡不入档');
  assert.equal(sessions.sanitizeMessage({ role: 'skill-action', text: '订阅卡' }), null, '订阅授权卡不入档');
  assert.equal(sessions.sanitizeMessage({ role: 'agent', text: '还没生成完', done: false }), null, '流式未完成不入档');
  assert.equal(sessions.sanitizeMessage({ role: 'user', text: '   ' }), null, '空文本不入档');

  const clean = sessions.sanitizeMessage({
    id: 'a1', role: 'agent', text: '我在', done: true,
    push: [{ kind: 'sound', id: 'x' }], feedback: 'like',
    ask: { question: 'q', options: ['a', 'b'], done: 'a' }
  });
  assert.deepEqual([clean.id, clean.role, clean.text, clean.done], ['a1', 'agent', '我在', true]);
  assert.equal(clean.push.length, 1);
  assert.equal(clean.feedback, 'like');
  assert.equal(clean.ask.done, 'a', '已作答的选项卡保留');

  const unanswered = sessions.sanitizeMessage({
    id: 'a2', role: 'agent', text: '选一个？', done: true,
    ask: { question: 'q', options: ['a', 'b'] }
  });
  assert.equal(unanswered.ask, undefined, '未作答的选项卡摘除，恢复后不再可点');

  const safety = sessions.sanitizeMessage({ id: 's1', role: 'safety', text: '', safety: true });
  assert.ok(safety, '求助面板卡（无文本）保留');
  assert.equal(safety.safety, true);
});

test('start archives the previous session only when it has real content', () => {
  const bag = harnessStore();
  // 没有当前会话：start 只创建
  const first = sessions.start({ topic: '', expert: '', book: '', entry: '' });
  assert.ok(bag[storage.KEYS.agentActive]);
  assert.deepEqual(sessions.list(), [], '没有实质内容的会话不入档');

  // 有实质内容的当前会话：start 时自动归档
  sessions.save([INTRO, USER('最近总是半夜醒')], { topic: 'exam', expert: 'morita', book: '', entry: 'prompt' });
  const second = sessions.start({ topic: '', expert: 'yalom', book: '', entry: '' });
  assert.notEqual(second.id, first.id, 'start 产出新会话 id');
  const archive = sessions.list();
  assert.equal(archive.length, 1);
  assert.equal(archive[0].title, '最近总是半夜醒', '标题取首条用户消息');
  assert.equal(archive[0].expert, 'morita', '归档保留当时的视角快照');
  assert.equal(archive[0].topic, 'exam');
  assert.ok(bag[storage.KEYS.agentActive], '新会话设为当前');
  assert.equal(JSON.parse(JSON.stringify(bag[storage.KEYS.agentActive])).expert, 'yalom');
});

test('save cleans messages, keeps the last 40 and refreshes title and viewpoints', () => {
  const bag = harnessStore();
  sessions.start({ topic: '', expert: '', book: '', entry: '' });
  const flood = [];
  for (let index = 0; index < 60; index += 1) {
    flood.push({ id: `u${index}`, role: 'user', text: `第${index}句`, done: true });
  }
  const saved = sessions.save([INTRO].concat(flood), { topic: 'exam', expert: 'morita', book: 'perlis-cbti', entry: 'prompt' });
  assert.equal(saved.messages.length, sessions.MAX_MESSAGES);
  assert.equal(saved.messages[saved.messages.length - 1].text, '第59句', '保留最近的消息');
  assert.equal(saved.title, '第20句', '标题取首条用户消息（裁剪后剩余的最早一条）');
  assert.equal(saved.expert, 'morita');
  assert.equal(saved.book, 'perlis-cbti');
  assert.equal(saved.entry, 'prompt');

  sessions.save([INTRO], {});
  assert.equal(sessions.readActiveSession(), null, '只剩开场白的会话不恢复');
  assert.equal(bag[storage.KEYS.agentActive].messages.length, 0, '当前会话保留元数据、清空消息');
});

test('readActiveSession returns null for missing, trivial or expired sessions', () => {
  const bag = harnessStore();
  assert.equal(sessions.readActiveSession(), null, '没有当前会话');

  bag[storage.KEYS.agentActive] = { id: 's1', updatedAt: Date.now(), messages: [INTRO] };
  assert.equal(sessions.readActiveSession(), null, '只剩开场白不恢复');

  const expired = { id: 's2', updatedAt: Date.now() - sessions.FRESH_WINDOW_MS - 1000, messages: [INTRO, USER('嗨')] };
  bag[storage.KEYS.agentActive] = expired;
  assert.equal(sessions.readActiveSession(), null, '超过 12 小时恢复窗口，跨天自然开新篇');
  assert.equal(sessions.list().length, 1, '过期会话自动归档，不丢内容');

  bag[storage.KEYS.agentActive] = { id: 's3', updatedAt: Date.now() - 60 * 1000, messages: [INTRO, USER('嗨')] };
  assert.ok(sessions.readActiveSession(), '窗口内正常恢复');
});

test('open moves an archived session back to active and archives whatever was current', () => {
  const bag = harnessStore();
  const first = sessions.start({});
  sessions.save([INTRO, USER('第一段对话')], { expert: 'morita', book: '', entry: '' });
  sessions.start({ expert: 'yalom' });
  sessions.save([INTRO, USER('第二段对话')], { expert: 'yalom', book: '', entry: '' });

  const list = sessions.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, '第一段对话');

  const opened = sessions.open(list[0].id);
  assert.ok(opened, '归档会话可以继续');
  assert.equal(bag[storage.KEYS.agentActive].title, '第一段对话', '目标会话回到当前位');
  assert.equal(sessions.list().length, 1, '原当前会话被顶替归档');
  assert.equal(sessions.list()[0].title, '第二段对话', '归档列表新→旧');
  assert.equal(sessions.open(list[0].id) && true, true, '再次 open 时该会话已在当前位');
  assert.equal(sessions.open('nope'), null, '未知 id 静默');
  assert.ok(first, '首个会话引用保留');
});

test('updateSummary files the AI wrap-up into the archived or active session', () => {
  const bag = harnessStore();
  sessions.start({});
  sessions.save([INTRO, USER('最近总是半夜醒')], {});
  const liveId = sessions.activeId();
  assert.ok(liveId, '当前会话有 id');

  // 会话还在当前位：摘要写进当前位
  assert.equal(sessions.updateSummary(liveId, '用户倾诉半夜醒来睡不着的困扰'), true);
  assert.equal(bag[storage.KEYS.agentActive].summary, '用户倾诉半夜醒来睡不着的困扰');

  // 归档后：摘要按 id 回填档案条目
  sessions.start({});
  const archive = sessions.list();
  assert.equal(archive[0].summary, '用户倾诉半夜醒来睡不着的困扰', '归档条目保留 AI 总结');

  // 超长截断 + 空/未知 id 静默
  const long = '一'.repeat(60);
  assert.equal(sessions.updateSummary(archive[0].id, long), true);
  assert.equal(sessions.list()[0].summary.length, sessions.SUMMARY_MAX_CHARS, '总结按上限截断');
  assert.equal(sessions.updateSummary(archive[0].id, '  '), false, '空白总结不入档');
  assert.equal(sessions.updateSummary('', '随便'), false, '空 id 静默');
  assert.equal(sessions.updateSummary('sess-nope', '没有这个会话'), false, '未知 id 静默');
});

test('remove and clearAll keep the archive private and bounded', () => {
  const bag = harnessStore();
  sessions.start({});
  sessions.save([INTRO, USER('a')], {});
  sessions.start({});
  sessions.save([INTRO, USER('b')], {});
  const list = sessions.list();
  assert.equal(list.length, 1);
  assert.equal(sessions.remove(list[0].id), true);
  assert.equal(sessions.list().length, 0);
  assert.equal(sessions.remove(list[0].id), false, '重复删除静默');

  for (let index = 0; index < sessions.SESSION_LIMIT + 5; index += 1) {
    sessions.start({});
    sessions.save([INTRO, USER(`会话${index}`)], {});
  }
  assert.equal(sessions.list().length, sessions.SESSION_LIMIT, '归档上限滚动裁最旧');

  assert.equal(sessions.clearAll(), true);
  assert.equal(sessions.list().length, 0);
  assert.equal(sessions.readActiveSession(), null);
  assert.equal(bag[storage.KEYS.agentActive], '', '当前会话位清空');
});

test('clearing chat memory from the memory page also drops sessions and archive', () => {
  const bag = harnessStore();
  sessions.start({});
  sessions.save([INTRO, USER('有点睡不着')], {});
  sessions.start({});
  sessions.save([INTRO, USER('考试好焦虑')], {});
  assert.ok(sessions.list().length >= 1);
  assert.equal(agentMemory.clearConversationMemory(), true);
  assert.equal(sessions.list().length, 0, '「清除聊天记忆」连带清掉档案');
  assert.equal(sessions.readActiveSession(), null, '当前对话一并清掉');
});

test('sessions carry the counselor view through archive and restore', () => {
  const bag = harnessStore();
  sessions.start({ topic: '', expert: '', book: '', counselor: 'sleep', entry: 'counselor' });
  sessions.save([INTRO, USER('想太多睡不着')], { counselor: 'sleep' });
  assert.equal(sessions.readActiveSession().counselor, 'sleep', '当前会话带陪伴者视角');
  sessions.start({}); // 触发归档
  const archived = sessions.list()[0];
  assert.equal(archived.counselor, 'sleep', '归档条目保留陪伴者视角');
  const opened = sessions.open(archived.id);
  assert.equal(opened.counselor, 'sleep', '恢复时陪伴者视角随会话回来');
  // 未带 counselor 的旧会话字段缺省为空串，行为等同夜喵本体
  sessions.start({});
  sessions.save([INTRO, USER('普通对话')], {});
  assert.equal(sessions.readActiveSession().counselor, '', '旧数据缺省为空串');
});
