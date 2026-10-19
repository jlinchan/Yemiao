const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = require('../services/storage');
const applySetData = require('./page-set-data');

// 对话页「+」面板沙箱：与 agent-ui 测试同构，仅需本地存储与页面方法。
// seedStore：预置本地存储（测试对话现场恢复）；返回值带 pagesStack/backs 供导航断言。
function harness(seedStore) {
  let page;
  const store = Object.assign({}, seedStore || {});
  const toasts = [];
  const backs = [];
  const pagesStack = [{ route: 'pages/home/index' }];
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: (key) => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value; return true; },
    showShareMenu() {}, hideKeyboard() {},
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    navigateTo() {}, reLaunch() {},
    navigateBack: () => { backs.push(true); },
    showToast: (opts) => { toasts.push((opts && opts.title) || ''); }
  };
  const script = path.resolve(__dirname, '../pages/agent/index.js');
  global.wx = wx;
  global.getApp = () => null; // storage.saveSettings 会调用 getApp，测试环境无 App 实例
  const app = { globalData: {} };
  const context = {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    setTimeout: () => 1,
    clearTimeout: () => {},
    getApp: () => app,
    getCurrentPages: () => pagesStack
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), context);
  page.setData = (values) => applySetData(page.data, values);
  page.onLoad();
  page.onShow();
  return { page, store, toasts, app, pagesStack, backs };
}

test('panel state exposes experts, quick skills and sounds', () => {
  const { page } = harness();
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.drawerOpen, false);
  assert.ok(page.data.expertCards.length >= 1);
  assert.ok(page.data.expertCards.some((item) => item.name === 'yalom'));
  assert.deepEqual([...page.data.quickSkills.map((item) => item.label)], ['星夜慢行', '身体扫描', '取回心事', '停止播放']);
  assert.deepEqual([...page.data.quickSounds.map((item) => item.label)], ['雨声', '微风', '湖水', '白噪音']);
  assert.equal(page.data.activeExpert, '');
});

test('panel mirrors the global audio state so sound chips can show a live dot', () => {
  const { page, app } = harness();
  assert.equal(page.data.playingSound, '');
  app.globalData.audioState = { sound: 'rain', playing: true };
  page.syncSoundState();
  assert.equal(page.data.playingSound, 'rain');
  assert.equal(page.data.playingSoundLabel, '雨声');
  app.globalData.audioState = { sound: 'rain', playing: false };
  page.syncSoundState();
  assert.equal(page.data.playingSound, '');
  assert.equal(page.data.playingSoundLabel, '');
  app.globalData.audioState = { sound: 'white', playing: true };
  page.syncSoundState();
  assert.equal(page.data.playingSoundLabel, '白噪音');
});

test('expert source archive toggles per card and stays independent of selection', () => {
  const { page } = harness();
  const yalom = page.data.expertCards.find((item) => item.name === 'yalom');
  assert.ok(yalom.sources.length > 0, 'yalom card should carry its source archive');
  page.toggleSources({ currentTarget: { dataset: { name: 'yalom' } } });
  assert.equal(page.data.sourceForName, 'yalom');
  assert.equal(page.data.activeExpert, '');
  page.toggleSources({ currentTarget: { dataset: { name: 'yalom' } } });
  assert.equal(page.data.sourceForName, '');
});

test('toggling the panel flips state, closes the drawer and blurs the input', () => {
  const { page } = harness();
  page.setData({ inputFocus: true, drawerOpen: true });
  page.togglePanel();
  assert.equal(page.data.panelOpen, true);
  assert.equal(page.data.drawerOpen, false);
  assert.equal(page.data.inputFocus, false);
  page.togglePanel();
  assert.equal(page.data.panelOpen, false);
});

test('drawer opens exclusively with the panel and closes on toggle', () => {
  const { page } = harness();
  page.setData({ panelOpen: true });
  page.toggleDrawer();
  assert.equal(page.data.drawerOpen, true);
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.inputFocus, false);
  page.toggleDrawer();
  assert.equal(page.data.drawerOpen, false);
});

test('focusing the input closes both panel and drawer', () => {
  const { page } = harness();
  page.setData({ panelOpen: true, drawerOpen: true });
  page.onInputFocus();
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.drawerOpen, false);
  assert.equal(page.data.inputFocus, true);
});

test('starting a new session resets the stream but keeps the expert', () => {
  const { page, store } = harness();
  page.openChat();
  page.applyExpert('yalom');
  page.setData({ messages: page.data.messages.concat([{ id: 'u1', role: 'user', text: '有点睡不着' }, { id: 'a1', role: 'agent', text: '我在呢' }]), drawerOpen: true });
  page.startNewSession();
  assert.equal(page.data.messages.length, 1);
  assert.equal(page.data.messages[0].role, 'agent');
  assert.equal(page.data.drawerOpen, false);
  assert.equal(page.data.activeExpert, 'yalom');
  assert.equal(page.lastTurn, null);
  assert.equal(store['sleepwell.night.preferences.v1'].expert, 'yalom');
});

