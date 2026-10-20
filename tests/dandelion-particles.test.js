const test = require('node:test');
const assert = require('node:assert/strict');
const { createFilaments, createFlyingSeed, updateFlyingSeed, activeDetachLimit } = require('../utils/dandelion-particles');

test('creates a dense deterministic flower head', () => {
  const filaments = createFilaments(120, () => 0.5);
  assert.equal(filaments.length, 120);
  assert.equal(filaments.every((item) => item.tuft >= 8 && item.tuft <= 12), true);
  assert.equal(filaments.every((item) => item.radius > 0 && item.radius <= 1), true);
  assert.deepEqual(new Set(filaments.map((item) => item.layer)), new Set([0, 1, 2]));
});

test('creates and moves an individual flying seed', () => {
  const filament = createFilaments(1, () => 0.5)[0];
  const seed = createFlyingSeed(filament, 150, 180, 80, () => 0.5);
  const waiting = updateFlyingSeed(seed, 0.016, seed.delay - 0.01, 1);
  assert.equal(waiting.x, seed.x);
  const beforeX = seed.x;
  const beforeY = seed.y;
  const moving = updateFlyingSeed(seed, 0.5, 0.95, 2);
  assert.equal(moving.x > beforeX, true);
  assert.equal(moving.y < beforeY, true);
});

test('limits normal breaths and releases the full flower on the final cycle', () => {
  assert.equal(activeDetachLimit(120, false), 18);
  assert.equal(activeDetachLimit(120, true), 114);
  assert.equal(activeDetachLimit(60, false), 12);
});
