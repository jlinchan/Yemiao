const storage = require('./services/storage');
const { createDeadline, remainingMs, fadeVolume, normalizeMinutes } = require('./utils/sound-timer');

App({
  globalData: {
    settings: null,
    audio: null,
    effectAudio: null,
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

  playSound(sound, volume, timerMinutes) {
    const audio = this.getAudio();
    const nextVolume = typeof volume === 'number' ? volume : this.globalData.audioState.volume;
    audio.stop();
    audio.src = `/assets/audio/${sound}.mp3`;
    audio.volume = nextVolume;
    const minutes = normalizeMinutes(timerMinutes || this.globalData.audioState.timerMinutes);
    const timerEndsAt = createDeadline(Date.now(), minutes);
    audio.play();
    this.globalData.audioState = { sound, playing: true, volume: nextVolume, timerMinutes: minutes, timerEndsAt };
    storage.saveSettings(Object.assign({}, storage.getSettings(), { sound, soundEnabled: true, soundVolume: nextVolume, soundTimerMinutes: minutes }));
    this.scheduleSoundTimer();
  },

  pauseSound() {
    this.clearSoundTimers();
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
    if (this.globalData.audio) this.globalData.audio.volume = volume;
    this.globalData.audioState.volume = volume;
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
      if (this.globalData.audio) this.globalData.audio.volume = fadeVolume(baseVolume, left, 5000);
      if (left === 0) {
        this.clearSoundTimers();
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
