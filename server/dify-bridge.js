// Dify 桥接中间层（接法 B）：对小程序暴露 OpenAI 兼容的 /v1/chat/completions，
// 背后转发到 Dify 应用 API（/v1/chat-messages），小程序侧零改动——把
// services/secrets.js 的 modelGateway.baseUrl 指到本服务地址即可。
//
// 零依赖，Node 18+ 直接运行：
//   DIFY_API_KEY=app-xxx node server/dify-bridge.js
// 可选环境变量：
//   PORT            监听端口（默认 8787）
//   DIFY_BASE_URL   Dify API 地址（默认 https://api.dify.ai/v1）
//   AUTH_TOKEN      可选访问令牌；设置后校验请求的 Authorization: Bearer <AUTH_TOKEN>
//   PROMPT_VARIABLE 系统提示词放入的 inputs 变量名（默认 prompt，Dify 模板 {{prompt}} 引用）
//   HISTORY_TURNS   无会话映射时折叠进输入的历史轮数（默认 10）
//   DIFY_DATASET_KEY      可选：知识库代理的 dataset- Key（配置后开放 /v1/datasets/*/retrieve
//                         代理路由，知识检索也走备案域名，Key 留在服务端）
//   DIFY_DATASET_IDS      可选：逗号分隔的知识库 ID 白名单，留空不限制
//
// 会话记忆两种方式：
//   1. 请求带 X-Session-Id 头：服务端维护 Session → Dify conversation_id 映射，
//      上下文由 Dify 服务端记忆（推荐，需小程序侧补发该头）；
//   2. 不带：每轮新开 Dify 会话，把近期历史折叠进本轮输入衔接上下文（零改动兜底）。

'use strict';

const http = require('http');
const https = require('https');
const { parseDifyEvent, createSseParser } = require('../utils/llm-stream');
const { StringDecoder } = require('string_decoder');
const { proxyModel, modelChannels } = require('./model-proxy');

const DEFAULT_DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DEFAULT_PORT = 8787;
const DEFAULT_HISTORY_TURNS = 10;
const UPSTREAM_TIMEOUT_MS = 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// —— 会话映射：X-Session-Id → Dify conversation_id（带 TTL 的内存表） ——
function createSessionMap() {
  const map = new Map();
  function sweep() {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (now - entry.at > SESSION_TTL_MS) map.delete(key);
    }
  }
  return {
    get(key) {
      const entry = key && map.get(key);
      if (!entry) return '';
      if (Date.now() - entry.at > SESSION_TTL_MS) { map.delete(key); return ''; }
      entry.at = Date.now();
      return entry.id;
    },
    set(key, id) {
      if (!key || !id) return;
      map.set(key, { id, at: Date.now() });
      sweep();
    },
    size() {
      return map.size;
    }
  };
}

// —— OpenAI messages 拆解：系统提示词 + 历史轮次 + 最后一条用户消息 ——
function splitMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let system = '';
  const turns = [];
  list.forEach((item) => {
    const role = item && item.role === 'assistant' ? 'assistant'
      : item && item.role === 'system' ? 'system' : 'user';
    const content = String((item && item.content) || '');
    if (role === 'system') {
      system += (system ? '\n\n' : '') + content;
    } else {
      turns.push({ role, content });
    }
  });
  let lastUser = '';
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'user') { lastUser = turns[i].content; break; }
  }
  return { system, turns, lastUser };
}

// 历史折叠成衔接文本；最后一条（本轮用户消息）不进历史。
function formatHistory(turns, limit) {
  const picked = turns.slice(0, -1).slice(-(Number(limit) || DEFAULT_HISTORY_TURNS));
  if (!picked.length) return '';
  return picked
    .map((item) => `${item.role === 'user' ? '用户' : '夜喵'}：${item.content}`)
    .join('\n');
}

