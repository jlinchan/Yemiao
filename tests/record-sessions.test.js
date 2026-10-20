const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = require('../services/storage');
const sessions = require('../services/agent-sessions');
const applySetData = require('./page-set-data');

// 记录页沙箱：会话档案接入后的列表 / 筛选 / 搜索 / 跳转 / 删除。
function harness(seedStore) {
  let page;
  const store = Object.assign({}, seedStore || {});
  const routes = [];
  const modals = [];
  const requests = [];
  let modalConfirm = true;
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: (key) => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value; return true; },
    navigateTo: ({ url }) => routes.push(url),
    reLaunch: () => {},
    showToast: () => {},
    request: (opts) => { requests.push(opts); },
    showModal: (opts) => {
      modals.push(opts);
      if (modalConfirm && typeof opts.success === 'function') opts.success({ confirm: true });
    }
  };
  const script = path.resolve(__dirname, '../pages/record/index.js');
  global.wx = wx;
  global.getApp = () => null;
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name))
  });
  page.setData = (values) => applySetData(page.data, values);
  return { page, store, routes, modals, requests, setModalConfirm: (value) => { modalConfirm = value; } };
}

function seedStore() {
  const now = Date.now();
  const make = (id, title, updatedAt) => ({
    id, title, topic: '', expert: '', book: '', entry: '',
    createdAt: updatedAt, updatedAt,
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: title, done: true }
    ]
  });
  const bag = {};
  bag[storage.KEYS.agentSessions] = [
    Object.assign(make('sess-a', '考试焦虑睡不着', now - 1 * 60 * 60 * 1000), { summary: '倾诉考试周的失眠与担心，练了担忧时段' }),
    make('sess-b', '和室友的边界', now - 10 * 24 * 60 * 60 * 1000)
  ];
  bag[storage.KEYS.agentActive] = make('sess-live', '今晚的对话', now - 5 * 60 * 1000);
  return bag;
}

test('record page lists the live session on top followed by archived ones', () => {
  const { page } = harness(seedStore());
  page.onShow();
  assert.equal(page.data.sessions.length, 3);
  assert.equal(page.data.sessions[0].id, 'sess-live');
  assert.equal(page.data.sessions[0].live, true, '进行中的对话置顶');
  assert.equal(page.data.sessions[1].id, 'sess-a', '归档按新 → 旧');
  assert.equal(page.data.sessions[1].title, '倾诉考试周的失眠与担心，练了担忧时段', 'AI 总结优先作为条目文本');
  assert.equal(page.data.sessions[2].title, '和室友的边界', '没有总结时回退到标题');
  assert.deepEqual({ ...page.data.counts }, { all: 3, week: 2, archived: 2 }, '全部/本周/已归档计数');
});

test('filters and search narrow the visible list', () => {
  const { page } = harness(seedStore());
  page.onShow();
  page.chooseFilter({ currentTarget: { dataset: { filter: 'archived' } } });
  assert.ok(page.data.sessions.every((item) => !item.live), '已归档不含进行中');
  assert.equal(page.data.sessions.length, 2);
  page.chooseFilter({ currentTarget: { dataset: { filter: 'week' } } });
  assert.deepEqual([...page.data.sessions.map((item) => item.id)], ['sess-live', 'sess-a'], '本周只剩近 7 天');
  page.setData({ searchQuery: '考试' });
  page.onSearch({ detail: { value: '考试' } });
  assert.deepEqual([...page.data.sessions.map((item) => item.id)], ['sess-a'], '搜索按标题匹配');
  page.clearSearch();
  page.chooseFilter({ currentTarget: { dataset: { filter: 'week' } } });
  assert.ok(page.data.sessions.length >= 1, '清空搜索后恢复筛选视图');
});

test('entries without a summary are backfilled by an AI wrap-up while browsing', () => {
  // seedStore：sess-a 已有总结，sess-b 没有；进行中的 sess-live 不补。
  const { page, requests, store } = harness(seedStore());
  page.onShow();
  assert.equal(requests.length, 1, '只为缺总结的归档条目发起补总结请求');
  assert.ok(requests[0].data.messages[1].content.indexOf('用户：和室友的边界') !== -1, '转写内容取自该会话消息');

  // 网关返回总结：条目文本与档案同步更新。
  requests[0].success({ data: { choices: [{ message: { content: '聊了和室友的边界感，练了课题分离' } }] } });
  const updated = page.data.sessions.find((item) => item.id === 'sess-b');
  assert.equal(updated.title, '聊了和室友的边界感，练了课题分离', '总结回来后条目文本刷新');
  assert.equal(sessions.list().find((item) => item.id === 'sess-b').summary, '聊了和室友的边界感，练了课题分离');

  // 已有总结的条目不再重复请求。
  const before = requests.length;
  page.onShow();
  assert.equal(requests.length, before, '有总结的条目不再补请求');
});

test('opening a session navigates with sessionId, live one without', () => {
  const { page, routes } = harness(seedStore());
  page.onShow();
  page.openSession({ currentTarget: { dataset: { id: 'sess-live' } } });
  assert.equal(routes.at(-1), '/pages/agent/index', '进行中的对话无参恢复当前');
  page.openSession({ currentTarget: { dataset: { id: 'sess-a' } } });
  assert.equal(routes.at(-1), `/pages/agent/index?sessionId=${encodeURIComponent('sess-a')}`, '归档会话带 sessionId');
});

test('removing a session asks for confirmation and refreshes the list', () => {
  const bag = seedStore();
  const { page, modals, setModalConfirm } = harness(bag);
  page.onShow();
  setModalConfirm(false);
  page.removeSession({ currentTarget: { dataset: { id: 'sess-a' } } });
  assert.equal(sessions.list().length, 2, '取消确认不删除');
  setModalConfirm(true);
  page.removeSession({ currentTarget: { dataset: { id: 'sess-a' } } });
  assert.equal(modals.length, 2, '删除前有确认弹窗');
  assert.equal(sessions.list().length, 1, '确认后从档案删除');
  assert.ok(page.data.sessions.every((item) => item.id !== 'sess-a'), '列表同步刷新');
});
