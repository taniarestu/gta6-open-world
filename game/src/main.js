// Boot + the one loop. Input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, busted/wasted.
//
// ?seed=N fixes the city and all AI. ?shot=cover|downtown|mission|beach
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot — the frame is what a
// short game really looks like, and the same seed always gives the same one.
import * as THREE from 'three';
import { STEP, DEFAULT_SEED, START_TIME, START_MONEY, WANTED, COMBAT } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_PUNCH, ACTION_SHOOT,
  ACTION_RELOAD, ACTION_WEAPON1, ACTION_WEAPON2, ACTION_JUMP, ACTION_MUTE,
  createInput,
} from './input.js';
import { createCamera } from './camera.js';
import { createVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { createWanted } from './wanted.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame, clearSave, defaultSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.1; // longest frame the loop catches up on
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = createHUD();
const audio = createAudio();
const events = [];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
} catch (err) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Solmar Bay needs WebGL. Please open it in a desktop browser with hardware acceleration enabled.</p>';
  throw err;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(-196, 14, 200);
const cam = createCamera(camera);
const city = buildCity(scene, rng);
const vehicles = createVehicles(scene, rng, city, events);
const people = createPeople(scene, rng, city, events);
const wanted = createWanted(vehicles, people);
const combat = createCombat(scene, rng, events);
const missions = createMissions(scene, rng, { city, vehicles, people, combat, wanted, events });
const input = createInput(canvas);

// --- Game state (serializable part goes to the save) ---
const state = {
  screen: 'title',
  money: START_MONEY,
  timeOfDay: START_TIME,
  simSeconds: 0,
  driving: false,
  currentCar: null,
  muted: false,
};

function announce(message) {
  status.textContent = message;
}

function persist() {
  saveGame({
    money: state.money,
    missionIndex: missions.missionIndex,
    storyComplete: missions.storyComplete,
    coinsCollected: missions.coinsCollected,
    contractIndex: 0,
    playerX: people.player.x,
    playerZ: people.player.z,
    timeOfDay: state.timeOfDay,
    wantedHeat: wanted.heat,
  });
}

function applySave(save) {
  state.money = save.money;
  state.timeOfDay = save.timeOfDay;
  people.player.x = save.playerX;
  people.player.z = save.playerZ;
  people.player.mesh.group.position.set(save.playerX, 0, save.playerZ);
  wanted.setHeat(save.wantedHeat);
  missions.setState(save);
}

function resetNewGame() {
  clearSave();
  state.money = START_MONEY;
  state.timeOfDay = START_TIME;
  state.simSeconds = 0;
  state.driving = false;
  state.currentCar = null;
  vehicles.setDrivenCar(null);
  people.player.x = -196;
  people.player.z = 182;
  people.player.y = 0;
  people.player.health = 100;
  people.player.armor = 0;
  people.player.mesh.group.position.set(-196, 0, 182);
  vehicles.playerCar.x = -196;
  vehicles.playerCar.z = 196;
  vehicles.playerCar.health = 100;
  wanted.clear();
  missions.startMission(0);
}

function enterCar(car) {
  state.driving = true;
  state.currentCar = car;
  vehicles.setDrivenCar(car);
  people.player.driving = true;
  people.player.mesh.group.visible = false;
  if (car.kind === 'parked' || car.kind === 'traffic') {
    wanted.addHeat(WANTED.stealCar);
    hud.showMessage('Car stolen! The police are on their way.', 4);
    announce('Car stolen. Wanted level up.');
  }
  car.kind = 'player';
  car.state = 'player';
  audio.ensure();
}

function exitCar() {
  const car = state.currentCar;
  if (!car) return;
  state.driving = false;
  state.currentCar = null;
  vehicles.setDrivenCar(null);
  people.player.driving = false;
  people.player.mesh.group.visible = true;
  people.player.x = car.x + Math.cos(car.heading) * 2.5;
  people.player.z = car.z - Math.sin(car.heading) * 2.5;
  people.player.mesh.group.position.set(people.player.x, 0, people.player.z);
  car.kind = 'parked';
  car.state = 'parked';
  car.speed = 0;
}

function respawn(reason) {
  const lost = reason === 'busted' ? 100 : Math.floor(state.money / 2);
  state.money = Math.max(0, state.money - lost);
  people.player.health = 100;
  people.player.x = -196;
  people.player.z = 182;
  people.player.mesh.group.position.set(-196, 0, 182);
  if (state.driving) exitCar();
  wanted.clear();
  vehicles.playerCar.x = -196;
  vehicles.playerCar.z = 196;
  vehicles.playerCar.health = 100;
  state.screen = 'play';
  document.getElementById('end-screen').classList.add('hidden');
  hud.showMessage(reason === 'busted'
    ? `BUSTED — the cops took $${lost}. Back at the safehouse.`
    : `WASTED — you lost $${lost}. Back at the safehouse.`, 5);
  persist();
}

