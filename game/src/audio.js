// Sound, fully synthesized with Web Audio — no audio files, no network.
// Engine hum, two-tone siren, gunshot noise, thuds and blips, plus a small
// procedural bass-and-hat loop. Init is guarded: if there is no audio device
// or the context cannot resume, every call is a safe no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenOn = false;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  const BASS = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 0, 73.4, 0]; // A1 C3 G1 E3...

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 90;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: square wave, frequency flipped by a timer in update().
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Music loop: one step every 0.22 s.
      musicTimer = window.setInterval(() => {
        if (muted || !ctx || ctx.state !== 'running') return;
        const step = musicStep % 16;
        musicStep += 1;
        const bass = BASS[step];
        if (bass) blip(bass, 0.2, 'triangle', 0.16);
        if (step % 2 === 0) noiseTick(0.03, 0.05);
        if (step === 4 || step === 12) blip(220, 0.12, 'sine', 0.08);
      }, 220);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || muted) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* audio is best-effort */ }
  }

  function noiseTick(dur, vol) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (i / len) * 2 - 1; // deterministic ramp, not random
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = vol;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 3000;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch { /* audio is best-effort */ }
  }

  function noiseBurst(dur, vol, lowpassFreq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      // Deterministic pseudo-noise from a fixed LCG (audio only, not sim).
      let s = 12345;
      for (let i = 0; i < len; i += 1) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (s / 0x7fffffff) * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpassFreq || 1200;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch { /* audio is best-effort */ }
  }

  return {
    ensure,
    setEngine(speed01, driving) {
      if (!ctx || !engineGain) return;
      const target = driving ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 140, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(82 + speed01 * 200, ctx.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, ctx.currentTime, 0.1);
    },
    setSiren(on, simSeconds) {
      if (!ctx || !sirenGain) return;
      sirenOn = on;
      sirenGain.gain.setTargetAtTime(muted || !on ? 0 : 0.045, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(Math.floor(simSeconds * 1.6) % 2 === 0 ? 720 : 960, ctx.currentTime, 0.05);
    },
    shot() { noiseBurst(0.14, 0.5, 2400); },
    enemyShot() { noiseBurst(0.1, 0.2, 1800); },
    punch() { blip(90, 0.12, 'sine', 0.3); noiseBurst(0.06, 0.15, 500); },
    pickup() { blip(660, 0.09, 'sine', 0.18); window.setTimeout(() => blip(990, 0.12, 'sine', 0.18), 90); },
    mission() { [523, 659, 784].forEach((f, i) => window.setTimeout(() => blip(f, 0.18, 'triangle', 0.2), i * 110)); },
    fail() { [330, 262, 196].forEach((f, i) => window.setTimeout(() => blip(f, 0.2, 'triangle', 0.2), i * 130)); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
