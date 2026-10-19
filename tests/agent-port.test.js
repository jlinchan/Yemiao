const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../services/storage');
const agentPort = require('../services/agent-port');
const registry = require('../skills/registry');

// 端口沙箱：一份内存存储，Agent 端口与各板块服务共用 Node global 上的 wx。
function withStore(seed = {}) {
  const store = Object.assign({}, seed);
  global.wx = {
    getStorageSync: (key) => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value; return true; }
  };
  return store;
}

function events(store) {
  return store[storage.KEYS.agentEvents] || [];
}

test('publish stores a normalized event and ignores unknown modules or kinds', () => {
  const store = withStore();
  const event = agentPort.publish('breathe', 'practice_done', { cycles: 6, completed: true, mode: 'breathe' });
  assert.equal(event.module, 'breathe');
  assert.equal(event.kind, 'practice_done');
  assert.equal(event.text, '完成呼吸练习 6 轮');
  assert.equal(event.chat, '你刚做完 6 轮呼吸练习。');
  assert.equal(event.handed, false);
  // data 只用于当场装配文案，不落库（存储里只有叙述性 text）
  assert.equal(event.data, undefined);
  assert.equal(events(store).length, 1);
  // 未知模块 / 未知事件静默忽略
  assert.equal(agentPort.publish('nope', 'practice_done', {}), null);
  assert.equal(agentPort.publish('breathe', 'nope', {}), null);
  assert.equal(events(store).length, 1);
  // 缺参数也不抛：兜底文案照常生成
  const fallback = agentPort.publish('guide', 'guide_done');
  assert.equal(fallback.text, '走完入睡引导「入睡引导」');
  delete global.wx;
});

test('body scans report through the same port with their own wording', () => {
  const store = withStore();
  const event = agentPort.publish('breathe', 'practice_done', { cycles: 3, completed: false, mode: 'body' });
  assert.equal(event.text, '完成身体扫描 3 轮');
  assert.equal(event.chat, '你刚做了一段身体扫描，停在 3 轮也很好。');
  const rated = agentPort.publish('breathe', 'practice_rated', { outcome: 'tense' });
  assert.equal(rated.text, '练后自评：还紧绷');
  assert.equal(rated.chat, '', '自评只进动态，不单独占对话');
  delete global.wx;
});

test('focus reports the wind-down start and never adds a snapshot line', () => {
  const store = withStore();
  assert.equal(agentPort.snapshotLines(Date.now()).length, 0);
  const event = agentPort.publish('focus', 'focus_started', {});
  assert.equal(event.text, '开始关灯，准备休息');
  assert.equal(event.chat, '关灯了。屏幕安静下来，剩下的交给明天。');
  assert.equal(events(store).length, 1);
  assert.equal(agentPort.snapshotLines(Date.now()).length, 0, '关灯没有历史快照，事件落库也不出行');
  delete global.wx;
});

test('recent summary keeps one entry per module-kind within three days and labels days', () => {
  const now = new Date('2026-10-16T21:00:00').getTime();
  const store = withStore({
    [storage.KEYS.agentEvents]: [
      { id: 'e1', module: 'journal', kind: 'journal_saved', text: '写下了感恩日记', chat: '今天的感恩日记收好了。', at: now - 1000, handed: true },
      { id: 'e2', module: 'breathe', kind: 'practice_done', text: '完成呼吸练习 6 轮', chat: '', at: now - 2 * 60 * 60 * 1000, handed: false },
      { id: 'e3', module: 'breathe', kind: 'practice_done', text: '完成呼吸练习 3 轮', chat: '', at: now - 26 * 60 * 60 * 1000, handed: false },
      { id: 'e4', module: 'sleep', kind: 'sleep_saved', text: '记下「10 月 15 日」的睡眠', chat: '', at: now - 30 * 60 * 60 * 1000, handed: false },
      { id: 'old', module: 'sound', kind: 'sound_played', text: '开始听雨声', chat: '', at: now - 4 * 24 * 60 * 60 * 1000, handed: false }
    ]
  });
  const line = agentPort.recentSummary(now);
  assert.ok(line.indexOf('今天完成呼吸练习 6 轮') !== -1);
  assert.equal(line.indexOf('完成呼吸练习 3 轮'), -1, '同一类事只留最新一条');
  assert.ok(line.indexOf('昨天记下「10 月 15 日」的睡眠') !== -1);
  assert.ok(line.indexOf('今天写下了感恩日记') !== -1);
  assert.equal(line.indexOf('开始听雨声'), -1, '超过三天的动态不再出现');
  delete global.wx;
});

test('recent summary stays empty without fresh events', () => {
  const now = Date.now();
  const store = withStore({
    [storage.KEYS.agentEvents]: [{ id: 'old', module: 'sound', kind: 'sound_stopped', text: '关掉了雨声', chat: '', at: now - 5 * 24 * 60 * 60 * 1000, handed: false }]
  });
  assert.equal(agentPort.recentSummary(now), '');
  delete global.wx;
});

