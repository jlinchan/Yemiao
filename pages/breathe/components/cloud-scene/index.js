const { buildCloudStyles } = require('../../utils/cloud-breath');

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
    cloudOneStyle: '',
    cloudTwoStyle: '',
    cloudThreeStyle: ''
  },

  lifetimes: {
    attached() {
      this.syncStyles();
    }
  },

  observers: {
    'phase, running, inhaleMs, holdMs, exhaleMs'() {
      this.syncStyles();
    }
  },

  methods: {
    syncStyles() {
      const styles = buildCloudStyles(this.data.phase, this.data.running, {
        inhaleMs: this.data.inhaleMs,
        holdMs: this.data.holdMs,
        exhaleMs: this.data.exhaleMs
      });
      this.setData(styles);
    }
  }
});
