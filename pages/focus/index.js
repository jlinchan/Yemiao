const focusMode = require('../../services/focus-mode');
const agentPort = require('../../services/agent-port');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: { steps: focusMode.getGuideSteps(), started: false, message: '', nav: getNavigationMetrics() },
  onShow() { this.setData({ nav: getNavigationMetrics() }); },
  goBack() { navigation.backOrHome(); },
  startFocus() {
    focusMode.start().then((result) => {
      this.setData({ started: true, message: result.message });
      // 按钮触发后即换成「回到呼吸空间」，天然只汇报一次
      agentPort.publish('focus', 'focus_started', {});
    });
  },
  returnToBreathe() { wx.reLaunch({ url: '/pages/breathe/index' }); }
});
