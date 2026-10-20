const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const nightPreferences = require('../../services/night-preferences');
const storage = require('../../services/storage');
const guide = require('../../utils/agent-guide');
const agentContext = require('../../utils/agent-context');
const agentMemory = require('../../services/agent-memory');
const agentPersona = require('../../utils/agent-persona');
const agentClient = require('../../services/agent-client');
const agentSessions = require('../../services/agent-sessions');
const accessCode = require('../../services/access-code');
const skillRegistry = require('../../skills/registry');
const expertRegistry = require('../../experts/registry');
const agentTasks = require('../../services/agent-tasks');
const agentMessages = require('../../services/agent-messages');
const agentReviews = require('../../services/agent-reviews');
const agentPush = require('../../services/agent-push');
const agentPort = require('../../services/agent-port');
const subscribe = require('../../utils/subscribe');
const agentIcons = require('../../utils/agent-icons');
const safetyGate = require('../../utils/safety-gate');
const voiceService = require('../../services/voice-service');
const bookRegistry = require('../../books/registry');
const counselorDirectory = require('../../data/counselor-directory');
const bookContext = require('../../services/book-context');
const markdownLite = require('../../utils/markdown-lite');

// 流式渲染节流：约 30fps 的刷新节奏，配合数据路径 setData 只传增量，保证文字滚动的流体感。
const RENDER_THROTTLE_MS = 33;

// 对话页「+」面板：无需打字的快捷技能与助眠声；icon 名对应 utils/agent-icons 的导出。
const QUICK_SKILLS = [
  { key: 'breath', skill: 'breath_exercise', args: { world: 'orb' }, label: '深呼吸', icon: 'breeze' },
  { key: 'guide-night', skill: 'bedtime_guide', args: { script: 'night' }, label: '星夜慢行', icon: 'guideNight' },
  { key: 'recall', skill: 'park_thoughts', args: { action: 'recall' }, label: '取回心事', icon: 'recall' },
  { key: 'stop-sound', skill: 'stop_sound', args: {}, label: '停止播放', icon: 'pause' }
];
const QUICK_SOUNDS = [
  { key: 'sound-rain', skill: 'play_sound', args: { sound: 'rain', minutes: 30 }, label: '雨声', icon: 'rain' },
  { key: 'sound-breeze', skill: 'play_sound', args: { sound: 'breeze', minutes: 30 }, label: '微风', icon: 'breeze' },
  { key: 'sound-lake', skill: 'play_sound', args: { sound: 'lake', minutes: 30 }, label: '湖水', icon: 'lake' },
  { key: 'sound-noise', skill: 'play_sound', args: { sound: 'white', minutes: 30 }, label: '白噪音', icon: 'noise' }
];

// 对话模式三档（Reflex/Reframe/Reflect）：加号面板顶部的模式卡列表。
const CHAT_MODES = [
  { name: 'Reflex', desc: '极速回应' },
  { name: 'Reframe', desc: '均衡日常' },
  { name: 'Reflect', desc: '深度专业' }
];

