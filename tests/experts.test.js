const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const builder = require('../tools/build-experts');
const registry = require('../experts/registry');
const agentClient = require('../services/agent-client');
const nightPreferences = require('../services/night-preferences');

const SAMPLE_SOURCE = [
  '---',
  'expert: yalom',
  'label: 亚隆',
  'title: 欧文·亚隆 · 存在主义视角',
  'intro: 真诚、此时此地',
  'starters:',
  '  - 深夜总在想一些没有答案的问题',
  '  - 安静下来之后有点怕',
  'sources:',
  '  - 著作｜《存在主义心理治疗》(1980)',
  '  - 论文｜示例综述 (2020)',
  'boundaries: 基于公开作品的视角模拟，不是本人。',
  '---',
  '',
  '# 欧文·亚隆',
  '',
  '正文段落。',
  '',
  builder.START_MARK,
  '专注此时此地，不回避死亡话题。',
  builder.END_MARK,
  '',
  '结尾。',
  ''
].join('\n');

const SAMPLE_CARD = {
  label: '亚隆',
  title: '欧文·亚隆 · 存在主义视角',
  intro: '真诚、此时此地',
  prompt: '专注此时此地，不回避死亡话题。',
  starters: ['深夜总在想一些没有答案的问题'],
  sources: ['著作｜《存在主义心理治疗》(1980)'],
  boundaries: '基于公开作品的视角模拟，不是本人。'
};

function withStore(store, fn) {
  const original = global.wx;
  global.wx = {
    getStorageSync: (key) => (key in store ? store[key] : ''),
    setStorageSync: (key, value) => { store[key] = value; return true; }
  };
  try {
    return fn();
  } finally {
    if (original) global.wx = original; else delete global.wx;
  }
}

test('parseFrontmatter reads scalars and starter lists', () => {
  const meta = builder.parseFrontmatter(SAMPLE_SOURCE);
  assert.equal(meta.expert, 'yalom');
  assert.equal(meta.title, '欧文·亚隆 · 存在主义视角');
  assert.deepEqual(meta.starters, ['深夜总在想一些没有答案的问题', '安静下来之后有点怕']);
  assert.deepEqual(meta.sources, ['著作｜《存在主义心理治疗》(1980)', '论文｜示例综述 (2020)']);
  assert.equal(builder.parseFrontmatter('没有 frontmatter'), null);
});

test('extractInjectionBlock trims the block and rejects missing or duplicate markers', () => {
  assert.equal(builder.extractInjectionBlock(SAMPLE_SOURCE), '专注此时此地，不回避死亡话题。');
  assert.equal(builder.extractInjectionBlock('没有标记'), null);
  const duplicated = SAMPLE_SOURCE + '\n' + builder.START_MARK + '\n再来一段\n' + builder.END_MARK + '\n';
  assert.equal(builder.extractInjectionBlock(duplicated), null);
});

test('parseExpertCard validates required fields and returns a full card', () => {
  const ok = builder.parseExpertCard(SAMPLE_SOURCE);
  assert.equal(ok.error, undefined);
  assert.equal(ok.id, 'yalom');
  assert.equal(ok.card.title, '欧文·亚隆 · 存在主义视角');
  assert.equal(ok.card.prompt, '专注此时此地，不回避死亡话题。');
  assert.deepEqual(ok.card.starters, ['深夜总在想一些没有答案的问题', '安静下来之后有点怕']);
  assert.deepEqual(ok.card.sources, ['著作｜《存在主义心理治疗》(1980)', '论文｜示例综述 (2020)']);

  const missingBoundaries = SAMPLE_SOURCE.replace('boundaries: 基于公开作品的视角模拟，不是本人。\n', '');
  assert.ok(builder.parseExpertCard(missingBoundaries).error.indexOf('boundaries') !== -1);

  const missingSources = SAMPLE_SOURCE.replace('sources:\n  - 著作｜《存在主义心理治疗》(1980)\n  - 论文｜示例综述 (2020)\n', '');
  assert.ok(builder.parseExpertCard(missingSources).error.indexOf('sources') !== -1);

  const badId = SAMPLE_SOURCE.replace('expert: yalom', 'expert: Bad_ID');
  assert.ok(builder.parseExpertCard(badId).error.indexOf('不合法') !== -1);
});

