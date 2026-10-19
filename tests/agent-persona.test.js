const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../services/storage');
const nightPreferences = require('../services/night-preferences');
const agentPersona = require('../utils/agent-persona');
const { buildUserContext } = require('../utils/agent-context');

function withStore(store, fn) {
  const original = global.wx;
  global.wx = {
    getStorageSync: (key) => (key in store ? store[key] : ''),
    setStorageSync: (key, value) => { store[key] = value; return true; }
  };
  try {
    return fn();
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
}

test('persona prompt reflects personality and companion changes in real time', () => {
  withStore({}, () => {
    const base = agentPersona.buildPersonaPrompt();
    assert.ok(base.indexOf('温柔陪伴') !== -1);
    nightPreferences.save({ personality: '简洁高效', companion: '喜欢短时间练习' });
    const next = agentPersona.buildPersonaPrompt();
    assert.ok(next.indexOf('回复尽量短') !== -1);
    assert.ok(next.indexOf('喜欢短时间练习') !== -1);
  });
});

test('persona context includes concerns and bedtime awareness', () => {
  withStore({}, () => {
    nightPreferences.save({ concerns: ['睡前容易焦虑'], bedtime: '23:00' });
    const late = agentPersona.buildPersonaContext(new Date('2026-10-12T23:40:00').getTime());
    assert.ok(late.indexOf('睡前容易焦虑') !== -1);
    assert.ok(late.indexOf('已过其作息点') !== -1);
    const early = agentPersona.buildPersonaContext(new Date('2026-10-12T15:00:00').getTime());
    assert.equal(early.indexOf('作息点'), -1); // 白天不注入作息信息
    const earlyNight = agentPersona.buildPersonaContext(new Date('2026-10-12T21:00:00').getTime());
    assert.ok(earlyNight.indexOf('尚未到其作息点') !== -1);
  });
});

test('memory injection is gated by the memory switch in settings', () => {
  const now = Date.now();
  withStore({
    [storage.KEYS.agentMemory]: [{ at: now, topic: '', summary: '考试焦虑' }]
  }, () => {
    // 开关默认关闭：即使有记忆也不注入
    assert.equal(buildUserContext(now).indexOf('考试焦虑'), -1);
    nightPreferences.save({ memoryEnabled: true });
    assert.ok(buildUserContext(now).indexOf('考试焦虑') !== -1);
  });
});
