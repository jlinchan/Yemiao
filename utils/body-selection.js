function isPointOnBody(x, y) {
  if (![x, y].every(Number.isFinite) || x < 0 || x > 100 || y < 0 || y > 100) return false;
  const distance = Math.abs(x - 50);
  if (y >= 4 && y < 18) return distance <= 11;
  if (y >= 18 && y < 28) return distance <= 20;
  if (y >= 28 && y < 55) return distance <= 25;
  if (y >= 55 && y < 68) return distance <= 16;
  if (y >= 68 && y <= 96) return (x >= 35 && x <= 48) || (x >= 52 && x <= 65);
  return false;
}

module.exports = { isPointOnBody };
