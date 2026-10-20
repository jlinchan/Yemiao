// 心理援助热线地区数据（求助卡「按地区查看更多热线」）。
// 数据来源：用户提供清单（2026-10），发布前需抽查核对；北京同志中心跨性别热线的
// 第三方表单链接未收录（小程序无法打开外链）。
// 结构：[{ key, name, hotlines: [{ name, contact, hours, copy }] }]，hours 兼作补充说明行；
// copy 缺省时页面按 contact 复制。第一组（浙江）为默认组——校园语境下大多数用户在浙江。

const SAFETY_REGIONS = [
  {
    key: 'zhejiang', name: '浙江（默认）',
    hotlines: [
      { name: '浙江省统一心理援助热线', contact: '96525', hours: '24 小时', copy: '96525' },
      { name: '杭州市心理危机干预热线', contact: '0571-85029595', hours: '24 小时', copy: '0571-85029595' },
      { name: '浙江省高校大学生心理援助热线', contact: '0571-85109955', hours: '9:00-21:00', copy: '0571-85109955' }
    ]
  },
  {
    key: 'national', name: '全国热线',
    hotlines: [
      { name: '全国统一心理援助热线', contact: '12356', hours: '24 小时 · 免费', copy: '12356' },
      { name: '卫生健康热线', contact: '12320' },
      { name: '全国青少年心理咨询热线', contact: '12355' },
      { name: '全国妇女儿童心理咨询热线', contact: '12338' },
      { name: '北京心理危机研究与干预中心', contact: '010-82951332', hours: '座机 800-810-1117 · www.crisis.org.cn', copy: '010-82951332' },
      { name: '教育部华中师大心理援助平台', contact: '4009678920', hours: '备选 010-67440033 / 027-59427263', copy: '4009678920' },
      { name: '清华大学珍惜生命大学生热线', contact: '4006-525-521', hours: '每天 16:30-22:30', copy: '4006-525-521' }
    ]
  },
  {
    key: 'beijing', name: '北京',
    hotlines: [
      { name: '北京市心理援助热线', contact: '010-88585821' },
      { name: '北京安定医院心理咨询热线', contact: '010-58303286' },
      { name: '"启明灯"中国科学院大学心理援助热线', contact: '4006525580', copy: '4006525580' },
      { name: '跨性别支持热线（北京同志中心）', contact: '13021165027', hours: '每天 10:00-17:00', copy: '13021165027' }
    ]
  },
  {
    key: 'tianjin', name: '天津',
    hotlines: [
      { name: '天津市心理援助热线', contact: '022-88188858' },
      { name: '天津大学心理援助热线', contact: '4001001895', copy: '4001001895' }
    ]
  },
  {
    key: 'hebei', name: '河北',
    hotlines: [
      { name: '河北省心理援助热线', contact: '0312-96312' },
      { name: '衡水市心理援助热线', contact: '0318-2117120', copy: '03182117120' }
    ]
  },
  {
    key: 'neimenggu', name: '内蒙古',
    hotlines: [
      { name: '内蒙古自治区心理援助热线', contact: '0471-12320', hours: '接通后转 5', copy: '047112320' },
      { name: '包头市第六医院心理援助热线', contact: '0472-2625521', copy: '04722625521' }
    ]
  },
  {
    key: 'shanghai', name: '上海',
    hotlines: [
      { name: '上海市心理热线', contact: '021-962525', copy: '021962525' },
      { name: '上海市心理咨询预约', contact: '021-51699291', copy: '02151699291' }
    ]
  },
  {
    key: 'jiangsu', name: '江苏',
    hotlines: [
      { name: '江苏省心理危机干预热线', contact: '025-83712977', copy: '02583712977' },
      { name: '南京市危机干预中心', contact: '025-86528082', copy: '02586528082' }
    ]
  },
  {
    key: 'shandong', name: '山东',
    hotlines: [
      { name: '山东省精神卫生中心心理援助热线', contact: '0531-86336666', copy: '053186336666' },
      { name: '青岛市心理援助热线', contact: '0532-85669120', copy: '053285669120' }
    ]
  },
  {
    key: 'shanxi', name: '山西',
    hotlines: [
      { name: '山西省心理援助热线', contact: '0351-8726199', copy: '03518726199' }
    ]
  },
  {
    key: 'anhui', name: '安徽',
    hotlines: [
      { name: '合肥市第四人民医院', contact: '0551-63666903', copy: '05516366903' },
      { name: '黄山市第二人民医院', contact: '0559-2591072', copy: '05592591072' }
    ]
  },
  {
    key: 'hubei', name: '湖北',
    hotlines: [
      { name: '湖北省社会心理学会心理援助热线', contact: '027-87832211', copy: '02787832211' },
      { name: '武汉市精神卫生中心', contact: '027-85844666', copy: '02785844666' }
    ]
  },
  {
    key: 'hunan', name: '湖南',
    hotlines: [
      { name: '心理健康服务热线', contact: '0731-85292999', copy: '073185292999' }
    ]
  },
  {
    key: 'jiangxi', name: '江西',
    hotlines: [
      { name: '江西省社会心理服务热线', contact: '0791-966525', copy: '0791966525' }
    ]
  },
  {
    key: 'henan', name: '河南',
    hotlines: [
      { name: '河南省心理援助热线', contact: '0373-7095888', copy: '03737095888' }
    ]
  },
  {
    key: 'guangdong', name: '广东',
    hotlines: [
      { name: '广州市心理援助热线', contact: '020-81899120', copy: '02081899120' },
      { name: '广东省心理援助公益', contact: '020-81777652', copy: '02081777652' }
    ]
  },
  {
    key: 'guangxi', name: '广西',
    hotlines: [
      { name: '广西心理援助热线', contact: '0772-3136120', copy: '07723136120' }
    ]
  },
  {
    key: 'fujian', name: '福建',
    hotlines: [
      { name: '泉州市心理援助热线', contact: '0595-968908', copy: '0595968908' }
    ]
  },
  {
    key: 'heilongjiang', name: '黑龙江',
    hotlines: [
      { name: '黑龙江省危机干预热线', contact: '0451-12320', copy: '045112320' }
    ]
  },
  {
    key: 'jilin', name: '吉林',
    hotlines: [
      { name: '长春市心理危机援助热线', contact: '0431-89685000', copy: '043189685000' }
    ]
  },
  {
    key: 'liaoning', name: '辽宁',
    hotlines: [
      { name: '辽宁省心理援助热线', contact: '024-96687', copy: '02496687' },
      { name: '辽宁省精神卫生中心援助热线', contact: '024-73377120', copy: '02473377120' }
    ]
  },
  {
    key: 'sichuan', name: '四川',
    hotlines: [
      { name: '四川省心理援助热线', contact: '96111', copy: '96111' },
      { name: '成都市心理援助热线', contact: '028-87577510', copy: '02887577510' }
    ]
  },
  {
    key: 'chongqing', name: '重庆',
    hotlines: [
      { name: '重庆市心理援助热线', contact: '023-96320-1', hours: '接通后按 1', copy: '02396320' }
    ]
  },
  {
    key: 'guizhou', name: '贵州',
    hotlines: [
      { name: '贵州省心理援助热线', contact: '0851-88417888', copy: '085188417888' }
    ]
  },
  {
    key: 'yunnan', name: '云南',
    hotlines: [
      { name: '昆明市心理援助热线', contact: '0871-6501111', copy: '08716501111' }
    ]
  },
  {
    key: 'xizang', name: '西藏',
    hotlines: [
      { name: '西藏自治区心理咨询热线', contact: '0891-12320', copy: '089112320' }
    ]
  },
  {
    key: 'shaanxi', name: '陕西',
    hotlines: [
      { name: '西安市精神卫生中心心理援助热线', contact: '400-8960960', copy: '4008960960' },
      { name: '陕西省精神卫生中心咨询电话', contact: '029-63609288', copy: '02963609288' }
    ]
  },
  {
    key: 'qinghai', name: '青海',
    hotlines: [
      { name: '青海省第三人民医院心理咨询热线', contact: '0971-8140371', copy: '09718140371' }
    ]
  },
  {
    key: 'gansu', name: '甘肃',
    hotlines: [
      { name: '兰州市心理援助热线', contact: '0931-4638858', copy: '09314638858' }
    ]
  },
  {
    key: 'ningxia', name: '宁夏',
    hotlines: [
      { name: '宁夏心理援助热线', contact: '0951-2160707', copy: '09512160707' }
    ]
  },
  {
    key: 'xinjiang', name: '新疆',
    hotlines: [
      { name: '新疆心理援助热线', contact: '0991-3016111', copy: '09913016111' }
    ]
  },
  {
    key: 'hainan', name: '海南',
    hotlines: [
      { name: '海南省心理援助热线', contact: '0898-96363', copy: '089896363' }
    ]
  }
];

module.exports = { SAFETY_REGIONS };
