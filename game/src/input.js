// Keyboard and mouse input. Held keys are read every frame; one-shot
// presses (interact, punch, pause, mute, confirm) are queued as bit flags
// and taken once, so a press between frames is never lost or counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_HORN = 16;
export const ACTION_MUTE = 32;
export const ACTION_SHOP = 64;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const HORN = new Set(['KeyH']);
const MUTE = new Set(['KeyM']);
const SHOP = new Set(['KeyQ']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (HORN.has(event.code)) actions |= ACTION_HORN;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (SHOP.has(event.code)) actions |= ACTION_SHOP;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseClicked = true;
    actions |= ACTION_CONFIRM;
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function held(code) {
    return keys.has(code);
  }

  return {
    /** Movement vector from WASD/arrows, normalised, in world axes. */
    moveVector() {
      let x = 0;
      let y = 0;
      if (held('KeyA') || held('ArrowLeft')) x -= 1;
      if (held('KeyD') || held('ArrowRight')) x += 1;
      if (held('KeyW') || held('ArrowUp')) y -= 1;
      if (held('KeyS') || held('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    throttle() {
      // Driving: W/S (or Up/Down) are gas and brake.
      return (held('KeyW') || held('ArrowUp') ? 1 : 0) - (held('KeyS') || held('ArrowDown') ? 1 : 0);
    },
    steer() {
      return (held('KeyD') || held('ArrowRight') ? 1 : 0) - (held('KeyA') || held('ArrowLeft') ? 1 : 0);
    },
    running() {
      return held('ShiftLeft') || held('ShiftRight');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    takeClick() {
      const c = mouseClicked;
      mouseClicked = false;
      return c;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
