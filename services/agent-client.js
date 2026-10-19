// 夜喵 Agent 客户端：对接大赛模型网关（OpenAI 兼容 chat completions）。
// 优先走 SSE 流式输出；网络失败或基础库不支持分块时回退到 utils/agent-guide 规则引擎，
// 保证离线或网关异常时夜喵仍能完成基础陪伴对话。

let secrets;
try {
  secrets = require('./secrets');
} catch (error) {
  // 本地未配置真实密钥时使用模板，便于新环境跑通结构与测试。
  secrets = require('./secrets.example.js');
}

const stream = require('../utils/llm-stream');
const guide = require('../utils/agent-guide');
const agentVoice = require('../utils/agent-voice');
const safetyGate = require('../utils/safety-gate');
const registry = require('../skills/registry');
const pushCards = require('./agent-push');
const accessCode = require('./access-code');

const REC_MARKER = '@@REC@@';
const SAFE_MARKER = '@@SAFE@@';
const SOUND_WHITELIST = ['rain', 'breeze', 'lake', 'white'];
const HISTORY_LIMIT = 12;
const REQUEST_TIMEOUT_MS = 30000;

// 入睡信号（端内确定性兜底，与安全门同架构：模型主导、端内补位）。
// 模型对 @@REC@@ 的触发是概率性的（实测约五成），用户说出强信号而模型漏标时，
// 由端内补一张推荐卡——宁可有卡，不让「想睡了」的时刻没有声音陪她入眠。
// 只收强信号；「累了 / 好累」这类弱信号仍交给模型判断，避免用户还在倾诉时被强行推卡。
// 匹配前先剥否定（不想睡 / 没想睡不算）；「睡不着」是诉求不是收尾，同样留给模型。
const SLEEP_SIGNALS = [
  /想[^，。！？,!?\n]{0,3}睡/, // 想睡 / 想静静睡一觉 / 想好好睡一觉
  /睡[一觉吧]/, // 睡一觉 / 睡吧
  /睡觉/, // 睡觉了 / 去睡觉
  /晚安/,
  /困了/,
  /想安静/,
  /想休息/,
  /明天再说/,
  /谢谢你今天/,
  /先这样/
];
const NOISE_HINTS = ['吵', '噪音', '室友', '键盘', '打游戏'];

const TOPIC_LABELS = {
  exam: '考试焦虑',
  research: '论文 / 科研压力',
  dorm: '宿舍难以放松',
  thoughts: '脑子停不下来'
};

