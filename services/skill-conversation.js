const directory = require('../data/skill-directory');

function getBookConversationUrl(bookId, skillId) {
  const book = directory.findSkill(bookId);
  if (!book) return null;
  const skill = skillId ? (book.skills || []).find((item) => item.id === skillId) : null;
  if (skillId && !skill) return null;
  const prompt = skill
    ? skill.prompt
    : (book.conversationPrompt || `我想练习《${book.title}》里的方法。`);
  const params = [
    `prompt=${encodeURIComponent(prompt)}`,
    `bookId=${encodeURIComponent(book.id)}`
  ];
  if (skill) params.push(`skillId=${encodeURIComponent(skill.id)}`);
  return `/pages/agent/index?${params.join('&')}`;
}

function getConversationUrl(id) {
  return getBookConversationUrl(id);
}

module.exports = { getConversationUrl, getBookConversationUrl };
