const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const runtime = createRequire('C:/Users/16494/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.js');
async function main() {
  const browser = await runtime('playwright').chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const width of [375,390]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 844 });
      await page.goto('http://127.0.0.1:4181/record');
      await page.evaluate(() => {
        localStorage.setItem('sleepwell.sleep.v1', JSON.stringify([{ id: 'test', nightDate: '2026-08-01', bedTime: '22:00', wakeTime: '07:00', feeling: 4 }]));
        localStorage.setItem('sleepwell.journal.v1', JSON.stringify([{ id: 'journal-test', createdAt: Date.now(), date: '10 月 11 日', items: ['感谢今天完成实验。'.repeat(12)] }]));
        previewPage.setData({ year:2026,month:7 }); previewPage.refresh();
      });
      assert.equal(await page.locator('.day').count(),42);
      assert.equal(await page.evaluate(() => document.body.scrollWidth > innerWidth),false);
      assert.equal(await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)),true);
      await page.locator('.day--early').click();
      assert.match(await page.locator('.detail-sheet').innerText(),/上床 22:00 · 早睡/);
      await page.getByRole('button',{ name:'关闭详情',exact:true }).click();
      await page.locator('.record-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const box = await page.locator('.journal-summary').boundingBox();
      assert.ok(box.height <= 40.1);
      const note = await page.locator('.record-note').last().boundingBox();
      const nav = await page.locator('.record-nav').boundingBox();
      assert.ok(header.y + header.height <= filters.y + 1);
      assert.ok(filters.y + filters.height < empty.y);
      assert.ok(empty.y + empty.height < nav.y);
      assert.ok(nav.y + nav.height <= height + 1);
      await page.screenshot({ path: path.resolve(__dirname, '../docs/design/conversation-record-empty-' + width + '.png') });
      await page.getByRole('tab', { name: '未读 (0)', exact: true }).click();
      assert.equal(await page.locator('.empty-title').textContent(), '暂无未读会话');
      await page.getByRole('tab', { name: '已归档 (0)', exact: true }).click();
      assert.equal(await page.locator('.empty-title').textContent(), '暂无归档会话');
      await page.getByRole('button', { name: '搜索会话', exact: true }).click();
      await page.getByRole('textbox', { name: '搜索会话内容' }).fill('测试');
      assert.equal(await page.locator('.empty-title').textContent(), '没有找到相关会话');
      await page.getByRole('button', { name: '清空搜索' }).click();
      assert.equal(await page.locator('.empty-title').textContent(), '暂无归档会话');
      await page.getByRole('button', { name: '关闭搜索' }).click();
      await page.getByRole('button', { name: '首页', exact: true }).click();
      assert.equal(await page.evaluate(() => lastNavigation.url), '/pages/home/index');
      await page.getByRole('button', { name: '放松', exact: true }).click();
      assert.equal(await page.evaluate(() => lastNavigation.url), '/pages/breathe/index');
      console.log(width + 'px: empty state, zero counts, filters, search, icons, layout and navigation passed.');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
