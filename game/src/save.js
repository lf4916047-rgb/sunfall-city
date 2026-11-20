// Save / load through localStorage. Keeps money, mission progress, the player's
// position and health — enough to pick up where the last session left off.
import { S } from './state.js';
import { SAVE_KEY } from './config.js';

export function saveGame() {
  try {
    const p = S.player;
    const data = {
      money: S.money,
      missionIdx: S.missionIdx,
      missionsDone: S.stats.missionsDone,
      carsStolen: S.stats.carsStolen,
      px: Math.round(p.x),
      py: Math.round(p.y),
      hp: Math.round(p.hp),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.px !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(data) {
  S.money = data.money;
  S.missionIdx = Math.min(4, data.missionIdx || 0);
  S.stats.missionsDone = data.missionsDone || 0;
  S.stats.carsStolen = data.carsStolen || 0;
  S.player.x = data.px;
  S.player.y = data.py;
  S.player.hp = Math.min(100, data.hp || 100);
  S.player.onFoot = true;
  S.player.inCar = null;
  S.camera.x = data.px;
  S.camera.y = data.py;
}
