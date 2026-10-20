// 测试隔离：屏蔽本机真实 difyKnowledge 配置（vm 的 require 委托回主 realm，此处置 undefined 即全局生效）。
require('../services/runtime-config').difyKnowledge = undefined;
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
  assert.deepEqual([...page.data.quickSkills.map((item) => item.label)], ['深呼吸',
      '星夜慢行', '取回心事', '停止播放']);
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
    id: 'sess-1', title: '明天要考试', topic: 'exam', expert: '', book: '', entry: '',
    updatedAt: Date.now(),
    messages: [
      { id: 'intro', role: 'agent', text: '今晚有什么让你难以放松？', done: true },
      { id: 'u1', role: 'user', text: '明天要考试，有点慌', done: true },
      { id: 'a1', role: 'agent', text: '慌就先说出来。', done: true }
    ]
  };
  const { page } = harness({ 'sleepwell.agent.active.v1': saved });
  assert.equal(page.data.homeState, 'chat', '直接回到对话态');
  assert.equal(page.data.messages.length, 3, '恢复的是真实历史而不是新开场白');
  assert.equal(page.data.messages[2].text, '慌就先说出来。');
  assert.equal(page.data.activeTopic, 'exam');
  assert.equal(page.data.answers.length, 1, 'answers 预填历史用户轮数，消息 id 不与恢复的历史撞车');
  assert.equal(page.data.answers[0], '明天要考试，有点慌');
});

test('expired conversations fall back to a fresh greeting', () => {
  const saved = {
    id: 'sess-2', title: '有点睡不着', topic: '', expert: '', book: '', entry: '',
    updatedAt: Date.now() - 13 * 60 * 60 * 1000,
    messages: [
      { id: 'intro', role: 'agent', text: '今晚有什么让你难以放松？', done: true },
      { id: 'u1', role: 'user', text: '有点睡不着', done: true }
    ]
  };
  const { page } = harness({ 'sleepwell.agent.active.v1': saved });
  assert.equal(page.data.messages.length, 1, '超过 12 小时窗口，全新开场');
  assert.equal(page.data.messages[0].role, 'agent');
});

test('a prompt entry always starts a fresh session instead of resuming old context', () => {
  const saved = {
    id: 'sess-3', title: '昨晚的话题', topic: '', expert: '', book: '', entry: '',
    updatedAt: Date.now(),
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: '昨晚我们聊到哪了', done: true }
    ]
  };
  const { page } = harness({ 'sleepwell.agent.active.v1': saved });
  page.onLoad({ prompt: encodeURIComponent('宿舍太吵了睡不着') });
  assert.equal(page.data.messages.length, 1, '带话进来的入口开新会话，不恢复旧上下文');
  assert.equal(page.pendingEntryText, '宿舍太吵了睡不着', '入口消息待自动发送');
});

test('a greeting entry speaks as the nightcat opening instead of a fake user message', () => {
  const saved = {
    id: 'sess-5', title: '旧话题', topic: '', expert: '', book: '', entry: '',
    updatedAt: Date.now(),
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: '旧对话', done: true }
    ]
  };
  const greeting = '我们来拆一拆脑子里绕不过去的那件事，先从最让你紧绷的一句想法开始。';
  const { page } = harness({ 'sleepwell.agent.active.v1': saved });
  page.onLoad({ entry: 'counselor', greeting: encodeURIComponent(greeting) });
  assert.equal(page.data.messages.length, 1, '引导语入口开新会话');
  assert.equal(page.data.messages[0].role, 'agent', '引导语由夜喵说出');
  assert.equal(page.data.messages[0].text, greeting, '开场白就是板块引导语，而不是默认的「今晚有什么让你难以放松」');
  assert.equal(page.pendingEntryText, '', '没有任何伪装成用户发言的入口消息');
  assert.equal(page.data.canSend, false, '不自动发送');
  assert.equal(page.data.answers.length, 0, '引导语不计入用户轮数');
  assert.equal(page.entryType, 'counselor', '会话入口板块被记录');
});

test('an aborted turn with zero streamed text leaves no empty bubble behind', () => {
  const { page } = harness();
  page.onLoad({ greeting: encodeURIComponent('我在的，慢慢说就好。') });
  const introId = page.data.messages[0].id;
  // 模拟一轮已发出的对话：用户消息 + 空的 agent 占位（一字未流就被打断）。
  page.setData({
    messages: page.data.messages.concat([
      { id: 'u1', role: 'user', text: '劳动与社会保障专业咋样' },
      { id: 'agent-1', role: 'agent', text: '' }
    ]),
    answers: ['劳动与社会保障专业咋样']
  });
  const kept = page.dropEmptyAgentBubble('agent-1', '');
  assert.equal(kept.length, 2, '零字中断：空气泡整条移除，不留下带操作栏的空壳');
  assert.ok(kept.some((item) => item.id === introId));
  assert.ok(kept.some((item) => item.id === 'u1'));
  // 已流出部分文本：保留终稿而不是整条丢弃。
  const keptPartial = page.dropEmptyAgentBubble('agent-1', '这个专业挺实在的');
  assert.equal(keptPartial.length, 3, '有部分文本时保留气泡');
  const bubble = keptPartial.find((item) => item.id === 'agent-1');
  assert.equal(bubble.text, '这个专业挺实在的');
  assert.equal(bubble.done, true, '中断的气泡标记为已完成');
});

