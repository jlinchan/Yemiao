const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startBridge, splitMessages } = require('../server/dify-bridge');

test('bridge preserves every system message including retrieved knowledge and plans', () => {
  assert.equal(splitMessages([{ role: 'system', content: '身份' }, { role: 'user', content: '你好' }, { role: 'system', content: '知识检索' }]).system, '身份\n\n知识检索');
});

test('model proxy selects server models and keys, preserves error status and cancels on total timeout', async () => {
  const calls = [];
  const upstream = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      calls.push({ body, authorization: req.headers.authorization });
      if (body.messages[0].content === 'hang') return;
      if (body.messages[0].content === '429') { res.writeHead(429); res.end('provider secret details'); return; }
      res.writeHead(200, { 'Content-Type': body.stream ? 'text/event-stream' : 'application/json' });
      if (body.stream) {
        res.end('data: {"choices":[{"delta":{"content":"真实协议流"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
      } else res.end(JSON.stringify({ choices: [{ message: { content: '非流式结果' } }] }));
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${upstream.address().port}/v1/chat/completions`;
  const modelChannels = {};
  for (const mode of ['fast', 'reframe', 'deep']) modelChannels[mode] = { baseUrl: url, apiKey: 'server-only-' + mode, model: 'server-model-' + mode, maxTokens: mode === 'deep' ? 20000 : 4000 };
  const instance = startBridge({ port: 0, modelChannels, modelTimeoutMs: 100 });
  const port = await instance.listen();
  const send = (content, mode, stream) => fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, model: 'client-must-not-select', max_tokens: 99999, stream, messages: [{ role: 'user', content }] })
  });
  try {
    for (const mode of ['fast', 'reframe', 'deep']) {
      const response = await send('你好', mode, mode !== 'reframe');
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.ok(body.includes(mode === 'reframe' ? '非流式结果' : '[DONE]'));
      const call = calls.at(-1);
      assert.equal(call.body.model, 'server-model-' + mode);
      assert.equal(call.authorization, 'Bearer server-only-' + mode);
      assert.equal(call.body.max_tokens, mode === 'deep' ? 20000 : 4000);
    }
    const limited = await send('429', 'fast', false);
    assert.equal(limited.status, 429);
    assert.ok(!(await limited.text()).includes('provider secret'));
    const hung = await send('hang', 'fast', false);
    assert.equal(hung.status, 502);
    assert.ok((await hung.text()).includes('超时'));
  } finally {
    instance.server.closeAllConnections(); upstream.closeAllConnections();
    await new Promise(resolve => instance.server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});

test('Dify bridge repairs byte-split Chinese CRLF, EOF event and dataset path', async () => {
  const paths = [];
  const upstream = http.createServer((req, res) => {
    paths.push(req.url);
    req.resume();
    req.on('end', () => {
      if (req.url.includes('/retrieve')) { res.end('{"records":[]}'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const bytes = Buffer.from('data: {"event":"message","answer":"中文跨块正常","conversation_id":"abc"}\r\n\r\ndata: {"event":"message","answer":"末尾"}');
      let index = 0;
      const tick = () => { if (index === bytes.length) { res.end(); return; } res.write(bytes.subarray(index, ++index)); setImmediate(tick); };
      tick();
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const instance = startBridge({ port: 0, difyBaseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, difyApiKey: 'test', difyDatasetKey: 'dataset-test' });
  const port = await instance.listen();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: '你好' }] }) });
    const text = await response.text();
    assert.ok(text.includes('中文跨块正常')); assert.ok(text.includes('末尾')); assert.ok(!text.includes('\ufffd'));
    const retrieval = await fetch(`http://127.0.0.1:${port}/v1/datasets/ds/retrieve`, { method: 'POST', body: '{"query":"你好"}' });
    assert.equal(retrieval.status, 200); await retrieval.text();
    assert.ok(paths.includes('/v1/datasets/ds/retrieve')); assert.ok(paths.every(path => !path.includes('/v1/v1/')));
  } finally {
    instance.server.closeAllConnections(); upstream.closeAllConnections();
    await new Promise(resolve => instance.server.close(resolve)); await new Promise(resolve => upstream.close(resolve));
  }
});