function handleEvents() {
  for (const e of events.splice(0)) {
    if (e.type === 'crash') {
      cam.addShake(0.35);
      audio.punch();
    } else if (e.type === 'hit-ped') {
      wanted.addHeat(WANTED.hitPed);
      hud.showMessage('You hit a pedestrian! Wanted level up.', 3);
    } else if (e.type === 'shoot') {
      wanted.addHeat(WANTED.shoot);
      audio.shot();
      cam.addShake(0.12);
    } else if (e.type === 'enemy-shoot') {
      audio.enemyShot();
    } else if (e.type === 'ram-police') {
      wanted.addHeat(WANTED.ramPolice);
    } else if (e.type === 'rammed') {
      cam.addShake(0.4);
      audio.punch();
    } else if (e.type === 'punch') {
      audio.punch();
    } else if (e.type === 'player-shot') {
      people.player.health -= e.damage;
      cam.addShake(0.25);
      if (people.player.health <= 0) {
        document.getElementById('end-title').textContent = 'WASTED';
        document.getElementById('end-text').textContent = 'Mara went down in the streets of Solmar Bay.';
        document.getElementById('end-screen').classList.remove('hidden');
        state.screen = 'end';
        state.endReason = 'wasted';
        audio.fail();
      }
    } else if (e.type === 'busted') {
      document.getElementById('end-title').textContent = 'BUSTED';
      document.getElementById('end-text').textContent = 'The Solmar Bay PD caught up with Mara.';
      document.getElementById('end-screen').classList.remove('hidden');
      state.screen = 'end';
      state.endReason = 'busted';
      audio.fail();
    } else if (e.type === 'coin') {
      state.money += 25;
      audio.pickup();
      hud.showMessage(`Solmar coin ${e.count}/10 — +$25`, 2);
    } else if (e.type === 'mission-start') {
      hud.showBanner(e.mission.title, 3);
      hud.showMessage(e.mission.briefing, 8);
      announce(`${e.mission.title}. ${e.mission.briefing}`);
    } else if (e.type === 'mission-complete') {
      state.money += e.reward;
      hud.showBanner('MISSION COMPLETE', 3);
      hud.showMessage(`+$${e.reward} — ${e.mission.title} done.`, 5);
      audio.mission();
      persist();
      announce(`Mission complete. Earned $${e.reward}.`);
    } else if (e.type === 'mission-failed') {
      hud.showBanner('MISSION FAILED', 3);
      hud.showMessage(`${e.reason} — restarting the mission.`, 5);
      audio.fail();
    } else if (e.type === 'contract-start') {
      hud.showBanner(e.contract.title, 3);
      hud.showMessage('Side contract started — follow the waypoint.', 5);
    } else if (e.type === 'contract-complete') {
      state.money += e.reward;
      hud.showMessage(`Contract done — +$${e.reward}`, 4);
      audio.mission();
      persist();
    } else if (e.type === 'contract-failed') {
      hud.showMessage(`Contract failed: ${e.reason}`, 4);
      audio.fail();
    } else if (e.type === 'story-complete') {
      hud.showBanner('SUNSET SCORE — STORY COMPLETE', 4);
      hud.showMessage('Kane is finished. Mara owns the sunset now — free roam, contracts and coins remain. The end... for now.', 10);
      audio.mission();
      persist();
    }
  }
}

function step(dt) {
  state.simSeconds += dt;
  state.timeOfDay = (state.timeOfDay + dt / 240) % 24; // 1 game hour per 4 real minutes
  city.updateSun(state.timeOfDay);
  city.pulseBeacon(state.simSeconds);

  const orbit = input.takeOrbit();
  if (orbit.dx || orbit.dy) cam.orbit(orbit.dx, orbit.dy);
  const actions = input.takeActions();

  if (actions & ACTION_MUTE) {
    state.muted = audio.toggleMute();
    hud.showMessage(state.muted ? 'Sound muted (M to unmute)' : 'Sound on', 2);
  }
  if (actions & ACTION_PAUSE) {
    if (state.screen === 'play') {
      state.screen = 'pause';
      document.getElementById('pause-stats').textContent =
        `Money $${state.money} · Missions ${Math.min(missions.missionIndex + 1, 3)}/3 · Coins ${missions.coinsCollected}/10 · Wanted ${'★'.repeat(wanted.stars()) || '—'}`;
      document.getElementById('pause-screen').classList.remove('hidden');
    } else if (state.screen === 'pause') {
      state.screen = 'play';
      document.getElementById('pause-screen').classList.add('hidden');
    }
  }

  if (state.screen !== 'play') return;

  if (actions & ACTION_WEAPON1) combat.setWeapon('fists');
  if (actions & ACTION_WEAPON2) combat.setWeapon('pistol');
  if (actions & ACTION_RELOAD) combat.reload();

  if (state.driving) {
    vehicles.drivePlayer(dt, input, cam.yaw);
    if (actions & ACTION_INTERACT) exitCar();
    if (actions & ACTION_SHOOT) { /* no shooting while driving */ }
  } else {
    people.movePlayer(dt, input, cam.yaw);
    people.jumpPlayer(dt, actions, ACTION_JUMP);
    if (actions & ACTION_PUNCH) combat.punch(people.player, people.peds);
    if (actions & ACTION_SHOOT && combat.weapon === 'pistol') {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = camera.position.clone();
      combat.shoot(origin, dir, people.player);
    }
    if (actions & ACTION_INTERACT) {
      const near = vehicles.nearestStealable(people.player.x, people.player.z, 4);
      if (near) enterCar(near);
      else missions.tryInteract(people.player);
    }
  }

  vehicles.updateTraffic(dt, state.simSeconds, people.player);
  vehicles.updatePolice(dt, people.player, state.driving, state.simSeconds);
  people.updatePeds(dt, vehicles.cars, vehicles.drivenCar, state.driving);
  people.updateCops(dt, wanted.stars());
  combat.update(dt, people.player, camera);
  missions.update(dt, people.player, state.driving, state.currentCar);
  wanted.update(dt, people.player, state.driving);

  // Safehouse: standing at the Barrio garage clears the heat.
  if (!state.driving && Math.hypot(people.player.x + 196, people.player.z - 182) < 8 && wanted.stars() > 0) {
    wanted.clear();
    hud.showMessage('Safehouse — wanted level cleared.', 3);
  }

  audio.setEngine(state.driving ? Math.abs(state.currentCar.speed) / 34 : 0, state.driving);
  audio.setSiren(wanted.stars() > 0 && vehicles.police.length > 0, state.simSeconds);
  handleEvents();
}