test('choosing an expert persists the preference, offers starters, closes the drawer and announces', () => {
  const { page, store } = harness();
  page.openChat();
  page.setData({ drawerOpen: true });
  page.chooseExpert({ currentTarget: { dataset: { name: 'yalom' } } });
  assert.equal(page.data.activeExpert, 'yalom');
  assert.equal(page.data.activeExpertLabel, '亚隆');
  assert.ok(page.data.activeExpertEmblem.includes('data:image/svg'));
  assert.equal(page.data.starters.length, 3);
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.drawerOpen, false);
  const bubble = page.data.messages[page.data.messages.length - 1];
  assert.equal(bubble.role, 'skill');
  assert.ok(bubble.text.includes('亚隆'));
  assert.equal(store['sleepwell.night.preferences.v1'].expert, 'yalom');
});

test('clearing the expert falls back to the nightcat persona', () => {
  const { page } = harness();
  page.openChat();
  page.chooseExpert({ currentTarget: { dataset: { name: 'yalom' } } });
  page.clearExpert();
  assert.equal(page.data.activeExpert, '');
  assert.equal(page.data.activeExpertEmblem, '');
  const bubble = page.data.messages[page.data.messages.length - 1];
  assert.ok(bubble.text.includes('夜喵本体'));
});

test('quick skill runs on tap, collapses the panel and reports in a bubble', () => {
  const { page } = harness();
  page.openChat();
  page.setData({ panelOpen: true });
  page.quickSkill({ currentTarget: { dataset: { key: 'recall' } } });
  assert.equal(page.data.panelOpen, false);
  const bubble = page.data.messages[page.data.messages.length - 1];
  assert.equal(bubble.role, 'skill');
  assert.ok(bubble.text.includes('寄存'));
});

test('disabled skills are filtered out of the panel', () => {
  const { page } = harness();
  const settings = storage.getSettings();
  settings.skillPermissions = Object.assign({}, settings.skillPermissions, { stop_sound: 'off', play_sound: 'off' });
  storage.saveSettings(settings);
  page.onShow();
  assert.equal(page.data.quickSkills.some((item) => item.skill === 'stop_sound'), false);
  assert.equal(page.data.quickSounds.length, 0);
});

test('tapping a starter fills the draft for editing', () => {
  const { page } = harness();
  page.openChat();
  page.applyExpert('yalom');
  page.setData({ panelOpen: true, drawerOpen: true });
  page.useStarter({ currentTarget: { dataset: { text: '想到人总会死，有点喘不过气' } } });
  assert.equal(page.data.draft, '想到人总会死，有点喘不过气');
  assert.equal(page.data.canSend, true);
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.drawerOpen, false);
});

test('panel state exposes book cards alongside experts', () => {
  const { page } = harness();
  assert.ok(page.data.bookCards.length >= 2, 'counselling-for-toads 与 perlis-cbti 应上架');
  assert.ok(page.data.bookCards.some((item) => item.name === 'perlis-cbti'));
  assert.ok(page.data.bookCards.every((item) => item.emblem && item.emblem.includes('data:image/svg')));
  assert.equal(page.data.activeBook, '');
  assert.equal(page.data.activeBookLabel, '');
  assert.equal(page.data.activeBookEmblem, '');
  assert.equal(page.data.bookStarters.length, 0);
});

test('choosing a book persists the preference, offers starters, closes the drawer and announces', () => {
  const { page, store } = harness();
  page.openChat();
  page.setData({ drawerOpen: true });
  page.chooseBook({ currentTarget: { dataset: { name: 'perlis-cbti' } } });
  assert.equal(page.data.activeBook, 'perlis-cbti');
  assert.equal(page.data.activeBookLabel, 'CBT-I 逐次访谈');
  assert.ok(page.data.activeBookEmblem.includes('data:image/svg'));
  assert.equal(page.data.bookStarters.length, 3);
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.drawerOpen, false);
  const bubble = page.data.messages[page.data.messages.length - 1];
  assert.equal(bubble.role, 'skill');
  assert.ok(bubble.text.includes('CBT-I 逐次访谈'));
  assert.equal(store['sleepwell.night.preferences.v1'].book, 'perlis-cbti');
});

