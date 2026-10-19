const createdNodeIds = [];
const mutatedNodeIds = [];
await figma.loadFontAsync({ family: 'Noto Sans SC', style: 'Regular' });
await figma.loadFontAsync({ family: 'Noto Sans SC', style: 'Medium' });
const variables = await figma.variables.getLocalVariablesAsync();
const styles = await figma.getLocalTextStylesAsync();
const variable = (name) => variables.find((v) => v.name === name);
const track = (node) => { createdNodeIds.push(node.id); return node; };
const color = (value) => ({ r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255 });
function paint(name, opacity = 1) {
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity }, 'color', variable('color/' + name));
}
function fill(node, name, opacity = 1) { node.fills = [paint(name, opacity)]; }
function outline(node, name = 'border', opacity = 1) { node.strokes = [paint(name, opacity)]; node.strokeWeight = 1; }
function rounded(node, pill = false) { node.setBoundVariable('cornerRadius', variable(pill ? 'radius/pill' : 'radius/card')); }
function layout(name, direction = 'HORIZONTAL', width = 343, height = 48, component = false) {
  const node = track(component ? figma.createComponent() : figma.createAutoLayout(direction));
  node.name = name;
  node.layoutMode = direction;
  node.resize(width, height);
  node.primaryAxisSizingMode = 'FIXED';
  node.counterAxisSizingMode = 'FIXED';
  node.counterAxisAlignItems = 'CENTER';
  node.itemSpacing = 8;
  node.fills = [];
  return node;
}
function text(value, style = 'Body', width, tone = 'text') {
  const node = track(figma.createText());
  const textStyle = styles.find((s) => s.name === '夜喵/' + style);
  node.fontName = { family: 'Noto Sans SC', style: style === 'Title' || style === 'Practice' ? 'Medium' : 'Regular' };
  node.textStyleId = textStyle.id;
  node.characters = value;
  node.name = value.slice(0, 24);
  node.textAutoResize = 'WIDTH_AND_HEIGHT';
  node.letterSpacing = { unit: 'PIXELS', value: 0 };
  fill(node, tone);
  if (width !== undefined) { node.textAutoResize = 'HEIGHT'; node.resize(width, Math.max(node.height, 1)); }
  return node;
}
function icon(name, size = 24, tone = 'gold') {
  const node = track(figma.createNodeFromSvg(icons[name]));
  node.name = 'icon/' + name;
  node.resize(size, size);
  for (const child of node.findAll(() => true)) {
    createdNodeIds.push(child.id);
    if ('strokes' in child && child.strokes.length) child.strokes = [paint(tone)];
  }
  return node;
}
function instance(id, name) {
  const node = track(figma.getNodeById(id).createInstance());
  node.name = name;
  return node;
}
function setLabel(node, value) {
  const label = node.findOne((n) => n.type === 'TEXT' && n.name === 'Label');
  if (label) { label.characters = value; mutatedNodeIds.push(label.id); }
}
function screen(name, x, height = 812) {
  const node = track(figma.createFrame());
  node.name = name; node.resize(375, height); node.x = x; node.y = 80;
  node.clipsContent = true; fill(node, 'background');
  return node;
}
function placed(parent, node, x, y) { parent.appendChild(node); node.x = x; node.y = y; return node; }
function allIds(node) { return [node.id, ...(node.findAll ? node.findAll(() => true).map((n) => n.id) : [])]; }
