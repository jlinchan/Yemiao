require('./agent-test-config');
// 测试隔离：屏蔽本机真实 difyKnowledge 配置（vm 的 require 委托回主 realm，此处置 undefined 即全局生效）。
require('../services/runtime-config').difyKnowledge = undefined;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = require('../services/storage');
const agentMessages = require('../services/agent-messages');
const agentPort = require('../services/agent-port');
const applySetData = require('./page-set-data');

// 页面级测试沙箱：可配置 wx.request 行为（流式任务 / 直接抛错）。
// 两阶段流水线（2026-10-19 全档启用）：Stage A（意图分析器，780k 流式短请求）由沙箱
// 自动应答默认计划，测试只需驱动 Stage B 的正文请求；需自定义计划的测试自行喂 chunk。
function harness({ request, clipboardFail } = {}) {
  let page;
  let timer;
  const store = {};
  // 流式测试基线：默认档 Reframe 走非流式通道（token 平台流式被限速），
  // 需要流式渲染管线的测试预置 Reflex（大赛网关流式）。storage key 与 night-preferences 一致。
  store['sleepwell.night.preferences.v1'] = { chatMode: 'Reflex' };
  let clipboard = [];
  const toasts = [];
  const modals = [];
  const navigations = [];
  const setDataKeys = [];
  const app = { globalData: {} };
  const rawRequest = request || ((options) => { options.success({ statusCode: 200, data: { choices: [{ message: { content: '测试模型回复' } }] } }); return { abort() {} }; });
  const planSse = () => Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: '{"need":"倾诉","use":"","rec":false}' } }] }) + '\n\n', 'utf8');
  const planJson = () => ({ statusCode: 200, data: { choices: [{ message: { content: '{"need":"倾诉","use":"","rec":false}' } }] } });
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: (key) => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value; return true; },
    showShareMenu() {}, hideKeyboard() {},
    showToast: ({ title }) => toasts.push(title),
    showModal: ({ title, content }) => modals.push({ title, content }),
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    // 可注入 clipboardFail 模拟写剪贴板失败（真机/工具失焦时 setClipboardData 会走 fail）。
    setClipboardData: ({ data, success, fail }) => {
      clipboard.push(data);
      if (clipboardFail) { if (fail) fail({ errMsg: 'setClipboardData:fail' }); return; }
      if (success) success();
    },
    navigateTo: ({ url }) => navigations.push({ type: 'navigateTo', url }),
    reLaunch: ({ url }) => navigations.push({ type: 'reLaunch', url }),
    request: (options) => {
      // Stage A 已改走 token 网关非流式（0731，stream:false）——注册即同步应答默认计划。
      const isStageA = options.data && options.data.messages && options.data.messages[0]
        && String(options.data.messages[0].content).indexOf('意图分析器') !== -1;
      if (isStageA) {
        if (options.success) options.success(planJson());
        return { abort() {} };
      }
      return rawRequest(options);
    }
  };
  const script = path.resolve(__dirname, '../pages/agent/index.js');
  global.wx = wx; // 服务模块（agent-client/storage）从 Node global 读取 wx
  const context = {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    setTimeout: (fn) => { timer = fn; return 1; },
    clearTimeout: () => { timer = null; },
    getApp: () => app
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), context);
  page.setData = (values) => { setDataKeys.push(...Object.keys(values)); applySetData(page.data, values); };
  page.onLoad();
  return { page, store, clipboard, toasts, modals, wx, app, navigations, setDataKeys, finish: () => { const fn = timer; timer = null; if (fn) fn(); } };
}

function startChat(page, text) {
  page.openChat();
  page.onDraftChange({ detail: { value: text } });
  page.sendMessage();
}