test('snapshot lines come from every module that has data', () => {
  const now = new Date('2026-10-16T21:30:00').getTime();
  const store = withStore({
    [storage.KEYS.sessions]: [{ id: 'a', startedAt: now - 3600000, cycles: 6, completed: true, outcome: 'tense' }],
    [storage.KEYS.sleep]: [{ nightDate: '2026-10-15', bedTime: '23:40', wakeTime: '07:20', duration: '7 小时 40 分', feeling: 4 }],
    [storage.KEYS.journal]: [
      { date: '10 月 15 日', items: ['同事分了我一块蛋糕'] },
      { date: '10 月 14 日', items: ['梦见在海上飞'], kind: 'dream' }
    ],
    [storage.KEYS.guideSessions]: [{ id: 'g1', script: 'night', title: '星夜慢行', completed: true, at: now - 2 * 24 * 3600000 }]
  });
  const lines = agentPort.snapshotLines(now);
  const joined = lines.join('\n');
  assert.ok(joined.indexOf('练后自评：放松 0 次、差不多 0 次、还紧绷 1 次') !== -1);
  assert.ok(joined.indexOf('23:40 上床') !== -1);
  assert.ok(joined.indexOf('感受「不错」') !== -1);
  assert.ok(joined.indexOf('同事分了我一块蛋糕') !== -1);
  assert.ok(joined.indexOf('最近记下的梦（10 月 14 日）：梦见在海上飞') !== -1);
  assert.ok(joined.indexOf('近 7 天走完了 1 次入睡引导（星夜慢行 1 次）') !== -1);
  // 环境声没在播（无 getApp），不出行
  assert.equal(lines.some((line) => line.indexOf('放着') !== -1), false);
  delete global.wx;
});

test('sound module reports the live playing state when getApp is available', () => {
  withStore();
  global.getApp = () => ({ globalData: { audioState: { sound: 'rain', playing: true, timerMinutes: 30 } } });
  assert.ok(agentPort.snapshotLines(Date.now()).some((line) => line.indexOf('此刻正给用户放着雨声（30 分钟定时）') !== -1));
  global.getApp = () => ({ globalData: { audioState: { sound: 'rain', playing: false } } });
  assert.equal(agentPort.snapshotLines(Date.now()).length, 0);
  delete global.getApp;
  delete global.wx;
});

test('takeHandoffs returns chat events oldest first, marks them handed, and drops stale ones', () => {
  const now = Date.now();
  const store = withStore({
    [storage.KEYS.agentEvents]: [
      { id: 'new', module: 'sleep', kind: 'sleep_saved', text: '记下「10 月 16 日」的睡眠', chat: '记下了 10 月 16 日 这一晚的睡眠：7 小时。', at: now - 1000, handed: false },
      { id: 'context', module: 'sound', kind: 'sound_played', text: '开始听雨声', chat: '', at: now - 2000, handed: false },
      { id: 'old', module: 'guide', kind: 'guide_done', text: '走完入睡引导「星夜慢行」', chat: '「星夜慢行」走完了。晚安，睡个好觉。', at: now - 8 * 60 * 60 * 1000, handed: false },
      { id: 'done', module: 'journal', kind: 'journal_saved', text: '写下了感恩日记', chat: '今天的感恩日记收好了。', at: now - 3000, handed: true }
    ]
  });
  const handoffs = agentPort.takeHandoffs(now);
  assert.deepEqual(handoffs.map((item) => item.id), ['new']);
  const after = events(store);
  assert.equal(after.find((item) => item.id === 'new').handed, true);
  assert.equal(after.find((item) => item.id === 'old').handed, true, '过期回执静默作废');
  assert.equal(after.find((item) => item.id === 'context').handed, false, '不带回执的动态不参与消费');
  assert.deepEqual(agentPort.takeHandoffs(now), []);
  delete global.wx;
});

test('every skill claimed by a port module exists, and module skills are claimed exactly once', () => {
  const known = registry.DEFINITIONS.map((item) => item.name);
  const claimed = [];
  agentPort.MODULES.forEach((adapter) => (adapter.skills || []).forEach((name) => claimed.push([name, adapter.id])));
  claimed.forEach(([name, moduleId]) => {
    assert.ok(known.indexOf(name) !== -1, `${name}（${moduleId}）应存在于技能注册表`);
  });
  ['journal', 'dream_log', 'play_sound', 'stop_sound', 'bedtime_guide'].forEach((name) => {
    assert.equal(claimed.filter(([item]) => item === name).length, 1, `${name} 应恰好归属一个板块`);
  });
});

test('events ring is capped so the port never grows without bound', () => {
  const store = withStore();
  for (let index = 0; index < 45; index += 1) agentPort.publish('breathe', 'practice_done', { cycles: index + 1, completed: true, mode: 'breathe' });
  assert.equal(events(store).length, 40);
  assert.equal(events(store)[0].text, '完成呼吸练习 45 轮');
  delete global.wx;
});
