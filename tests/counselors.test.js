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

test('directory has six complete counselors with the requested homepage order', () => {
  assert.equal(directory.counselors.length, 6);
  assert.equal(home.counselors.length, 6);
  assert.equal(home.featuredCounselors.length, 3);
  assert.deepEqual(directory.counselors.map((item) => item.id), ['sleep', 'yalom', 'empathy', 'cognitive', 'relation', 'growth']);
  assert.deepEqual(home.featuredCounselors.map((item) => item.id), ['sleep', 'yalom', 'empathy']);
  assert.equal(new Set(directory.counselors.map((item) => item.id)).size, 6);
  const yalom = directory.findCounselor('yalom');
  assert.equal(yalom.name, '欧文·亚隆');
  assert.equal(yalom.desc, '心理大师同行疗愈');
  assert.deepEqual(yalom.tags, ['跨时空对话', '深度共情']);
  assert.deepEqual(yalom.homeTags, ['跨时空对话']);
  for (const item of directory.counselors) {
    assert.ok(item.prompt && item.description && item.desc);
    assert.ok(item.tags.length >= 1);
    assert.equal(selection.normalize(item.id), item.id);
    assert.ok(fs.statSync(path.join(__dirname, '..', item.avatar)).size > 0);
  }
  assert.deepEqual(directory.findCounselor('sleep').tags, ['睡前放松', '焦虑缓解', '睡眠引导']);
  assert.deepEqual(directory.findCounselor('sleep').homeTags, ['睡眠引导']);
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

test('every consult button saves its counselor and opens the correct local greeting', (t) => {
  const { page, routes, storage } = harness(t, { id: 'sleep' });
  assert.equal(page.data.selectedId, 'sleep');
  for (const item of directory.counselors) {
    page.choose({ currentTarget: { dataset: { id: item.id } } });
    assert.equal(storage[selection.STORAGE_KEY], item.id);
    // 2026-10-19 打通陪伴者视角：路由带上 counselor=<id>，对话页据此切换身份与 persona。
    assert.equal(routes.at(-1), `/pages/agent/index?entry=counselor&counselor=${item.id}&greeting=${encodeURIComponent(item.prompt)}`);
  }
  const previous = routes.length;
  page.choose({ currentTarget: { dataset: { id: 'invalid' } } });
  assert.equal(routes.length, previous);
});

test('every counselor has a distilled source card and buildCounselorPrompt formats the identity block', () => {
  // 2026-10-19 女娲蒸馏法：persona 不再内联，源卡 docs/counselors/*.md 经
  // tools/build-counselors.js 生成 data/counselor-cards.js（与专家卡管线同构）。
  const cards = require('../data/counselor-cards.js');
  assert.deepEqual(Object.keys(cards).sort(), ['cognitive', 'empathy', 'growth', 'relation', 'sleep', 'yalom'], '6 张生成卡齐全');
  for (const item of directory.counselors) {
    const card = cards[item.id];
    assert.ok(card, `${item.id} 缺少生成卡`);
    assert.ok(typeof card.prompt === 'string' && card.prompt.length >= 300, `${item.id} 注入版过短`);
    assert.ok(card.prompt.includes(item.name), '注入版点名陪伴者');
    assert.ok(card.prompt.includes('守则'), '注入版含守则');
    assert.ok(Array.isArray(card.sources) && card.sources.length >= 2, `${item.id} 来源清单不足（只认著作/论文）`);
    assert.ok(card.boundaries, `${item.id} 缺少诚实边界`);
    const section = directory.buildCounselorPrompt(item.id);
    assert.ok(section.includes(item.name), '身份段点名陪伴者');
    assert.ok(section.includes('输出协议'), '安全与输出协议机制保持不变');
    assert.ok(section.includes('不要自称夜喵'), '身份互斥声明在场');
    assert.ok(directory.counselorStarters(item.id).length > 0, `${item.id} 缺少开场问题`);
  }
  assert.equal(directory.buildCounselorPrompt('nope'), '', '未知 id 回落夜喵本体');
  assert.equal(directory.buildCounselorPrompt(''), '', '空 id 回落夜喵本体');
  assert.deepEqual(directory.counselorStarters('nope'), [], '未知 id 开场问题为空');
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
  assert.match(wxss, /\.counselor-tag\s*\{[^}]*flex:\s*none/);
  assert.match(wxss, /\.consult-button\s*\{[^}]*max-width:\s*112rpx/);
});

test('homepage and directory share the requested companion copy and tags', () => {
  const expected = {
    empathy: '心里委屈想倾诉',
    cognitive: '越想越焦虑',
    relation: '关系累，难开口',
    sleep: '想太多，睡不着',
    yalom: '心理大师同行疗愈',
    growth: '迷茫找不到方向'
  };
  // 2026-10-18 用户规范：desc 必须保持在 5–8 字（含标点），
  // 首页卡片宽度有限，超长会截断出省略号。
  for (const desc of Object.values(expected)) {
    assert.ok(desc.length >= 5 && desc.length <= 8, `desc 超出 5–8 字：${desc}`);
  }
  for (const [id, desc] of Object.entries(expected)) {
    assert.equal(directory.findCounselor(id).desc, desc);
    assert.equal(home.findCounselor(id).desc, desc);
  }
  const homeWxml = fs.readFileSync(path.join(__dirname, '../pages/home/index.wxml'), 'utf8');
  assert.ok(homeWxml.includes('<text class="sec-title">陪伴者</text>'));
  assert.ok(homeWxml.includes('<text class="sec-sub">今晚的你需要怎样的陪伴</text>'));
  const homeWxss = fs.readFileSync(path.join(__dirname, '../pages/home/index.wxss'), 'utf8');
  assert.match(homeWxss, /\.c-desc\s*\{[^}]*max-width:\s*calc\(100% - 38rpx\)[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/s);
  assert.match(homeWxss, /\.c-tags\s*\{[^}]*align-items:\s*center[^}]*\}/s);
  assert.match(homeWxss, /\.c-tag\s*\{[^}]*flex:\s*none[^}]*\}/s);
  assert.deepEqual(home.findCounselor('sleep').homeTags, ['睡眠引导']);
  assert.deepEqual(directory.findCounselor('sleep').tags, ['睡前放松', '焦虑缓解', '睡眠引导']);
  assert.match(homeWxml, /wx:for="\{\{item\.homeTags\}\}"/);
  assert.match(homeWxml, /心理治疗大师/);
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
  assert.equal(page.data.counselors[0].id, 'sleep');
  assert.equal(page.data.counselors.length, 3);
  assert.equal(page.data.selectedId, 'sleep');
  assert.equal(storage[selection.STORAGE_KEY], 'growth');
  page.openCounselors();
  assert.equal(routes.at(-1), '/pages/counselors/index?id=growth');
});
