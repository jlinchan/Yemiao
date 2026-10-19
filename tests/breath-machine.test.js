const test = require('node:test');
const assert = require('node:assert/strict');
const { PHASES, createInitialState, transition } = require('../utils/breath-machine');
const step = (state, event) => transition(state, event);
function reachExhale(targetCycles) {
  let result = step(createInitialState({ targetCycles }), { type: 'PRESS_START', now: 0, inhaleMs: 4000 });
  result = step(result.state, { type: 'INHALE_DUE', now: 4000, holdMs: 7000 });
  return step(result.state, { type: 'HOLD_DUE', now: 11000, exhaleMs: 8000 });
}
test('early release completes the remaining inhale before hold', () => {
  let result = step(createInitialState({ targetCycles: 6 }), { type: 'PRESS_START', now: 0, inhaleMs: 4000 });
  result = step(result.state, { type: 'PRESS_END', now: 1200 });
  assert.equal(result.state.phase, PHASES.INHALE);
  assert.equal(result.state.inhaleEndsAt, 4000);
  result = step(result.state, { type: 'INHALE_DUE', now: 4000, holdMs: 7000 });
  assert.equal(result.state.phase, PHASES.HOLD);
  assert.equal(result.state.holdEndsAt, 11000);
});
test('four-second inhale and seven-second hold automatically start exhale', () => {
  const result = reachExhale(6);
  assert.equal(result.state.phase, PHASES.EXHALE);
  assert.equal(result.state.exhaleEndsAt, 19000);
});
test('releasing during hold does not change the phase', () => {
  let result = step(createInitialState({ targetCycles: 6 }), { type: 'PRESS_START', now: 0, inhaleMs: 4000 });
  result = step(result.state, { type: 'INHALE_DUE', now: 4000, holdMs: 7000 });
  result = step(result.state, { type: 'PRESS_END', now: 6000 });
  assert.equal(result.state.phase, PHASES.HOLD);
});
test('complete exhale schedules the next inhale after one second', () => {
  let result = reachExhale(6);
  result = step(result.state, { type: 'EXHALE_DUE', now: 19000 });
  assert.equal(result.state.cycles, 1);
  assert.deepEqual(result.effects.map((effect) => effect.type), ['persist', 'scheduleNextInhale']);
  result = step(result.state, { type: 'NEXT_INHALE', now: 20000, inhaleMs: 4000 });
  assert.equal(result.state.inhaleEndsAt, 24000);
});
test('early exhale timer never counts a cycle', () => {
  const result = step(reachExhale(6).state, { type: 'EXHALE_DUE', now: 18000 });
  assert.equal(result.state.cycles, 0);
  assert.deepEqual(result.effects, [{ type: 'scheduleExhale', delayMs: 1000 }]);
});
test('interrupt discards the incomplete cycle', () => {
  const result = step(reachExhale(3).state, { type: 'INTERRUPT', now: 12000 });
  assert.equal(result.state.phase, PHASES.IDLE);
  assert.equal(result.state.cycles, 0);
});
test('target completion does not schedule another inhale', () => {
  const result = step(reachExhale(1).state, { type: 'EXHALE_DUE', now: 19000 });
  assert.equal(result.state.phase, PHASES.COMPLETED);
  assert.equal(result.effects.some((effect) => effect.type === 'scheduleNextInhale'), false);
});
test('free breathing schedules another cycle', () => {
  const result = step(reachExhale(0).state, { type: 'EXHALE_DUE', now: 19000 });
  assert.equal(result.state.phase, PHASES.IDLE);
  assert.equal(result.effects.some((effect) => effect.type === 'scheduleNextInhale'), true);
});
test('stop preserves completed cycles and discards the current phase', () => {
  const state = Object.assign(reachExhale(6).state, { cycles: 2, durationMs: 38000 });
  const result = step(state, { type: 'STOP', now: 12000 });
  assert.equal(result.state.phase, PHASES.COMPLETED);
  assert.equal(result.state.cycles, 2);
  assert.equal(result.state.durationMs, 38000);
  assert.deepEqual(result.effects.map((effect) => effect.type), ['cancelPhaseTimers', 'persist']);
});
test('changing target completes an idle session that already meets it', () => {
  const state = Object.assign(createInitialState({ targetCycles: 10 }), { cycles: 4 });
  assert.equal(step(state, { type: 'SET_TARGET', targetCycles: 3 }).state.phase, PHASES.COMPLETED);
});
test('restart creates a clean state with the requested target', () => {
  const state = Object.assign(createInitialState({ targetCycles: 6 }), { phase: PHASES.COMPLETED, cycles: 6, durationMs: 60000 });
  const result = step(state, { type: 'RESTART', targetCycles: 3, sessionId: 'next' });
  assert.equal(result.state.phase, PHASES.IDLE);
  assert.equal(result.state.cycles, 0);
  assert.equal(result.state.targetCycles, 3);
});