Page({
  data: {
    nav: getNavigationMetrics(),
    topics: [
      { id: 'exam', label: '考试焦虑', icon: 'graduation-cap', prompt: '最近考试让我有点焦虑。' },
      { id: 'research', label: '论文 / 科研压力', icon: 'file-text', prompt: '论文和科研的压力让我难以放松。' },
      { id: 'dorm', label: '宿舍难以放松', icon: 'bed-double', prompt: '在宿舍里，我总是很难放松。' },
      { id: 'thoughts', label: '脑子停不下来', icon: 'brain', prompt: '到了晚上，我的脑子还是停不下来。' }
    ],
    showChat: false,
    practiceOpen: false,
    panelOpen: false,
    drawerOpen: false,
    expertCards: [], activeExpert: '', activeExpertLabel: '', starters: [], quickSkills: [], quickSounds: [],
    // 陪伴者视角（2026-10-19 打通）：头部/说话人/输入框称谓跟随所选陪伴者，缺省夜喵。
    speakerName: '夜喵', activeCounselor: '', activeCounselorLabel: '',
    bookCards: [], activeBook: '', activeBookLabel: '', activeBookEmblem: '', bookStarters: [],
    homeState: 'initial', messages: [], answers: [], recommendation: null, activeTopic: '', scrollAnchor: '',
    showRecords: false,
    draft: '',
    canSend: false,
    awaitingFirst: false,
    message: '',
    chatState: 'idle',
    streamState: 'idle',
    keyboardHeight: 0,
    inputFocus: false,
    aiLocked: false,
    codeInput: '',
    codeError: false,
    gateFocus: false,
    recentSessions: [],
    archiveList: [],
    icons: agentIcons,
    lastAgentId: '',
    totalBreaths: 0,
    sevenDay: { activeDays: 0, completedSessions: 0, outcomes: { relieved: 0, same: 0, tense: 0 } },
    messageBadge: 0,
    sendEcho: '',
    playingSound: '',
    playingSoundLabel: '',
    sourceForName: '',
    menuForId: '',
    reviewForId: '',
    reviewDraft: '',
    reviewQuote: '',
    reviewVote: '',
    reviewHadReason: false,
    canSubmitReview: false,
    // 语音（WechatSI）：ttsEnabled 持久化在 night-preferences；voiceAvailable=false 时入口整体隐藏。
    ttsEnabled: false, voiceAvailable: false, recording: false, ttsSpeaking: false, speakingId: ''
  },
  onLoad(options) {
    // 新首页入口参数：draft（首页输入框带入的真实用户输入）/ prompt（话题页快捷发言，
    // 用户第一人称）——两者都作为用户消息自动发出；greeting（entry=counselor|book 板块
    // 带来的引导语）——由夜喵作为开场白说出，不再伪装成用户发言（2026-10-18 修复：
    // 此前咨询师的引导语被显示成用户发的消息，逻辑颠倒）。
    const entry = options || {};
    this.entry = entry;
    this.entryApplied = false;
    this.pendingEntryText = '';
    this.pendingGreeting = '';
    const draftText = typeof entry.draft === 'string' && entry.draft ? entry.draft : '';
    const promptText = !draftText && typeof entry.prompt === 'string' && entry.prompt ? entry.prompt : '';
    this.pendingEntryText = (draftText || promptText) ? decodeURIComponent(draftText || promptText).slice(0, 200) : '';
    this.pendingGreeting = typeof entry.greeting === 'string' && entry.greeting
      ? decodeURIComponent(entry.greeting).slice(0, 300)
      : '';
    this.entryType = typeof entry.entry === 'string' ? entry.entry : '';
    // 书中技能入口：bookId/skillId 由 services/skill-conversation.js 传入。
    // 实际知识上下文由 book-context 读取，不把大段内容塞进 URL。
    this.entryBookContext = bookContext.resolve(entry.bookId, entry.skillId);
    // 陪伴者身份（2026-10-19 打通）：counselors 页带 counselor=<id> 进来，头部/称谓/
    // persona 都换成该陪伴者；与专家视角互斥（进陪伴者对话时清掉 expert）。
    this.pendingCounselor = typeof entry.counselor === 'string' && entry.counselor ? entry.counselor : '';
    this.activeCounselorId = '';
    // 从首页「记录」板块点开某段归档会话：直接恢复它继续聊。
    this.pendingSessionId = typeof entry.sessionId === 'string' && entry.sessionId ? entry.sessionId : '';
    // 会话隔离（2026-10-18 会话档案）：带话/带引导语进来的入口一律开新会话——
    // 每次新对话新上下文；无话进入（呼吸页/分享直达/底栏）才恢复当前会话。
    this.entryKind = (this.pendingEntryText || this.pendingGreeting || this.pendingCounselor) ? 'fresh' : 'resume';
    this.keyboardListener = (event) => {
      this.setData({ keyboardHeight: this.data.showChat ? Math.max(0, event.height || 0) : 0 });
    };
    if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this.keyboardListener);
    this.refreshSafetyRegion();
    // 2026-10-17 首页重塑：旧版 agent 首页（hero/话题卡/dock）弃用，全局首页由 pages/home 承担；
    // agent 页进入即对话态——新首页的咨询师卡与输入框直接落到对话框。
    this.restoreOrBegin(this.pendingEntryText);
  },
  // 会话恢复与新建的统一入口（onLoad 与「继续会话」共用）。
  // freshEntry 非空：用户消息入口（draft/prompt），开新会话并自动发出；
  // 否则若带 pendingGreeting：板块引导语入口（counselor/book），开新会话并让夜喵以它开场。
  restoreOrBegin(freshEntry) {
    const prefs = nightPreferences.read();
    const currentExpert = typeof prefs.expert === 'string' ? prefs.expert : '';
    const currentBook = typeof prefs.book === 'string' ? prefs.book : '';
    if (freshEntry || this.pendingGreeting || this.pendingCounselor) {
      // 陪伴者入口（2026-10-19 打通）：带 counselor=<id> 的对话以该陪伴者开场——
      // 身份与专家互斥（清 expert），书卡沿用；名字/称谓/persona 全部跟随。
      const counselorCard = this.pendingCounselor ? counselorDirectory.findCounselor(this.pendingCounselor) : null;
      if (counselorCard) {
        this.pendingCounselor = '';
        this.applyCounselorView(counselorCard.id);
        nightPreferences.save({ expert: '' });
        agentSessions.start({ topic: '', expert: '', book: currentBook, counselor: counselorCard.id, entry: this.entryType || 'counselor' });
        const greeting = this.pendingGreeting;
        this.pendingGreeting = '';
        this.beginConversation('', greeting || counselorCard.prompt);
        return;
      }
      // 新对话新上下文：当前会话由 sessions.start 内部归档，开场白挂新会话。
      agentSessions.start({ topic: '', expert: currentExpert, book: currentBook, entry: this.entryType || 'prompt' });
      if (freshEntry) {
        this.pendingGreeting = '';
        this.beginConversation('');
      } else {
        // 引导语由夜喵说出：不同板块不同开场（咨询师=该咨询师的引导口吻，书=书卡练习引导）。
        this.beginConversation('', this.pendingGreeting);
      }
      return;
    }
    // 从「记录」板块点开指定会话：恢复它继续聊；找不到（已删）就落回默认开新。
    if (this.pendingSessionId) {
      const picked = agentSessions.open(this.pendingSessionId);
      this.pendingSessionId = '';
      if (picked) {
        // 会话带着当时的视角，恢复时一并写回偏好，继续聊的口吻才对得上。
        nightPreferences.save({ expert: picked.expert || '', book: picked.book || '' });
        this.applyCounselorView(picked.counselor || '');
        this.restoreSessionView(picked);
        return;
      }
    }
    const restored = agentSessions.readActiveSession();
    if (restored && restored.expert === currentExpert && restored.book === currentBook
      && (restored.counselor || '') === (this.activeCounselorId || '')) {
      // 视角未变才续上：answers 预填历史用户轮数，消息 id 用 user-${answers.length} 编号，
      // 不预填的话新一轮的 user-1 会与恢复历史里的旧 id 撞车（wx:key 冲突 + 气泡定位错乱）。
      this.restoreSessionView(restored);
      return;
    }
    // 无可恢复会话，或视角在设置里被改过（上下文模型已变）：归档旧会话，开新会话。
    agentSessions.start({ topic: '', expert: currentExpert, book: currentBook, entry: '' });
    this.beginConversation('');
  },
  // 把一段会话（当前或归档）渲染回对话视图；answers 按历史用户轮数预填避免消息 id 撞车。
  restoreSessionView(restored) {
    this.cancelPending();
    this.lastTurn = null;
    const messages = (Array.isArray(restored.messages) ? restored.messages : []).filter((item) => item && item.text);
    const restoredAnswers = messages
      .filter((item) => item.role === 'user')
      .map((item, index) => (typeof item.text === 'string' && item.text ? item.text : `#${index}`));
    this.setData(Object.assign({
      homeState: 'chat', showChat: true, activeTopic: restored.topic || '',
      messages, answers: restoredAnswers, recommendation: null, panelOpen: false, drawerOpen: false,
      draft: '', canSend: false, chatState: 'idle', streamState: 'idle', awaitingFirst: false, inputFocus: false,
      scrollAnchor: 'conversation-end'
    }, this.panelState()));
  },
  onReady() {
    // 首次渲染完成后再发入口消息：onLoad 阶段 DOM 未就绪，直接发送会丢滚动/焦点。
    this.applyEntryDraft();
  },
  // 入口消息自动发送（首页输入框/咨询师卡）：进入对话即发出去，用户不用再点一次发送。
  applyEntryDraft() {
    if (this.entryApplied) return;
    this.entryApplied = true;
    const text = this.pendingEntryText || '';
    if (!text) return;
    this.setData({ draft: text, canSend: true });
    this.sendMessage();
  },
  // 离开对话（顶部返回 / 结束本次对话）：栈里有上一页（首页/呼吸/咨询师列表 navigateTo 进来）
  // 就 navigateBack 原地返回——来源页实例还在、零重建，这是转场丝滑的关键；
  // 分享直达等栈空场景 reLaunch 回首页兜底。
  goHome() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages.length > 1) { wx.navigateBack(); return; }
    wx.reLaunch({ url: '/pages/home/index' });
  },
  onShow() {
    const preferences = nightPreferences.read();
    this.setData(Object.assign({
      nav: getNavigationMetrics(), preferences, welcomeQuestion: preferences.question, displayMode: preferences.display,
      fontMode: preferences.fontSize, aiLocked: !accessCode.isUnlocked(), practiceOpen: false, drawerOpen: false
    }, this.panelState()));
    this.syncVoiceState();
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    this.deliverDueTasks();
    this.refreshMessageBadge();
    this.consumePortHandoffs();
    this.syncSoundState();
    this.startDueWatch();
  },
  onHide() {
    this.stopDueWatch();
    this.cancelPending();
    this.cancelFollowups();
    this.persistChat();
    this.stopTts();
    this.setData({ inputFocus: false, gateFocus: false, keyboardHeight: 0 });
  },
  onUnload() {
    this.stopDueWatch();
    this.cancelPending();
    this.cancelFollowups();
    this.stopTts();
    // 侧滑/物理返回不经过 closeChat：补一次存档，防止未落库的消息丢失。
    this.persistChat();
    if (wx.offKeyboardHeightChange && this.keyboardListener) wx.offKeyboardHeightChange(this.keyboardListener);
  },
  onShareAppMessage() { return { title: '夜喵，你的 AI 睡前陪伴助手', path: '/pages/agent/index' }; },
  onShareTimeline() { return { title: '夜喵，你的 AI 睡前陪伴助手' }; },
  noop() {},
  openSettings() { wx.navigateTo({ url: '/pages/night-settings/index' }); },
  goBreathe() { wx.reLaunch({ url: '/pages/breathe/index' }); },
  startGuide() { wx.navigateTo({ url: '/pages/focus/index' }); },
  // 练习卡：默认收缩，点按整行丝滑展开 / 收起。
  togglePractice() {
    const practiceOpen = !this.data.practiceOpen;
    this.setData({ practiceOpen });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响展开 */ } }
  },
  goPage(event) {
    this.setData({ showRecords: false });
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },
  openRecords() { wx.reLaunch({ url: '/pages/record/index' }); },
  closeRecords() {
    // 底栏「夜喵」（常驻，第一版行为恢复）：首页态切换记录面板；对话态退出对话回首页。
    if (this.data.homeState !== 'initial') { this.closeChat(); return; }
    this.setData({ showRecords: false });
  },
  openChat() {
    if (this.data.homeState !== 'initial') return;
    this.beginConversation('');
    // 等对话层入场动画走完再聚焦输入框，避免键盘抢在面板动画之前弹出。
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      if (this.data.homeState === 'initial') return;
      if (this.data.aiLocked) this.setData({ gateFocus: true });
      else this.setData({ inputFocus: true });
    }, 280);
  },
  // 验证码门禁：输入正确前不发起对话，输入一次后本机记住。
  onCodeInput(event) {
    this.setData({ codeInput: event.detail.value, codeError: false });
  },
  submitCode() {
    const input = String(this.data.codeInput || '').trim();
    if (!input) return;
    if (!accessCode.save(input)) {
      this.setData({ codeError: true });
      if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响校验 */ } }
      return;
    }
    this.setData({ aiLocked: false, codeError: false, codeInput: '', gateFocus: false, inputFocus: true });
    wx.showToast({ title: '验证成功，可以开始聊了', icon: 'none' });
  },
  nudgeGate() {
    this.setData({ gateFocus: true });
    wx.showToast({ title: '请先输入验证码', icon: 'none' });
  },
  buildOpening(topic) {
    if (topic && guide.openings[topic]) return guide.openings[topic];
    // 个性化开场受记忆开关实时控制。
    if (nightPreferences.read().memoryEnabled) {
      const last = agentMemory.lastMemory();
      if (last && last.summary) return `上次你和我聊到「${last.summary}」。今晚还是这件事，还是有新的心事？`;
    }
    return this.data.welcomeQuestion || '今晚有什么让你难以放松？';
  },
  // 双锚点交替触发滚动，保证单次 setData 内完成（减少渲染开销）。
  flipAnchor() {
    this.anchorFlip = !this.anchorFlip;
    return this.anchorFlip ? 'conversation-end-a' : 'conversation-end-b';
  },
  // 对话现场入档：agent-sessions 负责清洗（交互卡与未完成气泡不入档），失败静默。
  // 会话快照带上当前视角（专家/书卡/陪伴者），供恢复时校验与档案展示。
  persistChat() {
    try {
      agentSessions.save(this.data.messages, {
        topic: this.data.activeTopic,
        expert: expertRegistry.current(),
        book: bookRegistry.current(),
        counselor: this.activeCounselorId || '',
        entry: this.entryKind || ''
      });
    } catch (error) { /* 存档失败不影响对话 */ }
  },
  // 会话收尾的 AI 总结（2026-10-18）：后台生成"讨论结果"摘要，回填到会话条目，
  // 会话记录页用它作展示文本。摘要请求不依赖会话存储；回填失败静默，不影响收尾流程。
  fileSummary() {
    if (this.data.messages.length <= 1) return;
    let sessionId = '';
    try { sessionId = agentSessions.activeId(); } catch (error) { sessionId = ''; }
    try {
      agentMemory.summarizeConversation(this.data.messages, this.data.activeTopic, (summary) => {
        if (!summary || !sessionId) return;
        try { agentSessions.updateSummary(sessionId, summary); } catch (error) { /* 回填失败静默 */ }
      });
    } catch (error) { /* 摘要失败不阻塞收尾 */ }
  },
  // openingText：板块引导语（counselor/book 入口由夜喵说出）；缺省走个性化开场白。
  beginConversation(topic, openingText) {
    this.cancelPending();
    this.lastTurn = null;
    this.setData(Object.assign({
      homeState: 'chat', showChat: true, activeTopic: topic, answers: [], recommendation: null, panelOpen: false, drawerOpen: false,
      messages: [{ id: 'intro', role: 'agent', text: openingText || this.buildOpening(topic), done: true }],
      draft: '', canSend: false, chatState: 'idle', streamState: 'idle', awaitingFirst: false, inputFocus: false, scrollAnchor: 'conversation-end'
    }, this.panelState()));
  },
  playRecommendation() {
    const item = this.data.recommendation;
    if (item) wx.navigateTo({ url: `/pages/sound/index?sound=${item.sound}&minutes=${item.minutes}` });
  },
  openChatSettings() { wx.navigateTo({ url: '/pages/night-settings/index?from=chat' }); },
  // 「+」面板的完整状态：专家卡、书卡、当前专家/书卡、开场白与两支快捷清单（按权限过滤）。
  // 陪伴者字段也在这里统一计算：所有带 panelState() 的 setData 自动携带正确称谓。
  panelState() {
    const cards = expertRegistry.list().map((card) => Object.assign({}, card, {
      emblem: card.name === 'yalom' ? agentIcons.emblemRipple : agentIcons.emblemStar
    }));
    const current = expertRegistry.current();
    const active = cards.find((item) => item.name === current) || null;
    const books = bookRegistry.list().map((card) => Object.assign({}, card, { emblem: agentIcons.emblemBook }));
    const currentBook = bookRegistry.current();
    const activeBook = books.find((item) => item.name === currentBook) || null;
    const allow = (item) => skillRegistry.getPermission(item.skill) !== 'off';
    const counselorItem = this.activeCounselorId ? counselorDirectory.findCounselor(this.activeCounselorId) : null;
    const counselorStarters = counselorDirectory.counselorStarters(this.activeCounselorId || '');
    return {
      chatModes: CHAT_MODES,
      chatMode: nightPreferences.normalizeChatMode(nightPreferences.read().chatMode),
      expertCards: cards,
      activeExpert: active ? active.name : '',
      activeExpertLabel: active ? active.label : '',
      activeExpertEmblem: active ? active.emblem : '',
      starters: active && active.starters ? active.starters : counselorStarters,
      bookCards: books,
      activeBook: activeBook ? activeBook.name : '',
      activeBookLabel: activeBook ? activeBook.label : '',
      activeBookEmblem: activeBook ? activeBook.emblem : '',
      bookStarters: activeBook && activeBook.starters ? activeBook.starters : [],
      activeCounselor: counselorItem ? counselorItem.id : '',
      activeCounselorLabel: counselorItem ? counselorItem.name : '',
      speakerName: counselorItem ? counselorItem.name : '夜喵',
      quickSkills: QUICK_SKILLS.filter(allow),
      quickSounds: QUICK_SOUNDS.filter(allow)
    };
  },
  // 陪伴者视角切换（2026-10-19）：id 为空表示切回夜喵本体。只改页面状态字段，
  // 会话开新/归档由调用方（入口分支 / clearCounselor / applyExpert）负责。
  applyCounselorView(id) {
    this.activeCounselorId = id || '';
    this.setData(this.panelState());
  },
  // 陪伴者视角的「切回」：从陪伴者身份回到夜喵本体，归档当前会话、开新会话。
  clearCounselor() {
    if (!this.activeCounselorId) return;
    this.applyCounselorView('');
    this.beginSessionWithNotice('好，切回夜喵本体的陪伴。', undefined, undefined);
  },
  // 「+」开合：展开前先收键盘，面板顶替键盘位置，避免两者叠加占位。
  // 展开时同步 panelState：模式卡（chatModes/chatMode）与视角清单保持最新。
  togglePanel() {
    const panelOpen = !this.data.panelOpen;
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData(Object.assign({ panelOpen, drawerOpen: false, inputFocus: false, scrollAnchor: panelOpen ? this.flipAnchor() : this.data.scrollAnchor }, this.panelState()));
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响面板开合 */ } }
  },
  // 右侧抽屉：详细功能（专家视角详版、会话档案、新对话、对话设置）。
  openDrawer() {
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ drawerOpen: true, panelOpen: false, inputFocus: false, archiveList: this.buildArchiveList() });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响抽屉开合 */ } }
  },
  // 会话档案列表（新 → 旧，最多 8 条）：标题 + 时间 + 条数 + 视角标签。
  buildArchiveList() {
    const items = agentSessions.list().slice(0, 8);
    const now = Date.now();
    return items.map((item) => {
      const expertCards = expertRegistry.list();
      const bookCards = bookRegistry.list();
      const expertCard = expertCards.find((card) => card.name === item.expert);
      const bookCard = bookCards.find((card) => card.name === item.book);
      const counselorItem = item.counselor ? counselorDirectory.findCounselor(item.counselor) : null;
      const parts = [];
      if (counselorItem) parts.push(counselorItem.name);
      if (expertCard) parts.push(`${expertCard.label}视角`);
      if (bookCard) parts.push(`《${bookCard.label}》`);
      return Object.assign({}, item, {
        when: this.archiveWhenLabel(item.updatedAt, now),
        viewLabel: parts.length ? ` · ${parts.join(' × ')}` : ''
      });
    });
  },
  archiveWhenLabel(at, now) {
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return '最近';
    const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const base = new Date(now);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(date, base)) return `今天 ${clock}`;
    if (sameDay(date, new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1))) return `昨天 ${clock}`;
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${clock}`;
  },
  // 继续一段归档会话：当前会话先归档，目标会话连同它的视角一起恢复。
  loadArchived(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const restored = agentSessions.open(id);
    if (!restored) return;
    nightPreferences.save({ expert: restored.expert || '', book: restored.book || '' });
    this.applyCounselorView(restored.counselor || '');
    this.cancelPending();
    this.cancelFollowups();
    this.lastTurn = null;
    this.restoreSessionView(restored);
    this.setData({ drawerOpen: false });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响载入 */ } }
  },
  // 删除一段归档会话：确认后从档案移除，不影响当前对话。
  removeArchived(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const that = this;
    wx.showModal({
      title: '删除这段对话？',
      content: '删除后无法找回，其余档案不受影响。',
      confirmText: '删除',
      confirmColor: '#d85a30',
      success(res) {
        if (!res.confirm) return;
        agentSessions.remove(id);
        that.setData({ archiveList: that.buildArchiveList() });
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },
  closeDrawer() { this.setData({ drawerOpen: false }); },
  toggleDrawer() { if (this.data.drawerOpen) this.closeDrawer(); else this.openDrawer(); },
  // 新对话：先收尾旧的一轮（后台生成摘要供记忆），归档当前会话进档案，
  // 再开一段干净的新会话——新对话不带任何旧上下文。
  // 对话模式三档切换：加号面板模式卡点选 → 写偏好即时生效（下一轮起用新模式）。
  pickChatMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (CHAT_MODES.every((item) => item.name !== mode)) return;
    const next = nightPreferences.save({ chatMode: mode });
    if (!next) { wx.showToast({ title: '切换失败，请重试', icon: 'none' }); return; }
    this.setData(this.panelState());
    wx.showToast({ title: mode, icon: 'none' });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感失败不影响切换 */ } }
  },
  // 非流式档（Reframe/Reflect）等待期的阶段性进度反馈：全文生成期间用户不再
  // 干盯三个点，气泡状态文案随时间演进（首个增量到达时由 flushAgentText 清空）。
  clearProgress() {
    if (this.progressTimers) { this.progressTimers.forEach(clearTimeout); this.progressTimers = null; }
  },
  startProgress(agentId, mode) {
    this.clearProgress();
    const steps = mode === 'deep'
      ? [[3500, '正在组织回答…'], [15000, '这个问题要想得深一点，请稍等…'], [32000, '快好了，正在收尾…']]
      : [[3500, '正在组织回答…'], [10000, '快好了，正在收尾…']];
    this.progressTimers = steps.map(([at, text]) => setTimeout(() => {
      const idx = this.data.messages.findIndex((item) => item.id === agentId);
      if (idx !== -1 && !this.data.messages[idx].done) this.setData({ [`messages[${idx}].statusText`]: text });
    }, at));
  },
  startNewSession() {
    this.fileSummary();
    this.cancelPending();
    this.cancelFollowups();
    this.lastTurn = null;
    const prefs = nightPreferences.read();
    agentSessions.start({
      topic: '',
      expert: typeof prefs.expert === 'string' ? prefs.expert : '',
      book: typeof prefs.book === 'string' ? prefs.book : '',
      counselor: this.activeCounselorId || '',
      entry: ''
    });
    this.beginConversation('');
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响新开对话 */ } }
  },
  chooseExpert(event) { this.applyExpert(event.currentTarget.dataset.name || ''); },
  clearExpert() { this.applyExpert(''); },
  applyExpert(name) {
    // 陪伴者与专家互斥：从陪伴者对话里点专家 = 离开陪伴者身份。
    if (this.activeCounselorId) this.applyCounselorView('');
    nightPreferences.save({ expert: name });
    const card = this.data.expertCards.find((item) => item.name === name);
    const text = card
      ? `好，接下来我会带着「${card.label}」的视角陪你。`
      : '好，切回夜喵本体的陪伴。';
    // 切换视角 = 上下文模型变了：当前会话归档进档案，新视角从干净的会话开始。
    this.beginSessionWithNotice(text, name, undefined);
  },
  // 书卡：与专家平行的第二视角——专家定「谁陪你」，书卡定「带哪本方法」。
  // 两者可同时生效（专家 × 书卡组合），注入顺序 persona→expert→book→context 由 agent-client 保证。
  chooseBook(event) { this.applyBook(event.currentTarget.dataset.name || ''); },
  clearBook() { this.applyBook(''); },
  applyBook(name) {
    nightPreferences.save({ book: name });
    const card = this.data.bookCards.find((item) => item.name === name);
    const text = card
      ? `好，接下来我会参考《${card.label}》里的做法陪你。`
      : '好，先不带书，就我们两个聊聊。';
    // 同专家：换书 = 换上下文模型，归档当前会话、开新书卡视角的新会话。
    this.beginSessionWithNotice(text, undefined, name);
  },
  // 以「归档当前会话 + 开新会话 + 一句告知气泡」开场，供视角切换共用。
  // expert / book 传 undefined 表示沿用设置页里刚保存的值；陪伴者始终跟随页面状态，
  // 退出陪伴者（clearCounselor / applyExpert）会先把 activeCounselorId 清空再走到这里。
  beginSessionWithNotice(notice, expertName, bookName) {
    this.fileSummary();
    this.cancelPending();
    this.cancelFollowups();
    this.lastTurn = null;
    const prefs = nightPreferences.read();
    agentSessions.start({
      topic: '',
      expert: expertName !== undefined ? expertName : (typeof prefs.expert === 'string' ? prefs.expert : ''),
      book: bookName !== undefined ? bookName : (typeof prefs.book === 'string' ? prefs.book : ''),
      counselor: this.activeCounselorId || '',
      entry: ''
    });
    this.beginConversation('');
    const messages = this.data.messages.concat([{ id: `switch-${Date.now()}`, role: 'skill', text: notice }]);
    this.setData(Object.assign({ messages, panelOpen: false, drawerOpen: false, inputFocus: false, scrollAnchor: this.flipAnchor() }, this.panelState()));
    this.persistChat();
    if (wx.hideKeyboard) wx.hideKeyboard();
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响切换 */ } }
  },
  // 点专家开场白：填入输入框供用户增删后发送。
  useStarter(event) {
    const text = event.currentTarget.dataset.text || '';
    if (!text) return;
    this.setData({ draft: text, canSend: true, panelOpen: false, drawerOpen: false, inputFocus: true });
  },
  // 点书卡开场白：同 useStarter，事件源不同故分开绑（WXML data-text 同名）。
  useBookStarter(event) {
    const text = event.currentTarget.dataset.text || '';
    if (!text) return;
    this.setData({ draft: text, canSend: true, panelOpen: false, drawerOpen: false, inputFocus: true });
  },
  // 点快捷技能/助眠声：明确意图，直接执行并收起面板，结果走技能反馈气泡。
  quickSkill(event) {
    const key = event.currentTarget.dataset.key;
    const item = this.data.quickSkills.concat(this.data.quickSounds).find((entry) => entry.key === key);
    if (!item) return;
    const call = { skill: item.skill, args: item.args };
    const outcome = skillRegistry.executeNow(call);
    this.appendSkillOutcome(call, outcome);
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ panelOpen: false, inputFocus: false });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响执行 */ } }
  },
  // 推送卡片：声音与练习类直接执行；书与记录类替用户开口，走正常对话轮。
  tapPushCard(event) {
    const { id, index } = event.currentTarget.dataset;
    const message = this.data.messages.find((item) => item.id === id);
    const card = message && message.push ? message.push[Number(index)] : null;
    if (!card) return;
    const action = agentPush.resolveCardAction(card);
    if (!action) return;
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响卡片点按 */ } }
    if (action.type === 'skill') {
      const outcome = skillRegistry.executeNow(action.call);
      this.appendSkillOutcome(action.call, outcome);
      return;
    }
    this.setData({ draft: action.text, canSend: true });
    this.sendMessage();
  },
  // 选项提问：点即作答，按普通用户发言发出；未作答的旧选项随用户开口自动收起。
  answerAsk(event) {
    const { id, index } = event.currentTarget.dataset;
    const message = this.data.messages.find((item) => item.id === id);
    const ask = message && message.ask;
    if (!ask || ask.done) return;
    const choice = ask.options[Number(index)];
    if (!choice) return;
    const messages = this.data.messages.map((item) => (
      item.id === id ? Object.assign({}, item, { ask: Object.assign({}, ask, { done: choice }) }) : item
    ));
    this.setData({ messages, draft: choice, canSend: true });
    this.sendMessage();
  },
  // 用户自己开口了：还没作答的选项卡就地作废，防止旧选项之后再被点。
  closeOpenAsks(messages) {
    if (!messages.some((item) => item.ask && !item.ask.done)) return messages;
    return messages.map((item) => (item.ask && !item.ask.done ? Object.assign({}, item, { ask: Object.assign({}, item.ask, { done: true }) }) : item));
  },
  chooseTopic(event) {
    const topic = this.data.topics.find((item) => item.id === event.currentTarget.dataset.id);
    if (!topic) return;
    this.beginConversation(topic.id);
  },
  // 打开小程序时补发到点的约定任务：没有订阅消息通道时，这是「到点提醒」的兜底。
  // 前台轮询（startDueWatch）也复用这里，应用开着时到点同样能收到。
  deliverDueTasks() {
    let due = [];
    try { due = agentTasks.takeDueCatchUp(); } catch (error) { due = []; }
    if (!due.length) return;
    this.pushMessages(due);
    this.refreshMessageBadge();
    const now = Date.now();
    if (this.data.homeState === 'initial') {
      this.beginConversation('');
      const messages = this.data.messages.slice();
      messages[0] = Object.assign({}, messages[0], { text: due[0].text, done: true });
      for (let index = 1; index < due.length; index += 1) {
        messages.push({ id: `catch-up-${now}-${index}`, role: 'agent', text: due[index].text, done: true });
      }
      this.setData({ messages, scrollAnchor: this.flipAnchor() });
      this.persistChat();
      return;
    }
    const messages = this.data.messages.concat(due.map((task, index) => ({
      id: `catch-up-${now}-${index}`,
      role: 'agent',
      text: task.text,
      done: true
    })));
    this.setData({ messages, scrollAnchor: this.flipAnchor() });
    this.persistChat();
  },
  // 消息中心留档：补发内容同步写入「消息」列表（未读），入口角标随之点亮。
  pushMessages(due) {
    try {
      agentMessages.push(due.map((task) => ({ kind: task.kind, text: task.text })));
    } catch (error) { /* 消息落档失败不影响对话内补发 */ }
  },
  refreshMessageBadge() {
    let count = 0;
    try { count = agentMessages.unreadCount(); } catch (error) { count = 0; }
    this.setData({ messageBadge: count });
  },
  openMessages() { wx.navigateTo({ url: '/pages/night-messages/index' }); },
  // 应用停在前台时到点也能收到提醒：轻量轮询，走与打开时相同的补发逻辑。
  startDueWatch() {
    if (this.dueWatcher || typeof setInterval !== 'function') return;
    this.dueWatcher = setInterval(() => this.deliverDueTasks(), 30000);
  },
  stopDueWatch() {
    if (!this.dueWatcher) return;
    clearInterval(this.dueWatcher);
    this.dueWatcher = null;
  },
  closeChat() {
    this.cancelPending();
    this.cancelFollowups();
    if (this.focusTimer) { clearTimeout(this.focusTimer); this.focusTimer = null; }
    if (this.data.messages.length > 1) {
      // 后台生成对话摘要供下次开场使用，并回填会话条目；失败静默跳过，不阻塞返回首页。
      this.fileSummary();
    }
    this.persistChat();
    // 结束即归档（2026-10-18）：聊完的对话立刻进「会话档案」（记录板块/抽屉可见、可继续），
    // 不再滞留在「进行中」等下一次开新会话时才归档；想接着聊去记录板块点开即可。
    if (this.data.messages.length > 1) {
      try { agentSessions.archiveActive(); } catch (error) { /* 归档失败不影响返回 */ }
    }
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ keyboardHeight: 0, inputFocus: false, panelOpen: false, drawerOpen: false, showChat: false });
    // 旧首页版式弃用（2026-10-17）：顶部返回直接回新版首页，不再落回 agent 旧首页。
    this.goHome();
  },
  onDraftChange(event) { this.setData({ draft: event.detail.value, canSend: Boolean(event.detail.value.trim()) }); },
  // 思考路径折叠开关：流式期间默认展开，答完自动收起，点按可回看。
  toggleThink(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.setData({ [`messages[${index}].thinkOpen`]: !this.data.messages[index].thinkOpen });
  },
  // 知识援引卡折叠开关：完成后默认收起，点按展开命中来源与摘录。
  toggleKnowledge(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1) return;
    const current = this.data.messages[index];
    const next = !current.kbOpen;
    const knowledge = (current.knowledge || []).map((hit) => Object.assign({}, hit, { kbOpen: next }));
    this.setData({ [`messages[${index}].kbOpen`]: next, [`messages[${index}].knowledge`]: knowledge });
  },
  onInputFocus() { this.setData({ inputFocus: true, panelOpen: false, drawerOpen: false }); },
  onInputBlur() { this.setData({ inputFocus: false }); },
  cancelPending() {
    this.agentTurnToken = (this.agentTurnToken || 0) + 1;
    this.clearProgress();
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null; }
    if (this.pendingAgent) {
      this.pendingAgent.abort();
      this.pendingAgent = null;
    }
    if (this.data.chatState === 'sending') this.setData({
      chatState: 'error', awaitingFirst: false, streamState: 'idle',
      messages: this.data.messages.map((item) => item.kbSearching || item.statusText ? Object.assign({}, item, { kbSearching: false, statusText: '' }) : item)
    });
  },
  // 执行一轮对话请求（发送与重试共用）：agentId 对应气泡已存在于 messages 中。
  runAgentTurn(turn) {
    const { agentId, history, answers } = turn;
    // answers 汇集了历史轮与选项回答，末位即本轮输入，供记忆语义召回使用。
    const lastUserMessage = Array.isArray(answers) && answers.length ? String(answers[answers.length - 1] || '') : '';
    this.agentTurnToken = (this.agentTurnToken || 0) + 1;
    const token = this.agentTurnToken;
    const sessionId = agentSessions.activeId();
    const isCurrent = () => token === this.agentTurnToken && sessionId === agentSessions.activeId();
    if (this.pendingAgent) this.pendingAgent.abort();
    this.userStopped = false;
    let finished = false;
    // 模式分流（2026-10-19 Reflex/Reframe/Reflect）：设置/面板选择 + 安全轮强制深度。
    const prefs = nightPreferences.read();
    const chatMode = nightPreferences.normalizeChatMode(prefs.chatMode);
    const mode = chatMode === 'Reflect' || turn.safetyLevel === 'elevated' || turn.safetyLevel === 'critical'
      ? 'deep'
      : chatMode === 'Reframe' ? 'reframe' : 'fast';
    this.renderedAgentText = null;
    this.renderedThinking = null;
    this.latestStreamText = '';
    this.latestStreamThinking = null;
    this.renderTimer = null;
    let kbCleared = false; // 「查阅中」只需在首个流式增量时清一次（onComplete/onError 兜底重置）
    // 思考路径与正文分路节流：THINK 阶段可见文本为空，但面板要实时长出来。
    this.updateAgentText = (text, thinking) => {
      if (!isCurrent()) return;
      this.latestStreamText = text || '';
      this.latestStreamThinking = thinking || null;
      const textChanged = Boolean(text) && text !== this.renderedAgentText;
      const thinkChanged = this.latestStreamThinking !== this.renderedThinking;
      if (!textChanged && !thinkChanged) return;
      if (this.data.awaitingFirst && (textChanged || thinkChanged)) this.setData({ awaitingFirst: false, streamState: 'streaming' });
      if (this.renderTimer) return; // 已有排期，等节流窗口到期后统一渲染
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.flushAgentText(this.latestStreamText, this.latestStreamThinking);
      }, RENDER_THROTTLE_MS);
    };
    this.flushAgentText = (text, thinking) => {
      if (!isCurrent()) return;
      const textChanged = Boolean(text) && text !== this.renderedAgentText;
      const thinkChanged = (thinking || null) !== this.renderedThinking;
      if (!textChanged && !thinkChanged) return;
      const index = this.data.messages.findIndex((item) => item.id === agentId);
      if (index === -1) return;
      // 只发数据路径：新增文本/思考只把增量送过桥，渲染层不回传整张消息表。
      const patch = { scrollAnchor: this.flipAnchor() };
      // 首个增量到达 = 生成已经开始：熄灭「查阅中」并清掉阶段性进度文案。
      // 此前它们挂到 onComplete 才熄，慢速生成时全程误导（用户只见「正在查阅知识库」不见答案）。
      if (!kbCleared) {
        kbCleared = true;
        this.clearProgress();
        patch[`messages[${index}].kbSearching`] = false;
        patch[`messages[${index}].statusText`] = '';
      }
      if (textChanged) {
        this.renderedAgentText = text;
        patch[`messages[${index}].text`] = text;
        // Markdown 轻排版（Reframe/Reflect 的加粗/列表/引用/小标题）：流式与终稿共用，
        // 转换零依赖（utils/markdown-lite），user 消息与旧存档回退纯文本渲染。
        patch[`messages[${index}].textNodes`] = markdownLite.toNodes(text);
      }
      if (thinkChanged) { this.renderedThinking = thinking || null; patch[`messages[${index}].thinking`] = this.renderedThinking; }
      this.setData(patch);
    };
    // 非流式档等待期启动阶段性进度反馈（Reframe ~6.5s / Reflect 10-45s），首字到达即清。
    this.startProgress(agentId, mode);
    const handle = agentClient.chat({
      sessionId,
      restartContext: Boolean(turn.restartContext),
      topic: this.data.activeTopic,
      history,
      answers,
      context: agentContext.buildUserContext(Date.now(), lastUserMessage)
        + (turn.safetyLevel === 'elevated' ? `\n${safetyGate.elevatedNote()}` : '')
        + (turn.safetyLevel === 'critical' ? `\n${safetyGate.criticalDirective()}` : ''),
      persona: agentPersona.buildPersonaPrompt(),
      expert: expertRegistry.buildActivePrompt(),
      book: [bookRegistry.buildActivePrompt(), this.entryBookContext && this.entryBookContext.prompt].filter(Boolean).join('\n\n'),
      // 陪伴者身份段：头部/称谓跟随的同一来源（activeCounselorId），缺省空串=夜喵本体。
      counselor: counselorDirectory.buildCounselorPrompt(this.activeCounselorId || ''),
      mode,
      // 知识命中先于 LLM 首字到达：立刻点亮「查阅中」状态条，填住请求空窗。
      onKnowledge: (hits) => {
        if (!isCurrent()) return;
        const index = this.data.messages.findIndex((item) => item.id === agentId);
        if (index !== -1) this.setData({ [`messages[${index}].kbSearching`]: true });
      },
      onDelta: (text, thinking) => {
        if (!isCurrent()) return;
        this.updateAgentText(text, thinking);
      },
      onStatus: (text) => {
        if (!isCurrent()) return;
        // 流水线节点状态直接写进气泡状态条（真机可观测：正在分析/计划就绪/分析未响应）。
        this.clearProgress();
        const statusIndex = this.data.messages.findIndex((item) => item.id === agentId);
        if (statusIndex !== -1 && !this.data.messages[statusIndex].done) {
          this.setData({ [`messages[${statusIndex}].statusText`]: text });
        }
      },
      onComplete: (result) => {
        if (!isCurrent()) return;
        finished = true;
        this.pendingAgent = null;
        if (this.data.homeState === 'initial') return; // 对话已被关闭，丢弃迟到的回复
        if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null; }
        // 推送卡片与选项提问挂在回复气泡上（有才挂，避免 wx:if 里判空）；终稿文本一并带上，省一次渲染。
        this.clearProgress();
        // 完成后思考面板保持展开（用户点收起才折叠）——回看思考不再需要二次点击。
        const extras = { done: true, error: false, text: result.text, textNodes: markdownLite.toNodes(result.text), kbSearching: false, statusText: '', thinkOpen: true };
        if (result.thinking) extras.thinking = result.thinking; // 思考路径保留在气泡上，可展开回看
        if (result.knowledge && result.knowledge.length) {
          // 知识援引卡：默认收起，点按展开来源与摘录（不进存档，恢复会话后不显示）。
          extras.knowledge = result.knowledge.map((hit) => Object.assign({ kbOpen: false }, hit));
        }
        if (result.push && result.push.length) extras.push = result.push;
        if (result.ask) extras.ask = result.ask;
        const messages = this.data.messages.map((item) => (item.id === agentId ? Object.assign({}, item, extras) : item));
        // 求助面板：模型以 @@SAFE@@ 标记调起；输入命中 critical 而模型漏标时由端内兜底落卡（宁滥勿缺）。
        if (result.safe || turn.safetyLevel === 'critical') {
          messages.push(Object.assign({ id: `safety-${Date.now()}`, role: 'safety' }, safetyGate.buildHelpCard()));
          if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感失败不影响面板 */ } }
        }
        this.setData({
          messages,
          chatState: 'idle',
          awaitingFirst: false,
          streamState: 'idle',
          lastAgentId: agentId,
          recommendation: result.recommendation || null,
          homeState: result.recommendation ? 'recommendation' : 'chat'
        });
        this.persistChat();
        if (result.skillCall && !result.skillCall.invalid) this.handleSkillCall(result.skillCall);
        // 朗读开关打开时，夜喵回复完成后自动读出（已剥离 @@标记@@ 与 markdown 符号）。
        this.maybeSpeak(result.text);
      },
      onError: (error) => {
        if (!isCurrent()) return;
        finished = true;
        if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null; }
        this.pendingAgent = null;
        this.clearProgress();
        if (this.userStopped) {
          // 用户主动停止：保留已流出的文本，正常收尾而不是报错；
          // 一字未流（点了停止又没内容）时移除空气泡——留着就是一个带操作栏的空壳（2026-10-18 截图错位修复）。
          this.userStopped = false;
          if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null; }
          this.setData({
            // 请求失败也要清「查阅中」与进度文案，否则气泡永远卡在检索提示上（2026-10-19）。
            messages: this.dropEmptyAgentBubble(agentId, this.latestStreamText)
              .map((item) => (item.id === agentId ? Object.assign({}, item, { kbSearching: false, statusText: '' }) : item)),
            chatState: 'idle', awaitingFirst: false, streamState: 'idle', lastAgentId: agentId, scrollAnchor: this.flipAnchor()
          });
          this.persistChat();
          return;
        }
        const errIndex = this.data.messages.findIndex((item) => item.id === agentId);
        const errPatch = { chatState: 'error', awaitingFirst: false, streamState: 'idle' };
        if (errIndex !== -1) {
          errPatch[`messages[${errIndex}].error`] = true;
          errPatch[`messages[${errIndex}].done`] = false;
          errPatch[`messages[${errIndex}].text`] = this.latestStreamText || '';
        }
        const message = error && error.message || 'AI 请求失败，请重试。';
        if (error !== 'aborted' && wx.showToast) wx.showToast({ title: message, icon: 'none', duration: 4000 });
        if (errIndex !== -1) errPatch[`messages[${errIndex}].kbSearching`] = false;
        if (errIndex !== -1) errPatch[`messages[${errIndex}].statusText`] = error === 'aborted' ? '' : message;
        this.setData(errPatch);
        if (turn.safetyLevel === 'critical' && !this.data.messages.some((item) => item.role === 'safety')) {
          this.setData({ messages: this.data.messages.concat([Object.assign({ id: `safety-${Date.now()}`, role: 'safety' }, safetyGate.buildHelpCard())]) });
        }
        this.persistChat();
      }
    });
    this.pendingAgent = finished ? null : handle;
  },
  // 中断收尾：被中断的回复气泡有已流出文本就保留终稿，一字未流就整个移除（不留下空气泡+操作栏）。
  dropEmptyAgentBubble(agentId, finalText) {
    const hasPartial = Boolean(String(finalText || '').trim());
    return this.data.messages
      .filter((item) => item.id !== agentId || hasPartial)
      .map((item) => (item.id === agentId ? Object.assign({}, item, { text: finalText || '', done: true }) : item));
  },
  sendMessage() {
    const message = this.data.draft.trim();
    if (!message || this.data.chatState === 'sending') return;
    // 危机介入（2026-10-16 架构调整）：不再绕过大模型——模型识别高危信号（含拼音避讳写法）后
    // 自然接住，并以 @@SAFE@@ 标记调起求助面板；critical 时把强指令注入本轮 context，
    // 模型漏标由 onComplete 端内兜底落卡。唯一例外：AI 未解锁（模型不可用）时直接落卡，
    // 不让高危求助被门禁挡住。
    const safety = safetyGate.scan(message);
    if (safety.level === 'critical' && this.data.aiLocked) { this.deliverSafetyTurn(message); return; }
    if (this.data.aiLocked) { this.nudgeGate(); return; }
    this.cancelFollowups(); // 用户开口说话即打断入睡引导
    const answers = this.data.answers.concat(message);
    const history = this.closeOpenAsks(this.data.messages).concat([{ id: `user-${answers.length}`, role: 'user', text: message }]);
    const agentId = `agent-${answers.length}`;
    // 发送涟漪：a/b 交替保证同一个节点上动画每次重放（同 flipAnchor 的重播技巧）
    this.echoFlip = !this.echoFlip;
    this.setData({
      message,
      answers,
      messages: history.concat([{ id: agentId, role: 'agent', text: '' }]),
      recommendation: null,
      homeState: 'chat',
      draft: '',
      canSend: false,
      chatState: 'sending',
      awaitingFirst: true,
      streamState: 'listening',
      inputFocus: false,
      panelOpen: false,
      drawerOpen: false,
      sendEcho: this.echoFlip ? 'a' : 'b',
      menuForId: '',
      scrollAnchor: this.flipAnchor()
    });
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.stopTts(); // 新一轮开始，上一条回复的朗读立即停下
    this.lastTurn = { agentId, history, answers, safetyLevel: safety.level };
    this.persistChat();
    this.runAgentTurn(this.lastTurn);
  },
  // 确定性兜底（仅 AI 未解锁、模型不可用时走）：用户消息照常入列（answers 供记忆召回），
  // 夜喵给出安全回复，并附一张可复制热线的求助卡。不设 lastTurn，重试/重新生成不会作用于安全轮。
  deliverSafetyTurn(message) {
    const answers = this.data.answers.concat(message);
    const messages = this.closeOpenAsks(this.data.messages).concat([
      { id: `user-${answers.length}`, role: 'user', text: message },
      { id: `agent-${answers.length}`, role: 'agent', text: safetyGate.buildSafetyReply(), done: true, safety: true },
      Object.assign({ id: `safety-${Date.now()}`, role: 'safety' }, safetyGate.buildHelpCard())
    ]);
    this.setData({
      message,
      answers,
      messages,
      recommendation: null,
      homeState: 'chat',
      draft: '',
      canSend: false,
      chatState: 'idle',
      awaitingFirst: false,
      streamState: 'idle',
      inputFocus: false,
      panelOpen: false,
      drawerOpen: false,
      sendEcho: '',
      menuForId: '',
      scrollAnchor: this.flipAnchor()
    });
    this.persistChat();
    if (wx.hideKeyboard) wx.hideKeyboard();
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响安全轮 */ } }
    // 安全轮也朗读：深夜里用户可能哭到看不了屏，热线号码读出来更兜得住。
    this.maybeSpeak(safetyGate.buildSafetyReply());
  },
  // 求助卡：按渠道复制号码/网址，方便在电话或浏览器界面直接粘贴。
  copySafety(event) {
    const dataset = event.currentTarget.dataset;
    const text = dataset.copy || '12356';
    const label = dataset.label ? `${dataset.label} ` : '';
    this.copyToClipboard(text, `已复制 ${label}${text}`, dataset.label || '联系方式');
  },
  // 通用复制：setClipboardData 异步且可能失败（开发者工具失焦、系统限制等）。
  // 旧写法"先写剪贴板再 toast"在失败时毫无反馈，看起来就是"复制不可用"；
  // 现在成功才提示，失败退级为弹窗把原文亮出来，联系方式一定可见。
  copyToClipboard(text, successTip, fallbackTitle) {
    const fallback = () => {
      wx.showModal({ title: fallbackTitle, content: text, showCancel: false, confirmText: '知道了' });
    };
    try {
      wx.setClipboardData({
        data: text,
        success: () => wx.showToast({ title: successTip, icon: 'none' }),
        fail: fallback
      });
    } catch (error) {
      fallback();
    }
  },
  // 求助卡地区热线：默认浙江（校园语境），用户可切换省份并本地记忆。
  // 纯端内拿不到 IP 归属地，服务端接入后可升级为自动归属；见 docs/safety-gate-design.md §5.2。
  refreshSafetyRegion() {
    const regions = safetyGate.SAFETY_REGIONS;
    let index = 0;
    try {
      const saved = nightPreferences.read().safetyRegion;
      const found = regions.findIndex((region) => region.key === saved);
      if (found >= 0) index = found;
    } catch (error) { /* 读取失败回落默认浙江 */ }
    this.setData({
      safetyExpanded: false,
      safetyRegionIndex: index,
      safetyRegionNames: regions.map((region) => region.name),
      safetyRegionLines: regions[index].hotlines
    });
  },
  toggleSafetyMore() {
    this.setData({ safetyExpanded: !this.data.safetyExpanded });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感反馈失败不影响展开 */ } }
  },
  onSafetyRegionChange(event) {
    const index = Number(event.detail.value) || 0;
    const region = safetyGate.SAFETY_REGIONS[index];
    if (!region) return;
    try { nightPreferences.save({ safetyRegion: region.key }); } catch (error) { /* 保存失败不影响本次查看 */ }
    this.setData({ safetyRegionIndex: index, safetyRegionLines: region.hotlines });
  },
  // 失败重试：复用同一轮的历史与气泡，不在消息列表中重复用户发言。
  retryTurn() {
    const turn = this.lastTurn;
    if (!turn || this.data.chatState === 'sending') return;
    const index = this.data.messages.findIndex((item) => item.id === turn.agentId);
    if (index === -1) return;
    const messages = this.data.messages.slice();
    messages[index] = Object.assign({}, messages[index], { text: '', textNodes: [], done: false, error: false, thinking: null, knowledge: null, push: null, ask: null, statusText: '', kbSearching: false });
    // 重试不是新一轮发送：清掉回波类，避免停止键重新挂载时重放涟漪
    this.setData({ messages, chatState: 'sending', awaitingFirst: true, streamState: 'listening', recommendation: null, homeState: 'chat', sendEcho: '', scrollAnchor: this.flipAnchor() });
    this.runAgentTurn(turn);
  },
  // 模型发起技能调用：按个性化权限分流。
  handleSkillCall(call) {
    const permission = skillRegistry.getPermission(call.skill);
    if (permission === 'confirm') {
      const messages = this.data.messages.concat([{
        id: `skill-confirm-${Date.now()}`,
        role: 'skill-confirm',
        text: skillRegistry.confirmText(call),
        call
      }]);
      this.setData({ messages, scrollAnchor: '' });
      this.setData({ scrollAnchor: 'conversation-end' });
      return;
    }
    const outcome = skillRegistry.run(call);
    this.appendSkillOutcome(call, outcome);
  },
  appendSkillOutcome(call, outcome) {
    const now = Date.now();
    const messages = this.data.messages.concat([{
      id: `skill-${now}`,
      role: 'skill',
      text: outcome.message || '操作已完成',
      skill: call.skill
    }]);
    if (outcome.action && outcome.action.type === 'subscribe') {
      messages.push(this.buildActionMessage(outcome.action, now));
    }
    this.setData({ messages, scrollAnchor: this.flipAnchor() });
    this.persistChat();
    if (outcome.followups && outcome.followups.length) this.scheduleFollowups(outcome.followups);
    if (outcome.action && outcome.action.type === 'guide') this.openGuide(outcome.action);
    if (outcome.action && outcome.action.type === 'navigate' && outcome.action.url) wx.navigateTo({ url: outcome.action.url });
    this.syncSoundState();
  },
  // 助眠声播放态回显：面板芯片据此亮金点（声音真实状态由全局音频托管）。
  syncSoundState() {
    const app = typeof getApp === 'function' ? getApp() : null;
    const audio = app && app.globalData ? app.globalData.audioState : null;
    const match = audio && audio.playing ? QUICK_SOUNDS.find((item) => item.args.sound === audio.sound) : null;
    this.setData({ playingSound: match ? match.args.sound : '', playingSoundLabel: match ? match.label : '' });
  },
  // 来源档案：点来源行只展开清单（catchtap 阻断冒泡），不触发专家选择。
  toggleSources(event) {
    const name = event.currentTarget.dataset.name || '';
    this.setData({ sourceForName: this.data.sourceForName === name ? '' : name });
  },
  // 入睡引导：交给全屏引导页逐段展开，对话里只留上面那句接手的话。
  openGuide(action) {
    const script = action.script === 'body' ? 'body' : 'night';
    wx.navigateTo({ url: `/pages/guide/index?script=${script}` });
  },
  // 板块回执（Agent 端口）：其他板块做完事回到对话时，逐条补一句安静的回执；
  // 超过半天的旧回执在端口里静默作废，还在欢迎页时同样只消费不打扰。
  consumePortHandoffs() {
    const handoffs = agentPort.takeHandoffs();
    if (!handoffs.length || this.data.homeState === 'initial') return;
    const now = Date.now();
    const messages = this.data.messages.concat(handoffs.map((item, index) => ({
      id: `handoff-${now}-${index}`,
      role: 'skill',
      text: item.chat,
      skill: item.module
    })));
    this.setData({ messages, scrollAnchor: this.flipAnchor() });
  },
  // 订阅消息授权卡片：到点提醒需要用户在微信里点一次「允许」。
  buildActionMessage(action, now) {
    return {
      id: `skill-action-${now}`,
      role: 'skill-action',
      text: `想要夜喵${subscribe.labelFor(action.kinds)}，需要在微信里允许一次提醒。`,
      action
    };
  },
  subscribeSkill(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1 || this.data.messages[index].role !== 'skill-action') return;
    const action = this.data.messages[index].action;
    subscribe.request(action.kinds, (result) => {
      const current = this.data.messages.findIndex((item) => item.id === id);
      if (current === -1) return;
      const text = result.ok
        ? '已经开启——到点前夜喵会在微信里喊你。'
        : result.unavailable
          ? '微信提醒还没配置好。先记住这条约定：到点打开夜喵，我会喊你。'
          : '这次没有开启微信提醒。没关系，打开夜喵时我照样会喊你。';
      const messages = this.data.messages.slice();
      messages[current] = { id, role: 'skill', text, skill: 'reminder' };
      this.setData({ messages });
    });
  },
  dismissAction(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1 || this.data.messages[index].role !== 'skill-action') return;
    const messages = this.data.messages.slice();
    messages[index] = { id, role: 'skill', text: '好，先不开启。打开夜喵时我照样会喊你。', skill: 'reminder' };
    this.setData({ messages });
  },
  // 入睡引导的后续段落：按脚本节奏逐段放出，用户开口或离开页面即打断。
  scheduleFollowups(followups) {
    this.cancelFollowups();
    this.guideTimers = [];
    followups.forEach((step) => {
      const timer = setTimeout(() => {
        this.guideTimers = (this.guideTimers || []).filter((item) => item !== timer);
        if (this.data.homeState === 'initial' || !this.data.showChat) return;
        const messages = this.data.messages.concat([{
          id: `guide-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          role: 'agent',
          text: step.text,
          done: true
        }]);
        this.setData({ messages, scrollAnchor: this.flipAnchor() });
      }, Number(step.delayMs) || 9000);
      this.guideTimers.push(timer);
    });
  },
  cancelFollowups() {
    if (!this.guideTimers) { this.guideTimers = []; return; }
    this.guideTimers.forEach((timer) => clearTimeout(timer));
    this.guideTimers = [];
  },
  goSoundPage() { wx.navigateTo({ url: '/pages/sound/index' }); },
  // 确认卡：用户点「执行」。
  confirmSkill(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1 || this.data.messages[index].role !== 'skill-confirm') return;
    const call = this.data.messages[index].call;
    const outcome = skillRegistry.executeNow(call);
    const now = Date.now();
    const messages = this.data.messages.slice();
    messages[index] = { id, role: 'skill', text: outcome.message || '操作已完成', skill: call.skill };
    if (outcome.action && outcome.action.type === 'subscribe') {
      messages.push(this.buildActionMessage(outcome.action, now));
    }
    this.setData({ messages, scrollAnchor: this.flipAnchor() });
    if (outcome.followups && outcome.followups.length) this.scheduleFollowups(outcome.followups);
    if (outcome.action && outcome.action.type === 'guide') this.openGuide(outcome.action);
    this.syncSoundState();
  },
  // 确认卡：用户点「取消」。
  cancelSkill(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1 || this.data.messages[index].role !== 'skill-confirm') return;
    const messages = this.data.messages.slice();
    messages[index] = { id, role: 'skill', text: '已取消，今晚先不做这个' };
    this.setData({ messages });
  },
  copyMessage(event) {
    const item = this.data.messages.find((message) => message.id === event.currentTarget.dataset.id);
    if (!item || !item.text) return;
    this.copyToClipboard(item.text, '已复制', '消息内容');
  },
  // 赞/踩互斥切换；再次点击同一枚取消。聚合计数写入本地存储，明细评价同步落一条（进 memory.md）。
  setFeedback(event) {
    const { id, value } = event.currentTarget.dataset;
    if (value !== 'like' && value !== 'dislike') return;
    let chosen = '';
    let text = '';
    const messages = this.data.messages.map((item) => {
      if (item.id !== id) return item;
      chosen = item.feedback === value ? '' : value;
      text = item.text || '';
      return Object.assign({}, item, { feedback: chosen });
    });
    this.setData({ messages });
    // 改口时已写过的理由会保留；取消评价则整条撤回。
    if (chosen) {
      agentReviews.upsert({ messageId: id, value: chosen, quote: text.slice(0, 24) });
      this.rememberFeedback(chosen);
    } else {
      agentReviews.remove(id);
    }
  },
  // 三点菜单：单条消息的更多操作（写评价理由 / 看夜喵记忆）。
  openMessageMenu(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ menuForId: this.data.menuForId === id ? '' : id });
  },
  // 评价弹层：带上这条回复的节选与当前态度，已写过的理由回填可改。
  openReview(event) {
    const id = event.currentTarget.dataset.id;
    const message = this.data.messages.find((item) => item.id === id);
    if (!message) return;
    const existing = agentReviews.find(id);
    const reason = (existing && existing.reason) || '';
    const text = message.text || '';
    this.setData({
      menuForId: '',
      reviewForId: id,
      reviewVote: message.feedback || '',
      reviewQuote: text.length > 24 ? `${text.slice(0, 24)}…` : text,
      reviewDraft: reason,
      reviewHadReason: Boolean(reason),
      canSubmitReview: Boolean(reason),
      inputFocus: false,
      panelOpen: false
    });
    if (wx.hideKeyboard) wx.hideKeyboard();
  },
  onReviewInput(event) {
    const value = event.detail.value || '';
    this.setData({ reviewDraft: value, canSubmitReview: Boolean(value.trim()) || this.data.reviewHadReason });
  },
  closeReview() {
    this.setData({ reviewForId: '', reviewDraft: '', reviewQuote: '', reviewVote: '', reviewHadReason: false, canSubmitReview: false });
  },
  // 提交流程：写理由（保留当前赞/踩）；清空理由表示删掉这句话；无态度无理由则不落任何记录。
  submitReview() {
    const id = this.data.reviewForId;
    if (!id) return;
    const message = this.data.messages.find((item) => item.id === id);
    if (!message) { this.closeReview(); return; }
    const reason = this.data.reviewDraft.trim();
    if (!reason && !this.data.reviewHadReason) return;
    const entry = agentReviews.upsert({ messageId: id, value: message.feedback || '', reason, quote: (message.text || '').slice(0, 24) });
    this.closeReview();
    if (!reason) {
      wx.showToast({ title: '这条理由已删掉', icon: 'none' });
      return;
    }
    if (entry) wx.showToast({ title: '已记进夜喵的记忆', icon: 'none' });
    else wx.showToast({ title: '保存失败，再试一次', icon: 'none' });
  },
  openMemory() {
    this.setData({ menuForId: '' });
    wx.navigateTo({ url: '/pages/night-memory/index' });
  },
  rememberFeedback(kind) {
    try {
      const counts = storage.read(storage.KEYS.agentFeedback, { like: 0, dislike: 0 });
      counts[kind] = (counts[kind] || 0) + 1;
      storage.write(storage.KEYS.agentFeedback, counts);
    } catch (error) { /* 反馈计数不影响对话 */ }
  },
  // 重新生成：清空最后一条夜喵回复并重跑上一轮，不重复用户消息。
  regenerate() {
    const turn = this.lastTurn;
    if (!turn || this.data.chatState === 'sending' || this.data.homeState === 'initial') return;
    const index = this.data.messages.findIndex((item) => item.id === turn.agentId);
    if (index === -1) return;
    turn.restartContext = true;
    const messages = this.data.messages.slice();
    messages[index] = Object.assign({}, messages[index], { text: '', textNodes: [], done: false, error: false, thinking: null, knowledge: null, statusText: '', kbSearching: false, feedback: '', push: null, ask: null });
    // 回复被重写，旧回复上的评价（含理由）随之作废。
    agentReviews.remove(turn.agentId);
    this.setData({ messages, chatState: 'sending', awaitingFirst: true, streamState: 'listening', recommendation: null, homeState: 'chat', sendEcho: '', scrollAnchor: this.flipAnchor() });
    this.runAgentTurn(turn);
  },
  stopGeneration() {
    if (!this.pendingAgent) return;
    this.userStopped = true;
    this.pendingAgent.abort();
    this.stopTts();
  },

  // —— 语音（WechatSI 插件封装见 services/voice-service.js；插件未配置时入口自动隐藏）——
  // 同步开关与可用性：ttsEnabled 持久化在 night-preferences.ttsEnabled。
  syncVoiceState() {
    const preferences = nightPreferences.read();
    this.setData({
      ttsEnabled: Boolean(preferences.ttsEnabled),
      voiceAvailable: voiceService.isAvailable(),
      recording: false
    });
    this.stopTts();
  },
  toggleTts() {
    if (!this.data.voiceAvailable) { wx.showToast({ title: '语音插件未启用', icon: 'none' }); return; }
    const ttsEnabled = !this.data.ttsEnabled;
    nightPreferences.save({ ttsEnabled });
    this.setData({ ttsEnabled });
    if (!ttsEnabled) this.stopTts();
    else wx.showToast({ title: '夜喵会读出回复', icon: 'none' });
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (error) { /* 触感失败不影响开关 */ } }
  },
  stopTts() {
    if (this.speakSession) { this.speakSession.stop(); this.speakSession = null; }
    voiceService.stopSpeaking();
    if (this.data && (this.data.ttsSpeaking || this.data.speakingId)) this.setData({ ttsSpeaking: false, speakingId: '' });
  },
  maybeSpeak(text) {
    if (!this.data.ttsEnabled || !this.data.voiceAvailable) return;
    this.speakNow(text);
  },
  speakNow(text) {
    this.stopTts();
    const session = voiceService.speak(text, {
      onStart: () => this.setData({ ttsSpeaking: true }),
      onDone: () => this.setData({ ttsSpeaking: false }),
      onError: () => this.setData({ ttsSpeaking: false })
    });
    if (session) this.speakSession = session;
  },
  // 消息操作栏「播放」：朗读这一条夜喵回复；播放中再点一次即停。
  speakMessage(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.voiceAvailable) { wx.showToast({ title: '语音插件未启用', icon: 'none' }); return; }
    if (this.data.speakingId === id) { this.stopTts(); return; }
    const message = this.data.messages.find((item) => item.id === id);
    if (!message || !message.text) return;
    this.stopTts();
    const session = voiceService.speak(message.text, {
      onStart: () => this.setData({ ttsSpeaking: true, speakingId: id }),
      onDone: () => this.setData({ ttsSpeaking: false, speakingId: '' }),
      onError: () => this.setData({ ttsSpeaking: false, speakingId: '' })
    });
    if (session) {
      this.speakSession = session;
      this.setData({ speakingId: id });
    }
  },
  // 按住说话：touchstart 起、touchend 停；识别结果回填输入框，由用户确认后再发送。
  ensureRecognizer() {
    if (this.recognizer) return this.recognizer;
    this.recognizer = voiceService.createRecognizer({
      onPartial: (text) => this.setData({ draft: text, canSend: Boolean(String(text || '').trim()) }),
      onFinal: (text) => {
        const value = String(text || '').trim();
        if (value) this.setData({ draft: value, canSend: true });
        else wx.showToast({ title: '没听清，再试一次', icon: 'none' });
        this.setData({ recording: false });
      },
      onError: (kind) => {
        this.setData({ recording: false });
        if (kind === 'auth') {
          wx.showModal({
            title: '需要麦克风权限',
            content: '去设置里允许「麦克风」后，就可以按住说话了。',
            confirmText: '去设置',
            cancelText: '先不用',
            success: (res) => { if (res.confirm && wx.openSetting) wx.openSetting(); }
          });
        } else if (kind !== 'unavailable') {
          wx.showToast({ title: '没听清，再试一次', icon: 'none' });
        }
      }
    });
    return this.recognizer;
  },
  onMicStart() {
    if (this.data.chatState === 'sending' || this.data.aiLocked) return;
    const recognizer = this.ensureRecognizer();
    if (!recognizer.available) return;
    this.setData({ recording: true, panelOpen: false });
    recognizer.start();
  },
  onMicEnd() {
    if (!this.data.recording) return;
    this.setData({ recording: false });
    if (this.recognizer) this.recognizer.stop();
  }
});