// 危机改走模型路径后（2026-10-16 架构调整），用可回放模型回复的 request mock 驱动流式管线。
// modelReply 按请求形态自适应：流式（stream:true）推 chunk；非流式（Reframe/Reflect，
// stream:false）直接 success 交全文，再等待端内伪流式回放完成。
function harnessWithModelReply() {
  let opts = null;
  let chunkHandler = null;
  let page = null;
  const h = harness({
    request: (options) => {
      opts = options;
      return { onChunkReceived: (cb) => { chunkHandler = cb; }, abort() {} };
    }
  });
  page = h.page;
  h.waitForReply = () => new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const msg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro' && item.done);
      if (msg || Date.now() - started > 4000) resolve();
      else setTimeout(check, 50);
    };
    setTimeout(check, 60);
  });
  h.modelReply = (content) => {
    if (opts && opts.data && opts.data.stream === false) {
      opts.success({ statusCode: 200, data: { choices: [{ message: { content } }] } });
      return h.waitForReply();
    }
    chunkHandler({ data: Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`, 'utf8') });
    if (opts && opts.success) opts.success();
    return Promise.resolve();
  };
  return h;
}

test('like and dislike toggle exclusively and aggregate counts persist', () => {
  const { page, store } = harness();
  startChat(page, '最近睡不着');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro' && item.done);
  assert.ok(agentMsg, 'agent reply should be marked done');
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'like' } } });
  assert.equal(page.data.messages.find((item) => item.id === agentMsg.id).feedback, 'like');
  // 明细评价同步落一条：带回复节选，进 memory.md
  let reviews = store[storage.KEYS.agentReviews] || [];
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].value, 'like');
  assert.equal(reviews[0].quote, agentMsg.text.slice(0, 24));
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'dislike' } } });
  assert.equal(page.data.messages.find((item) => item.id === agentMsg.id).feedback, 'dislike');
  reviews = store[storage.KEYS.agentReviews] || [];
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].value, 'dislike');
  // 再次点击取消：明细随投票整条撤回
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'dislike' } } });
  assert.equal(page.data.messages.find((item) => item.id === agentMsg.id).feedback, '');
  assert.equal((store[storage.KEYS.agentReviews] || []).length, 0);
  const counts = store[storage.KEYS.agentFeedback];
  assert.equal(counts.like, 1);
  assert.equal(counts.dislike, 1);
});

test('three-dot menu opens the review sheet and writes the reason into memory', () => {
  const { page, store } = harness();
  startChat(page, '总是三点才睡');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro' && item.done);
  // 菜单开合：点同一枚消息的 ··· 切换
  page.openMessageMenu({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.equal(page.data.menuForId, agentMsg.id);
  page.openMessageMenu({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.equal(page.data.menuForId, '');
  // 先投票再写理由：弹层带当前态度与回复节选，空理由不可提交
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'like' } } });
  page.openMessageMenu({ currentTarget: { dataset: { id: agentMsg.id } } });
  page.openReview({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.equal(page.data.menuForId, '', 'opening the sheet should close the menu');
  assert.equal(page.data.reviewForId, agentMsg.id);
  assert.equal(page.data.reviewVote, 'like');
  assert.equal(page.data.reviewDraft, '');
  assert.equal(page.data.canSubmitReview, false);
  page.onReviewInput({ detail: { value: '这句话让我安心' } });
  assert.equal(page.data.canSubmitReview, true);
  page.submitReview();
  assert.equal(page.data.reviewForId, '');
  let entry = (store[storage.KEYS.agentReviews] || [])[0];
  assert.equal(entry.value, 'like');
  assert.equal(entry.reason, '这句话让我安心');
  assert.equal(entry.quote, agentMsg.text.slice(0, 24));
  // 改口成踩：已写下的理由保留
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'dislike' } } });
  entry = (store[storage.KEYS.agentReviews] || [])[0];
  assert.equal(entry.value, 'dislike');
  assert.equal(entry.reason, '这句话让我安心');
  // 重新打开：理由回填；清空提交 = 删掉这句话（态度保留）
  page.openReview({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.equal(page.data.reviewDraft, '这句话让我安心');
  assert.equal(page.data.canSubmitReview, true);
  page.onReviewInput({ detail: { value: '' } });
  assert.equal(page.data.canSubmitReview, true, 'clearing an existing reason is still submittable');
  page.submitReview();
  entry = (store[storage.KEYS.agentReviews] || [])[0];
  assert.equal(entry.value, 'dislike');
  assert.equal(entry.reason, '');
});

test('a bare note without a vote still lands in the review list', () => {
  const { page, store } = harness();
  startChat(page, '今晚好累');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro' && item.done);
  page.openReview({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.equal(page.data.reviewVote, '');
  assert.equal(page.data.reviewForId, agentMsg.id);
  page.onReviewInput({ detail: { value: '其实我想听你说更多' } });
  page.submitReview();
  const entry = (store[storage.KEYS.agentReviews] || [])[0];
  assert.equal(entry.value, '');
  assert.equal(entry.reason, '其实我想听你说更多');
  // 重新生成会作废旧回复上的评价
  page.regenerate();
  assert.equal((store[storage.KEYS.agentReviews] || []).length, 0);
});

test('copy sends the message text to the clipboard', () => {
  const { page, clipboard } = harness();
  startChat(page, '你好');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro' && item.done);
  page.copyMessage({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.deepEqual(clipboard, [agentMsg.text]);
});

test('regenerate reruns the last turn without duplicating the user message', () => {
  const { page } = harness();
  startChat(page, '考试让我焦虑');
  const before = page.data.messages.length;
  page.regenerate();
  assert.equal(page.data.messages.length, before);
  assert.equal(page.data.messages.filter((item) => item.role === 'user').length, 1);
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.ok(agentMsg.text.length > 0);
  assert.equal(agentMsg.done, true);
});

test('stop generation keeps streamed text and settles to idle', () => {
  let chunkHandler = null;
  const { page } = harness({
    request: () => ({ onChunkReceived: (cb) => { chunkHandler = cb; }, abort() {} })
  });
  startChat(page, '陪我聊一会');
  assert.equal(page.data.chatState, 'sending');
  chunkHandler({ data: Buffer.from('data: {"choices":[{"delta":{"content":"我在，慢慢说。"}}]}\n\n', 'utf8') });
  page.stopGeneration();
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.equal(agentMsg.text, '我在，慢慢说。');
  assert.equal(agentMsg.done, true);
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.awaitingFirst, false);
});

test('streaming flushes only the text data path, and intro bubbles settle without a caret', () => {
  let chunkHandler = null;
  const { page, setDataKeys, finish } = harness({
    request: () => ({ onChunkReceived: (cb) => { chunkHandler = cb; }, abort() {} })
  });
  startChat(page, '今晚有点睡不着');
  assert.equal(page.data.messages.find((item) => item.id === 'intro').done, true);
  setDataKeys.length = 0;
  chunkHandler({ data: Buffer.from('data: {"choices":[{"delta":{"content":"我在。"}}]}\n\n', 'utf8') });
  finish();
  const agentIndex = page.data.messages.length - 1;
  assert.equal(page.data.messages[agentIndex].text, '我在。');
  assert.ok(setDataKeys.includes(`messages[${agentIndex}].text`), 'stream flush should use the text data path');
  assert.ok(!setDataKeys.includes('messages'), 'stream flush must not resend the whole messages array');
});

test('sending pulses the ripple class without any haptic, and retry never replays it', () => {
  const { page, wx } = harness();
  let vibrated = 0;
  wx.vibrateShort = () => { vibrated += 1; };
  startChat(page, '今晚想早点睡');
  const firstEcho = page.data.sendEcho;
  assert.ok(firstEcho === 'a' || firstEcho === 'b');
  page.onDraftChange({ detail: { value: '在的' } });
  page.sendMessage();
  assert.notEqual(page.data.sendEcho, firstEcho);
  // 重试沿用同一轮，不重放涟漪
  page.regenerate();
  assert.equal(page.data.sendEcho, '');
  assert.equal(vibrated, 0);
});

test('message action icons are exposed to the view layer', () => {
  const { page } = harness();
  assert.ok(page.data.icons.like.indexOf('data:image/svg+xml') === 0);
  assert.ok(page.data.icons.stop.indexOf('data:image/svg+xml') === 0);
  assert.notEqual(page.data.icons.like, page.data.icons.likeActive);
});

test('full skill flow: streamed marker becomes a confirm card, then a subscribe card that degrades gracefully', () => {
  let opts = null;
  let chunkHandler = null;
  const { page, store } = harness({
    request: (options) => {
      opts = options;
      return { onChunkReceived: (cb) => { chunkHandler = cb; }, abort() {} };
    }
  });
  startChat(page, '今晚 23:30 提醒我睡觉，明天早八');
  assert.equal(page.data.chatState, 'sending');
  const content = '好，那我们拉钩。\n@@DO@@{"skill":"bedtime_pledge","args":{"time":"23:30","note":"早八"}}';
  chunkHandler({ data: Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`, 'utf8') });
  opts.success();
  const confirmMsg = page.data.messages.find((item) => item.role === 'skill-confirm');
  assert.ok(confirmMsg, 'streamed skill marker should raise a confirm card');
  assert.ok(confirmMsg.text.indexOf('约定就寝时间') !== -1);
  // 用户点「执行」：任务落库，随后给出订阅授权卡片
  page.confirmSkill({ currentTarget: { dataset: { id: confirmMsg.id } } });
  const storedTasks = store[storage.KEYS.agentTasks] || [];
  assert.equal(storedTasks.length, 1);
  assert.equal(storedTasks[0].kind, 'bedtime');
  assert.equal(storedTasks[0].time, '23:30');
  assert.equal(storedTasks[0].note, '早八');
  assert.ok(page.data.messages.every((item) => item.role !== 'skill-confirm'));
  const actionMsg = page.data.messages.find((item) => item.role === 'skill-action');
  assert.ok(actionMsg, 'confirmed pledge should offer subscribe authorization');
  // 模板未配置：点击后降级提示，不报错
  page.subscribeSkill({ currentTarget: { dataset: { id: actionMsg.id } } });
  const settled = page.data.messages.find((item) => item.id === actionMsg.id);
  assert.equal(settled.role, 'skill');
  assert.ok(settled.text.indexOf('还没配置好') !== -1);
});

