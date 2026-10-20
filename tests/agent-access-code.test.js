require('./agent-test-config');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = require('../services/storage');
const accessCode = require('../services/access-code');
const applySetData = require('./page-set-data');

// 页面级测试沙箱：带本地存储与提示捕获，wx.request 同步失败走规则引擎兜底。
function harness(sharedStore) {
  let page;
  let timer;
  const store = sharedStore || {};
  const toasts = [];
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: (key) => (key in store ? store[key] : ''),
    setStorageSync: (key, value) => { store[key] = value; return true; },
    showShareMenu() {}, hideKeyboard() {}, vibrateShort() {},
    showToast: ({ title }) => toasts.push(title),
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    navigateTo() {}, reLaunch() {},
    request: (options) => { options.success({ statusCode: 200, data: { choices: [{ message: { content: '测试模型回复' } }] } }); return { abort() {} }; }
  };
  const script = path.resolve(__dirname, '../pages/agent/index.js');
  global.wx = wx;
  const context = {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    setTimeout: (fn) => { timer = fn; return 1; },
    clearTimeout: () => { timer = null; }
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), context);
  page.setData = (values) => applySetData(page.data, values);
  page.onLoad();
  page.onShow();
  return { page, store, toasts, finish: () => { const fn = timer; timer = null; if (fn) fn(); } };
}

test('access code validates input and persists only the right code', () => {
  const need = accessCode.required();

  if (!need) {
    // 免验证码模式（verificationCode 留空）：任何输入都放行，且不写入本地存储。
    global.wx = { getStorageSync: () => '', setStorageSync: () => true };
    assert.equal(accessCode.isValid(''), true);
    assert.equal(accessCode.isValid('anything'), true);
    assert.equal(accessCode.isUnlocked(), true);
    assert.equal(accessCode.save('anything'), false);
    assert.equal(accessCode.current(), '');
    delete global.wx;
    return;
  }

  global.wx = { getStorageSync: () => '', setStorageSync: () => true };
  assert.equal(accessCode.isUnlocked(), false);
  assert.equal(accessCode.isValid(''), false);
  assert.equal(accessCode.isValid('not-the-code'), false);
  assert.equal(accessCode.isValid('  ' + need + '  '), true);
  assert.equal(accessCode.save('not-the-code'), false);
  assert.equal(accessCode.save(''), false);
  assert.equal(accessCode.isUnlocked(), false);
  assert.equal(accessCode.current(), need);

  const saved = {};
  global.wx = { getStorageSync: (key) => (key in saved ? saved[key] : ''), setStorageSync: (key, value) => { saved[key] = value; return true; } };
  assert.equal(accessCode.save(' ' + need + ' '), true);
  assert.equal(saved[storage.KEYS.accessCode], need);
  assert.equal(accessCode.isUnlocked(), true);
  assert.equal(accessCode.current(), need);
  delete global.wx;
});

test('chat stays locked until the right code is entered', () => {
  const { page, store, toasts } = harness();

  if (!accessCode.required()) {
    // 免验证码模式：进入对话即解锁，发送消息不再被门禁拦截。
    assert.equal(page.data.aiLocked, false);
    page.openChat();
    page.onDraftChange({ detail: { value: '今晚睡不着' } });
    page.sendMessage();
    assert.ok(toasts.indexOf('请先输入验证码') === -1);
    assert.ok(page.data.messages.filter((item) => item.role === 'user').length > 0);
    return;
  }

  assert.equal(page.data.aiLocked, true);

  page.openChat();
  page.onDraftChange({ detail: { value: '今晚睡不着' } });
  page.sendMessage();
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.messages.filter((item) => item.role === 'user').length, 0);
  assert.equal(page.data.gateFocus, true);
  assert.ok(toasts.indexOf('请先输入验证码') !== -1);

  page.onCodeInput({ detail: { value: 'definitely-wrong' } });
  page.submitCode();
  assert.equal(page.data.codeError, true);
  assert.equal(page.data.aiLocked, true);
  assert.equal(store[storage.KEYS.accessCode], undefined);

  page.onCodeInput({ detail: { value: accessCode.required() } });
  page.submitCode();
  assert.equal(page.data.aiLocked, false);
  assert.equal(page.data.codeError, false);
  assert.equal(store[storage.KEYS.accessCode], accessCode.required());
  assert.ok(toasts.indexOf('验证成功，可以开始聊了') !== -1);
});

test('unlocked chat answers normally and closing resets the gate form', () => {
  const { page, store } = harness();
  const need = accessCode.required();
  if (need) {
    page.onCodeInput({ detail: { value: need } });
    page.submitCode();
    assert.equal(store[storage.KEYS.accessCode], need);
  }
  assert.equal(page.data.aiLocked, false);

  page.openChat();
  page.onDraftChange({ detail: { value: '考试让我焦虑' } });
  page.sendMessage();
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.ok(agentMsg, 'agent bubble should exist');
  assert.equal(agentMsg.done, true);
  assert.ok(agentMsg.text.length > 0);

  page.closeChat();
  assert.equal(page.data.codeInput, '');
  assert.equal(page.data.codeError, false);
  assert.equal(page.data.gateFocus, false);
});

test('a second visit stays unlocked because the entered code is remembered', () => {
  const first = harness();
  const need = accessCode.required();
  if (need) {
    first.page.onCodeInput({ detail: { value: need } });
    first.page.submitCode();
    assert.equal(first.page.data.aiLocked, false);
    assert.equal(first.store[storage.KEYS.accessCode], need);
  } else {
    // 免验证码模式：无需输入，两次进入都保持解锁。
    assert.equal(first.page.data.aiLocked, false);
  }

  // 同一台设备上重新打开页面：共享本地存储，因此 onShow 直接判定为解锁态。
  const second = harness(first.store);
  assert.equal(second.page.data.aiLocked, false);
});

test('gateway headers carry the verified code together with the api key', () => {
  global.wx = { getStorageSync: () => '', setStorageSync: () => true };
  const agentClient = require('../services/agent-client');
  const anonymous = agentClient.gatewayHeaders();
  assert.equal(anonymous.Authorization.indexOf('Bearer ') === 0, true);

  if (!accessCode.required()) {
    // 免验证码模式：请求头不带 X-Verification-Code。
    assert.equal('X-Verification-Code' in anonymous, false);
    delete global.wx;
    return;
  }

  assert.equal(anonymous['X-Verification-Code'], accessCode.required());

  const saved = {};
  global.wx = { getStorageSync: (key) => (key in saved ? saved[key] : ''), setStorageSync: (key, value) => { saved[key] = value; return true; } };
  assert.equal(accessCode.save(accessCode.required()), true);
  const verified = agentClient.gatewayHeaders();
  assert.equal(verified['X-Verification-Code'], accessCode.required());
  delete global.wx;
});
