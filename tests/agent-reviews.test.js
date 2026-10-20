const test = require('node:test');
const assert = require('node:assert/strict');
const agentReviews = require('../services/agent-reviews');

function withStorage(store, fn) {
  const original = global.wx;
  global.wx = { getStorageSync: (key) => (store && store[key]) || '', setStorageSync: (key, value) => { store[key] = value; return true; } };
  try {
    return fn();
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
}

test('upsert keeps reviews newest first and caps the list', () => {
  withStorage({}, () => {
    for (let index = 1; index <= 31; index += 1) {
      agentReviews.upsert({ messageId: `m-${index}`, value: 'like', quote: '好' });
    }
    const list = agentReviews.list();
    assert.equal(list.length, 30);
    assert.equal(list[0].messageId, 'm-31');
    assert.equal(list[29].messageId, 'm-2');
    assert.equal(agentReviews.find('m-1'), null);
  });
});

test('upsert merges by message and changing the vote keeps the written reason', () => {
  withStorage({}, () => {
    agentReviews.upsert({ messageId: 'm1', value: 'like', quote: '今晚慢慢来', reason: '很温柔' });
    agentReviews.upsert({ messageId: 'm1', value: 'dislike', quote: '今晚慢慢来' });
    const list = agentReviews.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].value, 'dislike');
    assert.equal(list[0].reason, '很温柔');
    assert.equal(list[0].quote, '今晚慢慢来');
    // 清空理由且没有态度：整条移除，不留空格子
    agentReviews.upsert({ messageId: 'm1', value: '', reason: '' });
    assert.equal(agentReviews.list().length, 0);
  });
});

test('upsert trims and caps reason and quote, and rejects a blank id', () => {
  withStorage({}, () => {
    const entry = agentReviews.upsert({ messageId: 'm1', value: 'like', reason: `  ${'x'.repeat(80)}  `, quote: 'q'.repeat(40) });
    assert.equal(entry.reason.length, 60);
    assert.equal(entry.quote.length, 24);
    assert.equal(agentReviews.upsert({ messageId: '   ', value: 'like' }), null);
    assert.equal(agentReviews.upsert(null), null);
    // 非法态度按「只留言」处理，条目仍保留
    const note = agentReviews.upsert({ messageId: 'm2', value: 'hmm', reason: '留句话' });
    assert.equal(note.value, '');
    assert.equal(agentReviews.valueLabel(note.value), '留言');
  });
});

test('remove drops the entry and reports whether anything changed', () => {
  withStorage({}, () => {
    agentReviews.upsert({ messageId: 'm1', value: 'dislike' });
    assert.equal(agentReviews.remove('m1'), true);
    assert.equal(agentReviews.list().length, 0);
    assert.equal(agentReviews.remove('m1'), false);
    assert.equal(agentReviews.remove(''), false);
  });
});

test('valueLabel maps like, dislike and a bare note', () => {
  assert.equal(agentReviews.valueLabel('like'), '赞');
  assert.equal(agentReviews.valueLabel('dislike'), '踩');
  assert.equal(agentReviews.valueLabel(''), '留言');
});

test('feedbackLine turns reasoned reviews into style guidance and skips bare votes', () => {
  withStorage({}, () => {
    assert.equal(agentReviews.feedbackLine(), '', '没有评价时不产出');
    agentReviews.upsert({ messageId: 'm1', value: 'like' });
    assert.equal(agentReviews.feedbackLine(), '', '纯点赞踩没有理由，不产出');
    agentReviews.upsert({ messageId: 'm2', value: 'dislike', quote: '别想太多', reason: '有点说教感' });
    agentReviews.upsert({ messageId: 'm3', value: 'like', quote: '先接住情绪', reason: '这样被接住的感觉很好' });
    const line = agentReviews.feedbackLine();
    assert.ok(line.indexOf('用户不喜欢的表达：有点说教感') !== -1);
    assert.ok(line.indexOf('用户喜欢的表达：这样被接住的感觉很好') !== -1);
    assert.ok(line.indexOf('实时调整表达风格') !== -1);
    assert.ok(line.indexOf('不要向用户提及') !== -1, '提醒模型不要自我指涉');
  });
});
