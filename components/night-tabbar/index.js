const ROUTES = {
  home: '/pages/home/index',
  relax: '/pages/breathe/index',
  records: '/pages/record/index'
};

Component({
  properties: {
    active: { type: String, value: 'home' },
    variant: { type: String, value: 'default' },
    accent: { type: String, value: '#f0dfa0' },
    triggerActive: { type: Boolean, value: false }
  },

  data: {
    items: [
      {
        key: 'home',
        label: '首页',
        icon: '/assets/home/icons/icon-nav-home-muted.png',
        iconActive: '/assets/home/icons/icon-nav-home.png'
      },
      {
        key: 'relax',
        label: '放松',
        icon: '/assets/home/icons/icon-nav-relax-muted.png',
        iconActive: '/assets/home/icons/icon-nav-relax.png'
      },
      {
        key: 'records',
        label: '记录',
        icon: '/assets/home/icons/icon-nav-record-muted.png',
        iconActive: '/assets/home/icons/icon-nav-record.png'
      }
    ]
  },

  methods: {
    onTap(event) {
      const key = event.currentTarget.dataset.key;
      const url = ROUTES[key];
      if (!url) return;
      if (key === this.data.active) {
        if (this.data.triggerActive) this.triggerEvent('active', { key });
        return;
      }
      wx.reLaunch({ url });
    }
  }
});
