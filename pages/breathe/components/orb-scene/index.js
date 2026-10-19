const { PHASES, getMotionState } = require('../../utils/breath-orb-machine');

function phaseDurationMs(phase, inhaleMs, holdMs, exhaleMs) {
  if (phase === PHASES.INHALE) return Math.max(1, inhaleMs);
  if (phase === PHASES.HOLD) return Math.max(650, holdMs);
  if (phase === PHASES.EXHALE) return Math.max(1, exhaleMs);
  return 900;
}

function buildScene(phase, running, inhaleMs, holdMs, exhaleMs) {
  const scenePhase = running ? phase : PHASES.IDLE;
  const motion = getMotionState(scenePhase, 1);
  const scale = Math.max(0.82, 1 - motion.gather * 0.13);
  const opacity = Math.max(0.72, Math.min(1, 0.72 + motion.brightness * 0.28));
  const duration = phaseDurationMs(scenePhase, inhaleMs, holdMs, exhaleMs);
  const rotationSeconds = Math.max(28, Math.min(82, (Math.PI * 2) / Math.max(0.01, motion.rotationSpeed)));
  return {
    scenePhase,
    orbStyle: `transform:scale(${scale.toFixed(4)});opacity:${opacity.toFixed(3)};transition:transform ${duration}ms cubic-bezier(.37,0,.63,1),opacity ${duration}ms ease;`,
    rotationStyle: `animation-duration:${rotationSeconds.toFixed(1)}s;`
  };
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    phase: { type: String, value: 'idle' },
    running: { type: Boolean, value: false },
    inhaleMs: { type: Number, value: 4000 },
    holdMs: { type: Number, value: 7000 },
    exhaleMs: { type: Number, value: 8000 }
  },

  data: Object.assign(
    { scenePhase: PHASES.IDLE },
    buildScene(PHASES.IDLE, false, 4000, 7000, 8000)
  ),

  lifetimes: {
    attached() {
      this.syncScene();
    }
  },

  observers: {
    'phase, running, inhaleMs, holdMs, exhaleMs'() {
      this.syncScene();
    }
  },

  methods: {
    syncScene() {
      this.setData(buildScene(
        this.data.phase,
        this.data.running,
        this.data.inhaleMs,
        this.data.holdMs,
        this.data.exhaleMs
      ));
    }
  }
});
