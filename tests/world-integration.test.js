const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SETTINGS_KEY = 'sleepwell.settings.v1';

function installWx(initialSettings) {
  const state = {
    settings: Object.assign({
      world: 'dandelion',
      rhythm: '478',
      inhaleSeconds: 4,
      holdSeconds: 7,
      exhaleSeconds: 8,
      targetCycles: 6,
      sound: 'breeze',
      soundEnabled: false,
      soundVolume: 0.42,
      soundTimerMinutes: 30,
      onboardingSeen: true,
      breathPatternVersion: 2,
      hapticEnabled: true,
      endSoundEnabled: false
    }, initialSettings || {}),
    routes: [],
    navigations: []
  };

  global.wx = {
    getStorageSync(key) {
      return key === SETTINGS_KEY ? state.settings : undefined;
    },
    setStorageSync(key, value) {
      if (key === SETTINGS_KEY) state.settings = value;
    },
    getWindowInfo() {
      return { windowWidth: 390, windowHeight: 844, statusBarHeight: 44, pixelRatio: 2 };
    },
    getMenuButtonBoundingClientRect() {
      return { left: 296, top: 51, bottom: 87 };
    },
    showShareMenu() {},
    reLaunch({ url }) {
      state.routes.push(url);
    },
    navigateTo({ url }) {
      state.navigations.push(url);
    }
  };
  global.getApp = () => ({ globalData: {} });
  return state;
}

function loadPage(relative) {
  let definition = null;
  global.Page = (config) => {
    definition = config;
  };
  const pagePath = require.resolve(path.join(root, relative));
  delete require.cache[pagePath];
  require(pagePath);
  const page = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(patch) {
      Object.assign(this.data, patch);
    }
  };
  Object.keys(definition).forEach((key) => {
    if (typeof definition[key] === 'function') page[key] = definition[key];
  });
  return page;
}

test('eight canonical worlds keep their original IDs and no direct page redirects', () => {
  const { WORLDS, IMMERSIVE_WORLD_IDS } = require('../utils/constants');
  assert.deepEqual(WORLDS.map((item) => item.id), [
    'dandelion',
    'mist',
    'moon',
    'water',
    'stardust',
    'firefly',
    'warmLight',
    'orb'
  ]);
  assert.deepEqual(WORLDS.map((item) => item.name), [
    '蒲公英',
    '月光涟漪',
    '薰衣草花海',
    '云',
    '星空海',
    '萤火虫',
    '鲸鱼',
    '呼吸光团'
  ]);
  assert.equal(WORLDS.length, 8);
  assert.equal(new Set(WORLDS.map((item) => item.id)).size, 8);
  assert.equal(WORLDS.every((item) => !item.page), true);
  assert.deepEqual(IMMERSIVE_WORLD_IDS, ['water', 'firefly', 'warmLight', 'orb']);
});

