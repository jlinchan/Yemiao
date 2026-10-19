// 向量引擎校准台：跑一组已知相关/无关样本对，打印分数分布与门槛召回结果。
// 用途：docs/agent-vector-plan.md §4 的实测数字复核；调参（停用词、权重、阈值）后重跑校准。
// 用法：node tools/vector-calibration.js
const vector = require('../services/agent-vector');

const related = [
  ['明天要考试了，好慌，完全睡不着', '因考试焦虑而失眠'],
  ['室友又在打游戏，吵得不行', '宿舍太吵没法放松'],
  ['导师今天批评我了，很难受', '被导师批评后情绪低落'],
  ['我最近总是半夜醒', '最近总是半夜醒来睡不着'],
  ['论文写不出来压力好大', '论文进度压力很大'],
  ['想家了，有点难过', '想家，想爸妈'],
  ['谢谢你记得我喜欢下雨天', '喜欢下雨的声音'],
  ['下周要答辩了', '答辩前紧张'],
  ['最近跟舍友关系不太好', '和室友闹了一点矛盾'],
  ['我养的猫今天走了', '养的猫生病了很担心']
];

const unrelated = [
  ['明天要考试了，好慌，完全睡不着', '今天晚霞很好看'],
  ['室友又在打游戏，吵得不行', '喜欢下雨的声音'],
  ['导师今天批评我了，很难受', '想家，想爸妈'],
  ['论文写不出来压力好大', '朋友的生日聚会'],
  ['我最近总是半夜醒', '讨厌的数学作业'],
  ['想家了，有点难过', '食堂今天的菜不错'],
  ['谢谢你记得我喜欢下雨天', '被导师批评后情绪低落'],
  ['下周要答辩了', '和室友闹了一点矛盾'],
  ['最近跟舍友关系不太好', '累计完成呼吸练习'],
  ['我养的猫今天走了', '考试焦虑'],
  ['恩', '因考试焦虑而失眠'],
  ['睡不着', '宿舍太吵没法放松'],
  ['唉', '想家，想爸妈'],
  ['今天好累', '论文进度压力很大'],
  ['今天好累', '今天晚霞很好看'],
  ['明天要考试了', '明天要去春游'],
  ['我们下周答辩', '我们班下周聚会']
];

function gatePass(q, m) {
  const setM = new Set(vector.tokenize(m));
  return vector.tokenize(q).some((t) => vector.isEvidenceToken(t) && setM.has(t));
}

console.log('== 原始相似度（门槛前）==');
let relMin = 1; let relMax = 0; let unMax = 0;
related.forEach(([q, m]) => {
  const s = vector.similarity(q, m);
  relMin = Math.min(relMin, s); relMax = Math.max(relMax, s);
  console.log(`  相关 ${s.toFixed(3)}  门槛:${gatePass(q, m) ? '过' : '拒'}  「${q}」↔「${m}」`);
});
unrelated.forEach(([q, m]) => {
  const s = vector.similarity(q, m);
  unMax = Math.max(unMax, s);
  console.log(`  无关 ${s.toFixed(3)}  门槛:${gatePass(q, m) ? '过(!)' : '拒'}  「${q}」↔「${m}」`);
});
console.log(`  相关区间 ${relMin.toFixed(3)}~${relMax.toFixed(3)}｜无关最高 ${unMax.toFixed(3)}（含合成模板类）`);

console.log('\n== 门槛召回模拟（召回行调用口径: limit=2, minScore=0.15）==');
const scenes = [
  { q: '明天要考试了，好慌，完全睡不着', want: '因考试焦虑而失眠' },
  { q: '导师今天批评我了，很难受', want: '被导师批评后情绪低落' },
  { q: '唉', want: null },
  { q: '睡不着', want: null },
  { q: '今天好累', want: null }
];
const corpus = ['因考试焦虑而失眠', '宿舍太吵没法放松', '今天晚霞很好看', '喜欢下雨的声音', '想家，想爸妈', '被导师批评后情绪低落'];
scenes.forEach(({ q, want }) => {
  const hits = vector.recall(q, corpus, { limit: 2, minScore: 0.15 });
  const top = hits.length ? hits[0].text : null;
  const ok = top === want || (want === null && top === null);
  console.log(`  ${ok ? '✓' : '✗'} 「${q}」→ ${hits.map((h) => `${h.text}(${h.score.toFixed(3)})`).join(' / ') || '（无召回）'}${want ? `  期望: ${want}` : '  期望: 静默'}`);
});
