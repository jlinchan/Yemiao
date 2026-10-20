const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('./agent-test-config');
const client = require('../services/agent-client');
const transport = require('../services/agent-transport');
const knowledge = require('../services/dify-knowledge');
const sessions = require('../services/agent-sessions');
const { createSseParser } = require('../utils/llm-stream');

function harness() {
  const requests = [];
  global.wx = { request(opts) {
    const item = { opts, aborted: false };
    requests.push(item);
    return { onChunkReceived(fn) { item.chunk = fn; }, abort() { item.aborted = true; opts.fail({ errMsg: 'abort' }); } };
  } };
  return requests;
}
function delta(item, text) { item.chunk({ data: Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n') }); }

test('five turns send each current message once with all preceding model replies', () => {
  const requests = harness();
  const history = [];
  for (let i = 0; i < 5; i += 1) {
    const text = i === 0 ? '你好，我叫小林' : '第' + i + '轮，最近总是睡不着';
    history.push({ role: 'user', text });
    let result;
    client.chat({ history: history.slice(), answers: [text], mode: 'fast', onComplete(value) { result = value; } });
    const item = requests[i];
    assert.equal(requests.length, i + 1, '每轮仅一个生成请求');
    assert.equal(item.opts.data.messages.filter(m => m.content === text).length, 1);
    assert.equal(item.opts.data.messages.filter(m => m.role === 'user').length, i + 1);
    assert.equal(item.opts.data.messages.filter(m => m.role === 'assistant').length, i);
    delta(item, '模拟模型第' + i + '轮回复');
    item.opts.success({ statusCode: 200 });
    assert.equal(result.fallback, false);
    history.push({ role: 'agent', text: result.text, done: true });
  }
});

test('history omits failed unfinished and tool messages and always appends current input', () => {
  const requests = harness();
  const handle = client.chat({ history: [
    { role: 'skill', text: '执行了某技能' }, { role: 'agent', text: '不完整', done: false },
    { role: 'agent', text: '失败', error: true }, { role: 'user', text: '旧消息' }
  ], answers: ['当前输入'] });
  assert.deepEqual(requests[0].opts.data.messages.slice(1), [{ role: 'user', content: '旧消息' }, { role: 'user', content: '当前输入' }]);
  handle.abort();
});

test('401 403 429 and 500 fail once with actionable status and permit next request', () => {
  for (const status of [401, 403, 429, 500]) {
    const requests = harness();
    let completed = 0;
    const errors = [];
    client.chat({ answers: ['你好'], onComplete() { completed += 1; }, onError: e => errors.push(e) });
    requests[0].opts.success({ statusCode: status, data: { error: { message: 'secret must never reach toast' } } });
    delta(requests[0], '迟到内容');
    requests[0].opts.fail({ errMsg: 'late' });
    assert.equal(completed, 0);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].status, status);
    assert.ok(!errors[0].message.includes('secret'));
    client.chat({ answers: ['重试'], onComplete() { completed += 1; } });
    delta(requests[1], '重试成功'); requests[1].opts.success({ statusCode: 200 });
    assert.equal(completed, 1);
  }
});

test('independent deadline aborts a hung request and ignores late success/chunks', async () => {
  const requests = harness();
  const errors = []; const replies = [];
  transport.requestChat({ url: 'https://proxy.test/chat', data: {}, header: {}, timeout: 15, onError: e => errors.push(e), onComplete: r => replies.push(r) });
  await new Promise(resolve => setTimeout(resolve, 35));
  delta(requests[0], '迟到'); requests[0].opts.success({ statusCode: 200 });
  assert.equal(requests[0].aborted, true);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'timeout');
  assert.equal(replies.length, 0);
});

test('stop invalidates chunk success error callbacks including synchronous abort failure', () => {
  const requests = harness(); const errors = []; const deltas = []; const replies = [];
  const handle = client.chat({ answers: ['你好'], onDelta: text => deltas.push(text), onError: e => errors.push(e), onComplete: r => replies.push(r) });
  delta(requests[0], '已收到'); handle.abort();
  delta(requests[0], '迟到'); requests[0].opts.success({ statusCode: 200 });
  assert.deepEqual(errors, ['aborted']);
  assert.deepEqual(deltas, ['已收到']);
  assert.deepEqual(replies, []);
});

test('chunk unsupported invalidates aborted stream before exactly one blocking retry', () => {
  const requests = []; let errors = 0; let result;
  global.wx = { request(opts) { requests.push(opts); return { abort() { opts.fail({ errMsg: 'abort' }); } }; } };
  client.chat({ answers: ['你好'], onError() { errors += 1; }, onComplete(r) { result = r; } });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].data.stream, false);
  requests[0].success({ statusCode: 500 });
  requests[1].success({ statusCode: 200, data: { choices: [{ message: { content: 'blocking 正文' } }] } });
  assert.equal(errors, 0); assert.equal(result.text, 'blocking 正文');
});

