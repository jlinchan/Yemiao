const directory = require('../data/book-directory');
const navigation = require('../utils/navigation');

function getBookDetailUrl(bookId) {
  const book = directory.findBook(bookId);
  if (!book) return null;
  return `/pages/book-detail/index?bookId=${encodeURIComponent(book.id)}`;
}

function openBookDetail(bookId, page) {
  const url = getBookDetailUrl(bookId);
  if (!url) return false;
  if (page) return navigation.navigateOnce(page, `book:${bookId}`, url);
  wx.navigateTo({ url });
  return true;
}

module.exports = {
  getBookDetailUrl,
  openBookDetail
};