function renderFrame() {
  const focus = state.driving && state.currentCar
    ? { x: state.currentCar.x, y: 1, z: state.currentCar.z }
    : { x: people.player.x, y: people.player.y, z: people.player.z };
  cam.update(1 / 60, focus, state.driving, state.currentCar ? Math.abs(state.currentCar.speed) : 0);
  renderer.render(scene, camera);
  const wp = missions.waypoint();
  hud.update({
    health: people.player.health,
    armor: people.player.armor,
    money: state.money,
    coins: missions.coinsCollected,
    missionTitle: missions.title(),
    objective: missions.label(),
    waypoint: wp,
    timer: missions.active ? missions.stepTimer : 0,
    playerX: focus.x,
    playerZ: focus.z,
    heading: cam.yaw,
    wanted: wanted.stars(),
    timeOfDay: state.timeOfDay,
    driving: state.driving,
    speed: state.currentCar ? state.currentCar.speed : 0,
    weapon: combat.weapon,
    ammo: combat.ammo,
    reloading: combat.reloading,
    police: vehicles.police,
    simSeconds: state.simSeconds,
  }, 1 / 60);
}

function runGame() {
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
    if (state.screen !== 'title') renderFrame();
    else {
      // Title backdrop: slow orbit over the city at sunset.
      state.timeOfDay = 17.6;
      city.updateSun(state.timeOfDay);
      camera.position.set(-260 + Math.sin(state.simSeconds * 0.02) * 40, 90, 220);
      camera.lookAt(0, 10, 0);
      renderer.render(scene, camera);
      state.simSeconds += 1 / 60;
    }
  }
  document.getElementById('btn-new').addEventListener('click', () => {
    audio.ensure();
    resetNewGame();
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    state.screen = 'play';
    announce('Playing. Follow the yellow waypoint.');
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    const save = loadSave();
    if (!save) return;
    audio.ensure();
    applySave(save);
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    state.screen = 'play';
    hud.showMessage('Welcome back to Solmar Bay.', 4);
  });
  document.getElementById('btn-how').addEventListener('click', () => {
    document.getElementById('howto').classList.toggle('hidden');
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    state.screen = 'play';
  });
  document.getElementById('btn-restart-mission').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    missions.startMission(Math.min(missions.missionIndex, 2));
    state.screen = 'play';
  });
  document.getElementById('btn-quit-title').addEventListener('click', () => {
    persist();
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    state.screen = 'title';
  });
  document.getElementById('btn-end-ok').addEventListener('click', () => respawn(state.endReason || 'wasted'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') {
      state.screen = 'pause';
      document.getElementById('pause-screen').classList.remove('hidden');
    }
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  // Continue is only offered when a save exists.
  if (!loadSave()) document.getElementById('btn-continue').style.display = 'none';
  announce('Solmar Bay: Sunset Heat. Press New Game to start.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  state.screen = 'play';
  const game = {
    state, people, vehicles, wanted, combat, missions, city, cam, camera, events,
    setTimeOfDay(t) { state.timeOfDay = t; city.updateSun(t); },
  };
  const shot = stageShot(name, game);
  // Let traffic, peds and police settle for a fixed number of steps.
  for (let i = 0; i < 45; i += 1) step(STEP);
  // Snap the camera after the settle steps, so the frame is exact.
  cam.snap(shot.focus(), shot.yaw, shot.pitch, shot.dist);
  // Shots are silent stills: no mission banner or briefing box over the frame.
  hud.hideOverlays();
  handleEvents();
  let painted = 0;
  function paint() {
    renderFrame();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// Debug handle for automated playtests (and for the finalist review team):
// read-only-ish access to live sim state. Harmless in normal play.
window.__game = { state, people, vehicles, missions, wanted, combat, city };

if (shotName) runShot(shotName);
else runGame();
