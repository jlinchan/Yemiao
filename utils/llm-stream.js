// 流式 LLM 响应解析工具：增量 UTF-8 解码 + SSE 事件解析。
// 纯函数实现，不依赖 wx，Node 与小程序环境均可运行，便于单元测试。

// 增量 UTF-8 解码器：处理多字节字符被分块截断的情况。
// push(arrayBuffer) 返回本次新解码出的文本，未完成的字节序列留待下一块。
function createUtf8Decoder() {
  let pending = [];

  function decode(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const lead = bytes[i];
      if (lead < 0x80) { out += String.fromCharCode(lead); i += 1; continue; }
      let len = 0;
      let codePoint = 0;
      if (lead >= 0xC2 && lead <= 0xDF) { len = 2; codePoint = lead & 0x1F; }
      else if (lead >= 0xE0 && lead <= 0xEF) { len = 3; codePoint = lead & 0x0F; }
      else if (lead >= 0xF0 && lead <= 0xF4) { len = 4; codePoint = lead & 0x07; }
      else { i += 1; continue; } // 非法首字节，跳过
      if (i + len > bytes.length) break; // 序列不完整，等待下一块
      let valid = true;
      for (let j = 1; j < len; j += 1) {
        const cont = bytes[i + j];
        if (cont < 0x80 || cont > 0xBF) { valid = false; break; }
        codePoint = (codePoint << 6) | (cont & 0x3F);
      }
      if (!valid) { i += 1; continue; }
      if (codePoint > 0xFFFF) {
        codePoint -= 0x10000;
        out += String.fromCharCode(0xD800 + (codePoint >> 10), 0xDC00 + (codePoint & 0x3FF));
      } else {
        out += String.fromCharCode(codePoint);
      }
      i += len;
    }
    return { text: out, rest: bytes.slice(i) };
  }

  return {
    push(arrayBuffer) {
      const view = ArrayBuffer.isView(arrayBuffer)
        ? new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength)
        : new Uint8Array(arrayBuffer);
      const merged = pending.concat(Array.from(view));
      const result = decode(merged);
      pending = Array.from(result.rest);
      return result.text;
    }
  };
}

// SSE 事件解析器：事件以空行分隔，只关心 data: 行。
// push(text) 可能收到半个事件，内部缓存直到事件完整。
function createSseParser(onData) {
  let buffer = '';
  let pendingCr = false;
  function emit(event) {
    const data = event.split('\n').filter((line) => line.indexOf('data:') === 0)
      .map((line) => line.slice(5).replace(/^ /, ''));
    if (data.length) onData(data.join('\n'));
  }
  function drain() {
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      emit(event);
    }
  }
  return {
    push(text) {
      const chunk = String(text);
      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i];
        if (pendingCr && ch === '\n') { pendingCr = false; continue; }
        pendingCr = ch === '\r';
        buffer += ch === '\r' ? '\n' : ch;
      }
      drain();
    },
    finish() {
      drain();
      if (buffer.trim()) emit(buffer);
      buffer = '';
    }
  };
}

// 从单个 SSE data 载荷中提取增量文本；非对话 chunk 或解析失败返回空字符串。
function parseDelta(payload) {
  if (!payload || payload === '[DONE]') return '';
  try {
    const parsed = JSON.parse(payload);
    const choice = parsed && parsed.choices && parsed.choices[0];
    const delta = choice && choice.delta;
    if (delta && typeof delta.content === 'string') return delta.content;
    return '';
  } catch (error) {
    return '';
  }
}

// 思考模型（glm/qwen）的增量里另有 delta.reasoning_content——模型内部思考，
// 先于正文流出。与 parseDelta 互补：content 进正文管线，reasoning 流式进思考面板。
function parseReasoningDelta(payload) {
  if (!payload || payload === '[DONE]') return '';
  try {
    const parsed = JSON.parse(payload);
    const delta = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
    return delta && typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
  } catch (error) {
    return '';
  }
}

// Dify 应用 API 的 SSE 载荷解析：与 OpenAI 格式不同，事件带 event 字段——
// message / agent_message 事件的 answer 是增量文本；conversation_id 在事件里
// 随发（首条 message 必带），需捕获后跨轮回带；ping / message_end 无增量。
// 返回 { delta, conversationId, error }；非 Dify 载荷或解析失败返回 null。
function parseDifyEvent(payload) {
  if (!payload || payload === '[DONE]') return null;
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.event !== 'string') return null;
    const result = { delta: '', conversationId: '', error: '' };
    if ((parsed.event === 'message' || parsed.event === 'agent_message') && typeof parsed.answer === 'string') {
      result.delta = parsed.answer;
    }
    if (typeof parsed.conversation_id === 'string') result.conversationId = parsed.conversation_id;
    if (parsed.event === 'error') result.error = String(parsed.message || parsed.error || 'dify error');
    if (!result.delta && !result.conversationId && !result.error) return null;
    return result;
  } catch (error) {
    return null;
  }
}

module.exports = { createUtf8Decoder, createSseParser, parseDelta, parseReasoningDelta, parseDifyEvent };
