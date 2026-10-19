const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { fork } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const runtime = process.env.NIGHTCAT_NODE_MODULES
  ? createRequire(path.join(process.env.NIGHTCAT_NODE_MODULES, 'runtime.js'))
  : require;
const { chromium } = runtime('playwright');
const port = process.env.NIGHTCAT_PREVIEW_PORT || '4197';
const base = `http://127.0.0.1:${port}`;

async function main() {
  const server = fork(path.join(__dirname, 'nightcat-preview.js'), [], {
    env: { ...process.env, NIGHTCAT_PREVIEW_PORT: port },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview server exited: ${code}`)); });
      server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    browser = await chromium.launch({ headless: true, channel: process.env.TOPIC_BROWSER_CHANNEL || 'msedge' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output = path.join(root, 'docs/design/topic-layout');
    fs.mkdirSync(output, { recursive: true });
    for (const [width, height, status] of [[320, 568, 24], [375, 812, 44], [390, 844, 47], [430, 932, 59]]) {
      await page.setViewportSize({ width, height });
      for (const id of ['exam', 'thoughts', 'dorm']) {
        await page.goto(`${base}/topic?id=${id}`);
        await page.evaluate(status => {
          previewWx.getWindowInfo = () => ({ windowWidth: innerWidth, statusBarHeight: status });
          previewWx.getMenuButtonBoundingClientRect = () => ({ top: status + 8, bottom: status + 40, left: innerWidth - 96 });
          previewPage.onShow();
        }, status);
        const layout = await page.evaluate(() => {
          const rect = selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          };
          const scroll = document.querySelector('.topic-scroll');
          return {
            nav: rect('.topbar'), title: rect('.topic-title'), scroll: rect('.topic-scroll'),
            overflow: scroll.scrollWidth > scroll.clientWidth + 1,
            steps: document.querySelectorAll('.topic-step').length
          };
        });
        assert.ok(layout.title.top >= layout.nav.bottom + 16, `${id}: title overlaps navigation`);
        assert.ok(layout.scroll.top >= layout.nav.bottom, `${id}: scroll area overlaps navigation`);
        assert.ok(layout.scroll.bottom <= height + 1, `${id}: scroll area extends below viewport`);
        assert.equal(layout.overflow, false);
        assert.equal(layout.steps, 3);
        if (width === 390) await page.screenshot({ path: path.join(output, `${id}-390.png`) });
        await page.locator('.topic-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const footer = await page.locator('.cat-note').boundingBox();
        assert.ok(footer.y >= layout.scroll.top && footer.y + footer.height <= height - 34, `${id}: footer is clipped`);
        assert.equal((await page.locator('.topbar').boundingBox()).y, layout.nav.top);
        const back = await page.getByRole('button', { name: '返回', exact: true }).boundingBox();
        assert.ok(back.y >= status, `${id}: back button overlaps status bar`);
        await page.locator('.topic-cta').nth(0).click();
        assert.equal(await page.evaluate(() => lastNavigation.url), '/pages/breathe/index');
        await page.locator('.topic-cta').nth(1).click();
        assert.ok((await page.evaluate(() => lastNavigation.url)).startsWith('/pages/agent/index?prompt='));
        await page.getByRole('button', { name: '返回', exact: true }).click();
        assert.equal(await page.evaluate(() => lastNavigation.type), 'navigateBack');
        console.log(`PASS ${id} ${width}x${height}: title y=${layout.title.top.toFixed(1)}, scroll and navigation OK`);
      }
    }
    assert.deepEqual(errors, []);
    console.log(`12/12 topic checks passed. Screenshots: ${output}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
