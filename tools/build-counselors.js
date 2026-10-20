// 陪伴者卡构建脚本：读取 docs/counselors/*.md 源卡，提取元信息与注入版正文，
// 生成 data/counselor-cards.js 供小程序运行时加载。源卡格式对齐 docs/expert-team-plan.md
// 的专家卡流水线（女娲蒸馏法），标记换用 NIGHTCAT-COUNSELOR。
// 用法：node tools/build-counselors.js
const fs = require('fs');
const path = require('path');
// 解析逻辑与 build-experts 同源：frontmatter 解析直接复用，注入块标记不同。
const { parseFrontmatter } = require('./build-experts');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'counselors');
const OUT_FILE = path.join(ROOT, 'data', 'counselor-cards.js');
const START_MARK = '<!-- NIGHTCAT-COUNSELOR:START -->';
const END_MARK = '<!-- NIGHTCAT-COUNSELOR:END -->';
const PROMPT_WARN_LENGTH = 1500;

// 提取 START/END 标记之间的注入版正文；缺失或重复返回 null。
function extractInjectionBlock(text) {
  const source = String(text || '');
  const start = source.indexOf(START_MARK);
  const end = source.indexOf(END_MARK);
  if (start === -1 || end === -1 || end <= start) return null;
  if (source.indexOf(START_MARK, start + START_MARK.length) !== -1) return null;
  return source.slice(start + START_MARK.length, end).trim();
}

// 由源卡文本解析出 { id, card, warnings }；格式不合法返回 { error }。
function parseCounselorCard(text) {
  const meta = parseFrontmatter(text);
  if (!meta || typeof meta.counselor !== 'string' || !meta.counselor.trim()) {
    return { error: '缺少 frontmatter 或 counselor 字段' };
  }
  const id = meta.counselor.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return { error: `counselor 标识不合法：${id}` };
  const prompt = extractInjectionBlock(text);
  if (!prompt) return { error: '缺少或重复 NIGHTCAT-COUNSELOR 注入块' };
  const missing = ['label', 'intro', 'boundaries']
    .filter((key) => typeof meta[key] !== 'string' || !meta[key].trim());
  if (missing.length) return { error: `缺少必填字段：${missing.join('、')}` };
  const starters = Array.isArray(meta.starters) ? meta.starters.filter((item) => item && item.trim()) : [];
  const sources = Array.isArray(meta.sources) ? meta.sources.filter((item) => item && item.trim()) : [];
  if (!sources.length) return { error: '缺少 sources 来源清单（只认著作/论文/专业文献，条目格式「类型｜题名 (年份)」）' };
  const warnings = prompt.length > PROMPT_WARN_LENGTH
    ? [`注入版 ${prompt.length} 字，超过建议上限 ${PROMPT_WARN_LENGTH} 字`]
    : [];
  return {
    id,
    card: { label: meta.label, method: meta.method || '', intro: meta.intro, prompt, starters, sources, boundaries: meta.boundaries },
    warnings
  };
}

// 生成 data/counselor-cards.js 源码；按标识排序稳定输出，便于 diff。
function buildCardsModule(cards) {
  const entries = Object.keys(cards).sort().map((name) => {
    const json = JSON.stringify(cards[name]);
    return `  ${JSON.stringify(name)}: ${json}`;
  });
  return [
    '// 本文件由 tools/build-counselors.js 从 docs/counselors/*.md 自动生成，请勿手改。',
    '// 修改源卡后重新运行：node tools/build-counselors.js',
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
    if (!meta || !meta.counselor) { warnings.push(`跳过 ${file}：没有 counselor 元信息`); return; }
    const result = parseCounselorCard(text);
    if (result.error) { errors.push(`${file}：${result.error}`); return; }
    if (cards[result.id]) { errors.push(`${file}：counselor 标识重复（${result.id}）`); return; }
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
    console.log(`已生成 ${names.length} 张陪伴者卡（${names.join('、')}）→ data/counselor-cards.js`);
  }
}

module.exports = { parseFrontmatter, extractInjectionBlock, parseCounselorCard, buildCardsModule, run, START_MARK, END_MARK };
