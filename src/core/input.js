// Unified input: keyboard + mouse (pointer lock, drag fallback), gamepad, and virtual touch controls.
import { clamp } from './util.js';

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], jump: ['Space'], crouch: ['ControlLeft', 'ControlRight'],
  interact: ['Enter', 'NumpadEnter', 'KeyE'], vehicle: ['KeyF'], punch: ['Mouse0', 'KeyJ'], kick: ['KeyK'], block: ['Mouse2', 'KeyL'], dodge: ['KeyQ'], push: ['KeyG'],
  reload: ['KeyR'], weaponNext: ['KeyT'], weaponPrev: ['KeyY'], holster: ['KeyH'],
  phone: ['Tab', 'KeyP', 'Backquote'], map: ['KeyM'], pause: ['Escape'], camera: ['KeyC', 'KeyV'], horn: ['KeyH'],
  companion: ['KeyZ'], companionCome: ['KeyX'], lights: ['KeyN'], radio: ['KeyR'], talk: ['KeyB'], photo: ['KeyO'],
};
export const ACTION_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Sprint / throttle', jump: 'Jump / handbrake / ascend', crouch: 'Crouch (tap) / descend',
  interact: 'Interact (contextual: vehicles, doors, people)', vehicle: 'Enter / exit vehicle (shortcut)', punch: 'Punch / fire', kick: 'Kick (with W: knee)', block: 'Block / aim', dodge: 'Dodge', push: 'Shove',
  reload: 'Reload (on foot)', weaponNext: 'Next weapon', weaponPrev: 'Previous weapon', holster: 'Holster weapon (on foot)',
  phone: 'Phone', map: 'Map', pause: 'Pause / close', camera: 'Camera view', horn: 'Horn (in vehicle)', companion: 'Companion: follow / stay', companionCome: 'Companion: come here', lights: 'Headlights', radio: 'Car radio (in vehicle)', talk: 'Push-to-talk microphone (hold)', photo: 'Photo mode',
};
export class Input {
  constructor(el) {
    this.el = el; this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.keys = new Set(); this.prev = new Set(); this.now = new Set(); this.tapped = new Set(); // tapped: key-downs since the last frame, so a quick tap is never missed at low frame rates
    this.virtual = new Set(); this.vPressed = new Set();
    this.look = { x: 0, y: 0 }; this.stick = { x: 0, y: 0 }; this.gp = { x: 0, y: 0, lx: 0, ly: 0, rt: 0, lt: 0 };
    this.sens = 1; this.invertY = false; this.touchSens = 1;
    this.locked = false; this.enabled = true; this.dragging = false; this.listening = null;
    this.onRebind = null;
    const kd = (e) => {
      if (this.listening) { e.preventDefault(); this._finishRebind(e.code); return; }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backquote', 'Enter', 'NumpadEnter'].includes(e.code)) { if (!(e.target && e.target.closest && e.target.closest('button,a,[contenteditable]') && (e.code === 'Enter' || e.code === 'Space'))) e.preventDefault(); }
      if (!e.repeat) this.tapped.add(e.code); this.keys.add(e.code);
    };
    const ku = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.keys.clear(); this.virtual.clear(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    let downX = 0, downY = 0, downT = 0, moved = 0;
    el.addEventListener('mousedown', (e) => {
      if (this.listening) { e.preventDefault(); this._finishRebind('Mouse' + e.button); return; }
      if (!this.enabled) return;
      downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = 0;
      if (this.locked) { this.keys.add('Mouse' + e.button); this.tapped.add('Mouse' + e.button); }
      else if (e.button === 0 && this.fireHold) this.keys.add('Mouse0'); // gun drawn without pointer lock: hold left to fire, right-drag aims and looks
      else { this.dragging = true; this.dragBtn = e.button; if (e.button === 2) this.keys.add('Mouse2'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.locked && this.dragging && e.button === 0 && this.dragBtn === 0 && moved < 6 && performance.now() - downT < 260 && this.enabled) { this.vPressed.add('punch'); }
      if (e.button === this.dragBtn) this.dragging = false; this.keys.delete('Mouse' + e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) { this.look.x += e.movementX * 0.0022 * this.sens; this.look.y += e.movementY * 0.0022 * this.sens * (this.invertY ? -1 : 1); }
      else if (this.dragging) { const mx = e.movementX || 0, my = e.movementY || 0; moved += Math.abs(mx) + Math.abs(my); this.look.x += mx * 0.004 * this.sens; this.look.y += my * 0.004 * this.sens * (this.invertY ? -1 : 1); }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; if (!this.locked && this.onUnlock) this.onUnlock(); });
    el.addEventListener('wheel', (e) => { this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
  }
  requestLock() {
    if (this.locked || this.touch) return;
    try { const p = this.el.requestPointerLock && this.el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag-to-look fallback */ }
  }
  releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {} }
  // per-frame: compute edges
  poll() {
    this.prev = this.now; this.now = new Set();
    for (const [act, codes] of Object.entries(this.bindings)) if (codes.some((c) => this.keys.has(c))) this.now.add(act);
    for (const a of this.virtual) this.now.add(a);
    this._pollGamepad();
    this.pressedSet = new Set([...this.now].filter((a) => !this.prev.has(a)));
    if (this.tapped.size) { for (const [act, codes] of Object.entries(this.bindings)) if (codes.some((c) => this.tapped.has(c))) this.pressedSet.add(act); this.tapped.clear(); }
    for (const a of this.vPressed) this.pressedSet.add(a);
    this.vPressed.clear();
  }
  down(a) { return this.enabled && this.now.has(a); }
  pressed(a) { return this.enabled && this.pressedSet && this.pressedSet.has(a); }
  consume(a) { if (this.pressedSet) this.pressedSet.delete(a); }
  move() {
    let x = 0, y = 0;
    if (this.down('left')) x -= 1; if (this.down('right')) x += 1; if (this.down('forward')) y += 1; if (this.down('back')) y -= 1;
    x += this.stick.x + this.gp.lx; y += this.stick.y + this.gp.ly;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y, mag: Math.min(1, l) };
  }
  takeLook() { const o = { x: this.look.x + this.gp.x * 0.045 * this.sens, y: this.look.y + this.gp.y * 0.035 * this.sens * (this.invertY ? -1 : 1) }; this.look.x = 0; this.look.y = 0; return o; }
  setVirtual(a, on) { if (on) { if (!this.virtual.has(a)) this.vPressed.add(a); this.virtual.add(a); } else this.virtual.delete(a); }
  tap(a) { this.vPressed.add(a); }
  addLook(dx, dy) { this.look.x += dx * 0.006 * this.touchSens; this.look.y += dy * 0.006 * this.touchSens * (this.invertY ? -1 : 1); }
  _pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = pads && [...pads].find((g) => g && g.connected);
    if (!p) { this.gp.lx = this.gp.ly = this.gp.x = this.gp.y = 0; return; }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.gp.lx = dz(p.axes[0]); this.gp.ly = -dz(p.axes[1]); this.gp.x = dz(p.axes[2] || 0); this.gp.y = dz(p.axes[3] || 0);
    const b = (i) => p.buttons[i] && p.buttons[i].pressed;
    const map = { 0: 'jump', 1: 'crouch', 2: 'interact', 3: 'vehicle', 4: 'block', 5: 'punch', 6: 'back', 7: 'forward', 8: 'map', 9: 'pause', 10: 'sprint', 11: 'kick', 12: 'phone', 13: 'camera', 14: 'companion', 15: 'horn' };
    for (const [i, a] of Object.entries(map)) if (b(+i)) this.now.add(a);
    this.gp.rt = p.buttons[7] ? p.buttons[7].value : 0; this.gp.lt = p.buttons[6] ? p.buttons[6].value : 0;
    this.gamepad = true;
  }
  rebind(action, cb) { this.listening = action; this.onRebind = cb; }
  _finishRebind(code) {
    const a = this.listening; this.listening = null;
    if (code !== 'Escape') {
      for (const k of Object.keys(this.bindings)) this.bindings[k] = this.bindings[k].filter((c) => c !== code);
      this.bindings[a] = [code, ...(DEFAULT_BINDINGS[a] || []).filter((c) => c !== code && !Object.values(this.bindings).flat().includes(c))].slice(0, 2);
    }
    if (this.onRebind) this.onRebind(a);
  }
  resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); }
  static keyName(code) { if (!code) return '—'; return code.replace('Key', '').replace('Digit', '').replace('Mouse0', 'Left click').replace('Mouse2', 'Right click').replace('Mouse1', 'Middle click').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'Ctrl').replace('Arrow', '↑↓←→'.includes('') ? 'Arrow ' : '').replace('Backquote', '`'); }
}
