// 生成 Dify 知识库导入包（docs/dify-kb/）：把端内方法库（utils/agent-knowledge）
// 渲染成适合 RAG 分块检索的 Markdown。知识条目改动后重跑本脚本保持包同步：
//   node tools/build-dify-kb.js
// 与 build-books.js / build-experts.js 同一管线约定：源文件改动后必须重建。

'use strict';

const fs = require('fs');
const path = require('path');
const { ENTRIES } = require('../utils/agent-knowledge');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'dify-kb');
const OUT_FILE = path.join(OUT_DIR, '夜喵方法库-睡眠与情绪.md');

function renderEntry(entry) {
  return [
    `## ${entry.name}`,
    '',
    `**适用情境**：${entry.keys.join('、')}`,
    '',
    `**怎么做**：${entry.how}`,
    '',
    `**为什么有用**：${entry.why}`,
    ''
  ].join('\n');
}

function renderDocument() {
  return [
    '# 夜喵方法库：睡眠与情绪调节',
    '',
    '> 来源：Sleepwell「夜喵」项目人工精选方法库。只收录有出处、可操作、带数字的方法；',
    '> 每条 = 适用情境 + 具体做法（保留数字与时长）+ 一句原理。引用时按条引用，不要混在一起。',
    '',
    ENTRIES.map(renderEntry).join('\n---\n\n')
  ].join('\n');
}

function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const content = renderDocument();
  fs.writeFileSync(OUT_FILE, content, 'utf8');
  console.log(`已生成 ${OUT_FILE}（${ENTRIES.length} 条方法）`);
  return OUT_FILE;
}

if (require.main === module) {
  build();
}

module.exports = { build, renderDocument, OUT_FILE };
