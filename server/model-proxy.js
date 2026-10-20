'use strict';

const http = require('http');
const https = require('https');

// 上游地址/模型由服务器选取，客户端不能指定任意转发目标或携带供应商密钥。
function proxyModel(req, res, body, channel, timeoutMs) {
  return new Promise((resolve) => {
    const url = new URL(channel.baseUrl);
    const payload = JSON.stringify({
      model: channel.model, stream: body.stream !== false,
      temperature: body.temperature == null ? 0.7 : body.temperature,
      max_tokens: Math.min(Math.max(Number(body.max_tokens) || channel.maxTokens, 1), channel.maxTokens),
      messages: body.messages
    });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${channel.apiKey}`, 'Content-Length': Buffer.byteLength(payload) };
    if (req.headers['x-verification-code']) headers['X-Verification-Code'] = req.headers['x-verification-code'];
    let upstream;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      res.removeListener('close', cancel);
      resolve();
    };
    const fail = () => {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '模型上游连接失败或超时' } }));
      } else if (!res.destroyed) res.destroy();
      finish();
    };
    const cancel = () => { if (upstream) upstream.destroy(); finish(); };
    const deadline = setTimeout(() => { if (upstream) upstream.destroy(); fail(); }, timeoutMs || 85000);
    res.once('close', cancel);
    upstream = (url.protocol === 'http:' ? http : https).request(url, { method: 'POST', headers }, (response) => {
      // 错误正文可能带供应商内部信息；只向客户端传递状态与通用文案。
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '模型服务返回错误', status: response.statusCode } }));
        finish(); return;
      }
      res.writeHead(200, {
        'Content-Type': response.headers['content-type'] || (body.stream === false ? 'application/json' : 'text/event-stream'),
        'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'
      });
      response.on('error', fail);
      response.on('aborted', fail);
      response.once('end', finish);
      response.pipe(res);
    });
    upstream.on('error', fail);
    upstream.end(payload);
  });
}

function modelChannels(options) {
  const opts = options || {};
  const common = {
    baseUrl: process.env.MODEL_BASE_URL || '', apiKey: process.env.MODEL_API_KEY || '',
    model: process.env.MODEL_NAME || '', maxTokens: Number(process.env.MODEL_MAX_TOKENS) || 4000
  };
  const channels = {};
  ['fast', 'reframe', 'deep'].forEach((mode) => {
    const prefix = 'MODEL_' + mode.toUpperCase() + '_';
    const custom = opts[mode];
    const channel = custom || {
      baseUrl: process.env[prefix + 'BASE_URL'] || common.baseUrl,
      apiKey: process.env[prefix + 'API_KEY'] || common.apiKey,
      model: process.env[prefix + 'NAME'] || common.model,
      maxTokens: Number(process.env[prefix + 'MAX_TOKENS']) || (mode === 'deep' ? 20000 : common.maxTokens)
    };
    if (channel.baseUrl && channel.apiKey && channel.model) channels[mode] = Object.assign({ maxTokens: mode === 'deep' ? 20000 : 4000 }, channel);
  });
  return channels;
}

module.exports = { proxyModel, modelChannels };
