const storage = require('../services/storage');

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '时间未记录';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getRecordView(now = Date.now()) {
  const sessions = storage.getSessions();
  return {
    recentSessions: sessions.slice(0, 5).map((item) => ({
      id: item.id,
      cycles: Number(item.cycles) || 0,
      part: item.bodyPartName || '',
      time: formatTime(item.startedAt || item.endedAt)
    })),
    totalBreaths: sessions.reduce((sum, item) => sum + (Number(item.cycles) || 0), 0),
    sevenDay: storage.getSevenDaySummary(now, sessions)
  };
}

module.exports = { getRecordView };
