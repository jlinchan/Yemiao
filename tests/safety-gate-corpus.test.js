// 夜喵危机安全门 · 回归语料测试（tests/fixtures/safety-corpus.json）。
// 语料类别框架参照 SOS-1K（细粒度自杀风险标注）与 PsyCrisis-Bench 的设计维度，
// 条目全部为本项目自写改述，不包含任何数据集原文；SOS-1K 原始数据仅用于本地校准
// （node tools/safety-corpus-calibrate.js），不随仓库分发。
//
// 断言原则（与 README「宁滥勿缺」一致）：
// - critical 档：零漏报。任何一条只判成 elevated/normal 都直接红。
// - elevated 档：不允许回到 normal（critical 更严也可接受，但本语料刻意排除该重叠）。
// - normal 档：零误报。已知且接受的误报用 todo 用例固化，防止有人「顺手修」后忘记复核。

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const gate = require('../utils/safety-gate');

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'safety-corpus.json'), 'utf8'));

test('corpus fixture is well formed and counts match meta', () => {
  for (const tier of ['critical', 'elevated', 'normal']) {
    assert.ok(Array.isArray(corpus[tier]) && corpus[tier].length > 0, `tier ${tier} should not be empty`);
    corpus[tier].forEach((entry) => {
      assert.ok(entry.text && entry.text.trim(), `entry in ${tier} must carry text`);
      assert.ok(entry.tag, `entry in ${tier} must carry a tag`);
    });
    assert.equal(corpus[tier].length, corpus.meta.counts[tier], `meta.counts.${tier} out of sync`);
  }
  // 去重护栏：同一句在 critical 与 normal 同时出现会让断言互相打架。
  const all = [...corpus.critical, ...corpus.elevated, ...corpus.normal].map((entry) => entry.text);
  assert.equal(new Set(all).size, all.length, 'corpus entries must be unique');
});

test('critical corpus: zero misses allowed (宁滥勿缺)', () => {
  const missed = [];
  corpus.critical.forEach((entry) => {
    const result = gate.scan(entry.text);
    if (result.level !== 'critical') missed.push(`[${entry.tag}] ${entry.text} -> ${result.level}`);
  });
  assert.deepEqual(missed, [], `critical misses must be fixed in the word lists:\n${missed.join('\n')}`);
});

test('critical corpus: every hit reports matched terms', () => {
  corpus.critical.forEach((entry) => {
    const result = gate.scan(entry.text);
    assert.ok(result.matched.length >= 1, `no matched term reported for: ${entry.text}`);
  });
});

test('elevated corpus: never demoted to normal', () => {
  const leaked = [];
  corpus.elevated.forEach((entry) => {
    const result = gate.scan(entry.text);
    if (result.level === 'normal') leaked.push(`[${entry.tag}] ${entry.text}`);
  });
  assert.deepEqual(leaked, [], `elevated texts must not scan as normal:\n${leaked.join('\n')}`);
});

test('normal corpus: zero false positives', () => {
  const flagged = [];
  corpus.normal.forEach((entry) => {
    const result = gate.scan(entry.text);
    if (result.level !== 'normal') flagged.push(`[${entry.tag}] ${entry.text} -> ${result.level} (${result.matched.map((m) => m.term).join(',')})`);
  });
  assert.deepEqual(flagged, [], `normal texts must stay normal:\n${flagged.join('\n')}`);
});

// —— 已知且接受的误报（词表头注释与 README 均有记录）——
// 用 todo 固化：如果哪天这些用例转绿（词表收窄或匹配策略升级），记得同步复核
// 「宁滥勿缺」的召回没有被牺牲，再把它们搬进 normal 语料。
test('known FP: zisha also means 紫砂 (tea ware)', { todo: true }, () => {
  assert.equal(gate.scan('想买一套 zisha 茶具').level, 'normal');
});

test('known FP: shale is an English rock word', { todo: true }, () => {
  assert.equal(gate.scan('the shale layer is thick').level, 'normal');
});

test('known FP: 杀死 in movie titles', { todo: true }, () => {
  assert.equal(gate.scan('杀死比尔这部电影真好看').level, 'normal');
});

test('known FP: 跳楼机 is an amusement ride', { todo: true }, () => {
  assert.equal(gate.scan('游乐园的跳楼机好刺激').level, 'normal');
});

test('known FP: 解脱了 as exam relief', { todo: true }, () => {
  assert.equal(gate.scan('考完最后一门，解脱了').level, 'normal');
});

test('known FP: 不想活动被取消 after normalization', { todo: true }, () => {
  assert.equal(gate.scan('不 想 活动被取消了').level, 'normal');
});
