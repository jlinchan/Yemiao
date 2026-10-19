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
      const view = new Uint8Array(arrayBuffer);
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
  return {
    push(text) {
      buffer += String(text).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = event.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          if (line.indexOf('data:') === 0) {
            const payload = line.slice(5).replace(/^ /, '');
            onData(payload);
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
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

module.exports = { createUtf8Decoder, createSseParser, parseDelta };
