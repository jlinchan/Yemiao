const content = require('../../data/nightcat-content');
const directory = require('../../data/skill-directory');
const { bookGreeting } = require('../../services/skill-conversation');
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

  talkToNightcat() {
    if (!this.data.book) return;
    // 引导语由夜喵作为开场白说出（entry=book，模板单一来源见 services/skill-conversation.js），
    // 不再伪装成用户发言；「怎么陪」的节奏由 agent 侧全局对话规则保证。
    wx.navigateTo({ url: `/pages/agent/index?entry=book&greeting=${encodeURIComponent(bookGreeting(this.data.book.title))}` });
  }
});
