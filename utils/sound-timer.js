const TIMER_OPTIONS = [15, 30, 60];

function normalizeMinutes(minutes) {
  const value = Number(minutes);
  return TIMER_OPTIONS.indexOf(value) >= 0 ? value : 30;
}

function createDeadline(now, minutes) {
  return Number(now) + normalizeMinutes(minutes) * 60 * 1000;
}

function remainingMs(deadline, now) {
  return Math.max(0, Number(deadline) - Number(now));
}

function fadeVolume(baseVolume, remaining, fadeWindowMs) {
  const base = Math.max(0, Math.min(1, Number(baseVolume) || 0));
  const windowMs = Math.max(1, Number(fadeWindowMs) || 5000);
  if (remaining >= windowMs) return base;
  return base * Math.max(0, remaining) / windowMs;
}

module.exports = { TIMER_OPTIONS, normalizeMinutes, createDeadline, remainingMs, fadeVolume };
