const directory = require('../data/skill-directory');

// 书板块入口的引导语：由当前陪伴者作为开场白说出，不伪装成用户发言。
function bookGreeting(title) {
  return `《${title}》里的方法，我们可以慢慢练。先说说最近哪件事让你最想用上它？`;
}

// 整书或具体技能共用的对话入口。agent 根据 bookId/skillId 注入真实知识上下文。
function getBookConversationUrl(bookId, skillId) {
  const book = directory.findSkill(bookId);
  if (!book) return null;
  const skill = skillId ? (book.skills || []).find((item) => item.id === skillId) : null;
  if (skillId && !skill) return null;
  const greeting = skill ? skill.prompt : bookGreeting(book.title);
  const params = [
    'entry=book',
    `greeting=${encodeURIComponent(greeting)}`,
    `bookId=${encodeURIComponent(book.id)}`
  ];
  if (skill) params.push(`skillId=${encodeURIComponent(skill.id)}`);
  return `/pages/agent/index?${params.join('&')}`;
}

function getConversationUrl(id) {
  return getBookConversationUrl(id);
}

module.exports = { getConversationUrl, getBookConversationUrl, bookGreeting };
