const storage = require('../../services/storage');
const { WORLDS } = require('../../utils/constants');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const { isPointOnBody } = require('../../utils/body-selection');

Page({
  data: {
    settings: storage.getSettings(),
    world: WORLDS[0],
    selectedPoint: null,
    nav: getNavigationMetrics()
  },

  onShow() {
    const settings = storage.getSettings();
    this.setData({
      nav: getNavigationMetrics(),
      settings,
      world: WORLDS.find((item) => item.id === settings.world) || WORLDS[0]
    });
  },

  selectPoint(event) {
    const tap = event.detail || {};
    wx.createSelectorQuery().in(this).select('.body-figure').boundingClientRect((rect) => {
      if (!rect) return;
      const x = ((tap.x - rect.left) / rect.width) * 100;
      const y = ((tap.y - rect.top) / rect.height) * 100;
      if (!isPointOnBody(x, y)) return;
      const selectedPoint = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      this.setData({ selectedPoint });
      this.navigateToPoint(selectedPoint);
    }).exec();
  },

  navigateToPoint(selectedPoint) {
    wx.navigateTo({
      url: `/pages/body/part?x=${selectedPoint.x}&y=${selectedPoint.y}`
    });
  },

  goBack() { navigation.backOrHome(); }
});
