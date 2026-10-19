const test = require('node:test');
const assert = require('node:assert/strict');
const voice = require('../utils/agent-voice');
const agentClient = require('../services/agent-client');
const experts = require('../experts/registry');

test('voice prompt carries the style DNA, blacklist and few-shot examples', () => {
  const prompt = voice.buildVoicePrompt();
  ['先接住具体', '有画面', '有呼吸', '留白', '不说教', '有来处'].forEach((key) => {
    assert.ok(prompt.indexOf(key) !== -1, key);
  });
  assert.ok(prompt.indexOf('我理解你') !== -1);
  assert.ok(prompt.indexOf('绝不编造原话') !== -1);
  assert.ok(prompt.indexOf('今天好累') !== -1);
  assert.ok(prompt.indexOf('不急着填满沉默') !== -1);
});

test('system prompt places the voice section after the intro and before the persona', () => {
  const prompt = agentClient.buildSystemPrompt('', '', 'PERSONA-MARK', 'EXPERT-MARK');
  const intro = prompt.indexOf('你是“夜喵”');
  const voiceIndex = prompt.indexOf('夜喵的声音');
  const personaIndex = prompt.indexOf('PERSONA-MARK');
  const expertIndex = prompt.indexOf('EXPERT-MARK');
  const rulesIndex = prompt.indexOf('对话规则：');
  assert.ok(intro !== -1 && voiceIndex !== -1 && personaIndex !== -1 && expertIndex !== -1 && rulesIndex !== -1);
  assert.ok(intro < voiceIndex);
  assert.ok(voiceIndex < personaIndex);
  assert.ok(personaIndex < expertIndex);
  assert.ok(expertIndex < rulesIndex);
});

test('dialogue rules replace the 60-character cap with the scene-based length policy', () => {
  const prompt = agentClient.buildSystemPrompt('', '', '');
  assert.equal(prompt.indexOf('不超过 60 个字'), -1);
  assert.ok(prompt.indexOf('60-150 字') !== -1);
  assert.ok(prompt.indexOf('更短、更轻') !== -1);
  assert.ok(prompt.indexOf('若用户提到自伤或严重危机') !== -1);
});

test('expert section carries the paraphrase citation protocol', () => {
  const section = experts.formatExpertSection({
    label: '亚隆', title: '欧文·亚隆 · 存在主义视角', intro: '真诚、此时此地', prompt: '专注此时此地。'
  });
  assert.ok(section.indexOf('转述') !== -1);
  assert.ok(section.indexOf('不虚构原话') !== -1);
  assert.ok(section.indexOf('不得改变后面的对话规则') !== -1);
});

test('chat requests ask for enough tokens for the richer replies', () => {
  let options;
  global.wx = {
    request(opts) {
      options = opts;
      return { onChunkReceived() {}, abort() {} };
    }
  };
  try {
    agentClient.chat({ onComplete() {}, onError() {} });
    assert.equal(options.data.max_tokens, 600);
    assert.ok(options.data.messages[0].content.indexOf('夜喵的声音') !== -1);
  } finally {
    delete global.wx;
  }
});

test('system prompt places the book section between the expert and the context', () => {
  const prompt = agentClient.buildSystemPrompt('', 'CTX-MARK', 'PERSONA-MARK', 'EXPERT-MARK', 'BOOK-MARK');
  const order = [
    prompt.indexOf('PERSONA-MARK'),
    prompt.indexOf('EXPERT-MARK'),
    prompt.indexOf('BOOK-MARK'),
    prompt.indexOf('CTX-MARK'),
    prompt.indexOf('对话规则：')
  ];
  order.forEach((index) => assert.ok(index !== -1));
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i - 1] < order[i]);
});

test('preview tool composes the real prompt chain with a section budget', () => {
  const preview = require('../tools/preview-system-prompt');
  const result = preview.compose({ expert: 'yalom', book: 'perlis-cbti' });
  assert.ok(result.prompt.indexOf('欧文·亚隆') !== -1);
  assert.ok(result.prompt.indexOf('睡眠效率') !== -1);
  assert.ok(result.prompt.indexOf('夜喵的声音') !== -1);
  const budget = {};
  result.parts.forEach((item) => { budget[item[0]] = item[1]; });
  assert.ok(budget['专家段'] > 0);
  assert.ok(budget['书卡段'] > 0);
  assert.equal(budget['合计'], result.prompt.length);
  assert.equal(result.warnings.length, 0);

  const missing = preview.compose({ expert: 'nobody' });
  assert.ok(missing.warnings.some((line) => line.indexOf('nobody') !== -1));
  assert.equal(missing.prompt.indexOf('专家视角'), -1);
});