function buildSystemPrompt(topic, context, persona, expert, book, counselor) {
  const topicLine = topic && TOPIC_LABELS[topic] ? `用户选择的倾诉话题是「${TOPIC_LABELS[topic]}」。` : '';
  const contextBlock = context ? `\n${context}\n` : '';
  const personaBlock = persona ? `\n${persona}\n` : '';
  const expertBlock = expert ? `\n${expert}\n` : '';
  const bookBlock = book ? `\n${book}\n` : '';
  const counselorBlock = counselor && counselor.prompt ? `\n${counselor.prompt}\n` : '';
  const identityName = counselor && counselor.name ? counselor.name : '夜喵';
  const skillBlock = registry.buildSkillPromptSection();
  return [
    `你是“${identityName}”，一个面向大学生的深夜睡前陪伴 AI，帮助用户在睡前放下压力、慢慢平静。`,
    topicLine,
    counselorBlock,
    agentVoice.buildVoicePrompt(),
    personaBlock,
    expertBlock,
    bookBlock,
    contextBlock,
    '对话规则：',
    '- 语气温暖、平静、不评判，像一位可靠的朋友在深夜陪伴。',
    '- 长度：日常陪伴回应约 60-150 字（2-4 句），重心放在用户说的具体细节上；用户表达简短或临近入睡时可以更短、更轻；不使用列表、标题或表情符号。',
    '- 输出连贯的段落：句子之间不插入空行、不连续换行、不堆多余空格。',
    '- 一次只问一个开放式问题，引导用户把心事说出来。',
    '- 结尾最多留一个轻轻的开放式邀请；禁止“是A还是B”的二选一提问，禁止让用户自我分析（如“你想想是为什么”“先问问自己”）。',
    '- 对话前两轮先倾听和共情，不要急着给建议。',
    '- 不提供医疗诊断或用药建议。若用户提到自伤或严重危机，温和而明确地建议联系学校心理中心、辅导员或信任的人，并继续陪伴。',
    safetyGate.buildCrisisPromptSection(),
    '推荐机制（每次回复都必须做的二选一，不是可选项）：',
    '- 出现入睡信号——用户说想睡、想安静、想休息、晚安、困了、累了、明天再说、谢谢你今天、差不多了、先这样，或倾诉已充分、情绪已被接住——本次回复正文之后另起一行，严格输出标记与一行 JSON（不使用代码块包裹）：',
    REC_MARKER + '{"sound":"rain","minutes":30,"title":"雨声 · 慢慢来","detail":"30 分钟定时 · 自然环境声","reason":"给今晚一段不用思考的安静时间。"}',
    '- sound 只能取 rain、breeze、lake、white 之一；minutes 只能取 15 或 30；用户提到环境吵、室友、噪音时优先选 white。',
    '- 示例（只示意格式）：用户说“我想静静睡一觉”，回复“那就让今晚属于安静吧。”之后也要另起一行输出标记与 JSON——出现信号就输出，哪怕正文很短。',
    '- 只有用户明显还想继续倾诉、且一句话都没出现上述信号时，才只回正文、不加任何标记。',
    '- 用户明确点名要听某个声音或要关掉声音时，用播放/停止技能直接执行，不要用推荐卡片。',
    pushCards.buildPromptSection(),
    skillBlock
  ].filter(Boolean).join('\n');
}

function sanitizeRecommendation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sound = SOUND_WHITELIST.indexOf(raw.sound) !== -1 ? raw.sound : 'breeze';
  const minutes = Number(raw.minutes) === 15 ? 15 : 30;
  const text = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : fallback);
  return {
    sound,
    minutes,
    title: text(raw.title, '今晚慢慢来'),
    detail: text(raw.detail, `${minutes} 分钟定时 · 自然环境声`),
    reason: text(raw.reason, '给今晚一段不用思考的安静时间。')
  };
}

// 截取 payload 中第一个括号平衡的 JSON 对象文本；未闭合返回 null。
function extractBalancedJson(payload) {
  const text = String(payload || '');
  let end = -1;
  for (let i = 0, depth = 0, started = false; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') { depth += 1; started = true; }
    else if (ch === '}') depth -= 1;
    if (started && depth === 0) { end = i + 1; break; }
  }
  return end === -1 ? null : text.slice(0, end);
}

// 截取 payload 中第一个括号平衡的 JSON 数组文本；未闭合返回 null。
function extractBalancedArray(payload) {
  const text = String(payload || '');
  let end = -1;
  for (let i = 0, depth = 0, started = false; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '[') { depth += 1; started = true; }
    else if (ch === ']') depth -= 1;
    if (started && depth === 0) { end = i + 1; break; }
  }
  return end === -1 ? null : text.slice(0, end);
}

function safeParse(json, sanitize) {
  if (!json) return null;
  try {
    return sanitize(JSON.parse(json));
  } catch (error) {
    return null;
  }
}

