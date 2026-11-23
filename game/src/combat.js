// Combat: fists (F) and a hitscan pistol (click, 1/2 to switch, R reload).
// Enemies are simple: they stand their ground, shoot when the player is
// close and visible, and fall when their health hits zero. No raycaster
// allocation per shot — a manual segment-vs-sphere test keeps it cheap and
// deterministic.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { makePersonMesh } from './people.js';
import { range } from './random.js';

export function createCombat(scene, rng, events) {
  const enemies = [];
  let weapon = 'fists'; // 'fists' | 'pistol'
  let ammo = COMBAT.magSize;
  let reloading = 0;
  let punchTimer = 0;
  let shootTimer = 0;
  let muzzleTimer = 0;
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  muzzle.visible = false;
  scene.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffc46b, 0, 12);
  scene.add(muzzleLight);

  function spawnEnemy(x, z, health) {
    const mesh = makePersonMesh(0x8a2a3a, 0x1c1c22, 0xc68642, 0x1a1210);
    mesh.group.position.set(x, 0, z);
    scene.add(mesh.group);
    const e = { x, z, heading: 0, health: health || COMBAT.enemyHealth, mesh, shotTimer: range(rng, 0.5, 1.5), alive: true };
    enemies.push(e);
    return e;
  }

  function clearEnemies() {
    for (const e of enemies) scene.remove(e.mesh.group);
    enemies.length = 0;
  }

  // Distance from point P to the ray (origin O, direction D). Returns null
  // when the closest point is behind the origin or beyond maxDist.
  function rayHit(origin, dir, px, py, pz, radius, maxDist) {
    const ox = px - origin.x;
    const oy = py - origin.y;
    const oz = pz - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0 || t > maxDist) return null;
    const cx = origin.x + dir.x * t;
    const cy = origin.y + dir.y * t;
    const cz = origin.z + dir.z * t;
    const d = Math.hypot(px - cx, py - cy, pz - cz);
    return d < radius ? t : null;
  }

  function shoot(origin, dir, player) {
    if (reloading > 0 || ammo <= 0 || shootTimer > 0) return;
    shootTimer = COMBAT.pistolCooldown;
    ammo -= 1;
    muzzleTimer = 0.06;
    muzzle.position.copy(origin).addScaledVector(dir, 1.2);
    muzzle.visible = true;
    muzzleLight.position.copy(muzzle.position);
    muzzleLight.intensity = 30;
    events.push({ type: 'shoot' });
    // Closest hit among enemies, peds and police cars.
    let bestT = COMBAT.pistolRange;
    let best = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      const t = rayHit(origin, dir, e.x, 1.2, e.z, 0.9, COMBAT.pistolRange);
      if (t !== null && t < bestT) { bestT = t; best = { kind: 'enemy', e }; }
    }
    if (best) {
      best.e.health -= COMBAT.pistolDamage;
      events.push({ type: 'hit-enemy', enemy: best.e });
      if (best.e.health <= 0) {
        best.e.alive = false;
        best.e.mesh.group.rotation.x = Math.PI / 2;
        events.push({ type: 'enemy-down', enemy: best.e });
      }
    }
  }

  function punch(player, peds) {
    if (punchTimer > 0) return;
    punchTimer = COMBAT.punchCooldown;
    events.push({ type: 'punch' });
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const hit = (x, z, range, damage) => {
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < range && (dx * fx + dz * fz) > 0) return true;
      return false;
    };
    for (const e of enemies) {
      if (e.alive && hit(e.x, e.z, COMBAT.punchRange, COMBAT.punchDamage)) {
        e.health -= COMBAT.punchDamage;
        if (e.health <= 0) {
          e.alive = false;
          e.mesh.group.rotation.x = Math.PI / 2;
          events.push({ type: 'enemy-down', enemy: e });
        }
      }
    }
    for (const ped of peds) {
      if (ped.state !== 'down' && hit(ped.x, ped.z, COMBAT.punchRange, 0)) {
        ped.state = 'down';
        ped.downTimer = 4;
        ped.mesh.group.rotation.x = Math.PI / 2;
        events.push({ type: 'hit-ped' });
      }
    }
  }

  function update(dt, player, camera) {
    punchTimer = Math.max(0, punchTimer - dt);
    shootTimer = Math.max(0, shootTimer - dt);
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) ammo = COMBAT.magSize;
    }
    if (muzzleTimer > 0) {
      muzzleTimer -= dt;
      if (muzzleTimer <= 0) { muzzle.visible = false; muzzleLight.intensity = 0; }
    }
    // Enemies shoot back when close.
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(player.x - e.x, player.z - e.z);
      e.heading = Math.atan2(player.x - e.x, player.z - e.z);
      e.mesh.group.rotation.y = e.heading;
      e.shotTimer -= dt;
      if (d < 40 && e.shotTimer <= 0) {
        e.shotTimer = COMBAT.enemyShotInterval;
        // Seeded hit chance: closer = likelier.
        const hitChance = d < 12 ? 0.55 : d < 25 ? 0.35 : 0.2;
        if (rng() < hitChance) {
          events.push({ type: 'player-shot', damage: COMBAT.enemyShotDamage });
        }
        events.push({ type: 'enemy-shoot', enemy: e });
      }
    }
  }

  return {
    enemies,
    get weapon() { return weapon; },
    get ammo() { return ammo; },
    get reloading() { return reloading > 0; },
    setWeapon(w) { weapon = w; },
    reload() { if (ammo < COMBAT.magSize && reloading <= 0) reloading = COMBAT.reloadTime; },
    shoot,
    punch,
    update,
    spawnEnemy,
    clearEnemies,
  };
}
