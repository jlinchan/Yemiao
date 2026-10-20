const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = require('../services/storage');

// 引导页沙箱：假时钟 + 假定时器，逐拍推演段落节奏、暂停与结束行为。
function harness(query = {}) {
  let page;
  let nowMs = new Date('2026-10-12T22:00:00').getTime();
  const timers = [];
  const navigations = [];
  const store = {};
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  }
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: (key) => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value; return true; },
    navigateTo: ({ url }) => navigations.push({ type: 'navigateTo', url }),
    navigateBack: () => navigations.push({ type: 'navigateBack' }),
    reLaunch: ({ url }) => navigations.push({ type: 'reLaunch', url })
  };
  const script = path.resolve(__dirname, '../pages/guide/index.js');
  global.wx = wx; // 服务模块（storage/agent-port 等）从 Node global 读取 wx
  global.getCurrentPages = () => [{ route: 'pages/agent/index' }, { route: 'pages/guide/index' }];
  const context = {
    wx,
    Date: FakeDate,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    getCurrentPages: global.getCurrentPages,
    setTimeout: (fn, ms) => { timers.push({ fn, at: nowMs + (Number(ms) || 0), cleared: false }); return timers.length; },
    clearTimeout: (id) => { const timer = timers[id - 1]; if (timer) timer.cleared = true; }
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), context);
  page.setData = (values) => Object.assign(page.data, values);
  page.onLoad(query);
  return {
    page,
    store,
    navigations,
    advance(ms) {
      nowMs += ms;
      let fired = true;
      while (fired) {
        fired = false;
        const due = timers.filter((timer) => !timer.cleared && timer.at <= nowMs).sort((a, b) => a.at - b.at)[0];
        if (due) { due.cleared = true; due.fn(); fired = true; }
      }
    }
  };
}

// 与页面同一套节奏公式：9~13 秒，按句子长短微调。
function hold(text) {
  return Math.min(13000, Math.max(9000, 6500 + text.length * 140));
}

test('guide page loads the requested script with its first segment', () => {
  const { page } = harness({ script: 'body' });
  assert.equal(page.data.script, 'body');
  assert.equal(page.data.title, '身体扫描');
  assert.equal(page.data.total, 6);
  assert.deepEqual(page.data.dots, [0, 1, 2, 3, 4, 5]);
  assert.equal(page.data.text, '好，跟着我慢慢来。先让身体躺稳，手放在觉得舒服的地方。');
  assert.equal(page.data.index, 0);
  assert.equal(page.data.ended, false);
  assert.equal(page.data.controlsVisible, true, '点进来先亮一下控制条');
});

test('unknown or missing script falls back to the night walk', () => {
  const { page } = harness({ script: 'nope' });
  assert.equal(page.data.script, 'night');
  assert.equal(page.data.title, '星夜慢行');
  const { page: plain } = harness();
  assert.equal(plain.data.title, '星夜慢行');
});

test('segments advance through a fade and wrap up on the end screen', () => {
  const { page, store, navigations, advance } = harness({ script: 'night' });
  const first = page.data.text;
  advance(hold(first));
  assert.equal(page.data.fading, true, '到点先淡出');
  assert.equal(page.data.index, 0);
  advance(460);
  assert.equal(page.data.index, 1);
  assert.equal(page.data.fading, false);
  assert.notEqual(page.data.text, first);
  // 一路走完六段
  for (let i = 0; i < 10 && !page.data.ended; i += 1) advance(hold(page.data.text) + 460);
  assert.equal(page.data.ended, true);
  assert.equal(page.data.controlsVisible, false);
  // Agent 端口留痕：引导历史 + guide_done 事件（回执文案供对话页使用）
  const history = store[storage.KEYS.guideSessions];
  assert.equal(history.length, 1);
  assert.equal(history[0].script, 'night');
  assert.equal(history[0].title, '星夜慢行');
  assert.equal(history[0].completed, true);
  const event = store[storage.KEYS.agentEvents][0];
  assert.equal(event.module, 'guide');
  assert.equal(event.kind, 'guide_done');
  assert.equal(event.text, '走完入睡引导「星夜慢行」');
  assert.equal(event.chat, '「星夜慢行」走完了。晚安，睡个好觉。');
  // 结束页回对话：走返回通道，离开页面不重复记账
  page.backToChat();
  assert.deepEqual(navigations, [{ type: 'navigateBack' }]);
  page.onUnload();
  assert.equal(store[storage.KEYS.guideSessions].length, 1);
});

test('pause freezes the pace and resume keeps the remaining wait', () => {
  const { page, advance } = harness({ script: 'body' });
  const wait = hold(page.data.text);
  advance(2000);
  page.togglePause();
  assert.equal(page.data.paused, true);
  assert.equal(page.data.controlsVisible, true, '暂停时控制条一直留着');
  const textBefore = page.data.text;
  advance(60000);
  assert.equal(page.data.index, 0);
  assert.equal(page.data.text, textBefore);
  page.togglePause();
  assert.equal(page.data.paused, false);
  advance(wait - 2000 + 100);
  assert.equal(page.data.fading, true, '补足剩余等待后照常翻段');
  advance(460);
  assert.equal(page.data.index, 1);
});

test('pausing mid-fade settles the next segment before holding', () => {
  const { page, advance } = harness({ script: 'night' });
  advance(hold(page.data.text));
  assert.equal(page.data.fading, true);
  page.togglePause();
  assert.equal(page.data.paused, true);
  assert.equal(page.data.fading, false);
  assert.equal(page.data.index, 1);
  assert.equal(page.data.text, '远处的灯一盏一盏亮着，每一盏后面，都有一个已经睡着的人。');
});

test('controls fade out on their own but stay while paused', () => {
  const { page, advance } = harness({ script: 'night' });
  assert.equal(page.data.controlsVisible, true);
  advance(5000);
  assert.equal(page.data.controlsVisible, false);
  page.onStageTap();
  assert.equal(page.data.controlsVisible, true);
  page.onStageTap();
  assert.equal(page.data.controlsVisible, false);
  page.togglePause();
  assert.equal(page.data.controlsVisible, true);
  advance(60000);
  assert.equal(page.data.controlsVisible, true, '暂停期间不自动隐去');
});

test('leaving early reports an unfinished session and goes back', () => {
  const { page, store, navigations } = harness({ script: 'body' });
  page.endSession();
  const history = store[storage.KEYS.guideSessions];
  assert.equal(history.length, 1);
  assert.equal(history[0].script, 'body');
  assert.equal(history[0].completed, false);
  const event = store[storage.KEYS.agentEvents][0];
  assert.equal(event.kind, 'guide_ended');
  assert.equal(event.chat, '', '中途停下不在对话里打扰');
  assert.deepEqual(navigations, [{ type: 'navigateBack' }]);
  // 随后的 onUnload 不再重复记账
  page.onUnload();
  assert.equal(store[storage.KEYS.guideSessions].length, 1);
});

test('swiping back mid-session records an unfinished run on unload', () => {
  const { page, store } = harness({ script: 'night' });
  page.onUnload();
  const history = store[storage.KEYS.guideSessions];
  assert.equal(history.length, 1);
  assert.equal(history[0].completed, false);
  assert.equal(store[storage.KEYS.agentEvents][0].kind, 'guide_ended');
});

test('unload clears every pending timer', () => {
  const { page, advance } = harness({ script: 'night' });
  page.onUnload();
  advance(60000);
  assert.equal(page.data.index, 0);
  assert.equal(page.data.ended, false);
});