test('guide quick skill opens the full-screen session and leaves a handoff line', () => {
  const { page, navigations } = harness();
  startChat(page, '带我入睡');
  // 面板点按 = 明确意图：任何时段都直接打开全屏引导页，不再受仅夜间时间窗限制
  page.quickSkill({ currentTarget: { dataset: { key: 'guide-night' } } });
  // 不再往对话里倒引导词：只留一句接手的话 + 打开全屏引导页
  assert.deepEqual(navigations, [{ type: 'navigateTo', url: '/pages/guide/index?script=night' }]);
  const last = page.data.messages[page.data.messages.length - 1];
  assert.equal(last.role, 'skill');
  assert.ok(last.text.indexOf('星夜慢行') !== -1);
  assert.equal(last.text.indexOf('今晚我们从窗边出发'), -1);
  assert.ok(!page.guideTimers || page.guideTimers.length === 0);
});

test('module handoffs leave a closing line, unfinished ones stay silent', () => {
  const { page } = harness();
  startChat(page, '嗯');
  const before = page.data.messages.length;
  // 中途停下：只记进板块动态，不往对话里加东西
  agentPort.publish('guide', 'guide_ended', { script: 'night', title: '星夜慢行' });
  page.consumePortHandoffs();
  assert.equal(page.data.messages.length, before);
  // 走完：回到对话补一句收尾，回执连同事件一起消费掉
  agentPort.publish('guide', 'guide_done', { script: 'body', title: '身体扫描' });
  page.consumePortHandoffs();
  assert.equal(page.data.messages.length, before + 1);
  const last = page.data.messages[before];
  assert.equal(last.role, 'skill');
  assert.ok(last.text.indexOf('身体扫描') !== -1);
  assert.ok(last.text.indexOf('睡个好觉') !== -1);
  // 还在欢迎页时只消费不打扰
  page.setData({ homeState: 'initial' });
  agentPort.publish('guide', 'guide_done', { script: 'night', title: '星夜慢行' });
  page.consumePortHandoffs();
  assert.equal(page.data.messages.length, before + 1);
  // 已消费的回执不会在回到对话后再补一次
  page.setData({ homeState: 'chat' });
  page.consumePortHandoffs();
  assert.equal(page.data.messages.length, before + 1);
});

