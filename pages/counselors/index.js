const content = require('../../data/counselor-directory');
const selection = require('../../services/counselor-selection');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    assets: content.assets,
    categories: content.categories,
    category: 'all',
    counselors: content.counselors,
    selectedId: selection.DEFAULT_ID
  },

  onLoad(options) {
    const fromQuery = options && options.id;
    this.setData({
      selectedId: content.findCounselor(fromQuery) ? fromQuery : selection.read()
    });
  },

  onShow() {
    this.setData({ nav: getNavigationMetrics() });
  },

  goBack() {
    navigation.backOrHome();
  },

  selectCategory(event) {
    const category = event.currentTarget.dataset.id;
    if (!content.categories.some((item) => item.id === category)) return;
    this.setData({ category, counselors: content.filterCounselors(category) });
  },

  resetFilters() {
    this.setData({ category: 'all', counselors: content.counselors });
  },

  choose(event) {
    const id = event.currentTarget.dataset.id;
    const counselor = content.findCounselor(id);
    if (!counselor) return;
    this.setData({ selectedId: selection.save(id) });
    // 引导语由陪伴者作为开场白说出（entry=counselor），并带上身份 id——
    // 对话页据此切换头部/说话人名字并注入该陪伴者的 persona（2026-10-19 打通）。
    wx.navigateTo({ url: `/pages/agent/index?entry=counselor&counselor=${id}&greeting=${encodeURIComponent(counselor.prompt)}` });
  }
});
