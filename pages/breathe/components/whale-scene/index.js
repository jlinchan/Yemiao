const { buildSceneStyles } = require('../../utils/whale-breath-machine');

const BUBBLES = [
  { id: 'b01', left: 8, top: 56, size: 7, delay: -1.2, duration: 8.4, variant: 0 },
  { id: 'b02', left: 14, top: 73, size: 5, delay: -5.1, duration: 9.6, variant: 1 },
  { id: 'b03', left: 21, top: 61, size: 9, delay: -3.4, duration: 10.8, variant: 2 },
  { id: 'b04', left: 29, top: 83, size: 6, delay: -7.2, duration: 9.2, variant: 0 },
  { id: 'b05', left: 37, top: 69, size: 4, delay: -2.6, duration: 8.8, variant: 1 },
  { id: 'b06', left: 45, top: 88, size: 8, delay: -6.4, duration: 11.2, variant: 2 },
  { id: 'b07', left: 54, top: 64, size: 5, delay: -4.2, duration: 9.8, variant: 0 },
  { id: 'b08', left: 61, top: 79, size: 7, delay: -8.1, duration: 10.4, variant: 1 },
  { id: 'b09', left: 69, top: 59, size: 4, delay: -3.1, duration: 8.6, variant: 2 },
  { id: 'b10', left: 76, top: 86, size: 9, delay: -5.8, duration: 11.6, variant: 0 },
  { id: 'b11', left: 83, top: 68, size: 6, delay: -1.9, duration: 9.4, variant: 1 },
  { id: 'b12', left: 90, top: 77, size: 5, delay: -6.9, duration: 10.2, variant: 2 },
  { id: 'b13', left: 11, top: 91, size: 4, delay: -4.7, duration: 9.1, variant: 1 },
  { id: 'b14', left: 33, top: 52, size: 6, delay: -8.6, duration: 11.4, variant: 2 },
  { id: 'b15', left: 64, top: 94, size: 5, delay: -2.3, duration: 8.3, variant: 0 },
  { id: 'b16', left: 86, top: 54, size: 7, delay: -7.7, duration: 10.9, variant: 1 }
];

const RIPPLES = [
  { id: 'r01', width: 390, height: 72, delay: -0.2 },
  { id: 'r02', width: 520, height: 94, delay: -1.1 },
  { id: 'r03', width: 660, height: 118, delay: -2.0 },
  { id: 'r04', width: 790, height: 142, delay: -2.9 }
];

const BEAMS = [
  { id: 'l01', left: 8, width: 18, rotate: -9, duration: 8.6, delay: -2.2 },
  { id: 'l02', left: 34, width: 13, rotate: 2, duration: 7.4, delay: -4.1 },
  { id: 'l03', left: 67, width: 20, rotate: 11, duration: 9.3, delay: -1.4 }
];

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
    scenePhase: 'idle',
    scene: {
      photoStyle: '',
      raysStyle: '',
      rippleStyle: '',
      bubbleStyle: ''
    },
    bubbles: BUBBLES,
    ripples: RIPPLES,
    beams: BEAMS
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
      const scenePhase = this.data.running ? this.data.phase : 'idle';
      this.setData({
        scenePhase,
        scene: buildSceneStyles(scenePhase, {
          idle: 900,
          inhale: this.data.inhaleMs,
          hold: this.data.holdMs,
          exhale: this.data.exhaleMs
        })
      });
    }
  }
});
