const test = require('node:test');
const assert = require('node:assert/strict');
const { getBreathView } = require('../utils/breath-view');
test('returns agreed 4-7-8 labels and rounded countdowns', () => {
  assert.deepEqual(getBreathView({ phase: 'inhale', inhaleEndsAt: 5000 }, 1000), { countdown: 4, phaseLabel: '缓缓吸气', prompt: '感受腹部向外扩张', progress: 4000 });
  assert.equal(getBreathView({ phase: 'hold', holdEndsAt: 8000 }, 1500).countdown, 7);
  assert.equal(getBreathView({ phase: 'exhale', exhaleEndsAt: 9000 }, 1500).prompt, '感受腹部慢慢回落');
});
