function backOrHome() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }
  wx.reLaunch({ url: '/pages/home/index' });
}

// 同一页面内的同一目标只接受一次连续点击，避免快速双击叠加多个页面。
function navigateOnce(page, key, url) {
  if (!url) return false;
  const now = Date.now();
  if (page && page.__navigationKey === key && now - (page.__navigationAt || 0) < 700) return false;
  if (page) {
    page.__navigationKey = key;
    page.__navigationAt = now;
  }
  wx.navigateTo({ url });
  return true;
}

function exitMiniProgram() {
  if (typeof wx.exitMiniProgram === 'function') {
    wx.exitMiniProgram();
    return;
  }
  wx.showToast({ title: '请点击右上角关闭小程序', icon: 'none' });
}

module.exports = {
  backOrHome,
  navigateOnce,
  exitMiniProgram
};
