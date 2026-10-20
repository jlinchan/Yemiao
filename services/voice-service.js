// 夜喵语音服务：微信同声传译插件（WechatSI，官方插件 wx069ba97219f66d99）的端内封装。
// 调研方案 E（语音）落地：TTS 朗读夜喵回复 + ASR 按住说话输入。
//
// 设计约束（与 2MB 包体红线配套）：
// - 插件不计入代码包体积；但 app.json 的 plugins 配置必须在 mp 后台添加插件后才可写入，
//   否则小程序无法运行。因此本服务对「插件未配置/不可用」全程软降级：available=false，
//   页面据此隐藏语音入口，其余功能完全不受影响。
// - 纯函数（stripForSpeech / chunkText）与降级路径可在 node --test 下覆盖；
//   插件真实链路需在开发者工具/真机验证（README 记录）。

// —— 纯函数：朗读文本清洗 ——

// 剥离协议标记与 markdown 符号，得到适合朗读的纯文本：
// - @@SAFE@@ / @@REC@@ / @@PUSH@@ / @@ASK@@ / @@DO@@ 等系统标记绝不念出来；
// - 加粗/标题/行内代码符号在语音里是噪音，剥掉但保留内容；
// - 链接只念文案不念 URL；空白折叠，换行转成空格（TTS 引擎自动处理停顿）。
function stripForSpeech(rawText) {
  return String(rawText || '')
    .replace(/@@\w+@@/g, ' ')
    .replace(/<think[\s\S]*?<\/think>/gi, ' ')
    .replace(/<\/?think[^>]*>/gi, ' ')
    .replace(/<\s*\|[^|>]{0,64}\|\s*>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>~]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 按句读切块：WechatSI 单次合成对长文本不友好（耗时与截断风险），夜喵长回复需要分段播。
// 策略：先按句子分隔（。！？；…与换行），贪心拼到 maxChars 上限；单独超长的句子再按
// 逗号、顿号二次切分，最后仍超长的硬切，保证不产生空块。
// 不用正则环视（(?<=…)）：旧 iOS 的 JavaScriptCore 不支持，模块解析期就会抛错。
function splitByDelimiters(text, delimiters) {
  const parts = [];
  let buffer = '';
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    buffer += ch;
    if (delimiters.indexOf(ch) !== -1) { parts.push(buffer); buffer = ''; }
  }
  if (buffer.trim()) parts.push(buffer);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function chunkText(rawText, maxChars) {
  const limit = Math.max(40, Number(maxChars) || 180);
  const text = String(rawText || '').trim();
  if (!text) return [];
  const sentences = splitByDelimiters(text, '。！？；…\n');
  const chunks = [];
  let current = '';
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  const emitOversize = (piece) => {
    if (piece.length <= limit) { chunks.push(piece); return; }
    for (let index = 0; index < piece.length; index += limit) chunks.push(piece.slice(index, index + limit));
  };
  sentences.forEach((sentence) => {
    if (sentence.length > limit) {
      pushCurrent();
      splitByDelimiters(sentence, '，、：').forEach((part) => {
        if (current.length + part.length <= limit) current += part;
        else { pushCurrent(); emitOversize(part); }
      });
      return;
    }
    if (current.length + sentence.length <= limit) current += sentence;
    else { pushCurrent(); current = sentence; }
  });
  pushCurrent();
  return chunks;
}

// —— 插件封装（全部软降级） ——

// 惰性取插件：requirePlugin 未定义（node 测试环境）或插件未在 app.json 声明时返回 null。
function getPlugin() {
  try {
    if (typeof requirePlugin !== 'function') return null;
    const plugin = requirePlugin('WechatSI');
    return plugin && typeof plugin.textToSpeech === 'function' ? plugin : null;
  } catch (error) {
    return null; // app.json 未声明插件时 requirePlugin 直接抛错，这是「未配置」的常态信号
  }
}

function isAvailable() {
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return false;
  return Boolean(getPlugin());
}

// 朗读一段文本。返回 { stop } 会话句柄；不可用或文本为空返回 null（调用方无需判断可用性）。
// 长文本按 chunkText 分段：每段先 textToSpeech 换回音频 URL，再用 innerAudioContext 顺序播放。
function speak(rawText, callbacks) {
  const options = callbacks || {};
  const plugin = getPlugin();
  if (!plugin || typeof wx === 'undefined' || !wx.createInnerAudioContext) return null;
  const chunks = chunkText(stripForSpeech(rawText), options.maxChars);
  if (!chunks.length) return null;
  const session = { stopped: false, audio: null, index: 0 };
  const finish = (kind) => {
    const done = options[kind];
    stopSpeakingSession(session);
    if (typeof done === 'function') done();
  };
  const playNext = () => {
    if (session.stopped) return;
    if (session.index >= chunks.length) { finish('onDone'); return; }
    const content = chunks[session.index];
    if (typeof options.onChunk === 'function') options.onChunk(content, session.index, chunks.length);
    try {
      plugin.textToSpeech({
        lang: 'zh_CN',
        tts: true,
        content,
        success: (res) => {
          if (session.stopped) return;
          const audio = wx.createInnerAudioContext();
          session.audio = audio;
          audio.src = res.filename;
          audio.onEnded(() => { session.index += 1; playNext(); });
          audio.onError(() => finish('onError'));
          audio.play();
        },
        fail: () => finish('onError')
      });
    } catch (error) {
      finish('onError');
    }
  };
  if (typeof options.onStart === 'function') options.onStart();
  playNext();
  const handle = {
    stop: () => {
      if (session.stopped) return;
      session.stopped = true;
      stopSpeakingSession(session);
      if (currentSession === handle) currentSession = null;
      if (typeof options.onStopped === 'function') options.onStopped();
    }
  };
  // 模块级单例：页面可以不保存句柄，直接调 stopSpeaking() 停掉最近一次朗读。
  currentSession = handle;
  return handle;
}

function stopSpeakingSession(session) {
  if (session.audio) {
    try { session.audio.stop(); session.audio.destroy(); } catch (error) { /* 已销毁的实例忽略 */ }
    session.audio = null;
  }
}

// 停止当前朗读（页面级单例）：未在播放时安全无操作。
function stopSpeaking() {
  if (currentSession) { currentSession.stop(); currentSession = null; }
}

let currentSession = null;

// 按住说话：返回识别器句柄。不可用时 available=false，start() 直接回调 onError('unavailable')。
// 录音需要 scope.record 授权：拒绝时回调 onError('auth')，由页面引导去设置页开启。
function createRecognizer(handlers) {
  const callbacks = handlers || {};
  const plugin = getPlugin();
  const available = isAvailable() && Boolean(plugin && typeof plugin.getRecordRecognitionManager === 'function');
  let manager = null;
  const ensureManager = () => {
    if (manager) return manager;
    manager = plugin.getRecordRecognitionManager();
    manager.onRecognize = (res) => {
      if (typeof callbacks.onPartial === 'function') callbacks.onPartial(String((res && res.result) || ''));
    };
    manager.onStop = (res) => {
      if (typeof callbacks.onFinal === 'function') callbacks.onFinal(String((res && res.result) || ''));
    };
    manager.onError = (res) => {
      if (typeof callbacks.onError === 'function') callbacks.onError(res && res.msg ? String(res.msg) : 'error');
    };
    return manager;
  };
  const requestRecordAuth = (onReady) => {
    wx.getSetting({
      success: (res) => {
        const granted = res.authSetting && res.authSetting['scope.record'];
        if (granted) { onReady(); return; }
        if (granted === false) {
          // 曾经拒绝过：authorize 不再弹窗，只能引导用户去设置页打开。
          if (typeof callbacks.onError === 'function') callbacks.onError('auth');
          return;
        }
        wx.authorize({
          scope: 'scope.record',
          success: onReady,
          fail: () => { if (typeof callbacks.onError === 'function') callbacks.onError('auth'); }
        });
      },
      fail: () => { if (typeof callbacks.onError === 'function') callbacks.onError('auth'); }
    });
  };
  return {
    available,
    start() {
      if (!available) { if (typeof callbacks.onError === 'function') callbacks.onError('unavailable'); return; }
      requestRecordAuth(() => {
        try {
          ensureManager().start({ lang: 'zh_CN', duration: 60000 });
        } catch (error) {
          if (typeof callbacks.onError === 'function') callbacks.onError('error');
        }
      });
    },
    stop() {
      if (!manager) return;
      try { manager.stop(); } catch (error) { /* 未在录音时 stop 可能抛错，忽略 */ }
    }
  };
}

module.exports = { stripForSpeech, chunkText, isAvailable, speak, stopSpeaking, createRecognizer };
