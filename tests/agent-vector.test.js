// 端内语义向量引擎 + 记忆语义召回的单元与集成测试。
// 阈值口径与实测依据见 docs/agent-vector-plan.md。
const test = require('node:test');
const assert = require('node:assert/strict');
const vector = require('../services/agent-vector');
const storage = require('../services/storage');
const { buildUserContext } = require('../utils/agent-context');

function withStorage(store, fn) {
  const original = global.wx;
  global.wx = {
    getStorageSync: (key) => (store && store[key]) || '',
    setStorageSync: (key, value) => { store[key] = value; return true; }
  };
  try {
    return fn();
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
}

const PREFS_KEY = 'sleepwell.night.preferences.v1';

test('tokenize emits CJK unigrams, adjacent bigrams and ascii words', () => {
  // 二元组跨词界也生成（如 试焦），由停用词与证据门槛在检索层压制噪声。
  assert.deepEqual(vector.tokenize('考试焦虑'), ['考', '试', '考试', '焦', '试焦', '虑', '焦虑']);
  assert.deepEqual(vector.tokenize('OK 明天123'), ['ok', '明', '天', '明天', '123']);
  assert.deepEqual(vector.tokenize('睡不着！'), ['睡', '不', '睡不', '着', '不着']);
  assert.deepEqual(vector.tokenize(''), []);
  assert.deepEqual(vector.tokenize(null), []);
});

test('isEvidenceToken accepts bigrams and words, rejects single chars and stop tokens', () => {
  assert.equal(vector.isEvidenceToken('考试'), true);
  assert.equal(vector.isEvidenceToken('ok'), true);
  assert.equal(vector.isEvidenceToken('考'), false);
  assert.equal(vector.isEvidenceToken('今天'), false); // 停用词不算证据
  assert.equal(vector.isEvidenceToken('a'), false);
});

test('embed returns a deterministic L2-normalized vector and zero vector for empty text', () => {
  const a = vector.embed('考试焦虑睡不着');
  const b = vector.embed('考试焦虑睡不着');
  assert.equal(a.length, vector.DIM);
  assert.deepEqual(a, b);
  const norm = a.reduce((sum, value) => sum + value * value, 0);
  assert.ok(Math.abs(norm - 1) < 0.01);
  const empty = vector.embed('');
  assert.equal(empty.length, vector.DIM);
  assert.deepEqual(empty, new Array(vector.DIM).fill(0));
});

test('cosine and similarity: identical text scores ~1, related beats unrelated, dim mismatch is safe', () => {
  assert.ok(Math.abs(vector.similarity('考试焦虑睡不着', '考试焦虑睡不着') - 1) < 0.01);
  const related = vector.similarity('快到考试周了，好焦虑', '因考试焦虑而失眠');
  const unrelated = vector.similarity('快到考试周了，好焦虑', '今天晚霞很好看');
  assert.ok(related > unrelated);
  assert.equal(vector.cosine([1, 2], [1, 2, 3]), 0);
  assert.equal(vector.cosine(null, []), 0);
});

test('recall ranks the semantically related entry first', () => {
  const corpus = ['今天晚霞很好看', '因考试焦虑而失眠', '喜欢下雨的声音'];
  const hits = vector.recall('快到考试周了，好焦虑', corpus, { limit: 2 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, '因考试焦虑而失眠');
  assert.ok(hits[0].score > 0);
});

test('recall stays silent for short or unrelated messages (evidence gate)', () => {
  const corpus = ['今天晚霞很好看', '因考试焦虑而失眠', '喜欢下雨的声音'];
  assert.deepEqual(vector.recall('唉', corpus), []);
  assert.deepEqual(vector.recall('恩', corpus), []);
  assert.deepEqual(vector.recall('今天好累', corpus), []); // 「今天」是停用词，不算共享证据
  assert.deepEqual(vector.recall('睡不着', corpus), []);
});

test('recall respects limit, minScore and the requireShared switch', () => {
  const corpus = ['因考试焦虑而失眠', '考试前紧张到吃不下饭'];
  assert.equal(vector.recall('快考试了', corpus, { limit: 1 }).length, 1);
  assert.deepEqual(vector.recall('快考试了', corpus, { minScore: 0.99 }), []);
  // 关闭证据门槛后，纯哈希余弦也会命中（仅供实验/未来真实向量切换）
  const loose = vector.recall('今天好累', ['今天晚霞很好看'], { requireShared: false });
  assert.equal(loose.length, 1);
});

test('recall keeps entry meta and tolerates empty inputs', () => {
  const hits = vector.recall('快到考试周了', [{ text: '因考试焦虑而失眠', id: 'm1' }]);
  assert.equal(hits[0].entry.id, 'm1');
  assert.deepEqual(vector.recall('', ['因考试焦虑而失眠']), []);
  assert.deepEqual(vector.recall('考试', []), []);
  assert.deepEqual(vector.recall('考试', null), []);
  assert.deepEqual(vector.recall('考试', [{ text: '   ' }, null]), []);
});

test('buildUserContext recalls an older related memory for the current message', () => {
  const now = new Date('2026-10-14T23:30:00').getTime();
  const context = withStorage({
    [PREFS_KEY]: { memoryEnabled: true },
    [storage.KEYS.agentMemory]: [
      { at: 5, summary: '感谢朋友陪我散步' },
      { at: 3, summary: '因考试焦虑而失眠' },
      { at: 2, summary: '宿舍太吵没法放松' }
    ],
    [storage.KEYS.agentFacts]: [{ at: 6, text: '对芒果过敏' }]
  }, () => buildUserContext(now, '宿舍太吵了，根本睡不着'));

  assert.ok(context.indexOf('想起的旧事') !== -1);
  assert.ok(context.indexOf('宿舍太吵没法放松') !== -1);
  assert.ok(context.indexOf('相关才自然提一句') !== -1);
});

test('buildUserContext never repeats the latest memory or the injected top facts', () => {
  const now = new Date('2026-10-14T23:30:00').getTime();
  const context = withStorage({
    [PREFS_KEY]: { memoryEnabled: true },
    [storage.KEYS.agentMemory]: [
      { at: 3, summary: '因考试焦虑而失眠' }
    ],
    [storage.KEYS.agentFacts]: [{ at: 6, text: '怕考试考不好' }]
  }, () => buildUserContext(now, '快到考试周了，好焦虑'));

  // 最近一条记忆与前 5 条 facts 已直接注入，召回行不得重复引用
  assert.equal(context.indexOf('想起的旧事'), -1);
  assert.ok(context.indexOf('上次和夜喵聊天') !== -1);
});

test('buildUserContext recalls a fact that fell out of the top five', () => {
  const now = new Date('2026-10-14T23:30:00').getTime();
  const facts = [
    { at: 12, text: '打字时希望慢一点' }, { at: 11, text: '喜欢被叫小名' },
    { at: 10, text: '怕黑' }, { at: 9, text: '对芒果过敏' }, { at: 8, text: '喜欢下雨的声音' },
    { at: 6, text: '周六要去医院复查' }
  ];
  const context = withStorage({
    [PREFS_KEY]: { memoryEnabled: true },
    [storage.KEYS.agentFacts]: facts
  }, () => buildUserContext(now, '周六去医院有点紧张'));

  assert.ok(context.indexOf('想起的旧事') !== -1);
  assert.ok(context.indexOf('周六要去医院复查') !== -1);
});

test('buildUserContext skips recall without a message, when memory is off, or on storage failure', () => {
  const now = new Date('2026-10-14T23:30:00').getTime();
  const store = {
    [PREFS_KEY]: { memoryEnabled: true },
    [storage.KEYS.agentMemory]: [{ at: 2, summary: '宿舍太吵没法放松' }, { at: 1, summary: '感谢朋友陪我散步' }]
  };
  withStorage(store, () => {
    assert.equal(buildUserContext(now).indexOf('想起的旧事'), -1);
  });
  withStorage(Object.assign({}, store, { [PREFS_KEY]: { memoryEnabled: false } }), () => {
    assert.equal(buildUserContext(now, '宿舍太吵了').indexOf('想起的旧事'), -1);
  });
  const original = global.wx;
  global.wx = { getStorageSync() { throw new Error('storage broken'); } };
  try {
    // 白天时间戳：夜间时段人格行本就会注入，用白天保证只有存储失败这一个变量。
    assert.equal(buildUserContext(new Date('2026-10-14T15:00:00').getTime(), '宿舍太吵了'), '');
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
});
