function getNavigationMetrics() {
  let statusBarHeight = 24;
  let menuTop = 32;
  let menuBottom = 68;
  let windowWidth = 375;
  let rightInset = 104;
  try {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    windowWidth = windowInfo.windowWidth || windowInfo.screenWidth || windowWidth;
    statusBarHeight = windowInfo.statusBarHeight || statusBarHeight;
  } catch (error) {}
  try {
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    if (menu && menu.bottom) {
      menuTop = menu.top;
      menuBottom = menu.bottom;
      rightInset = Math.max(16, windowWidth - menu.left + 8);
    }
  } catch (error) {}
  const capsuleGap = Math.max(8, menuTop - statusBarHeight);
  const navigationBottom = menuBottom + capsuleGap;
  return {
    statusBarHeight,
    navigationHeight: navigationBottom - statusBarHeight,
    navigationBottom,
    rightInset,
    topbarStyle: `box-sizing:border-box;height:${navigationBottom}px;padding-top:${statusBarHeight}px;padding-right:${rightInset}px;`
  };
}
module.exports = { getNavigationMetrics };
