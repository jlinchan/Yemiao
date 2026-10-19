// 设置 → 夜喵人格的实时桥梁：每次发送都重新读取偏好，改设置立即生效。
const prefs = require('../services/night-preferences');

const PERSONALITY_TONES = {
  温柔陪伴: '语气更柔软缓慢，多安抚与陪伴感。',
  安静倾听: '更少说教，多倾听与追问，不主动给建议，除非用户索要。',
  鼓励提醒: '在共情之后适度给出鼓励和行动提醒。',
  简洁高效: '回复尽量短，直接回应核心，不铺陈。'
};

// 注入 system prompt 的人格段。
function buildPersonaPrompt() {
  const p = prefs.read();
  const lines = ['用户个性化设置（实时生效，优先于默认风格）：'];
  if (PERSONALITY_TONES[p.personality]) lines.push(`- 夜喵性格「${p.personality}」：${PERSONALITY_TONES[p.personality]}`);
  if (p.companion) lines.push(`- 用户喜欢的陪伴方式：${p.companion}。`);
  if (p.fontSize === '大') lines.push('- 用户偏好大字号界面，回复可稍短以便阅读。');
  return lines.length > 1 ? lines.join('\n') : '';
}

// 注入上下文的用户近况段（困扰与作息）。
function buildPersonaContext(now) {
  const p = prefs.read();
  const lines = [];
  if (Array.isArray(p.concerns) && p.concerns.length) {
    lines.push(`用户勾选的常见睡前困扰：${p.concerns.join('、')}。聊到相关话题时可自然回应，不要复述清单。`);
  }
  if (p.bedtime) {
    const [hour, minute] = String(p.bedtime).split(':').map(Number);
    const current = new Date(now || Date.now());
    const bedtimeMinutes = hour * 60 + minute;
    const nowMinutes = current.getHours() * 60 + current.getMinutes();
    // 仅夜间时段（20 点至次日 6 点）注入作息信息，白天不打扰上下文。
    const isNight = nowMinutes >= 20 * 60 || nowMinutes < 6 * 60;
    if (isNight) {
      const past = nowMinutes >= bedtimeMinutes || nowMinutes < 6 * 60;
      lines.push(`用户通常入睡时间 ${p.bedtime}。${past ? '现在已过其作息点，可温和提醒早点休息，但不要说教。' : '尚未到其作息点，不必催促。'}`);
    }
  }
  return lines.join('\n');
}

module.exports = { buildPersonaPrompt, buildPersonaContext, PERSONALITY_TONES };
