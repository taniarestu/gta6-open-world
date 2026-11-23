// Cars: the player's ride, traffic AI on the road grid, parked cars to steal,
// and police cruisers that chase. Arcade physics (speed + heading, grip lerp),
// circle-vs-AABB building collision, car-vs-car push. Traffic follows the
// grid, stops at red lights, and yields to the car ahead — all from the seed.
import * as THREE from 'three';
import { CAR, GRID_MIN, GRID_MAX, ROAD_STEP, PALETTE } from './config.js';
import { pick, range, rangeInt } from './random.js';
import { snapToRoad } from './city.js';

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x14141a });

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.58, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const glass = new THREE.MeshLambertMaterial({ color: 0xbfd9e8, emissive: 0x223344, emissiveIntensity: 0.4 });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.1), glass);
  windshield.position.set(0, 1.05, 0.9);
  windshield.rotation.x = -0.35;
  group.add(windshield);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
  for (const hx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    hl.position.set(hx, 0.62, 2.21);
    group.add(hl);
  }
  if (isPolice) {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x2233ff, emissiveIntensity: 1.2 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.4), barMat);
    bar.position.set(0, 1.5, -0.25);
    group.add(bar);
    group.userData.lightBar = bar;
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.3, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    badge.position.set(0, 0.55, 2.21);
    group.add(badge);
  }
  return group;
}

// Traffic-light phase shared with the city: 12 s cycle, NS green first half.
export function lightPhase(simSeconds) {
  return Math.floor(simSeconds / 6) % 2 === 0 ? 'ns' : 'ew';
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
      return { x: nx + (dx / d) * r, z: nz + (dz / d) * r, hit: true, nx: dx / d, nz: dz / d };
    }
  }
  return { x, z, hit: false };
}