test('empty and Dify SSE error and synchronous wx throws report errors without local replies', () => {
  const requests = harness(); const errors = [];
  client.chat({ answers: ['你好'], onError: e => errors.push(e), onComplete() { assert.fail('must not fabricate reply'); } });
  requests[0].opts.success({ statusCode: 200 });
  assert.equal(errors[0].code, 'empty');
  config.dify = { baseUrl: 'https://dify.test/v1', apiKey: 'app-test' };
  try {
    client.chat({ answers: ['你好'], onError: e => errors.push(e) });
    requests[1].chunk({ data: Buffer.from('data: {"event":"error","status":401,"message":"invalid key"}\n\n') });
    assert.equal(errors[1].status, 401);
    global.wx.request = () => { throw new Error('network down'); };
    assert.doesNotThrow(() => client.chat({ answers: ['你好'], onError: e => errors.push(e) }));
    assert.equal(errors[2].code, 'network');
  } finally { config.dify = { apiKey: '' }; client.resetDifyConversation(); }
});

test('Dify conversation IDs are isolated by local session and cancelled rounds cannot set IDs', () => {
  config.dify = { baseUrl: 'https://dify.test/v1', apiKey: 'app-test' };
  const requests = harness();
  try {
    client.chat({ sessionId: 'A', history: [{ role: 'user', text: 'A1' }], answers: ['A1'] });
    requests[0].chunk({ data: Buffer.from('data: {"event":"message","answer":"回复A","conversation_id":"conv-A"}\n\n') });
    requests[0].opts.success({ statusCode: 200 });
    const b = client.chat({ sessionId: 'B', history: [{ role: 'user', text: 'B1' }], answers: ['B1'] });
    assert.equal(requests[1].opts.data.conversation_id, '');
    b.abort();
    requests[1].chunk({ data: Buffer.from('data: {"event":"message","answer":"迟到","conversation_id":"wrong"}\n\n') });
    const a = client.chat({ sessionId: 'A', history: [{ role: 'user', text: 'A2' }], answers: ['A2'] });
    assert.equal(requests[2].opts.data.conversation_id, 'conv-A'); a.abort();
  } finally { config.dify = { apiKey: '' }; client.resetDifyConversation(); }
});

test('optional analysis fails open and all modes keep token budgets and request forms', () => {
  const requests = harness();
  const handle = client.chat({ answers: ['你好'], mode: 'deep', analyze: true });
  assert.equal(requests[0].opts.data.stream, false);
  requests[0].opts.fail({ errMsg: 'offline' });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].opts.data.mode, 'deep');
  assert.equal(requests[1].opts.data.max_tokens, 20000);
  handle.abort();
  for (const mode of ['fast', 'reframe', 'deep']) {
    const current = client.chat({ mode, answers: ['你好'] });
    assert.equal(requests.at(-1).opts.data.mode, mode);
    assert.equal(requests.at(-1).opts.data.stream, mode !== 'reframe'); current.abort();
  }
});

test('knowledge failure/duplicate callback cannot block or duplicate ordinary generation', () => {
  const requests = harness();
  const enabled = knowledge.enabled; const retrieve = knowledge.retrieve;
  knowledge.enabled = () => true;
  knowledge.retrieve = (query, done) => { done('', []); done('迟到命中', []); return { abort() {} }; };
  try { const handle = client.chat({ answers: ['你好'] }); assert.equal(requests.length, 1); handle.abort(); }
  finally { knowledge.enabled = enabled; knowledge.retrieve = retrieve; }
});

test('SSE reassembles every byte including split CRLF and multiline fields at EOF', () => {
  const events = []; const parser = createSseParser(e => events.push(e));
  const input = 'data: first\r\n\r\ndata: second\r\ndata: line2\r\n\r\ndata: [DONE]';
  for (const ch of input) parser.push(ch);
  parser.finish();
  assert.deepEqual(events, ['first', 'second\nline2', '[DONE]']);
});

test('session persistence rejects failed or incomplete assistant bubbles', () => {
  assert.equal(sessions.sanitizeMessage({ role: 'agent', text: 'partial', done: false }), null);
  assert.equal(sessions.sanitizeMessage({ role: 'agent', text: 'error', error: true }), null);
  assert.equal(sessions.sanitizeMessage({ role: 'agent', text: '模型正文', done: true }).text, '模型正文');
});
