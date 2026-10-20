const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../utils/safety-gate');

test('direct critical terms trip the hard gate with a cut index', () => {
  const samples = [
    '我真的不想活了',
    '每天都在想死',
    '有时候想割腕',
    '站在天台边上了',
    '囤了一堆药准备吞药',
    '没有我会更好',
    '想从这个世界上消失',
    '脑子里全是自杀的念头'
  ];
  samples.forEach((text) => {
    const result = gate.scan(text);
    assert.equal(result.level, 'critical', `should trip on: ${text}`);
    assert.ok(result.cutIndex >= 0, `should have a cut index for: ${text}`);
    assert.ok(result.matched.length >= 1);
  });
});

test('separator variants still trip via the normalized pass', () => {
  const samples = ['不 想 活 了', '想*死*', '自——杀', '不，想，活', '跳  楼'];
  samples.forEach((text) => {
    assert.equal(gate.scan(text).level, 'critical', `should trip on: ${text}`);
  });
});

test('normalized hits report cutIndex -1 (original text untouched)', () => {
  const result = gate.scan('不 想 活 了');
  assert.equal(result.level, 'critical');
  assert.equal(result.cutIndex, -1);
  assert.ok(result.matched.every((item) => item.index === -1));
});

test('elevated distress without action intent stays conversational', () => {
  const samples = ['最近要崩溃了', '真的撑不住了', '活着好难啊', '想消失一阵子', '我emo了'];
  samples.forEach((text) => {
    const result = gate.scan(text);
    assert.equal(result.level, 'elevated', `should be elevated: ${text}`);
    assert.equal(result.cutIndex, -1);
  });
});

test('ordinary bedtime talk stays normal', () => {
  const samples = [
    '今天考试好难，睡不着',
    '室友好吵，想听点雨声',
    '明天要交论文了',
    '今天跑完步很累但是很爽',
    '笑死我了哈哈哈哈',
    '吓死我了，刚才打雷',
    '不想起床上班',
    '结束工作终于躺下了'
  ];
  samples.forEach((text) => {
    assert.equal(gate.scan(text).level, 'normal', `should stay normal: ${text}`);
  });
});

test('scan keeps matched terms and prefers the earliest cut index', () => {
  const result = gate.scan('刚才还好，现在不想活了，想跳楼');
  assert.equal(result.level, 'critical');
  const originalIndexes = result.matched.filter((item) => item.index >= 0).map((item) => item.index);
  assert.ok(originalIndexes.length >= 1, 'at least one original-text hit should exist');
  assert.equal(result.cutIndex, Math.min(...originalIndexes));
});

test('safety reply and help card carry actionable channels', () => {
  const reply = gate.buildSafetyReply();
  assert.ok(reply.indexOf('88982525') !== -1, 'campus center phone should be in the reply');
  assert.ok(reply.indexOf('12356') !== -1);
  assert.ok(reply.indexOf('96525') !== -1, 'zhejiang provincial hotline should be in the reply');
  assert.ok(reply.indexOf('辅导员') !== -1);
  assert.ok(reply.indexOf('120') !== -1);
  const card = gate.buildHelpCard();
  const center = card.channels.find((ch) => ch.key === 'center');
  assert.ok(center, 'campus center channel should exist');
  assert.equal(center.contact, '88982525');
  assert.equal(center.copy, '88982525');
  assert.equal(card.banner, '/assets/agent/safety-banner.jpg', 'banner illustration wired');
  const contacts = card.channels.map((ch) => ch.contact).join(' ');
  assert.ok(contacts.indexOf('96525') !== -1, 'zhejiang hotline should be a channel row');
  assert.ok(contacts.indexOf('12356') !== -1, 'national hotline should be listed');
  assert.ok(contacts.indexOf('120') !== -1, 'emergency number should be listed');
  assert.ok(card.channels.every((ch) => typeof ch.name === 'string' && ch.name.length > 0));
  assert.ok(Array.isArray(card.hours) && card.hours.length === 2, 'both weekday and weekend hours');
  assert.ok(card.hours.join(' ').indexOf('88982525') === -1);
  assert.ok(card.link.indexOf('xlzx.zju.edu.cn') !== -1, 'official site link present');
  assert.ok(card.title.length > 0);
});

test('regional hotline directory is wired through safety-gate', () => {
  assert.ok(Array.isArray(gate.SAFETY_REGIONS) && gate.SAFETY_REGIONS.length >= 30, 'all provinces covered');
  const zhejiang = gate.SAFETY_REGIONS[0];
  assert.equal(zhejiang.key, 'zhejiang', 'zhejiang is the default region');
  const zhejiangContacts = zhejiang.hotlines.map((line) => line.contact).join(' ');
  assert.ok(zhejiangContacts.indexOf('96525') !== -1);
  assert.ok(zhejiangContacts.indexOf('0571-85029595') !== -1);
  const national = gate.SAFETY_REGIONS.find((region) => region.key === 'national');
  const nationalContacts = national.hotlines.map((line) => line.contact).join(' ');
  assert.ok(nationalContacts.indexOf('12356') !== -1);
  assert.ok(nationalContacts.indexOf('010-82951332') !== -1);
  assert.ok(nationalContacts.indexOf('4009678920') !== -1);
});

test('elevated note instructs the model to stay safe', () => {
  const note = gate.elevatedNote();
  assert.ok(note.indexOf('12356') !== -1);
  assert.ok(note.indexOf('不评判') !== -1);
  assert.ok(note.indexOf('绝不输出') !== -1);
});

test('scan is robust against empty and non-string input', () => {
  assert.deepEqual(gate.scan(''), { level: 'normal', matched: [], cutIndex: -1 });
  assert.equal(gate.scan(null).level, 'normal');
  assert.equal(gate.scan(undefined).level, 'normal');
});

test('pinyin full spellings, initials and mixed-literal evasion trip the gate', () => {
  assert.equal(gate.scan('zisha').level, 'critical');
  assert.equal(gate.scan('wobuxianghuole').level, 'critical', 'continuous pinyin without spaces still hits');
  assert.equal(gate.scan('我只想zs').level, 'critical');
  assert.equal(gate.scan('bu xiang huo').level, 'critical', 'separator-split pinyin reassembles via normalize');
  assert.equal(gate.scan('我不想自s了').level, 'critical');
  assert.equal(gate.scan('bengkui').level, 'elevated', 'elevated pinyin upgrades the level');
  const hit = gate.scan('我不想zs了');
  assert.equal(hit.level, 'critical');
  assert.equal(hit.cutIndex, 3, 'cut index points at the first latin char in raw text');
  assert.ok(hit.matched.some((item) => item.term === 'zs(自杀)'), 'matched entry reports the source word');
  assert.equal(gate.scan('settle down and read a book').level, 'normal', 'tl initial requires word boundaries');
  assert.equal(gate.scan('xiaoshuo').level, 'normal', 'unrelated continuous pinyin stays normal');
});