// OpenAI 请求体 → Dify 请求体。promptVariable 承载完整系统提示词；
// 无会话映射时把历史折叠进 query（Dify 端记不住上文），有映射时历史放 inputs.history
// 备用（Dify 记忆接管，模板可不引用）。
function buildDifyPayload(openaiBody, conversationId, options) {
  const opts = options || {};
  const promptVariable = opts.promptVariable || 'prompt';
  const { system, turns, lastUser } = splitMessages(openaiBody.messages);
  const historyText = formatHistory(turns, opts.historyTurns);
  const inputs = {};
  inputs[promptVariable] = system;
  let query = lastUser || '……';
  if (!conversationId && historyText) {
    query = `【此前对话摘录，仅供衔接上下文，不要复述】\n${historyText}\n【用户此刻说】\n${lastUser || '……'}`;
  } else {
    inputs.history = historyText;
  }
  return {
    inputs,
    query,
    conversation_id: conversationId || '',
    user: String(openaiBody.user || 'nightcat-bridge'),
    response_mode: opts.responseMode || 'streaming'
  };
}

// —— OpenAI 兼容响应体 ——
function toOpenAiChunk(delta, model) {
  return `data: ${JSON.stringify({
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model || 'dify',
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }]
  })}\n\n`;
}

function toOpenAiCompletion(content, model) {
  return {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'dify',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

// —— 调 Dify 上游：streaming 逐事件回调 onEvent；blocking 一次性返回 ——
function postToDify(baseUrl, apiKey, payload, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    const url = new URL(`${String(baseUrl || DEFAULT_DIFY_BASE_URL).replace(/\/+$/, '')}/chat-messages`);
    const mod = url.protocol === 'http:' ? http : https;
    const body = JSON.stringify(payload);
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      const decoder = new StringDecoder('utf8');
      const parser = createSseParser((payload) => {
        const event = parseDifyEvent(payload);
        if (event && event.error) { reject(new Error('Dify 流式服务异常')); return; }
        if (event && opts.onEvent) opts.onEvent(event);
      });
      res.on('data', (chunk) => {
        const text = decoder.write(chunk);
        if (!opts.onEvent) { raw += text; return; }
        if (res.statusCode < 400) parser.push(text);
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Dify 流被中断')));
      res.on('end', () => {
        if (opts.onEvent) {
          parser.push(decoder.end());
          parser.finish();
          resolve({ statusCode: res.statusCode });
          return;
        }
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw + decoder.end()) });
        } catch (error) {
          reject(new Error('dify blocking 响应不是合法 JSON'));
        }
      });
    });
    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('dify 上游超时')));
    req.on('error', reject);
    if (opts.signal) {
      const cancel = () => req.destroy(new Error('client disconnected'));
      opts.signal.addEventListener('abort', cancel, { once: true });
      req.once('close', () => opts.signal.removeEventListener('abort', cancel));
      if (opts.signal.aborted) cancel();
    }
    const deadline = setTimeout(() => req.destroy(new Error('dify 上游超时')), UPSTREAM_TIMEOUT_MS);
    req.once('close', () => clearTimeout(deadline));
    req.end(body);
  });
}

// —— 通用 JSON 转发（知识库检索代理用） ——
function forwardJson(baseUrl, apiKey, path, payload) {
  return new Promise((resolve, reject) => {
    const root = String(baseUrl || DEFAULT_DIFY_BASE_URL).replace(/\/+$/, '');
    const url = new URL(`${root}${root.endsWith('/v1') ? path.replace(/^\/v1/, '') : path}`);
    const mod = url.protocol === 'http:' ? http : https;
    const body = JSON.stringify(payload);
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Dify 检索被中断')));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
        } catch (error) {
          reject(new Error('dify 响应不是合法 JSON'));
        }
      });
    });
    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('dify 上游超时')));
    req.on('error', reject);
    req.end(body);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Id, X-Context-Mode, X-Request-Purpose, X-Verification-Code'
};

