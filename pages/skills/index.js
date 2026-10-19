const content = require('../../data/skill-directory');
const navigation = require('../../utils/navigation');
const { getConversationUrl } = require('../../services/skill-conversation');
const { openBookDetail } = require('../../services/book-navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    categories: content.categories,
    category: 'all',
    skills: content.skills
  },
  onShow() { this.setData({ nav: getNavigationMetrics() }); },
  goBack() { navigation.backOrHome(); },
  selectCategory(event) {
    const category = event.currentTarget.dataset.id;
    if (!content.categories.some((item) => item.id === category)) return;
    this.setData({ category, skills: content.filterSkills(category) });
  },
  resetFilters() {
    this.setData({ category: 'all', skills: content.skills });
  },
  openBookDetail(event) {
    openBookDetail(event.currentTarget.dataset.id, this);
  },
  startConversation(event) {
    const url = getConversationUrl(event.currentTarget.dataset.id);
    if (url) navigation.navigateOnce(this, `chat:${event.currentTarget.dataset.id}`, url);
  }
});
