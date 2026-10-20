const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('home covers open book details while action buttons retain direct chat', () => {
  const script = path.resolve(__dirname, '../pages/home/index.js');
  const routes = [];
  let page;
  const wx = { navigateTo: ({ url }) => routes.push(url) };
  global.wx = wx;
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    wx
  });
  for (const book of page.data.books) {
    const event = { currentTarget: { dataset: { id: book.id } } };
    page.openBookDetail(event);
    assert.equal(routes.pop(), `/pages/book-detail/index?bookId=${book.id}`);
    page.openSkill(event);
    const route = new URL(routes.pop(), 'https://local.test');
    assert.equal(route.pathname, '/pages/agent/index');
    assert.equal(route.searchParams.get('entry'), 'book', '书中技能入口标记为 book 板块');
    assert.equal(route.searchParams.get('bookId'), book.id, '书籍 ID 必须随对话传入');
    assert.ok(route.searchParams.get('greeting').includes(`《${book.title}》`), '引导语由夜喵开场，不再是伪装的用户发言');
  }
  page.openBookDetail({ currentTarget: { dataset: { id: 'invalid' } } });
  assert.deepEqual(routes, []);
  page.openSkills();
  assert.equal(routes.pop(), '/pages/skills/index');
  const wxml = fs.readFileSync(script.replace(/\.js$/, '.wxml'), 'utf8');
  assert.match(wxml.match(/<button\b[^>]*class="book-cover-button"[^>]*>/)[0], /catchtap="openBookDetail"/);
  assert.match(wxml.match(/<button\b[^>]*class="book-cta"[^>]*>/)[0], /bindtap="openSkill"/);
  delete global.wx;
});
