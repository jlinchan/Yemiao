const content = require('./nightcat-content');
const bookDirectory = require('./book-directory');

const categories = [
  { id: 'all', label: '全部' },
  { id: 'emotion', label: '情绪调节' },
  { id: 'growth', label: '认知成长' },
  { id: 'acceptance', label: '自我接纳' },
  { id: 'relationship', label: '关系沟通' },
  { id: 'sleep', label: '睡眠放松' }
];

const skills = bookDirectory.listBooks().map((book) => Object.assign({}, book, {
  displayTags: book.tags.slice(0, 2)
}));

function matchesQuery(skill, query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return true;
  return [skill.title, skill.desc].concat(skill.tags).join(' ').toLowerCase().includes(value);
}

function filterSkills(category, query) {
  const id = categories.some((item) => item.id === category) ? category : 'all';
  return skills.filter((skill) => (
    (id === 'all' || skill.categories.includes(id))
    && matchesQuery(skill, query)
  ));
}

function findSkill(id) { return bookDirectory.findBook(id); }

function getDetailId(id) { return findSkill(id) ? id : null; }

module.exports = { categories, skills, filterSkills, findSkill, getDetailId, assets: { ...content.assets, search: '/assets/counselors/search.png' } };
