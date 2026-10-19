const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../services/storage');
const { buildUserContext } = require('../utils/agent-context');

function withStorage(store, fn) {
  const original = global.wx;
  global.wx = { getStorageSync: (key) => store[key] || '' };
  try {
    return fn();
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
}

test('builds a context summary from breath sessions, sleep and journal records', () => {
  const now = Date.now();
  const context = withStorage({
    [storage.KEYS.sessions]: [
      { id: 'a', startedAt: now, cycles: 6, completed: true, outcome: 'relieved' },
      { id: 'b', startedAt: now, cycles: 6, completed: true, outcome: 'tense' }
    ],
    [storage.KEYS.sleep]: [{ nightDate: '10月11日', bedTime: '23:30', wakeTime: '07:10', duration: '7小时40分', feeling: '还行' }],
    [storage.KEYS.journal]: [{ date: '10月11日', items: ['室友帮我带了饭', '晚霞很好看'] }]
  }, () => buildUserContext(now));

  assert.ok(context.indexOf('近 7 天完成练习 2 次') !== -1);
  assert.ok(context.indexOf('放松 1 次、差不多 0 次、还紧绷 1 次') !== -1);
  assert.ok(context.indexOf('23:30 上床，07:10 起床') !== -1);
  assert.ok(context.indexOf('感受「还行」') !== -1);
  assert.ok(context.indexOf('室友帮我带了饭；晚霞很好看') !== -1);
  assert.ok(context.indexOf('不要一次性罗列') !== -1);
});

test('returns empty context when the user has no records yet', () => {
  // 用白天时间戳：作息行仅夜间注入，保证新用户上下文为空。
  const context = withStorage({}, () => buildUserContext(new Date('2026-10-12T15:00:00').getTime()));
  assert.equal(context, '');
});

test('tolerates partial records and skips empty journal items', () => {
  const now = Date.now();
  const context = withStorage({
    [storage.KEYS.journal]: [{ date: '', items: ['', '   ', '今天喝到了好喝的奶茶'] }]
  }, () => buildUserContext(now));
  assert.ok(context.indexOf('今天喝到了好喝的奶茶') !== -1);
  assert.equal(context.indexOf('undefined'), -1);
});

test('adds the recent module activity line from the agent port', () => {
  const now = Date.now();
  const context = withStorage({
    [storage.KEYS.agentEvents]: [{ id: 'e1', module: 'breathe', kind: 'practice_done', text: '完成呼吸练习 6 轮', chat: '', at: now - 1000, handed: false }]
  }, () => buildUserContext(now));
  assert.ok(context.indexOf('最近几天用户在其他板块做过的事') !== -1);
  assert.ok(context.indexOf('完成呼吸练习 6 轮') !== -1);
});

test('storage failures degrade to empty context without throwing', () => {
  const original = global.wx;
  global.wx = { getStorageSync() { throw new Error('storage broken'); } };
  try {
    assert.equal(buildUserContext(new Date('2026-10-12T15:00:00').getTime()), '');
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
});
