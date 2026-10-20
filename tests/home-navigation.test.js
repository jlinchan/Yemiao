const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function loadDefinition(relative, kind = 'Page') {
  let definition;
  const routes = [];
  const script = path.join(root, relative);
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    [kind]: (value) => { definition = value; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    // 2026-10-17 转场丝滑化：夜喵入口改 navigateTo（来源页实例保留，返回零重建）
    wx: {
      reLaunch: ({ url }) => routes.push(url),
      navigateTo: ({ url }) => routes.push(url)
    }
  });
  return { definition, routes };
}

test('homepage tabs reuse original relaxation and record pages', () => {
  const { definition, routes } = loadDefinition('components/night-tabbar/index.js', 'Component');
  // 底栏只有三个图标：首页/放松/记录（夜喵入口已撤掉，agent 改由首页与页头入口进入）
  // 注意 spread：definition 来自 vm 沙箱，数组原型与测试 realm 不同，需转回本 realm 再比对
  assert.deepEqual([...definition.data.items.map((item) => item.key)], ['home', 'relax', 'records']);
  const context = { data: { active: 'home' } };
  for (const key of ['relax', 'records', 'home']) {
    definition.methods.onTap.call(context, { currentTarget: { dataset: { key } } });
  }
  assert.deepEqual(routes, ['/pages/breathe/index', '/pages/record/index']);
});

test('breathe header nightcat entry opens the agent chat', () => {
  // 夜喵入口一律进 agent 对话页：呼吸页页头的小夜喵按钮（navigateTo，返回原地）；
  // 记录页页头导航已移除（统一用底栏 tabbar，见下个用例）。
  const { definition, routes } = loadDefinition('pages/breathe/index.js');
  definition.goAgent();
  assert.deepEqual(routes, ['/pages/agent/index']);
});

test('active relax tab emits a shortcut event without navigation', () => {
  const { definition, routes } = loadDefinition('components/night-tabbar/index.js', 'Component');
  const events = [];
  const context = {
    data: { active: 'relax', triggerActive: true },
    triggerEvent(name, detail) { events.push({ name, detail }); }
  };
  definition.methods.onTap.call(context, { currentTarget: { dataset: { key: 'relax' } } });
  assert.deepEqual(routes, []);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'active');
  assert.equal(events[0].detail.key, 'relax');
});

test('record page uses the shared homepage tabbar', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/record/index.wxml'), 'utf8');
  const json = require('../pages/record/index.json');
  assert.match(wxml, /<night-tabbar active="records"><\/night-tabbar>/);
  assert.doesNotMatch(wxml, /class="record-nav"/);
  assert.equal(json.usingComponents['night-tabbar'], '/components/night-tabbar/index');
});

test('manifest preserves original pages and adds only homepage subpages', () => {
  const app = require('../app.json');
  const pages = app.pages;
  assert.equal(pages[0], 'pages/home/index');
  assert.equal(pages.includes('pages/relax/index'), false);
  for (const name of ['agent', 'record', 'night-settings', 'body', 'settings', 'focus', 'sound', 'journal', 'sleep']) {
    assert.ok(pages.includes('pages/' + name + '/index'), name);
  }
  // breathe 呼吸世界已拆入分包 breathe-worlds（主包 2MB 红线），路由仍是 /pages/breathe/index
  assert.equal(pages.includes('pages/breathe/index'), false);
  const sub = (app.subPackages || []).find((pkg) => pkg.root === 'pages/breathe');
  assert.ok(sub, 'breathe subpackage');
  assert.ok(sub.pages.includes('index'));
  assert.ok(app.preloadRule && app.preloadRule['pages/home/index'].packages.includes('breathe-worlds'));
  assert.ok(app.plugins && app.plugins.WechatSI, 'WechatSI plugin declared');
  assert.ok(pages.includes('pages/body/part'));
  // 夜喵家族页面：skill-detail/topic 仍共享 styles/nightcat.wxss；
  // home/counselors/skills 在最新版改为自包含样式（类名各自独立，不再引用 cat-*）。
  for (const name of ['skill-detail', 'topic']) {
    assert.ok(pages.includes('pages/' + name + '/index'));
    assert.ok(fs.readFileSync(path.join(root, 'pages', name, 'index.wxss'), 'utf8').includes('@import "../../styles/nightcat.wxss";'));
  }
  for (const name of ['home', 'counselors', 'skills']) {
    assert.ok(pages.includes('pages/' + name + '/index'));
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'pages', name, 'index.wxss'), 'utf8'), /@import/);
  }
  const allPages = [...pages, ...(app.subPackages || []).flatMap((pkg) => pkg.pages.map((page) => pkg.root + '/' + page))];
  for (const page of allPages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(root, page + '.' + ext)), page + '.' + ext);
    }
  }
});

test('Nightcat styles are not injected into original pages globally', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app.wxss'), 'utf8'), /--cat-|\.cat-page/);
  const css = fs.readFileSync(path.join(root, 'styles/nightcat.wxss'), 'utf8');
  assert.doesNotMatch(css, /(?:^|\n)page\s*\{/);
  assert.match(css, /\.home-page,\s*\.cat-page\s*\{/);
});

test('all homepage content assets are present', () => {
  const content = require('../data/nightcat-content');
  const check = (value) => {
    if (typeof value === 'string' && value.startsWith('/assets/')) {
      assert.ok(fs.existsSync(path.join(root, value.slice(1))), value);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(check);
    }
  };
  check(content);
});
