// 安全门 · SOS-1K 本地校准工具（开发用，不进上传包，tools/ 已在 packOptions.ignore）。
//
// 用途：用 HongzhiQ/FineGrainedSuicideDetection（SOS-1K / SOS-HL-1K）的留出测试集
// 量化 utils/safety-gate.js 词表的真实召回与误报轮廓，为「宁滥勿缺」的词表取舍提供数字。
// README「验证状态」记录其输出。数据集仓库无 LICENSE，仅限本地研究使用：
// 校准结果（数字）可进 README，原始语料不进仓库、不进上传包。
//
// 用法：
//   git clone --depth 1 https://github.com/HongzhiQ/FineGrainedSuicideDetection .workbuddy/tmp/fgsd
//   node tools/safety-corpus-calibrate.js [数据目录]
// 默认数据目录：.workbuddy/tmp/fgsd/suicideDataProcessing/data（相对仓库根）。
//
// 说明：二分类标注里 label=1 为高自杀风险、0 为低风险；细粒度标注 0-10 级，
// 数值越大风险越紧迫。词表门的召回必须看 label=1；label=0 被命中属于「已知过度包含」，
// 只统计轮廓、逐条供人工复核，不作为失败。

const fs = require('node:fs');
const path = require('node:path');
const gate = require('../utils/safety-gate');

const dataDir = process.argv[2] || path.join('.workbuddy', 'tmp', 'fgsd', 'suicideDataProcessing', 'data');

function readTsv(file) {
  const full = path.join(dataDir, file);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim())
    .filter((line) => !line.startsWith('comment\t'))
    .map((line) => {
      const tabIndex = line.indexOf('\t');
      return { text: line.slice(0, tabIndex), label: line.slice(tabIndex + 1).trim() };
    });
}

function scanAll(rows) {
  return rows.map((row) => ({ row, result: gate.scan(row.text) }));
}

function reportBinary() {
  const rows = readTsv(path.join('binary', 'testdata_twoClass.tsv'));
  if (!rows) { console.log(`[binary] 数据缺失：${dataDir}/binary/testdata_twoClass.tsv 不存在，跳过`); return; }
  const scanned = scanAll(rows);
  const high = scanned.filter((item) => item.row.label === '1');
  const low = scanned.filter((item) => item.row.label === '0');
  const caught = high.filter((item) => item.result.level === 'critical');
  const missed = high.filter((item) => item.result.level !== 'critical');
  const lowFlagged = low.filter((item) => item.result.level !== 'normal');
  console.log('== SOS-1K 二分类留出集 ==');
  console.log(`样本：高危 ${high.length} 条 / 低危 ${low.length} 条`);
  console.log(`高危召回：${caught.length}/${high.length}（${high.length ? ((caught.length / high.length) * 100).toFixed(1) : '0.0'}%）`);
  if (missed.length) {
    console.log('高危漏报（必须逐条修词表）：');
    missed.slice(0, 20).forEach((item) => console.log(`  - ${item.row.text}`));
    if (missed.length > 20) console.log(`  ...共 ${missed.length} 条`);
  }
  console.log(`低危命中：${lowFlagged.length}/${low.length}（${low.length ? ((lowFlagged.length / low.length) * 100).toFixed(1) : '0.0'}%，宁滥勿缺原则下接受，抽样供人工复核）：`);
  lowFlagged.slice(0, 15).forEach((item) => {
    const terms = item.result.matched.map((m) => m.term).join(',');
    console.log(`  · ${item.row.text}  <= ${terms}`);
  });
  if (lowFlagged.length > 15) console.log(`  ...共 ${lowFlagged.length} 条`);
  console.log('');
}

function reportFineGrained() {
  const rows = readTsv(path.join('fine-grained', 'test_data.tsv'));
  if (!rows) { console.log(`[fine-grained] 数据缺失：${dataDir}/fine-grained/test_data.tsv 不存在，跳过`); return; }
  const scanned = scanAll(rows);
  const byLevel = new Map();
  scanned.forEach((item) => {
    const level = item.row.label;
    if (!byLevel.has(level)) byLevel.set(level, { total: 0, critical: 0, elevated: 0 });
    const bucket = byLevel.get(level);
    bucket.total += 1;
    if (item.result.level === 'critical') bucket.critical += 1;
    else if (item.result.level === 'elevated') bucket.elevated += 1;
  });
  console.log('== SOS-1K 细粒度留出集（0-10 级，越大越紧迫）==');
  console.log('级别\t样本\tcritical\t elevated');
  [...byLevel.keys()].sort((a, b) => Number(a) - Number(b)).forEach((level) => {
    const bucket = byLevel.get(level);
    console.log(`${level}\t${bucket.total}\t${bucket.critical}\t${bucket.elevated}`);
  });
  console.log('');
}

if (!fs.existsSync(dataDir)) {
  console.log(`未找到 SOS-1K 数据目录：${dataDir}`);
  console.log('请先执行：git clone --depth 1 https://github.com/HongzhiQ/FineGrainedSuicideDetection .workbuddy/tmp/fgsd');
  process.exit(0);
}

console.log(`安全门校准（数据目录：${dataDir}）\n`);
reportBinary();
reportFineGrained();
console.log('说明：本工具只读本地克隆的数据，不修改任何文件；原始语料不进仓库。');
