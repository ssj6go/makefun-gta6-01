// Saving to localStorage: cash, mission progress, health, ammo and the
// player's position. Saved automatically when a mission passes and when
// the player uses the safehouse; loaded from the title screen's Continue.
import { SAVE_KEY } from './config.js';
import { PLACES } from './city.js';

export function saveGame(world, missions, police) {
  try {
    const p = world.player;
    const data = {
      version: 1,
      savedAt: Date.now(),
      cash: p.cash,
      health: p.health,
      ammo: p.ammo,
      missionIndex: missions.index,
      missionPhase: missions.phase === 'done' ? 'done' : 'brief',
      x: p.x,
      y: p.y,
      stars: 0,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(world, missions, police, data) {
  const p = world.player;
  p.cash = data.cash;
  p.health = data.health;
  p.ammo = data.ammo;
  p.x = data.x;
  p.y = data.y;
  p.inCar = null;
  p.dead = false;
  missions.index = Math.min(data.missionIndex, 4);
  if (data.missionPhase === 'done') {
    missions.index = 5;
    missions.phase = 'done';
    missions.allDone = true;
  } else {
    missions.step = 0;
    missions.phase = 'brief';
    missions.briefTimer = 5;
    missions.stepEntered = false;
  }
  police.stars = 0;
  world.rivals = [];
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // Storage may be unavailable; a missing save is the same as none.
  }
}

/** The safehouse marker: standing here and pressing E saves the game. */
export function nearSafehouse(player) {
  return Math.hypot(player.x - PLACES.safehouse.x, player.y - PLACES.safehouse.y) < 70;
}
