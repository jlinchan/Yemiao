const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 空库语义（2026-10-18 会话档案接入后保留）：不预置任何数据时，
// 记录页必须如实显示空态，不得伪造示例会话。
function harness() {
  let page;
  const routes = [];
  const script = path.resolve(__dirname, '../pages/record/index.js');
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    Page: value => { page = value; },
    require: name => require(path.resolve(path.dirname(script), name)),
    wx: {
      reLaunch: ({ url }) => routes.push(url),
      getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
      getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
      getStorageSync: () => '',
      setStorageSync: () => true,
      showToast: () => {},
      showModal: () => {},
      navigateTo: () => {}
    }
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = values => Object.assign(page.data, values);
  page.onLoad(); page.onShow();
  return { page, routes };
}

test('conversation record page starts empty and all counts remain zero through filtering', () => {
  const { page } = harness();
  assert.deepEqual({ ...page.data.counts }, { all: 0, week: 0, archived: 0 });
  for (const [filter, title] of [['week', '本周还没有对话'], ['archived', '暂无归档会话'], ['all', '还没有会话记录，和夜喵聊过就会出现在这里']]) {
    page.chooseFilter({ currentTarget: { dataset: { filter } } });
    assert.equal(page.data.filter, filter);
    assert.equal(page.data.emptyTitle, title);
    assert.deepEqual({ ...page.data.counts }, { all: 0, week: 0, archived: 0 });
    assert.deepEqual([...page.data.sessions], [], '空库不得伪造示例会话');
  }
});

test('search and clearing keep the active filter without creating example conversations', () => {
  const { page } = harness();
  page.chooseFilter({ currentTarget: { dataset: { filter: 'archived' } } });
  page.toggleSearch();
  assert.equal(page.data.showSearch, true);
  page.onSearch({ detail: { value: '共情' } });
  assert.equal(page.data.emptyTitle, '没有找到相关会话');
  page.clearSearch();
  assert.equal(page.data.emptyTitle, '暂无归档会话');
  page.onSearch({ detail: { value: '  ' } });
  assert.equal(page.data.emptyTitle, '暂无归档会话');
  page.toggleSearch();
  assert.equal(page.data.showSearch, false);
  assert.equal(page.data.searchQuery, '');
});

test('record navigation uses the shared tabbar', () => {
  const { page } = harness();
  page.noop();
  const json = require('../pages/record/index.json');
  assert.equal(json.usingComponents['night-tabbar'], '/components/night-tabbar/index');
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/record/index.wxml'), 'utf8');
  assert.match(wxml, /<night-tabbar active="records"><\/night-tabbar>/);
});
