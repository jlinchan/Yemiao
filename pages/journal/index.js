const storage = require('../../services/storage');
const agentPort = require('../../services/agent-port');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    entries: [{ id: 1, text: '' }, { id: 2, text: '' }, { id: 3, text: '' }],
    savedEntries: [],
    saved: false,
    nav: getNavigationMetrics()
  },
  onLoad() { this.loadEntries(); },
  onShow() { this.setData({ nav: getNavigationMetrics() }); },
  loadEntries() {
    const savedEntries = storage.read(storage.KEYS.journal, []);
    this.setData({ savedEntries });
  },
  goBack() { navigation.backOrHome(); },
  onInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ [`entries[${index}].text`]: event.detail.value, saved: false });
  },
  saveJournal() {
    const items = this.data.entries.map((entry) => entry.text.trim()).filter(Boolean).slice(0, 3);
    if (!items.length) {
      wx.showToast({ title: '写下一点什么再保存', icon: 'none' });
      return;
    }
    const savedEntries = storage.read(storage.KEYS.journal, []);
    savedEntries.unshift({ id: `journal-${Date.now()}`, createdAt: Date.now(), date: this.formatDate(new Date()), items });
    storage.write(storage.KEYS.journal, savedEntries.slice(0, 30));
    agentPort.publish('journal', 'journal_saved', { count: items.length });
    const entries = this.data.entries.map((entry) => ({ id: entry.id, text: '' }));
    this.setData({ entries, savedEntries: savedEntries.slice(0, 30), saved: true });
  },
  formatDate(date) { return `${date.getMonth() + 1} 月 ${date.getDate()} 日`; }
});
