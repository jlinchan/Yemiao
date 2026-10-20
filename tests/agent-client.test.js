require('./agent-test-config');
// 测试隔离：屏蔽本机真实 difyKnowledge 配置，避免 chat 先打检索接口干扰 mock 流程。
require('../services/secrets').difyKnowledge = undefined;
const test = require('node:test');
const assert = require('node:assert/strict');
const agentClient = require('../services/agent-client');
const { REC_MARKER } = agentClient;

function sseEvent(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

test('sentinel tokens leaked by the gateway are stripped from visible text', () => {
  const result = agentClient.splitResponse('<|end__of__sentence|>嗯，我在呢。今晚慢慢来。<|end__of__sentence|>');
  assert.equal(result.text, '嗯，我在呢。今晚慢慢来。');
  // 流式残片：结尾未闭合的 <| 前缀也要剥掉，不能闪现在气泡里。
  const partial = agentClient.splitResponse('先深呼吸。<|end__of__sen');
  assert.equal(partial.text, '先深呼吸。');
  // 带空格的变体与正文里的比较符号不受影响。
  const spaced = agentClient.splitResponse('好的呀。< | end__of__sentence | >');
  assert.equal(spaced.text, '好的呀。');
  const compare = agentClient.splitResponse('室温低于 26 度更好。');
  assert.equal(compare.text, '室温低于 26 度更好。');
});

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
  let requestError = null;
  let errored = null;
  agentClient.chat({
    topic: 'exam',
    history: [{ role: 'agent', text: '想到考试时，最让你放不下的是什么？' }, { role: 'user', text: '怕考砸' }],
    answers: ['怕考砸'],
    onDelta: (text) => deltas.push(text),
    onError: (error) => { requestError = error; },
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

test('chat reports network errors without a local template', () => {
  global.wx = {
    request() { throw new Error('network down'); }
  };
  let completed = null;
  let requestError = null;
  agentClient.chat({
    topic: '',
    history: [{ role: 'user', text: '最近睡不着' }],
    answers: ['最近睡不着'],
    onDelta: () => {},
    onError: (error) => { requestError = error; },
    onComplete: (result) => { completed = result; }
  });
  assert.equal(completed, null);
  assert.equal(requestError.code, "network");
  delete global.wx;
});

test('chat reports HTTP failures even without chunks', () => {
  let options;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived() {}, abort() {} };
    }
  };
  let completed = null;
  let requestError = null;
  agentClient.chat({
    topic: 'thoughts',
    history: [{ role: 'user', text: '脑子停不下来' }],
    answers: ['脑子停不下来'],
    onError: (error) => { requestError = error; },
    onComplete: (result) => { completed = result; }
  });
  options.success({ statusCode: 502 });
  assert.equal(completed, null);
  assert.equal(requestError.status, 502);
  delete global.wx;
});