// 把模型完整输出拆成「可见文本 + 推荐卡片 + 推送卡片 + 选项提问 + 技能调用 + 求助面板标志」。
// 四类卡片标记（@@REC@@ / @@PUSH@@ / @@ASK@@ / @@DO@@）互斥，取先出现者；流式期间 JSON 未闭合时对应项为 null。
// @@SAFE@@ 与卡片标记正交：只作标志位并从可见文本剔除（流式期间同样不外泄），由端内渲染求助面板。
function splitResponse(fullText) {
  let text = String(fullText || '');
  const safe = text.indexOf(SAFE_MARKER) !== -1;
  if (safe) text = text.split(SAFE_MARKER).join('');
  const markers = [
    { kind: 'do', index: text.indexOf(registry.DO_MARKER), marker: registry.DO_MARKER },
    { kind: 'rec', index: text.indexOf(REC_MARKER), marker: REC_MARKER },
    { kind: 'push', index: text.indexOf(pushCards.PUSH_MARKER), marker: pushCards.PUSH_MARKER },
    { kind: 'ask', index: text.indexOf(pushCards.ASK_MARKER), marker: pushCards.ASK_MARKER }
  ].filter((item) => item.index !== -1).sort((a, b) => a.index - b.index);
  if (!markers.length) return { text: text.trim(), recommendation: null, skillCall: null, push: null, ask: null, safe };
  const chosen = markers[0];
  const base = { text: text.slice(0, chosen.index).trim(), recommendation: null, skillCall: null, push: null, ask: null, safe };
  if (chosen.kind === 'do') {
    const parsed = registry.parseSkillCall(text);
    if (!parsed) return base; // JSON 未闭合
    return Object.assign(base, { skillCall: parsed.invalid ? { invalid: true } : { skill: parsed.skill, args: parsed.args } });
  }
  if (chosen.kind === 'rec') {
    return Object.assign(base, {
      recommendation: safeParse(extractBalancedJson(text.slice(chosen.index + REC_MARKER.length)), sanitizeRecommendation)
    });
  }
  if (chosen.kind === 'push') {
    return Object.assign(base, {
      push: safeParse(extractBalancedArray(text.slice(chosen.index + pushCards.PUSH_MARKER.length)), pushCards.sanitizePush)
    });
  }
  return Object.assign(base, {
    ask: safeParse(extractBalancedJson(text.slice(chosen.index + pushCards.ASK_MARKER.length)), pushCards.sanitizeAsk)
  });
}

// 向后兼容旧签名：只取文本与推荐。
function splitRecommendation(fullText) {
  const result = splitResponse(fullText);
  return { text: result.text, recommendation: result.recommendation };
}

function mapHistory(history) {
  return (Array.isArray(history) ? history : [])
    .slice(-HISTORY_LIMIT)
    .map((item) => ({
      role: item && item.role === 'user' ? 'user' : 'assistant',
      content: String((item && item.text) || '')
    }));
}

