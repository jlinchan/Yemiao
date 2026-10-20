const test = require('node:test');
const assert = require('node:assert/strict');
const prefs = require('../services/night-preferences');
test('night preferences persist independently of breath settings and clear only memory fields', () => {
  const data = {};
  global.wx = { getStorageSync: (key) => data[key], setStorageSync: (key,value) => { data[key] = value; } };
  prefs.save({ personality:'安静倾听',bedtime:'22:00',concerns:['脑子停不下来'],memoryEnabled:true,fontSize:'大' });
  assert.equal(prefs.read().bedtime,'22:00');
  prefs.clearMemory();
  assert.equal(prefs.read().memoryEnabled,false);
  assert.deepEqual(prefs.read().concerns,[]);
  assert.equal(prefs.read().personality,'安静倾听');
  assert.equal(prefs.read().fontSize,'大');
  assert.equal(Object.keys(data).length,1);
  delete global.wx;
});
test('failed preference writes do not report success', () => {
  global.wx = { getStorageSync: () => null,setStorageSync: () => { throw new Error('full'); } };
  assert.equal(prefs.save({memoryEnabled:true}),null);
  delete global.wx;
});
test('chat mode normalizes legacy and unknown values to the three english modes', () => {
  assert.equal(prefs.normalizeChatMode('深度 Reflect'), 'Reflect', '旧中文混合值兼容');
  assert.equal(prefs.normalizeChatMode('均衡 Mindful'), 'Reframe', '旧 Mindful 值兼容');
  assert.equal(prefs.normalizeChatMode('标准 Reflex'), 'Reflex', '旧中文混合值兼容');
  assert.equal(prefs.normalizeChatMode('Reflect'), 'Reflect', '纯英文值直通');
  assert.equal(prefs.normalizeChatMode('Reframe'), 'Reframe');
  assert.equal(prefs.normalizeChatMode('Reflex'), 'Reflex');
  assert.equal(prefs.normalizeChatMode('随便什么'), 'Reframe', '未知值回落默认');
  assert.equal(prefs.normalizeChatMode(''), 'Reframe', '空值回落默认');
  assert.equal(prefs.read().chatMode, 'Reframe', '默认档为 Reframe');
});