test('opening after the pledged time delivers the catch-up message into the chat', () => {
  const realNow = Date.now;
  const { page, store } = harness();
  store[storage.KEYS.agentTasks] = [{
    id: 'task-seed',
    kind: 'bedtime',
    time: '23:30',
    note: '早八',
    createdAt: new Date('2026-10-12T22:00:00').getTime(),
    dueAt: new Date('2026-10-12T23:30:00').getTime(),
    status: 'pending'
  }];
  Date.now = () => new Date('2026-10-13T00:10:00').getTime();
  try {
    page.deliverDueTasks();
  } finally {
    Date.now = realNow;
  }
  assert.equal(page.data.homeState, 'chat');
  // 旧首页弃用后 onLoad 即对话态：到点提醒作为新消息进入对话（不再占第一条开场位）。
  const catchUp = page.data.messages.find((item) => item.text.indexOf('到点啦') !== -1);
  assert.ok(catchUp, 'catch-up message lands in the chat');
  assert.equal(catchUp.role, 'agent');
  assert.ok(catchUp.text.indexOf('23:30') !== -1);
  assert.equal(store[storage.KEYS.agentTasks][0].status, 'delivered');
  // 同一条提醒同步落进「消息」列表（未读），入口角标点亮
  const inbox = store[storage.KEYS.agentMessages] || [];
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].kind, 'bedtime');
  assert.equal(inbox[0].read, false);
  assert.ok(inbox[0].text.indexOf('23:30') !== -1);
  assert.equal(page.data.messageBadge, 1);
  // 消息页标记已读后回到夜喵页：刷新角标归零
  agentMessages.markRead(inbox[0].id);
  page.refreshMessageBadge();
  assert.equal(page.data.messageBadge, 0);
});