export function createVehicles(scene, rng, city, events) {
  const colliders = city.colliders;
  const cars = []; // traffic + parked + police
  const police = [];

  function addCar(kind, x, z, heading, color, name) {
    const mesh = makeCarMesh(color, kind === 'police');
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      kind, name: name || '', x, z, heading, speed: 0, mesh,
      cruise: range(rng, 9, 13), axis: 'z', dir: 1, target: null,
      state: 'drive', wait: 0, health: 100, smoke: 0, driver: kind === 'traffic',
    };
    cars.push(car);
    return car;
  }

  // --- Traffic: spawn on road centrelines, spread over the grid ---
  for (let i = 0; i < 22; i += 1) {
    const horizontal = rng() < 0.5;
    const line = rangeInt(rng, 0, 10) * ROAD_STEP + GRID_MIN;
    const along = range(rng, GRID_MIN, GRID_MAX);
    const lane = 2.8; // right-hand side
    const x = horizontal ? along : line + (rng() < 0.5 ? lane : -lane);
    const z = horizontal ? line + (rng() < 0.5 ? lane : -lane) : along;
    const heading = horizontal ? (x > 0 ? Math.PI / 2 : -Math.PI / 2) : (z > 0 ? 0 : Math.PI);
    const car = addCar('traffic', x, z, heading, pick(rng, PALETTE.car));
    car.axis = horizontal ? 'x' : 'z';
    car.dir = horizontal ? (rng() < 0.5 ? 1 : -1) : (rng() < 0.5 ? 1 : -1);
    car.target = pickNextIntersection(car);
  }

  function pickNextIntersection(car) {
    // Next grid crossing along the car's axis, one step ahead.
    const v = car.axis === 'x' ? car.x : car.z;
    const step = car.dir * ROAD_STEP;
    let next = Math.round((v + step - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
    next = Math.max(GRID_MIN, Math.min(GRID_MAX, next));
    return { x: car.axis === 'x' ? next : car.x, z: car.axis === 'z' ? next : car.z };
  }

  function chooseTurn(car) {
    // At an intersection: mostly straight, sometimes turn. Never U-turn.
    const r = rng();
    const atX = Math.round((car.x - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
    const atZ = Math.round((car.z - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
    car.x = atX;
    car.z = atZ;
    if (r < 0.62) {
      car.target = pickNextIntersection(car);
      return;
    }
    // Turn: switch axis.
    const oldAxis = car.axis;
    car.axis = oldAxis === 'x' ? 'z' : 'x';
    car.dir = rng() < 0.5 ? 1 : -1;
    car.target = pickNextIntersection(car);
    car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  }

  // --- Parked cars (stealable), incl. the mission Comet GT ---
  const parkedSpots = [
    { x: -196, z: 160, color: 0xe63946, name: 'comet' }, // Barrio garage (mission 1)
    { x: -252, z: 84, color: 0x2a9d8f, name: 'parked' },
    { x: 84, z: 252, color: 0xf4a261, name: 'parked' },
    { x: 252, z: -84, color: 0x4361ee, name: 'parked' },
    { x: -84, z: -252, color: 0xf8f9fa, name: 'parked' },
    { x: 168, z: 84, color: 0xffb703, name: 'parked' },
    { x: -28, z: 224, color: 0x8338ec, name: 'parked' },
    { x: 505, z: 28, color: 0x06d6a0, name: 'parked' }, // Isla Verde
  ];
  for (const s of parkedSpots) {
    const car = addCar('parked', s.x, s.z, range(rng, 0, Math.PI * 2), s.color, s.name);
    car.state = 'parked';
  }

  // --- Player's starting car (the garage van for mission 5-style escapes) ---
  const playerCar = addCar('player', -196, 196, Math.PI, 0x22223b, 'player');
  playerCar.state = 'player';

  // The car the player is currently driving (null on foot). drivePlayer and
  // the police ram act on this, NOT on the safehouse car above.
  let drivenCar = null;
  function setDrivenCar(car) { drivenCar = car; }

  function spawnPolice(count, nearX, nearZ) {
    for (let i = 0; i < count; i += 1) {
      const spot = snapToRoad(nearX + range(rng, -90, 90), nearZ + range(rng, -90, 90));
      const car = addCar('police', spot.x, spot.z, range(rng, 0, Math.PI * 2), 0x111122);
      car.state = 'chase';
      car.axis = rng() < 0.5 ? 'x' : 'z';
      car.dir = rng() < 0.5 ? 1 : -1;
      police.push(car);
    }
  }

  function despawnPolice() {
    for (let i = police.length - 1; i >= 0; i -= 1) {
      scene.remove(police[i].mesh);
      const idx = cars.indexOf(police[i]);
      if (idx >= 0) cars.splice(idx, 1);
      police.splice(i, 1);
    }
  }

  function nearestStealable(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.kind !== 'parked' && car.kind !== 'traffic') continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function drivePlayer(dt, input, camYaw) {
    const car = drivenCar;
    if (!car) return;
    const fwd = input.moveY();
    const steer = input.moveX();
    const speedSign = car.speed >= 0 ? 1 : -1;
    if (fwd > 0) car.speed += CAR.accel * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.5) * dt;
    else car.speed -= car.speed * 1.2 * dt;
    car.speed = Math.max(-CAR.reverseSpeed, Math.min(CAR.maxSpeed, car.speed));
    const steerAmount = steer * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 6) * speedSign;
    car.heading += steerAmount;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const hit = collideCircleAABB(nx, nz, CAR.radius, colliders);
    if (hit.hit) {
      if (Math.abs(car.speed) > 12) {
        car.health -= Math.abs(car.speed) * 1.2;
        events.push({ type: 'crash', hard: true });
      }
      car.speed *= 0.4;
      car.x = hit.x;
      car.z = hit.z;
    } else {
      car.x = nx;
      car.z = nz;
    }
    // Car-vs-car push.
    for (const other of cars) {
      if (other === car || other.state === 'parked') continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 4 && d > 0.01) {
        const push = (4 - d) / 2;
        car.x += (dx / d) * push;
        car.z += (dz / d) * push;
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
        if (Math.abs(car.speed) > 8) {
          car.speed *= 0.6;
          if (other.kind === 'police') events.push({ type: 'ram-police' });
        }
      }
    }
    car.x = Math.max(-320, Math.min(640, car.x));
    car.z = Math.max(-320, Math.min(320, car.z));
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.mesh.rotation.z = -steer * Math.min(0.06, Math.abs(car.speed) * 0.002);
    if (car.health < 40) car.smoke = 1;
    return car;
  }

  function updateTraffic(dt, simSeconds, player) {
    const phase = lightPhase(simSeconds);
    for (const car of cars) {
      if (car.kind !== 'traffic') continue;
      const dx = car.target.x - car.x;
      const dz = car.target.z - car.z;
      const dist = Math.hypot(dx, dz);
      let want = car.cruise;
      // Red light: stop before the intersection.
      const axisGreen = (car.axis === 'x' && phase === 'ew') || (car.axis === 'z' && phase === 'ns');
      if (!axisGreen && dist < 12) want = 0;
      // Car ahead: slow down.
      for (const other of cars) {
        if (other === car || other.kind === 'parked') continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const ahead = car.axis === 'x' ? ox * car.dir : oz * car.dir;
        const side = car.axis === 'x' ? Math.abs(oz) : Math.abs(ox);
        if (ahead > 0 && ahead < 8 && side < 3) { want = Math.min(want, 0); break; }
      }
      car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
      const stepDist = car.speed * dt;
      car.x += Math.sin(car.heading) * stepDist;
      car.z += Math.cos(car.heading) * stepDist;
      if (dist < 3) chooseTurn(car);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }

  function updatePolice(dt, player, playerDriving, simSeconds) {
    for (const car of police) {
      const target = snapToRoad(player.x, player.z);
      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const dist = Math.hypot(dx, dz);
      // Steer toward the player's road position.
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      const wantSpeed = dist > 60 ? 24 : 19;
      car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const hit = collideCircleAABB(nx, nz, CAR.radius, colliders);
      if (hit.hit) { car.x = hit.x; car.z = hit.z; car.speed *= 0.5; car.heading += 0.6; }
      else { car.x = nx; car.z = nz; }
      // Ram the player.
      const pd = Math.hypot(player.x - car.x, player.z - car.z);
      if (pd < 4.2) {
        if (playerDriving && Math.abs(car.speed) > 6) events.push({ type: 'rammed', by: car });
        const push = (4.2 - pd) * 0.5;
        const px = (player.x - car.x) / (pd || 1);
        const pz = (player.z - car.z) / (pd || 1);
        if (playerDriving && drivenCar) {
          drivenCar.x += px * push;
          drivenCar.z += pz * push;
          drivenCar.speed *= 0.7;
          drivenCar.health -= 2;
        }
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Flashing light bar (alternates red/blue on the sim clock).
      if (car.mesh.userData.lightBar) {
        car.mesh.userData.lightBar.material.emissive.setHex(
          Math.floor(simSeconds * 4) % 2 === 0 ? 0xff2222 : 0x2233ff,
        );
      }
    }
  }

  return {
    cars,
    police,
    playerCar,
    get drivenCar() { return drivenCar; },
    setDrivenCar,
    spawnPolice,
    despawnPolice,
    nearestStealable,
    drivePlayer,
    updateTraffic,
    updatePolice,
    cometCar: cars.find((c) => c.name === 'comet'),
  };
}
