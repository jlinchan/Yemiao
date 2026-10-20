const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ENTRIES } = require('../utils/agent-knowledge');
const { build, renderDocument, OUT_FILE } = require('../tools/build-dify-kb');

test('generated dify kb pack stays in sync with agent-knowledge entries', () => {
  // 管线纪律：改了 ENTRIES 必须重跑 node tools/build-dify-kb.js，否则测试红。
  build();
  assert.ok(fs.existsSync(OUT_FILE), '导入包文件应存在');
  const content = fs.readFileSync(OUT_FILE, 'utf8');
  ENTRIES.forEach((entry) => {
    assert.ok(content.indexOf(`## ${entry.name}`) !== -1, `缺少条目标题：${entry.name}`);
    assert.ok(content.indexOf(entry.how.slice(0, 20)) !== -1, `缺少条目做法：${entry.name}`);
    assert.ok(content.indexOf(entry.why.slice(0, 15)) !== -1, `缺少条目原理：${entry.name}`);
  });
});

test('generated document is chunk-friendly: one heading per entry, no raw markers', () => {
  const content = renderDocument();
  const headings = content.split('\n').filter((line) => line.indexOf('## ') === 0);
  assert.equal(headings.length, ENTRIES.length);
  // 不能把 @@ 标记协议或 prompt 规则带进知识库（那些属于 prompt，不属于 KB）。
  assert.equal(content.indexOf('@@'), -1);
  assert.equal(content.indexOf('夜喵的知识库（真实方法'), -1);
});
