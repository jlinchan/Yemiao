const content = require('../../data/nightcat-content');
const directory = require('../../data/skill-directory');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    assets: content.assets,
    book: null
  },

  onLoad(options) {
    const id = options && options.id;
    const book = content.findBook(id) || directory.findSkill(id) || content.books[0];
    this.book = book;
    this.setData({ book });
  },

  onShow() {
    this.setData({ nav: getNavigationMetrics() });
  },

  goBack() {
    navigation.backOrHome();
  },

  startPractice() {
    wx.reLaunch({ url: '/pages/breathe/index' });
  },

  talkToNightcat() {
    if (!this.data.book) return;
    const prompt = `我想练习《${this.data.book.title}》里的方法。`;
    wx.navigateTo({ url: `/pages/agent/index?prompt=${encodeURIComponent(prompt)}` });
  }
});
