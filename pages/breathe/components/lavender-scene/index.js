const { fitLavender, createLavenderLayers } = require('../../utils/lavender-layout');

Component({
  data: {
    sceneStyle: '',
    sprigs: createLavenderLayers(),
    playing: true,
    backgroundFailed: false
  },
  lifetimes: {
    ready() {
      this.mounted = true;
      this.updateLayout();
    },
    detached() {
      this.mounted = false;
    }
  },
  pageLifetimes: {
    resize() { this.updateLayout(); },
    hide() { this.setData({ playing: false }); },
    show() {
      this.setData({ playing: true });
      if (this.mounted) this.updateLayout();
    }
  },
  methods: {
    updateLayout() {
      this.createSelectorQuery().select('.lavender-scene').boundingClientRect((rect) => {
        if (!this.mounted) return;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this.setData({ sceneStyle: fitLavender(rect && rect.width || info.windowWidth, rect && rect.height || info.windowHeight) });
      }).exec();
    },
    onBackgroundError() {
      if (!this.data.backgroundFailed) this.setData({ backgroundFailed: true });
    },
    onSprigError() {
      // Restore the intact photo if a layer fails instead of leaving a blank hole.
      this.setData({ backgroundFailed: true });
    }
  }
});
