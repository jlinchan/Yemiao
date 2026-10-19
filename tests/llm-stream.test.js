const test = require('node:test');
const assert = require('node:assert/strict');
const { createUtf8Decoder, createSseParser, parseDelta } = require('../utils/llm-stream');

function sseEvent(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

test('utf8 decoder handles plain ascii in a single chunk', () => {
  const decoder = createUtf8Decoder();
  assert.equal(decoder.push(Buffer.from('data: hello')), 'data: hello');
});

test('utf8 decoder keeps incomplete multibyte sequences across chunks', () => {
  const decoder = createUtf8Decoder();
  const bytes = Buffer.from('慢慢');
  // “慢”占 3 个字节；在第一个字符的第 2 个字节处切开。
  const cut = bytes.indexOf(Buffer.from('慢')) + 1;
  assert.equal(decoder.push(bytes.slice(0, cut)), '');
  assert.equal(decoder.push(bytes.slice(cut)), '慢慢');
});

test('utf8 decoder reassembles split emoji (4-byte) sequences', () => {
  const decoder = createUtf8Decoder();
  const bytes = Buffer.from('晚安🌙');
  const cut = bytes.indexOf(Buffer.from('🌙')) + 2; // 月亮emoji占4字节，从中间切开
  assert.equal(decoder.push(bytes.slice(0, cut)), '晚安');
  assert.equal(decoder.push(bytes.slice(cut)), '🌙');
});

test('sse parser delivers complete events and buffers partial ones', () => {
  const payloads = [];
  const parser = createSseParser((payload) => payloads.push(payload));
  parser.push(sseEvent('你'));
  assert.equal(payloads.length, 1);
  assert.equal(JSON.parse(payloads[0]).choices[0].delta.content, '你');
  const combined = sseEvent('好') + sseEvent('呀');
  const half = combined.indexOf('\n\n') + 2; // 第一条事件结束后再截 3 个字节
  parser.push(combined.slice(0, half + 3));
  parser.push(combined.slice(half + 3));
  assert.deepEqual(payloads.map((p) => JSON.parse(p).choices[0].delta.content), ['你', '好', '呀']);
});

test('sse parser tolerates crlf line endings and ignores non-data lines', () => {
  const payloads = [];
  const parser = createSseParser((payload) => payloads.push(payload));
  parser.push('event: message\r\ndata: {"a":1}\r\n\r\nid: 42\ndata: [DONE]\r\n\r\n');
  assert.deepEqual(payloads, ['{"a":1}', '[DONE]']);
});

test('parseDelta extracts content, skips done and malformed payloads', () => {
  assert.equal(parseDelta(sseEvent('内容').replace(/^data: /, '').trim()), '内容');
  assert.equal(parseDelta('[DONE]'), '');
  assert.equal(parseDelta('not json'), '');
  assert.equal(parseDelta(JSON.stringify({ choices: [{ delta: {} }] })), '');
  assert.equal(parseDelta(''), '');
});
