const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeadline, remainingMs, fadeVolume } = require('../utils/sound-timer');

test('creates 15, 30 and 60 minute deadlines', () => {
  assert.equal(createDeadline(1000, 15), 901000);
  assert.equal(createDeadline(1000, 30), 1801000);
  assert.equal(createDeadline(1000, 60), 3601000);
  assert.equal(createDeadline(1000, 99), 1801000);
});

test('remaining time never becomes negative', () => {
  assert.equal(remainingMs(5000, 2000), 3000);
  assert.equal(remainingMs(1000, 2000), 0);
});

test('fade volume scales only inside the fade window', () => {
  assert.equal(fadeVolume(0.5, 6000, 5000), 0.5);
  assert.equal(fadeVolume(0.5, 2500, 5000), 0.25);
  assert.equal(fadeVolume(0.5, 0, 5000), 0);
});
