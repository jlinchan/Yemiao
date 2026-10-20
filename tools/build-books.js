// 书卡构建脚本：读取 docs/books/*.md 源卡，提取元信息与注入版正文（cheatsheet），
// 生成 books/cards.js 供小程序运行时加载。源卡格式见 docs/books/perlis-cbti.md。
// 用法：node tools/build-books.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'books');
const OUT_FILE = path.join(ROOT, 'books', 'cards.js');
const START_MARK = '<!-- NIGHTCAT-BOOK:START -->';
const END_MARK = '<!-- NIGHTCAT-BOOK:END -->';
const PROMPT_WARN_LENGTH = 1500;

function unquote(value) {
  const text = String(value).trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(text);
  return quoted ? quoted[2] : text;
}

// 解析源卡头部 frontmatter；仅支持 key: value 标量与「key: 换行 + - 列表」两种形态。
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''));
  if (!match) return null;
  const meta = {};
  let listKey = null;
  match[1].split(/\r?\n/).forEach((line) => {
    const item = /^\s*-\s+(.+)$/.exec(line);
    if (item && listKey) { meta[listKey].push(unquote(item[1])); return; }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) return;
    if (pair[2] === '') { meta[pair[1]] = []; listKey = pair[1]; }
    else { meta[pair[1]] = unquote(pair[2]); listKey = null; }
  });
  return meta;
}

// 提取 START/END 标记之间的注入版正文；缺失或重复返回 null。
function extractInjectionBlock(text) {
  const source = String(text || '');
  const start = source.indexOf(START_MARK);
  const end = source.indexOf(END_MARK);
  if (start === -1 || end === -1 || end <= start) return null;
  if (source.indexOf(START_MARK, start + START_MARK.length) !== -1) return null;
  return source.slice(start + START_MARK.length, end).trim();
}

// 环境背景（2026-10-18）：frontmatter 之后、注入块之前的源卡正文整段提取——
// 书目身份、章节骨架、考证与页码都在这里。用户要求"Markdown 完全塞下、至少要有环境背景"，
// 运行时把这段完整注入 system prompt，让模型能查到出处与背景，而不是只看蒸馏版。
function extractBackground(text) {
  const source = String(text || '');
  const fm = /^---\r?\n[\s\S]*?\r?\n---/.exec(source);
  const bodyStart = fm ? fm[0].length : 0;
  const start = source.indexOf(START_MARK);
  const body = start === -1 ? source.slice(bodyStart) : source.slice(bodyStart, start);
  return body.trim();
}

