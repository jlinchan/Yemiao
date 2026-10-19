// 上传包体估算：按 project.config.json 的 packOptions.ignore 规则统计实际打包体积。
// 用法：node tools/pack-budget.js [--top 30]
// 微信规则：主包与每个分包各自独立 ≤2MB（2,097,152 bytes）；
// 主包不可引用分包资源、分包可引用主包资源；按目录归属计包
// （app.json subPackages 的 root 目录整体计入该分包）。
// 规则语义对齐微信开发者工具：
// - folder：相对路径前缀（目录下全部文件排除）
// - file：精确相对路径
// - suffix：扩展名（如 .wav）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIMIT = 2 * 1024 * 1024;
const TOP = process.argv.indexOf('--top') !== -1 ? Number(process.argv[process.argv.indexOf('--top') + 1]) || 30 : 30;

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const rules = (cfg.packOptions && cfg.packOptions.ignore) || [];

// 分包表：root 目录下的文件计入对应分包
let subPackages = [];
try {
  subPackages = (JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).subPackages || [])
    .map((pkg) => ({ name: pkg.name || pkg.root, root: toPosixSlash(pkg.root) }));
} catch (error) {
  console.warn('警告：读取 app.json 分包配置失败，按无分包估算。', error.message);
}

function toPosixSlash(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function isIgnored(relPath) {
  const posix = toPosixSlash(relPath);
  return rules.some((rule) => {
    const value = toPosixSlash(rule.value);
    if (!value) return false;
    if (rule.type === 'folder') return posix === value || posix.indexOf(value + '/') === 0;
    if (rule.type === 'file') return posix === value;
    if (rule.type === 'suffix') return posix.endsWith(value);
    return false;
  });
}

// 工具默认不同步的目录（开发者工具不会打包 .git 等；workbuddy 工作目录手动排除）
const ALWAYS_SKIP = new Set(['.git', '.workbuddy', 'node_modules', 'miniprogram_npm', '.worktrees', 'ihcheck1', 'ihcheck2', 'ihcheck3', 'ihcheck4', 'ihcheck5', 'ihcheck6', 'ihcheck7', 'ihcheck8']);

const files = [];

function packageOf(relPath) {
  const posix = toPosixSlash(relPath);
  for (const pkg of subPackages) {
    if (posix === pkg.root || posix.indexOf(pkg.root + '/') === 0) return pkg.name;
  }
  return '主包';
}

function walk(dir, rel) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return;
  }
  entries.forEach((entry) => {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (ALWAYS_SKIP.has(entry.name) && !rel) return;
    if (entry.isDirectory()) {
      if (!isIgnored(childRel)) walk(path.join(dir, entry.name), childRel);
      return;
    }
    if (isIgnored(childRel)) return;
    const stat = fs.statSync(path.join(dir, entry.name));
    files.push({ rel: childRel, size: stat.size, pkg: packageOf(childRel) });
  });
}

walk(ROOT, '');

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

const byPkg = new Map();
files.forEach((item) => byPkg.set(item.pkg, (byPkg.get(item.pkg) || 0) + item.size));

console.log(`打包文件数：${files.length}`);
console.log('');

let allOk = true;
for (const [name, size] of byPkg) {
  const ok = size <= LIMIT;
  if (!ok) allOk = false;
  const margin = LIMIT - size;
  console.log(`${name}：${kb(size)}（${size} bytes） —— ${ok ? `✓ 在限内，余量 ${kb(margin)}` : `✗ 超出 ${kb(-margin)}`}`);
  if (!ok) {
    const need = Math.ceil(((-margin) / size) * 100);
    console.log(`  需再压缩约 ${need}% 才能达标`);
  }
}
console.log('');
console.log(allOk ? '总体结论：✓ 所有分包均在 2MB 限内' : '总体结论：✗ 存在超限分包');

console.log('\n— 最大文件 Top（按包标注）—');
files
  .slice()
  .sort((a, b) => b.size - a.size)
  .slice(0, TOP)
  .forEach((item) => console.log(`${kb(item.size).padStart(9)}  [${item.pkg}]  ${item.rel}`));

console.log('\n— 目录汇总（按包标注）—');
const byDir = new Map();
files.forEach((item) => {
  const parts = item.rel.split('/');
  const key = parts.length > 1 ? parts.slice(0, 2).join('/') : parts[0];
  byDir.set(key, (byDir.get(key) || 0) + item.size);
});
[...byDir.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([key, size]) => console.log(`${kb(size).padStart(9)}  ${key}`));

process.exitCode = allOk ? 0 : 1;
