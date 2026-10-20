const storage = require('../../services/storage');
const agentPort = require('../../services/agent-port');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const calendar = require('../../utils/sleep-calendar');

Page({
  data: {
    bedTime: '23:00',
    wakeTime: '07:00',
    feeling: 3,
    duration: '8 小时',
    records: [],
    feelings: [1, 2, 3, 4, 5],
    nav: getNavigationMetrics()
  },
  onLoad(options = {}) {
    const records = storage.read(storage.KEYS.sleep, []);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const nightDate = calendar.parseDate(options.nightDate) ? options.nightDate : calendar.dateKey(yesterday);
    const existing = records.find((item) => item.nightDate === nightDate);
    this.setData(Object.assign({ records, nightDate }, existing ? { bedTime: existing.bedTime, wakeTime: existing.wakeTime, feeling: existing.feeling } : {}));
    this.calculateDuration();
  },
  onDateChange(event) {
    const nightDate = event.detail.value;
    if (!calendar.parseDate(nightDate)) return;
    const existing = this.data.records.find((item) => item.nightDate === nightDate);
    this.setData(Object.assign({ nightDate }, existing ? { bedTime: existing.bedTime, wakeTime: existing.wakeTime, feeling: existing.feeling } : {}));
    this.calculateDuration();
  },
  onShow() { this.setData({ nav: getNavigationMetrics() }); },
  goBack() { navigation.backOrHome(); },
  onBedChange(event) { this.setData({ bedTime: event.detail.value }, () => this.calculateDuration()); },
  onWakeChange(event) { this.setData({ wakeTime: event.detail.value }, () => this.calculateDuration()); },
  setFeeling(event) { this.setData({ feeling: Number(event.currentTarget.dataset.value) }); },
  calculateDuration() {
    const [bedHour, bedMinute] = this.data.bedTime.split(':').map(Number);
    const [wakeHour, wakeMinute] = this.data.wakeTime.split(':').map(Number);
    let minutes = wakeHour * 60 + wakeMinute - (bedHour * 60 + bedMinute);
    if (minutes <= 0) minutes += 24 * 60;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    this.setData({ duration: `${hours} 小时${rest ? ` ${rest} 分钟` : ''}` });
  },
  saveSleep() {
    const now = calendar.parseDate(this.data.nightDate);
    if (!now || this.data.nightDate > calendar.dateKey(new Date())) { wx.showToast({ title: '请选择有效的夜间日期', icon: 'none' }); return; }
    const records = storage.read(storage.KEYS.sleep, []);
    const existing = records.find((item) => item.nightDate === this.data.nightDate);
    const next = records.filter((item) => item.nightDate !== this.data.nightDate);
    const dateLabel = `${now.getMonth() + 1} 月 ${now.getDate()} 日`;
    next.unshift({ id: existing ? existing.id : `sleep-${Date.now()}`, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now(), nightDate: this.data.nightDate, bedTime: this.data.bedTime, wakeTime: this.data.wakeTime, feeling: this.data.feeling, duration: this.data.duration, date: dateLabel });
    if (!storage.write(storage.KEYS.sleep, next.slice(0, 366))) { wx.showToast({ title: '保存未成功，请重试', icon: 'none' }); return; }
    agentPort.publish('sleep', 'sleep_saved', { date: dateLabel, duration: this.data.duration, nightDate: this.data.nightDate });
    this.setData({ records: next.slice(0, 366) });
    wx.showToast({ title: '已经记下', icon: 'none' });
  }
});
