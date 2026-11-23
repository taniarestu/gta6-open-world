// Solmar Bay itself: a seeded procedural city. One ground canvas texture
// (roads, sidewalks, sand, water, island, causeway), InstancedMesh buildings
// with a lit-window texture, palms, lamps, port containers, neon signs and a
// waypoint beacon. All geometry is built from the seeded rng — same seed,
// same city. Returns colliders (AABBs) the sim uses for every collision.
import * as THREE from 'three';
import {
  ROAD_STEP, ROAD_HALF, GRID_MIN, GRID_MAX, BEACH_X, WATER_X, ISLAND,
  PALETTE, districtAt,
} from './config.js';
import { pick, range, rangeInt } from './random.js';

const GROUND = { x0: -320, x1: 640, z0: -320, z1: 320 }; // ground plane bounds
const TEX_W = 1920; // 2 px per world unit
const TEX_H = 1280;

function groundTexture(rng) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');
  const px = (x) => (x - GROUND.x0) * 2;
  const pz = (z) => (z - GROUND.z0) * 2;
  // Base: grass.
  g.fillStyle = '#6d8a58';
  g.fillRect(0, 0, TEX_W, TEX_H);
  // Ocean (east of the sand) and island ground.
  g.fillStyle = '#0f7ea6';
  g.fillRect(px(WATER_X), 0, TEX_W - px(WATER_X), TEX_H);
  g.fillStyle = '#7ba05c';
  g.fillRect(px(ISLAND.x0), pz(ISLAND.z0), (ISLAND.x1 - ISLAND.x0) * 2, (ISLAND.z1 - ISLAND.z0) * 2);
  // Sand strip.
  g.fillStyle = '#e8cf9e';
  g.fillRect(px(BEACH_X), 0, (WATER_X - BEACH_X) * 2, TEX_H);
  // City sidewalk base (light warm grey) under the road grid.
  g.fillStyle = '#a39d90';
  g.fillRect(px(-308), pz(-308), 616 * 2, 616 * 2);
  // Causeway bridge over the water.
  g.fillStyle = '#45454e';
  g.fillRect(px(BEACH_X), pz(-8), (ISLAND.x0 - BEACH_X) * 2, 16 * 2);
  // Roads: asphalt strips, then centre dashes.
  const roads = [];
  for (let v = GRID_MIN; v <= GRID_MAX; v += ROAD_STEP) roads.push(v);
  g.fillStyle = '#45454e';
  for (const v of roads) {
    g.fillRect(px(v - ROAD_HALF), pz(-308), ROAD_HALF * 2 * 2, 616 * 2);
    g.fillRect(px(-308), pz(v - ROAD_HALF), 616 * 2, ROAD_HALF * 2 * 2);
  }
  // Island roads.
  g.fillRect(px(ISLAND.x0 + 60), pz(ISLAND.z0), 14, (ISLAND.z1 - ISLAND.z0) * 2);
  g.fillRect(px(ISLAND.x0), pz(0 - ROAD_HALF), (ISLAND.x1 - ISLAND.x0) * 2, ROAD_HALF * 2 * 2);
  // Lane dashes (faded yellow).
  g.fillStyle = 'rgba(240, 200, 90, 0.75)';
  for (const v of roads) {
    for (let t = -300; t < 300; t += 16) {
      g.fillRect(px(v) - 1, pz(t), 2, 8);
      g.fillRect(px(t), pz(v) - 1, 8, 2);
    }
  }
  // Crosswalk stripes at every intersection.
  g.fillStyle = 'rgba(245, 245, 240, 0.85)';
  for (const x of roads) {
    for (const z of roads) {
      for (let i = -3; i <= 3; i += 1) {
        g.fillRect(px(x + i * 3 - 1), pz(z - ROAD_HALF - 5), 2, 4);
        g.fillRect(px(x + i * 3 - 1), pz(z + ROAD_HALF + 1), 2, 4);
        g.fillRect(px(x - ROAD_HALF - 5), pz(z + i * 3 - 1), 4, 2);
        g.fillRect(px(x + ROAD_HALF + 1), pz(z + i * 3 - 1), 4, 2);
      }
    }
  }
  // Downtown plaza: lighter concrete with a tile grid and a centre ring, so
  // the showdown ground reads as a designed plaza, not bare dirt.
  g.fillStyle = '#b5ad9e';
  g.fillRect(px(84), pz(-140), 56 * 2, 56 * 2);
  g.strokeStyle = 'rgba(90, 80, 65, 0.35)';
  g.lineWidth = 1;
  for (let t = 84 + 14; t < 140; t += 14) {
    g.beginPath(); g.moveTo(px(t), pz(-140)); g.lineTo(px(t), pz(-84)); g.stroke();
  }
  for (let z = -140 + 14; z < -84; z += 14) {
    g.beginPath(); g.moveTo(px(84), pz(z)); g.lineTo(px(140), pz(z)); g.stroke();
  }
  g.strokeStyle = 'rgba(200, 120, 60, 0.55)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(px(112), pz(-112), 20 * 2, 0, Math.PI * 2); g.stroke();
  // Beach umbrellas dots + boardwalk line.
  g.fillStyle = '#ff8f5e';
  for (let z = -280; z <= 280; z += 28) {
    g.beginPath();
    g.arc(px(322 + (rng() * 8)), pz(z + (rng() * 10 - 5)), 3, 0, Math.PI * 2);
    g.fill();
  }
  // Wave lines on the water.
  g.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  g.lineWidth = 3;
  for (let i = 0; i < 60; i += 1) {
    const x = WATER_X + 20 + rng() * 240;
    const z = -300 + rng() * 600;
    g.beginPath();
    g.moveTo(px(x), pz(z));
    g.lineTo(px(x + 14 + rng() * 20), pz(z));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  // Light wall so the per-instance building colour shows through (the map
  // multiplies the instance colour — a dark wall would turn every tower black).
  g.fillStyle = '#c8ccd4';
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 10) {
    for (let x = 4; x < 60; x += 10) {
      const lit = rng() < 0.45;
      g.fillStyle = lit ? '#ffd27a' : '#5a6a7e';
      g.fillRect(x, y, 6, 7);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function neonSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#120a18';
  g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Snap a point onto the nearest road centreline (traffic + police use this).
export function snapToRoad(x, z) {
  const snap = (v) => Math.round((v - GRID_MIN) / ROAD_STEP) * ROAD_STEP + GRID_MIN;
  const sx = snap(x);
  const sz = snap(z);
  return Math.abs(x - sx) < Math.abs(z - sz) ? { x: sx, z } : { x, z: sz };
}

export function buildCity(scene, rng) {
  const colliders = [];
  const roads = [];
  for (let v = GRID_MIN; v <= GRID_MAX; v += ROAD_STEP) roads.push(v);

  // --- Ground ---
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTexture(rng) });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND.x1 - GROUND.x0, GROUND.z1 - GROUND.z0),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((GROUND.x0 + GROUND.x1) / 2, 0, (GROUND.z0 + GROUND.z1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Ocean plane to the horizon ---
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshLambertMaterial({ color: 0x17809a }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(1200, -0.4, 0);
  scene.add(ocean);

  // --- Buildings (one InstancedMesh, per-instance colour) ---
  const winTex = windowTexture(rng);
  const buildMat = new THREE.MeshLambertMaterial({
    map: winTex, emissive: 0xffc46b, emissiveMap: winTex, emissiveIntensity: 0.25,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const placements = [];
  for (let ix = 0; ix < roads.length - 1; ix += 1) {
    for (let iz = 0; iz < roads.length - 1; iz += 1) {
      const x0 = roads[ix] + ROAD_HALF + 2;
      const x1 = roads[ix + 1] - ROAD_HALF - 2;
      const z0 = roads[iz] + ROAD_HALF + 2;
      const z1 = roads[iz + 1] - ROAD_HALF - 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const d = districtAt(cx, cz);
      if (d === 'port') continue; // containers instead
      if (d === 'ocean' || d === 'beach') continue;
      // Keep the Downtown plaza blocks open (mission 3 showdown): the four
      // blocks around the (112,-112) intersection.
      if (cx > 70 && cx < 154 && cz > -154 && cz < -70) continue;
      // Keep the Barrio garage lot open (mission 1 steal point + safehouse).
      if (cx > -210 && cx < -182 && cz > 126 && cz < 210) continue;
      const count = d === 'downtown' ? 1 : (rng() < 0.5 ? 2 : 1);
      for (let k = 0; k < count; k += 1) {
        const w = d === 'downtown' ? range(rng, 18, 28) : range(rng, 12, 22);
        const dep = d === 'downtown' ? range(rng, 18, 28) : range(rng, 12, 22);
        const h = d === 'downtown' ? range(rng, 34, 84) : range(rng, 8, 24);
        const bx = count === 1 ? cx : cx + (k === 0 ? -9 : 9);
        const bz = count === 1 ? cz : cz + (k === 0 ? -9 : 9);
        const palette = d === 'downtown' ? PALETTE.buildingDowntown
          : d === 'barrio' ? PALETTE.buildingBarrio
          : d === 'palmera' ? PALETTE.buildingPalmera
          : PALETTE.buildingCentral;
        placements.push({ x: bx, z: bz, w, h, d: dep, color: pick(rng, palette) });
        colliders.push({ x0: bx - w / 2, z0: bz - dep / 2, x1: bx + w / 2, z1: bz + dep / 2 });
      }
    }
  }
  // Isla Verde villas.
  for (let i = 0; i < 8; i += 1) {
    const x = range(rng, ISLAND.x0 + 20, ISLAND.x1 - 20);
    const z = range(rng, ISLAND.z0 + 20, ISLAND.z1 - 20);
    if (Math.abs(z) < 14) continue; // keep the island road clear
    const w = range(rng, 12, 18);
    const h = range(rng, 7, 12);
    placements.push({ x, z, w, h, d: w, color: pick(rng, PALETTE.buildingPalmera) });
    colliders.push({ x0: x - w / 2, z0: z - w / 2, x1: x + w / 2, z1: z + w / 2 });
  }
  // Port warehouses (3 big sheds, on block centres — never on intersections).
  const warehouseMat = new THREE.MeshLambertMaterial({ color: 0x7a6f5e });
  for (const [wx, wz] of [[-196, -196], [-252, -252], [-140, -252]]) {
    const wh = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 18), warehouseMat);
    wh.position.set(wx, 5, wz);
    wh.castShadow = true;
    scene.add(wh);
    colliders.push({ x0: wx - 15, z0: wz - 9, x1: wx + 15, z1: wz + 9 });
  }
  const buildings = new THREE.InstancedMesh(boxGeo, buildMat, placements.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    m4.compose(
      new THREE.Vector3(p.x, p.h / 2, p.z),
      q,
      new THREE.Vector3(p.w, p.h, p.d),
    );
    buildings.setMatrixAt(i, m4);
    buildings.setColorAt(i, col.setHex(p.color));
  });
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  scene.add(buildings);

  // --- Port containers (instanced, rusty colours) ---
  const contGeo = new THREE.BoxGeometry(12, 3, 3);
  const contMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const contCols = [0xb5502a, 0x2a6db5, 0x3a8a4a, 0x8a2a3a, 0xc77f2a];
  const contSpots = [];
  for (let i = 0; i < 44; i += 1) {
    const x = range(rng, -280, -120);
    const z = range(rng, -280, -120);
    if (Math.abs(x + 196) < 22 && Math.abs(z + 196) < 18) continue; // warehouse
    if (Math.abs(x + 252) < 22 && Math.abs(z + 252) < 18) continue;
    if (Math.abs(x + 140) < 22 && Math.abs(z + 252) < 18) continue;
    contSpots.push({ x, z, rot: rng() < 0.5 ? 0 : Math.PI / 2, stack: rng() < 0.3 ? 2 : 1, color: pick(rng, contCols) });
  }
  const containers = new THREE.InstancedMesh(contGeo, contMat, contSpots.length * 2);
  let ci = 0;
  for (const s of contSpots) {
    for (let lvl = 0; lvl < s.stack; lvl += 1) {
      m4.compose(
        new THREE.Vector3(s.x, 1.5 + lvl * 3, s.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot),
        new THREE.Vector3(1, 1, 1),
      );
      containers.setMatrixAt(ci, m4);
      containers.setColorAt(ci, col.setHex(s.color));
      ci += 1;
    }
    colliders.push({ x0: s.x - 6, z0: s.z - 2, x1: s.x + 6, z1: s.z + 2 });
  }
  containers.count = ci;
  containers.castShadow = true;
  scene.add(containers);

  // --- Palms: instanced trunks + canopies ---
  const palmSpots = [];
  for (let z = -280; z <= 280; z += 28) palmSpots.push({ x: 318 + range(rng, 0, 14), z: z + range(rng, -6, 6) });
  for (let z = -280; z <= 280; z += 56) palmSpots.push({ x: 300 + range(rng, 0, 6), z });
  for (let i = 0; i < 26; i += 1) {
    palmSpots.push({ x: range(rng, ISLAND.x0 + 8, ISLAND.x1 - 8), z: pick(rng, [ISLAND.z0 + 8, ISLAND.z1 - 8]) });
  }
  for (let i = 0; i < 18; i += 1) {
    palmSpots.push({ x: range(rng, 60, 280), z: range(rng, 60, 280) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.6, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f8a4a });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 3.5, p.z), q, new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, 8.2, p.z), q, new THREE.Vector3(1, 0.55, 1));
    canopies.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(canopies);

  // --- Street lamps: instanced poles + glowing heads ---
  const lampSpots = [];
  for (const x of roads) {
    for (const z of roads) {
      if ((Math.round(x / ROAD_STEP) + Math.round(z / ROAD_STEP)) % 2 === 0) lampSpots.push({ x: x + 9, z: z + 9 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc46b, emissiveIntensity: 0.4 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 3, p.z), q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, 6.2, p.z), q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // --- Traffic-light gantries at four central intersections ---
  const lightMasts = [];
  for (const [lx, lz] of [[0, 0], [56, 0], [0, 56], [-56, 0]]) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), poleMat);
    mast.position.set(lx + 9, 3.5, lz + 9);
    scene.add(mast);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0x22ff88, emissiveIntensity: 1 }),
    );
    lamp.position.set(lx + 9, 7.4, lz + 9);
    scene.add(lamp);
    lightMasts.push(lamp);
  }

  // --- Neon signs (Palmera + Downtown) — the Sunset Heat look ---
  const signs = [
    { text: 'SOLMAR', color: '#ff5e8a', x: 196, z: -116, ry: 0 },
    { text: 'PALMERA', color: '#2ec4b6', x: 168, z: 120, ry: Math.PI },
    { text: 'HOTEL', color: '#ffc46b', x: 224, z: 168, ry: Math.PI / 2 },
    { text: 'BAR · SOL', color: '#ff9a56', x: -140, z: 224, ry: -Math.PI / 2 },
  ];
  for (const s of signs) {
    const mat = new THREE.MeshBasicMaterial({ map: neonSignTexture(s.text, s.color), transparent: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
    plane.position.set(s.x, 9, s.z);
    plane.rotation.y = s.ry;
    scene.add(plane);
  }

  // --- Causeway railings + lamps over the water ---
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8a8578 });
  for (const rz of [-9.5, 9.5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(122, 0.7, 0.35), railMat);
    rail.position.set(369, 0.35, rz);
    scene.add(rail);
  }
  const causewayLampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  for (let lx = 320; lx <= 400; lx += 25) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 5), causewayLampMat);
    pole.position.set(lx, 3, 9.5);
    scene.add(pole);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc46b, emissiveIntensity: 0.8 }),
    );
    head.position.set(lx, 6.2, 9.5);
    scene.add(head);
  }

  // --- Downtown plaza props: planters + benches so the showdown ground reads ---
  const planterMat = new THREE.MeshLambertMaterial({ color: 0x6a7a5a });
  for (const [px2, pz2] of [[88, -88], [136, -88], [88, -136], [136, -136], [84, -112], [140, -112], [112, -84], [112, -140]]) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 3), planterMat);
    planter.position.set(px2, 0.45, pz2);
    planter.castShadow = true;
    scene.add(planter);
  }
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  for (const [bx, bz] of [[112, -96], [112, -128], [96, -112], [128, -112]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 1.6), benchMat);
    bench.position.set(bx, 0.7, bz);
    scene.add(bench);
  }

  // --- Waypoint beacon (missions move it) ---
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 30, 16, 1, true), beaconMat);
  beacon.position.y = 15;
  beacon.visible = false;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  scene.add(ring);

  // --- Lights: sun + hemisphere, driven by time of day ---
  const sun = new THREE.DirectionalLight(0xffb36b, 2.2);
  sun.position.set(-200, 120, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.far = 1200;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xffc890, 0x3a2a4a, 0.9);
  scene.add(hemi);

  const sunCol = new THREE.Color();
  const skyCol = new THREE.Color();
  const fogCol = new THREE.Color();

  function updateSun(timeOfDay) {
    // timeOfDay in hours; golden hour 17.5, night after 20, dawn 6.
    const t = timeOfDay;
    const dayFrac = t >= 6 && t <= 19 ? (t - 6) / 13 : (t < 6 ? 0 : 1);
    const elev = Math.sin(dayFrac * Math.PI); // 0 at dawn/dusk, 1 at midday
    const sunset = 1 - Math.min(1, Math.abs(t - 18.2) / 2.2); // peaks at 18:12
    sunCol.setHex(0xfff2d8).lerp(new THREE.Color(PALETTE.sunWarm), Math.max(0, sunset));
    if (t >= 20 || t < 6) sunCol.setHex(0x8fa8ff);
    sun.intensity = t >= 20 || t < 6 ? 0.3 : 1.7 + elev * 1.1 + Math.max(0, sunset) * 0.7;
    const az = (dayFrac - 0.5) * Math.PI * 1.2;
    sun.position.set(Math.sin(az) * 320, 40 + elev * 260, Math.cos(az) * 320 + 80);
    skyCol.setHex(PALETTE.skyNoon).lerp(new THREE.Color(PALETTE.skySunset), Math.max(0, sunset));
    if (t >= 20 || t < 6) skyCol.setHex(PALETTE.skyNight);
    scene.background = skyCol;
    fogCol.copy(skyCol);
    scene.fog = new THREE.Fog(fogCol, 260, 900);
    hemi.intensity = t >= 20 || t < 6 ? 0.4 : 0.85 + elev * 0.35;
    buildMat.emissiveIntensity = t >= 19 || t < 7 ? 0.9 : 0.25 + Math.max(0, sunset) * 0.4;
    headMat.emissiveIntensity = t >= 18.5 || t < 6.5 ? 1.6 : 0.4;
    // Traffic-light phase: 12 s cycle, NS green first half.
    const phase = Math.floor(timeOfDay * 3600 / 6) % 2 === 0;
    for (const lamp of lightMasts) {
      lamp.material.emissive.setHex(phase ? 0x22ff88 : 0xff4444);
    }
  }

  return {
    colliders,
    roads,
    updateSun,
    setWaypoint(x, z, visible) {
      beacon.position.x = x;
      beacon.position.z = z;
      beacon.visible = visible;
      ring.position.x = x;
      ring.position.z = z;
      ring.visible = visible;
    },
    pulseBeacon(simSeconds) {
      const s = 1 + Math.sin(simSeconds * 3) * 0.15;
      beacon.scale.set(s, 1, s);
      ring.scale.setScalar(1 + Math.sin(simSeconds * 3) * 0.1);
    },
  };
}
