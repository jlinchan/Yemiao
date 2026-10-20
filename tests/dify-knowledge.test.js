require('./agent-test-config');
const test = require('node:test');
const assert = require('node:assert/strict');
const difyKnowledge = require('../services/dify-knowledge');
const agentClient = require('../services/agent-client');
const secrets = require('../services/secrets');

const CONFIG = { baseUrl: 'https://dify.test/v1', apiKey: 'dataset-test', datasetId: 'ds-1', topK: 3 };

test('enabled() is false without config or with placeholders', () => {
  const original = secrets.difyKnowledge;
  try {
    delete secrets.difyKnowledge;
    assert.equal(difyKnowledge.enabled(), false);
    secrets.difyKnowledge = { apiKey: '在此填入 dataset key', datasetId: 'ds-1' };
    assert.equal(difyKnowledge.enabled(), false);
    secrets.difyKnowledge = { apiKey: 'dataset-real', datasetId: '' };
    assert.equal(difyKnowledge.enabled(), false);
    secrets.difyKnowledge = CONFIG;
    assert.equal(difyKnowledge.enabled(), true);
  } finally {
    if (original === undefined) delete secrets.difyKnowledge;
    else secrets.difyKnowledge = original;
  }
});

test('formatHits caps hits, trims content and appends document names', () => {
  const records = [
    { segment: { content: '  刺激控制：床只用来睡觉。'.padEnd(10), document: { name: 'CBT-I.pdf' } } },
    { segment: { content: '' } },
    { segment: { content: 'x'.repeat(500) } },
    { segment: { content: '第四条' } }
  ];
  const block = difyKnowledge.formatHits(records, 3);
  const lines = block.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].indexOf('刺激控制') === 2);
  assert.ok(lines[0].endsWith('（CBT-I.pdf）'));
  assert.ok(lines[1].length <= difyKnowledge.MAX_HIT_CHARS + 2);
  assert.equal(difyKnowledge.formatHits([], 3), '');
  assert.equal(difyKnowledge.formatHits(null), '');
});

test('retrieve posts to the dataset retrieve api and formats hits', () => {
  const original = secrets.difyKnowledge;
  secrets.difyKnowledge = CONFIG;
  let options = null;
  global.wx = {
    request(opts) {
      options = opts;
      return { abort() {} };
    }
  };
  try {
    let block = '未回调';
    difyKnowledge.retrieve('睡不着怎么办', (text) => { block = text; });
    assert.ok(options.url.indexOf('https://dify.test/v1/datasets/ds-1/retrieve') === 0);
    assert.equal(options.header.Authorization, 'Bearer dataset-test');
    assert.equal(options.data.query, '睡不着怎么办');
    assert.equal(options.data.retrieval_model.top_k, 3);
    // 相关性阈值必须开启（2026-10-19 修复「说什么都显示知识援引」）。
    assert.equal(options.data.retrieval_model.score_threshold_enabled, true);
    assert.ok(options.data.retrieval_model.score_threshold > 0 && options.data.retrieval_model.score_threshold < 1);
    options.success({
      statusCode: 200,
      data: { records: [{ segment: { content: '4-7-8 呼吸法：吸气 4 秒。', document: { name: '方法库' } } }] }
    });
    assert.ok(block.indexOf('4-7-8 呼吸法') !== -1);
    assert.ok(block.indexOf('（方法库）') !== -1);
  } finally {
    if (original === undefined) delete secrets.difyKnowledge;
    else secrets.difyKnowledge = original;
  }
});

test('low-score records are dropped, records without score are kept', () => {
  const records = [
    { score: 0.92, segment: { content: '高相关：刺激控制的执行要点。', document: { name: '方法库' } } },
    { score: 0.21, segment: { content: '低相关：完全不相干的段落。', document: { name: '其他' } } },
    { segment: { content: '无分数：不误杀的条目。', document: { name: '方法库' } } }
  ];
  const block = difyKnowledge.formatHits(records, 3);
  assert.ok(block.indexOf('高相关') !== -1, '高分条目保留');
  assert.ok(block.indexOf('无分数') !== -1, '未带 score 的条目不误杀');
  assert.equal(block.indexOf('低相关'), -1, '低分条目被端上过滤');
  const hits = difyKnowledge.buildHits(records, 3);
  assert.equal(hits.length, 2, '结构化命中同步过滤');
  assert.equal(hits.some((hit) => hit.snippet.indexOf('低相关') !== -1), false);
});