test('clearing the book falls back to plain nightcat and keeps the expert selection', () => {
  const { page } = harness();
  page.openChat();
  page.chooseBook({ currentTarget: { dataset: { name: 'counselling-for-toads' } } });
  page.applyExpert('adler');
  page.clearBook();
  assert.equal(page.data.activeBook, '');
  assert.equal(page.data.activeBookEmblem, '');
  assert.equal(page.data.bookStarters.length, 0);
  assert.equal(page.data.activeExpert, 'adler', '专家与书卡是两个独立维度');
  const bubble = page.data.messages[page.data.messages.length - 1];
  assert.ok(bubble.text.includes('先不带书'));
});

test('tapping a book starter fills the draft for editing', () => {
  const { page } = harness();
  page.openChat();
  page.chooseBook({ currentTarget: { dataset: { name: 'counselling-for-toads' } } });
  page.setData({ panelOpen: true, drawerOpen: true });
  page.useBookStarter({ currentTarget: { dataset: { text: '我总在讨好别人，怕别人不高兴' } } });
  assert.equal(page.data.draft, '我总在讨好别人，怕别人不高兴');
  assert.equal(page.data.canSend, true);
  assert.equal(page.data.panelOpen, false);
  assert.equal(page.data.drawerOpen, false);
});

test('starting a new session resets the stream but keeps the book', () => {
  const { page, store } = harness();
  page.openChat();
  page.applyBook('perlis-cbti');
  page.setData({ messages: page.data.messages.concat([{ id: 'u1', role: 'user', text: '睡不着' }, { id: 'a1', role: 'agent', text: '我在呢' }]), drawerOpen: true });
  page.startNewSession();
  assert.equal(page.data.messages.length, 1);
  assert.equal(page.data.activeBook, 'perlis-cbti');
  assert.equal(store['sleepwell.night.preferences.v1'].book, 'perlis-cbti');
});

test('restores the persisted conversation on load instead of a fresh greeting', () => {
  const saved = {
    at: Date.now(),
    topic: 'exam',
    messages: [
      { id: 'intro', role: 'agent', text: '今晚有什么让你难以放松？', done: true },
      { id: 'u1', role: 'user', text: '明天要考试，有点慌', done: true },
      { id: 'a1', role: 'agent', text: '慌就先说出来。', done: true }
    ]
  };
  const { page } = harness({ 'sleepwell.agent.chat.v1': saved });
  assert.equal(page.data.homeState, 'chat', '直接回到对话态');
  assert.equal(page.data.messages.length, 3, '恢复的是真实历史而不是新开场白');
  assert.equal(page.data.messages[2].text, '慌就先说出来。');
  assert.equal(page.data.activeTopic, 'exam');
  assert.equal(page.data.answers.length, 1, 'answers 预填历史用户轮数，消息 id 不与恢复的历史撞车');
  assert.equal(page.data.answers[0], '明天要考试，有点慌');
});

test('expired conversations fall back to a fresh greeting', () => {
  const saved = {
    at: Date.now() - 13 * 60 * 60 * 1000,
    topic: '',
    messages: [
      { id: 'intro', role: 'agent', text: '今晚有什么让你难以放松？', done: true },
      { id: 'u1', role: 'user', text: '有点睡不着', done: true }
    ]
  };
  const { page } = harness({ 'sleepwell.agent.chat.v1': saved });
  assert.equal(page.data.messages.length, 1, '超过 12 小时窗口，全新开场');
  assert.equal(page.data.messages[0].role, 'agent');
});

test('closing the chat persists the conversation for the next visit', () => {
  const { page, store } = harness();
  page.openChat();
  page.setData({ messages: page.data.messages.concat([
    { id: 'u1', role: 'user', text: '有点睡不着' },
    { id: 'a1', role: 'agent', text: '我在，慢慢说。', done: true }
  ]) });
  page.closeChat();
  const saved = store['sleepwell.agent.chat.v1'];
  assert.ok(saved && Array.isArray(saved.messages), 'closeChat 落档');
  assert.ok(saved.messages.some((item) => item.text === '有点睡不着'));
});

test('starting a new session clears the persisted conversation', () => {
  const saved = {
    at: Date.now(),
    topic: '',
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: '嗨', done: true }
    ]
  };
  const { page, store } = harness({ 'sleepwell.agent.chat.v1': saved });
  page.startNewSession();
  assert.equal(page.data.messages.length, 1);
  assert.ok(!store['sleepwell.agent.chat.v1'], '新对话不再带着旧现场');
});

test('goHome navigates back when a source page exists, reLaunches home otherwise', () => {
  const { page, pagesStack, backs } = harness();
  pagesStack.push({ route: 'pages/agent/index' });
  page.goHome();
  assert.equal(backs.length, 1, '首页 navigateTo 进来时 navigateBack 原地返回');

  const again = harness();
  again.pagesStack.length = 0;
  again.pagesStack.push({ route: 'pages/agent/index' });
  again.page.goHome();
  assert.equal(again.backs.length, 0, '分享直达（栈空）不走 navigateBack');
});
