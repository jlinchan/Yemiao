const FIREFLY_COUNT = 120;
const COLORS = ['#FFD76A', '#FFE7A1', '#D6F28B'];
const VW_PER_RPX = 100 / 750;

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createFireflies() {
  const rng = createRng(20261017);
  return Array.from({ length: FIREFLY_COUNT }, (_, index) => {
    const left = 6 + rng() * 88;
    const top = 12 + rng() * 76;
    // Most particles stay tiny; only a small number reach the previous 12rpx maximum.
    const size = 2.2 + Math.pow(rng(), 2.35) * 9.8;
    const brightness = rng();
    const minOpacity = 0.08 + brightness * 0.22;
    const maxOpacity = 0.45 + brightness * 0.55;
    const color = COLORS[index % COLORS.length];
    const duration = 5 + rng() * 6;
    const blink = 1.6 + rng() * 2.8;
    const delay = -(rng() * 8).toFixed(2);
    const clusterRadius = (6 + rng() * 64) * VW_PER_RPX;
    const clusterAngle = rng() * Math.PI * 2;
    const targetX = 50 + Math.cos(clusterAngle) * clusterRadius;
    const targetYOffset = Math.sin(clusterAngle) * clusterRadius;
    const deltaX = targetX - left;
    const deltaY = 49 - top;
    const gatherTransform = `translate(calc(${deltaX.toFixed(3)}vw),calc(${deltaY.toFixed(3)}vh + ${targetYOffset.toFixed(3)}vw)) scale(.84)`;
    const half = (size / 2).toFixed(1);
    return {
      id: index,
      anchorStyle: [
        `left:${left.toFixed(2)}%;`,
        `top:${top.toFixed(2)}%;`,
        `transition-delay:${(rng() * 0.35).toFixed(2)}s;`,
        `--gather-transform:${gatherTransform};`
      ].join(''),
      glowStyle: [
        `left:-${half}rpx;`,
        `top:-${half}rpx;`,
        `width:${size.toFixed(1)}rpx;`,
        `height:${size.toFixed(1)}rpx;`,
        `background:${color};`,
        `box-shadow:0 0 ${(6 + size * 1.6).toFixed(0)}rpx ${color},0 0 ${(14 + size * 2.4).toFixed(0)}rpx ${color};`,
        `--glow-min:${minOpacity.toFixed(2)};`,
        `--glow-max:${maxOpacity.toFixed(2)};`,
        `animation-duration:${duration.toFixed(2)}s,${blink.toFixed(2)}s;`,
        `animation-delay:${delay}s,${(delay * 0.7).toFixed(2)}s;`
      ].join('')
    };
  });
}

function buildTimingStyle(phase, running, inhaleMs, holdMs, exhaleMs) {
  const activePhase = running ? phase : 'idle';
  if (activePhase === 'inhale') {
    return `--gather-duration:${Math.max(1, inhaleMs)}ms;--scatter-duration:700ms;`;
  }
  if (activePhase === 'hold') {
    return `--gather-duration:${Math.max(650, holdMs)}ms;--scatter-duration:700ms;`;
  }
  if (activePhase === 'exhale') {
    return `--gather-duration:700ms;--scatter-duration:${Math.max(1, exhaleMs)}ms;`;
  }
  return '--gather-duration:700ms;--scatter-duration:700ms;';
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

  data: {
    fireflies: createFireflies(),
    scenePhase: 'idle',
    timingStyle: buildTimingStyle('idle', false, 4000, 7000, 8000)
  },

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
      this.setData({
        scenePhase: this.data.running ? this.data.phase : 'idle',
        timingStyle: buildTimingStyle(
          this.data.phase,
          this.data.running,
          this.data.inhaleMs,
          this.data.holdMs,
          this.data.exhaleMs
        )
      });
    }
  }
});
