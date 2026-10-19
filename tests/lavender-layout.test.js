const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fitLavender, createLavenderLayers } = require('../pages/breathe/utils/lavender-layout');

test('photo covers portrait and landscape screens without letterboxing or distortion', () => {
  for (const [w, h] of [[320,568], [375,667], [390,844], [430,932], [768,1024], [844,390]]) {
    const values = Object.fromEntries(fitLavender(w,h).split(';').filter(Boolean).map(v => {
      const [key, value] = v.split(':');
      return [key, parseFloat(value)];
    }));
    assert.ok(values.left <= 1e-8 && values.top <= 1e-8);
    assert.ok(values.left + values.width >= w - 1e-8);
    assert.ok(values.top + values.height >= h - 1e-8);
    assert.ok(Math.abs(values.width / values.height - 864/1735) < 1e-8);
    assert.ok(Math.abs(values.left * 2 + values.width - w) < 1e-8);
    assert.ok(Math.abs(values.top * 2 + values.height - h) < 1e-8);
  }
  assert.ok(!/NaN|Infinity/.test(fitLavender(0, undefined)));
});

test('flower root stays registered to the same photo pixel at every screen size', () => {
  const layer = createLavenderLayers()[0];
  const percent = Object.fromEntries(layer.style.split(';').filter(Boolean).map(v => {
    const [key, value] = v.split(':');
    return [key, parseFloat(value) / 100];
  }));
  assert.ok(Math.abs(percent.left + percent.width / 2 - 465/864) < 1e-8);
  assert.ok(Math.abs(percent.top + percent.height / 2 - 1548/1735) < 1e-8);
});

test('twelve independent original flower layers and background assets exist', () => {
  const layers = createLavenderLayers();
  assert.equal(layers.length, 12);
  assert.equal(new Set(layers.map(v => v.id)).size, 12);
  for (const layer of layers) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', layer.src)));
    assert.ok(!/NaN|Infinity/.test(layer.style));
  }
  for (const name of ['background.jpg', 'original.jpg']) {
    assert.ok(fs.existsSync(path.join(__dirname, '../pages/breathe/assets/lavender', name)));
  }
});

test('all flower tracks loop at the identical angle without a reset jump', () => {
  const css = fs.readFileSync(path.join(__dirname, '../pages/breathe/components/lavender-scene/motion.wxss'), 'utf8');
  const starts = [...css.matchAll(/^\s+0\.0+%\s*\{\s*transform:\s*rotate\(([^)]+)\)/gm)].map(v => parseFloat(v[1]));
  const ends = [...css.matchAll(/^\s+100\.0+%\s*\{\s*transform:\s*rotate\(([^)]+)\)/gm)].map(v => parseFloat(v[1]));
  assert.equal(starts.length, 12);
  starts.forEach((angle, i) => assert.ok(Math.abs(angle - ends[i]) < 0.0001));
});

test('scene pauses on hide, resumes on show and falls back after a layer error', () => {
  const vm = require('node:vm');
  const { createRequire } = require('node:module');
  const filename = path.join(__dirname, '../pages/breathe/components/lavender-scene/index.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    Component(value) { definition = value; },
    wx: { getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }) }
  });
  const scene = {
    ...definition.methods,
    data: { ...definition.data },
    setData(value) { Object.assign(this.data, value); },
    createSelectorQuery() {
      return { select() { return this; }, boundingClientRect(cb) { this.cb = cb; return this; }, exec() { this.cb({width:390,height:844}); } };
    }
  };
  definition.lifetimes.ready.call(scene);
  assert.equal(scene.data.sceneStyle, fitLavender(390, 844));
  definition.pageLifetimes.hide.call(scene);
  assert.equal(scene.data.playing, false);
  definition.pageLifetimes.show.call(scene);
  assert.equal(scene.data.playing, true);
  scene.onSprigError();
  assert.equal(scene.data.backgroundFailed, true);
  definition.lifetimes.detached.call(scene);
  assert.equal(scene.mounted, false);
});
