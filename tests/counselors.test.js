const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const directory = require('../data/counselor-directory');
const home = require('../data/nightcat-content');
const selection = require('../services/counselor-selection');

function harness(t, options, stored) {
  let page;
  const routes = [];
  const storage = { [selection.STORAGE_KEY]: stored };
  global.wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 44 }),
    getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281 }),
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    navigateTo: ({ url }) => routes.push(url),
    navigateBack: () => routes.push('back'),
    reLaunch: ({ url }) => routes.push(url)
  };
  global.getCurrentPages = () => [{}, {}];
  t.after(() => { delete global.wx; delete global.getCurrentPages; });
  const script = path.resolve(__dirname, '../pages/counselors/index.js');
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    wx: global.wx,
    require: (name) => require(path.resolve(path.dirname(script), name)),
    Page: (definition) => { page = definition; }
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (values) => Object.assign(page.data, values);
  page.onLoad(options);
  return { page, routes, storage };
}

test('directory has six complete counselors and the required three-card homepage order', () => {
  assert.equal(directory.counselors.length, 6);
  assert.equal(home.counselors.length, 3);
  assert.equal(new Set(directory.counselors.map((item) => item.id)).size, 6);
  assert.deepEqual(home.counselors.map((item) => item.id), ['sleep', 'yalom', 'empathy']);
  assert.deepEqual(directory.counselors.map((item) => item.id), ['sleep', 'yalom', 'empathy', 'cognitive', 'relation', 'growth']);
  const yalom = directory.findCounselor('yalom');
  assert.equal(yalom.name, '欧文·亚隆');
  assert.equal(yalom.desc, '心理大师同行疗愈');
  assert.deepEqual(yalom.tags, ['跨时空对话', '深度共情']);
  assert.deepEqual(yalom.homeTags, ['跨时空对话']);
  assert.deepEqual(directory.findCounselor('sleep').homeTags, ['睡眠引导']);
  for (const item of directory.counselors) {
    assert.ok(item.prompt && item.description && item.desc && item.systemPrompt);
    assert.ok(item.tags.length >= 2);
    assert.ok(item.homeTags.length >= 1);
    assert.equal(selection.normalize(item.id), item.id);
    assert.ok(fs.statSync(path.join(__dirname, '..', item.avatar)).size > 0);
  }
  assert.equal(selection.normalize('unknown'), 'sleep');
});

test('all six categories work, including sleep and personal growth', () => {
  for (const category of directory.categories) {
    const result = directory.filterCounselors(category.id, '');
    assert.equal(result.length, category.id === 'all' ? 6 : category.id === 'self' ? 2 : 1);
    if (category.id !== 'all') assert.equal(result[0].category, category.id);
  }
  assert.equal(directory.filterCounselors('all', ' 睡眠陪伴师 ')[0].id, 'sleep');
  assert.equal(directory.filterCounselors('all', '人生方向')[0].id, 'growth');
  assert.equal(directory.filterCounselors('emotion', '人生方向').length, 0);
  assert.equal(directory.filterCounselors('all', '不存在的关键词').length, 0);
});

test('category selection and reset update the real page model', (t) => {
  const { page } = harness(t);
  page.selectCategory({ currentTarget: { dataset: { id: 'sleep' } } });
  assert.equal(page.data.counselors[0].id, 'sleep');
  page.resetFilters();
  assert.equal(page.data.counselors.length, 6);
  page.selectCategory({ currentTarget: { dataset: { id: 'self' } } });
  assert.deepEqual(page.data.counselors.map((item) => item.id), ['yalom', 'growth']);
  page.resetFilters();
  assert.equal(page.data.counselors.length, 6);
  page.selectCategory({ currentTarget: { dataset: { id: 'bad-category' } } });
  assert.equal(page.data.category, 'all');
});

test('every consult button saves its counselor and routes with counselor identity', (t) => {
  const { page, routes, storage } = harness(t, { id: 'sleep' });
  assert.equal(page.data.selectedId, 'sleep');
  for (const item of directory.counselors) {
    page.choose({ currentTarget: { dataset: { id: item.id } } });
    assert.equal(storage[selection.STORAGE_KEY], item.id);
    assert.equal(routes.at(-1), `/pages/agent/index?counselorId=${encodeURIComponent(item.id)}`);
  }
  const previous = routes.length;
  page.choose({ currentTarget: { dataset: { id: 'invalid' } } });
  assert.equal(routes.length, previous);
});

test('return navigation and stored/query selections remain compatible', (t) => {
  const { page, routes } = harness(t, { id: 'invalid' }, 'growth');
  assert.equal(page.data.selectedId, 'growth');
  page.goBack();
  assert.equal(routes.at(-1), 'back');
  global.getCurrentPages = () => [{}];
  page.goBack();
  assert.equal(routes.at(-1), '/pages/home/index');
});

test('all static Figma slots use non-empty local images', () => {
  for (const asset of Object.values(directory.assets)) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', asset));
    assert.ok(bytes.length > 0);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  }
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/counselors/index.wxml'), 'utf8');
  assert.ok(wxml.includes('<text class="directory-title">陪伴者</text>'));
  for (const name of ['garden', 'back', 'chevron']) assert.ok(wxml.includes(`assets.${name}`));
  assert.ok(!wxml.includes('directory-search'));
  assert.ok(!wxml.includes('search-field'));
  assert.ok(!wxml.includes('figma.com'));
  assert.ok(!wxml.includes('21:49'));
  assert.ok(!wxml.includes('人数为设计示意'));
  assert.ok(!wxml.includes('人正在对话'));
  const wxss = fs.readFileSync(path.join(__dirname, '../pages/counselors/index.wxss'), 'utf8');
  assert.match(wxss, /\.counselor-bottom\s*\{[^}]*display:\s*grid/);
  assert.match(wxss, /\.consult-button\s*\{[^}]*max-width:\s*112rpx/);
});

test('homepage retains a featured highlight without losing the full-directory selection', (t) => {
  const { storage, routes } = harness(t, {}, 'growth');
  const script = path.resolve(__dirname, '../pages/home/index.js');
  let page;
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    wx: global.wx,
    require: (name) => require(path.resolve(path.dirname(script), name)),
    Page: (definition) => { page = definition; }
  });
  page.setData = (values) => Object.assign(page.data, values);
  page.onLoad();
  page.onShow();
  assert.equal(page.data.selectedId, 'sleep');
  assert.equal(storage[selection.STORAGE_KEY], 'growth');
  page.openCounselors();
  assert.equal(routes.at(-1), '/pages/counselors/index?id=growth');
});
