const PHASES = {
  IDLE: 'idle',
  INHALE: 'inhale',
  HOLD: 'hold',
  EXHALE: 'exhale',
  COMPLETED: 'completed'
};

const MIN_HOLD_MS = 300;

function createInitialState(config) {
  const options = config || {};
  return {
    phase: PHASES.IDLE,
    cycles: 0,
    targetCycles: Number(options.targetCycles) || 0,
    durationMs: 0,
    sessionId: options.sessionId || '',
    sessionStartedAt: null,
    inhaleStartedAt: null,
    pendingInhaleMs: 0,
    pendingExhaleMs: 0,
    inhaleEndsAt: null,
    holdEndsAt: null,
    exhaleEndsAt: null,
    completionNotified: false,
    releaseRequested: false
  };
}

function result(state, effects) {
  return { state, effects: effects || [] };
}

function completeIfNeeded(state, effects) {
  const shouldComplete = state.targetCycles > 0 && state.cycles >= state.targetCycles;
  if (!shouldComplete) return result(state, effects);
  const next = Object.assign({}, state, { phase: PHASES.COMPLETED });
  if (!next.completionNotified) {
    next.completionNotified = true;
    effects.push({ type: 'complete' });
  }
  return result(next, effects);
}

function transition(state, event) {
  if (!state || !event || !event.type) return result(state);
  const now = Number(event.now);

  if (event.type === 'RESTART') {
    return result(createInitialState({
      targetCycles: event.targetCycles,
      sessionId: event.sessionId
    }), [{ type: 'cancelExhale' }]);
  }

  if (event.type === 'SET_TARGET') {
    const next = Object.assign({}, state, { targetCycles: Number(event.targetCycles) || 0 });
    if (next.phase === PHASES.IDLE) return completeIfNeeded(next, []);
    return result(next);
  }

  if (event.type === 'INTERRUPT') {
    if (![PHASES.INHALE, PHASES.HOLD, PHASES.EXHALE].includes(state.phase)) return result(state);
    return result(Object.assign({}, state, {
      phase: PHASES.IDLE,
      inhaleStartedAt: null,
      pendingInhaleMs: 0,
      pendingExhaleMs: 0,
      inhaleEndsAt: null,
      holdEndsAt: null,
      exhaleEndsAt: null
    }), [{ type: 'cancelExhale' }]);
  }

  if (event.type === 'STOP') {
    if ([PHASES.IDLE, PHASES.COMPLETED].includes(state.phase)) return result(state);
    return result(Object.assign({}, state, {
      phase: PHASES.COMPLETED,
      inhaleStartedAt: null,
      pendingInhaleMs: 0,
      pendingExhaleMs: 0,
      inhaleEndsAt: null,
      holdEndsAt: null,
      exhaleEndsAt: null,
      releaseRequested: false
    }), [{ type: 'cancelPhaseTimers' }, { type: 'persist' }]);
  }

  if (event.type === 'NEXT_INHALE') {
    if (state.phase !== PHASES.IDLE || !Number.isFinite(now)) return result(state);
    const inhaleMs = Math.max(1, Number(event.inhaleMs) || 4000);
    return result(Object.assign({}, state, { phase: PHASES.INHALE, inhaleStartedAt: now, inhaleEndsAt: now + inhaleMs }), [{ type: 'scheduleInhale', delayMs: inhaleMs }]);
  }

  if (event.type === 'PRESS_START') {
    if (!Number.isFinite(now)) return result(state);
    if (state.phase !== PHASES.IDLE) return result(state);
    const inhaleMs = Math.max(1, Number.isFinite(Number(event.inhaleMs)) ? Number(event.inhaleMs) : 4000);
    return result(Object.assign({}, state, {
      phase: PHASES.INHALE,
      inhaleStartedAt: now,
      inhaleEndsAt: now + inhaleMs
    }), [{ type: 'scheduleInhale', delayMs: inhaleMs }]);
  }

  if (event.type === 'INHALE_DUE') {
    if (state.phase !== PHASES.INHALE || !Number.isFinite(now)) return result(state);
    if (now < state.inhaleEndsAt) return result(state, [{ type: 'scheduleInhale', delayMs: state.inhaleEndsAt - now }]);
    const holdMs = Math.max(0, Number.isFinite(Number(event.holdMs)) ? Number(event.holdMs) : 7000);
    const holdEndsAt = state.inhaleEndsAt + holdMs;
    return result(Object.assign({}, state, { phase: PHASES.HOLD, holdEndsAt, releaseRequested: false }), [{ type: 'scheduleHold', delayMs: Math.max(0, holdEndsAt - now) }, { type: 'phaseHaptic', phase: PHASES.HOLD }]);
  }

  if (event.type === 'HOLD_DUE') {
    if (state.phase !== PHASES.HOLD || !Number.isFinite(now)) return result(state);
    if (now < state.holdEndsAt) return result(state, [{ type: 'scheduleHold', delayMs: state.holdEndsAt - now }]);
    const exhaleMs = Math.max(1, Number(event.exhaleMs) || 8000);
    return result(Object.assign({}, state, {
      phase: PHASES.EXHALE,
      sessionStartedAt: state.sessionStartedAt === null ? state.inhaleStartedAt : state.sessionStartedAt,
      pendingInhaleMs: state.inhaleEndsAt - state.inhaleStartedAt,
      pendingExhaleMs: exhaleMs,
      inhaleEndsAt: null,
      holdEndsAt: null,
      exhaleEndsAt: now + exhaleMs
    }), [{ type: 'scheduleExhale', delayMs: exhaleMs }, { type: 'phaseHaptic', phase: PHASES.EXHALE }]);
  }

  if (event.type === 'PRESS_END') {
    if (state.phase !== PHASES.INHALE || !Number.isFinite(now)) return result(state);
    if (now < state.inhaleEndsAt) {
      return result(Object.assign({}, state, { releaseRequested: true }), [{ type: 'scheduleInhale', delayMs: state.inhaleEndsAt - now }]);
    }
    return result(state);
  }

  if (event.type === 'EXHALE_DUE') {
    if (state.phase !== PHASES.EXHALE || !Number.isFinite(now)) return result(state);
    if (now < state.exhaleEndsAt) {
      return result(state, [{ type: 'scheduleExhale', delayMs: state.exhaleEndsAt - now }]);
    }
    const next = Object.assign({}, state, {
      phase: PHASES.IDLE,
      cycles: state.cycles + 1,
      durationMs: state.durationMs + state.pendingInhaleMs + state.pendingExhaleMs,
      inhaleStartedAt: null,
      pendingInhaleMs: 0,
      pendingExhaleMs: 0,
      inhaleEndsAt: null,
      holdEndsAt: null,
      exhaleEndsAt: null
    });
    const finished = completeIfNeeded(next, [{ type: 'persist' }]);
    if (finished.state.phase === PHASES.IDLE) finished.effects.push({ type: 'scheduleNextInhale', delayMs: 1000 });
    return finished;
  }

  return result(state);
}

module.exports = {
  PHASES,
  MIN_HOLD_MS,
  createInitialState,
  transition
};
