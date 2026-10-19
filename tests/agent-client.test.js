const test = require('node:test');
const assert = require('node:assert/strict');
const agentClient = require('../services/agent-client');
const { REC_MARKER } = agentClient;

function sseEvent(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

test('splitRecommendation separates visible text from a valid recommendation', () => {
  const result = agentClient.splitRecommendation(
    `先深呼吸。\n${REC_MARKER}{"sound":"rain","minutes":15,"title":"雨声","detail":"15 分钟","reason":"安静"}`
  );
  assert.equal(result.text, '先深呼吸。');
  assert.equal(result.recommendation.sound, 'rain');
  assert.equal(result.recommendation.minutes, 15);
});

test('splitRecommendation hides partial marker while streaming and ignores broken json', () => {
  const partial = agentClient.splitRecommendation(`别急。\n${REC_MARKER}{"sound":"ra`);
  assert.equal(partial.text, '别急。');
  assert.equal(partial.recommendation, null);
  assert.equal(agentClient.splitRecommendation('普通回复').recommendation, null);
});

test('sanitizeRecommendation clamps sound, minutes and string length', () => {
  const safe = agentClient.sanitizeRecommendation({ sound: 'disco', minutes: 99, title: 'x'.repeat(100), detail: 5, reason: null });
  assert.equal(safe.sound, 'breeze');
  assert.equal(safe.minutes, 30);
  assert.ok(safe.title.length <= 60);
  assert.equal(safe.reason, '给今晚一段不用思考的安静时间。');
  assert.equal(agentClient.sanitizeRecommendation(null), null);
});

test('streaming chat wires wx.request, decodes chunks and completes with recommendation', () => {
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return {
        onChunkReceived(cb) { chunkHandler = cb; },
        abort() {}
      };
    }
  };
  const deltas = [];
  let completed = null;
  let errored = null;
  agentClient.chat({
    topic: 'exam',
    history: [{ role: 'agent', text: '想到考试时，最让你放不下的是什么？' }, { role: 'user', text: '怕考砸' }],
    answers: ['怕考砸'],
    onDelta: (text) => deltas.push(text),
    onComplete: (result) => { completed = result; },
    onError: (reason) => { errored = reason; }
  });

  assert.equal(options.enableChunked, true);
  assert.ok(options.header.Authorization.indexOf('Bearer ') === 0);
  assert.equal(options.data.stream, true);
  assert.equal(options.data.messages[0].role, 'system');
  assert.ok(options.data.messages[0].content.indexOf('夜喵') !== -1);
  assert.deepEqual(
    options.data.messages.slice(1).map((m) => m.role),
    ['assistant', 'user']
  );

  // 把一条含多字节字符的事件按字节切开，验证跨块解码。
  const bytes = Buffer.from(sseEvent('先深呼吸'), 'utf8');
  const cut = bytes.indexOf(Buffer.from('先')) + 1;
  chunkHandler({ data: bytes.slice(0, cut) });
  chunkHandler({ data: bytes.slice(cut) });
  chunkHandler({ data: Buffer.from(sseEvent('。\n' + REC_MARKER + '{"sound":"rain","minutes":15,"title":"雨","detail":"d","reason":"r"}')) });
  options.success({ statusCode: 200 });

  assert.deepEqual(deltas, ['先深呼吸', '先深呼吸。']);
  assert.equal(completed.text, '先深呼吸。');
  assert.equal(completed.recommendation.sound, 'rain');
  assert.equal(completed.fallback, false);
  assert.equal(errored, null);
  delete global.wx;
});

test('chat falls back to the rules engine when the gateway is unavailable', () => {
  global.wx = {
    request() { throw new Error('network down'); }
  };
  let completed = null;
  agentClient.chat({
    topic: '',
    history: [{ role: 'user', text: '最近睡不着' }],
    answers: ['最近睡不着'],
    onDelta: () => {},
    onComplete: (result) => { completed = result; }
  });
  assert.equal(completed.fallback, true);
  assert.ok(completed.text.length > 0);
  assert.equal(completed.recommendation, null);
  delete global.wx;
});

