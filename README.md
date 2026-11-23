[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/taniarestu/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/taniarestu/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay: Sunset Heat

An open-world crime game in the spirit of GTA 6 — built for the make.fun
“Make GTA 6” bounty. Fully offline: a seeded procedural city, three.js
vendored locally, synthesized sound, no network requests at all.

**Story:** Mara Solis is back in Solmar Bay after five years. She owes Silas
Kane — and Kane always collects. Three jobs stand between her and the
sunset: steal a Comet GT in Barrio Verde, lift a crate from Port Solmar
under a three-star wanted level, and take Kane down at the Downtown plaza.

## What is in the game

- **A city to explore on foot and by car** — five districts (Downtown
  Solmar, Palmera Beach, Barrio Verde, Port Solmar, Isla Verde across the
  causeway), with traffic, pedestrians, palms, neon signs and a day/night
  cycle that turns golden at sunset.
- **Driving and car theft** — arcade handling, handbrake slides, damage and
  smoke; walk up to any parked or traffic car and take it (the police will
  notice).
- **Wanted system + police** — 1–5 stars for stealing, hitting people,
  shooting and ramming cops. Cruiser chases, foot cops that bust you, and a
  safehouse that clears the heat.
- **Missions and a story** — 3 core jobs with waypoints, timers and
  rewards, plus side contracts (courier runs, taxi fares, a stunt jump) and
  10 hidden Solmar coins.
- **Combat** — fists and a hitscan pistol with reloads, armed guards, health
  and armor.
- **HUD with minimap** — health/armor, money, wanted stars, clock, speed,
  compass, and a live minimap with waypoint, police and landmarks.
- **Start and save** — title screen, pause, autosave after every mission
  (localStorage), and a fully synthesized Web Audio soundtrack (engine,
  sirens, gunshots, procedural music loop).

## How to play

1. Run `node serve.ts` and open http://localhost:8080 — or open
   `game/index.html` from any static server.
2. **WASD** move / drive · **Mouse drag** look around · **Shift** run ·
   **Space** jump · **E** enter or steal a car · **F** punch · **Click**
   shoot (pistol) · **1/2** switch weapon · **R** reload · **Esc** pause ·
   **M** mute.
3. Follow the yellow waypoint. Missions pay; contracts pay too.

## Determinism

The city, traffic, pedestrians and AI are pure functions of a seed
(`?seed=N`, default 20261123). The simulation runs on a fixed 1/60 s step
with a seeded PRNG — no `Date.now()`, no `Math.random()` in the sim. The
same seed always builds the same Solmar Bay.

## Tech

- three.js (vendored under `game/vendor/three/`), vanilla ES modules, no
  build step, no dependencies.
- Procedural everything: canvas textures for roads and windows, InstancedMesh
  buildings/palms/lamps/containers, Web Audio synthesis.
- `main.ts` (Node 22, stdlib only) copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.

## License

MIT — see `LICENSE`. Everything here is original: city, characters, names,
story, art and sound. No Rockstar Games name, logo, character, map or asset.
