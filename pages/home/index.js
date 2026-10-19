const content = require('../../data/nightcat-content');
const selection = require('../../services/counselor-selection');
const { getConversationUrl } = require('../../services/skill-conversation');
const { openBookDetail } = require('../../services/book-navigation');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

const BRAND_TOP_DESIGN_PX = 45; // 设计稿里「夜喵」距屏幕顶部的距离
const MAX_MESSAGE_LENGTH = 200;

Page({
  data: {
    assets: content.assets,
    counselors: content.counselors,
    books: content.books,
    suggestions: content.suggestions,
    selectedId: selection.DEFAULT_ID,
    draft: '',
    heroFailed: false,
    brandTop: 49
  },

  onLoad() {
    this.submitting = false;
    this.setData({
      selectedId: this.getHomeSelectedId(),
      brandTop: this.computeBrandTop()
    });
  },

  onShow() {
    this.setData({ selectedId: this.getHomeSelectedId() });
  },

  // “全部咨询师”包含成长/睡眠角色，首页精选区只展示前三位；
  // 返回首页时把非精选选择降级为默认卡片，避免出现无高亮状态。
  getHomeSelectedId() {
    const id = selection.read();
    return content.counselors.some((item) => item.id === id) ? id : selection.DEFAULT_ID;
  },

  /**
   * 主标题顶部：设计稿是 45px，但真机上不能压到系统状态栏，
   * 取「设计稿位置」和「状态栏下方」里更大的那个。
   */
  computeBrandTop() {
    const nav = getNavigationMetrics();
    const windowWidth = nav.windowWidth || 375;
    const designTop = Math.round((BRAND_TOP_DESIGN_PX * windowWidth) / 390);
    return Math.max(designTop, Math.round(nav.statusBarHeight + 2));
  },

  onHeroError() {
    this.setData({ heroFailed: true });
  },

  selectCounselor(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findCounselor(id)) return;
    if (id === this.data.selectedId) {
      this.startCounselorChat(id);
      return;
    }
    this.setData({ selectedId: selection.save(id) });
  },

  startCounselorChat(id) {
    const counselor = content.findCounselor(id);
    if (!counselor) return;
    // 2026-10-17 深夜转场丝滑化：全局首页已是 pages/home，agent 只是普通对话页——
    // navigateTo 进入（旧注释「agent 是入口页需 reLaunch」已失效）：首页实例保留在栈底，
    // agent 顶部返回 navigateBack 原地回首页，零重建。
    wx.navigateTo({ url: `/pages/agent/index?counselorId=${encodeURIComponent(counselor.id)}` });
  },

  openCounselors() {
    wx.navigateTo({ url: `/pages/counselors/index?id=${selection.read()}` });
  },

  openSkills() {
    wx.navigateTo({ url: '/pages/skills/index' });
  },

  openBookDetail(event) {
    openBookDetail(event.currentTarget.dataset.id, this);
  },

  openSkill(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findBook(id)) return;
    const url = getConversationUrl(id);
    if (url) navigation.navigateOnce(this, `chat:${id}`, url);
  },

  openTopic(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findTopic(id)) return;
    wx.navigateTo({ url: `/pages/topic/index?id=${id}` });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/night-settings/index' });
  },

  onDraftInput(event) {
    this.setData({ draft: event.detail.value });
  },

  /**
   * 发送：本地没有接入 AI 服务，这里把内容带进夜喵对话页，
   * 由该页已有的本地引导脚本给出回复，不做任何伪造的服务端成功。
   */
  onSend() {
    const text = (this.data.draft || '').trim();
    if (!text) {
      wx.showToast({ title: '说点什么再发送', icon: 'none' });
      return;
    }
    if (this.submitting) return;
    this.submitting = true;
    this.setData({ draft: '' });
    // navigateTo 进入（见 startCounselorChat 注释）：首页实例保留，返回零重建。
    wx.navigateTo({
      url: `/pages/agent/index?draft=${encodeURIComponent(text.slice(0, MAX_MESSAGE_LENGTH))}`,
      complete: () => { this.submitting = false; }
    });
  }
});
