const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../services/agent-chat-store');
const storage = require('../services/storage');
const agentMemory = require('../services/agent-memory');

const INTRO = { id: 'intro', role: 'agent', text: '今晚有什么让你难以放松？', done: true };

function harnessStore() {
  const bag = {};
  global.wx = {
    getStorageSync: (key) => (key in bag ? bag[key] : ''),
    setStorageSync: (key, value) => { bag[key] = value; return true; }
  };
  return bag;
}

test('sanitizeMessage keeps safe fields and drops interactive or unfinished bubbles', () => {
  assert.equal(store.sanitizeMessage(null), null);
  assert.equal(store.sanitizeMessage({ role: 'skill-confirm', text: '确认卡' }), null, '技能确认卡不入档');
  assert.equal(store.sanitizeMessage({ role: 'skill-action', text: '订阅卡' }), null, '订阅授权卡不入档');
  assert.equal(store.sanitizeMessage({ role: 'agent', text: '还没生成完', done: false }), null, '流式未完成不入档');
  assert.equal(store.sanitizeMessage({ role: 'user', text: '   ' }), null, '空文本不入档');

  const clean = store.sanitizeMessage({
    id: 'a1', role: 'agent', text: '我在', done: true,
    push: [{ kind: 'sound', id: 'x' }], feedback: 'like',
    ask: { question: 'q', options: ['a', 'b'], done: 'a' }
  });
  assert.deepEqual([clean.id, clean.role, clean.text, clean.done], ['a1', 'agent', '我在', true]);
  assert.equal(clean.push.length, 1);
  assert.equal(clean.feedback, 'like');
  assert.equal(clean.ask.done, 'a', '已作答的选项卡保留');

  const unanswered = store.sanitizeMessage({
    id: 'a2', role: 'agent', text: '选一个？', done: true,
    ask: { question: 'q', options: ['a', 'b'] }
  });
  assert.equal(unanswered.ask, undefined, '未作答的选项卡摘除，恢复后不再可点');

  const safety = store.sanitizeMessage({ id: 's1', role: 'safety', text: '', safety: true });
  assert.ok(safety, '求助面板卡（无文本）保留');
  assert.equal(safety.safety, true);
});

test('save keeps the last 40 messages and skips conversations that never started', () => {
  const bag = harnessStore();
  const flood = [];
  for (let index = 0; index < 60; index += 1) {
    flood.push({ id: `u${index}`, role: 'user', text: `第${index}句`, done: true });
  }
  store.save([INTRO].concat(flood), 'exam');
  const saved = bag[storage.KEYS.agentChat];
  assert.equal(saved.messages.length, store.MAX_MESSAGES);
  assert.equal(saved.messages[saved.messages.length - 1].text, '第59句', '保留最近的消息');
  assert.equal(saved.topic, 'exam');

  store.save([INTRO], '');
  assert.ok(!bag[storage.KEYS.agentChat], '只剩开场白时清空存档而不是写垃圾');
});

test('read returns null for missing, trivial or expired conversations', () => {
  const bag = harnessStore();
  assert.equal(store.read(), null, '没有存档');

  bag[storage.KEYS.agentChat] = { at: Date.now(), topic: '', messages: [INTRO] };
  assert.equal(store.read(), null, '只剩开场白不恢复');

  bag[storage.KEYS.agentChat] = {
    at: Date.now() - store.FRESH_WINDOW_MS - 1000, topic: 'exam',
    messages: [INTRO, { id: 'u1', role: 'user', text: '嗨', done: true }]
  };
  assert.equal(store.read(), null, '超过 12 小时新鲜窗口，跨天自然开新篇');

  bag[storage.KEYS.agentChat] = {
    at: Date.now() - 60 * 1000, topic: 'exam',
    messages: [INTRO, { id: 'u1', role: 'user', text: '嗨', done: true }]
  };
  assert.ok(store.read(), '窗口内正常恢复');
});

test('book scope prevents one book conversation from restoring inside another book', () => {
  const bag = harnessStore();
  const messages = [INTRO, { id: 'u1', role: 'user', text: '聊聊课题分离', done: true }];
  store.save(messages, '', 'courage::courage-task-separation');
  assert.equal(bag[storage.KEYS.agentChat].scope, 'courage::courage-task-separation');
  assert.ok(store.read('courage::courage-task-separation'));
  assert.equal(store.read('mr-toad::mr-toad-ego-states'), null);
  assert.equal(store.read(''), null);
});

test('clear empties the archive', () => {
  const bag = harnessStore();
  store.save([INTRO, { id: 'u1', role: 'user', text: '嗨', done: true }], '');
  assert.ok(bag[storage.KEYS.agentChat]);
  store.clear();
  assert.equal(bag[storage.KEYS.agentChat], '');
  assert.equal(store.read(), null);
});

test('clearing chat memory from the memory page also drops the conversation archive', () => {
  const bag = harnessStore();
  store.save([INTRO, { id: 'u1', role: 'user', text: '有点睡不着', done: true }], '');
  assert.ok(bag[storage.KEYS.agentChat]);
  assert.equal(agentMemory.clearConversationMemory(), true);
  assert.ok(!bag[storage.KEYS.agentChat], '「清除聊天记忆」连带清掉对话现场');
});
