const directory = require('../../data/book-directory');
const navigation = require('../../utils/navigation');
const { getBookConversationUrl } = require('../../services/skill-conversation');
const { getNavigationMetrics } = require('../../utils/layout');

function decodeId(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

Page({
  data: {
    nav: getNavigationMetrics(),
    heroTop: 104,
    book: null,
    invalid: false
  },

  onLoad(options) {
    const bookId = decodeId(options && options.bookId);
    const book = directory.findBook(bookId);
    if (!book) {
      this.setData({ invalid: true });
      return;
    }

    const meta = [];
    if (book.translator) meta.push(`主译 ${book.translator}`);
    if (book.publisher) meta.push(book.publisher);
    if (book.publishedYear) meta.push(book.publishedYear);
    const statusLine = [
      book.coverNote ? `${book.coverNote}。` : '',
      book.statusNote || ''
    ].filter(Boolean).join('');

    this.setData({
      book: Object.assign({}, book, {
        detailCover: book.coverLarge || book.cover,
        metaLine: meta.join(' · '),
        statusLine,
        hasSkills: Array.isArray(book.skills) && book.skills.length > 0
      })
    });
    this.syncLayout();
  },

  onShow() {
    this.syncLayout();
  },

  syncLayout() {
    const nav = getNavigationMetrics();
    this.setData({
      nav,
      heroTop: nav.navigationBottom + 32
    });
  },

  goBack() {
    navigation.backOrHome();
  },

  startBookConversation() {
    if (!this.data.book) return;
    const url = getBookConversationUrl(this.data.book.id);
    if (url) navigation.navigateOnce(this, `book-chat:${this.data.book.id}`, url);
  },

  openSkill(event) {
    const book = this.data.book;
    if (!book || !Array.isArray(book.skills)) return;
    const skillId = event.currentTarget.dataset.id;
    const skill = book.skills.find((item) => item.id === skillId);
    if (!skill) return;
    const url = getBookConversationUrl(book.id, skill.id);
    if (url) navigation.navigateOnce(this, `skill-chat:${book.id}:${skill.id}`, url);
  }
});
