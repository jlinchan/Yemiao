// 与小程序一致的 setData 语义：支持 'messages[3].text' 这类数据路径。
function assignPath(target, path, value) {
  const parts = String(path).match(/[^.[\]]+/g) || [];
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node = node[parts[i]];
    if (node === null || node === undefined) return;
  }
  if (parts.length) node[parts[parts.length - 1]] = value;
}

module.exports = function setData(data, values) {
  Object.keys(values).forEach((key) => assignPath(data, key, values[key]));
};
