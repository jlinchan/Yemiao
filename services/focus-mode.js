const GUIDE_STEPS = [
  { title: '让屏幕安静下来', detail: '可以在系统辅助功能中开启灰度显示。' },
  { title: '暂时放下信息流', detail: '使用屏幕使用时间，为常刷的应用设置限额。' },
  { title: '打开勿扰模式', detail: '从系统控制中心开启专注或勿扰模式。' },
  { title: '回到呼吸空间', detail: '完成设置后，回来做几轮自然呼吸。' }
];

class FocusModeService {
  getMode() {
    return 'guide';
  }

  getGuideSteps() {
    return GUIDE_STEPS;
  }

  start() {
    return Promise.resolve({
      mode: 'guide',
      message: '小程序无法直接更改系统设置，请跟随页面逐项完成。'
    });
  }
}

module.exports = new FocusModeService();
