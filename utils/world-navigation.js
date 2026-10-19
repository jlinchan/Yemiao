const storage = require('../services/storage');
const { WORLDS, IMMERSIVE_WORLD_IDS } = require('./constants');

function getWorld(worldId) {
  return WORLDS.find((item) => item.id === worldId) || null;
}

function isImmersiveWorld(worldId) {
  return IMMERSIVE_WORLD_IDS.includes(worldId);
}

function applyRequestedWorld(worldId) {
  if (!getWorld(worldId)) return storage.getSettings();
  return storage.saveSettings(Object.assign({}, storage.getSettings(), { world: worldId }));
}

module.exports = {
  getWorld,
  isImmersiveWorld,
  applyRequestedWorld
};
