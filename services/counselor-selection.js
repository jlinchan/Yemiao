/**
 * 咨询师选中状态：本地存储，页面刷新后保持上次选择。
 * 这里只做本地持久化，不涉及任何服务端接口。
 */
const STORAGE_KEY = 'nightcat.counselor';
const DEFAULT_ID = 'sleep';
const directory = require('../data/counselor-directory');

function normalize(id) {
  return directory.findCounselor(id) ? id : DEFAULT_ID;
}

function read() {
  try {
    const value = wx.getStorageSync(STORAGE_KEY);
    return normalize(value);
  } catch (error) {
    return DEFAULT_ID;
  }
}

function save(id) {
  const value = normalize(id);
  try {
    wx.setStorageSync(STORAGE_KEY, value);
  } catch (error) {
    // 存储失败不影响交互，页面内部仍然保留本次选择
  }
  return value;
}

function clear() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {}
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_ID,
  normalize,
  read,
  save,
  clear
};
