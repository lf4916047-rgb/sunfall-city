// Keyboard and mouse input for Sunfall City.
// Held keys are read live from a Set; one-shot presses (confirm, pause, enter car,
// accept mission, reload, mute) are queued and taken once, so a press between two
// frames is never lost and never counted twice.
import { S } from './state.js';

export const ACT_CONFIRM = 1;
export const ACT_PAUSE = 2;
export const ACT_ENTER = 4;
export const ACT_MISSION = 8;
export const ACT_RELOAD = 16;
export const ACT_MUTE = 32;
export const ACT_MELEE = 64;

const KEY_ACTIONS = {
  Space: ACT_CONFIRM, Enter: ACT_CONFIRM,
  KeyP: ACT_PAUSE, Escape: ACT_PAUSE,
  KeyE: ACT_ENTER,
  KeyM: ACT_MISSION,
  KeyR: ACT_RELOAD,
  KeyN: ACT_MUTE,
  KeyF: ACT_MELEE,
};

export function createInput(canvas) {
  let actions = 0;
  const held = S.keys;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held[event.code] = true;
    const a = KEY_ACTIONS[event.code];
    if (a) { actions |= a; event.preventDefault(); }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => { held[event.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
    S.mouse.down = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    S.mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    S.mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { S.mouse.down = true; actions |= ACT_CONFIRM; }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) S.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Held-key movement vector: x -1..1 (strafe left/right on foot), y -1..1 (forward/back). */
    move() {
      const x = (held.KeyD || held.ArrowRight ? 1 : 0) - (held.KeyA || held.ArrowLeft ? 1 : 0);
      const y = (held.KeyW || held.ArrowUp ? 1 : 0) - (held.KeyS || held.ArrowDown ? 1 : 0);
      return { x, y };
    },
    drive() {
      const throttle = (held.KeyW || held.ArrowUp ? 1 : 0) - (held.KeyS || held.ArrowDown ? 1 : 0);
      const steer = (held.KeyA || held.ArrowLeft ? -1 : 0) + (held.KeyD || held.ArrowRight ? 1 : 0);
      return { throttle, steer, handbrake: !!held.Space };
    },
    running() { return !!(held.ShiftLeft || held.ShiftRight); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
