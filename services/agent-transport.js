// wx 请求生命周期统一管理；取消/降级前使旧回调失效，绝不回放本地假回复。
const stream = require('../utils/llm-stream');

function requestError(reason, status) {
  const code = status ? 'http_' + status : (/timeout/i.test(String(reason && (reason.errMsg || reason.message) || reason)) ? 'timeout' : 'network');
  const messages = {
    http_401: 'AI 服务鉴权失败，请检查服务端密钥或登录凭证。',
    http_403: 'AI 服务拒绝访问，请检查服务权限。',
    http_429: '请求过于频繁，请稍后重试。',
    timeout: 'AI 回复超时，请重试。',
    network: '网络连接失败，请检查网络和请求合法域名后重试。',
    empty: 'AI 返回了空内容，请重试。',
    upstream: 'AI 服务异常，请稍后重试。',
    config: 'AI 服务地址尚未配置，请联系管理员。'
  };
  return { code, status: status || 0, message: messages[code] || (status >= 500 ? messages.upstream : 'AI 请求失败，请重试。') };
}

function requestChat(options) {
  const opts = options;
  let task = null;
  let generation = 0;
  let settled = false;
  let timer = null;
  let retried = false;
  let full = '';
  let reasoning = '';
  let conversationId = '';
  function cleanup() { if (timer) clearTimeout(timer); timer = null; }
  function abortTask() { try { if (task && task.abort) task.abort(); } catch (error) { /* 已结束 */ } }
  function error(value) {
    if (settled) return;
    settled = true;
    generation += 1;
    cleanup();
    abortTask();
    if (opts.onError) opts.onError(Object.assign({}, value, { partial: full }));
  }
  function complete() {
    if (settled) return;
    if (!full.trim()) { error(Object.assign(requestError(), { code: 'empty', message: 'AI 返回了空内容，请重试。' })); return; }
    settled = true;
    generation += 1;
    cleanup();
    if (opts.onComplete) opts.onComplete({ text: full, reasoning, conversationId });
  }
  function start(streaming) {
    const ticket = ++generation;
    const active = () => !settled && ticket === generation;
    const decoder = stream.createUtf8Decoder();
    let received = false;
    const parser = stream.createSseParser((payload) => {
      if (!active()) return;
      if (payload === '[DONE]') { complete(); return; }
      let data;
      try { data = JSON.parse(payload); } catch (err) { return; }
      if (data.error || data.event === 'error') {
        error(requestError(null, Number(data.status || data.error && data.error.status) || 502));
        return;
      }
      let delta = '';
      if (opts.dify) {
        const event = stream.parseDifyEvent(payload);
        if (event) { delta = event.delta; conversationId = event.conversationId || conversationId; }
      } else {
        delta = stream.parseDelta(payload);
        reasoning += stream.parseReasoningDelta(payload);
      }
      full += delta;
      if (opts.onDelta && (delta || reasoning)) opts.onDelta(full, reasoning);
      const choice = data.choices && data.choices[0];
      if (data.event === 'message_end' || choice && choice.finish_reason) {
        if (choice && choice.finish_reason === 'length' && !full.trim()) {
          error({ code: 'empty', message: '模型输出预算已耗尽但没有正文，请检查服务端模型配置。' });
        } else complete();
      }
    });
    const requestData = Object.assign({}, opts.data, opts.dify ? { response_mode: streaming ? 'streaming' : 'blocking' } : { stream: streaming });
    try {
      const currentTask = wx.request({
        url: opts.url, method: 'POST', timeout: opts.timeout || 90000,
        enableChunked: streaming, header: opts.header, data: requestData,
        success(res) {
          if (!active()) return;
          const status = res && res.statusCode || 200;
          if (status < 200 || status >= 300) {
            // 仅明确拒绝 stream 参数且尚无输出时重试 blocking；鉴权/限流绝不重发。
            if (streaming && !received && !retried && (status === 400 || status === 415 || status === 422) && /stream/i.test(JSON.stringify(res.data || ''))) {
              retryBlocking(); return;
            }
            error(requestError(null, status)); return;
          }
          if (streaming) {
            if (!received && res && res.data) {
              if (typeof res.data === 'string') parser.push(res.data);
              else if (res.data instanceof ArrayBuffer || ArrayBuffer.isView(res.data)) parser.push(decoder.push(res.data));
              else readJson(res.data);
            }
            parser.finish();
          } else readJson(res && res.data);
          if (active()) complete();
        },
        fail(reason) { if (active()) error(requestError(reason)); }
      });
      if (!active()) return;
      task = currentTask;
      if (streaming && (!task || typeof task.onChunkReceived !== 'function')) { retryBlocking(); return; }
      if (streaming) task.onChunkReceived((res) => {
        if (!active()) return;
        received = true;
        parser.push(decoder.push(res && res.data || new ArrayBuffer(0)));
      });
    } catch (reason) { if (active()) error(requestError(reason)); }
    function readJson(data) {
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (err) { data = null; } }
      if (data && data.error) { error(requestError(null, 502)); return; }
      const message = data && data.choices && data.choices[0] && data.choices[0].message;
      full = String(opts.dify ? data && data.answer || '' : message && message.content || '');
      reasoning = message && message.reasoning_content || '';
      conversationId = data && data.conversation_id || conversationId;
      if (opts.onDelta && full) opts.onDelta(full, reasoning);
    }
    function retryBlocking() {
      if (!active() || retried) return;
      retried = true;
      generation += 1;
      abortTask();
      start(false);
    }
  }
  timer = setTimeout(() => error(requestError('timeout')), opts.timeout || 90000);
  if (timer && timer.unref) timer.unref();
  if (!opts.url || !/^https?:\/\//.test(opts.url) || /\/\/[^/]*\.example\.com(?:[/:]|$)/.test(opts.url)) error({ code: 'config', message: 'AI 服务地址尚未配置，请联系管理员。' });
  else start(opts.stream !== false);
  return { abort() {
    if (settled) return;
    settled = true; generation += 1; cleanup(); abortTask();
    if (opts.onError) opts.onError('aborted');
  } };
}

module.exports = { requestChat, requestError };
