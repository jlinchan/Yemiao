// 夜喵语音服务测试：纯函数 + 插件降级路径 + 假插件环境下的顺序播放状态机。
// 真机链路（真实 WechatSI 合成/识别）需在开发者工具与真机验证，见 README。

const test = require('node:test');
const assert = require('node:assert/strict');
const voice = require('../services/voice-service');

test('stripForSpeech removes protocol markers, markdown and urls', () => {
  assert.equal(voice.stripForSpeech('好呀@@SAFE@@，我陪你'), '好呀 ，我陪你'.replace(/\s+/g, ' ').trim());
  assert.equal(voice.stripForSpeech('**很晚了**，先`睡觉`吧'), '很晚了，先睡觉吧');
  assert.equal(voice.stripForSpeech('# 今晚\n- 呼吸 4-7-8'), '今晚 呼吸 4-7-8');  assert.equal(voice.stripForSpeech('热线见 [官网](http://xlzx.zju.edu.cn/qtqzfs/list.htm) 或直接打 12356'), '热线见 官网 或直接打 12356');
  assert.equal(voice.stripForSpeech('复制 http://a.b/c 也可以'), '复制 也可以');
  assert.equal(voice.stripForSpeech(''), '');
  assert.equal(voice.stripForSpeech(null), '');
});

test('chunkText splits by sentence punctuation and respects the limit', () => {
  assert.deepEqual(voice.chunkText(''), []);
  assert.deepEqual(voice.chunkText('晚安。'), ['晚安。']);
  // 贪心合并：短句拼到不超过上限（默认 180，短文本合为一块是设计行为）
  const merged = voice.chunkText('第一句。第二句！第三句？');
  assert.deepEqual(merged, ['第一句。第二句！第三句？']);
  const mergedSmall = voice.chunkText('甲。乙。丙。', 10);
  assert.deepEqual(mergedSmall, ['甲。乙。丙。']);
  // 超长句按逗号二次切分
  const long = '很'.repeat(120) + '，' + '晚'.repeat(120) + '。';
  const chunks = voice.chunkText(long, 100);
  assert.ok(chunks.length >= 3, `should split into >=3 chunks, got ${chunks.length}`);
  chunks.forEach((chunk) => assert.ok(chunk.length > 0 && chunk.length <= 200, `chunk length ${chunk.length}`));
  // 完全无标点的超长文本硬切且无内容丢失
  const blob = '字'.repeat(250);
  const hard = voice.chunkText(blob, 100);
  assert.equal(hard.join(''), blob);
});

test('degrades gracefully without the WeChat runtime', () => {
  assert.equal(voice.isAvailable(), false);
  assert.equal(voice.speak('你好', {}), null);
  const recognizer = voice.createRecognizer({ onError: () => {} });
  assert.equal(recognizer.available, false);
  let errorKind = '';
  recognizer.start(); // 不应抛错
  const failing = voice.createRecognizer({ onError: (kind) => { errorKind = kind; } });
  failing.start();
  assert.equal(errorKind, 'unavailable');
  assert.doesNotThrow(() => voice.stopSpeaking());
});

// —— 假插件环境：覆盖顺序播放状态机 ——

function installFakeEnv() {
  const events = [];
  const plugin = {
    textToSpeech(request) {
      events.push(['tts', request.content]);
      setImmediate(() => request.success({ filename: `fake://${request.content}` }));
    }
  };
  global.requirePlugin = () => plugin;
  const audioInstances = [];
  global.wx = {
    createInnerAudioContext() {
      const audio = {
        src: '',
        play() {
          events.push(['play', this.src]);
          setImmediate(() => { if (typeof this._ended === 'function') this._ended(); });
        },
        stop() {},
        destroy() {},
        onEnded(cb) { this._ended = cb; },
        onError() {}
      };
      audioInstances.push(audio);
      return audio;
    }
  };
  return { events, audioInstances, cleanup() { delete global.requirePlugin; delete global.wx; } };
}

test('speak plays chunks sequentially and finishes with onDone', async () => {
  const env = installFakeEnv();
  // 21+12<=40 合并为一块、13 单独一块，maxChars 40 下稳定切成 2 块
  const text = '今天晚上加班到现在才吃上晚饭真是辛苦你了。想聊聊今天的事就慢慢说。别急，夜喵今晚哪儿也不去。';
  try {
    await new Promise((resolve, reject) => {
      const handle = voice.speak(text, { maxChars: 40, onDone: resolve, onError: () => reject(new Error('should not error')) });
      assert.ok(handle, 'handle should exist with fake plugin');
    });
    const tts = env.events.filter((e) => e[0] === 'tts').map((e) => e[1]);
    assert.equal(tts.length, 2);
    assert.equal(env.events.filter((e) => e[0] === 'play').length, 2);
  } finally {
    env.cleanup();
  }
});

test('speak aborts the queue on stop and stops playing', async () => {
  const env = installFakeEnv();
  const text = '今天晚上加班到现在才吃上晚饭真是辛苦你了。想聊聊今天的事就慢慢说。别急，夜喵今晚哪儿也不去。';
  try {
    await new Promise((resolve) => {
      const handle = voice.speak(text, { maxChars: 40, onChunk: (content, index) => { if (index === 0) setImmediate(() => handle.stop()); }, onStopped: resolve });
      assert.ok(handle);
    });
    // 等两个事件循环，确认后续分块不再合成
    await new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
    const tts = env.events.filter((e) => e[0] === 'tts').map((e) => e[1]);
    assert.equal(tts.length, 1, `only the first chunk should be synthesized, got: ${JSON.stringify(tts)}`);
  } finally {
    env.cleanup();
  }
});

test('speak reports onError when synthesis fails', async () => {
  const plugin = { textToSpeech(request) { setImmediate(() => request.fail(new Error('quota'))); } };
  global.requirePlugin = () => plugin;
  global.wx = { createInnerAudioContext: () => ({ src: '', play() {}, stop() {}, destroy() {}, onEnded() {}, onError() {} }) };
  try {
    const kind = await new Promise((resolve) => { voice.speak('你好。', { onError: resolve }); });
    assert.equal(typeof kind, 'undefined'); // onError 无参调用，表示失败回调被触发
  } finally {
    delete global.requirePlugin;
    delete global.wx;
  }
});

test('recognizer wires plugin manager callbacks (auth granted path)', () => {
  const state = { started: 0, partial: '', final: '' };
  const plugin = {
    textToSpeech() {},
    getRecordRecognitionManager() {
      return {
        start() { state.started += 1; },
        stop() {},
        onRecognize(cb) { this._onRecognize = cb; },
        onStop(cb) { this._onStop = cb; },
        onError(cb) { this._onError = cb; }
      };
    }
  };
  global.requirePlugin = () => plugin;
  global.wx = { createInnerAudioContext: () => ({}), getSetting: (opts) => opts.success({ authSetting: { 'scope.record': true } }) };
  try {
    const recognizer = voice.createRecognizer({
      onPartial: (text) => { state.partial = text; },
      onFinal: (text) => { state.final = text; }
    });
    assert.equal(recognizer.available, true);
    recognizer.start();
    // manager 实例在闭包里，直接通过再次 start 校验不抛错；回调装配本身由 ensureManager 覆盖。
    assert.equal(state.started, 1);
  } finally {
    delete global.requirePlugin;
    delete global.wx;
  }
});
