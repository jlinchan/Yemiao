const storage = require('./services/storage');
const { createDeadline, remainingMs, fadeVolume, normalizeMinutes } = require('./utils/sound-timer');

App({
  globalData: {
    settings: null,
    audio: null,
    effectAudio: null,
    noise: null, // 白噪音 WebAudio 引擎：{ ctx, gain, source }
    audioState: {
      sound: 'breeze',
      playing: false,
      volume: 0.42,
      timerMinutes: 30,
      timerEndsAt: 0
    }
  },

  onLaunch() {
    const settings = storage.getSettings();
    this.globalData.settings = settings;
    this.globalData.audioState = {
      sound: settings.sound || 'breeze',
      playing: false,
      volume: typeof settings.soundVolume === 'number' ? settings.soundVolume : 0.42,
      timerMinutes: normalizeMinutes(settings.soundTimerMinutes),
      timerEndsAt: 0
    };
  },

  onShow() { this.syncSoundTimer(Date.now()); },

  getAudio() {
    if (!this.globalData.audio) {
      const audio = wx.createInnerAudioContext();
      audio.loop = true;
      audio.obeyMuteSwitch = true;
      audio.onError(() => {
        this.clearSoundTimers();
        this.globalData.audioState.playing = false;
      });
      this.globalData.audio = audio;
    }
    return this.globalData.audio;
  },

  // ── 白噪音引擎 ────────────────────────────────────────────────
  // assets/audio/white.mp3 是构建脚本生成的 8 秒占位音频，循环播放有接缝、
  // 周期感明显，不是真正的白噪音。这里改用 WebAudio 实时合成：
  // 按设备采样率生成噪声缓冲并循环，采样级无缝、时长无限、不占包体。
  // 不支持 WebAudio 的环境（旧基础库/开发工具异常）自动回落 mp3 占位文件。
  noiseSupported() {
    return typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function';
  },

  getNoiseEngine() {
    if (!this.globalData.noise) {
      const ctx = wx.createWebAudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      this.globalData.noise = { ctx, gain, source: null };
    }
    return this.globalData.noise;
  },

  // 白噪音原始振幅较大，乘一个内部系数让默认音量（0.42）落在安静助眠的区间。
  noiseLevel(volume) {
    return Math.max(0, Math.min(1, Number(volume) || 0) * 0.32);
  },

  isNoisePlaying() {
    const engine = this.globalData.noise;
    return !!(engine && engine.source);
  },

  startNoise(volume) {
    const engine = this.getNoiseEngine();
    this.stopNoiseSource();
    const { ctx, gain } = engine;
    const seconds = 2; // 纯随机噪声无需长缓冲，2 秒循环即无缝
    const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = this.noiseLevel(volume);
    source.connect(gain);
    source.start();
    engine.source = source;
  },

  stopNoiseSource() {
    const engine = this.globalData.noise;
    if (!engine || !engine.source) return;
    try { engine.source.stop(); } catch (error) { /* 已停止则忽略 */ }
    try { engine.source.disconnect(); } catch (error) { /* 已断开则忽略 */ }
    engine.source = null;
  },

  // 统一音量出口：白噪音走 gain，其余走 InnerAudioContext.volume
  applySoundVolume(volume) {
    if (this.isNoisePlaying()) {
      this.globalData.noise.gain.gain.value = this.noiseLevel(volume);
    } else if (this.globalData.audio) {
      this.globalData.audio.volume = volume;
    }
    this.globalData.audioState.volume = volume;
  },

  playSound(sound, volume, timerMinutes) {
    const nextVolume = typeof volume === 'number' ? volume : this.globalData.audioState.volume;
    const minutes = normalizeMinutes(timerMinutes || this.globalData.audioState.timerMinutes);
    const timerEndsAt = createDeadline(Date.now(), minutes);
    if (sound === 'white' && this.noiseSupported()) {
      this.getAudio().stop();
      this.startNoise(nextVolume);
    } else {
      this.stopNoiseSource();
      const audio = this.getAudio();
      audio.stop();
      audio.src = `/assets/audio/${sound}.mp3`;
      audio.volume = nextVolume;
      audio.play();
    }
    this.globalData.audioState = { sound, playing: true, volume: nextVolume, timerMinutes: minutes, timerEndsAt };
    storage.saveSettings(Object.assign({}, storage.getSettings(), { sound, soundEnabled: true, soundVolume: nextVolume, soundTimerMinutes: minutes }));
    this.scheduleSoundTimer();
  },

  pauseSound() {
    this.clearSoundTimers();
    this.stopNoiseSource();
    if (this.globalData.audio) this.globalData.audio.pause();
    this.globalData.audioState.playing = false;
    this.globalData.audioState.timerEndsAt = 0;
    storage.saveSettings(Object.assign({}, storage.getSettings(), { soundEnabled: false }));
  },

  resetAudioPreferences() {
    this.pauseSound();
    if (this.globalData.audio) {
      this.globalData.audio.stop();
      this.globalData.audio.volume = 0.42;
    }
    this.globalData.audioState = { sound: 'breeze', playing: false, volume: 0.42, timerMinutes: 30, timerEndsAt: 0 };
  },

  setSoundVolume(volume) {
    this.applySoundVolume(volume);
    storage.saveSettings(Object.assign({}, storage.getSettings(), { soundVolume: volume }));
  },

  setSoundTimer(minutes) {
    const next = normalizeMinutes(minutes);
    this.globalData.audioState.timerMinutes = next;
    storage.saveSettings(Object.assign({}, storage.getSettings(), { soundTimerMinutes: next }));
    if (this.globalData.audioState.playing) {
      this.globalData.audioState.timerEndsAt = createDeadline(Date.now(), next);
      this.scheduleSoundTimer();
    }
  },

  clearSoundTimers() {
    clearTimeout(this.soundTimer);
    clearInterval(this.fadeTimer);
  },

  scheduleSoundTimer() {
    this.clearSoundTimers();
    if (!this.globalData.audioState.playing) return;
    const left = remainingMs(this.globalData.audioState.timerEndsAt, Date.now());
    if (left <= 5000) {
      this.startSoundFade();
      return;
    }
    this.soundTimer = setTimeout(() => this.startSoundFade(), left - 5000);
  },

  startSoundFade() {
    clearInterval(this.fadeTimer);
    const baseVolume = this.globalData.audioState.volume;
    const tick = () => {
      const left = remainingMs(this.globalData.audioState.timerEndsAt, Date.now());
      this.applySoundVolume(fadeVolume(baseVolume, left, 5000));
      if (left === 0) {
        this.clearSoundTimers();
        this.stopNoiseSource();
        if (this.globalData.audio) this.globalData.audio.stop();
        this.globalData.audioState.playing = false;
        this.globalData.audioState.timerEndsAt = 0;
        storage.saveSettings(Object.assign({}, storage.getSettings(), { soundEnabled: false }));
      }
    };
    tick();
    if (this.globalData.audioState.playing) this.fadeTimer = setInterval(tick, 250);
  },

  syncSoundTimer(now) {
    if (!this.globalData.audioState.playing) return;
    if (remainingMs(this.globalData.audioState.timerEndsAt, now) === 0) {
      this.startSoundFade();
      return;
    }
    this.scheduleSoundTimer();
  },

  playCompletionCue() {
    if (!this.globalData.effectAudio) {
      const audio = wx.createInnerAudioContext();
      audio.loop = false;
      audio.obeyMuteSwitch = true;
      this.globalData.effectAudio = audio;
    }
    const audio = this.globalData.effectAudio;
    audio.stop();
    audio.src = '/assets/audio/complete.mp3';
    audio.volume = 0.28;
    audio.play();
  }
});