test('run builds cards.js from source directory and skips plain notes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightcat-experts-'));
  try {
    fs.writeFileSync(path.join(dir, 'yalom.md'), SAMPLE_SOURCE, 'utf8');
    fs.writeFileSync(path.join(dir, 'README.md'), '# 说明（没有专家元信息）', 'utf8');
    const outFile = path.join(dir, 'cards.js');
    const result = builder.run({ srcDir: dir, outFile });
    assert.equal(result.ok, true);
    assert.equal(Object.keys(result.cards).length, 1);
    assert.ok(result.warnings.some((line) => line.indexOf('README.md') !== -1));

    const generated = fs.readFileSync(outFile, 'utf8');
    assert.ok(generated.indexOf('自动生成') !== -1);
    const cards = require(outFile);
    assert.equal(cards.yalom.label, '亚隆');
    assert.ok(cards.yalom.prompt.indexOf('专注此时此地') !== -1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run refuses to write when any source card is malformed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightcat-experts-'));
  try {
    fs.writeFileSync(path.join(dir, 'yalom.md'), SAMPLE_SOURCE, 'utf8');
    fs.writeFileSync(path.join(dir, 'broken.md'), '---\nexpert: broken\nlabel: 断卡\n---\n没有注入块', 'utf8');
    const outFile = path.join(dir, 'cards.js');
    const result = builder.run({ srcDir: dir, outFile });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.equal(fs.existsSync(outFile), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('registry falls back to empty when no expert is selected or the selection is unknown', () => {
  withStore({}, () => {
    assert.equal(registry.current(), '');
    assert.equal(registry.buildActivePrompt(), '');
    nightPreferences.save({ expert: 'nobody' });
    assert.equal(registry.current(), '');
    nightPreferences.save({ expert: '' });
    assert.equal(registry.buildActivePrompt(), '');
  });
});

test('expert section carries identity, precedence and disclaimer rules', () => {
  const section = registry.buildExpertPrompt('yalom', { yalom: SAMPLE_CARD });
  assert.ok(section.indexOf('欧文·亚隆 · 存在主义视角') !== -1);
  assert.ok(section.indexOf('专注此时此地') !== -1);
  assert.ok(section.indexOf('夜喵') !== -1);
  assert.ok(section.indexOf('不得改变后面的对话规则') !== -1);
  assert.ok(section.indexOf('不构成任何医疗或治疗建议') !== -1);
  assert.equal(registry.buildExpertPrompt('missing', { yalom: SAMPLE_CARD }), '');
  assert.equal(registry.buildExpertPrompt('', { yalom: SAMPLE_CARD }), '');
});

test('expert section carries dosage and questioning discipline against analysis mode', () => {
  const section = registry.buildExpertPrompt('yalom', { yalom: SAMPLE_CARD });
  // 实测修复（2026-10-17）：满载时模型滑向分析式追问，包裹层必须带用量与提问纪律。
  assert.ok(section.indexOf('用量纪律') !== -1);
  assert.ok(section.indexOf('一次回复最多轻轻用一个框架概念') !== -1);
  assert.ok(section.indexOf('不展开分析、不连环追问') !== -1);
  assert.ok(section.indexOf('禁止“是A还是B”的二选一提问') !== -1);
  assert.ok(section.indexOf('不要求用户自我分析') !== -1);
  assert.ok(section.indexOf('节奏示例') !== -1);
  // 纪律必须是第一条使用规则（flash 模型对段首最敏感）。
  const rulesIndex = section.indexOf('专家视角使用规则：');
  assert.ok(section.indexOf('用量纪律') > rulesIndex);
  assert.ok(section.indexOf('用量纪律') < section.indexOf('不要自称'));
});

test('system prompt places the expert section between persona and context, before dialogue rules', () => {
  const section = registry.buildExpertPrompt('yalom', { yalom: SAMPLE_CARD });
  const prompt = agentClient.buildSystemPrompt('', 'CTX-MARK', 'PERSONA-MARK', section);
  const personaIndex = prompt.indexOf('PERSONA-MARK');
  const expertIndex = prompt.indexOf('专家视角');
  const contextIndex = prompt.indexOf('CTX-MARK');
  const rulesIndex = prompt.indexOf('对话规则：');
  assert.ok(personaIndex !== -1 && expertIndex !== -1 && contextIndex !== -1 && rulesIndex !== -1);
  assert.ok(personaIndex < expertIndex);
  assert.ok(expertIndex < contextIndex);
  assert.ok(expertIndex < rulesIndex);
  assert.equal(agentClient.buildSystemPrompt('', 'CTX-MARK', 'PERSONA-MARK').indexOf('专家视角'), -1);
});

test('every shipped expert card exposes the full contract', () => {
  registry.list().forEach((card) => {
    assert.ok(card.name);
    assert.ok(card.label && card.title && card.intro);
    assert.ok(card.prompt && card.prompt.length > 0);
    assert.ok(card.boundaries);
    assert.ok(Array.isArray(card.starters));
    assert.ok(Array.isArray(card.sources) && card.sources.length > 0);
  });
});

test('quotes must carry a source and flow into the built card', () => {
  const withQuotes = SAMPLE_SOURCE.replace('sources:', 'quotes:\n  - 专注此时此地｜《示例著作》(1980)\nsources:');
  const ok = builder.parseExpertCard(withQuotes);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.card.quotes, ['专注此时此地｜《示例著作》(1980)']);

  const badQuote = SAMPLE_SOURCE.replace('sources:', 'quotes:\n  - 没有出处的一句话\nsources:');
  assert.ok(builder.parseExpertCard(badQuote).error.indexOf('出处') !== -1);
});

test('expert section renders sourced quotes with the paraphrase rule', () => {
  const section = registry.buildExpertPrompt('yalom', {
    yalom: Object.assign({}, SAMPLE_CARD, { quotes: ['安静自有力量｜《示例著作》(1980)'] })
  });
  assert.ok(section.indexOf('安静自有力量') !== -1);
  assert.ok(section.indexOf('（转述自：《示例著作》(1980)）') !== -1);
  assert.ok(section.indexOf('不加引号、不写成原话') !== -1);
  const withoutQuotes = registry.buildExpertPrompt('yalom', { yalom: SAMPLE_CARD });
  assert.equal(withoutQuotes.indexOf('可用的转述引语'), -1);
});

test('yalom card ships citation-ready quote paraphrases', () => {
  const yalom = registry.list().find((item) => item.name === 'yalom');
  assert.ok(Array.isArray(yalom.quotes) && yalom.quotes.length >= 4);
  yalom.quotes.forEach((line) => {
    const parts = line.split('｜');
    assert.ok(parts.length >= 2 && parts[0].trim() && parts.slice(1).join('｜').trim(), line);
  });
});

test('morita card ships the sleep-first framework with sourced quotes', () => {
  const morita = registry.list().find((item) => item.name === 'morita');
  assert.ok(morita, 'morita card should ship');
  assert.equal(morita.title, '森田正马 · 森田疗法视角');
  ['精神交互作用', '顺应自然', '为所当为', '不检查时间'].forEach((term) => {
    assert.ok(morita.prompt.indexOf(term) !== -1, `injection should mention ${term}`);
  });
  assert.ok(Array.isArray(morita.quotes) && morita.quotes.length >= 5);
  morita.quotes.forEach((line) => {
    const parts = line.split('｜');
    assert.ok(parts.length >= 2 && parts[0].trim() && parts.slice(1).join('｜').trim(), line);
  });
  assert.ok(Array.isArray(morita.sources) && morita.sources.length >= 25);
  assert.ok(morita.boundaries && morita.starters.length >= 3);
});

test('morita injection keeps safety lines and never ships bed-rest instructions', () => {
  const morita = registry.list().find((item) => item.name === 'morita');
  ['不冒充本人', '危机信号优先走安全规则', '用作对痛苦的劝解', '框架推断'].forEach((term) => {
    assert.ok(morita.prompt.indexOf(term) !== -1, `injection should keep ${term}`);
  });
  assert.equal(morita.prompt.indexOf('卧床'), -1);
});
