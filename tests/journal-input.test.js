const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(t, existing = []) {
  let page;
  const records = new Map([['sleepwell.journal.v1', existing]]);
  const toasts = [];
  const wx = {
    getStorageSync: (key) => records.get(key),
    setStorageSync: (key, value) => records.set(key, value),
    showToast: ({ title }) => toasts.push(title)
  };
  global.wx = wx;
  t.after(() => { delete global.wx; });
  const script = path.resolve(__dirname, '../pages/journal/index.js');
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name))
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (values) => {
    for (const [key, value] of Object.entries(values)) {
      const field = key.match(/^entries\[(\d+)\]\.text$/);
      if (field) page.data.entries[Number(field[1])].text = value;
      else page.data[key] = value;
    }
  };
  page.onLoad();
  const input = (index, value) => page.onInput({ currentTarget: { dataset: { index } }, detail: { value } });
  return { page, records, toasts, input };
}

test('journal input rows keep unique keys through typing, editing and clearing', (t) => {
  const { page, input } = harness(t);
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/journal/index.wxml'), 'utf8');
  const key = wxml.match(/wx:for="\{\{entries\}\}"\s+wx:key="([^"]+)"/)[1];
  const keys = () => page.data.entries.map((entry) => entry[key]);
  const originalKeys = keys();
  assert.equal(new Set(originalKeys).size, 3);
  assert.ok(originalKeys.every((value) => value !== undefined));
  for (let index = 0; index < 3; index += 1) {
    for (const text of ['x', 'xi', '\u8c22', '\u8c22\u8c22', '\u8c22\u8c22\n\u4eca\u5929', '']) {
      input(index, text);
      assert.equal(page.data.entries[index].text, text);
      assert.deepEqual(keys(), originalKeys);
    }
  }
  input(0, 'first');
  input(1, 'second');
  input(2, 'third');
  assert.deepEqual(Array.from(page.data.entries, (entry) => entry.text), ['first', 'second', 'third']);
});

test('saving keeps the stored diary format and clears text without changing input keys', (t) => {
  const previous = { id: 'previous', date: '10/16', items: ['earlier'] };
  const { page, input, records } = harness(t, [previous]);
  const ids = page.data.entries.map((entry) => entry.id);
  input(0, '  first  ');
  input(1, '   ');
  input(2, 'third\nline');
  page.saveJournal();
  const saved = records.get('sleepwell.journal.v1');
  assert.deepEqual(Array.from(saved[0].items), ['first', 'third\nline']);
  assert.equal(saved[1], previous);
  assert.deepEqual(Array.from(page.data.entries, (entry) => entry.text), ['', '', '']);
  assert.deepEqual(Array.from(page.data.entries, (entry) => entry.id), ids);
  assert.equal(page.data.saved, true);
  input(0, 'next');
  assert.equal(page.data.saved, false);
  assert.equal(saved[0].items[0], 'first');
});

test('blank journal input does not create a saved record', (t) => {
  const { page, input, records, toasts } = harness(t);
  input(1, ' \n ');
  page.saveJournal();
  assert.equal(records.get('sleepwell.journal.v1').length, 0);
  assert.equal(toasts.length, 1);
  assert.equal(page.data.saved, false);
});