function createHandler(config) {
  const sessions = createSessionMap();

  return async function handle(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url.split('?')[0] === '/healthz') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain' }, CORS_HEADERS));
      res.end('ok');
      return;
    }
    const pathname = req.url.split('?')[0];
    const authorized = !config.authToken || req.headers.authorization === `Bearer ${config.authToken}`;

    // 知识库检索代理（协作模式生产部署）：小程序 → 桥接（备案域名）→ Dify 知识库。
    // dataset- Key 只存在服务端；客户端用与对话相同的 Bearer 访问令牌。
    const retrieveMatch = req.method === 'POST' && pathname.match(/^\/v1\/datasets\/([^/]+)\/retrieve$/);
    if (retrieveMatch) {
      if (!authorized) {
        res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: 'unauthorized' } }));
        return;
      }
      if (!config.difyDatasetKey) {
        res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: '桥接未配置 DIFY_DATASET_KEY，知识库代理不可用' } }));
        return;
      }
      if (config.datasetIds.length && config.datasetIds.indexOf(decodeURIComponent(retrieveMatch[1])) === -1) {
        res.writeHead(403, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: 'dataset 不在白名单' } }));
        return;
      }
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (error) {
        res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: String(error.message || error) } }));
        return;
      }
      try {
        const upstream = await forwardJson(
          config.difyBaseUrl,
          config.difyDatasetKey,
          `/v1/datasets/${encodeURIComponent(retrieveMatch[1])}/retrieve`,
          payload
        );
        res.writeHead(upstream.statusCode >= 400 ? upstream.statusCode : 200, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify(upstream.data));
      } catch (error) {
        res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: String((error && error.message) || error) } }));
      }
      return;
    }

    if (req.method !== 'POST' || pathname !== '/v1/chat/completions') {
      res.writeHead(404, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }
    if (!authorized) {
      res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
      res.end(JSON.stringify({ error: { message: 'unauthorized' } }));
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
      res.end(JSON.stringify({ error: { message: String(error.message || error) } }));
      return;
    }

    if (!Array.isArray(body.messages) || !body.messages.some((item) => item && item.role === 'user' && typeof item.content === 'string' && item.content.trim())) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '缺少用户消息' } })); return;
    }
    if (Object.keys(config.modelChannels).length) {
      const mode = body.mode === 'deep' ? 'deep' : body.mode === 'reframe' ? 'reframe' : 'fast';
      const channel = config.modelChannels[mode];
      if (!channel) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '未配置所选模式的模型通道' } })); return;
      }
      await proxyModel(req, res, body, channel, config.modelTimeoutMs);
      return;
    }
    if (!config.difyApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '服务端尚未配置模型密钥' } })); return;
    }
    const stateful = req.headers['x-context-mode'] !== 'history' && req.headers['x-request-purpose'] !== 'analysis';
    const sessionId = stateful ? String(req.headers['x-session-id'] || '') : '';
    const conversationId = sessionId ? sessions.get(sessionId) : '';
    const isStream = body.stream !== false;
    const payload = buildDifyPayload(body, conversationId, Object.assign({}, config, { responseMode: isStream ? 'streaming' : 'blocking' }));
    if (sessionId) payload.user = 'nightcat-' + sessionId;
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', cancel);

    try {
      if (!isStream) {
        const upstream = await postToDify(config.difyBaseUrl, config.difyApiKey, payload, { signal: controller.signal });
        if (upstream.data && upstream.data.conversation_id) sessions.set(sessionId, upstream.data.conversation_id);
        const answer = upstream.data && typeof upstream.data.answer === 'string' ? upstream.data.answer : '';
        if (upstream.statusCode >= 400 || !answer.trim()) {
          res.writeHead(upstream.statusCode >= 400 ? upstream.statusCode : 502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
          res.end(JSON.stringify({ error: { message: `dify 上游异常（${upstream.statusCode}）` } }));
          return;
        }
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify(toOpenAiCompletion(answer, body.model)));
        return;
      }

      // 流式：惰性写头，上游失败时保留正确的 HTTP 错误状态。
      let opened = false;
      const sendChunk = (delta) => {
        if (!opened) {
          opened = true;
          res.writeHead(200, Object.assign({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          }, CORS_HEADERS));
        }
        res.write(toOpenAiChunk(delta, body.model));
      };
      const upstream = await postToDify(config.difyBaseUrl, config.difyApiKey, payload, {
        signal: controller.signal,
        onEvent(event) {
          if (event.conversationId) sessions.set(sessionId, event.conversationId);
          if (event.delta) sendChunk(event.delta);
        }
      });
      if (!opened) {
        if (upstream.statusCode >= 400) {
          res.writeHead(upstream.statusCode, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
          res.end(JSON.stringify({ error: { message: `dify 上游异常（${upstream.statusCode}）` } }));
          return;
        }
        res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: 'Dify 返回空内容' } })); return;
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(JSON.stringify({ error: { message: String((error && error.message) || error) } }));
      } else {
        res.write('data: ' + JSON.stringify({ error: { message: 'Dify 流式回复中断', status: 502 } }) + '\n\n');
        res.end();
      }
    } finally {
      res.removeListener('close', cancel);
    }
  };
}

