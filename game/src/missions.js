// Missions: three core story jobs (Barrio Run → Dockyard Heat → Solmar
// Sunset Showdown) plus side contracts that reuse the same step machine
// (goto / steal / grab / escape / eliminate) — no new mechanics for the
// side content. One state machine, driven by the fixed-step loop.
import * as THREE from 'three';
import { MISSIONS, CONTRACTS, COINS } from './config.js';
import { range } from './random.js';

const GARAGE = { x: -196, z: 182 }; // Barrio safehouse / contract board

export function createMissions(scene, rng, deps) {
  const { city, vehicles, people, combat, wanted, events } = deps;
  let missionIndex = 0; // 0..2 story; 3 = story done
  let stepIndex = 0;
  let active = false; // a story mission is running
  let stepTimer = 0;
  let killsLeft = 0;
  let contract = null; // active side contract {def, step, timer}
  let contractIndex = 0;
  let storyComplete = false;
  let coinsCollected = 0;

  // --- Item meshes for grab steps ---
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.2, 1.6),
    new THREE.MeshLambertMaterial({ color: 0xc77f2a }),
  );
  crate.position.set(-196, 0.6, -178);
  crate.visible = false;
  scene.add(crate);
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.7, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x2a8a4a }),
  );
  bag.position.set(112, 0.35, -112);
  bag.visible = false;
  scene.add(bag);

  // --- Solmar coins (10, seeded spots) ---
  const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa7711, emissiveIntensity: 0.8 });
  const coins = [];
  const coinSpots = [
    [-280, 0], [280, -280], [0, 280], [-280, -280], [280, 280],
    [505, -70], [505, 70], [340, -140], [-140, -280], [56, 224],
  ];
  for (const [x, z] of coinSpots) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(x, 1, z);
    m.rotation.x = Math.PI / 2;
    scene.add(m);
    coins.push({ x, z, mesh: m, taken: false });
  }

  function mission() { return MISSIONS[missionIndex]; }
  function step() { return mission() ? mission().steps[stepIndex] : null; }

  function setWaypoint(x, z, show) {
    city.setWaypoint(x, z, show);
  }

  function startStep() {
    const s = step();
    if (!s) { completeMission(); return; }
    if (s.type === 'escape') {
      stepTimer = s.time;
      wanted.setHeat(s.wanted * 20);
    }
    if (s.type === 'eliminate') {
      killsLeft = s.count;
      const px = 112;
      const pz = -112;
      for (let i = 0; i < s.count; i += 1) {
        combat.spawnEnemy(px + range(rng, -14, 14), pz + range(rng, -14, 14));
      }
    }
    if (s.type === 'grab' && missionIndex === 1) crate.visible = true;
    if (s.type === 'grab' && missionIndex === 2) bag.visible = true;
    const wp = waypoint();
    if (wp) setWaypoint(wp.x, wp.z, true);
  }

  function startMission(i) {
    missionIndex = i;
    stepIndex = 0;
    active = true;
    events.push({ type: 'mission-start', mission: MISSIONS[i] });
    startStep();
  }

  // Jump straight to a mission step (screenshot staging): same start logic,
  // no progression played through.
  function jumpTo(missionIdx, stepIdx) {
    missionIndex = missionIdx;
    stepIndex = stepIdx;
    active = true;
    contract = null;
    events.push({ type: 'mission-start', mission: MISSIONS[missionIdx] });
    startStep();
  }

  function completeMission() {
    const m = mission();
    active = false;
    setWaypoint(0, 0, false);
    crate.visible = false;
    bag.visible = false;
    combat.clearEnemies();
    events.push({ type: 'mission-complete', mission: m, reward: m.reward });
    missionIndex += 1;
    if (missionIndex >= MISSIONS.length) {
      storyComplete = true;
      events.push({ type: 'story-complete' });
    } else {
      // Next mission starts on arrival at the safehouse, or right away —
      // start it right away so the story never stalls.
      startMission(missionIndex);
    }
  }

  function failMission(reason) {
    active = false;
    setWaypoint(0, 0, false);
    combat.clearEnemies();
    wanted.setHeat(0);
    events.push({ type: 'mission-failed', mission: mission(), reason });
    // Restart the same mission from its first step.
    startMission(missionIndex);
  }

  function waypoint() {
    if (contract) {
      const c = contract.def;
      if (c.kind === 'courier') {
        const p = c.points[contract.step];
        return p ? { x: p[0], z: p[1] } : null;
      }
      if (c.kind === 'taxi') {
        return contract.step === 0 ? { x: c.pickup[0], z: c.pickup[1] } : { x: c.drop[0], z: c.drop[1] };
      }
      if (c.kind === 'stunt') return { x: c.x, z: c.z };
      return null;
    }
    if (!active) return null;
    const s = step();
    if (!s) return null;
    if (s.type === 'goto' || s.type === 'drive' || s.type === 'escape') return { x: s.x, z: s.z };
    if (s.type === 'grab') return { x: s.x, z: s.z };
    if (s.type === 'eliminate') return { x: 112, z: -112 };
    if (s.type === 'steal') {
      const comet = vehicles.cometCar;
      return comet ? { x: comet.x, z: comet.z } : null;
    }
    return null;
  }

  function label() {
    if (contract) {
      const c = contract.def;
      if (c.kind === 'courier') return `Deliver package ${contract.step + 1} of ${c.points.length}`;
      if (c.kind === 'taxi') return contract.step === 0 ? 'Pick up the passenger' : 'Drop off the passenger';
      if (c.kind === 'stunt') return 'Hit the stunt jump at speed!';
      return c.title;
    }
    if (!active) return storyComplete ? 'Free roam — story complete!' : 'No active mission';
    const s = step();
    return s ? s.label : '';
  }

  function title() {
    if (contract) return contract.def.title;
    if (!active) return storyComplete ? 'Solmar Bay — Free Roam' : 'Solmar Bay';
    return mission().title;
  }

  // E pressed: grab items / start contracts at the garage board.
  function tryInteract(player) {
    const px = player.x;
    const pz = player.z;
    if (contract) return false;
    if (active) {
      const s = step();
      if (s && s.type === 'grab' && Math.hypot(px - s.x, pz - s.z) < s.r + 1) {
        if (missionIndex === 1) crate.visible = false;
        if (missionIndex === 2) bag.visible = false;
        stepIndex += 1;
        startStep();
        return true;
      }
      return false;
    }
    // No active mission: contract board at the garage.
    if (Math.hypot(px - GARAGE.x, pz - GARAGE.z) < 8 && contractIndex < CONTRACTS.length) {
      startContract(CONTRACTS[contractIndex]);
      return true;
    }
    return false;
  }

  function startContract(def) {
    contract = { def, step: 0, timer: def.time };
    events.push({ type: 'contract-start', contract: def });
    const wp = waypoint();
    if (wp) setWaypoint(wp.x, wp.z, true);
  }

  function completeContract() {
    const def = contract.def;
    contract = null;
    setWaypoint(0, 0, false);
    contractIndex += 1;
    events.push({ type: 'contract-complete', contract: def, reward: def.reward });
  }

  function failContract(reason) {
    contract = null;
    setWaypoint(0, 0, false);
    events.push({ type: 'contract-failed', reason });
  }

  function update(dt, player, playerDriving, currentCar) {
    // While driving, the car's position is the player's position for every
    // distance check (waypoints, coins, deliveries, escapes).
    const px = playerDriving && currentCar ? currentCar.x : player.x;
    const pz = playerDriving && currentCar ? currentCar.z : player.z;
    // Coins (always collectible).
    for (const c of coins) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 2;
      if (Math.hypot(px - c.x, pz - c.z) < 2.2) {
        c.taken = true;
        c.mesh.visible = false;
        coinsCollected += 1;
        events.push({ type: 'coin', count: coinsCollected });
      }
    }

    if (contract) {
      const c = contract.def;
      contract.timer -= dt;
      if (contract.timer <= 0) { failContract('Out of time'); return; }
      if (c.kind === 'courier') {
        const p = c.points[contract.step];
        if (Math.hypot(px - p[0], pz - p[1]) < 7) {
          contract.step += 1;
          if (contract.step >= c.points.length) completeContract();
          else { const wp = waypoint(); if (wp) setWaypoint(wp.x, wp.z, true); }
        }
      } else if (c.kind === 'taxi') {
        const target = contract.step === 0 ? c.pickup : c.drop;
        if (Math.hypot(px - target[0], pz - target[1]) < 7) {
          if (contract.step === 0) {
            contract.step = 1;
            const wp = waypoint();
            if (wp) setWaypoint(wp.x, wp.z, true);
          } else completeContract();
        }
      } else if (c.kind === 'stunt') {
        const speed = currentCar ? Math.abs(currentCar.speed) : 0;
        if (Math.hypot(px - c.x, pz - c.z) < c.r && playerDriving && speed > 20) {
          completeContract();
        }
      }
      return;
    }

    if (!active) return;
    const s = step();
    if (!s) return;
    if (s.type === 'goto') {
      if (Math.hypot(px - s.x, pz - s.z) < s.r) { stepIndex += 1; startStep(); }
    } else if (s.type === 'drive') {
      if (playerDriving && Math.hypot(px - s.x, pz - s.z) < s.r) { stepIndex += 1; startStep(); }
    } else if (s.type === 'steal') {
      if (playerDriving && currentCar && currentCar.name === 'comet') { stepIndex += 1; startStep(); }
    } else if (s.type === 'eliminate') {
      const alive = combat.enemies.filter((e) => e.alive).length;
      if (alive === 0 && killsLeft > 0) { stepIndex += 1; startStep(); }
    } else if (s.type === 'escape') {
      stepTimer -= dt;
      if (stepTimer <= 0) { failMission('The police caught up — out of time'); return; }
      if (Math.hypot(px - s.x, pz - s.z) < s.r) {
        wanted.clear();
        stepIndex += 1;
        startStep();
      }
    }
  }

  return {
    get missionIndex() { return missionIndex; },
    get active() { return active; },
    get storyComplete() { return storyComplete; },
    get coinsCollected() { return coinsCollected; },
    get contractAvailable() { return !active && !contract && contractIndex < CONTRACTS.length; },
    get stepTimer() { return stepTimer; },
    startMission,
    jumpTo,
    update,
    waypoint,
    label,
    title,
    tryInteract,
    // Save/load hooks.
    getState() {
      return { missionIndex, storyComplete, coinsCollected, contractIndex };
    },
    setState(st) {
      missionIndex = Math.min(st.missionIndex || 0, MISSIONS.length);
      storyComplete = !!st.storyComplete;
      contractIndex = st.contractIndex || 0;
      coinsCollected = st.coinsCollected || 0;
      for (let i = 0; i < coinsCollected && i < coins.length; i += 1) {
        coins[i].taken = true;
        coins[i].mesh.visible = false;
      }
      if (missionIndex < MISSIONS.length) startMission(missionIndex);
    },
  };
}
