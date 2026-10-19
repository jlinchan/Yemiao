// 手绘语音图标自检：把 agent-icons.js 的 4 枚语音图标渲染成 PNG 预览。
// 用法：node tools/preview-voice-icons.js [输出.png]
const fs = require('fs');
const path = require('path');

const dependencyRoot = 'C:/Users/19237/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
function runtimeRequire(name) {
  const Module = require('module');
  return Module.createRequire(path.join(dependencyRoot, 'noop.js'))(name);
}

const icons = require('../utils/agent-icons');
const targets = [
  ['mic', icons.mic], ['micActive', icons.micActive],
  ['speakerOn', icons.speakerOn], ['speakerOff', icons.speakerOff], ['speakerActive', icons.speakerActive]
];

const cells = targets.map(([name, dataUri]) => `
  <div class="cell">
    <div class="row dark"><img src="${dataUri}" width="44" height="44"><img src="${dataUri}" width="30" height="30"></div>
    <div class="row light"><img src="${dataUri}" width="44" height="44"><img src="${dataUri}" width="30" height="30"></div>
    <div class="label">${name}</div>
  </div>`).join('');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { margin: 0; display: flex; gap: 18px; padding: 18px; background: #0b1614; font-family: sans-serif; }
  .cell { text-align: center; }
  .row { display: flex; gap: 10px; align-items: flex-end; justify-content: center; padding: 12px; border-radius: 10px; }
  .dark { background: #0e2220; }
  .light { background: #f2efe6; }
  .label { color: #9fb3ac; font-size: 12px; margin-top: 6px; }
</style></head><body>${cells}</body></html>`;

const outHtml = path.resolve(__dirname, 'voice-icons-preview.html');
fs.writeFileSync(outHtml, html);

(async () => {
  const { chromium } = runtimeRequire('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 760, height: 200 } });
  await page.goto('file://' + outHtml);
  await page.waitForTimeout(300);
  const out = process.argv[2] || path.resolve(__dirname, 'voice-icons-preview.png');
  await page.screenshot({ path: out });
  await browser.close();
  console.log('saved:', out);
})();
