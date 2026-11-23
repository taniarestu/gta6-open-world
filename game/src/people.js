// People: Mara (the player, on foot), pedestrians on the sidewalks, and
// foot cops who chase and bust her. One shared low-poly humanoid factory so
// every person reads the same at a glance; walk cycles are a simple leg
// swing driven by distance travelled — no animation assets needed.
import * as THREE from 'three';
import { PLAYER, GRID_MIN, GRID_MAX, ROAD_STEP, PALETTE } from './config.js';
import { pick, range, rangeInt } from './random.js';

export function makePersonMesh(shirt, pants, skin, hairColor) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), pantsMat);
  legL.position.set(-0.14, 0.38, 0);
  legL.geometry.translate(0, -0.37, 0);
  legL.position.y = 0.75;
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), shirtMat);
  armL.position.set(-0.4, 1.35, 0);
  armL.geometry.translate(0, -0.28, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.68;
  head.castShadow = true;
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.5),
    new THREE.MeshLambertMaterial({ color: hairColor }),
  );
  hair.position.y = 1.88;
  g.add(legL, legR, torso, armL, armR, head, hair);
  return { group: g, legL, legR, armL, armR, torso, head };
}

function walkAnim(person, distance) {
  const swing = Math.sin(distance * 6) * 0.55;
  person.legL.rotation.x = swing;
  person.legR.rotation.x = -swing;
  person.armL.rotation.x = -swing * 0.7;
  person.armR.rotation.x = swing * 0.7;
}

function collideCircleAABB(x, z, r, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const nx = Math.max(c.x0, Math.min(x, c.x1));
    const nz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 0.0001) return { x: x + r, z, hit: true };
      const d = Math.sqrt(d2);
      return { x: nx + (dx / d) * r, z: nz + (dz / d) * r, hit: true };
    }
  }
  return { x, z, hit: false };
}

