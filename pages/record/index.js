const { getNavigationMetrics } = require('../../utils/layout');
const agentSessions = require('../../services/agent-sessions');
const agentMemory = require('../../services/agent-memory');
const expertRegistry = require('../../experts/registry');
const bookRegistry = require('../../books/registry');

// 筛选口径（2026-10-18 会话档案接入）：
// - all：当前进行中的对话 + 全部归档；
// - week：最近 7 天内有过往来的对话；
// - archived：仅归档（进行中的不算）。
const FILTER_TITLES = { all: '还没有会话记录，和夜喵聊过就会出现在这里', week: '本周还没有对话', archived: '暂无归档会话' };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function pad2(value) { return String(value).padStart(2, '0'); }

function whenLabel(at, now) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '最近';
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const base = new Date(now);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, base)) return `今天 ${clock}`;
  if (sameDay(date, new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1))) return `昨天 ${clock}`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${clock}`;
}

Page({
  data: {
    nav: getNavigationMetrics(),
    filter: 'all',
    counts: { all: 0, week: 0, archived: 0 },
    emptyTitle: FILTER_TITLES.all,
    showSearch: false,
    searchQuery: '',
    inputFocus: false,
    sessions: []
  },
  onLoad() {},
  onShow() {
    this.setData({ nav: getNavigationMetrics() });
    this.refreshSessions();
    this.backfillSummaries();
  },
  // 缺总结的归档条目后台补 AI 总结（2026-10-18）：总结只在 closeChat 等收尾路径生成，
  // 侧滑返回、老档案、超时失败的会话都没有；进记录页时补齐最近几条，回来一条刷一条。
  backfillSummaries() {
    const pending = (this.allSessions || []).filter((item) => !item.live && !item.summary).slice(0, 3);
    pending.forEach((item) => {
      const messages = agentSessions.getMessages(item.id);
      if (!messages) return;
      try {
        agentMemory.requestSummary(messages, (summary) => {
          if (!summary) return;
          try { agentSessions.updateSummary(item.id, summary); } catch (error) { /* 回填失败静默 */ }
          this.refreshSessions();
        });
      } catch (error) { /* 补总结失败不影响列表 */ }
    });
  },
  // 组装会话列表：当前进行中的置顶（标「进行中」），其后归档（新 → 旧）。
  refreshSessions() {
    const now = Date.now();
    const expertCards = expertRegistry.list();
    const bookCards = bookRegistry.list();
    const decorate = (item, live) => {
      const expertCard = expertCards.find((card) => card.name === item.expert);
      const bookCard = bookCards.find((card) => card.name === item.book);
      const parts = [];
      if (expertCard) parts.push(`${expertCard.label}视角`);
      if (bookCard) parts.push(`《${bookCard.label}》`);
      return {
        id: item.id,
        live,
        // AI 总结的讨论结果优先作为条目文本（2026-10-18）；摘要未生成时回退到首句标题。
        title: item.summary || item.title || '一段悄悄话',
        summary: item.summary || '',
        when: whenLabel(item.updatedAt, now),
        count: item.count || 0,
        viewLabel: parts.length ? ` · ${parts.join(' × ')}` : '',
        updatedAt: item.updatedAt || 0
      };
    };
    let active = null;
    try {
      const current = agentSessions.readActiveSession();
      if (current) active = decorate({ id: current.id, title: current.title, summary: current.summary, expert: current.expert, book: current.book, count: current.messages.length, updatedAt: current.updatedAt }, true);
    } catch (error) { /* 当前会话读取失败只少一行置顶 */ }
    const archived = agentSessions.list().map((item) => decorate(item, false));
    const sessions = (active ? [active] : []).concat(archived);
    const week = sessions.filter((item) => now - item.updatedAt <= WEEK_MS);
    this.allSessions = sessions;
    this.setData({
      sessions: this.applyView(),
      counts: { all: sessions.length, week: week.length, archived: archived.length }
    });
    this.updateEmptyTitle();
  },
  // 按当前筛选与搜索词产出视图列表。
  applyView() {
    const now = Date.now();
    const query = String(this.data.searchQuery || '').trim().toLowerCase();
    let list = this.allSessions || [];
    if (this.data.filter === 'week') list = list.filter((item) => now - item.updatedAt <= WEEK_MS);
    if (this.data.filter === 'archived') list = list.filter((item) => !item.live);
    if (query) list = list.filter((item) => (item.title + item.viewLabel).toLowerCase().indexOf(query) !== -1);    return list;
  },
  chooseFilter(event) {
    const filter = event.currentTarget.dataset.filter;
    if (!Object.prototype.hasOwnProperty.call(FILTER_TITLES, filter)) return;
    this.setData({ filter });
    this.applyAndRender();
  },
  toggleSearch() {
    const showSearch = !this.data.showSearch;
    this.setData({ showSearch, searchQuery: '', inputFocus: showSearch });
    this.applyAndRender();
  },
  onSearch(event) {
    this.setData({ searchQuery: event.detail.value });
    this.applyAndRender();
  },
  clearSearch() {
    this.setData({ searchQuery: '', inputFocus: true });
    this.applyAndRender();
  },
  applyAndRender() {
    this.setData({ sessions: this.applyView() });
    this.updateEmptyTitle();
  },
  updateEmptyTitle() {
    const titles = { all: FILTER_TITLES.all, week: FILTER_TITLES.week, archived: FILTER_TITLES.archived };
    this.setData({ emptyTitle: this.data.searchQuery.trim() ? '没有找到相关会话' : titles[this.data.filter] });
  },
  // 点开一段会话：进行中的直接回到对话页（无参恢复当前），归档的带 sessionId 恢复。
  openSession(event) {
    const id = event.currentTarget.dataset.id;
    const session = (this.data.sessions || []).find((item) => item.id === id);
    if (!session) return;
    wx.navigateTo({ url: session.live ? '/pages/agent/index' : `/pages/agent/index?sessionId=${encodeURIComponent(id)}` });
  },
  removeSession(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const that = this;
    wx.showModal({
      title: '删除这段对话？',
      content: '删除后无法找回，其余记录不受影响。',
      confirmText: '删除',
      confirmColor: '#d85a30',
      success(res) {
        if (!res.confirm) return;
        agentSessions.remove(id);
        that.refreshSessions();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },
  noop() {}
});
