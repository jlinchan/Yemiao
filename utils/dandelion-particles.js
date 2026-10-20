function createSeededRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createFilaments(count, random) {
  const rand = random || createSeededRandom(0x51ee9d);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const normalized = (index + 0.5) / count;
    const radius = Math.sqrt(normalized);
    const angle = index * goldenAngle + (rand() - 0.5) * 0.16;
    return {
      id: index,
      angle,
      radius,
      length: 0.76 + rand() * 0.29,
      tuft: 8 + Math.floor(rand() * 5),
      brightness: 0.48 + rand() * 0.45,
      layer: radius < 0.58 ? 0 : radius < 0.83 ? 1 : 2,
      bend: (rand() - 0.5) * 0.18,
      width: 0.38 + rand() * 0.34,
      warmth: rand(),
      crownSpread: 0.82 + rand() * 0.38,
      detachOrder: rand(),
      seed: rand() * Math.PI * 2
    };
  });
}

function createFlyingSeed(filament, centerX, centerY, radius, random) {
  const rand = random || Math.random;
  const homeX = centerX + Math.cos(filament.angle) * radius * filament.radius;
  const homeY = centerY + Math.sin(filament.angle) * radius * filament.radius;
  return {
    id: filament.id,
    x: homeX,
    y: homeY,
    homeX,
    homeY,
    vx: 16 + rand() * 24,
    vy: -8 - rand() * 16,
    rotation: filament.angle,
    rotationSpeed: (rand() - 0.5) * 1.4,
    scale: 0.72 + rand() * 0.5,
    opacity: filament.brightness,
    delay: 0.12 + filament.detachOrder * 0.63,
    seed: filament.seed,
    flutter: 0.7 + rand() * 1.4,
    lift: 10 + rand() * 18
  };
}

function updateFlyingSeed(seed, deltaSeconds, progress, timeSeconds) {
  if (progress <= seed.delay) return seed;
  const active = (progress - seed.delay) / Math.max(0.01, 1 - seed.delay);
  const wind = 20 + active * 54;
  const wave = Math.sin(timeSeconds * seed.flutter + seed.seed);
  seed.x += (seed.vx + wind + wave * 10) * deltaSeconds;
  seed.y += (seed.vy - seed.lift * active + Math.cos(timeSeconds * 1.7 + seed.seed) * 5) * deltaSeconds;
  seed.rotation += (seed.rotationSpeed + wave * 0.22) * deltaSeconds;
  seed.opacity = Math.max(0, seed.opacity * (1 - active * 0.038));
  return seed;
}

function activeDetachLimit(total, finalCycle) {
  return finalCycle ? Math.max(1, total - Math.max(4, Math.round(total * 0.05))) : Math.min(18, Math.max(12, Math.round(total * 0.15)));
}

module.exports = { createSeededRandom, createFilaments, createFlyingSeed, updateFlyingSeed, activeDetachLimit };