// 启动桥接服务；options 可覆盖全部环境变量配置，便于测试。
function startBridge(options) {
  const opts = options || {};
  const config = {
    port: Number(opts.port != null ? opts.port : (process.env.PORT || DEFAULT_PORT)),
    difyBaseUrl: opts.difyBaseUrl || process.env.DIFY_BASE_URL || DEFAULT_DIFY_BASE_URL,
    difyApiKey: opts.difyApiKey != null ? opts.difyApiKey : (process.env.DIFY_API_KEY || ''),
    authToken: opts.authToken != null ? opts.authToken : (process.env.AUTH_TOKEN || ''),
    promptVariable: opts.promptVariable || process.env.PROMPT_VARIABLE || 'prompt',
    historyTurns: Number(opts.historyTurns != null ? opts.historyTurns : (process.env.HISTORY_TURNS || DEFAULT_HISTORY_TURNS)),
    modelChannels: modelChannels(opts.modelChannels),
    modelTimeoutMs: Number(opts.modelTimeoutMs || process.env.MODEL_TIMEOUT_MS) || 85000,
    difyDatasetKey: opts.difyDatasetKey != null ? opts.difyDatasetKey : (process.env.DIFY_DATASET_KEY || ''),
    datasetIds: String(opts.datasetIds != null ? opts.datasetIds : (process.env.DIFY_DATASET_IDS || ''))
      .split(',').map((item) => item.trim()).filter(Boolean)
  };
  const handle = createHandler(config);
  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      try { res.end(); } catch (error) { /* 连接已断，忽略 */ }
    });
  });
  return {
    config,
    server,
    sessions: null,
    listen() {
      return new Promise((resolve) => {
        server.listen(config.port, () => resolve(server.address().port));
      });
    }
  };
}

module.exports = {
  startBridge,
  createSessionMap,
  splitMessages,
  formatHistory,
  buildDifyPayload,
  toOpenAiChunk,
  toOpenAiCompletion,
  postToDify
};

if (require.main === module) {
  if (!process.env.DIFY_API_KEY && !Object.keys(modelChannels()).length) {
    console.error('缺少服务端配置：设置 DIFY_API_KEY，或 MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME。');
    process.exit(1);
  }
  const bridge = startBridge({});
  bridge.server.listen(bridge.config.port, () => {
    console.log(`夜喵 Dify 桥接已启动：http://127.0.0.1:${bridge.config.port}/v1/chat/completions`);
    console.log(`上游：${bridge.config.difyBaseUrl}（会话记忆${bridge.config.authToken ? '，访问令牌已启用' : ''}）`);
    console.log(`知识库检索代理：${bridge.config.difyDatasetKey ? '已启用' + (bridge.config.datasetIds.length ? `（白名单 ${bridge.config.datasetIds.join(', ')}）` : '') : '未配置 DIFY_DATASET_KEY'}`);
  });
}
