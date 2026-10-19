const PHOTO_WIDTH = 864;
const PHOTO_HEIGHT = 1735;
const BOXES = [
  [429, 1321, 501, 1548], [674, 1304, 755, 1532], [137, 1242, 190, 1435],
  [25, 1270, 70, 1440], [265, 1560, 327, 1720], [375, 1530, 431, 1710],
  [585, 1400, 634, 1590], [793, 1395, 845, 1605], [224, 1160, 260, 1310],
  [340, 1190, 378, 1350], [537, 1195, 573, 1355], [750, 1150, 786, 1310]
];

function fitLavender(width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 375;
  const h = Number.isFinite(height) && height > 0 ? height : 667;
  // Cover with the photo itself, rather than its letterboxed Figma frame.
  const scale = Math.max(w / PHOTO_WIDTH, h / PHOTO_HEIGHT);
  const sceneWidth = PHOTO_WIDTH * scale;
  const sceneHeight = PHOTO_HEIGHT * scale;
  return `left:${(w - sceneWidth) / 2}px;top:${(h - sceneHeight) / 2}px;width:${sceneWidth}px;height:${sceneHeight}px;`;
}

function createLavenderLayers() {
  return BOXES.map(([x0, y0, x1, y1], id) => {
    const width = x1 - x0;
    const height = y1 - y0;
    // The transparent lower half places the rotation pivot at the plant root.
    return {
      id,
      src: `/pages/breathe/assets/lavender/sprig-${id}.png`,
      style: `left:${(x0 - width / 2) / PHOTO_WIDTH * 100}%;top:${y0 / PHOTO_HEIGHT * 100}%;width:${width * 2 / PHOTO_WIDTH * 100}%;height:${height * 2 / PHOTO_HEIGHT * 100}%;`
    };
  });
}

module.exports = { fitLavender, createLavenderLayers };
