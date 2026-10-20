// markdown-lite：夜喵气泡用的极简 Markdown → rich-text 节点转换器（零依赖，~4KB）。
// 只支持深夜陪伴场景需要的子集：分段、**加粗**、#### 小标题、有序/无序列表、> 引用。
// 安全模型：先 HTML 实体转义全部文本，再只生成白名单标签（p/strong/h4/ul/ol/li/blockquote），
// 模型输出里的 <script> 等一律以实体显示，不存在注入面。
// 样式必须内联：rich-text 内部不继承页面 wxss，节点样式由样式表注入（夜间主题）。
const STYLES = {
  p: 'margin:0 0 7px;font-size:15px;line-height:1.78;color:#dfe9e6;',
  strong: 'color:#f0d9a8;font-weight:600;',
  h4: 'margin:9px 0 5px;font-size:14px;font-weight:700;color:#e8c887;',
  li: 'margin:0 0 4px;font-size:15px;line-height:1.7;color:#dfe9e6;',
  quote: 'margin:4px 0 7px;padding:2px 0 2px 10px;border-left:2px solid rgba(232,200,135,.55);color:#c3d4cf;font-size:14px;line-height:1.7;'
};

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 行内解析：**加粗** → strong 节点；未闭合的 ** 按原文显示（流式中间态自然容错）。
function parseInline(escaped) {
  const nodes = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(escaped))) {
    if (m.index > last) nodes.push({ type: 'text', text: escaped.slice(last, m.index) });
    nodes.push({ name: 'strong', attrs: { style: STYLES.strong }, children: [{ type: 'text', text: m[1] }] });
    last = m.index + m[0].length;
  }
  if (last < escaped.length) nodes.push({ type: 'text', text: escaped.slice(last) });
  return nodes.length ? nodes : [{ type: 'text', text: escaped }];
}

function paragraph(line) {
  return { name: 'p', attrs: { style: STYLES.p }, children: parseInline(escapeHtml(line.trim())) };
}

function heading(line) {
  const text = line.replace(/^#{1,4}\s+/, '');
  return { name: 'h4', attrs: { style: STYLES.h4 }, children: parseInline(escapeHtml(text.trim())) };
}

function quote(lines) {
  return {
    name: 'blockquote',
    attrs: { style: STYLES.quote },
    children: lines.map((line) => ({ name: 'p', attrs: { style: 'margin:0 0 3px;' }, children: parseInline(escapeHtml(line.replace(/^>\s?/, '').trim())) }))
  };
}

function listItem(line) {
  return { name: 'li', attrs: { style: STYLES.li }, children: parseInline(escapeHtml(line.replace(/^\s*(?:[-•]|\d+[.、])\s+/, '').trim())) };
}

function isBullet(line) { return /^\s*[-•]\s+/.test(line); }
function isOrdered(line) { return /^\s*\d+[.、]\s+/.test(line); }
function isQuote(line) { return /^>\s?/.test(line); }
function isHeading(line) { return /^#{1,4}\s+\S/.test(line); }

// 主入口：Markdown 文本 → rich-text nodes 数组。空文本返回空数组（调用方回退纯文本渲染）。
function toNodes(text) {
  const source = String(text || '');
  if (!source.trim()) return [];
  const nodes = [];
  // 按「空行分隔的块」粗分，再逐块识别类型；列表/引用的连续行聚合成一个容器节点。
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim());
    if (!lines.length) continue;
    if (lines.length === 1 && isHeading(lines[0])) {
      nodes.push(heading(lines[0]));
      continue;
    }
    if (lines.every(isQuote)) {
      nodes.push(quote(lines));
      continue;
    }
    if (lines.every(isBullet)) {
      nodes.push({ name: 'ul', attrs: { style: 'margin:0 0 7px;padding-left:18px;' }, children: lines.map(listItem) });
      continue;
    }
    if (lines.every(isOrdered)) {
      nodes.push({ name: 'ol', attrs: { style: 'margin:0 0 7px;padding-left:20px;' }, children: lines.map(listItem) });
      continue;
    }
    for (const line of lines) nodes.push(paragraph(line));
  }
  return nodes;
}

module.exports = { toNodes, parseInline, escapeHtml, STYLES };