test('critical input keeps the model in charge; a missing @@SAFE@@ still lands the help card', async () => {
  const { page, modelReply } = harnessWithModelReply();
  startChat(page, '我真的不想活了');
  await modelReply('听到了。我陪你，先别急着做任何决定。'); // Stage B（Stage A 已由沙箱自动应答）
  assert.equal(page.data.chatState, 'idle');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.equal(agentMsg.text, '听到了。我陪你，先别急着做任何决定。', 'model reply stays verbatim, no canned takeover');
  const card = page.data.messages.find((item) => item.role === 'safety');
  assert.ok(card, 'help card should land as the deterministic fallback');
  assert.equal(card.banner, '/assets/agent/safety-banner.jpg');
  const center = card.channels.find((ch) => ch.key === 'center');
  assert.equal(center.contact, '88982525');
  assert.ok(page.lastTurn, 'critical turns are normal retryable turns now');
});

test('model-emitted @@SAFE@@ summons the help card and never leaks into visible text', () => {
  const { page, modelReply } = harnessWithModelReply();
  startChat(page, '最近老是失眠'); // 端内扫描为 normal——面板完全由模型意识调起
  modelReply('听起来你已经很累了。先把灯调暗一点。\n@@SAFE@@');
  assert.equal(page.data.chatState, 'idle');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.equal(agentMsg.text, '听起来你已经很累了。先把灯调暗一点。', 'marker must not leak into visible text');
  assert.equal(page.lastTurn.safetyLevel, 'normal');
  assert.ok(page.data.messages.find((item) => item.role === 'safety'), 'panel follows the model marker');
});

