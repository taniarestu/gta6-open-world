// Wanted: heat 0–100 maps to 0–5 stars. Crimes add heat; heat decays only
// while no police is near and no crime happened recently. Police presence
// follows the star count; clearing happens at the safehouse or by swapping
// cars and staying quiet. Pure sim state — no wall clock anywhere.
import { WANTED } from './config.js';

export function createWanted(vehicles, people) {
  let heat = 0;
  let quietTime = 0; // seconds since the last crime

  function stars() {
    return Math.min(WANTED.maxStars, Math.ceil(heat / 20));
  }

  function addHeat(amount) {
    heat = Math.min(WANTED.maxHeat, heat + amount);
    quietTime = 0;
    syncPolice();
  }

  function syncPolice() {
    const want = stars();
    const have = vehicles.police.length;
    if (want === 0) {
      if (have > 0) vehicles.despawnPolice();
      return;
    }
    const target = Math.min(want, 3);
    if (have < target) {
      vehicles.spawnPolice(target - have, people.player.x, people.player.z);
    } else if (have > target) {
      vehicles.despawnPolice();
      if (target > 0) vehicles.spawnPolice(target, people.player.x, people.player.z);
    }
  }

  function clear() {
    heat = 0;
    syncPolice();
    people.clearCops();
  }

  function update(dt, player, playerDriving) {
    quietTime += dt;
    const policeNear = vehicles.police.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 80)
      || people.cops.length > 0;
    if (quietTime > 10 && !policeNear && heat > 0) {
      heat = Math.max(0, heat - WANTED.decayPerSec * dt);
      syncPolice();
    }
    // Foot cops join the chase while wanted and on foot.
    const want = stars();
    if (want > 0 && !playerDriving && people.cops.length < Math.min(want, 2)) {
      people.spawnCops(1, player.x, player.z);
    }
  }

  return {
    get heat() { return heat; },
    stars,
    addHeat,
    clear,
    update,
    setHeat(v) { heat = Math.max(0, Math.min(WANTED.maxHeat, v)); syncPolice(); },
  };
}
