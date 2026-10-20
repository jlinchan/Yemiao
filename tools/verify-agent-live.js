// 真实集成验证：环境变量中的模型 -> 本地代理 -> 同一份小程序客户端。
// 不读取客户端供应商密钥，不含 Mock 回复。执行可能产生正常模型调用费用。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { startBridge } = require('../server/dify-bridge');
const { modelChannels } = require('../server/model-proxy');

async function verify() {
  if (!process.env.DIFY_API_KEY && !Object.keys(modelChannels()).length) {
    throw new Error('未验证：缺少服务端模型环境变量');
  }
  const instance = startBridge({ port: 0 });
  const port = await instance.listen();
  const config = require('../services/secrets');
  config.modelGateway = { baseUrl: `http://127.0.0.1:${port}/v1/chat/completions`, apiKey: process.env.AUTH_TOKEN || '', model: 'sleepwell', channels: {} };
  config.dify = { apiKey: '' }; config.difyKnowledge = undefined;
  const store = new Map();
  global.wx = {
    getStorageSync: key => store.get(key), setStorageSync: (key, value) => store.set(key, value),
    request(opts) {
      let onChunk = null;
      const req = http.request(opts.url, { method: opts.method, headers: Object.assign({}, opts.header) }, res => {
        const chunks = [];
        res.on('data', chunk => {
          chunks.push(chunk);
          if (opts.enableChunked && onChunk) onChunk({ data: chunk });
        });
        res.on('error', error => opts.fail({ errMsg: error.message }));
        res.on('aborted', () => opts.fail({ errMsg: 'upstream interrupted' }));
        res.on('end', () => {
          let data = Buffer.concat(chunks).toString('utf8');
          if (!opts.enableChunked) { try { data = JSON.parse(data); } catch (error) { /* 保留原响应 */ } }
          opts.success({ statusCode: res.statusCode, data });
        });
      });
      req.on('error', error => opts.fail({ errMsg: error.message }));
      req.setTimeout(opts.timeout || 90000, () => req.destroy(new Error('timeout')));
      req.end(JSON.stringify(opts.data));
      return { abort() { req.destroy(); }, onChunkReceived(fn) { onChunk = fn; } };
    }
  };
  const client = require('../services/agent-client');
  const records = [];
  async function turn(text, history, mode) {
    history.push({ role: 'user', text });
    const start = Date.now(); let deltaCount = 0;
    try {
      const result = await new Promise((resolve, reject) => client.chat({
        history: history.slice(), answers: [text], sessionId: 'live-' + mode, mode,
        onDelta() { deltaCount += 1; }, onComplete: resolve,
        onError: error => reject(new Error(error.message || String(error)))
      }));
      if (!result.text.trim() || result.fallback) throw new Error('未获得真实模型正文');
      history.push({ role: 'agent', text: result.text, done: true });
      const record = { mode, input: text, ok: true, milliseconds: Date.now() - start, deltaCount, text: result.text };
      records.push(record);
      console.log(JSON.stringify(record));
      return result;
    } catch (error) {
      const record = { mode, input: text, ok: false, milliseconds: Date.now() - start, error: error.message };
      records.push(record); console.log(JSON.stringify(record));
      return null;
    }
  }
  try {
    const history = [];
    const inputs = ['你好，我叫小林。', '我最近总是睡不着。', '你还记得我叫什么名字吗？请先告诉我名字。', '躺下后总想着明天的考试，有什么可以试的小方法？', '结合我前面说的情况，今晚先做什么比较合适？'];
    for (const input of inputs) await turn(input, history, 'reframe');
    await turn('你好，请用一句简短的话回应我。', [], 'fast');
    await turn('我最近总是睡不着，可以给我一个具体方法吗？', [], 'deep');
    const report = { testedAt: new Date().toISOString(), realModel: true, throughLocalProxy: true, wechatDeviceVerified: false,
      contextRecallVerified: !!(records[2] && records[2].text && records[2].text.includes('小林')),
      fiveConsecutiveTurnsPassed: records.slice(0, 5).length === 5 && records.slice(0, 5).every(r => r.ok), records };
    if (process.env.LIVE_RESULTS_FILE) fs.writeFileSync(path.resolve(process.env.LIVE_RESULTS_FILE), JSON.stringify(report, null, 2));
    if (records.some(r => !r.ok) || !report.contextRecallVerified) process.exitCode = 1;
    return report;
  } finally { instance.server.closeAllConnections(); await new Promise(resolve => instance.server.close(resolve)); }
}
module.exports = { verify };
if (require.main === module) verify().catch(error => { console.error(error.message); process.exitCode = 1; });
