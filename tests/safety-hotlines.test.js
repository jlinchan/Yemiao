const test = require('node:test');
const assert = require('node:assert/strict');
const { SAFETY_REGIONS } = require('../utils/safety-hotlines');

test('directory shape: every region has a key, name and non-empty hotline list', () => {
  assert.ok(SAFETY_REGIONS.length >= 30, 'should cover 30+ region groups');
  const keys = new Set();
  SAFETY_REGIONS.forEach((region) => {
    assert.ok(region.key && region.name, `region needs key/name: ${region.key}`);
    assert.ok(!keys.has(region.key), `duplicate region key: ${region.key}`);
    keys.add(region.key);
    assert.ok(Array.isArray(region.hotlines) && region.hotlines.length >= 1, `${region.key} needs hotlines`);
    region.hotlines.forEach((line) => {
      assert.ok(line.name && line.name.length > 0, `${region.key} hotline needs a name`);
      assert.ok(line.contact && line.contact.length > 0, `${region.key}/${line.name} needs a contact`);
      if (line.copy) assert.equal(typeof line.copy, 'string');
    });
  });
});

test('default region is zhejiang with the provincial 24h lines', () => {
  assert.equal(SAFETY_REGIONS[0].key, 'zhejiang');
  const contacts = SAFETY_REGIONS[0].hotlines.map((line) => line.contact).join(' ');
  assert.ok(contacts.indexOf('96525') !== -1, 'zhejiang unified hotline');
  assert.ok(contacts.indexOf('0571-85029595') !== -1, 'hangzhou crisis line');
  assert.ok(contacts.indexOf('0571-85109955') !== -1, 'zhejiang college line');
});

test('national group carries the nationwide entry points', () => {
  const national = SAFETY_REGIONS.find((region) => region.key === 'national');
  assert.ok(national, 'national group exists');
  const contacts = national.hotlines.map((line) => line.contact).join(' ');
  ['12356', '12320', '12355', '12338', '010-82951332', '4009678920', '4006-525-521'].forEach((number) => {
    assert.ok(contacts.indexOf(number) !== -1, `national list should include ${number}`);
  });
});

test('every user-provided province group is present', () => {
  const keys = SAFETY_REGIONS.map((region) => region.key);
  ['beijing', 'tianjin', 'hebei', 'neimenggu', 'shanghai', 'jiangsu', 'shandong', 'shanxi', 'anhui',
    'hubei', 'hunan', 'jiangxi', 'henan', 'guangdong', 'guangxi', 'fujian', 'heilongjiang', 'jilin',
    'liaoning', 'sichuan', 'chongqing', 'guizhou', 'yunnan', 'xizang', 'shaanxi', 'qinghai', 'gansu',
    'ningxia', 'xinjiang', 'hainan'].forEach((key) => {
    assert.ok(keys.indexOf(key) !== -1, `missing region: ${key}`);
  });
});

test('copy field is dialable: no spaces or separators beyond digits and dashes', () => {
  SAFETY_REGIONS.forEach((region) => {
    region.hotlines.forEach((line) => {
      if (!line.copy) return;
      assert.match(line.copy, /^[0-9][0-9\-]*$/, `${region.key}/${line.name} copy should be dialable: ${line.copy}`);
    });
  });
});