test('chat falls back when no chunk ever arrives', () => {
  let options;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived() {}, abort() {} };
    }
  };
  let completed = null;
  agentClient.chat({
    topic: 'thoughts',
    history: [{ role: 'user', text: '脑子停不下来' }],
    answers: ['脑子停不下来'],
    onComplete: (result) => { completed = result; }
  });
  options.success({ statusCode: 502 });
  assert.equal(completed.fallback, true);
  delete global.wx;
});

test('interrupted stream keeps partial text instead of replacing it with rule replies', () => {
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived(cb) { chunkHandler = cb; }, abort() {} };
    }
  };
  let completed = null;
  agentClient.chat({
    topic: 'thoughts',
    history: [{ role: 'user', text: '躺下之后胡思乱想' }],
    answers: ['躺下之后胡思乱想'],
    onDelta: () => {},
    onComplete: (result) => { completed = result; }
  });
  chunkHandler({ data: Buffer.from(sseEvent('躺下后思绪翻涌，确实')) });
  chunkHandler({ data: Buffer.from(sseEvent('很累。')) });
  // 模拟小程序切后台：请求被系统以 fail interrupted 中断。
  options.fail({ errMsg: 'request:fail interrupted' });

  assert.equal(completed.fallback, true);
  assert.equal(completed.text, '躺下后思绪翻涌，确实很累。');
  assert.equal(completed.recommendation, null);
  delete global.wx;
});

test('splitResponse handles the skill marker alongside the recommendation marker', () => {
  const skill = agentClient.splitResponse(`睡吧。\n@@DO@@{"skill":"play_sound","args":{"sound":"white","minutes":15}}`);
  assert.equal(skill.text, '睡吧。');
  assert.equal(skill.recommendation, null);
  assert.deepEqual(skill.skillCall, { skill: 'play_sound', args: { sound: 'white', minutes: 15 } });
  // 流式期间 JSON 未闭合：隐藏标记但不出技能
  const partial = agentClient.splitResponse('晚安。\n@@DO@@{"skill":"play_sound"');
  assert.equal(partial.text, '晚安。');
  assert.equal(partial.skillCall, null);
  // 两种标记互斥：先出现者生效
  const both = agentClient.splitResponse(`好。\n@@REC@@{"sound":"rain","minutes":30}\n@@DO@@{"skill":"journal","args":{}}`);
  assert.equal(both.recommendation.sound, 'rain');
  assert.equal(both.skillCall, null);
  // 损坏的技能 JSON：无花括号视为未闭合（等待），语法错误返回 invalid 标记
  assert.equal(agentClient.splitResponse('x\n@@DO@@oops').skillCall, null);
  assert.equal(agentClient.splitResponse('x\n@@DO@@{"skill":oops}').skillCall.invalid, true);
});

test('splitResponse strips @@SAFE@@ and reports it as a flag orthogonal to card markers', () => {
  assert.equal(agentClient.splitResponse('我陪你。').safe, false);
  const safeOnly = agentClient.splitResponse('我陪你。\n@@SAFE@@');
  assert.equal(safeOnly.safe, true);
  assert.equal(safeOnly.text, '我陪你。', 'marker never leaks into visible text');
  assert.equal(safeOnly.recommendation, null);
  const combined = agentClient.splitResponse(`我在。\n@@SAFE@@\n${REC_MARKER}{"sound":"rain","minutes":30}`);
  assert.equal(combined.safe, true);
  assert.equal(combined.text, '我在。');
  assert.ok(combined.recommendation, 'card markers keep working alongside the safe flag');
});

test('abort prevents completion and reports the reason', () => {
  let options;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived() {}, abort() {} };
    }
  };
  let completed = null;
  let errored = null;
  const handle = agentClient.chat({
    topic: 'exam',
    history: [{ role: 'user', text: '考试焦虑' }],
    answers: ['考试焦虑'],
    onComplete: (result) => { completed = result; },
    onError: (reason) => { errored = reason; }
  });
  handle.abort();
  options.success({ statusCode: 200 });
  assert.equal(completed, null);
  assert.equal(errored, 'aborted');
  delete global.wx;
});

