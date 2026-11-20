// Lightweight pooled particles: smoke, dust, splash, blood specks (respecting violence setting), exhale.
import { R, makeCanvas } from '../core/util.js';

export class FX {
  constructor(game) {
    this.game = game; const c = makeCanvas(64, 64), g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); this.tex = new THREE.CanvasTexture(c);
    this.pool = []; this.live = [];
    for (let i = 0; i < 140; i++) { const m = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 }); const s = new THREE.Sprite(m); s.visible = false; game.scene.add(s); this.pool.push(s); }
  }
  emit(x, y, z, o) {
    const s = this.pool.pop(); if (!s) return; s.visible = true; s.position.set(x, y, z);
    s.material.color.set(o.color || 0xffffff); s.material.opacity = o.alpha ?? 0.6; s.scale.setScalar(o.size || 0.5);
    s.userData = { vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1.5, t: 0, grow: o.grow ?? 1.2, a0: o.alpha ?? 0.6, g: o.g || 0, size: o.size || 0.5 };
    this.live.push(s);
  }
  smoke(p, y, k = 1) { this.emit(p.x + (R() - 0.5) * 0.4, y, p.z + (R() - 0.5) * 0.4, { color: k > 0.8 ? 0x2a2a2a : 0x8a8a8a, alpha: 0.45, size: 0.6, vy: 1.2 + R(), vx: (R() - 0.5) * 0.4, life: 2.5, grow: 2.2 }); }
  smokePuff(p) { for (let i = 0; i < 3; i++) this.emit(p.x, p.y + 0.05, p.z, { color: 0xdddddd, alpha: 0.18, size: 0.12, vy: 0.25, vx: (R() - 0.5) * 0.2, vz: (R() - 0.5) * 0.2, life: 1.8, grow: 3 }); }
  dust(p, n = 6) { for (let i = 0; i < n; i++) this.emit(p.x, p.y + 0.1, p.z, { color: 0xcbb994, alpha: 0.35, size: 0.4, vx: (R() - 0.5) * 2, vz: (R() - 0.5) * 2, vy: 0.4, life: 1.2, grow: 2 }); }
  splash(p, n = 10) { for (let i = 0; i < n; i++) this.emit(p.x, p.y, p.z, { color: 0xe6f6ff, alpha: 0.7, size: 0.18, vx: (R() - 0.5) * 3, vz: (R() - 0.5) * 3, vy: 2 + R() * 3, g: -9, life: 0.9, grow: 1 }); }
  blood(p, head) { const o = head || new THREE.Vector3(p.x, p.y + 1.5, p.z); for (let i = 0; i < 4; i++) this.emit(o.x, o.y, o.z, { color: 0x7a0b0b, alpha: 0.8, size: 0.05, vx: (R() - 0.5) * 2, vz: (R() - 0.5) * 2, vy: R() * 1.5, g: -9.8, life: 0.6, grow: 1 }); }
  flash(p) { this.emit(p.x, p.y, p.z, { color: 0xffffff, alpha: 1, size: 3, life: 0.15, grow: 1 }); }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i], u = s.userData; u.t += dt;
      if (u.t >= u.life) { s.visible = false; s.material.opacity = 0; this.live.splice(i, 1); this.pool.push(s); continue; }
      u.vy += u.g * dt; s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const k = u.t / u.life; s.material.opacity = u.a0 * (1 - k); s.scale.setScalar(u.size * (1 + (u.grow - 1) * k));
    }
  }
}
