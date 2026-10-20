require('./agent-test-config');
// 测试隔离：屏蔽本机真实 difyKnowledge 配置，避免 chat 先打检索接口干扰 mock 流程。
require('../services/secrets').difyKnowledge = undefined;
const test = require('node:test');
const assert = require('node:assert/strict');
const agentClient = require('../services/agent-client');
const { parseDifyEvent } = require('../utils/llm-stream');
const secrets = require('../services/secrets');

function difySse(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

test('parseDifyEvent extracts answer delta and conversation id', () => {
  const event = parseDifyEvent(JSON.stringify({ event: 'message', answer: '晚安', conversation_id: 'c-1' }));
  assert.equal(event.delta, '晚安');
  assert.equal(event.conversationId, 'c-1');
  assert.equal(event.error, '');
});

test('parseDifyEvent supports agent_message, ignores ping, keeps message_end metadata', () => {
  assert.equal(parseDifyEvent(JSON.stringify({ event: 'agent_message', answer: '呀' })).delta, '呀');
  assert.equal(parseDifyEvent(JSON.stringify({ event: 'ping' })), null);
  const end = parseDifyEvent(JSON.stringify({ event: 'message_end', conversation_id: 'c-2' }));
  assert.equal(end.delta, '');
  assert.equal(end.conversationId, 'c-2');
});

test('parseDifyEvent flags error events and tolerates malformed payloads', () => {
  const err = parseDifyEvent(JSON.stringify({ event: 'error', message: 'boom' }));
  assert.equal(err.error, 'boom');
  assert.equal(parseDifyEvent('not json'), null);
  assert.equal(parseDifyEvent('[DONE]'), null);
  assert.equal(parseDifyEvent(''), null);
  assert.equal(parseDifyEvent(JSON.stringify({ choices: [{ delta: { content: 'x' } }] })), null);
});

test('dify mode routes chat to /chat-messages and completes from dify stream', () => {
  const original = secrets.dify;
  secrets.dify = { baseUrl: 'https://dify.test/v1/', apiKey: 'app-test' };
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return {
        onChunkReceived(cb) { chunkHandler = cb; },
        abort() {}
      };
    }
  };
  const deltas = [];
  let completed = null;
  agentClient.resetDifyConversation();
  try {
    agentClient.chat({
      history: [],
      answers: ['想睡了'],
      onDelta: (text) => deltas.push(text),
      onComplete: (result) => { completed = result; }
    });

    assert.ok(agentClient.difyEnabled());
    assert.equal(options.url, 'https://dify.test/v1/chat-messages');
    assert.equal(options.header.Authorization, 'Bearer app-test');
    assert.equal(options.enableChunked, true);
    assert.equal(options.data.response_mode, 'streaming');
    assert.equal(options.data.query, '想睡了');
    assert.equal(options.data.conversation_id, '');
    // 完整系统提示词走 inputs.prompt，Dify 模板里 {{prompt}} 引用即可。
    assert.ok(options.data.inputs.prompt.indexOf('夜喵') !== -1);
    assert.ok(options.data.inputs.skills.length > 0);

    chunkHandler({ data: Buffer.from(difySse({ event: 'message', answer: '夜深了，', conversation_id: 'conv-9' }), 'utf8') });
    chunkHandler({ data: Buffer.from(difySse({ event: 'message', answer: '慢慢来。' }), 'utf8') });
    options.success({ statusCode: 200 });

    assert.deepEqual(deltas, ['夜深了，', '夜深了，慢慢来。']);
    assert.equal(completed.text, '夜深了，慢慢来。');
    assert.equal(completed.fallback, false);

    // 下一轮回带 conversation_id；历史非空不会触发重置。
    agentClient.chat({
      history: [{ role: 'user', text: '想睡了' }],
      answers: ['嗯'],
      onDelta() {},
      onComplete() {}
    });
    assert.equal(options.data.conversation_id, 'conv-9');
  } finally {
    if (original === undefined) delete secrets.dify;
    else secrets.dify = original;
    agentClient.resetDifyConversation();
  }
});

test('dify mode reports network error without a template', () => {
  const original = secrets.dify;
  secrets.dify = { baseUrl: 'https://dify.test/v1', apiKey: 'app-test' };
  let options;
  let failHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return {
        onChunkReceived(cb) { failHandler = cb; },
        abort() {}
      };
    }
  };
  let completed = null;
  agentClient.resetDifyConversation();
  try {
    agentClient.chat({
      history: [],
      answers: ['最近有点累'],
      onError: (error) => { completed = error; },
      onDelta() {},
      onComplete: (result) => { completed = result; }
    });
    options.fail({ errMsg: 'request:fail' });
    assert.ok(completed);
    assert.equal(completed.code, 'network');
    assert.equal(completed.text, undefined);
  } finally {
    if (original === undefined) delete secrets.dify;
    else secrets.dify = original;
    agentClient.resetDifyConversation();
  }
});

test('dify mode degrades to blocking request when chunked transfer is unsupported', () => {
  const original = secrets.dify;
  secrets.dify = { baseUrl: 'https://dify.test/v1', apiKey: 'app-test' };
  const requests = [];
  global.wx = {
    request(opts) {
      requests.push(opts);
      // 第一个任务不支持 onChunkReceived，应触发 blocking 降级。
      if (requests.length === 1) return { abort() {} };
      return {};
    }
  };
  let completed = null;
  agentClient.resetDifyConversation();
  try {
    agentClient.chat({
      history: [],
      answers: ['晚安'],
      onComplete: (result) => { completed = result; }
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].data.response_mode, 'blocking');
    requests[1].success({ statusCode: 200, data: { answer: '晚安，好梦。', conversation_id: 'conv-b' } });
    assert.equal(completed.text, '晚安，好梦。');
    assert.equal(completed.fallback, false);
  } finally {
    if (original === undefined) delete secrets.dify;
    else secrets.dify = original;
    agentClient.resetDifyConversation();
  }
});

test('gateway mode stays untouched when dify is not configured', () => {
  const original = secrets.dify;
  delete secrets.dify;
  let options;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived() {}, abort() {} };
    }
  };
  try {
    agentClient.chat({ history: [], answers: ['在'], onComplete() {}, onDelta() {} });
    assert.equal(agentClient.difyEnabled(), false);
    assert.ok(options.url.indexOf('chat/completions') !== -1);
    assert.equal(options.data.messages[0].role, 'system');
  } finally {
    if (original !== undefined) secrets.dify = original;
    agentClient.resetDifyConversation();
  }
});