export function createPeople(scene, rng, city, events) {
  const colliders = city.colliders;
  const peds = [];
  const cops = [];

  // --- Mara ---
  const maraMesh = makePersonMesh(0x2ec4b6, 0x22223b, 0xe0ac69, 0x1a1210);
  maraMesh.group.position.set(-196, 0, 182);
  scene.add(maraMesh.group);
  const player = {
    x: -196, z: 182, y: 0, vy: 0, heading: Math.PI, onGround: true,
    health: PLAYER.health, armor: 0, mesh: maraMesh, walkDist: 0, driving: false,
  };

  // --- Pedestrians: sidewalk loops on the road grid ---
  for (let i = 0; i < 36; i += 1) {
    const horizontal = rng() < 0.5;
    const line = rangeInt(rng, 0, 10) * ROAD_STEP + GRID_MIN;
    const along = range(rng, GRID_MIN, GRID_MAX);
    const side = rng() < 0.5 ? 9.5 : -9.5;
    const mesh = makePersonMesh(
      pick(rng, PALETTE.pedShirt), 0x2a2a30, pick(rng, PALETTE.pedSkin), pick(rng, [0x1a1210, 0x3a2a1a, 0x6a6a6a, 0x8a5a2a]),
    );
    const x = horizontal ? along : line + side;
    const z = horizontal ? line + side : along;
    mesh.group.position.set(x, 0, z);
    scene.add(mesh.group);
    peds.push({
      x, z, heading: horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      speed: range(rng, 1.2, 2.2), mesh, walkDist: range(rng, 0, 10),
      state: 'walk', downTimer: 0, axis: horizontal ? 'x' : 'z', dir: rng() < 0.5 ? 1 : -1,
    });
  }

  function movePlayer(dt, input, camYaw) {
    const mx = input.moveX();
    const my = input.moveY();
    if (mx === 0 && my === 0) {
      walkAnim(player.mesh, player.walkDist);
      player.mesh.group.rotation.y = player.heading;
      return;
    }
    const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is camera-relative: W walks away from the camera.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = -cos;
    const rightZ = sin;
    const vx = (fwdX * my + rightX * mx) * speed;
    const vz = (fwdZ * my + rightZ * mx) * speed;
    let nx = player.x + vx * dt;
    let nz = player.z + vz * dt;
    const hit = collideCircleAABB(nx, nz, PLAYER.radius, colliders);
    if (hit.hit) { nx = hit.x; nz = hit.z; }
    nx = Math.max(-318, Math.min(636, nx));
    nz = Math.max(-318, Math.min(318, nz));
    player.x = nx;
    player.z = nz;
    player.walkDist += Math.hypot(vx, vz) * dt;
    player.heading = Math.atan2(vx, vz);
    walkAnim(player.mesh, player.walkDist);
    player.mesh.group.position.set(player.x, player.y, player.z);
    player.mesh.group.rotation.y = player.heading;
  }

  function jumpPlayer(dt, actions, ACTION_JUMP) {
    if ((actions & ACTION_JUMP) && player.onGround) {
      player.vy = 7.5;
      player.onGround = false;
    }
    if (!player.onGround) {
      player.vy -= 22 * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; }
      player.mesh.group.position.y = player.y;
    }
  }

  function updatePeds(dt, cars, playerCar, playerDriving) {
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) { ped.state = 'flee'; ped.mesh.group.rotation.x = 0; }
        continue;
      }
      // Flee from a fast car coming close.
      let fleeX = 0;
      let fleeZ = 0;
      for (const car of cars) {
        if (car.kind === 'parked') continue;
        const dx = ped.x - car.x;
        const dz = ped.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 9 && Math.abs(car.speed) > 4) {
          fleeX = dx / (d || 1);
          fleeZ = dz / (d || 1);
          ped.state = 'flee';
          break;
        }
      }
      if (ped.state === 'flee') {
        ped.x += fleeX * 7 * dt;
        ped.z += fleeZ * 7 * dt;
        ped.heading = Math.atan2(fleeX, fleeZ);
        ped.walkDist += 7 * dt;
        if (Math.abs(fleeX) < 0.01 && Math.abs(fleeZ) < 0.01) {
          ped.state = 'walk';
          snapToSidewalk(ped);
        }
      } else {
        // Walk the sidewalk; turn at intersections sometimes.
        const step = ped.speed * ped.dir * dt;
        if (ped.axis === 'x') ped.x += step;
        else ped.z += step;
        const v = ped.axis === 'x' ? ped.x : ped.z;
        if (v > GRID_MAX + 20 || v < GRID_MIN - 20) {
          ped.dir *= -1;
          ped.heading += Math.PI;
        } else if (rng() < dt * 0.02) {
          ped.dir *= -1;
          ped.heading += Math.PI;
        }
        ped.walkDist += ped.speed * dt;
      }
      ped.x = Math.max(-310, Math.min(630, ped.x));
      ped.z = Math.max(-310, Math.min(310, ped.z));
      walkAnim(ped.mesh, ped.walkDist);
      ped.mesh.group.position.set(ped.x, 0, ped.z);
      ped.mesh.group.rotation.y = ped.heading;
      // Hit by a fast car: knocked down, wanted heat.
      for (const car of cars) {
        if (car.kind === 'parked' || ped.state === 'down') continue;
        const d = Math.hypot(ped.x - car.x, ped.z - car.z);
        if (d < 2.2 && Math.abs(car.speed) > 5) {
          ped.state = 'down';
          ped.downTimer = 5;
          ped.mesh.group.rotation.x = Math.PI / 2;
          if (car === playerCar && playerDriving) events.push({ type: 'hit-ped' });
        }
      }
    }
  }

  // After fleeing, step back onto the nearest sidewalk so nobody ends up
  // standing in the middle of the road (or on a car).
  function snapToSidewalk(ped) {
    if (ped.axis === 'x') {
      const line = Math.round((ped.z - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
      ped.z = line + (ped.z >= line ? 9.5 : -9.5);
    } else {
      const line = Math.round((ped.x - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
      ped.x = line + (ped.x >= line ? 9.5 : -9.5);
    }
  }

  function spawnCops(count, x, z) {
    for (let i = 0; i < count; i += 1) {
      const mesh = makePersonMesh(0x1c2733, 0x1c2733, pick(rng, PALETTE.pedSkin), 0x1a1210);
      const cx = x + range(rng, -30, 30);
      const cz = z + range(rng, -30, 30);
      mesh.group.position.set(cx, 0, cz);
      scene.add(mesh.group);
      cops.push({ x: cx, z: cz, heading: 0, mesh, walkDist: 0, bustTimer: 0, life: 25 });
    }
  }

  function clearCops() {
    for (const cop of cops) scene.remove(cop.mesh.group);
    cops.length = 0;
  }

  function updateCops(dt, wantedStars) {
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      cop.life -= dt;
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (player.driving || wantedStars === 0) {
        // Give up: walk away, despawn when far or stale.
        cop.x -= (dx / (d || 1)) * 2 * dt;
        cop.z -= (dz / (d || 1)) * 2 * dt;
        if (cop.life <= 0 || d > 160) {
          scene.remove(cop.mesh.group);
          cops.splice(i, 1);
        }
        continue;
      }
      cop.life = 25;
      const speed = 4.6;
      cop.x += (dx / (d || 1)) * speed * dt;
      cop.z += (dz / (d || 1)) * speed * dt;
      cop.heading = Math.atan2(dx, dz);
      cop.walkDist += speed * dt;
      walkAnim(cop.mesh, cop.walkDist);
      cop.mesh.group.position.set(cop.x, 0, cop.z);
      cop.mesh.group.rotation.y = cop.heading;
      if (d < 2.4) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 2.5) events.push({ type: 'busted' });
      } else {
        cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
      }
    }
  }

  return {
    player, peds, cops,
    movePlayer, jumpPlayer, updatePeds, spawnCops, clearCops, updateCops,
  };
}
