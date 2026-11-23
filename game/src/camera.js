// Third-person camera: follows Mara on foot, chase cam behind the car.
// Smoothed (lerped) so it never snaps; a small shake term sells impacts.
// The camera is a pure view of sim state — it owns no game rules.
import * as THREE from 'three';

export function createCamera(camera) {
  let yaw = 0; // orbit around the player (radians)
  let pitch = 0.32; // look-down angle
  let shake = 0;
  let dist = 9;

  function orbit(dx, dy) {
    yaw -= dx * 0.004;
    pitch = Math.max(0.08, Math.min(1.1, pitch + dy * 0.003));
  }

  function addShake(amount) {
    shake = Math.min(0.6, shake + amount);
  }

  function update(dt, focus, driving, speed) {
    const wantDist = driving ? 11 + Math.min(5, speed * 0.12) : 8.5;
    dist += (wantDist - dist) * Math.min(1, dt * 3);
    shake = Math.max(0, shake - dt * 1.6);
    const cx = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = focus.y + 2.2 + Math.sin(pitch) * dist;
    const tx = focus.x + (shake ? (Math.sin(focus.x * 91 + shake * 40) * shake * 0.4) : 0);
    const tz = focus.z + (shake ? (Math.cos(focus.z * 83 + shake * 40) * shake * 0.4) : 0);
    camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 8);
    camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 8);
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 8);
    camera.lookAt(tx, focus.y + 1.6, tz);
  }

  // Point the camera at a staged scene (screenshot mode): no smoothing.
  function snap(focus, yawAngle, pitchAngle, distance) {
    yaw = yawAngle;
    pitch = pitchAngle;
    dist = distance;
    const cx = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
    camera.position.set(cx, focus.y + 2.2 + Math.sin(pitch) * dist, cz);
    camera.lookAt(focus.x, focus.y + 1.6, focus.z);
  }

  return { orbit, addShake, update, snap, get yaw() { return yaw; }, set yaw(v) { yaw = v; } };
}
