const openings = { exam: '想到考试时，最让你放不下的是结果，还是准备还没完成？', research: '今晚更困扰你的是任务进度，还是对自己的要求？', dorm: '宿舍里是周围的声音影响你，还是心里一直紧绷着？', thoughts: '脑子里反复出现的，是明天的事，还是今天没做完的事？' };
function next(topic, answers) {
  const text = answers.join(' ');
  const sound = /吵|噪|室友|声音/.test(text) ? 'white' : /雨/.test(text) ? 'rain' : /水|湖/.test(text) ? 'lake' : 'breeze';
  const names = { white: '白噪音', rain: '雨声', lake: '湖水', breeze: '微风' };
  if (answers.length === 1) return { reply: /紧张|焦虑|害怕|担心/.test(text) ? '听起来这件事让你有些紧绷。现在更想安静休息，还是先让思绪慢下来？' : '我听到了。你现在更想安静休息，还是先让思绪慢下来？' };
  if (answers.length === 2 && !/安静|休息|放松|慢|雨|水|风|噪|短|分钟/.test(text)) return { reply: '今晚想留给自己短短几分钟，还是多听一会儿自然声音？' };
  const short = /短|几分钟|5分钟|五分钟/.test(text);
  const recommendation = { sound, title: `${names[sound]} · ${topic === 'exam' ? '考前放松' : topic === 'research' ? '暂放下任务' : '今晚慢慢来'}`, detail: `${short ? '15' : '30'} 分钟定时 · 自然环境声`, minutes: short ? 15 : 30, reason: sound === 'white' ? '你提到了周围的声音，可以试试稳定的背景声。' : '根据你刚才的回答，先给自己一段不用思考的安静时间。' };
  return { reply: recommendation.reason, recommendation };
}
module.exports = { openings, next };
