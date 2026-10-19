const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = require('../data/book-directory');
const skillDirectory = require('../data/book-skills');
const bookNavigation = require('../services/book-navigation');
const bookContext = require('../services/book-context');
const { getBookConversationUrl } = require('../services/skill-conversation');

function loadPage(pageName, options) {
  let page;
  const routes = [];
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 44 }),
    getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281 }),
    navigateTo: ({ url }) => routes.push(url),
    navigateBack: () => routes.push('back'),
    reLaunch: ({ url }) => routes.push(url)
  };
  global.wx = wx;
  global.getCurrentPages = () => [{}, {}];
  const script = path.resolve(__dirname, `../pages/${pageName}/index.js`);
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    wx,
    require: (name) => require(path.resolve(path.dirname(script), name)),
    Page: (definition) => { page = definition; }
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (values) => Object.assign(page.data, values);
  if (page.onLoad) page.onLoad(options || {});
  if (page.onShow) page.onShow();
  return { page, routes, cleanup: () => { delete global.wx; delete global.getCurrentPages; } };
}

test('book directory is unique, stable and pins CBT-I first', () => {
  const books = directory.listBooks();
  assert.equal(books.length, 6);
  assert.equal(new Set(books.map((book) => book.id)).size, books.length);
  assert.equal(books[0].id, 'cbti-insomnia-perlis');
  assert.equal(books[0].pinned, true);
  assert.equal(directory.featuredBooks[0].id, 'cbti-insomnia-perlis');
  assert.deepEqual(books.map((book) => book.id), [
    'cbti-insomnia-perlis',
    'courage',
    'mr-toad',
    'inferiority',
    'talk',
    'nvc'
  ]);
  for (const book of books) {
    assert.ok(book.title && book.subtitle && book.shortDescription && book.desc && book.introduction);
    assert.ok(Array.from(book.shortDescription).length <= 14, `${book.id} 首页简介超过 14 字`);
    assert.equal(book.skills.length, 3, `${book.id} 应有三项精选技能`);
    assert.equal(new Set(book.skills.map((skill) => skill.id)).size, 3);
    assert.ok(fs.statSync(path.join(__dirname, '..', book.cover)).size > 0);
    assert.ok(fs.statSync(path.join(__dirname, '..', book.coverLarge)).size > 0);
    for (const skill of book.skills) {
      assert.equal(skill.bookId, book.id);
      assert.ok(skill.title && skill.desc && skill.concept && skill.scenario && skill.prompt && skill.source && skill.verification);
      assert.ok(Array.isArray(skill.questions) && skill.questions.length > 0);
      assert.ok(fs.statSync(path.join(__dirname, '..', skill.icon)).size > 0);
    }
  }
  assert.equal(books[0].shortDescription, '循序学习失眠认知行为疗法');
  assert.equal(books[0].isbn, '9787117153584');
  assert.equal(books[0].publisher, '人民卫生出版社');
  assert.equal(books[0].translator, '张斌');
  assert.equal(books[0].skills.length, 3);
  assert.equal(books[0].coverType, 'concept');
  assert.match(books[0].coverNote, /非出版社官方封面/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', books[0].sourceReference)));
});

test('book navigation rejects unknown ids and keeps the selected id in the route', () => {
  assert.equal(bookNavigation.getBookDetailUrl('missing'), null);
  assert.equal(
    bookNavigation.getBookDetailUrl('cbti-insomnia-perlis'),
    '/pages/book-detail/index?bookId=cbti-insomnia-perlis'
  );
});

test('book detail renders the requested book instead of falling back to the first one', (t) => {
  const cbti = loadPage('book-detail', { bookId: 'cbti-insomnia-perlis' });
  t.after(cbti.cleanup);
  assert.equal(cbti.page.data.book.id, 'cbti-insomnia-perlis');
  assert.equal(cbti.page.data.book.fullTitle, '失眠的认知行为治疗：逐次访谈指南');
  assert.equal(cbti.page.data.book.hasSkills, true);
  assert.equal(cbti.page.data.invalid, false);

  const courage = loadPage('book-detail', { bookId: 'courage' });
  t.after(courage.cleanup);
  assert.equal(courage.page.data.book.id, 'courage');
  assert.equal(courage.page.data.book.title, '被讨厌的勇气');

  const invalid = loadPage('book-detail', { bookId: 'not-a-book' });
  t.after(invalid.cleanup);
  assert.equal(invalid.page.data.book, null);
  assert.equal(invalid.page.data.invalid, true);
});

test('book detail actions carry book and skill ids into existing pages', (t) => {
  const { page, routes, cleanup } = loadPage('book-detail', { bookId: 'cbti-insomnia-perlis' });
  t.after(cleanup);

  page.startBookConversation();
  const bookRoute = new URL(routes.at(-1), 'https://miniapp.local');
  assert.equal(bookRoute.pathname, '/pages/agent/index');
  assert.equal(bookRoute.searchParams.get('bookId'), 'cbti-insomnia-perlis');
  assert.equal(bookRoute.searchParams.get('skillId'), null);

  const beforeBookRepeat = routes.length;
  page.startBookConversation();
  assert.equal(routes.length, beforeBookRepeat, '快速双击不能重复打开聊天');

  page.openSkill({ currentTarget: { dataset: { id: 'cbti-stimulus-control' } } });
  const route = new URL(routes.at(-1), 'https://miniapp.local');
  assert.equal(route.pathname, '/pages/agent/index');
  assert.equal(route.searchParams.get('bookId'), 'cbti-insomnia-perlis');
  assert.equal(route.searchParams.get('skillId'), 'cbti-stimulus-control');
  assert.match(route.searchParams.get('prompt'), /刺激控制/);
  const beforeSkillRepeat = routes.length;
  page.openSkill({ currentTarget: { dataset: { id: 'cbti-stimulus-control' } } });
  assert.equal(routes.length, beforeSkillRepeat, '技能按钮快速双击只能跳转一次');
});

test('book and skill context resolves real per-book knowledge', () => {
  for (const book of directory.listBooks()) {
    const route = getBookConversationUrl(book.id);
    assert.match(route, /^\/pages\/agent\/index\?/);
    const context = bookContext.resolve(book.id);
    assert.ok(context);
    assert.match(context.prompt, new RegExp(book.title));
    for (const skill of skillDirectory.listSkills(book.id)) {
      const skillUrl = new URL(getBookConversationUrl(book.id, skill.id), 'https://miniapp.local');
      assert.equal(skillUrl.searchParams.get('bookId'), book.id);
      assert.equal(skillUrl.searchParams.get('skillId'), skill.id);
      const resolved = bookContext.resolve(book.id, skill.id);
      assert.equal(resolved.skill.id, skill.id);
      assert.ok(resolved.prompt.includes(skill.concept));
      assert.ok(resolved.prompt.includes(skill.source));
    }
  }
  assert.equal(getBookConversationUrl('missing'), null);
  assert.equal(getBookConversationUrl('courage', 'missing-skill'), null);
});

test('homepage and complete list covers use the same detail route for every book', () => {
  const home = loadPage('home');
  for (const book of directory.listBooks()) {
    home.page.openBookDetail({ currentTarget: { dataset: { id: book.id } } });
    assert.equal(home.routes.at(-1), `/pages/book-detail/index?bookId=${book.id}`);
  }
  home.cleanup();

  const all = loadPage('skills');
  for (const book of directory.listBooks()) {
    all.page.openBookDetail({ currentTarget: { dataset: { id: book.id } } });
    assert.equal(all.routes.at(-1), `/pages/book-detail/index?bookId=${book.id}`);
  }
  all.cleanup();
});

test('book-detail route and cover tap isolation are wired in the page files', () => {
  const app = require('../app.json');
  assert.ok(app.pages.includes('pages/book-detail/index'));
  const homeWxml = fs.readFileSync(path.join(__dirname, '../pages/home/index.wxml'), 'utf8');
  const skillsWxml = fs.readFileSync(path.join(__dirname, '../pages/skills/index.wxml'), 'utf8');
  const detailWxml = fs.readFileSync(path.join(__dirname, '../pages/book-detail/index.wxml'), 'utf8');
  const detailJs = fs.readFileSync(path.join(__dirname, '../pages/book-detail/index.js'), 'utf8');
  assert.match(homeWxml, /catchtap="openBookDetail"/);
  assert.match(homeWxml, /\{\{item\.shortDescription\}\}/);
  assert.match(skillsWxml, /catchtap="openBookDetail"/);
  assert.match(detailWxml, /bindtap="startBookConversation"/);
  assert.match(detailWxml, /wx:for="\{\{book\.skills\}\}"/);
  assert.match(detailWxml, /开始对话/);
  assert.doesNotMatch(detailWxml, /书中技能正在整理|查看书中技能/);
  assert.doesNotMatch(detailJs, /pages\/skills\/index\?bookId/);
  assert.doesNotMatch(skillsWxml, /book-focus|focusedBook/);
});
