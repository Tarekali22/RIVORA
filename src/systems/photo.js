// Photo mode: freezes the world, frees the camera (orbit / first person, zoom, height), hides the HUD and saves
// shots to the phone's Photos app. Open with O (or the 📷 button on touch), capture with Enter / Space / click.
import { T, isAR, addStrings } from '../core/i18n.js';
import { clamp, bus, fmtTime } from '../core/util.js';

addStrings({ 'Photo mode': 'وضع التصوير', 'Capture': 'التقاط', 'Exit': 'خروج', 'First person': 'منظور الشخص الأول', 'Third person': 'منظور خارجي', 'Hide character': 'إخفاء الشخصية', 'Show character': 'إظهار الشخصية',
  'Mouse / drag: aim · W/S: distance · Q/E: height · wheel or −/+: zoom · Enter/Space/click: capture · O or Esc: exit': 'الماوس/السحب: التوجيه · W/S: المسافة · Q/E: الارتفاع · العجلة أو −/+: التكبير · Enter/المسافة/ضغطة: التقاط · O أو Esc: خروج' });

export class PhotoMode {
  constructor(game) {
    this.game = game; this.on = false;
    bus.on('photo', () => { const c = this.game.camera, d = new THREE.Vector3(); c.getWorldDirection(d); bus.emit('photoTaken', { cam: c.position.clone(), dir: d }); });
    if (game.touch) { const b = document.createElement('button'); b.className = 'tbtn wbtn w-photo'; b.textContent = '📷'; b.addEventListener('touchstart', (e) => { e.preventDefault(); this.toggle(); }, { passive: false }); document.body.appendChild(b); this.tb = b; bus.on('tick', () => { b.style.display = this.game.running && !this.game.ui.blockingUI && !this.on ? '' : 'none'; }); }
  }
  toggle() { if (this.on) this.exit(); else this.enter(); }
  enter() {
    const G = this.game; if (!G.running || G.cutscene || G.ui.blockingUI || this.on) return;
    if (!['foot', 'vehicle', 'swim', 'sit'].includes(G.player.state)) return;
    this.on = true; G.photoMode = true; this.yaw = G.cam.yaw; this.pitch = G.cam.pitch; this.dist = 4.2; this.h = 0; this.fov0 = G.camera.fov; this.fov = G.camera.fov; this.fp = false; this.hide = false;
    G.ui.showHUD(false); G.ui.prompt();
    const ar = isAR(), el = document.createElement('div'); el.id = 'photoUI';
    el.innerHTML = `<div class="ph-top">📷 ${T('Photo mode')}</div><div class="ph-help"></div><div class="ph-bar"><button class="btn" data-z="-">−</button><button class="btn" data-z="+">+</button><button class="btn" data-fp></button><button class="btn" data-hide></button><button class="btn primary" data-cap>${T('Capture')}</button><button class="btn" data-x>${T('Exit')}</button></div>`;
    el.querySelector('.ph-help').textContent = T('Mouse / drag: aim · W/S: distance · Q/E: height · wheel or −/+: zoom · Enter/Space/click: capture · O or Esc: exit');
    const upd = () => { el.querySelector('[data-fp]').textContent = this.fp ? T('Third person') : T('First person'); el.querySelector('[data-hide]').textContent = this.hide ? T('Show character') : T('Hide character'); };
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); if (b.dataset.z) this.fov = clamp(this.fov + (b.dataset.z === '+' ? -6 : 6), 14, 95); if (b.hasAttribute('data-fp')) this.fp = !this.fp; if (b.hasAttribute('data-hide')) this.hide = !this.hide; if (b.hasAttribute('data-cap')) this.capture(); if (b.hasAttribute('data-x')) this.exit(); upd(); });
    upd(); document.body.appendChild(el); this.el = el; void ar;
  }
  exit() {
    const G = this.game; if (!this.on) return; this.on = false; G.photoMode = false; G.camera.fov = this.fov0; G.camera.updateProjectionMatrix(); G.player.object.visible = true;
    G.ui.showHUD(true); if (this.el) this.el.remove(); this.el = null;
  }
  update(dt) {
    const G = this.game, I = G.input, cam = G.camera, P = G.player; if (!this.on) return;
    const lk = I.takeLook(); this.yaw -= lk.x; this.pitch = clamp(this.pitch + lk.y, -1.3, 1.35);
    const m = I.move(); this.dist = clamp(this.dist - m.y * dt * 4, 0.7, 16);
    if (I.keys.has('KeyQ')) this.h = clamp(this.h - dt * 2, -1.2, 6); if (I.keys.has('KeyE')) this.h = clamp(this.h + dt * 2, -1.2, 6);
    if (I.keys.has('Minus') || I.keys.has('NumpadSubtract')) this.fov = clamp(this.fov + dt * 30, 14, 95); if (I.keys.has('Equal') || I.keys.has('NumpadAdd')) this.fov = clamp(this.fov - dt * 30, 14, 95);
    if (I.wheel) { this.fov = clamp(this.fov + I.wheel * 3, 14, 95); I.wheel = 0; }
    const focus = P.state === 'vehicle' && P.vehicle ? P.vehicle.pos : P.pos;
    const piv = new THREE.Vector3(focus.x, focus.y + 1.3 + this.h, focus.z), cy = Math.cos(this.pitch), dir = new THREE.Vector3(Math.sin(this.yaw) * cy, Math.sin(this.pitch), Math.cos(this.yaw) * cy);
    if (this.fp) { const h = P.state === 'foot' && P.h.bones.head ? P.h.bones.head.getWorldPosition(new THREE.Vector3()) : piv; cam.position.copy(h); cam.lookAt(h.x - dir.x, h.y - dir.y, h.z - dir.z); }
    else { cam.position.copy(piv).addScaledVector(dir, this.dist); cam.lookAt(piv); }
    P.object.visible = !this.hide && !(this.fp && P.state === 'foot');
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
  capture() {
    const G = this.game; if (this.el) this.el.style.visibility = 'hidden';
    try {
      G.renderNow(); const src = G.renderer.domElement, c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * src.height / src.width);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); const url = c.toDataURL('image/jpeg', 0.82);
      G.phone.photos.unshift({ src: url, t: (isAR() ? 'اليوم ' : 'Day ') + G.env.day + ' ' + fmtTime(G.env.hour) }); if (G.phone.photos.length > 24) G.phone.photos.pop();
      G.audio.ui('shutter'); G.ui.flash(); G.ui.toast(T('Photo saved'), T('View it in Photos.'), 'good', 2);
      const d = new THREE.Vector3(); G.camera.getWorldDirection(d); bus.emit('photoTaken', { cam: G.camera.position.clone(), dir: d, mode: 'photo' });
    } catch (e) { G.ui.toast(T('Camera unavailable'), T('This browser blocked reading the frame.'), 'warn'); }
    if (this.el) this.el.style.visibility = '';
  }
}
