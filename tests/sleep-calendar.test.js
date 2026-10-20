const test = require('node:test');
const assert = require('node:assert/strict');
const { category, nightDate, calendar, weekly, parseDate } = require('../utils/sleep-calendar');
test('bedtime boundaries and midnight attribution', () => {
  for (const [time, expected] of [['20:59','other'],['21:00','early'],['22:59','early'],['23:00','middle'],['00:00','middle'],['00:29','middle'],['00:30','late'],['04:59','late'],['05:00','other'],['25:00','unknown']]) assert.equal(category(time).state, expected);
  assert.equal(nightDate('2026-01-01','00:30'),'2025-12-31');
  assert.equal(nightDate('2026-01-01','21:00'),'2026-01-01');
  assert.equal(parseDate('2026-02-30'),null);
});
test('six row month starts Sunday and retains status beneath today and selection', () => {
  const rows = calendar(2026,7,[{ nightDate:'2026-08-01',bedTime:'22:00' }],'2026-08-01',new Date(2026,7,1));
  assert.equal(rows.length,6); assert.equal(rows[0].days[0].key,'2026-07-26');
  const day = rows[0].days[6]; assert.equal(day.state,'early'); assert.equal(day.today,true); assert.equal(day.selected,true);
});
test('weekly statistics use unique nights Monday through Sunday, excluding legacy labels', () => {
  const records = [{nightDate:'2026-10-05',bedTime:'22:00'},{nightDate:'2026-10-05',bedTime:'21:00'},{nightDate:'2026-10-11',bedTime:'00:30'},{nightDate:'2026-10-04',bedTime:'22:00'},{date:'10 月 6 日',bedTime:'22:00'}];
  assert.deepEqual(weekly(records,new Date(2026,9,11)),{early:1,total:2,difference:0});
});
