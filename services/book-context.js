const directory = require('../data/book-directory');
const skillDirectory = require('../data/book-skills');

function decode(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return String(value);
  }
}

function resolve(bookId, skillId) {
  const id = decode(bookId);
  const selectedSkillId = decode(skillId);
  const book = directory.findBook(id);
  if (!book) return null;
  const skill = selectedSkillId ? skillDirectory.findSkill(book.id, selectedSkillId) : null;
  if (selectedSkillId && !skill) return null;
  return {
    book,
    skill,
    scopeKey: `${book.id}::${skill ? skill.id : ''}`,
    prompt: buildPrompt(book, skill)
  };
}

function buildPrompt(book, skill) {
  const skillList = (book.skills || []).map((item) => `${item.title}：${item.desc}`).join('；');
  const lines = [
    `当前对话限定在《${book.fullTitle || book.title}》的知识范围。${book.introduction}`,
    skillList ? `本书精选技能：${skillList}。` : ''
  ];
  if (skill) {
    lines.push(
      `用户本次选择了「${skill.title}」，请围绕这个技能展开，不要漂移到其他书或其他技能。`,
      `核心概念：${skill.concept}`,
      `应用场景：${skill.scenario}`,
      `可邀请用户思考：${(skill.questions || []).join(' ')}`,
      `低风险练习：${skill.exercise}`,
      `来源定位：${skill.source}`,
      `核验状态：${skill.verification}`
    );
  }
  lines.push(
    '回答纪律：只使用上述已登记内容，不虚构原书页码、原话或案例；需要引用时说明是概念转述。',
    '把用户当前情绪放在书本概念之前；一次只给一个小步骤，不用术语压过用户的表达。',
    '不做诊断，不替代专业心理咨询或医疗建议；出现危机信号时优先进入安全求助流程。'
  );
  if (book.id === 'cbti-insomnia-perlis') {
    lines.push('睡眠限制属于需要专业评估的临床干预，不向用户自行制定或调整卧床处方。');
  }
  return lines.filter(Boolean).join('\n');
}

function buildActivePrompt(bookId, skillId) {
  const context = resolve(bookId, skillId);
  return context ? context.prompt : '';
}

module.exports = {
  decode,
  resolve,
  buildPrompt,
  buildActivePrompt
};
