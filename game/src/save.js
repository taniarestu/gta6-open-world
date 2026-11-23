// Save / load through localStorage, fully guarded: storage can be off
// (private windows) or hold corrupt JSON, and the game must still start
// from a deterministic initial state. Only serializable sim state is saved.
import { SAVE_KEY, START_MONEY, START_TIME } from './config.js';

export function defaultSave() {
  return {
    money: START_MONEY,
    missionIndex: 0,
    storyComplete: false,
    coinsCollected: 0,
    contractIndex: 0,
    playerX: -196,
    playerZ: 182,
    timeOfDay: START_TIME,
    wantedHeat: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return { ...defaultSave(), ...data };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* storage unavailable: nothing to clear */ }
}
