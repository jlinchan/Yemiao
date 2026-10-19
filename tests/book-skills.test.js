const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const directory = require('../data/skill-directory');

function harness(t, pageName = 'skills') {
  let page; const routes = [];
  global.wx = { getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 44 }), getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281 }), navigateTo: ({ url }) => routes.push(url), navigateBack: () => routes.push('back'), reLaunch: ({ url }) => routes.push(url) };
  global.getCurrentPages = () => [{}, {}];
  t.after(() => { delete global.wx; delete global.getCurrentPages; });
  const script = path.resolve(__dirname, `../pages/${pageName}/index.js`);
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), { wx: global.wx, require: (name) => require(path.resolve(path.dirname(script), name)), Page: (definition) => { page = definition; } });
  page.data = JSON.parse(JSON.stringify(page.data)); page.setData = (values) => Object.assign(page.data, values); page.onShow();
  return { page, routes };
}

test('directory contains six books and six categories', () => { assert.equal(directory.skills.length, 6); assert.equal(directory.categories.length, 6); assert.equal(new Set(directory.skills.map((item) => item.id)).size, 6); for (const item of directory.skills) { assert.equal(item.tags.length, 3); assert.equal(item.displayTags.length, 2); assert.equal(item.skills.length, 3); assert.ok(Array.from(item.shortDescription).length <= 14); assert.ok(fs.statSync(path.join(__dirname, '..', item.cover)).size > 0); } });
test('category and query filters return expected skills', () => { for (const category of directory.categories.slice(0, 5)) assert.ok(directory.filterSkills(category.id, '').length > 0); assert.equal(directory.filterSkills('relationship', '').length, 2); assert.equal(directory.filterSkills('all', '非暴力')[0].id, 'nvc'); assert.equal(directory.filterSkills('all', '不存在').length, 0); });
test('page model handles categories, reset and empty state', (t) => { const { page } = harness(t); page.selectCategory({ currentTarget: { dataset: { id: 'emotion' } } }); assert.equal(page.data.skills.length, 3); page.selectCategory({ currentTarget: { dataset: { id: 'sleep' } } }); assert.equal(page.data.skills.length, 1); assert.equal(page.data.skills[0].id, 'cbti-insomnia-perlis'); page.resetFilters(); assert.equal(page.data.category, 'all'); assert.equal(page.data.skills.length, 6); page.selectCategory({ currentTarget: { dataset: { id: 'relationship' } } }); assert.equal(page.data.skills[0].id, 'talk'); });
test('every skill button opens chat with the selected book prompt and id', (t) => { const { page, routes } = harness(t); for (const item of directory.skills) { page.startConversation({ currentTarget: { dataset: { id: item.id } } }); const route = new URL(routes.at(-1), 'https://miniapp.local'); assert.equal(route.pathname, '/pages/agent/index'); assert.equal(route.searchParams.get('bookId'), item.id); assert.equal(route.searchParams.get('prompt'), item.conversationPrompt || `我想练习《${item.title}》里的方法。`); } const before = routes.length; page.startConversation({ currentTarget: { dataset: { id: 'invalid' } } }); assert.equal(routes.length, before); });
test('homepage and all skills open the same conversation for each featured book', (t) => {
  const home = harness(t, 'home');
  const homeRoutes = [];
  for (const book of home.page.data.books) {
    const event = { currentTarget: { dataset: { id: book.id } } };
    home.page.openSkill(event);
    homeRoutes.push(home.routes.at(-1));
  }
  const before = home.routes.length;
  home.page.openSkill({ currentTarget: { dataset: { id: 'invalid' } } });
  assert.equal(home.routes.length, before);
  home.page.openSkills();
  assert.equal(home.routes.at(-1), '/pages/skills/index');

  const all = harness(t);
  for (const [index, book] of home.page.data.books.entries()) {
    all.page.startConversation({ currentTarget: { dataset: { id: book.id } } });
    assert.equal(all.routes.at(-1), homeRoutes[index]);
  }
});
test('wxml uses the simplified heading, compact covers and complete tags', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/skills/index.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(__dirname, '../pages/skills/index.wxss'), 'utf8');
  assert.ok(wxml.includes('<text class="skills-title">书中技能</text>'));
  assert.ok(!wxml.includes('skills-search'));
  assert.ok(!wxml.includes('search-field'));
  assert.ok(!wxml.includes('从经典心理学中'));
  assert.ok(!wxml.includes('练习脚本'));
  assert.ok(wxml.includes('item.cover'));
  assert.ok(wxml.includes('item.shortDescription'));
  assert.ok(wxml.includes('item.displayTags'));
  assert.match(wxss, /\.skill-card\s*\{[^}]*display:\s*flex/s);
  assert.match(wxss, /\.skill-cover\s*\{[^}]*flex:\s*0 0 29%[^}]*width:\s*29%[^}]*max-width:\s*29%/s);
  assert.match(wxss, /\.skill-cover\s*\{[^}]*height:\s*136rpx/s);
  assert.match(wxss, /\.skill-tags\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(wxml, /book-focus|focusedBook/);
  assert.ok(!wxml.includes('figma.com'));
});
