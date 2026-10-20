const test = require('node:test');
const assert = require('node:assert/strict');
const { toNodes, parseInline, escapeHtml } = require('../utils/markdown-lite');

test('plain text becomes a single styled paragraph', () => {
  const nodes = toNodes('我在的，慢慢说。');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, 'p');
  assert.equal(nodes[0].children[0].text, '我在的，慢慢说。');
});

test('bold segments become strong nodes with inline theme style', () => {
  const nodes = toNodes('试试**4-7-8 呼吸法**，很有效。');
  const p = nodes[0];
  const strong = p.children.find((child) => child.name === 'strong');
  assert.ok(strong, '加粗段生成 strong 节点');
  assert.equal(strong.children[0].text, '4-7-8 呼吸法');
  assert.ok(strong.attrs.style.indexOf('#f0d9a8') !== -1, 'strong 带金色内联样式');
});

test('unclosed bold marker falls back to literal text (streaming-safe)', () => {
  const nodes = toNodes('试试**4-7-8 呼吸');
  const joined = JSON.stringify(nodes);
  assert.ok(joined.indexOf('4-7-8 呼吸') !== -1, '内容不丢');
  assert.ok(!JSON.parse(joined === undefined ? '{}' : JSON.stringify(nodes)).toString || true);
  assert.equal(nodes[0].children.find((child) => child.name === 'strong'), undefined, '未闭合不生成 strong');
});

test('bullets become ul with li children, ordered list becomes ol', () => {
  const ul = toNodes('- 吸气 4 秒\n- 屏息 7 秒')[0];
  assert.equal(ul.name, 'ul');
  assert.equal(ul.children.length, 2);
  assert.equal(ul.children[0].name, 'li');
  assert.ok(ul.children[0].children[0].text.indexOf('吸气 4 秒') !== -1);
  const ol = toNodes('1. 第一步\n2. 第二步')[0];
  assert.equal(ol.name, 'ol');
  assert.equal(ol.children.length, 2);
});

test('quotes become blockquote and headings become h4', () => {
  const q = toNodes('> 「如果我不相信每个人都有能力变得更好。」')[0];
  assert.equal(q.name, 'blockquote');
  const h = toNodes('#### 睡前小练习')[0];
  assert.equal(h.name, 'h4');
  assert.equal(h.children[0].text, '睡前小练习');
});

test('html injection is escaped before markdown parsing', () => {
  const nodes = toNodes('<script>alert(1)</script>**加粗**');
  const joined = JSON.stringify(nodes);
  assert.ok(joined.indexOf('<script>') === -1, '尖括号被实体转义');
  assert.ok(joined.indexOf('&lt;script&gt;') !== -1, '以实体显示');
});

test('empty or whitespace text returns empty nodes array', () => {
  assert.deepEqual(toNodes(''), []);
  assert.deepEqual(toNodes('   \n  '), []);
});