test('deep mode streams reasoning_content into the thinking panel before content arrives', async () => {
  // Reflect（glm 思考模型 + 两阶段流水线）：Stage A 由沙箱自动应答（计划进思考面板），
  // Stage B 真流式：reasoning_content 实时进思考面板，正文照常打字。
  let chunkHandler = null;
  let opts = null;
  const { page, finish, store } = harness({
    request: (options) => {
      opts = options;
      assert.equal(options.data.model, 'test-deep', '沙箱只把 Stage B（glm）交给测试驱动');
      return { onChunkReceived: (cb) => { chunkHandler = cb; }, abort() {} };
    }
  });
  store['sleepwell.night.preferences.v1'] = { chatMode: 'Reflect' };
  startChat(page, '深度聊聊失眠这件事');
  const reasoningSse = 'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '按计划引用刺激控制。' } }] }) + '\n\n';
  chunkHandler({ data: Buffer.from(reasoningSse, 'utf8') });
  finish();
  const before = page.data.messages[page.data.messages.length - 1];
  assert.ok(before.thinking, '模型提供的内容进入面板');
  assert.ok(before.thinking.indexOf('按计划引用刺激控制') !== -1, 'reasoning 流式进思考面板');
  const answerSse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: '@@THINK@@整理一下@@ANSWER@@深夜失眠确实难熬，试试刺激控制。' } }] }) + '\n\n';
  chunkHandler({ data: Buffer.from(answerSse, 'utf8') });
  if (opts && opts.success) opts.success({ statusCode: 200 }); // Stage B 收尾
  const after = page.data.messages[page.data.messages.length - 1];
  assert.ok(after.thinking.indexOf('按计划引用刺激控制') !== -1, '模型流式内容保留');
  assert.ok(after.thinking.indexOf('整理一下') !== -1, '协议思考并列展示');
  assert.equal(after.text, '深夜失眠确实难熬，试试刺激控制。', '正文照常流式');
  assert.equal(after.done, true, '回复正常收尾');
});

test('reflex generates directly without mandatory analysis', () => {
  // 780k 非思考模型：思考过程由 Stage A 的分析推理承担，Stage B 免 @@THINK@@ 直接正文。
  const { page } = harness();
  startChat(page, '嗯');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro' && item.done);
  assert.ok(agentMsg, 'fast + plan：自动计划下正文正常收尾');
  assert.equal(agentMsg.thinking || null, null, '没有额外分析请求');
});

test('pinyin evasion input rides the model path and lands the help card with banner', async () => {
  const { page, modelReply } = harnessWithModelReply();
  startChat(page, 'zisha');
  await modelReply('谢谢你肯把这个词说出来。\n@@SAFE@@'); // Stage B（Stage A 已由沙箱自动应答）
  const card = page.data.messages.find((item) => item.role === 'safety');
  assert.ok(card, 'help card should appear for pinyin evasion input');
  assert.equal(card.banner, '/assets/agent/safety-banner.jpg', 'boat banner rides on the help card');
});

test('safety card copies the hotline and campus numbers per channel', () => {
  const { page, clipboard, toasts } = harness();
  startChat(page, '我不想活了');
  const card = page.data.messages.find((item) => item.role === 'safety');
  assert.ok(card, 'help card should be present');
  page.copySafety({ currentTarget: { dataset: {} } });
  assert.deepEqual(clipboard, ['12356']);
  assert.deepEqual(toasts, ['已复制 12356'], 'success toast only after clipboard write succeeds');
  page.copySafety({ currentTarget: { dataset: { copy: '88982525', label: '心理中心' } } });
  assert.deepEqual(clipboard, ['12356', '88982525']);
  page.copySafety({ currentTarget: { dataset: { copy: card.link, label: '求助网址' } } });
  assert.deepEqual(clipboard, ['12356', '88982525', card.link]);
  assert.equal(toasts.length, 3);
});

