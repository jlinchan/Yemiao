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
