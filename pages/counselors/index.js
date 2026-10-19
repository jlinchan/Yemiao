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
    wx.navigateTo({ url: `/pages/agent/index?counselorId=${encodeURIComponent(counselor.id)}` });
  }
});
