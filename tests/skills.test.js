const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const directory = require('../data/skill-directory');

function harness(t) {
  let page; const routes = [];
  global.wx = { getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 44 }), getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281 }), navigateTo: ({ url }) => routes.push(url), navigateBack: () => routes.push('back'), reLaunch: ({ url }) => routes.push(url) };
  global.getCurrentPages = () => [{}, {}];
  t.after(() => { delete global.wx; delete global.getCurrentPages; });
  const script = path.resolve(__dirname, '../pages/skills/index.js');
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), { wx: global.wx, require: (name) => require(path.resolve(path.dirname(script), name)), Page: (definition) => { page = definition; } });
  page.data = JSON.parse(JSON.stringify(page.data)); page.setData = (values) => Object.assign(page.data, values); page.onShow();
  return { page, routes };
}

test('directory contains six books and six categories', () => { assert.equal(directory.skills.length, 6); assert.equal(directory.categories.length, 6); assert.equal(new Set(directory.skills.map((item) => item.id)).size, 6); for (const item of directory.skills) { assert.equal(item.tags.length, 3); assert.equal(item.skills.length, 3); assert.ok(Array.from(item.shortDescription).length <= 14); assert.ok(fs.statSync(path.join(__dirname, '..', item.cover)).size > 0); } });
test('category and query filters return expected skills', () => { for (const category of directory.categories.slice(0, 5)) assert.ok(directory.filterSkills(category.id, '').length > 0); assert.equal(directory.filterSkills('relationship', '').length, 2); assert.equal(directory.filterSkills('all', '非暴力')[0].id, 'nvc'); assert.equal(directory.filterSkills('all', '不存在').length, 0); });
test('page model handles categories and reset', (t) => { const { page } = harness(t); page.selectCategory({ currentTarget: { dataset: { id: 'emotion' } } }); assert.equal(page.data.skills.length, 3); page.resetFilters(); assert.equal(page.data.skills.length, 6); page.selectCategory({ currentTarget: { dataset: { id: '不存在' } } }); assert.equal(page.data.skills.length, 6); });
test('every skill button opens the agent conversation page with book identity', (t) => { const { page, routes } = harness(t); for (const item of directory.skills) { page.startConversation({ currentTarget: { dataset: { id: item.id } } }); const route = new URL(routes.at(-1), 'https://miniapp.local'); assert.equal(route.pathname, '/pages/agent/index'); assert.equal(route.searchParams.get('entry'), 'book'); assert.equal(route.searchParams.get('bookId'), item.id); assert.equal(route.searchParams.get('greeting'), `《${item.title}》里的方法，我们可以慢慢练。先说说最近哪件事让你最想用上它？`); } const before = routes.length; page.startConversation({ currentTarget: { dataset: { id: 'invalid' } } }); assert.equal(routes.length, before); });
test('wxml uses local covers and the conversation entry', () => { const wxml = fs.readFileSync(path.join(__dirname, '../pages/skills/index.wxml'), 'utf8'); assert.ok(wxml.includes('item.cover')); assert.ok(wxml.includes('catchtap="startConversation"')); assert.ok(!wxml.includes('figma.com')); assert.doesNotMatch(wxml, /toggleSearch|onSearchInput/); });