test('sleep signal without a model marker gets a client-side recommendation card', () => {
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return {
        onChunkReceived(cb) { chunkHandler = cb; },
        abort() {}
      };
    }
  };
  let completed = null;
  agentClient.chat({
    history: [{ role: 'user', text: '今天实验终于做完了' }, { role: 'user', text: '我想静静睡一觉' }],
    answers: ['今天实验终于做完了', '我想静静睡一觉'],
    onComplete: (result) => { completed = result; }
  });
  // 模型只回正文、没有输出 @@REC@@（实测概率性漏标）。
  chunkHandler({ data: Buffer.from(sseEvent('那就让今晚属于安静吧。')) });
  options.success({ statusCode: 200 });
  assert.ok(completed.recommendation, '模型漏标时端内补一张推荐卡');
  assert.equal(completed.recommendation.sound, 'rain');
  assert.equal(completed.recommendation.minutes, 30);
  delete global.wx;
});

test('fallback recommendation stays silent without a sleep signal', () => {
  assert.equal(agentClient.buildFallbackRecommendation('考试好难，怕考砸'), null);
  assert.equal(agentClient.buildFallbackRecommendation('今天好累'), null, '弱信号交给模型判断，不强行推卡');
  assert.equal(agentClient.buildFallbackRecommendation('我不想睡，想再陪你聊会儿'), null, '否定的「不想睡」不算信号');
  assert.equal(agentClient.buildFallbackRecommendation('又睡不着，烦死了'), null, '「睡不着」是诉求不是收尾，留给模型');
  assert.equal(agentClient.buildFallbackRecommendation(''), null);
  assert.equal(agentClient.buildFallbackRecommendation(undefined), null);
});

test('fallback recommendation reads non-contiguous sleep intents', () => {
  assert.ok(agentClient.buildFallbackRecommendation('我想静静睡一觉'), '想静静睡一觉');
  assert.ok(agentClient.buildFallbackRecommendation('想好好睡一觉'), '想好好睡一觉');
  assert.ok(agentClient.buildFallbackRecommendation('晚安啦'), '晚安');
  assert.ok(agentClient.buildFallbackRecommendation('先这样吧，明天再说'), '明天再说');
});

test('fallback recommendation picks white noise when the complaint is about noise', () => {
  const rec = agentClient.buildFallbackRecommendation('室友打游戏吵得睡不着，我想睡了');
  assert.equal(rec.sound, 'white');
  const quiet = agentClient.buildFallbackRecommendation('想睡啦，晚安');
  assert.equal(quiet.sound, 'rain');
});

test("model's own recommendation marker wins over the client-side fallback", () => {
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return {
        onChunkReceived(cb) { chunkHandler = cb; },
        abort() {}
      };
    }
  };
  let completed = null;
  agentClient.chat({
    history: [{ role: 'user', text: '想睡了' }],
    answers: ['想睡了'],
    onComplete: (result) => { completed = result; }
  });
  chunkHandler({ data: Buffer.from(sseEvent(`晚安。\n${REC_MARKER}{"sound":"lake","minutes":15,"title":"湖水","detail":"15 分钟","reason":"陪着你"}`)) });
  options.success({ statusCode: 200 });
  assert.equal(completed.recommendation.sound, 'lake', '模型自己选了湖水，端内不覆盖');
  assert.equal(completed.recommendation.minutes, 15);
  delete global.wx;
});

test('system prompt makes the recommendation a mandatory either/or and bans tag questions', () => {
  const prompt = agentClient.buildSystemPrompt('', '', '', '', '');
  assert.ok(prompt.indexOf('每次回复都必须做的二选一') !== -1);
  assert.ok(prompt.indexOf('我想静静睡一觉') !== -1, '关键词锚定示例');
  assert.ok(prompt.indexOf('禁止“是A还是B”的二选一提问') !== -1);
  assert.ok(prompt.indexOf('不插入空行') !== -1);
  assert.ok(prompt.indexOf('出现信号就输出') !== -1);
});

test('system prompt uses the active counselor identity without impersonation', () => {
  const prompt = agentClient.buildSystemPrompt('', '', '', '', '', {
    name: '欧文·亚隆',
    prompt: 'COUNSELOR-MARK：不冒充本人。'
  });
  assert.match(prompt, /你是“欧文·亚隆”/);
  assert.match(prompt, /COUNSELOR-MARK/);
  assert.doesNotMatch(prompt, /你是“夜喵”/);
});