test('a sessionId entry resumes that archived conversation from the records page', () => {
  const now = Date.now();
  const archived = {
    id: 'sess-rec-1', title: '半夜睡不着', topic: '', expert: 'morita', book: '', entry: '',
    createdAt: now, updatedAt: now,
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: '半夜睡不着', done: true }
    ]
  };
  const { page } = harness({ [storage.KEYS.agentSessions]: [archived] });
  page.onLoad({ sessionId: 'sess-rec-1' });
  assert.equal(page.data.messages.length, 2, '归档会话被恢复渲染');
  assert.equal(page.data.messages[1].text, '半夜睡不着');
  assert.equal(page.data.answers.length, 1, 'answers 按历史用户轮数预填');
  assert.equal(page.data.activeExpert, 'morita', '当时的视角一并恢复');
  assert.equal(require('../services/agent-sessions').list().length, 0, '会话从档案移回当前位');
  // 未知 sessionId 静默落回新会话
  const fallback = harness();
  fallback.page.onLoad({ sessionId: 'nope' });
  assert.equal(fallback.page.data.messages.length, 1);
  assert.equal(fallback.page.data.messages[0].role, 'agent');
});

test('a counselor entry switches the dialog identity to that companion', () => {
  // 2026-10-19 打通陪伴者视角：带 counselor=<id> 进来，头部/说话人/输入框称谓跟随，
  // 专家视角被清空（互斥），会话快照携带 counselor 供档案与恢复使用。
  const saved = {
    id: 'sess-c1', title: '旧话题', topic: '', expert: 'adler', book: '', entry: '',
    updatedAt: Date.now(),
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: '旧对话', done: true }
    ]
  };
  const { page } = harness({ 'sleepwell.agent.active.v1': saved });
  const greeting = '今晚先不用急着入睡。我们慢慢呼吸，把心里还放不下的事说一说，好吗？';
  page.onLoad({ entry: 'counselor', counselor: 'sleep', greeting: encodeURIComponent(greeting) });
  assert.equal(page.data.speakerName, '睡眠陪伴师', '头部/说话人称谓切换为陪伴者');
  assert.equal(page.data.activeCounselor, 'sleep', '陪伴者视角已激活');
  assert.equal(page.data.activeExpert, '', '陪伴者与专家视角互斥，expert 被清空');
  assert.equal(page.data.messages[0].text, greeting, '开场白仍是该陪伴者的引导语');
  const active = require('../services/night-preferences').read();
  assert.equal(active.expert, '', '偏好里的专家视角被一并清掉');
  // 刚开场的会话只有 intro 消息，readActiveSession 按设计返回 null；直接读存储快照。
  const storage = require('../services/storage');
  const session = storage.read(storage.KEYS.agentActive, null);
  assert.ok(session && typeof session === 'object', '新会话已建立');
  assert.equal(session.counselor, 'sleep', '会话快照携带陪伴者视角');
  // 切回：clearCounselor 回到夜喵本体并重开干净会话。
  page.clearCounselor();
  assert.equal(page.data.speakerName, '夜喵', '切回夜喵本体');
  assert.equal(page.data.activeCounselor, '', '陪伴者视角清空');
  assert.equal(page.data.messages[0].role, 'agent', '切回后是新会话的开场');
});

test('different sections carry different greetings and drafts still speak as the user', () => {
  const counselorPage = harness();
  counselorPage.page.onLoad({ entry: 'counselor', greeting: encodeURIComponent('今晚先不用急着入睡。我们慢慢呼吸，把心里还放不下的事说一说，好吗？') });
  const bookPage = harness();
  bookPage.page.onLoad({ entry: 'book', greeting: encodeURIComponent('《被讨厌的勇气》里的方法，我们可以慢慢练。先说说最近哪件事让你最想用上它？') });
  assert.equal(counselorPage.page.data.messages[0].text, '今晚先不用急着入睡。我们慢慢呼吸，把心里还放不下的事说一说，好吗？', '咨询师板块用该咨询师的引导口吻');
  assert.equal(bookPage.page.data.messages[0].text, '《被讨厌的勇气》里的方法，我们可以慢慢练。先说说最近哪件事让你最想用上它？', '书板块用书卡练习引导');

  const draftPage = harness();
  draftPage.page.onReady = () => {};
  draftPage.page.onLoad({ draft: encodeURIComponent('我睡不着') });
  assert.equal(draftPage.page.pendingEntryText, '我睡不着', '输入框草稿仍是用户发言，待自动发送');
  assert.equal(draftPage.page.pendingGreeting, '', 'draft 不带引导语');
});

test('closing the chat persists the conversation for the next visit', () => {
  const { page, store } = harness();
  page.openChat();
  page.setData({ messages: page.data.messages.concat([
    { id: 'u1', role: 'user', text: '有点睡不着' },
    { id: 'a1', role: 'agent', text: '我在，慢慢说。', done: true }
  ]) });
  page.closeChat();
  // 结束即归档（2026-10-18）：聊完的对话立刻进「会话档案」，当前位换新，不再滞留。
  const archivedList = store['sleepwell.agent.sessions.v1'];
  assert.ok(Array.isArray(archivedList) && archivedList.length === 1, 'closeChat 归档进会话档案');
  assert.ok(archivedList[0].messages.some((item) => item.text === '有点睡不着'));
});

test('starting a new session archives the old one and clears the live context', () => {
  const saved = {
    id: 'sess-4', title: '', topic: '', expert: '', book: '', entry: '',
    updatedAt: Date.now(),
    messages: [
      { id: 'intro', role: 'agent', text: '开场', done: true },
      { id: 'u1', role: 'user', text: '嗨', done: true }
    ]
  };
  const { page, store } = harness({ 'sleepwell.agent.active.v1': saved });
  page.startNewSession();
  assert.equal(page.data.messages.length, 1, '新对话只有新开场白');
  const active = store['sleepwell.agent.active.v1'];
  assert.ok(active && active.messages.length === 0, '当前会话位已换新，不带旧消息');
  assert.equal(store['sleepwell.agent.sessions.v1'].length, 1, '旧会话归档进会话档案');
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
