const storage = require('../../services/storage');
const { CARE_MESSAGES, WORLDS } = require('../../utils/constants');
const navigation = require('../../utils/navigation');
const { PHASES, createInitialState, transition } = require('../../utils/breath-machine');
const { getBreathView } = require('../../utils/breath-view');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    settings: storage.getSettings(),
    world: WORLDS[0],
    selectedPoint: { x: 50, y: 40 },
    phase: 'idle',
    prompt: '按住这里',
    subPrompt: '把呼吸带过来',
    cycles: 0,
    elapsed: '0:00',
    careMessage: CARE_MESSAGES[0],
    showCompletion: false,
    showCare: false,
    countdown: 0,
    phaseLabel: '',
    nav: getNavigationMetrics()
  },

  onLoad(options) {
    const selectedPoint = { x: Number(options.x) || 50, y: Number(options.y) || 40 };
    this.sessionId = `body-${Date.now()}`;
    this.machine = createInitialState({ targetCycles: 3, sessionId: this.sessionId });
    this.careIndex = 0;
    this.setData({ selectedPoint });
  },

  onShow() {
    const settings = storage.getSettings();
    this.setData({ nav: getNavigationMetrics(), settings, world: WORLDS.find((item) => item.id === settings.world) || WORLDS[0] });
  },

  onUnload() {
    clearTimeout(this.exhaleTimer);
    clearInterval(this.countdownTimer);
    this.persistSession();
  },

  onHide() {
    if ([PHASES.INHALE, PHASES.HOLD, PHASES.EXHALE].includes(this.machine.phase)) this.applyMachine(transition(this.machine, { type: 'INTERRUPT', now: Date.now() }));
    this.persistSession();
  },

  goBack() { navigation.backOrHome(); },

  holdStart() {
    if (this.data.showCompletion || ![PHASES.IDLE, PHASES.EXHALE].includes(this.data.phase)) return;
    this.applyMachine(transition(this.machine, { type: 'PRESS_START', now: Date.now(), inhaleMs: this.data.settings.inhaleSeconds * 1000 }));
  },

  holdEnd() {
    if (![PHASES.INHALE, PHASES.HOLD].includes(this.data.phase)) return;
    this.applyMachine(transition(this.machine, { type: 'PRESS_END', now: Date.now() }));
    if (this.machine.phase !== PHASES.EXHALE) return;
    this.careIndex = (this.careIndex + 1) % CARE_MESSAGES.length;
    this.setData({
      prompt: '呼——',
      subPrompt: '给这个地方多一点空间',
      careMessage: CARE_MESSAGES[this.careIndex],
      showCare: true
    });
  },
  holdCancel() {
    this.holdEnd();
  },

  applyMachine(result) {
    this.machine = result.state;
    const completed = this.machine.phase === PHASES.COMPLETED;
    const elapsed = this.formatElapsed(this.machine.durationMs);
    const view = getBreathView(this.machine, Date.now());
    const updates = { phase: this.machine.phase, cycles: this.machine.cycles, elapsed, countdown: view.countdown, phaseLabel: view.phaseLabel };
    if (this.machine.phase === PHASES.INHALE) Object.assign(updates, { prompt: '缓缓吸气', subPrompt: '感受腹部向外扩张', showCare: false });
    if (this.machine.phase === PHASES.HOLD) Object.assign(updates, { prompt: '停留', subPrompt: '让这一口气停留片刻', showCare: false });
    if (this.machine.phase === PHASES.HOLD && this.machine.readyToRelease) Object.assign(updates, { prompt: '准备好，就慢慢松开', subPrompt: '松开，开始呼气', showCare: false });
    if (this.machine.phase === PHASES.EXHALE) Object.assign(updates, { prompt: '呼气', subPrompt: '感受腹部慢慢回落', showCare: true });
    if (this.machine.phase === PHASES.IDLE) Object.assign(updates, { prompt: '按住这里', subPrompt: '把呼吸带过来', showCare: false });
    if (completed) Object.assign(updates, { prompt: '谢谢你，陪自己待了一会儿。', subPrompt: `${this.machine.cycles} 次呼吸 · ${elapsed}`, showCompletion: true, showCare: false });
    this.setData(updates);
    clearInterval(this.countdownTimer);
    if ([PHASES.INHALE, PHASES.HOLD, PHASES.EXHALE].includes(this.machine.phase)) this.countdownTimer = setInterval(() => this.refreshCountdown(), 200);
    result.effects.forEach((effect) => {
      if (effect.type === 'cancelExhale') clearTimeout(this.exhaleTimer);
      if (effect.type === 'cancelPhaseTimers') { clearTimeout(this.exhaleTimer); clearTimeout(this.inhaleTimer); clearTimeout(this.holdTimer); }
      if (effect.type === 'scheduleInhale') { clearTimeout(this.inhaleTimer); this.inhaleTimer = setTimeout(() => this.applyMachine(transition(this.machine, { type: 'INHALE_DUE', now: Date.now(), holdMs: this.data.settings.holdSeconds * 1000 })), effect.delayMs); }
      if (effect.type === 'scheduleNextInhale') this.inhaleTimer = setTimeout(() => this.applyMachine(transition(this.machine, { type: 'NEXT_INHALE', now: Date.now(), inhaleMs: this.data.settings.inhaleSeconds * 1000 })), effect.delayMs);
      if (effect.type === 'scheduleHold') this.holdTimer = setTimeout(() => this.applyMachine(transition(this.machine, { type: 'HOLD_DUE', now: Date.now(), exhaleMs: this.data.settings.exhaleSeconds * 1000 })), effect.delayMs);
      if (effect.type === 'phaseHaptic' && this.data.settings.hapticEnabled && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      if (effect.type === 'scheduleExhale') {
        clearTimeout(this.exhaleTimer);
        this.exhaleTimer = setTimeout(() => this.applyMachine(transition(this.machine, { type: 'EXHALE_DUE', now: Date.now() })), effect.delayMs);
      }
      if (effect.type === 'persist') this.persistSession();
    });
  },

  refreshCountdown() { const view = getBreathView(this.machine, Date.now()); this.setData({ countdown: view.countdown, phaseLabel: view.phaseLabel }); },

  formatElapsed(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  },

  persistSession(cycles) {
    const count = typeof cycles === 'number' ? cycles : this.machine.cycles;
    if (!count || this.machine.sessionStartedAt === null) return;
    storage.upsertSession({
      id: this.sessionId,
      startedAt: this.machine.sessionStartedAt,
      endedAt: Date.now(),
      cycles: count,
      world: this.data.settings.world,
      bodyPart: 'selectedPoint',
      bodyPartName: '身体',
      targetCycles: 3,
      durationMs: this.machine.durationMs,
      completed: this.machine.phase === PHASES.COMPLETED
    });
  },

  changePart() {
    wx.navigateBack({ delta: 1 });
  },

  stopBreathing() {
    this.applyMachine(transition(this.machine, { type: 'STOP', now: Date.now() }));
    this.setData({ showCompletion: true });
  },

  continueScan() {
    this.sessionId = `body-${Date.now()}`;
    this.machine = createInitialState({ targetCycles: 3, sessionId: this.sessionId });
    this.setData({ showCompletion: false, cycles: 0, elapsed: '0:00', phase: PHASES.IDLE, prompt: '按住这里', subPrompt: '把呼吸带过来' });
  },

  stopHere() {
    navigation.backOrHome();
  }
});
