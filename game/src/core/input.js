// Keyboard, mouse and pointer-lock input, with edge detection ("was pressed this step") so the
// simulation never reads a key twice in one fixed step.

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
  KeyE: 'enter',
  KeyF: 'fire',
  KeyQ: 'weapon',
  KeyR: 'reload',
  KeyH: 'horn',
  KeyC: 'handbrake',
  KeyT: 'mission',
  KeyM: 'map',
  Escape: 'pause',
  Enter: 'confirm',
  F5: 'save',
  F9: 'load',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, down: false, clicked: false };
    this.locked = false;
    this.anyInput = false;

    window.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (action === undefined) return;
      if (action === 'save' || action === 'load' || e.code === 'Tab') e.preventDefault();
      if (!this.held.has(action)) this.pressedThisFrame.add(action);
      this.held.add(action);
      this.anyInput = true;
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (action === undefined) return;
      this.held.delete(action);
      this.releasedThisFrame.add(action);
    });
    window.addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('mousemove', (e) => {
      const dx = e.movementX ?? 0;
      const dy = e.movementY ?? 0;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.locked) {
        this.mouse.dx += dx;
        this.mouse.dy += dy;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
      this.anyInput = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(action) {
    return this.held.has(action);
  }

  pressed(action) {
    return this.pressedThisFrame.has(action);
  }

  released(action) {
    return this.releasedThisFrame.has(action);
  }

  /** Horizontal move intent from WASD, normalised, in screen space (x = right, y = forward). */
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Called at the end of every fixed step: edges only live for one step. */
  endStep() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.clicked = false;
  }
}

/**
 * Scripted input for the `?shot=` scenes: a deterministic autopilot that mimics a player holding
 * keys, so the recorded frame is produced by the real controllers, not by a special case.
 */
export class ScriptedInput extends Input {
  constructor() {
    super(document.createElement('canvas'));
    this.script = [];
    this.time = 0;
  }

  /** events: [{at: seconds, hold: [actions], until: seconds}] */
  setScript(script) {
    this.script = script;
  }

  applyAt(t) {
    this.time = t;
    this.held.clear();
    this.pressedThisFrame.clear();
    for (const e of this.script) {
      if (t >= e.at && (e.until === undefined || t < e.until)) {
        for (const a of e.hold) this.held.add(a);
      }
    }
    this.mouse.down = this.script.some((e) => e.fire === true && t >= e.at && (e.until === undefined || t < e.until));
  }

  down(action) {
    return this.held.has(action);
  }

  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('forward')) y += 1;
    if (this.held.has('back')) y -= 1;
    const len = Math.hypot(x, y);
    return { x: x / (len > 1 ? len : 1), y: y / (len > 1 ? len : 1) };
  }

  endStep() {}
}
