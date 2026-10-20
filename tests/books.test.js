const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const builder = require('../tools/build-books');
const registry = require('../books/registry');
const nightPreferences = require('../services/night-preferences');

const SAMPLE_SOURCE = [
  '---',
  'book: demo-book',
  'label: 示例书',
  'title: 示例书 · CBT 视角',
  'intro: 一句话介绍',
  'sources:',
  '  - 著作｜《示例书》(2020)',
  '  - 论文｜示例综述 (2021)',
  'boundaries: 基于公开文献的知识段，不是诊疗方案。',
  '---',
  '',
  '# 示例书（源卡）',
  '',
  '正文段落。',
  '',
  builder.START_MARK,
  '核心框架：示例 cheatsheet。',
  builder.END_MARK,
  '',
  '结尾。',
  ''
].join('\n');

const SAMPLE_CARD = {
  label: '示例书',
  title: '示例书 · CBT 视角',
  intro: '一句话介绍',
  prompt: '核心框架：示例 cheatsheet。',
  starters: [],
  sources: ['著作｜《示例书》(2020)', '论文｜示例综述 (2021)'],
  boundaries: '基于公开文献的知识段，不是诊疗方案。'
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

test('parseFrontmatter reads scalars and source lists', () => {
  const meta = builder.parseFrontmatter(SAMPLE_SOURCE);
  assert.equal(meta.book, 'demo-book');
  assert.equal(meta.title, '示例书 · CBT 视角');
  assert.deepEqual(meta.sources, ['著作｜《示例书》(2020)', '论文｜示例综述 (2021)']);
  assert.equal(builder.parseFrontmatter('没有 frontmatter'), null);
});

test('extractInjectionBlock trims the block and rejects missing or duplicate markers', () => {
  assert.equal(builder.extractInjectionBlock(SAMPLE_SOURCE), '核心框架：示例 cheatsheet。');
  assert.equal(builder.extractInjectionBlock('没有标记'), null);
  const duplicated = SAMPLE_SOURCE + '\n' + builder.START_MARK + '\n再来一段\n' + builder.END_MARK + '\n';
  assert.equal(builder.extractInjectionBlock(duplicated), null);
});

test('parseBookCard validates required fields and returns a full card', () => {
  const ok = builder.parseBookCard(SAMPLE_SOURCE);
  assert.equal(ok.error, undefined);
  assert.equal(ok.id, 'demo-book');
  assert.equal(ok.card.title, '示例书 · CBT 视角');
  assert.equal(ok.card.prompt, '核心框架：示例 cheatsheet。');
  assert.deepEqual(ok.card.sources, ['著作｜《示例书》(2020)', '论文｜示例综述 (2021)']);

  const missingBoundaries = SAMPLE_SOURCE.replace('boundaries: 基于公开文献的知识段，不是诊疗方案。\n', '');
  assert.ok(builder.parseBookCard(missingBoundaries).error.indexOf('boundaries') !== -1);

  const missingSources = SAMPLE_SOURCE.replace('sources:\n  - 著作｜《示例书》(2020)\n  - 论文｜示例综述 (2021)\n', '');
  assert.ok(builder.parseBookCard(missingSources).error.indexOf('sources') !== -1);

  const badId = SAMPLE_SOURCE.replace('book: demo-book', 'book: Bad_ID');
  assert.ok(builder.parseBookCard(badId).error.indexOf('不合法') !== -1);

  const noBlock = SAMPLE_SOURCE.replace(builder.START_MARK + '\n核心框架：示例 cheatsheet。\n' + builder.END_MARK + '\n', '');
  assert.ok(builder.parseBookCard(noBlock).error.indexOf('NIGHTCAT-BOOK') !== -1);
});

test('run builds cards.js from source directory and skips plain notes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightcat-books-'));
  try {
    fs.writeFileSync(path.join(dir, 'demo-book.md'), SAMPLE_SOURCE, 'utf8');
    fs.writeFileSync(path.join(dir, 'README.md'), '# 说明（没有书卡元信息）', 'utf8');
    const outFile = path.join(dir, 'cards.js');
    const result = builder.run({ srcDir: dir, outFile });
    assert.equal(result.ok, true);
    assert.equal(Object.keys(result.cards).length, 1);
    assert.ok(result.warnings.some((line) => line.indexOf('README.md') !== -1));

    const generated = fs.readFileSync(outFile, 'utf8');
    assert.ok(generated.indexOf('自动生成') !== -1);
    const cards = require(outFile);
    assert.equal(cards['demo-book'].label, '示例书');
    assert.ok(cards['demo-book'].prompt.indexOf('示例 cheatsheet') !== -1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run refuses to write when any source card is malformed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightcat-books-'));
  try {
    fs.writeFileSync(path.join(dir, 'demo-book.md'), SAMPLE_SOURCE, 'utf8');
    fs.writeFileSync(path.join(dir, 'broken.md'), '---\nbook: broken\nlabel: 断卡\n---\n没有注入块', 'utf8');
    const outFile = path.join(dir, 'cards.js');
    const result = builder.run({ srcDir: dir, outFile });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.equal(fs.existsSync(outFile), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('night preferences expose an empty default book selection', () => {
  withStore({}, () => {
    assert.equal(nightPreferences.read().book, '');
  });
});

test('registry falls back to empty when no book is selected or the selection is unknown', () => {
  withStore({}, () => {
    assert.equal(registry.current(), '');
    assert.equal(registry.buildActivePrompt(), '');
    nightPreferences.save({ book: 'nobody' });
    assert.equal(registry.current(), '');
    nightPreferences.save({ book: '' });
    assert.equal(registry.buildActivePrompt(), '');
  });
});

test('selection resolves to the shipped card and builds the section', () => {
  withStore({}, () => {
    nightPreferences.save({ book: 'perlis-cbti' });
    assert.equal(registry.current(), 'perlis-cbti');
    const section = registry.buildActivePrompt();
    assert.ok(section.indexOf('逐次访谈指南') !== -1);
    assert.ok(section.indexOf('睡眠效率') !== -1);
  });
});

test('book section carries identity, precedence and disclaimer rules', () => {
  const section = registry.buildBookPrompt('demo-book', { 'demo-book': SAMPLE_CARD });
  assert.ok(section.indexOf('示例书 · CBT 视角') !== -1);
  assert.ok(section.indexOf('核心框架：示例 cheatsheet') !== -1);
  assert.ok(section.indexOf('夜喵') !== -1);
  assert.ok(section.indexOf('不假称原书原文') !== -1);
  assert.ok(section.indexOf('不得改变后面的对话规则') !== -1);
  assert.ok(section.indexOf('不构成任何医疗或治疗建议') !== -1);
  assert.equal(registry.buildBookPrompt('missing', { 'demo-book': SAMPLE_CARD }), '');
  assert.equal(registry.buildBookPrompt('', { 'demo-book': SAMPLE_CARD }), '');
});

test('book section carries dosage discipline so loaded cards stay companion-style', () => {
  const section = registry.buildBookPrompt('demo-book', { 'demo-book': SAMPLE_CARD });
  // 实测修复（2026-10-17）：满载时回复变薄、框架堆砌，包裹层带用量纪律。
  assert.ok(section.indexOf('用量纪律') !== -1);
  assert.ok(section.indexOf('一次回复最多一个可操作的小步骤') !== -1);
  assert.ok(section.indexOf('不罗列术语与全书框架') !== -1);
  assert.ok(section.indexOf('回复长度仍按后面的对话规则') !== -1);
  const rulesIndex = section.indexOf('书卡使用规则：');
  assert.ok(section.indexOf('用量纪律') > rulesIndex);
  assert.ok(section.indexOf('用量纪律') < section.indexOf('不假称原书原文'));
});

test('every shipped book card exposes the full contract', () => {
  const all = registry.list();
  assert.ok(all.length >= 1);
  all.forEach((card) => {
    assert.ok(card.name);
    assert.ok(card.label && card.title && card.intro);
    assert.ok(card.prompt && card.prompt.length > 0);
    assert.ok(card.boundaries);
    assert.ok(Array.isArray(card.starters));
    assert.ok(Array.isArray(card.sources) && card.sources.length > 0);
  });
});

test('perlis-cbti cheatsheet keeps the CBT-I core terms and safety lines', () => {
  const card = registry.list().find((item) => item.name === 'perlis-cbti');
  assert.ok(card, 'shipped cards.js 应包含 perlis-cbti');
  assert.ok(card.prompt.indexOf('睡眠效率') !== -1);
  assert.ok(card.prompt.indexOf('刺激控制') !== -1);
  assert.ok(card.prompt.indexOf('3P 模型') !== -1);
  assert.ok(card.prompt.indexOf('不诊断') !== -1);
  assert.ok(card.prompt.indexOf('建议寻求专业医生') !== -1);
});

test('book quotes must carry a source and reach the built card', () => {
  const withQuotes = SAMPLE_SOURCE.replace('sources:', 'quotes:\n  - 睡眠效率是核心指标｜《示例书》(2020)\nsources:');
  const ok = builder.parseBookCard(withQuotes);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.card.quotes, ['睡眠效率是核心指标｜《示例书》(2020)']);

  const badQuote = SAMPLE_SOURCE.replace('sources:', 'quotes:\n  - 缺出处的一条\nsources:');
  assert.ok(builder.parseBookCard(badQuote).error.indexOf('出处') !== -1);
});

test('book section renders sourced quotes with the paraphrase rule', () => {
  const section = registry.formatBookSection(Object.assign({}, SAMPLE_CARD, {
    quotes: ['先把卧床压缩到平均睡眠量｜《示例书》(2020)']
  }));
  assert.ok(section.indexOf('先把卧床压缩到平均睡眠量') !== -1);
  assert.ok(section.indexOf('（转述自：《示例书》(2020)）') !== -1);
  assert.ok(section.indexOf('不加引号、不写成原书原文') !== -1);

  const perlis = registry.list().find((item) => item.name === 'perlis-cbti');
  assert.ok(Array.isArray(perlis.quotes) && perlis.quotes.length >= 3);
  const shipped = registry.buildBookPrompt('perlis-cbti');
  assert.ok(shipped.indexOf('注明改编自本书') !== -1);
});

// —— 原句引用库（excerpts，2026-10-18 书卡 md 扩充）——

const VALID_EXCERPT = '睡眠效率 ＝ 总睡眠时间 ÷ 在床时间｜附录 1（中文版 p.147）【直读】';

test('excerpts must carry a source with a locator and the direct-read mark', () => {
  const ok = builder.parseBookCard(SAMPLE_SOURCE.replace('sources:', `excerpts:\n  - ${VALID_EXCERPT}\nsources:`));
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.card.excerpts, [VALID_EXCERPT]);

  // 缺出处分隔符
  assert.ok(builder.parseBookCard(SAMPLE_SOURCE.replace('sources:', 'excerpts:\n  - 只有一句原话\nsources:')).error.indexOf('excerpts') !== -1);
  // 出处没有页码/章节定位
  assert.ok(builder.parseBookCard(SAMPLE_SOURCE.replace('sources:', 'excerpts:\n  - 一句原话｜《示例书》【直读】\nsources:')).error.indexOf('excerpts') !== -1);
  // 没有【直读】标记：防编造原文
  assert.ok(builder.parseBookCard(SAMPLE_SOURCE.replace('sources:', 'excerpts:\n  - 一句原话｜《示例书》第 3 章\nsources:')).error.indexOf('excerpts') !== -1);
});

test('book section renders the excerpt library with the verbatim rules', () => {
  const section = registry.formatBookSection(Object.assign({}, SAMPLE_CARD, { excerpts: [VALID_EXCERPT] }));
  assert.ok(section.indexOf('原句引用库') !== -1);
  assert.ok(section.indexOf('「睡眠效率 ＝ 总睡眠时间 ÷ 在床时间」——附录 1（中文版 p.147）【直读】') !== -1);
  assert.ok(section.indexOf('逐字照抄，不改写、不拼凑') !== -1);
  assert.ok(section.indexOf('退回转述口吻') !== -1);
  // 引用规则：原句只可出自引用库
  assert.ok(section.indexOf('原句只可出自原句引用库') !== -1);

  const plain = registry.formatBookSection(SAMPLE_CARD);
  assert.equal(plain.indexOf('原句引用库（仅下列原句'), -1, '没有 excerpts 时不出引用库块');
});

// —— 环境背景（background，2026-10-18：Markdown 全文塞下）——

test('source card body is extracted as the background and injected into the section', () => {
  const ok = builder.parseBookCard(SAMPLE_SOURCE);
  assert.equal(ok.error, undefined);
  assert.ok(ok.card.background.indexOf('正文段落。') !== -1, 'frontmatter 与注入块之间的正文进背景');
  assert.equal(ok.card.background.indexOf('核心框架'), -1, '注入块正文不重复进背景');

  const withBackground = registry.formatBookSection(Object.assign({}, SAMPLE_CARD, { background: '## 2. 章节骨架\n第 4 章为逐次晤谈（pp. 34-104）。' }));
  assert.ok(withBackground.indexOf('书卡背景资料') !== -1);
  assert.ok(withBackground.indexOf('章节骨架') !== -1);

  const plain = registry.formatBookSection(SAMPLE_CARD);
  assert.equal(plain.indexOf('书卡背景资料'), -1, '没有 background 时不出背景块');
});

test('shipped cards carry the full markdown background', () => {
  const perlis = registry.list().find((item) => item.name === 'perlis-cbti');
  assert.ok(perlis.background && perlis.background.length > 3000, 'perlis 源卡正文（章节骨架与考证）完整进背景');
  assert.ok(perlis.background.indexOf('逐次晤谈') !== -1);
  const toads = registry.list().find((item) => item.name === 'counselling-for-toads');
  assert.ok(toads.background && toads.background.indexOf('自我状态') !== -1);
});

test('shipped cards ship verbatim excerpts from direct-read material only', () => {
  const all = registry.list();
  all.forEach((card) => {
    assert.ok(Array.isArray(card.excerpts), `excerpts 字段缺失：${card.name}`);
    card.excerpts.forEach((item) => {
      assert.ok(item.indexOf('【直读】') !== -1, `非直读条目混入原句库：${card.name} / ${item}`);
    });
  });
  const perlis = registry.list().find((item) => item.name === 'perlis-cbti');
  assert.ok(perlis.excerpts.length >= 5, 'perlis 直读材料充足，应至少 5 条原句');
  assert.ok(perlis.excerpts.some((item) => item.indexOf('p.147') !== -1), '附录 1 睡眠效率公式应在原句库');
  const toads = registry.list().find((item) => item.name === 'counselling-for-toads');
  assert.ok(toads.excerpts.length >= 2, '蛤蟆卡至少有开篇与末章两条原句');
});
