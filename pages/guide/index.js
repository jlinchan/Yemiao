// 入睡引导：全屏逐段展开的安静页面。
// 技能（bedtime_guide）与「+」面板都跳到这里，脚本段落按慢节奏逐段亮起；
// 想停就停，走完 / 停下都通过 Agent 端口留一笔，走完的会在对话里收到回执。
const storage = require('../../services/storage');
const agentPort = require('../../services/agent-port');
const { SCRIPTS } = require('../../utils/sleep-guide');
const agentIcons = require('../../utils/agent-icons');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

const FADE_MS = 460;
const CONTROLS_HOLD_MS = 5000;
const MIN_HOLD_MS = 9000;
const MAX_HOLD_MS = 13000;

// 每段停留：按句子长短微调，整体保持 9~13 秒的慢节奏。
function holdMs(text) {
  const length = (text || '').length;
  return Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, 6500 + length * 140));
}

Page({
  data: {
    nav: getNavigationMetrics(),
    icons: agentIcons,
    script: 'night',
    scriptIcon: agentIcons.guideNight,
    title: '',
    index: 0,
    total: 0,
    dots: [],
    text: '',
    fading: false,
    paused: false,
    ended: false,
    controlsVisible: false
  },

  onLoad(query) {
    const key = query && SCRIPTS[query.script] ? query.script : 'night';
    const script = SCRIPTS[key];
    this.segments = script.segments;
    this.remainingMs = 0;
    this.deadline = 0;
    this.pending = null;
    this.reported = false;
    this.setData({
      script: key,
      scriptIcon: key === 'body' ? agentIcons.guideBody : agentIcons.guideNight,
      title: script.title,
      total: this.segments.length,
      dots: this.segments.map((item, index) => index),
      index: 0,
      text: this.segments[0] || '',
      fading: false,
      paused: false,
      ended: false
    });
    this.scheduleHold();
    this.showControls();
  },

  // 没走完就离开的引导静默收场：先补一笔「中途停下」的记录，再清干净定时器。
  onUnload() {
    this.clearTimers();
    if (!this.reported && !this.data.ended) this.reportResult(false);
  },

  clearTimers() {
    if (this.advanceTimer) { clearTimeout(this.advanceTimer); this.advanceTimer = null; }
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null; }
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  },

  scheduleHold(waitMs) {
    if (this.advanceTimer) { clearTimeout(this.advanceTimer); this.advanceTimer = null; }
    const wait = waitMs > 0 ? waitMs : holdMs(this.data.text);
    this.deadline = Date.now() + wait;
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.advanceStep();
    }, wait);
  },

  // 到点翻到下一段；最后一段走完进入结束页。
  advanceStep() {
    if (this.data.ended || this.data.paused) return;
    const next = this.data.index + 1;
    if (next >= this.data.total) { this.finish(); return; }
    this.pending = { index: next, text: this.segments[next] };
    this.setData({ fading: true });
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      const step = this.pending || { index: this.data.index, text: this.data.text };
      this.pending = null;
      this.setData({ index: step.index, text: step.text, fading: false });
      this.scheduleHold();
    }, FADE_MS);
  },

  // 翻段中途按了暂停：先把下一段落下来，再停在安静的画面里。
  settlePending() {
    if (!this.pending) return;
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null; }
    const step = this.pending;
    this.pending = null;
    this.setData({ index: step.index, text: step.text, fading: false });
  },

  togglePause() {
    if (this.data.ended) return;
    if (this.data.paused) {
      this.setData({ paused: false });
      this.scheduleHold(this.remainingMs);
      this.remainingMs = 0;
      this.showControls();
      return;
    }
    this.settlePending();
    this.remainingMs = Math.max(1500, (this.deadline || 0) - Date.now());
    if (this.advanceTimer) { clearTimeout(this.advanceTimer); this.advanceTimer = null; }
    this.setData({ paused: true });
    this.showControls();
  },

  // 控制条：点一下出现，几秒后自己隐去；暂停时一直留着。
  showControls() {
    this.setData({ controlsVisible: true });
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (!this.data.paused && !this.data.ended) this.setData({ controlsVisible: false });
    }, CONTROLS_HOLD_MS);
  },

  onStageTap() {
    if (this.data.ended) return;
    if (this.data.controlsVisible && !this.data.paused) {
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setData({ controlsVisible: false });
      return;
    }
    this.showControls();
  },

  finish() {
    this.clearTimers();
    this.setData({ ended: true, paused: false, controlsVisible: false, fading: false });
    this.reportResult(true);
  },

  endSession() {
    if (!this.data.ended) this.reportResult(false);
    this.clearTimers();
    this.leave();
  },

  backToChat() { this.leave(); },

  leave() { navigation.backOrHome(); },

  // 给 Agent 端口留的回执：落一笔引导历史（近 7 天走完几次），再发事件。
  // 对话页只对「走完」补一句收尾；中途停下记进动态，不在对话里打扰。
  reportResult(completed) {
    if (this.reported) return;
    this.reported = true;
    const at = Date.now();
    try {
      const saved = storage.read(storage.KEYS.guideSessions, []);
      const list = Array.isArray(saved) ? saved : [];
      list.unshift({ id: `guide-${at}`, script: this.data.script, title: this.data.title, completed, at });
      storage.write(storage.KEYS.guideSessions, list.slice(0, agentPort.GUIDE_HISTORY_LIMIT));
    } catch (error) {
      // 历史落盘失败不挡离开
    }
    agentPort.publish('guide', completed ? 'guide_done' : 'guide_ended', { script: this.data.script, title: this.data.title });
  }
});
