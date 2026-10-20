const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bridge = require('../server/dify-bridge');
const agentClient = require('../services/agent-client');

// 起一个假 Dify 上游：streaming 回两条 message 事件，blocking 回 JSON，
// /retrieve 路径回知识库检索 JSON。记录收到的请求，供断言桥接层的转换逻辑。
function startMockDify() {
  const hits = [];
  const retrieveHits = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      if (req.url.indexOf('/retrieve') !== -1) {
        retrieveHits.push({ authorization: req.headers.authorization, url: req.url, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records: [{ segment: { content: '矛盾意向：试着保持清醒。' } }] }));
        return;
      }
      hits.push(body);
      if (body.response_mode === 'streaming') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ event: 'message', answer: '夜深了，', conversation_id: 'conv-9' })}\n\n`);
        res.write(`data: ${JSON.stringify({ event: 'message', answer: '慢慢来。' })}\n\n`);
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answer: '晚安，好梦。', conversation_id: 'conv-b' }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, hits, retrieveHits, port: server.address().port }));
  });
}

async function readSseText(response) {
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function sseDeltas(text) {
  return text.split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice(6)))
    .map((chunk) => chunk.choices[0].delta.content)
    .join('');
}

test('splitMessages isolates system, turns and last user message', () => {
  const { system, turns, lastUser } = bridge.splitMessages([
    { role: 'system', content: '你是夜喵' },
    { role: 'assistant', content: '慢慢来' },
    { role: 'user', content: '怕考砸' },
    { role: 'user', content: '想睡了' }
  ]);
  assert.equal(system, '你是夜喵');
  assert.deepEqual(turns.map((t) => t.role), ['assistant', 'user', 'user']);
  assert.equal(lastUser, '想睡了');
});

test('formatHistory keeps the tail turns and drops the last one', () => {
  const turns = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
    { role: 'user', content: '本轮' }
  ];
  assert.equal(bridge.formatHistory(turns, 2), '夜喵：b\n用户：c');
  assert.equal(bridge.formatHistory([], 10), '');
});

test('buildDifyPayload folds history into query without session, exposes inputs with it', () => {
  const body = {
    messages: [
      { role: 'system', content: '你是夜喵' },
      { role: 'user', content: '怕考砸' },
      { role: 'assistant', content: '慢慢来' },
      { role: 'user', content: '想睡了' }
    ]
  };
  const withoutSession = bridge.buildDifyPayload(body, '', { historyTurns: 5 });
  assert.equal(withoutSession.conversation_id, '');
  assert.equal(withoutSession.inputs.prompt, '你是夜喵');
  assert.ok(withoutSession.query.indexOf('【此前对话摘录') !== -1);
  assert.ok(withoutSession.query.indexOf('夜喵：慢慢来') !== -1);
  assert.ok(withoutSession.query.indexOf('想睡了') !== -1);

  const withSession = bridge.buildDifyPayload(body, 'conv-9', { historyTurns: 5 });
  assert.equal(withSession.conversation_id, 'conv-9');
  assert.equal(withSession.query, '想睡了');
  assert.ok(withSession.inputs.history.indexOf('慢慢来') !== -1);
});

test('bridge streams dify events as openai chunks and maps session to conversation', async () => {
  const mock = await startMockDify();
  const instance = bridge.startBridge({
    port: 0,
    difyBaseUrl: `http://127.0.0.1:${mock.port}/v1`,
    difyApiKey: 'app-test'
  });
  const port = await instance.listen();
  try {
    const first = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 's1' },
      body: JSON.stringify({
        model: 'dify',
        stream: true,
        messages: [{ role: 'system', content: '你是夜喵' }, { role: 'user', content: '想睡了' }]
      })
    });
    assert.equal(first.status, 200);
    const text = await readSseText(first);
    assert.equal(sseDeltas(text), '夜深了，慢慢来。');
    assert.ok(text.trimEnd().endsWith('data: [DONE]'));

    // 首轮：无 conversation_id，prompt 走 inputs.prompt，query 为最后一条用户消息。
    assert.equal(mock.hits[0].conversation_id, '');
    assert.equal(mock.hits[0].inputs.prompt, '你是夜喵');
    assert.equal(mock.hits[0].query, '想睡了');

    // 第二轮同 session：桥接层回带上一轮捕获的 conversation_id。
    await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 's1' },
      body: JSON.stringify({ stream: true, messages: [{ role: 'system', content: '你是夜喵' }, { role: 'user', content: '嗯' }] })
    });
    assert.equal(mock.hits[1].conversation_id, 'conv-9');
    assert.equal(mock.hits[1].query, '嗯');
  } finally {
    instance.server.close();
    mock.server.close();
  }
});

