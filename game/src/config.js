// All tuning in one place: city geometry, districts, palettes, physics and
// mission numbers. Nothing here is read from the wall clock or Math.random;
// the city is a pure function of the seed passed to buildCity().
export const STEP = 1 / 60; // fixed simulation step (seconds)
export const DEFAULT_SEED = 20261123;

// --- City grid ---
export const ROAD_STEP = 56; // distance between road centrelines
export const ROAD_HALF = 7; // half road width (asphalt)
export const GRID_MIN = -280; // first road centreline
export const GRID_MAX = 280; // last road centreline
export const CITY_HALF = 308; // playable edge (sidewalk outer edge)
export const BEACH_X = 308; // sand starts here
export const WATER_X = 352; // ocean starts here
export const ISLAND = { x0: 430, x1: 580, z0: -140, z1: 140 }; // Isla Verde
export const CAUSEWAY_Z = 0; // causeway centreline (bridge over the water)

// District test by quadrant (x east, z south; north is -z).
export function districtAt(x, z) {
  if (x > WATER_X) return 'ocean';
  if (x > BEACH_X) return 'beach';
  if (x >= ISLAND.x0 && x <= ISLAND.x1 && z >= ISLAND.z0 && z <= ISLAND.z1) return 'island';
  if (x < -112 && z < -112) return 'port';
  if (x > 56 && z < -56) return 'downtown';
  if (x < -56 && z > 56) return 'barrio';
  if (x > 56 && z > 56) return 'palmera';
  return 'central';
}

// --- Sunset Heat palette ---
export const PALETTE = {
  skySunset: 0xff9a56,
  skyNoon: 0x7ec8e8,
  skyNight: 0x0e1630,
  fogSunset: 0xf2a35e,
  fogNight: 0x111a33,
  sunWarm: 0xffb36b,
  sunNoon: 0xfff2d8,
  buildingDowntown: [0x8fb4c7, 0x7ba0b8, 0x9fc3d4, 0x6e93a8, 0xb8cdd8],
  buildingBarrio: [0xff8f5e, 0xffc46b, 0x7fd1c0, 0xff6b9d, 0xffe066, 0xc98aff],
  buildingPalmera: [0xffd9c2, 0xffb3c8, 0xa8e6cf, 0xffe9a8, 0xffc9a3],
  buildingCentral: [0xc9a06b, 0xb08d6e, 0xd4b48c, 0x9c8a7a, 0x8a9aa8],
  buildingPort: [0x8a7f6a, 0x7a6f5e, 0x9a8a70, 0x6e6a62],
  car: [0xe63946, 0x2a9d8f, 0xf4a261, 0x4361ee, 0xf8f9fa, 0x22223b, 0xffb703, 0x8338ec, 0x06d6a0],
  pedShirt: [0xe63946, 0x2a9d8f, 0xf4a261, 0x4361ee, 0xffb703, 0x8338ec, 0x06d6a0, 0xef476f, 0x118ab2, 0xffffff],
  pedSkin: [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac],
};

// --- Player / driving ---
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  accel: 40,
  radius: 0.7,
  health: 100,
};
export const CAR = {
  maxSpeed: 34, // ~122 km/h arcade
  accel: 22,
  brake: 34,
  reverseSpeed: 10,
  steer: 2.1,
  grip: 8,
  radius: 1.9,
};

// --- Wanted ---
export const WANTED = {
  stealCar: 40,
  hitPed: 25,
  shoot: 30,
  ramPolice: 20,
  decayPerSec: 2.2, // heat lost while unseen and quiet
  maxHeat: 100,
  maxStars: 5,
};

// --- Combat ---
export const COMBAT = {
  punchRange: 2.4,
  punchDamage: 30,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 60,
  pistolCooldown: 0.28,
  magSize: 12,
  reloadTime: 1.6,
  enemyHealth: 100,
  enemyShotDamage: 8,
  enemyShotInterval: 1.4,
};

// --- Missions (3 core, ids stable for save data) ---
export const MISSIONS = [
  {
    id: 'barrio-run',
    title: '1 · Barrio Run',
    briefing: 'Mara is back in Solmar Bay. Silas Kane owns her debt. First: steal the red Comet GT in Barrio Verde and bring it to the Downtown garage.',
    reward: 300,
    steps: [
      { type: 'goto', label: 'Go to the garage in Barrio Verde', x: -196, z: 168, r: 10 },
      { type: 'steal', label: 'Steal the red Comet GT (E)', car: 'comet' },
      { type: 'drive', label: 'Deliver the Comet to the Downtown garage', x: 168, z: -112, r: 7 },
    ],
  },
  {
    id: 'dockyard-heat',
    title: '2 · Dockyard Heat',
    briefing: 'Kane wants a crate from the Port Solmar warehouse. Grab it on foot — then run. The whole port will be on you.',
    reward: 800,
    steps: [
      { type: 'goto', label: 'Reach the Port Solmar warehouse', x: -196, z: -178, r: 10 },
      { type: 'grab', label: 'Grab the crate (E)', x: -196, z: -178, r: 4 },
      { type: 'escape', label: 'Escape across the causeway to Isla Verde', x: 505, z: 0, r: 10, time: 150, wanted: 3 },
    ],
  },
  {
    id: 'sunset-showdown',
    title: '3 · Solmar Sunset Showdown',
    briefing: 'Sunset. Downtown plaza. Silas Kane and his crew are waiting. Take them down, grab the money bag, and get to the safehouse.',
    reward: 2500,
    steps: [
      { type: 'goto', label: 'Reach the Downtown plaza', x: 112, z: -112, r: 8 },
      { type: 'eliminate', label: 'Take down Kane\'s crew', count: 4 },
      { type: 'grab', label: 'Grab the money bag (E)', x: 112, z: -112, r: 4 },
      { type: 'escape', label: 'Escape to the Barrio safehouse', x: -196, z: 196, r: 8, time: 180, wanted: 5 },
    ],
  },
];

// Side contracts reuse the same step types — no new mechanics.
export const CONTRACTS = [
  { id: 'courier-1', title: 'Courier: 3 drops', kind: 'courier', reward: 250, points: [[-56, 56], [168, 168], [-168, -56]], time: 150 },
  { id: 'courier-2', title: 'Courier: night run', kind: 'courier', reward: 350, points: [[224, -224], [-224, 224], [56, -224]], time: 150 },
  { id: 'taxi-1', title: 'Taxi fare: beach run', kind: 'taxi', reward: 150, pickup: [-140, 140], drop: [252, 252], time: 120 },
  { id: 'taxi-2', title: 'Taxi fare: port run', kind: 'taxi', reward: 180, pickup: [84, -84], drop: [-252, -168], time: 120 },
  { id: 'stunt-1', title: 'Stunt jump: causeway', kind: 'stunt', reward: 200, x: 340, z: 0, r: 6 },
];

export const COINS = 10; // Solmar coins hidden around the city
export const SAVE_KEY = 'solmar-bay-save-v1';
export const START_MONEY = 250;
export const START_TIME = 17.5; // 17:30 — golden hour, the Sunset Heat look