test('copy falls back to a visible modal when the clipboard write fails', () => {
  const { page, clipboard, toasts, modals } = harness({ clipboardFail: true });
  startChat(page, '我不想活了');
  page.copySafety({ currentTarget: { dataset: { copy: '88982525', label: '心理中心值班电话' } } });
  assert.deepEqual(clipboard, ['88982525']);
  assert.equal(toasts.length, 0, 'no success toast on failure');
  assert.equal(modals.length, 1, 'fallback modal surfaces the number');
  assert.equal(modals[0].title, '心理中心值班电话');
  assert.equal(modals[0].content, '88982525');
});

test('elevated input keeps the model path and records the safety level', () => {
  const { page } = harness();
  startChat(page, '最近快撑不住了');
  assert.equal(page.data.chatState, 'idle');
  assert.ok(!page.data.messages.some((item) => item.role === 'safety'), 'elevated talk should not be hard-blocked');
  assert.equal(page.lastTurn.safetyLevel, 'elevated');
  // 重试沿用同一轮：安全提示注入保持
  page.regenerate();
  assert.equal(page.lastTurn.safetyLevel, 'elevated');
});

test('safety region list defaults to zhejiang, toggles and remembers the choice', () => {
  const { page, store } = harness();
  assert.equal(page.data.safetyRegionIndex, 0);
  assert.equal(page.data.safetyRegionNames[0], '浙江（默认）');
  assert.ok(page.data.safetyRegionLines.some((line) => line.contact === '96525'));
  assert.equal(page.data.safetyExpanded, false);
  // 展开地区列表
  page.toggleSafetyMore();
  assert.equal(page.data.safetyExpanded, true);
  // 切到「全国热线」：行列表更新并写入本地偏好
  page.onSafetyRegionChange({ detail: { value: '1' } });
  assert.equal(page.data.safetyRegionIndex, 1);
  assert.ok(page.data.safetyRegionLines.some((line) => line.contact === '010-82951332'));
  const prefs = store['sleepwell.night.preferences.v1'] || {};
  assert.equal(prefs.safetyRegion, 'national');
  // 重新加载：选择被记住，展开态复位
  page.onUnload();
  page.onLoad();
  assert.equal(page.data.safetyRegionIndex, 1);
  assert.equal(page.data.safetyExpanded, false);
  assert.ok(page.data.safetyRegionLines.some((line) => line.contact === '12356'));
});

test('agent page enters chat directly and entry text is sent automatically', () => {
  const { page } = harness();
  // 旧首页弃用：onLoad（无参数）即对话态
  assert.equal(page.data.homeState, 'chat');
  assert.equal(page.data.showChat, true);
  // 首页输入框带入的草稿：进入后自动发出，草稿清空
  page.pendingEntryText = '我睡不着';
  page.entryApplied = false;
  page.applyEntryDraft();
  const userMessages = page.data.messages.filter((item) => item.role === 'user');
  assert.equal(userMessages.length, 1, 'entry text is sent without a second tap');
  assert.equal(userMessages[0].text, '我睡不着');
  assert.equal(page.data.draft, '');
  // 咨询师卡带入的首句同样自动发送
  page.pendingEntryText = '我总觉得自己不如别人';
  page.entryApplied = false;
  page.applyEntryDraft();
  const allUser = page.data.messages.filter((item) => item.role === 'user');
  assert.equal(allUser.length, 2);
  assert.equal(allUser[1].text, '我总觉得自己不如别人');
});