test('retrieve degrades to an empty block on failure, empty query or no config', () => {
  const original = secrets.difyKnowledge;
  let options = null;
  global.wx = {
    request(opts) {
      options = opts;
      return { abort() {} };
    }
  };
  try {
    delete secrets.difyKnowledge;
    let block = '未回调';
    difyKnowledge.retrieve('想睡了', (text) => { block = text; });
    assert.equal(block, '');
    assert.equal(options, null);

    secrets.difyKnowledge = CONFIG;
    difyKnowledge.retrieve('   ', (text) => { block = text; });
    assert.equal(block, '');
    assert.equal(options, null);

    difyKnowledge.retrieve('想睡了', (text) => { block = text; });
    assert.ok(options);
    options.fail({ errMsg: 'request:fail timeout' });
    assert.equal(block, '');
  } finally {
    if (original === undefined) delete secrets.difyKnowledge;
    else secrets.difyKnowledge = original;
  }
});

test('buildSystemPrompt embeds retrieved hits only when provided', () => {
  const without = agentClient.buildSystemPrompt('exam', '', '', '', '');
  assert.equal(without.indexOf('（仅与当前话题相关时参考引用，不相关就忽略）'), -1);
  const withHits = agentClient.buildSystemPrompt('exam', '', '', '', '', '- 4-7-8 呼吸法');
  assert.ok(withHits.indexOf('（仅与当前话题相关时参考引用，不相关就忽略）') !== -1);
  assert.ok(withHits.indexOf('4-7-8 呼吸法') !== -1);
  assert.ok(withHits.indexOf('夜喵') !== -1);
});

test('chat retrieves knowledge first and injects hits into the prompt', async () => {
  const original = secrets.difyKnowledge;
  secrets.difyKnowledge = CONFIG;
  const requests = [];
  global.wx = {
    request(opts) {
      requests.push(opts);
      if (opts.url.indexOf('/datasets/') !== -1) {
        setTimeout(() => {
          opts.success({
            statusCode: 200,
            data: { records: [{ segment: { content: '矛盾意向：越想睡越清醒时，反过来试着保持清醒。' } }] }
          });
        }, 0);
      } else {
        setTimeout(() => { opts.success({ statusCode: 200, data: { choices: [{ message: { content: '测试模型回复' } }] } }); }, 0);
      }
      return { onChunkReceived() {}, abort() {} };
    }
  };
  const done = new Promise((resolve) => {
    agentClient.chat({
      history: [],
      answers: ['睡不着，脑子停不下来'],
      onComplete: resolve
    });
  });
  const completed = await done;
  try {
    assert.ok(completed);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].url.indexOf('/datasets/') !== -1);
    assert.ok(requests[0].data.query.indexOf('睡不着') !== -1);
    const lastMsg = requests[1].data.messages[requests[1].data.messages.length - 1];
    assert.equal(lastMsg.role, 'system');
    assert.ok(lastMsg.content.indexOf('矛盾意向：越想睡越清醒时') !== -1);
    assert.ok(lastMsg.content.indexOf('引用优先级最高') !== -1);
  } finally {
    if (original === undefined) delete secrets.difyKnowledge;
    else secrets.difyKnowledge = original;
  }
});

test('chat skips retrieval entirely when difyKnowledge is not configured', async () => {
  const original = secrets.difyKnowledge;
  delete secrets.difyKnowledge;
  const requests = [];
  global.wx = {
    request(opts) {
      requests.push(opts);
      setTimeout(() => { opts.success({ statusCode: 200, data: { choices: [{ message: { content: '测试模型回复' } }] } }); }, 0);
      return { onChunkReceived() {}, abort() {} };
    }
  };
  const done = new Promise((resolve) => {
    agentClient.chat({
      history: [],
      answers: ['晚安'],
      onComplete: resolve
    });
  });
  const completed = await done;
  try {
    assert.ok(completed);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].url.indexOf('/datasets/') === -1);
  } finally {
    if (original === undefined) delete secrets.difyKnowledge;
    else secrets.difyKnowledge = original;
  }
});