// 发起一次对话。回调：
// - onDelta(visibleText)：流式过程中当前应显示的完整可见文本（已剔除推荐标记）
// - onComplete({ text, recommendation, fallback })：对话结束
// - onError(reason)：仅在被中断或彻底失败时触发（内部已包含规则引擎回退）
// 返回 { abort() } 用于取消请求。
function gatewayHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secrets.modelGateway.apiKey}`
  };
  // 大赛模型试验验证码：使用者在本机输入过就带输入的，否则退回配置值。
  const code = accessCode.current();
  if (code) headers['X-Verification-Code'] = code;
  return headers;
}

// 本轮用户最后一句（answers 末位优先，否则从 history 反向找）。
function lastUserText(answers, history) {
  if (Array.isArray(answers) && answers.length) return String(answers[answers.length - 1] || '');
  if (Array.isArray(history)) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (item && item.role === 'user') return String(item.text || '');
    }
  }
  return '';
}

// 端内兜底推荐：命中入睡强信号而模型没输出 @@REC@@ 时补一张。
// 环境吵/室友/键盘 → 白噪音挡噪音；其余 → 雨声。返回 null 表示不需要补。
function buildFallbackRecommendation(lastUserMessage) {
  const text = String(lastUserMessage || '').replace(/[不没]想/g, '');
  if (!text) return null;
  if (!SLEEP_SIGNALS.some((pattern) => pattern.test(text))) return null;
  const sound = NOISE_HINTS.some((word) => text.indexOf(word) !== -1) ? 'white' : 'rain';
  return sanitizeRecommendation({ sound, minutes: 30 });
}

function chat(options) {
  const opts = options || {};
  const { topic = '', history = [], answers = [], context = '', persona = '', expert = '', book = '', counselor = null } = opts;
  const onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : null;
  const onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;

  const messages = [{ role: 'system', content: buildSystemPrompt(topic, context, persona, expert, book, counselor) }].concat(mapHistory(history));
  let full = '';
  let settled = false;
  let aborted = false;
  let requestTask = null;

  function completeOnce(result) {
    if (settled) return;
    settled = true;
    if (onComplete) onComplete(result);
  }

  // 完成时若模型漏标 @@REC@@ 且用户说出了入睡强信号，端内补一张推荐卡。
  function completeWithFallback(result) {
    if (result && !result.recommendation) {
      const rec = buildFallbackRecommendation(lastUserText(answers, history));
      if (rec) { completeOnce(Object.assign({}, result, { recommendation: rec })); return; }
    }
    completeOnce(result);
  }

  function fallback() {
    if (settled || aborted) {
      if (!settled && onError) onError('aborted');
      return;
    }
    // 请求中断（如切后台 5s 后 fail interrupted）但模型已流出一部分文本：
    // 保留已有内容收尾，不要用规则话术整段覆盖，避免体验断裂。
    const partial = splitResponse(full);
    if (partial.text) {
      completeWithFallback({ text: partial.text, recommendation: partial.recommendation, push: partial.push, ask: partial.ask, safe: partial.safe, fallback: true });
      return;
    }
    const result = guide.next(topic, answers);
    const reply = result.reply || '我在这里，今晚慢慢来。';
    if (onDelta) onDelta(reply);
    completeOnce({ text: reply, recommendation: result.recommendation || null, push: null, ask: null, fallback: true });
  }

  function handlePayload(payload) {
    if (payload === '[DONE]') return;
    const delta = stream.parseDelta(payload);
    if (!delta) return;
    full += delta;
    if (onDelta) onDelta(splitResponse(full).text);
  }

  function requestNonStreaming() {
    try {
      requestTask = wx.request({
        url: secrets.modelGateway.baseUrl,
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        header: gatewayHeaders(),
        data: { model: secrets.modelGateway.model, stream: false, temperature: 0.7, max_tokens: 600, messages },
        success(res) {
          const content = res && res.data && res.data.choices && res.data.choices[0]
            && res.data.choices[0].message && res.data.choices[0].message.content;
          if (typeof content === 'string' && content) {
            const parsed = splitResponse(content);
            if (onDelta) onDelta(parsed.text);
            completeWithFallback({ text: parsed.text, recommendation: parsed.recommendation, push: parsed.push, ask: parsed.ask, safe: parsed.safe, fallback: false });
          } else {
            fallback();
          }
        },
        fail() {
          fallback();
        }
      });
    } catch (error) {
      fallback();
    }
  }

  try {
    requestTask = wx.request({
      url: secrets.modelGateway.baseUrl,
      method: 'POST',
      enableChunked: true,
      timeout: REQUEST_TIMEOUT_MS,
      header: gatewayHeaders(),
      data: { model: secrets.modelGateway.model, stream: true, temperature: 0.7, max_tokens: 600, messages },
      success() {
        // 分块传输结束；若一个字节都没收到则视为失败并回退。
        if (!full) fallback();
        else completeWithFallback(Object.assign({ fallback: false }, splitResponse(full)));
      },
      fail() {
        fallback();
      }
    });

    if (!requestTask || typeof requestTask.onChunkReceived !== 'function') {
      // 基础库不支持分块接收，降级为非流式请求。
      if (requestTask && typeof requestTask.abort === 'function') requestTask.abort();
      requestNonStreaming();
      return { abort() {} };
    }

    const decoder = stream.createUtf8Decoder();
    const parser = stream.createSseParser(handlePayload);
    requestTask.onChunkReceived((res) => {
      const text = decoder.push(res && res.data ? res.data : new ArrayBuffer(0));
      if (text) parser.push(text);
    });
  } catch (error) {
    fallback();
    return { abort() {} };
  }

  return {
    abort() {
      if (aborted || settled) return;
      aborted = true;
      if (requestTask && typeof requestTask.abort === 'function') {
        try { requestTask.abort(); } catch (error) { /* 已结束的请求无需处理 */ }
      }
      if (!settled && onError) onError('aborted');
      settled = true;
    }
  };
}

module.exports = { chat, splitResponse, splitRecommendation, sanitizeRecommendation, buildSystemPrompt, gatewayHeaders, extractBalancedArray, buildFallbackRecommendation, REC_MARKER, SAFE_MARKER };
