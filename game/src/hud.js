// HUD: DOM bars/text plus a 2D canvas minimap (roads, water, island, player
// arrow, waypoint, police). All reads are plain numbers from sim state; the
// HUD never owns game rules.
export function createHUD() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const armorFill = el('armor-fill');
  const moneyEl = el('money');
  const coinCount = el('coin-count');
  const missionTitle = el('mission-title');
  const missionObjective = el('mission-objective');
  const missionDist = el('mission-dist');
  const compassText = el('compass-text');
  const wantedEl = el('wanted');
  const clockEl = el('clock');
  const speedEl = el('speed');
  const weaponEl = el('weapon');
  const hintEl = el('hint');
  const crosshair = el('crosshair');
  const banner = el('banner');
  const message = el('message');
  const vignette = el('damage-vignette');
  const minimap = el('minimap');
  const mm = minimap.getContext('2d');
  const stars = wantedEl.querySelectorAll('.star');
  let bannerTimer = 0;
  let messageTimer = 0;

  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  function showBanner(text, seconds) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    bannerTimer = seconds || 2.5;
  }
  function showMessage(text, seconds) {
    message.textContent = text;
    message.classList.remove('hidden');
    messageTimer = seconds || 5;
  }
  function hideOverlays() {
    banner.classList.add('hidden');
    message.classList.add('hidden');
    bannerTimer = 0;
    messageTimer = 0;
  }
  function setHint(text) {
    if (text) {
      hintEl.textContent = text;
      hintEl.classList.add('show');
    } else {
      hintEl.classList.remove('show');
    }
  }

  // Minimap: world x -320..640, z -320..320 mapped into a 200 px circle.
  function drawMinimap(s) {
    const W = 200;
    const H = 200;
    const sx = (x) => ((x + 320) / 960) * W;
    const sz = (z) => ((z + 320) / 640) * H;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = '#10182a';
    mm.fillRect(0, 0, W, H);
    // Water + sand + island.
    mm.fillStyle = '#166b7d';
    mm.fillRect(sx(352), 0, W - sx(352), H);
    mm.fillStyle = '#e2c491';
    mm.fillRect(sx(308), 0, sx(352) - sx(308), H);
    mm.fillStyle = '#6f8f52';
    mm.fillRect(sx(430), sz(-140), sx(580) - sx(430), sz(140) - sz(-140));
    // Roads.
    mm.strokeStyle = 'rgba(200, 200, 210, 0.55)';
    mm.lineWidth = 2;
    for (let v = -280; v <= 280; v += 56) {
      mm.beginPath(); mm.moveTo(sx(v), sz(-280)); mm.lineTo(sx(v), sz(280)); mm.stroke();
      mm.beginPath(); mm.moveTo(sx(-280), sz(v)); mm.lineTo(sx(280), sz(v)); mm.stroke();
    }
    mm.beginPath(); mm.moveTo(sx(308), sz(0)); mm.lineTo(sx(580), sz(0)); mm.stroke();
    // Waypoint (pulsing diamond).
    if (s.waypoint) {
      const pulse = 3 + Math.sin(s.simSeconds * 4) * 1.2;
      mm.fillStyle = '#ffd23f';
      mm.beginPath();
      mm.moveTo(sx(s.waypoint.x), sz(s.waypoint.z) - pulse - 3);
      mm.lineTo(sx(s.waypoint.x) + pulse + 3, sz(s.waypoint.z));
      mm.lineTo(sx(s.waypoint.x), sz(s.waypoint.z) + pulse + 3);
      mm.lineTo(sx(s.waypoint.x) - pulse - 3, sz(s.waypoint.z));
      mm.closePath();
      mm.fill();
    }
    // Police (red/blue dots).
    for (const p of s.police) {
      mm.fillStyle = '#ff4455';
      mm.beginPath(); mm.arc(sx(p.x), sz(p.z), 3, 0, Math.PI * 2); mm.fill();
    }
    // Player arrow.
    mm.save();
    mm.translate(sx(s.playerX), sz(s.playerZ));
    mm.rotate(s.heading);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath();
    mm.fill();
    mm.restore();
  }

  function update(s, dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) banner.classList.add('hidden');
    }
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) message.classList.add('hidden');
    }
    healthFill.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    armorFill.style.width = `${Math.max(0, Math.min(100, s.armor))}%`;
    moneyEl.textContent = s.money;
    coinCount.textContent = s.coins;
    missionTitle.textContent = s.missionTitle;
    missionObjective.textContent = s.objective;
    missionDist.textContent = s.waypoint
      ? `${Math.round(Math.hypot(s.playerX - s.waypoint.x, s.playerZ - s.waypoint.z))} m${s.timer ? ` · ${Math.ceil(s.timer)} s` : ''}`
      : '';
    const dirIndex = Math.round((((Math.atan2(-Math.sin(s.heading), -Math.cos(s.heading)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4))) % 8;
    compassText.textContent = DIRS[dirIndex];
    stars.forEach((star, i) => star.classList.toggle('on', i < s.wanted));
    const hh = Math.floor(s.timeOfDay) % 24;
    const mm2 = Math.floor((s.timeOfDay % 1) * 60);
    clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm2).padStart(2, '0')}`;
    speedEl.innerHTML = s.driving ? `${Math.round(Math.abs(s.speed) * 3.6)} <small>km/h</small>` : '';
    weaponEl.textContent = s.driving ? '🚗 DRIVING' : (s.weapon === 'pistol' ? `🔫 PISTOL ${s.ammo}/12${s.reloading ? ' · RELOADING' : ''}` : '✊ FISTS');
    crosshair.classList.toggle('hidden', !(s.weapon === 'pistol' && !s.driving));
    vignette.style.opacity = s.health < 35 ? String(0.5 + Math.sin(s.simSeconds * 5) * 0.2) : '0';
    drawMinimap(s);
  }

  return { update, showBanner, showMessage, hideOverlays, setHint };
}
