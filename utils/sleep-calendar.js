const pad = (value) => String(value).padStart(2, '0');
function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return dateKey(date) === key ? date : null;
}
function minutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}
function category(time) {
  const value = minutes(time);
  if (value === null) return { state: 'unknown', label: '时间未记录' };
  if (value >= 1260 && value < 1380) return { state: 'early', label: '早睡' };
  if (value >= 1380 || value < 30) return { state: 'middle', label: '稍晚' };
  if (value < 300) return { state: 'late', label: '晚睡' };
  return { state: 'other', label: '其他时段' };
}
function nightDate(calendarDate, time) {
  const date = parseDate(calendarDate);
  if (!date) return '';
  const value = minutes(time);
  if (value !== null && value < 300) date.setDate(date.getDate() - 1);
  return dateKey(date);
}
function recordMap(records) {
  const map = {};
  records.forEach((record) => {
    // Legacy month/day labels cannot establish a year. New records explicitly store the night.
    if (parseDate(record.nightDate) && !map[record.nightDate]) map[record.nightDate] = record;
  });
  return map;
}
function calendar(year, month, records, selected, now = new Date()) {
  const map = recordMap(records);
  const first = new Date(year, month, 1);
  const count = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7) * 7;
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(year, month, 1 - first.getDay() + index);
    const key = dateKey(date);
    const record = map[key];
    const status = record ? category(record.bedTime) : { state: 'empty', label: '未记录' };
    const item = { key, day: date.getDate(), outside: date.getMonth() !== month, today: key === dateKey(now), selected: key === selected, state: status.state, label: `${key}，${status.label}${record ? '，上床 ' + record.bedTime : ''}` };
    if (index % 7 === 0) rows.push({ key: String(index), days: [] });
    rows[rows.length - 1].days.push(item);
  }
  return rows;
}
function weekly(records, now = new Date()) {
  const map = recordMap(records);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  let early = 0; let previous = 0; let total = 0;
  for (let index = -7; index < 7; index += 1) {
    const record = map[dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index))];
    if (!record) continue;
    if (index >= 0) total += 1;
    if (category(record.bedTime).state === 'early') { if (index < 0) previous += 1; else early += 1; }
  }
  return { early, total, difference: early - previous };
}
module.exports = { dateKey, parseDate, category, nightDate, recordMap, calendar, weekly };
