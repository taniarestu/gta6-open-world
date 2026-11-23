// Screenshot staging: ?shot=cover|downtown|mission|beach. Each scene plays the
// real rules forward from a fresh world for a fixed number of steps, with the
// sim state placed deterministically (seeded), so the frame is what a short
// game really looks like and the same seed always gives the same frame.
// Returns the camera spec; the caller snaps the camera after the settle
// steps so the frame is exact.
import { GRID_MIN, GRID_MAX, ROAD_STEP } from './config.js';

function nextIntersection(v, dir) {
  const n = Math.round((v + dir * ROAD_STEP - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
  return Math.max(GRID_MIN, Math.min(GRID_MAX, n));
}

function placeTraffic(G, spots) {
  const traffic = G.vehicles.cars.filter((c) => c.kind === 'traffic');
  spots.forEach((s, i) => {
    const car = traffic[i % traffic.length];
    car.x = s.x;
    car.z = s.z;
    car.axis = s.axis;
    car.dir = s.dir;
    car.speed = s.speed || 10;
    car.heading = s.axis === 'x' ? (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (s.dir > 0 ? 0 : Math.PI);
    car.target = s.axis === 'x'
      ? { x: nextIntersection(s.x, s.dir), z: s.z }
      : { x: s.x, z: nextIntersection(s.z, s.dir) };
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  });
}

function placePeds(G, spots) {
  spots.forEach((s, i) => {
    const ped = G.people.peds[i % G.people.peds.length];
    ped.x = s.x;
    ped.z = s.z;
    ped.heading = s.heading || 0;
    ped.state = 'walk';
    ped.mesh.group.position.set(ped.x, 0, ped.z);
    ped.mesh.group.rotation.y = ped.heading;
  });
}

function placePolice(G, spots) {
  G.vehicles.despawnPolice();
  G.vehicles.spawnPolice(spots.length, spots[0].x, spots[0].z);
  spots.forEach((s, i) => {
    const car = G.vehicles.police[i];
    if (!car) return;
    car.x = s.x;
    car.z = s.z;
    car.heading = s.heading || 0;
    car.speed = s.speed || 8;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  });
}

function resetPlayer(G, x, z, heading) {
  const p = G.people.player;
  p.x = x;
  p.z = z;
  p.y = 0;
  p.heading = heading;
  p.health = 100;
  p.driving = false;
  p.mesh.group.visible = true;
  p.mesh.group.position.set(x, 0, z);
  p.mesh.group.rotation.y = heading;
  G.state.driving = false;
  G.state.currentCar = null;
  G.cam.yaw = heading + Math.PI; // camera behind the player by default
}

export function stageShot(name, G) {
  const S = G.state;
  if (name === 'cover') {
    // 1-cover.jpg — Dockyard Heat escape on the causeway at sunset: Mara on
    // foot beside the red Comet, police closing in from the island side,
    // traffic on the bridge, ocean + sunset glow ahead, waypoint on Isla Verde.
    G.setTimeOfDay(18.2);
    G.missions.jumpTo(1, 2); // Dockyard Heat, escape step (wanted 3)
    const comet = G.vehicles.cometCar;
    comet.x = 422; comet.z = 1.5; comet.heading = Math.PI / 2;
    comet.mesh.position.set(422, 0, 1.5);
    comet.mesh.rotation.y = Math.PI / 2;
    resetPlayer(G, 419.5, -1.5, Math.PI / 2);
    placePolice(G, [
      { x: 446, z: 5, heading: -Math.PI / 2, speed: 12 },
      { x: 454, z: -4, heading: -Math.PI / 2, speed: 10 },
    ]);
    placeTraffic(G, [
      { x: 440, z: -3, axis: 'x', dir: -1, speed: 11 },
      { x: 470, z: 3, axis: 'x', dir: -1, speed: 12 },
      { x: 360, z: -3, axis: 'x', dir: 1, speed: 10 },
    ]);
    placePeds(G, [
      { x: 452, z: 12, heading: Math.PI },
      { x: 458, z: -13, heading: 0 },
      { x: 336, z: 20, heading: Math.PI / 2 },
    ]);
    return { focus: () => ({ x: 421, y: 1, z: 0 }), yaw: Math.PI / 2, pitch: 0.26, dist: 8.5 };
  }
  if (name === 'downtown') {
    // 2-downtown.jpg — on foot in Downtown at golden hour: Mara beside the
    // stolen Comet on the avenue, glass towers both sides, traffic and
    // pedestrians, mission 1's delivery leg running.
    G.setTimeOfDay(17.5);
    G.missions.jumpTo(0, 2); // Barrio Run, deliver the Comet Downtown
    G.wanted.setHeat(0);
    const comet = G.vehicles.cometCar;
    comet.x = 116; comet.z = -64; comet.heading = Math.PI;
    comet.mesh.position.set(116, 0, -64);
    comet.mesh.rotation.y = Math.PI;
    resetPlayer(G, 108, -70, 0.3);
    placeTraffic(G, [
      { x: 112, z: -100, axis: 'z', dir: -1, speed: 10 },
      { x: 112, z: -40, axis: 'z', dir: 1, speed: 12 },
      { x: 84, z: -56, axis: 'x', dir: 1, speed: 9 },
      { x: 140, z: -56, axis: 'x', dir: -1, speed: 11 },
    ]);
    placePeds(G, [
      { x: 100, z: -76, heading: Math.PI / 2 },
      { x: 124, z: -64, heading: -Math.PI / 2 },
      { x: 104, z: -48, heading: 0 },
      { x: 122, z: -88, heading: Math.PI },
      { x: 98, z: -100, heading: Math.PI / 2 },
    ]);
    return { focus: () => ({ x: 110, y: 1, z: -72 }), yaw: 0.15, pitch: 0.3, dist: 12 };
  }
  if (name === 'mission') {
    // 3-mission.jpg — Sunset Showdown at the Downtown plaza: Mara armed,
    // Kane's crew in the open, wanted 5, money bag on the ground.
    G.setTimeOfDay(18.4);
    G.missions.jumpTo(2, 1); // Showdown, eliminate step (4 guards spawn)
    G.wanted.setHeat(100);
    G.combat.setWeapon('pistol');
    resetPlayer(G, 96, -92, -Math.PI / 4);
    placePolice(G, [
      { x: 140, z: -140, heading: Math.PI, speed: 10 },
      { x: 84, z: -140, heading: 0, speed: 10 },
    ]);
    placeTraffic(G, [
      { x: 168, z: -112, axis: 'x', dir: -1, speed: 10 },
      { x: 56, z: -84, axis: 'z', dir: 1, speed: 11 },
    ]);
    placePeds(G, [
      { x: 84, z: -84, heading: Math.PI },
      { x: 140, z: -84, heading: 0 },
    ]);
    return { focus: () => ({ x: 100, y: 1.4, z: -96 }), yaw: 2.6, pitch: 0.2, dist: 10.5 };
  }
  // 4-beach.jpg — golden-hour drive down Palmera Beach in the Comet GT:
  // palms, ocean, neon, free roam.
  G.setTimeOfDay(18.0);
  G.wanted.setHeat(0);
  const comet = G.vehicles.cometCar;
  comet.x = 280;
  comet.z = 120;
  comet.heading = Math.PI; // heading north (-z) up the beachfront avenue
  comet.speed = 18;
  comet.kind = 'player';
  comet.state = 'player';
  comet.mesh.position.set(280, 0, 120);
  comet.mesh.rotation.y = Math.PI;
  S.driving = true;
  S.currentCar = comet;
  G.people.player.driving = true;
  G.people.player.mesh.group.visible = false;
  G.people.player.x = 280;
  G.people.player.z = 120;
  placeTraffic(G, [
    { x: 280, z: 60, axis: 'z', dir: 1, speed: 9 },
    { x: 280, z: 180, axis: 'z', dir: -1, speed: 10 },
    { x: 224, z: 140, axis: 'x', dir: 1, speed: 10 },
  ]);
  placePeds(G, [
    { x: 292, z: 140, heading: Math.PI },
    { x: 296, z: 96, heading: 0 },
    { x: 290, z: 168, heading: Math.PI / 2 },
    { x: 318, z: 130, heading: -Math.PI / 2 },
  ]);
  return { focus: () => ({ x: comet.x, y: 1, z: comet.z }), yaw: Math.PI, pitch: 0.3, dist: 13 };
}