test('bridge serves blocking requests in openai completion shape', async () => {
  const mock = await startMockDify();
  const instance = bridge.startBridge({
    port: 0,
    difyBaseUrl: `http://127.0.0.1:${mock.port}/v1`,
    difyApiKey: 'app-test'
  });
  const port = await instance.listen();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream: false, messages: [{ role: 'system', content: '你是夜喵' }, { role: 'user', content: '晚安' }] })
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.object, 'chat.completion');
    assert.equal(data.choices[0].message.role, 'assistant');
    assert.equal(data.choices[0].message.content, '晚安，好梦。');
    assert.equal(mock.hits[0].response_mode, 'blocking');
  } finally {
    instance.server.close();
    mock.server.close();
  }
});

test('bridge rejects requests without the access token when configured', async () => {
  const mock = await startMockDify();
  const instance = bridge.startBridge({
    port: 0,
    difyBaseUrl: `http://127.0.0.1:${mock.port}/v1`,
    difyApiKey: 'app-test',
    authToken: 'secret-token'
  });
  const port = await instance.listen();
  try {
    const bad = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ messages: [] })
    });
    assert.equal(bad.status, 401);

    const good = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '在' }] })
    });
    assert.equal(good.status, 200);
  } finally {
    instance.server.close();
    mock.server.close();
  }
});

test('bridge maps upstream failure to 502 so the client falls back', async () => {
  // 指向一个不存在的端口，模拟 Dify 不可达。
  const instance = bridge.startBridge({
    port: 0,
    difyBaseUrl: 'http://127.0.0.1:9/v1',
    difyApiKey: 'app-test'
  });
  const port = await instance.listen();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream: false, messages: [{ role: 'user', content: '在' }] })
    });
    assert.equal(response.status, 502);
  } finally {
    instance.server.close();
  }
});

test('bridge proxies knowledge retrieval with the server-side dataset key', async () => {
  const mock = await startMockDify();
  const instance = bridge.startBridge({
    port: 0,
    difyBaseUrl: `http://127.0.0.1:${mock.port}/v1`,
    difyApiKey: 'app-test',
    difyDatasetKey: 'dataset-server',
    authToken: 'tok',
    datasetIds: 'ds-1'
  });
  const port = await instance.listen();
  const post = (datasetId, token) => fetch(`http://127.0.0.1:${port}/v1/datasets/${datasetId}/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: '睡不着' })
  });
  try {
    const good = await post('ds-1', 'tok');
    assert.equal(good.status, 200);
    const data = await good.json();
    assert.equal(data.records[0].segment.content, '矛盾意向：试着保持清醒。');
    // 上游用的是服务端 dataset- Key，路径与查询原样转发。
    assert.equal(mock.retrieveHits[0].authorization, 'Bearer dataset-server');
    assert.ok(mock.retrieveHits[0].url.indexOf('/v1/datasets/ds-1/retrieve') !== -1);
    assert.equal(mock.retrieveHits[0].body.query, '睡不着');

    const badToken = await post('ds-1', 'wrong');
    assert.equal(badToken.status, 401);

    const outsideWhitelist = await post('ds-other', 'tok');
    assert.equal(outsideWhitelist.status, 403);

    // 未配置 dataset key 的实例：代理不可用，明确 502。
    const bare = bridge.startBridge({ port: 0, difyBaseUrl: `http://127.0.0.1:${mock.port}/v1`, difyApiKey: 'app-test' });
    const barePort = await bare.listen();
    try {
      const noKey = await fetch(`http://127.0.0.1:${barePort}/v1/datasets/ds-1/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'x' })
      });
      assert.equal(noKey.status, 502);
    } finally {
      bare.server.close();
    }
  } finally {
    instance.server.close();
    mock.server.close();
  }
});

test('gateway mode carries X-Session-Id so the bridge can map conversations', () => {
  const store = new Map();
  global.wx = {
    request() { return { onChunkReceived() {}, abort() {} }; },
    getStorageSync: (key) => store.get(key),
    setStorageSync: (key, value) => { store.set(key, value); }
  };
  // 会话服务按需加载，避免文件头引入造成测试间的全局状态耦合。
  const sessions = require('../services/agent-sessions');
  try {
    const session = sessions.start({ topic: 'exam' });
    const headers = agentClient.gatewayHeaders();
    assert.equal(headers['X-Session-Id'], session.id);

    sessions.archiveActive();
    assert.equal('X-Session-Id' in agentClient.gatewayHeaders(), false);
  } finally {
    sessions.clearAll();
  }
});
