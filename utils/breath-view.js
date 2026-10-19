const LABELS = { inhale: '缓缓吸气', hold: '停留', exhale: '呼气' };
const PROMPTS = { inhale: '感受腹部向外扩张', hold: '让这一口气停留片刻', exhale: '感受腹部慢慢回落' };
function getBreathView(state, now) {
  const phase = state && state.phase;
  const endsAt = phase === 'inhale' ? state.inhaleEndsAt : phase === 'hold' ? state.holdEndsAt : phase === 'exhale' ? state.exhaleEndsAt : null;
  const remaining = endsAt ? Math.max(0, endsAt - Number(now || Date.now())) : 0;
  return { countdown: Math.ceil(remaining / 1000), phaseLabel: LABELS[phase] || '', prompt: PROMPTS[phase] || '', progress: remaining };
}
module.exports = { getBreathView };