// 由源卡文本解析出 { id, card, warnings }；格式不合法返回 { error }。
function parseBookCard(text) {
  const meta = parseFrontmatter(text);
  if (!meta || typeof meta.book !== 'string' || !meta.book.trim()) {
    return { error: '缺少 frontmatter 或 book 字段' };
  }
  const id = meta.book.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return { error: `book 标识不合法：${id}` };
  const prompt = extractInjectionBlock(text);
  if (!prompt) return { error: '缺少或重复 NIGHTCAT-BOOK 注入块' };
  const missing = ['label', 'title', 'intro', 'boundaries']
    .filter((key) => typeof meta[key] !== 'string' || !meta[key].trim());
  if (missing.length) return { error: `缺少必填字段：${missing.join('、')}` };
  const starters = Array.isArray(meta.starters) ? meta.starters.filter((item) => item && item.trim()) : [];
  const sources = Array.isArray(meta.sources) ? meta.sources.filter((item) => item && item.trim()) : [];
  if (!sources.length) return { error: '缺少 sources 来源清单（条目格式「类型｜题名 (年份)」，未直读的条目标注【未直读】）' };
  const quotes = Array.isArray(meta.quotes) ? meta.quotes.filter((item) => item && item.trim()) : [];
  const badQuote = quotes.find((item) => {
    const parts = item.split('｜');
    return parts.length < 2 || !parts[0].trim() || !parts.slice(1).join('｜').trim();
  });
  if (badQuote) return { error: `quotes 条目缺少出处（格式「转述句｜出处」）：${badQuote}` };
  // 原句引用库（excerpts）：逐字引用的白名单，条目格式「原句｜出处」。
  // 出处必须同时带【直读】标记与页码/章节定位——没有落处的"原句"一律退回 quotes 转述，
  // 从管线层面杜绝编造原文（2026-10-18 扩充：书卡 md 支持原句引用能力）。
  const excerpts = Array.isArray(meta.excerpts) ? meta.excerpts.filter((item) => item && item.trim()) : [];
  const LOCATOR = /(p{1,2}\.\s*\d|第[0-9一二三四五六七八九十]{1,3}(章|次|节)|附录|开篇|末章|序言)/;
  const badExcerpt = excerpts.find((item) => {
    const index = item.indexOf('｜');
    if (index === -1 || !item.slice(0, index).trim()) return true;
    const source = item.slice(index + 1).trim();
    return !source || source.indexOf('【直读】') === -1 || !LOCATOR.test(source);
  });
  if (badExcerpt) return { error: `excerpts 条目须为「原句｜出处」，且出处带页码/章节定位与【直读】标记：${badExcerpt}` };
  const warnings = prompt.length > PROMPT_WARN_LENGTH
    ? [`注入版 ${prompt.length} 字，超过建议上限 ${PROMPT_WARN_LENGTH} 字`]
    : [];
  if (quotes.length > 8) warnings.push(`quotes ${quotes.length} 条，超过建议上限 8 条`);
  if (excerpts.length > 6) warnings.push(`excerpts ${excerpts.length} 条，超过建议上限 6 条`);
  const background = extractBackground(text);
  if (background.length > 16000) warnings.push(`背景正文 ${background.length} 字，超过建议上限 16000 字（模型上下文预算）`);
  // 管线级截断（2026-10-19 主包瘦身）：运行时 registry 只消费前 6000 字
  // （BACKGROUND_MAX_CHARS，按「\n## 」章节边界切），打包前先截，行为零变化、包体省 ~10KB。
  const BACKGROUND_MAX_CHARS = 6000;
  const trimmedBackground = (() => {
    if (background.length <= BACKGROUND_MAX_CHARS) return background;
    const cut = background.lastIndexOf('\n## ', BACKGROUND_MAX_CHARS);
    return `${background.slice(0, cut === -1 ? BACKGROUND_MAX_CHARS : cut).trimEnd()}\n\n……（背景过长仅保留前段；完整源卡见 docs/books/ 对应文件）`;
  })();
  return {
    id,
    card: { label: meta.label, title: meta.title, intro: meta.intro, prompt, starters, sources, quotes, excerpts, background: trimmedBackground, boundaries: meta.boundaries },
    warnings
  };
}

// 生成 books/cards.js 源码；按标识排序稳定输出，便于 diff。
function buildCardsModule(cards) {
  const entries = Object.keys(cards).sort().map((name) => {
    const json = JSON.stringify(cards[name], null, 2).replace(/\n/g, '\n  ');
    return `  ${JSON.stringify(name)}: ${json}`;
  });
  return [
    '// 本文件由 tools/build-books.js 从 docs/books/*.md 自动生成，请勿手改。',
    '// 修改源卡后重新运行：node tools/build-books.js',
    'module.exports = {',
    entries.join(',\n'),
    '};',
    ''
  ].join('\n');
}

// 构建：扫描全部源卡；任一源卡出错则整体不写出。
function run(options) {
  const opts = options || {};
  const srcDir = opts.srcDir || SRC_DIR;
  const outFile = opts.outFile || OUT_FILE;
  const cards = {};
  const warnings = [];
  const errors = [];
  const files = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter((name) => name.endsWith('.md')).sort()
    : [];
  files.forEach((file) => {
    const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const meta = parseFrontmatter(text);
    if (!meta || !meta.book) { warnings.push(`跳过 ${file}：没有 book 元信息`); return; }
    const result = parseBookCard(text);
    if (result.error) { errors.push(`${file}：${result.error}`); return; }
    if (cards[result.id]) { errors.push(`${file}：book 标识重复（${result.id}）`); return; }
    cards[result.id] = result.card;
    result.warnings.forEach((line) => warnings.push(`${file}：${line}`));
  });
  if (errors.length) return { ok: false, cards, warnings, errors };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buildCardsModule(cards), 'utf8');
  return { ok: true, cards, warnings, errors };
}

if (require.main === module) {
  const result = run();
  result.warnings.forEach((line) => console.warn(`[警告] ${line}`));
  if (!result.ok) {
    result.errors.forEach((line) => console.error(`[错误] ${line}`));
    process.exitCode = 1;
  } else {
    const names = Object.keys(result.cards);
    if (names.length) {
      console.log(`已生成 ${names.length} 张书卡（${names.join('、')}）→ books/cards.js`);
    } else {
      console.log('未发现书卡源卡（docs/books/*.md），已生成空的 books/cards.js');
      console.warn('[警告] books/cards.js 为空：夜喵将不注入任何书卡段。');
    }
  }
}

module.exports = { parseFrontmatter, extractInjectionBlock, parseBookCard, buildCardsModule, run, START_MARK, END_MARK };