test('breathe owns all four scenes and keeps the shared prompts, settings and bottom navigation', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/breathe/index.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'pages/breathe/index.js'), 'utf8');
  const pageJson = require('../pages/breathe/index.json');
  const tabbarWxml = fs.readFileSync(path.join(root, 'components/night-tabbar/index.wxml'), 'utf8');
  const tabbarJs = fs.readFileSync(path.join(root, 'components/night-tabbar/index.js'), 'utf8');
  const tabbarCss = fs.readFileSync(path.join(root, 'components/night-tabbar/index.wxss'), 'utf8');
  for (const component of ['cloud-scene', 'firefly-scene', 'orb-scene', 'whale-scene']) {
    assert.match(wxml, new RegExp(`<${component}`));
    // 分包内组件必须用相对路径：绝对路径 /pages/breathe/components/... 会被开发者工具
    // 剥掉分包 root 后从项目根重拼（components/xxx/index），报 ENOENT（2026-10-17 实测）。
    assert.equal(pageJson.usingComponents[component], `./components/${component}/index`);
  }
  assert.match(js, /mainPrompt: '按住，慢慢吸气'/);
  assert.match(js, /subPrompt: '4秒后，跟随提示自然呼吸'/);
  assert.match(wxml, /场景切换/);
  assert.match(wxml, /呼吸节奏/);
  assert.match(wxml, /呼吸次数/);
  assert.match(wxml, /触觉反馈/);
  assert.match(wxml, /结束提示音/);
  assert.equal(pageJson.usingComponents['night-tabbar'], '/components/night-tabbar/index');
  assert.match(wxml, /<night-tabbar[\s\S]*active="relax"[\s\S]*variant="breathe"[\s\S]*accent="\{\{currentWorld\.accent\}\}"[\s\S]*trigger-active="\{\{true\}\}"[\s\S]*bind:active="openWorldPicker"/);
  assert.match(tabbarWxml, /item\.label/);
  assert.match(tabbarJs, /label: '首页'/);
  assert.match(tabbarJs, /label: '放松'/);
  assert.match(tabbarJs, /label: '记录'/);
  assert.match(tabbarJs, /home: '\/pages\/home\/index'/);
  assert.match(tabbarJs, /relax: '\/pages\/breathe\/index'/);
  assert.match(tabbarJs, /records: '\/pages\/record\/index'/);
  // 底栏只保留三个图标（首页/放松/记录），不再放夜喵入口（用户 2026-10-17 决策）
  assert.doesNotMatch(tabbarJs, /key: 'agent'|label: '夜喵'|agent: '\/pages\/agent\/index'/);
  assert.deepEqual([...tabbarJs.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]), ['home', 'relax', 'records']);
  // 呼吸页底栏主题化：透明悬浮 + 渐变压暗，随世界 accent 着色（Codex UI 对齐批次）
  assert.match(tabbarCss, /:host\s*\{[^}]*background:\s*transparent/s);
  assert.match(tabbarCss, /\.tabbar--breathe\s*\{[^}]*background:\s*linear-gradient/s);
  assert.match(tabbarCss, /\.tabbar-item\s*\{[^}]*background:\s*transparent/s);
  assert.match(tabbarCss, /\.tabbar-item::after\s*\{[^}]*border:\s*0/s);
  assert.doesNotMatch(wxml, /bindtap="exitMiniProgram"|exit-icon/);
  assert.match(wxml, /bindtap="openSettings"/);
  assert.match(wxml, /bindtap="openFocus"/);
  assert.doesNotMatch(wxml, /topbar-trailing/);
  assert.match(wxml, /class="breath-orb breath-orb--\{\{phase\}\}"/);
  assert.doesNotMatch(wxml, /wx:if="\{\{!isImmersiveWorld\}\}"[^>]*class="breath-orb/);
  assert.doesNotMatch(js, /redirectingWorld|currentWorld\.page/);
  assert.doesNotMatch(js, /reLaunch\(\{ url: `\$\{currentWorld\.page\}/);

  const settingLabels = Array.from(wxml.matchAll(/class="setting-label">([^<]+)</g), (match) => match[1]);
  assert.deepEqual(settingLabels, [
    '场景切换',
    '呼吸节奏',
    '呼吸次数',
    '声音',
    '触觉反馈',
    '结束提示音'
  ]);

  const completion = wxml.slice(wxml.indexOf('class="completion-mask '), wxml.indexOf('class="breath-stage"'));
  assert.match(completion, /次呼吸/);
  assert.match(completion, /可以停在这里/);
  assert.match(completion, /从信息流里回来一点点，已经足够/);
  assert.match(completion, /再呼吸一会儿/);
  assert.match(completion, /就到这里/);
  assert.doesNotMatch(completion, /现在感觉|松一点|差不多|还紧绷|看看身体/);
});

test('world selection updates the current scene in place without a second navigation', () => {
  const state = installWx({ world: 'dandelion' });
  const page = loadPage('pages/breathe/index.js');
  page.onLoad({ world: 'orb' });

  assert.equal(page.data.currentWorld.id, 'orb');
  assert.equal(page.data.isImmersiveWorld, true);
  assert.equal(state.settings.world, 'orb');
  assert.deepEqual(state.routes, []);

  page.setData({ showWorldPicker: true });
  page.chooseWorld({ currentTarget: { dataset: { world: 'water' } } });

  assert.equal(page.data.currentWorld.id, 'water');
  assert.equal(page.data.settings.world, 'water');
  assert.deepEqual(state.routes, []);

  const machineBeforeReselect = page.machine;
  page.setData({ showWorldPicker: true });
  page.chooseWorld({ currentTarget: { dataset: { world: 'water' } } });
  assert.equal(page.machine, machineBeforeReselect);
  assert.equal(page.data.showWorldPicker, false);

  for (const world of ['firefly', 'orb', 'warmLight', 'moon', 'dandelion', 'water']) {
    page.setData({ showWorldPicker: true });
    page.chooseWorld({ currentTarget: { dataset: { world } } });
    assert.equal(page.data.currentWorld.id, world);
    assert.equal(page.data.settings.world, world);
  }
  assert.equal(page.data.isImmersiveWorld, true);
  assert.deepEqual(state.routes, []);
});

test('the shared dandelion interaction and bottom navigation drive every selected scene', () => {
  const state = installWx({ world: 'firefly' });
  const page = loadPage('pages/breathe/index.js');
  page.onLoad();

  page.handlePressStart();
  assert.equal(page.data.phase, 'inhale');
  assert.equal(page.data.mainPrompt, '缓缓吸气');
  assert.equal(page.data.subPrompt, '感受腹部向外扩张');

  page.onRhythmChange({ detail: { value: 1 } });
  assert.equal(page.data.settings.rhythm, 'soothe');
  assert.equal(page.data.settings.holdSeconds, 0);
  page.onCycleChange({ detail: { value: 1 } });
  assert.equal(page.data.settings.targetCycles, 3);
  page.onToggleChange({ currentTarget: { dataset: { key: 'hapticEnabled' } }, detail: { value: false } });
  assert.equal(page.data.settings.hapticEnabled, false);
  page.handlePressEnd();
  page.clearTimers();

  page.goAgent();
  page.openRecords();
  // 2026-10-17 转场丝滑化：夜喵入口走 navigateTo（呼吸页实例保留），记录仍是 reLaunch。
  assert.deepEqual(state.navigations, ['/pages/agent/index']);
  assert.deepEqual(state.routes, ['/pages/record/index']);
});

test('all four new worlds expose exactly the same idle and inhale prompts', () => {
  const idle = [];
  const inhale = [];
  for (const world of ['water', 'firefly', 'orb', 'warmLight']) {
    installWx({ world });
    const page = loadPage('pages/breathe/index.js');
    page.onLoad();
    idle.push([page.data.mainPrompt, page.data.subPrompt]);
    page.handlePressStart();
    inhale.push([page.data.mainPrompt, page.data.subPrompt]);
    page.clearTimers();
  }

  assert.deepEqual(idle, Array(4).fill(['按住，慢慢吸气', '4秒后，跟随提示自然呼吸']));
  assert.deepEqual(inhale, Array(4).fill(['缓缓吸气', '感受腹部向外扩张']));
});

test('a reload restores the new scene from storage without a legacy route', () => {
  const state = installWx({ world: 'dandelion' });
  const first = loadPage('pages/breathe/index.js');
  first.onLoad();
  first.setData({ showWorldPicker: true });
  first.chooseWorld({ currentTarget: { dataset: { world: 'orb' } } });
  assert.equal(state.settings.world, 'orb');

  const reloaded = loadPage('pages/breathe/index.js');
  reloaded.onLoad();
  assert.equal(reloaded.data.currentWorld.id, 'orb');
  assert.equal(reloaded.data.isImmersiveWorld, true);
  assert.deepEqual(state.routes, []);
});

test('settings and the real focus-guide action stay on the shared page shell', () => {
  const state = installWx({ world: 'water' });
  const page = loadPage('pages/breathe/index.js');
  page.onLoad();

  page.openSettings();
  assert.equal(page.data.showSettings, true);
  page.openWorldPickerFromSettings();
  assert.equal(page.data.showSettings, false);
  assert.equal(page.data.showWorldPicker, true);
  page.closeWorldPicker();
  assert.equal(page.data.showWorldPicker, false);

  page.openFocus();
  assert.deepEqual(state.navigations, ['/pages/focus/index']);
});

test('retired standalone scene pages are unregistered and deleted', () => {
  const app = require('../app.json');
  for (const page of [
    'pages/cloud/index',
    'pages/breath-firefly/index',
    'pages/breath-orb/index',
    'pages/whale/index'
  ]) {
    assert.equal(app.pages.includes(page), false, page);
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(root, `${page}.${ext}`)), false, `${page}.${ext}`);
    }
  }
});

test('scene components contain visuals only, so common chrome cannot drift again', () => {
  const scenes = ['cloud-scene', 'firefly-scene', 'orb-scene', 'whale-scene'];
  for (const scene of scenes) {
    const wxml = fs.readFileSync(path.join(root, `pages/breathe/components/${scene}/index.wxml`), 'utf8');
    const js = fs.readFileSync(path.join(root, `pages/breathe/components/${scene}/index.js`), 'utf8');
    const wxss = fs.readFileSync(path.join(root, `pages/breathe/components/${scene}/index.wxss`), 'utf8');
    assert.doesNotMatch(wxml, /immersive-chrome/);
    assert.doesNotMatch(wxml, /breathing-copy/);
    assert.doesNotMatch(wxml, /bottom-nav|imm-bottom/);
    assert.doesNotMatch(wxml, /bindtap|catchtap|catchtouch/);
    assert.doesNotMatch(js, /createSession|updateSession|startSession|stopSession|setInterval|setTimeout/);
    assert.match(wxss, /pointer-events:\s*none/);
  }
});

test('firefly and orb have visible non-canvas scene renderers and the common action button stays visible', () => {
  const firefly = fs.readFileSync(path.join(root, 'pages/breathe/components/firefly-scene/index.wxml'), 'utf8');
  const fireflyJs = fs.readFileSync(path.join(root, 'pages/breathe/components/firefly-scene/index.js'), 'utf8');
  const fireflyCss = fs.readFileSync(path.join(root, 'pages/breathe/components/firefly-scene/index.wxss'), 'utf8');
  const orb = fs.readFileSync(path.join(root, 'pages/breathe/components/orb-scene/index.wxml'), 'utf8');
  const orbCss = fs.readFileSync(path.join(root, 'pages/breathe/components/orb-scene/index.wxss'), 'utf8');
  const breatheCss = fs.readFileSync(path.join(root, 'pages/breathe/index.wxss'), 'utf8');
  const breathe = fs.readFileSync(path.join(root, 'pages/breathe/index.wxml'), 'utf8');
  assert.match(firefly, /firefly-glow/);
  assert.match(firefly, /firefly-cluster-haze/);
  assert.match(firefly, /breath-firefly\/sky-bg\.jpg/);
  assert.match(fireflyJs, /FIREFLY_COUNT = 120/);
  assert.match(fireflyJs, /2\.2 \+ Math\.pow\(rng\(\), 2\.35\) \* 9\.8/);
  assert.match(fireflyJs, /--glow-min/);
  assert.match(fireflyJs, /--glow-max/);
  assert.match(fireflyJs, /--gather-transform/);
  assert.match(fireflyCss, /\.firefly-scene--inhale \.firefly-anchor/);
  assert.match(fireflyCss, /width:\s*176rpx/);
  assert.doesNotMatch(firefly, /<canvas/);
  assert.match(orb, /orb-source\.png/);
  assert.doesNotMatch(orb, /<canvas/);
  assert.match(orbCss, /width:\s*590rpx/);
  assert.match(breatheCss, /\.world-bg--water \.touch-ring[\s\S]*\.world-bg--firefly \.touch-ring[\s\S]*\.world-bg--warmLight \.touch-ring[\s\S]*\.world-bg--orb \.touch-ring/);
  assert.match(breathe, /class="breath-orb breath-orb--\{\{phase\}\}"/);
});

test('protected worlds still use their original scene implementations', () => {
  const breathe = fs.readFileSync(path.join(root, 'pages/breathe/index.wxml'), 'utf8');
  const worldVisual = fs.readFileSync(path.join(root, 'components/world-visual/index.wxml'), 'utf8');
  assert.match(breathe, /<lavender-scene>/);
  assert.match(breathe, /starfield-figma-a\.jpg/);
  assert.match(breathe, /world="mist"/);
  assert.match(worldVisual, /world === 'dandelion'/);
  assert.match(worldVisual, /world === 'mist'/);
});

test('public UI sits above every scene and retired page-only UI code is gone', () => {
  const css = fs.readFileSync(path.join(root, 'pages/breathe/index.wxss'), 'utf8');
  const wxml = fs.readFileSync(path.join(root, 'pages/breathe/index.wxml'), 'utf8');
  const worldVisual = fs.readFileSync(path.join(root, 'components/world-visual/index.wxml'), 'utf8');
  assert.match(css, /\.breathe-page\s*\{[^}]*isolation:\s*isolate/);
  assert.match(css, /\.prompt-block\s*\{[^}]*z-index:\s*45/s);
  assert.match(css, /\.breathe-page \.topbar\s*\{[^}]*z-index:\s*50/s);
  assert.match(css, /\.breathe-page \.bottom-nav\s*\{[^}]*z-index:\s*35/s);
  // 工具栏与底栏打磨（Codex UI 对齐批次）：设置图标光学居中、光团下移、世界主题底栏
  assert.match(css, /\.topbar-leading\s*\{\s*gap:\s*28rpx/);
  assert.match(css, /\.breath-orb\s*\{[^}]*top:\s*79%/s);
  assert.match(css, /\.breathing-tabbar\s*\{[^}]*background:\s*linear-gradient/s);
  for (const world of ['dandelion', 'mist', 'moon', 'water', 'stardust', 'firefly', 'warmLight', 'orb']) {
    assert.match(css, new RegExp(`\\.world-tabbar--${world}\\s*\\{`));
  }
  assert.match(css, /\.sliders-icon\s*\{[^}]*width:\s*40rpx[^}]*height:\s*40rpx/s);
  assert.match(css, /\.slider-line:nth-child\(1\)\s*\{\s*top:\s*10rpx/);
  assert.match(css, /\.slider-line:nth-child\(2\)\s*\{\s*top:\s*19rpx/);
  assert.match(css, /\.slider-line:nth-child\(3\)\s*\{\s*top:\s*28rpx/);
  // 呼吸世界设置行重构：标题绝对定位居中，触发器吸附行尾（Codex 呼吸设置批次）
  assert.match(wxml, /<view class="setting-row setting-row--world">/);
  assert.match(wxml, /<text class="setting-label">场景切换<\/text>/);
  assert.match(wxml, /class="setting-world-trigger"[\s\S]*bindtap="openWorldPickerFromSettings"/);
  assert.match(wxml, /class="setting-world-name">\{\{currentWorld\.name\}\}<\/text>[\s\S]*class="setting-world-arrow"/);
  assert.match(css, /\.setting-row--world\s*\{[^}]*position:\s*relative[^}]*display:\s*block[^}]*width:\s*100%/s);
  assert.match(css, /\.setting-row--world \.setting-label\s*\{[^}]*position:\s*absolute[^}]*left:\s*0;[^}]*transform:\s*translateY\(-50%\)/s);
  assert.match(css, /\.setting-world-trigger\s*\{[^}]*position:\s*absolute[^}]*right:\s*0[^}]*max-width:\s*32%/s);
  assert.match(css, /\.setting-world-trigger\s*\{[^}]*min-height:\s*88rpx/s);
  assert.doesNotMatch(css, /\.setting-world-trigger\s*\{[^}]*margin-left:\s*auto/s);
  for (const world of ['water', 'firefly', 'warmLight', 'orb']) {
    assert.match(css, new RegExp(`\\.breathe-page\\.world-bg--${world} \\.prompt-block \\.main-prompt`));
    assert.match(css, new RegExp(`\\.breathe-page\\.world-bg--${world} \\.prompt-block \\.phase-count`));
  }
  assert.doesNotMatch(worldVisual, /world === 'water'|world === 'firefly'|world === 'warmLight'|world === 'orb'/);

  for (const retired of [
    'components/immersive-chrome/index.js',
    'components/breathing-action-button/index.js',
    'components/breathing-copy/index.js',
    'utils/immersive-chrome-actions.js'
  ]) {
    assert.equal(fs.existsSync(path.join(root, retired)), false, retired);
  }
});
