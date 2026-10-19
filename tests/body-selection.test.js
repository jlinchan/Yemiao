const test = require('node:test');
const assert = require('node:assert/strict');
const { isPointOnBody } = require('../utils/body-selection');
test('accepts representative points on the silhouette', () => {
  [[50, 10], [50, 35], [50, 58], [43, 80], [57, 80]].forEach(([x, y]) => assert.equal(isPointOnBody(x, y), true));
});
test('rejects taps outside the silhouette', () => {
  [[5, 10], [90, 40], [50, 99], [-1, 50]].forEach(([x, y]) => assert.equal(isPointOnBody(x, y), false));
});
