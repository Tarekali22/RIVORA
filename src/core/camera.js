// Third-person orbit camera with collision, vehicle chase / cockpit modes and scripted cinematic shots.
import { clamp, damp, dampAngle, lerp, wrapAngle, angleDiff } from './util.js';

export class CameraRig {
  constructor(camera, game) {
    this.cam = camera; this.game = game;
    this.yaw = 0; this.pitch = 0.22; this.dist = 4.2; this.curDist = 4.2;
    this.target = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.mode = 'follow'; this.firstPerson = false; this.shake = 0; this.fov = 62; this.autoT = 0;
    this.cine = null;
  }
  addShake(v) { if (!this.game.settings.reduceShake) this.shake = Math.min(1, this.shake + v); }
  // scripted shot: list of {pos:[x,y,z], look:[x,y,z], t:seconds}
  play(shots, onDone) { this.cine = { shots, i: 0, t: 0, onDone }; }
  stopCine() { if (this.cine) { const d = this.cine.onDone; this.cine = null; if (d) d(); } }
  update(dt, input) {
    const G = this.game, P = G.player, cam = this.cam;
    if (this.cine) {
      const c = this.cine, s = c.shots[c.i], nx = c.shots[Math.min(c.i + 1, c.shots.length - 1)];
      c.t += dt; const k = clamp(c.t / s.t, 0, 1), e = k * k * (3 - 2 * k);
      const lp = (a, b) => new THREE.Vector3(lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e));
      cam.position.copy(lp(s.pos, s.pos2 || nx.pos)); cam.lookAt(lp(s.look, s.look2 || nx.look));
      if (c.t >= s.t) { c.i++; c.t = 0; if (c.i >= c.shots.length - (c.shots[c.shots.length - 1].hold ? 0 : 1)) this.stopCine(); }
      this._fov(dt, 55); return;
    }
    const lk = input.takeLook();
    this.yaw = wrapAngle(this.yaw - lk.x); this.pitch = clamp(this.pitch + lk.y, -0.75, 1.25);
    if (input.wheel) { this.dist = clamp(this.dist + input.wheel * 0.5, 2.2, 9); input.wheel = 0; }
    if (input.pressed('camera')) { this.firstPerson = !this.firstPerson; }
    const v = P.state === 'vehicle' ? P.vehicle : null;
    let tx, ty, tz, dist, height = 0, fovT = 62;
    if (v) {
      const sp = v.speed || 0;
      tx = v.pos.x; ty = v.pos.y + v.camH; tz = v.pos.z; dist = v.camDist + Math.min(sp, 40) * 0.05;
      // auto-align behind the vehicle after mouse idle
      if (Math.abs(lk.x) + Math.abs(lk.y) > 0.0005) this.autoT = 1.6; else this.autoT -= dt;
      if (this.autoT <= 0 && (Math.abs(sp) > 2 || v.air)) { const behind = (v.reverse ? v.heading : v.heading + Math.PI); this.yaw = dampAngle(this.yaw, behind, 2.5, dt); this.pitch = damp(this.pitch, v.air ? 0.15 : 0.18, 2, dt); }
      fovT = 62 + clamp(sp - 10, 0, 40) * 0.35;
      if (this.firstPerson && v.cockpit) {
        const c = v.cockpit, h = v.heading, cs = Math.cos(h), sn = Math.sin(h);
        const wx = v.pos.x + c[0] * cs + c[2] * sn, wz = v.pos.z - c[0] * sn + c[2] * cs;
        cam.position.set(wx, v.pos.y + c[1], wz);
        const lookYaw = this.yaw + Math.PI;
        cam.lookAt(wx + Math.sin(lookYaw) * 10, v.pos.y + c[1] - 0.3 + (v.pitchAng ? Math.sin(v.pitchAng) * 10 : 0) - Math.sin(this.pitch - 0.18) * 10, wz + Math.cos(lookYaw) * 10);
        if (v.roll) cam.rotateZ(-v.roll * 0.6);
        this._fov(dt, fovT); return;
      }
    } else {
      tx = P.pos.x; tz = P.pos.z;
      const st = P.state;
      ty = P.pos.y + (st === 'swim' ? 0.5 : st === 'down' ? 0.5 : P.crouch ? 1.2 : 1.55);
      dist = this.dist; if (st === 'freefall') { dist = 7; fovT = 75; } if (st === 'parachute') { dist = 9; height = 2.5; } if (G.interior) dist = Math.min(dist, 3.4);
      if (st === 'activity' && P.activity && P.activity.cam) dist = P.activity.cam;
      if (P.action || P.blocking) dist = Math.min(dist, 3.6);
      if (this.firstPerson && st === 'foot') { const h = P.h.bones.head.getWorldPosition(new THREE.Vector3()); cam.position.copy(h).add(new THREE.Vector3(Math.sin(P.heading) * 0.12, 0.08, Math.cos(P.heading) * 0.12)); const fw = this.yaw + Math.PI; cam.lookAt(cam.position.x + Math.sin(fw) * 5, cam.position.y - Math.sin(this.pitch) * 5, cam.position.z + Math.cos(fw) * 5); P.heading = dampAngle(P.heading, fw, 10, dt); this._fov(dt, 70); return; }
    }
    // smooth target
    const k = 1 - Math.exp(-dt * (v ? 14 : 18));
    this.target.x = lerp(this.target.x, tx, k); this.target.y = lerp(this.target.y, ty + height, 1 - Math.exp(-dt * 10)); this.target.z = lerp(this.target.z, tz, k);
    if (this.target.distanceToSquared(new THREE.Vector3(tx, ty, tz)) > 400) this.target.set(tx, ty + height, tz);
    // shoulder offset (to the right of view)
    const sh = v ? 0 : 0.32;
    const cy = Math.cos(this.pitch), sy = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cy, dz = Math.cos(this.yaw) * cy;
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const ox = this.target.x - rx * sh, oz = this.target.z - rz * sh, oy = this.target.y;
    // collision: pull in when blocked
    const want = dist;
    const free = G.city.segmentClear(ox, oy, oz, ox + dx * want, oy + sy * want, oz + dz * want, 0.7);
    const allowed = Math.max(0.6, want * free - 0.35);
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 3, dt);
    let px = ox + dx * this.curDist, py = oy + sy * this.curDist, pz = oz + dz * this.curDist;
    const gy = G.city.surfaceHeight(px, pz, py + 0.5) + 0.35; if (py < gy) py = gy;
    const wl = G.ocean ? G.ocean.height(px, pz) + 0.3 : -99; if (py < wl && P.state !== 'swim') py = wl;
    if (this.shake > 0) { const s = this.shake * 0.12; px += (Math.random() - 0.5) * s; py += (Math.random() - 0.5) * s; pz += (Math.random() - 0.5) * s; this.shake = Math.max(0, this.shake - dt * 2.5); }
    cam.position.set(px, py, pz);
    cam.lookAt(ox, oy + (v ? 0 : 0.05), oz);
    this._fov(dt, fovT);
  }
  _fov(dt, t) { this.fov = damp(this.fov, t, 3, dt); if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); } }
  snapBehind() { const P = this.game.player; const h = P.state === 'vehicle' ? P.vehicle.heading : P.heading; this.yaw = h + Math.PI; this.pitch = 0.2; this.target.set(P.pos.x, P.pos.y + 1.5, P.pos.z); this.curDist = this.dist; }
}
