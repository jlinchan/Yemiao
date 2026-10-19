const storage = require('../../services/storage');
const agentPort = require('../../services/agent-port');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    sounds: [
      { id: 'rain', name: '雨声', detail: '细密、连续', glyph: '⌁' },
      { id: 'breeze', name: '微风', detail: '轻柔、留白', glyph: '≋' },
      { id: 'lake', name: '湖水', detail: '缓慢、开阔', glyph: '◌' },
      { id: 'white', name: '白噪音', detail: '稳定、均匀', glyph: '·' }
    ],
    selected: storage.getSettings().sound || 'breeze',
    playing: false,
    volume: 42,
    timerOptions: [15, 30, 60],
    timerMinutes: 30,
    nav: getNavigationMetrics()
  },
  onLoad(options = {}) {
    const state = getApp().globalData.audioState;
    this.setData({ selected: state.sound || this.data.selected, playing: state.playing, volume: Math.round((state.volume || 0.42) * 100), timerMinutes: state.timerMinutes || 30 });
    if (this.data.sounds.some((item) => item.id === options.sound)) this.setData({ selected: options.sound, playing: false, timerMinutes: [15,30,60].indexOf(Number(options.minutes)) >= 0 ? Number(options.minutes) : 30 });
  },
  onShow() { this.setData({ playing: getApp().globalData.audioState.playing, nav: getNavigationMetrics() }); },
  goBack() { navigation.backOrHome(); },
  selectSound(event) {
    const selected = event.currentTarget.dataset.id;
    const settings = storage.saveSettings(Object.assign({}, storage.getSettings(), { sound: selected }));
    this.setData({ selected, settings });
    if (this.data.playing) {
      getApp().playSound(selected, this.data.volume / 100);
      agentPort.publish('sound', 'sound_played', { sound: selected, minutes: this.data.timerMinutes });
    }
  },
  togglePlay() {
    const playing = !this.data.playing;
    if (playing) {
      getApp().playSound(this.data.selected, this.data.volume / 100, this.data.timerMinutes);
      agentPort.publish('sound', 'sound_played', { sound: this.data.selected, minutes: this.data.timerMinutes });
    } else {
      getApp().pauseSound();
      agentPort.publish('sound', 'sound_stopped', { sound: this.data.selected });
    }
    this.setData({ playing });
  },
  onVolumeChange(event) {
    const volume = event.detail.value;
    getApp().setSoundVolume(volume / 100);
    this.setData({ volume });
  },
  chooseTimer(event) {
    const timerMinutes = Number(event.currentTarget.dataset.minutes);
    getApp().setSoundTimer(timerMinutes);
    this.setData({ timerMinutes });
  }
});
