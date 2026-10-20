const test = require('node:test');
const assert = require('node:assert/strict');
const knowledge = require('../utils/agent-knowledge');
const agentClient = require('../services/agent-client');

// 背景：2026-10-18 用户反馈夜喵输出"没有知识含金量、没有实际技能、太宽泛"。
// 知识库每条都必须是可上手的干货：名称 + 带数字的步骤 + 原理。

test('every knowledge entry is concrete: name, numeric steps and a reason', () => {
  assert.ok(knowledge.ENTRIES.length >= 8, '至少覆盖 8 个高频场景');
  knowledge.ENTRIES.forEach((entry) => {
    assert.ok(entry.name && entry.name.length >= 4, `名称缺失：${entry.name}`);
    assert.ok(entry.how && entry.how.length >= 30, `步骤太单薄：${entry.name}`);
    assert.ok(/\d/.test(entry.how), `做法必须带数字/时长：${entry.name}`);
    assert.ok(entry.why && entry.why.length >= 10, `缺原理：${entry.name}`);
  });
});

test('no generic empty advice inside the knowledge base', () => {
  const banned = ['早点睡', '放轻松', '别想太多', '多喝热水', '加油', '会好起来的'];
  knowledge.ENTRIES.forEach((entry) => {
    const body = entry.how + entry.why;
    banned.forEach((word) => {
      assert.ok(body.indexOf(word) === -1, `知识库混入空话「${word}」：${entry.name}`);
    });
  });
});

test('knowledge base covers the high-frequency late-night scenarios', () => {
  const keys = knowledge.ENTRIES.reduce((all, entry) => all.concat(entry.keys), []);
  ['睡不着', '脑子停不下来', '考试', '宿舍', '作息乱', '吵架'].forEach((scene) => {
    assert.ok(keys.indexOf(scene) !== -1, `缺少场景：${scene}`);
  });
});

test('knowledge prompt carries the delivery rules and all entries', () => {
  const prompt = knowledge.buildKnowledgePrompt();
  assert.ok(prompt.indexOf('夜喵的知识库') === 0);
  assert.ok(prompt.indexOf('一次只给一个') !== -1);
  assert.ok(prompt.indexOf('禁止输出没有信息量的空话') !== -1);
  assert.ok(prompt.indexOf('不编方法') !== -1);
  knowledge.ENTRIES.forEach((entry) => {
    assert.ok(prompt.indexOf(entry.name) !== -1, `未注入：${entry.name}`);
    assert.ok(prompt.indexOf(entry.how.slice(0, 12)) !== -1, `步骤未注入：${entry.name}`);
  });
});

test('system prompt places the knowledge section after voice and before persona', () => {
  const prompt = agentClient.buildSystemPrompt('', '', 'PERSONA-MARK');
  const voiceIndex = prompt.indexOf('夜喵的声音');
  const knowledgeIndex = prompt.indexOf('夜喵的知识库');
  const personaIndex = prompt.indexOf('PERSONA-MARK');
  assert.ok(voiceIndex !== -1 && knowledgeIndex !== -1 && personaIndex !== -1);
  assert.ok(voiceIndex < knowledgeIndex);
  assert.ok(knowledgeIndex < personaIndex);
});