test('night-nav stays tappable in chat state and the home button exits the conversation', () => {
  const { page, navigations } = harness();
  startChat(page, '你好'); // 对话态：底栏常驻
  assert.equal(page.data.homeState, 'chat');
  // 对话态点「呼吸」：直接跳转
  page.goBreathe();
  assert.deepEqual(navigations[navigations.length - 1], { type: 'reLaunch', url: '/pages/breathe/index' });
  // 对话态点「夜喵」：旧首页已弃用 → 回新版首页
  page.closeRecords();
  assert.deepEqual(navigations[navigations.length - 1], { type: 'reLaunch', url: '/pages/home/index' });
  // 首页态（initial）点「夜喵」：仍是记录面板开关，不误触跳转
  page.setData({ homeState: 'initial' });
  page.closeRecords();
  assert.equal(page.data.homeState, 'initial');
});

test('fast mode reports network failure without silently duplicating the request', () => {
  // 真机定位：780k（modelgateway）在部分设备不可达——fast Stage B fail 后自动换 0731 重发。
  let calls = 0;
  let opts731 = null;
  const { page } = harness({
    request: (options) => {
      if (String(options.data.messages[0].content).indexOf('意图分析器') !== -1) {
        if (options.success) options.success({ statusCode: 200, data: { choices: [{ message: { content: '{"need":"倾诉","use":"","rec":false}' } }] } });
        return { abort() {} };
      }
      calls += 1;
      if (calls === 1) {
        // 第一次（780k 流式）：模拟真机连接失败
        let fired = false;
        return { onChunkReceived() { if (!fired) { fired = true; if (options.fail) options.fail({ errMsg: 'request:fail' }); } }, abort() {} };
      }
      // failover：0731 非流式
      opts731 = options;
      if (options.success) options.success({ statusCode: 200, data: { choices: [{ message: { content: '深夜的烦躁是有分量的，先放一放。' } }] } });
      return { abort() {} };
    }
  });
  startChat(page, '嗯');
  assert.equal(calls, 1);
  assert.equal(opts731, null);
  assert.equal(page.data.chatState, 'error');
  assert.equal(page.pendingAgent, null);
});

test('new conversation rejects old callbacks even when agent bubble ids repeat', () => {
  const requests = [];
  const { page } = harness({ request(options) {
    const item = { options }; requests.push(item);
    return { onChunkReceived(fn) { item.chunk = fn; }, abort() { options.fail({ errMsg: 'abort' }); } };
  } });
  startChat(page, '旧会话消息');
  const old = requests[0];
  require('../services/agent-sessions').start({ topic: '' });
  page.beginConversation('');
  startChat(page, '新会话消息');
  const current = requests[1];
  assert.equal(page.lastTurn.agentId, 'agent-1', '新会话重复使用同样气泡 id');
  old.chunk({ data: Buffer.from('data: {"choices":[{"delta":{"content":"旧会话迟到回复"}}]}\n\n') });
  old.options.success({ statusCode: 200 });
  assert.equal(page.data.chatState, 'sending');
  assert.ok(!page.data.messages.some(item => String(item.text).includes('旧会话')));
  current.chunk({ data: Buffer.from('data: {"choices":[{"delta":{"content":"新会话真实管线回复"}}]}\n\n') });
  current.options.success({ statusCode: 200 });
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.messages.at(-1).text, '新会话真实管线回复');
});

test('page clears failed request state and retry succeeds without duplicate user bubbles', () => {
  const requests = [];
  const { page, toasts } = harness({ request(options) {
    requests.push(options);
    return { onChunkReceived() {}, abort() {} };
  } });
  startChat(page, '你好');
  requests[0].fail({ errMsg: 'request:fail timeout' });
  assert.equal(page.data.chatState, 'error');
  assert.equal(page.data.awaitingFirst, false);
  assert.equal(page.data.streamState, 'idle');
  assert.equal(page.pendingAgent, null);
  assert.ok(toasts.some(text => text.includes('超时')));
  page.retryTurn();
  requests[1].success({ statusCode: 200, data: { choices: [{ message: { content: '重试正文' } }] } });
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.messages.filter(item => item.role === 'user').length, 1);
  assert.equal(page.data.messages.at(-1).text, '重试正文');
});