test('interrupted stream reports failure with partial text', () => {
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived(cb) { chunkHandler = cb; }, abort() {} };
    }
  };
  let completed = null;
  let requestError = null;
  agentClient.chat({
    topic: 'thoughts',
    history: [{ role: 'user', text: '躺下之后胡思乱想' }],
    answers: ['躺下之后胡思乱想'],
    onDelta: () => {},
    onError: (error) => { requestError = error; },
    onComplete: (result) => { completed = result; }
  });
  chunkHandler({ data: Buffer.from(sseEvent('躺下后思绪翻涌，确实')) });
  chunkHandler({ data: Buffer.from(sseEvent('很累。')) });
  // 模拟小程序切后台：请求被系统以 fail interrupted 中断。
  options.fail({ errMsg: 'request:fail interrupted' });

  assert.equal(completed, null);
  assert.equal(requestError.partial, '躺下后思绪翻涌，确实很累。');
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
  let requestError = null;
  let errored = null;
  const handle = agentClient.chat({
    topic: 'exam',
    history: [{ role: 'user', text: '考试焦虑' }],
    answers: ['考试焦虑'],
    onError: (error) => { requestError = error; },
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
  let requestError = null;
  agentClient.chat({
    history: [{ role: 'user', text: '今天实验终于做完了' }, { role: 'user', text: '我想静静睡一觉' }],
    answers: ['今天实验终于做完了', '我想静静睡一觉'],
    onError: (error) => { requestError = error; },
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
  let requestError = null;
  agentClient.chat({
    history: [{ role: 'user', text: '想睡了' }],
    answers: ['想睡了'],
    onError: (error) => { requestError = error; },
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

// —— Reflex/Reframe/Reflect 模式分化（2026-10-19）——

test('model-emitted think tags never leak into the visible text', () => {
  // 截图实测：模型自带 </think> 标签漏进气泡。成对/孤立/未闭合/协议共存全覆盖。
  const leaked = agentClient.splitResponse('</think>嗯，我在这儿。想说什么都可以。');
  assert.equal(leaked.text, '嗯，我在这儿。想说什么都可以。', '孤立闭合标签被剔除');
  const paired = agentClient.splitResponse('<think>用户在倾诉，先接情绪</think>我在的，慢慢说。');
  assert.equal(paired.text, '我在的，慢慢说。', '成对标签内容不进气泡');
  assert.equal(paired.thinking, '用户在倾诉，先接情绪', '标签内容归入思考面板');
  const unclosed = agentClient.splitResponse('我在的<think>用户很累，先安抚');
  assert.equal(unclosed.text, '我在的', '流式未闭合：正文只留标签前内容');
  assert.equal(unclosed.thinking, '用户很累，先安抚');
  const protocol = agentClient.splitResponse('@@THINK@@协议思考@@ANSWER@@<think>杂音</think>正文来了');
  assert.ok(protocol.text.indexOf('<think>') === -1 && protocol.text.indexOf('杂音') === -1, '协议存在时 think 标签整块剔除');
  assert.equal(protocol.thinking, '协议思考', '协议思考优先');
  const orphan = agentClient.splitResponse('晚安</think>');
  assert.equal(orphan.text, '晚安', '孤立残标签剔除');
});

test('mode=fast trims the protocol, mode=deep adds the professional directive, default stays full', () => {
  const base = agentClient.buildSystemPrompt('', '', '', '', '');
  assert.ok(base.indexOf('思考 3-8 句') !== -1, '默认协议为完整版');
  assert.equal(base.indexOf('深度模式（Reflect）附加要求'), -1, '默认不带深度附加段');
  const fast = agentClient.buildSystemPrompt('', '', '', '', '', '', '', 'fast');
  assert.ok(fast.indexOf('思考只写 1-2 句') !== -1, 'fast 思考精简');
  assert.ok(fast.indexOf('40-90 字') !== -1, 'fast 回复更短');
  assert.ok(fast.indexOf(agentClient.REC_MARKER) !== -1, 'fast 保留推荐协议');
  const deep = agentClient.buildSystemPrompt('', '', '', '', '', '', '', 'deep');
  assert.ok(deep.indexOf('深度模式（Reflect）附加要求') !== -1, 'deep 追加专业指令');
  assert.ok(deep.indexOf('思考 3-8 句') !== -1, 'deep 保留完整思考');
  // 两阶段流水线（plan 模式）：选材决策由计划接管，但 Reflect 的产出深度不减反增。
  const plan = { need: '方法', use: '刺激控制', rec: false, sound: 'rain', minutes: 30 };
  const deepPlan = agentClient.buildSystemPrompt('', '', '', '', '', '', '', 'deep', plan);
  assert.ok(deepPlan.indexOf('专业产出要求') !== -1, 'plan 模式保留 Reflect 专业产出段');
  assert.ok(deepPlan.indexOf('思考写 4-8 句') !== -1, 'plan 模式下 Reflect 思考保持 4-8 句');
  assert.ok(deepPlan.indexOf('作用机制') !== -1 && deepPlan.indexOf('适用边界') !== -1, '机制与边界要求齐全');
  assert.ok(deepPlan.indexOf('不设硬性字数') !== -1, 'Reflect 长度柔性引导（无硬上限）');
  assert.equal(deepPlan.indexOf('每次回复都必须做的二选一'), -1, '推荐决策已由计划接管，不再重复长协议');
  const reframePlan = agentClient.buildSystemPrompt('', '', '', '', '', '', '', 'reframe', plan);
  assert.ok(reframePlan.indexOf('思考只写 2-4 句') !== -1, 'reframe plan 模式保持轻盈');
  assert.equal(reframePlan.indexOf('专业产出要求'), -1, 'reframe 不带专业产出段');
});

test('gatewayChannel picks the configured mode channel and falls back to the default', () => {
  const secrets = require('../services/secrets');
  const original = secrets.modelGateway;
  try {
    secrets.modelGateway = {
      baseUrl: 'https://default-gw/v1', apiKey: 'k-default', model: 'm-default',
      channels: {
        deep: { baseUrl: 'https://deep-gw/v1', apiKey: 'k-deep', model: 'm-deep' },
        reframe: { baseUrl: '', apiKey: '', model: '' }
      }
    };
    assert.equal(agentClient.gatewayChannel('').model, 'm-default', '无模式走默认通道');
    assert.equal(agentClient.gatewayChannel('fast').model, 'm-default', 'fast 走默认通道');
    const deep = agentClient.gatewayChannel('deep');
    assert.equal(deep.baseUrl, 'https://deep-gw/v1', 'deep 切到配置通道');
    assert.equal(deep.model, 'm-deep');
    assert.equal(agentClient.gatewayChannel('reframe').model, 'm-default', '配置不全的模式回落默认通道');
  } finally {
    secrets.modelGateway = original;
  }
});

// —— 先思考再回答（@@THINK@@…@@ANSWER@@，2026-10-18）——

test('thinking section is requested in the prompt and stripped from visible text', () => {
  const prompt = agentClient.buildSystemPrompt('', '', '', '', '');
  assert.ok(prompt.indexOf(agentClient.THINK_MARKER) !== -1);
  assert.ok(prompt.indexOf(agentClient.ANSWER_MARKER) !== -1);
  assert.ok(prompt.indexOf('先思考再回答') !== -1);
  // 思考路径对用户可见（折叠面板），要求点明用了哪条知识与取舍。
  assert.ok(prompt.indexOf('思考路径') !== -1);
  assert.ok(prompt.indexOf('点明用了知识库哪一条') !== -1);
  assert.ok(prompt.indexOf('3-8 句') !== -1);

  const full = `@@THINK@@用户在倾诉考试焦虑，先接情绪；暂不给方法。@@ANSWER@@嗯，考前的夜晚确实难熬。`;
  const result = agentClient.splitResponse(full);
  assert.equal(result.text, '嗯，考前的夜晚确实难熬。', '思考段不混入正文');
  assert.ok(result.thinking && result.thinking.indexOf('考试焦虑') !== -1, '思考内容随结果返回供面板展示');
  assert.equal(result.recommendation, null);
});

test('onDelta streams both the visible text and the live thinking path', () => {
  let options;
  let chunkHandler = null;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived(cb) { chunkHandler = cb; }, abort() {} };
    }
  };
  const seen = [];
  let completed = null;
  let requestError = null;
  agentClient.chat({
    history: [{ role: 'user', text: '睡不着' }],
    answers: ['睡不着'],
    onDelta: (text, thinking) => seen.push({ text, thinking }),
    onError: (error) => { requestError = error; },
    onComplete: (result) => { completed = result; }
  });
  // 第一块只有思考：可见文本为空，思考已在长出来。
  chunkHandler({ data: Buffer.from(sseEvent('@@THINK@@用户在倾诉失眠，先接情绪')) });
  // 第二块思考收束、正文开始。
  chunkHandler({ data: Buffer.from(sseEvent('，推认知洗牌。@@ANSWER@@嗯，那些念头很吵吧。')) });
  options.success({ statusCode: 200 });
  assert.equal(seen[0].text, '');
  assert.ok(seen[0].thinking.indexOf('失眠') !== -1, '思考阶段面板实时展示');
  assert.equal(seen[1].text, '嗯，那些念头很吵吧。');
  assert.ok(completed.thinking.indexOf('认知洗牌') !== -1);
  assert.equal(completed.text, '嗯，那些念头很吵吧。');
  delete global.wx;
});

test('thinking works alongside card markers and the safe flag', () => {
  const full = `@@THINK@@出现入睡信号，推雨声。@@ANSWER@@晚安，雨声替你值夜。@@SAFE@@\n${REC_MARKER}{"sound":"rain","minutes":30}`;
  const result = agentClient.splitResponse(full);
  assert.equal(result.text, '晚安，雨声替你值夜。');
  assert.equal(result.safe, true);
  assert.equal(result.recommendation.sound, 'rain');
});

test('partial thinking stays hidden while streaming before the answer marker arrives', () => {
  const partial = agentClient.splitResponse('@@THINK@@用户好像准备收尾了，等她把话说完');
  assert.equal(partial.text, '', 'ANSWER 未到时可见文本为空（呈现打字中）');
  assert.ok(partial.thinking);
  // 模型漏写 ANSWER 但正文已在 THINK 之前的情况（罕见）：前文照常显示。
  const prefixed = agentClient.splitResponse('嗯，我在。@@THINK@@只写了思考忘了结束标记');
  assert.equal(prefixed.text, '嗯，我在。');
});

test('chat requests enough tokens for thinking plus the reply body', () => {
  let options;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived() {}, abort() {} };
    }
  };
  try {
    agentClient.chat({ onComplete() {}, onError() {} });
    assert.equal(options.data.max_tokens, agentClient.MAX_TOKENS);
    assert.equal(options.data.max_tokens, 2000, '思考路径 + 正文 + 卡片 JSON 的实测预算');
    assert.ok(options.data.messages[0].content.indexOf(agentClient.THINK_MARKER) !== -1);
  } finally {
    delete global.wx;
  }
});

test('knowledge citation double-confirm: @@KB@@ marker is stripped and reported', () => {
  const cited = agentClient.splitResponse('试试刺激控制。\n@@KB@@\n@@REC@@{\"sound\":\"rain\"}');
  assert.equal(cited.kbCited, true, '正文后输出 @@KB@@ → 自证引用');
  assert.ok(cited.text.indexOf('@@KB@@') === -1, '标记不进气泡');
  assert.equal(cited.recommendation.sound, 'rain', '与推荐卡共存');
  const notCited = agentClient.splitResponse('我在的，慢慢说。');
  assert.equal(notCited.kbCited, false, '未输出标记 → 未引用');
  const safeAndKb = agentClient.splitResponse('我陪着你。\n@@KB@@\n@@SAFE@@');
  assert.equal(safeAndKb.kbCited, true);
  assert.equal(safeAndKb.safe, true, '与 @@SAFE@@ 正交共存');
});
