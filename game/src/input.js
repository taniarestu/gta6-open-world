// Keyboard + mouse input. Held keys give movement axes; one-shot presses are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost or counted twice. Mouse drag orbits the camera;
// clicking the canvas also tries pointer lock (falls back to drag).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_RELOAD = 32;
export const ACTION_WEAPON1 = 64;
export const ACTION_WEAPON2 = 128;
export const ACTION_JUMP = 256;
export const ACTION_MUTE = 512;

const KEYS = {
  forward: new Set(['KeyW', 'ArrowUp']),
  back: new Set(['KeyS', 'ArrowDown']),
  left: new Set(['KeyA', 'ArrowLeft']),
  right: new Set(['KeyD', 'ArrowRight']),
  run: new Set(['ShiftLeft', 'ShiftRight']),
};

export function createInput(canvas) {
  const held = { forward: false, back: false, left: false, right: false, run: false };
  let actions = 0;
  let orbitDX = 0;
  let orbitDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    const c = event.code;
    if (KEYS.forward.has(c)) held.forward = true;
    else if (KEYS.back.has(c)) held.back = true;
    else if (KEYS.left.has(c)) held.left = true;
    else if (KEYS.right.has(c)) held.right = true;
    else if (KEYS.run.has(c)) held.run = true;
    else if (c === 'Space' || c === 'Enter') { if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_JUMP; }
    else if (c === 'Escape' || c === 'KeyP') { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (c === 'KeyE') { if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (c === 'KeyF') { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (c === 'KeyR') { if (!event.repeat) actions |= ACTION_RELOAD; }
    else if (c === 'Digit1') { if (!event.repeat) actions |= ACTION_WEAPON1; }
    else if (c === 'Digit2') { if (!event.repeat) actions |= ACTION_WEAPON2; }
    else if (c === 'KeyM') { if (!event.repeat) actions |= ACTION_MUTE; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const c = event.code;
    if (KEYS.forward.has(c)) held.forward = false;
    else if (KEYS.back.has(c)) held.back = false;
    else if (KEYS.left.has(c)) held.left = false;
    else if (KEYS.right.has(c)) held.right = false;
    else if (KEYS.run.has(c)) held.run = false;
  });
  window.addEventListener('blur', () => {
    held.forward = held.back = held.left = held.right = held.run = false;
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.button === 0) actions |= ACTION_SHOOT;
    try { canvas.requestPointerLock?.(); } catch { /* drag still works */ }
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (event) => {
    if (document.pointerLockElement === canvas) {
      orbitDX += event.movementX || 0;
      orbitDY += event.movementY || 0;
    } else if (dragging) {
      orbitDX += event.clientX - lastX;
      orbitDY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });

  return {
    moveX() { return (held.right ? 1 : 0) - (held.left ? 1 : 0); },
    moveY() { return (held.forward ? 1 : 0) - (held.back ? 1 : 0); },
    running() { return held.run; },
    takeOrbit() {
      const d = { dx: orbitDX, dy: orbitDY };
      orbitDX = 0;
      orbitDY = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
