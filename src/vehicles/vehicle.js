// Vehicle physics for cars, bikes, boats, helicopters and planes, plus ownership/enter/exit management.
import { VEHICLES } from '../data/vehicles.js';
import { buildVehicleModel, sharedMats } from './models.js';
import { clamp, lerp, damp, dampAngle, wrapAngle, angleDiff, R, bus, dist2 } from '../core/util.js';
import { WATER_Y, terrainHeight } from '../world/layout.js';

const GRAV = -20;
let VID = 1;
export class Vehicle {
  constructor(game, key, color, o = {}) {
    this.game = game; this.key = key; this.spec = VEHICLES[key]; this.type = this.spec.type; this.id = VID++;
    this.color = color || this.spec.colors[Math.floor(R() * this.spec.colors.length)];
    const m = buildVehicleModel(this.spec, this.color); this.m = m;
    this.object = m.root; this.body = m.body; game.scene.add(this.object);
    this.pos = this.object.position; this.heading = 0; this.vel = new THREE.Vector3(); this.yawRate = 0; this.speed = 0;
    this.steer = 0; this.steerVis = 0; this.throttle = 0; this.health = 100; this.disabled = false; this.air = false; this.vy = 0;
    this.pitchAng = 0; this.rollAng = 0; this.bodyPitch = 0; this.bodyRoll = 0; this.lean = 0;
    this.owner = o.owner || 'traffic'; this.locked = false; this.alarm = 0; this.driver = null; this.kinematic = false;
    this.battery = this.spec.electric ? 80 + R() * 20 : null; this.lightsOn = false; this.brake = false; this.siren = false;
    this.doorOpen = 0; this.doorTarget = 0; this.enterT = 0; this.wheelSpin = 0; this.rpm = 0; this.rotor = 0; this.throttleP = 0;
    const d = m.dims; this.L = d.L; this.W = this.type === 'plane' ? 2 : d.W; this.H = d.H; this.radius = Math.max(d.L, this.W) / 2 + 0.4;
    this.mass = this.spec.mass || 1500; this.camDist = this.type === 'heli' ? 14 : this.type === 'plane' ? 16 : this.type === 'bike' ? 4.6 : Math.max(5.5, d.L * 1.25); this.camH = m.camH;
    this.seatPose = this.type === 'bike' ? (this.spec.pedal ? 'pedal' : 'ride') : this.type === 'boat' && this.spec.body === 'jetski' ? 'ride' : this.type === 'heli' || this.type === 'plane' ? 'pilot' : 'drive';
    this.cockpit = this.type === 'bike' ? null : [m.seat[0], m.seat[1] + 1.25 * (this.type === 'heli' ? 0.95 : 1), m.seat[2] + 0.1];
    this.object.rotation.order = 'YXZ';
  }
  get fx() { return Math.sin(this.heading); } get fz() { return Math.cos(this.heading); }
  place(x, z, heading, y) { this.heading = heading; this.pos.set(x, y ?? this.groundAt(x, z), z); this.vel.set(0, 0, 0); this.yawRate = 0; this.air = false; this.vy = 0; this.syncObject(); }
  groundAt(x, z) {
    if (this.type === 'boat') return this.game.ocean.height(x, z) - 0.15;
    return this.game.city.surfaceHeight(x, z, (this.pos ? this.pos.y : 0) + 0.7, 0.7);
  }
  local(lx, lz) { const c = Math.cos(this.heading), s = Math.sin(this.heading); return { x: this.pos.x + lx * c + lz * s, z: this.pos.z - lx * s + lz * c }; }
  doorWorld(side = 1) { return this.local(side * (this.W / 2 + 0.75), this.m.door ? this.m.door.position.z - 0.5 : 0); }
  // ---------------- driving ----------------
  controlsFromInput(input) {
    const m = input.move(); const gp = input.gp;
    let thr = m.y; if (gp.rt > 0.05 || gp.lt > 0.05) thr = gp.rt - gp.lt;
    return { throttle: thr, steer: -m.x, handbrake: input.down('jump'), up: input.down('jump') ? 1 : 0, down: input.down('crouch') ? 1 : 0, boost: input.down('sprint') ? 1 : 0, yaw: -m.x, pitch: m.y };
  }
  update(dt, ctrl) {
    if (this.kinematic) return;
    const c = this.disabled ? { throttle: 0, steer: 0, handbrake: true } : (ctrl || { throttle: 0, steer: 0, handbrake: !this.driver });
    if (this.type === 'heli') this._heli(dt, c);
    else if (this.type === 'plane') this._plane(dt, c);
    else if (this.type === 'boat') this._boat(dt, c);
    else this._car(dt, c);
    this.syncObject();
  }
  _car(dt, c) {
    const G = this.game, s = this.spec;
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vF = this.vel.x * fx + this.vel.z * fz, vR = this.vel.x * rx + this.vel.z * rz;
    const wet = G.env.wet > 0.3 ? 0.82 : 1;
    const off = this._offroad(); const grip = s.grip * wet * (off && !s.offroad ? 0.75 : 1);
    const t = clamp(c.throttle, -1, 1);
    let a = 0; this.brake = false;
    const evOk = !s.electric || this.battery > 0;
    const power = s.power * (evOk ? 1 : 0.15) * (this.health < 25 ? 0.5 : 1);
    if (t > 0.02) { if (vF < -0.6) { a = 9 * t; this.brake = true; } else a = power * t * (1 - Math.pow(clamp(vF / s.top, 0, 1), 2)); }
    else if (t < -0.02) { if (vF > 0.6) { a = -10 * -t; this.brake = true; } else a = power * 0.55 * t * (1 - Math.pow(clamp(-vF / (s.top * 0.3), 0, 1), 2)); }
    else { a = -Math.sign(vF) * Math.min(Math.abs(vF) / dt, 0.6 + Math.abs(vF) * 0.02); }
    if (c.handbrake && this.type !== 'bike') { a -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 5); this.brake = true; }
    if (off && !s.offroad) a -= vF * 0.25;
    vF += a * dt;
    if (Math.abs(vF) < 0.05 && Math.abs(t) < 0.02) vF = 0;
    // steering
    this.steer = damp(this.steer, clamp(c.steer, -1, 1), 7, dt);
    const maxS = s.steer / (1 + Math.abs(vF) * 0.05);
    const yawT = vF * Math.tan(this.steer * maxS) / this.m.wheelBase;
    const hb = c.handbrake && Math.abs(vF) > 7 && this.type !== 'bike';
    this.yawRate = damp(this.yawRate, yawT * (hb ? 1.35 : 1), (hb ? 3 : 9) * grip, dt);
    vR *= Math.exp(-dt * (hb ? 1.4 : 9 * grip) * (this.type === 'bike' ? 1.5 : 1));
    this.slip = Math.abs(vR) > 2.5 ? clamp((Math.abs(vR) - 2.5) / 6, 0, 1) : hb ? 0.5 : 0;
    if (this.air) { this.yawRate *= 0.98; }
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.x = nfx * vF + -nfz * vR; this.vel.z = nfz * vF + nfx * vR;
    this.speed = vF; this.throttle = t;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this._collideStatic(ox, oz);
    this._vertical(dt);
    // weight transfer visuals
    const latA = vF * this.yawRate;
    this.bodyRoll = damp(this.bodyRoll, clamp(latA * 0.012, -0.08, 0.08), 6, dt);
    this.bodyPitch = damp(this.bodyPitch, clamp(-a * 0.006, -0.05, 0.05), 6, dt);
    if (this.type === 'bike') { this.lean = damp(this.lean, clamp(this.steer * Math.min(1, Math.abs(vF) / 12) * 0.55, -0.6, 0.6), 5, dt); this.bodyRoll = -this.lean; this.cadence = Math.abs(vF) * 1.6; }
    // EV battery
    if (s.electric && this.driver) { this.battery = clamp(this.battery - Math.max(0, t) * Math.abs(vF) * 0.0009 * dt * 60 + (this.brake ? Math.abs(vF) * 0.00025 * dt * 60 : 0), 0, 100); }
    // water: cars sink
    const wl = G.ocean.height(this.pos.x, this.pos.z);
    if (this.pos.y < wl - 0.8 && !this.sunk) { this.sunk = true; this.disabled = true; this.health = 0; G.audio.splash(this.pos, 1); bus.emit('vehicleSunk', this); }
  }
  _offroad() { const x = this.pos.x, z = this.pos.z; if (x > 506 && x < 640 && z > -600) return true; return x < -540 && Math.abs(z + 40) > 8 && this.pos.y > 1 || z > 800; }
  _vertical(dt) {
    const G = this.game, fx = this.fx, fz = this.fz, hb = this.m.wheelBase / 2, tr = (this.m.track || 1.6) / 2;
    const yq = this.pos.y + 0.7;
    const sh = (x, z) => G.city.surfaceHeight(x, z, yq, 0.7);
    const yF = sh(this.pos.x + fx * hb, this.pos.z + fz * hb), yB = sh(this.pos.x - fx * hb, this.pos.z - fz * hb);
    const yL = sh(this.pos.x - fz * tr, this.pos.z + fx * tr), yR = sh(this.pos.x + fz * tr, this.pos.z - fx * tr);
    const target = Math.max((yF + yB) / 2, (yL + yR) / 2 - 0.05);
    if (this.air) {
      this.vy += GRAV * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= target) { const imp = -this.vy; this.pos.y = target; this.air = false; if (imp > 7) { this.hurt((imp - 7) * 3, imp); } this.vy = 0; }
    } else {
      if (target < this.pos.y - 0.45 && Math.abs(this.speed) > 4) { this.air = true; this.vy = 0; }
      else { const py = this.pos.y; this.pos.y = target > py ? damp(py, target, 30, dt) : damp(py, target, 16, dt); this.vy = (this.pos.y - py) / Math.max(dt, 1e-3); }
    }
    this.pitchAng = damp(this.pitchAng, Math.atan2(yF - yB, hb * 2), 10, dt);
    this.rollAng = damp(this.rollAng, this.type === 'bike' ? 0 : Math.atan2(yR - yL, tr * 2), 10, dt);
  }
  _collideStatic(ox, oz) {
    const G = this.game, n = this.type === 'bike' ? 1 : Math.max(2, Math.round(this.L / this.W)), r = this.type === 'bike' ? 0.45 : this.W * 0.5;
    let pushX = 0, pushZ = 0;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -this.L / 2 + r + (this.L - 2 * r) * i / (n - 1);
      const cx = this.pos.x + this.fx * off, cz = this.pos.z + this.fz * off, p = { x: cx, z: cz };
      if (G.city.collideCircle(p, r, this.pos.y + 0.3, this.H)) { pushX += p.x - cx; pushZ += p.z - cz; this.pos.x += p.x - cx; this.pos.z += p.z - cz; }
    }
    const pl = Math.hypot(pushX, pushZ);
    if (pl > 1e-4) this._impact(pushX / pl, pushZ / pl, 0.15, null);
  }
  _impact(nx, nz, rest, other) {
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn >= 0) return 0;
    this.vel.x -= (1 + rest) * vn * nx; this.vel.z -= (1 + rest) * vn * nz;
    this.vel.x *= 0.92; this.vel.z *= 0.92; this.yawRate *= 0.6;
    const imp = -vn; if (imp > 3.5) this.hurt((imp - 3.5) * (other ? 2.2 : 2.8), imp);
    return imp;
  }
  hurt(dmg, imp = 5) {
    const G = this.game; if (this.type === 'bike' && imp > 9 && this.driver === 'player') { G.vehicles.eject(this, true); }
    this.health = Math.max(0, this.health - dmg);
    if (imp > 3.5) { G.audio.impact(this.pos, clamp(imp / 20, 0.1, 1)); if (this.driver === 'player') { G.cam.addShake(clamp(imp / 18, 0.1, 0.8)); if (G.player.state === 'vehicle') G.player.damage(Math.max(0, imp - 14) * 1.5, null, { fall: true }); } }
    if (this.health <= 0 && !this.disabled) { this.disabled = true; bus.emit('vehicleWrecked', this); }
    if (this.owner === 'parked' && imp > 2) this.triggerAlarm();
    bus.emit('vehicleHit', this, imp);
  }
  triggerAlarm() { if (this.alarm <= 0 && this.owner !== 'player') { this.alarm = 18; } }
  _boat(dt, c) {
    const G = this.game, s = this.spec;
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vF = this.vel.x * fx + this.vel.z * fz, vR = this.vel.x * rx + this.vel.z * rz;
    const t = clamp(c.throttle, -1, 1);
    const ground = terrainHeight(this.pos.x, this.pos.z); const wl = G.ocean.height(this.pos.x, this.pos.z);
    const beached = ground > wl - 0.5 || G.city.surfaceHeight(this.pos.x, this.pos.z, wl, 0.2) > wl - 0.3 && ground > wl - 1.2;
    let a = t > 0 ? s.power * t * (1 - Math.pow(clamp(vF / s.top, 0, 1), 2)) : s.power * 0.4 * t;
    a -= vF * 0.08; if (beached) a -= vF * 3;
    vF += a * dt;
    this.steer = damp(this.steer, c.steer, 4, dt);
    const yawT = this.steer * s.steer * clamp(Math.abs(vF) / 6, 0, 1.2) * Math.sign(vF || 1) * 1.2;
    this.yawRate = damp(this.yawRate, yawT, 2.5, dt);
    vR *= Math.exp(-dt * 1.6);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.x = nfx * vF - nfz * vR; this.vel.z = nfz * vF + nfx * vR; this.speed = vF; this.throttle = t;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this._collideStatic(ox, oz);
    const wy = G.ocean.height(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, Math.max(wy - 0.25, ground), 6, dt);
    const plane = clamp(Math.abs(vF) / s.top, 0, 1);
    this.pitchAng = damp(this.pitchAng, plane * 0.12 + (G.ocean.height(this.pos.x + fx * 2, this.pos.z + fz * 2) - G.ocean.height(this.pos.x - fx * 2, this.pos.z - fz * 2)) * 0.15, 3, dt);
    this.rollAng = damp(this.rollAng, -this.yawRate * 0.25 * plane * 2, 3, dt);
    if (Math.abs(vF) > 6 && R() < dt * 4) { const q = this.local(0, -this.L / 2); G.audio.splash(new THREE.Vector3(q.x, this.pos.y, q.z), 0.15); }
  }
  _heli(dt, c) {
    const G = this.game, s = this.spec;
    const on = !!this.driver && !this.disabled;
    this.rotor = damp(this.rotor, on ? 1 : 0, on ? 0.8 : 0.35, dt);
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.5);
    const wl = G.ocean.height(this.pos.x, this.pos.z);
    const lift = this.rotor > 0.85;
    const vyT = lift ? (c.up - c.down) * 8 : -3;
    this.vel.y = damp(this.vel.y, vyT, 1.6, dt);
    const fwdIn = clamp(c.pitch, -1, 1);
    this.tiltF = damp(this.tiltF || 0, lift ? fwdIn : 0, 2, dt);
    const fx = this.fx, fz = this.fz;
    const accel = this.tiltF * 15;
    this.vel.x += fx * accel * dt; this.vel.z += fz * accel * dt;
    const drag = Math.exp(-dt * 0.55); this.vel.x *= drag; this.vel.z *= drag;
    const hs = Math.hypot(this.vel.x, this.vel.z); if (hs > s.top) { this.vel.x *= s.top / hs; this.vel.z *= s.top / hs; }
    this.yawRate = damp(this.yawRate, lift ? c.yaw * 1.3 : 0, 3, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.min(this.pos.y, 650);
    if (this.pos.y <= Math.max(ground, wl - 0.2)) {
      if (this.vel.y < -7) this.hurt((-this.vel.y - 7) * 8, -this.vel.y);
      this.pos.y = Math.max(ground, wl - 0.2); this.vel.y = Math.max(0, this.vel.y);
      const f = Math.exp(-dt * 4); this.vel.x *= f; this.vel.z *= f; this.landed = true;
    } else this.landed = false;
    // rotor-disc collision with buildings
    const p = { x: this.pos.x, z: this.pos.z };
    if (G.city.collideCircle(p, 4.5, this.pos.y + 1, 3)) { const nx = p.x - this.pos.x, nz = p.z - this.pos.z, l = Math.hypot(nx, nz) || 1; this.pos.x = p.x; this.pos.z = p.z; const imp = this._impact(nx / l, nz / l, 0.3, null); }
    this.speed = Math.hypot(this.vel.x, this.vel.z) * Math.sign(this.vel.x * fx + this.vel.z * fz || 1);
    this.pitchAng = damp(this.pitchAng, -this.tiltF * 0.22 - (this.vel.x * fx + this.vel.z * fz) * 0.004, 3, dt);
    this.rollAng = damp(this.rollAng, -this.yawRate * 0.18, 3, dt);
    this.rpm = this.rotor;
  }
  _plane(dt, c) {
    const G = this.game, s = this.spec;
    const on = !!this.driver && !this.disabled;
    this.throttleP = clamp(this.throttleP + ((c.boost || c.up ? 1 : 0) - (c.down ? 1 : 0)) * dt * 0.5, 0, on ? 1 : 0);
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.6);
    const onGround = this.pos.y <= ground + 0.05;
    let sp = this.speed;
    const stall = 27;
    if (onGround) {
      sp += (this.throttleP * s.power - sp * Math.abs(sp) * 0.0015 - (sp > 0 ? 0.4 : 0)) * dt;
      if (c.throttle < -0.3) sp = Math.max(0, sp - 8 * dt);
      sp = Math.max(0, sp);
      this.yawRate = damp(this.yawRate, c.yaw * clamp(sp / 8, 0, 1) * 0.6 / (1 + sp * 0.05), 4, dt);
      this.heading = wrapAngle(this.heading + this.yawRate * dt);
      this.bank = damp(this.bank || 0, 0, 4, dt);
      this.pitchAng = damp(this.pitchAng, sp > 30 && c.pitch < -0.2 ? 0.18 : 0, 2, dt);
      this.vel.set(this.fx * sp, 0, this.fz * sp);
      if (this.pitchAng > 0.1 && sp > 30) { this.vel.y = sp * Math.sin(this.pitchAng); this.pos.y += 0.2; }
      else this.pos.y = ground;
    } else {
      this.pitchAng = clamp(this.pitchAng - c.pitch * 0.7 * dt, -0.6, 0.55);
      this.bank = damp(this.bank || 0, -c.yaw * 0.75, 1.8, dt);
      const g = 9.8;
      this.yawRate = -g * Math.tan(this.bank) / Math.max(sp, 20);
      this.heading = wrapAngle(this.heading + this.yawRate * dt);
      sp += (this.throttleP * s.power - sp * sp * 0.0011 - g * Math.sin(this.pitchAng)) * dt;
      sp = clamp(sp, 0, s.top);
      if (sp < stall) this.pitchAng = damp(this.pitchAng, -0.35, 0.8, dt);
      const cp = Math.cos(this.pitchAng);
      this.vel.set(this.fx * sp * cp, sp * Math.sin(this.pitchAng) - Math.max(0, stall - sp) * 0.5, this.fz * sp * cp);
      this.pos.addScaledVector(this.vel, dt);
      const ng = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.6), wl = G.ocean.height(this.pos.x, this.pos.z);
      if (this.pos.y <= Math.max(ng, wl)) {
        const vy = -this.vel.y;
        if (this.pos.y < wl) { this.hurt(100, 30); this.pos.y = wl - 0.5; sp = 0; }
        else if (vy < 4.5 && Math.abs(this.bank) < 0.35 && this.pitchAng > -0.2) { this.pos.y = ng; bus.emit('planeLanded', this); }
        else { this.hurt(40 + vy * 6, vy + sp * 0.2); this.pos.y = ng; sp *= 0.3; }
        this.pitchAng = 0;
      }
    }
    const p = { x: this.pos.x, z: this.pos.z };
    if (G.city.collideCircle(p, 3, this.pos.y + 1.5, 2.5)) { this.pos.x = p.x; this.pos.z = p.z; this.hurt(sp * 2, sp); sp *= 0.2; }
    this.speed = sp; this.rollAng = this.bank || 0; this.rpm = this.throttleP;
    this.alt = this.pos.y - Math.max(ground, WATER_Y);
  }
  syncObject() {
    this.object.position.copy(this.pos);
    this.object.rotation.set(-this.pitchAng, this.heading, this.rollAng, 'YXZ');
    this.body.rotation.set(this.bodyPitch, 0, this.bodyRoll);
  }
  // per-frame visuals: wheels, lights, door, rotors, sirens
  visuals(dt, env) {
    const m = this.m;
    this.wheelSpin += (this.speed || 0) * dt / (m.wheels[0] ? m.wheels[0].r : 0.3);
    this.steerVis = damp(this.steerVis, this.steer, 10, dt);
    for (const w of m.wheels) { w.m.rotation.x = this.wheelSpin; if (w.front) w.piv.rotation.y = this.steerVis * (this.spec.steer || 0.5) * 0.8; }
    const S = sharedMats();
    const night = env.night > 0.4 || env.w.fog > 0.5 || env.w.rain > 0.5;
    this.lightsOn = this.driver ? (this.manualLights ?? night) : night && this.owner !== 'parked';
    if (m.lightsF) m.lightsF.material = this.lightsOn ? S.headOn : S.headOff;
    if (m.lightsR) m.lightsR.material = (this.brake || this.speed < -0.5) && this.driver ? S.rearOn : this.lightsOn ? S.rearOn : S.rearOff;
    if (this.alarm > 0) { this.alarm -= dt; const on = Math.floor(this.alarm * 3) % 2 === 0; if (m.lightsF) m.lightsF.material = on ? S.headOn : S.headOff; if (on && Math.floor(this.alarm * 3) !== this._lastBeep) { this._lastBeep = Math.floor(this.alarm * 3); this.game.audio.horn(this.pos); } }
    if (m.door) { this.doorOpen = damp(this.doorOpen, this.doorTarget, 9, dt); m.door.rotation.y = -this.doorOpen * 1.05; }
    if (this.enterT > 0) this.enterT = Math.max(0, this.enterT - dt);
    if (m.extras.rotor) { this._rot = (this._rot || 0) + this.rotor * 28 * dt; m.extras.rotor.rotation.y = this._rot; m.extras.tail.rotation.x = this._rot * 1.7; }
    if (m.extras.prop) { this._rot = (this._rot || 0) + (0.3 + this.throttleP * 2) * 40 * dt * (this.driver ? 1 : 0); m.extras.prop.rotation.z = this._rot; }
    if (m.extras.driverDummy) m.extras.driverDummy.visible = !!(this.traffic && this.traffic.driverNpc) || (this.ai && this.owner === 'mission') || (this.owner === 'police' && !!this.ai);
    if (m.extras.lightbar) { const t = this.game.time, on = this.siren; const ph = Math.floor(t * 6) % 2; m.extras.lightbar[0].material = on && ph ? S.red : S.dim; m.extras.lightbar[1].material = on && !ph ? S.blue : S.dim; }
    if (this.health < 30 && this.game.fx && R() < dt * (this.disabled ? 10 : 4)) this.game.fx.smoke(this.local(0, this.L / 2 - 0.6), this.pos.y + this.H * 0.7, this.disabled ? 1 : 0.5);
  }
  setColor(c) { this.color = c; this.m.paint.color.set(c); }
  dispose() { this.game.scene.remove(this.object); this.object.traverse((o) => { if (o.isMesh && o.material === this.m.paint) { } }); this.m.paint.dispose(); }
  serialize() { return { key: this.key, color: this.color, health: this.health, battery: this.battery, pos: [this.pos.x, this.pos.y, this.pos.z], heading: this.heading }; }
}

// ---------------------------------------------------------------------------------------
export class VehicleManager {
  constructor(game) { this.game = game; this.list = []; this.owned = []; this.engineVoice = null; }
  spawn(key, x, z, heading, o = {}) {
    const v = new Vehicle(this.game, key, o.color, o);
    v.place(x, z, heading, o.y);
    this.list.push(v); return v;
  }
  remove(v) { const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1); v.dispose(); if (v.siren) this.game.audio.sirenStop(v.sirenVoice); }
  nearestEnterable(p, maxD = 4) {
    let best = null, bd = 1e9;
    for (const v of this.list) {
      if (v.kinematic && v.traffic && v.traffic.state === 'wreck') continue;
      const reach = v.type === 'heli' ? 6 : v.type === 'plane' ? 6 : v.type === 'boat' ? 4.5 : maxD;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.L / 2; if (Math.abs(v.pos.y - p.y) > 3) continue;
      if (d < reach && d < bd) { bd = d; best = v; }
    }
    return best;
  }
  enter(v) {
    const G = this.game, P = G.player;
    if (v.disabled && v.health <= 0) { G.ui.toast('Vehicle wrecked', 'This one is not going anywhere.', 'warn'); return false; }
    // carjacking / theft
    if (v.traffic && v.traffic.driverNpc) { G.npcs.ejectDriver(v); G.crime('carjack', v.pos, 2); bus.emit('carjack', v); }
    else if (v.owner === 'parked' && !v.stolen) { v.stolen = true; if (R() < 0.5) { v.triggerAlarm(); G.crime('theft', v.pos, 1); } else G.crime('theft', v.pos, 1, true); bus.emit('stole', v); }
    else if (v.owner === 'police') { G.crime('theft', v.pos, 2); }
    if (v.traffic) G.traffic.release(v);
    v.kinematic = false; v.driver = 'player'; P.state = 'vehicle'; P.vehicle = v; P.action = null; P.dropItem();
    v.doorTarget = 1; v.enterT = 0.6; setTimeout(() => { v.doorTarget = 0; G.audio.carDoor(v.pos); }, 650);
    G.audio.carDoor(v.pos);
    if (v.owner === 'parked' || v.owner === 'traffic') v.owner = 'stolen';
    this.engineVoice = G.audio.engine(v.spec.electric ? 'ev' : v.type === 'heli' ? 'rotor' : v.type === 'plane' ? 'prop' : v.type === 'boat' ? 'boat' : 'gas');
    if (v.spec.pedal) { G.audio.engineStop(this.engineVoice); this.engineVoice = null; }
    G.cam.snapBehind(); G.cam.autoT = 0;
    bus.emit('enterVehicle', v);
    G.companion && G.companion.onEnterVehicle(v);
    return true;
  }
  exit(force = false) {
    const G = this.game, P = G.player, v = P.vehicle; if (!v) return;
    if (!force && Math.abs(v.speed) > 6 && v.type !== 'heli' && v.type !== 'plane') { this.eject(v, false); return; }
    let spot = null;
    for (const side of [1, -1]) {
      const d = v.doorWorld(side); const y = G.city.surfaceHeight(d.x, d.z, v.pos.y + 1.5, 2);
      const p = { x: d.x, z: d.z }; const blocked = G.city.collideCircle(p, 0.35, y + 0.1, 1.7);
      if (!blocked) { spot = { x: d.x, z: d.z, y }; break; }
    }
    if (!spot) spot = { x: v.pos.x, z: v.pos.z, y: v.pos.y + v.H + 0.1 };
    if (v.type === 'boat') { const wl = G.ocean.height(spot.x, spot.z); if (spot.y < wl - 1) spot.y = wl - 0.25; }
    v.driver = null; v.doorTarget = 1; setTimeout(() => { v.doorTarget = 0; }, 600); G.audio.carDoor(v.pos);
    P.vehicle = null; P.state = 'foot'; P.teleport(spot.x, spot.y, spot.z, v.heading);
    P.object.rotation.set(0, P.heading, 0);
    const wl = G.ocean.height(spot.x, spot.z); if (G.city.surfaceHeight(spot.x, spot.z, spot.y + 0.5) < wl - 1.3) P.state = 'swim';
    if (v.type === 'heli' || v.type === 'plane') { const alt = v.pos.y - G.city.surfaceHeight(v.pos.x, v.pos.z, v.pos.y); if (alt > 25) { P.state = 'freefall'; P.vel.copy(v.vel); P.teleport(v.pos.x + Math.sin(v.heading + Math.PI / 2) * 3, v.pos.y - 1.5, v.pos.z + Math.cos(v.heading + Math.PI / 2) * 3); bus.emit('jumpedOut', v); } }
    if (this.engineVoice) { G.audio.engineStop(this.engineVoice); this.engineVoice = null; }
    v.throttle = 0; bus.emit('exitVehicle', v);
    G.companion && G.companion.onExitVehicle(v);
  }
  eject(v, crash) {
    const G = this.game, P = G.player; const sp = v.vel.clone();
    this.exit(true); if (P.state === 'freefall' || P.state === 'swim') return; P.vel.copy(sp).multiplyScalar(0.6); P.vel.y = 3; P.grounded = false;
    if (crash) { P.damage(18 + sp.length() * 0.8, null, { knock: true, fall: true }); }
    else { P.damage(8 + sp.length() * 0.5, null, { knock: true, fall: true }); }
  }
  update(dt, input) {
    const G = this.game, P = G.player;
    for (const v of this.list) {
      if (v.kinematic) continue;
      let ctrl = null;
      if (v.driver === 'player' && P.vehicle === v) ctrl = G.ui.blockingUI ? { throttle: 0, steer: 0, handbrake: true } : v.controlsFromInput(input);
      else if (v.ai) ctrl = v.ai(dt);
      const awake = v.driver || v.ai || v.vel.lengthSq() > 0.01 || v.type === 'heli' && v.rotor > 0.01 || v.air;
      if (awake) v.update(dt, ctrl);
    }
    this._pairs(dt);
    for (const v of this.list) { const d2 = dist2(v.pos.x, v.pos.z, G.cam.cam.position.x, G.cam.cam.position.z); if (d2 < 250 * 250 || v.driver) v.visuals(dt, G.env); v.object.visible = d2 < 420 * 420 || !!v.driver; }
    // player in vehicle: seat sync, sounds, EV charge, lights toggles
    if (!this.beams) { this.beams = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.45, 1.2); this.beams.target.position.set(0, -2, 20); this.beams.add(this.beams.target); }
    const pv = P.state === 'vehicle' ? P.vehicle : null;
    if (pv && pv.type !== 'heli' && pv.type !== 'plane') { if (this.beams.parent !== pv.body) { pv.body.add(this.beams); this.beams.position.set(0, pv.H * 0.45, pv.L / 2 + 0.2); } this.beams.intensity = pv.lightsOn ? 140 : 0; }
    else if (this.beams.parent) { this.beams.parent.remove(this.beams); this.beams.intensity = 0; }
    if (P.state === 'vehicle' && P.vehicle) {
      const v = P.vehicle; const s = v.m.seat;
      const seat = new THREE.Vector3(s[0], s[1], s[2]); v.body.localToWorld(seat);
      P.pos.copy(seat); P.heading = v.heading; P.object.quaternion.copy(v.body.getWorldQuaternion(new THREE.Quaternion()));
      if (input.pressed('horn')) G.audio.horn(v.pos, v.spec.body === 'truck' || v.spec.body === 'bus' ? 'truck' : 'car');
      if (input.pressed('lights')) v.manualLights = !(v.manualLights ?? v.lightsOn);
      if (input.pressed('radio') && v.type === 'car') { const st = [null, 'chill', 'drive']; this.radio = st[(st.indexOf(this.radio || null) + 1) % st.length]; G.ui.toast('Radio', this.radio === 'chill' ? 'Coast FM — chill' : this.radio === 'drive' ? 'Pulse 104 — night drive' : 'Radio off', 'info', 1.5); }
      const ev = this.engineVoice;
      if (ev) G.audio.engineSet(ev, { rpm: v.type === 'heli' ? v.rotor : v.type === 'plane' ? v.throttleP : clamp(Math.abs(v.speed) / (v.spec.top * 0.4) % 1.2 * 0.6 + Math.abs(v.speed) / v.spec.top * 0.5, 0, 1.4), load: Math.max(0, v.throttle), speed: Math.abs(v.speed), pos: v.pos, pitch: v.type === 'bike' ? 1.6 : 1 });
    }
  }
  _pairs(dt) {
    const L = this.list, G = this.game;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (a.type === 'heli' || b.type === 'heli' || a.type === 'plane' || b.type === 'plane') continue;
      if (Math.abs(a.pos.y - b.pos.y) > 2.5) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, R2 = a.radius + b.radius; if (dx * dx + dz * dz > R2 * R2) continue;
      if (a.kinematic && b.kinematic) continue;
      // circle sets
      const ca = circles(a), cb = circles(b);
      let best = null;
      for (const p of ca) for (const q of cb) { const ex = q.x - p.x, ez = q.z - p.z, d = Math.hypot(ex, ez), m = p.r + q.r; if (d < m && (!best || m - d > best.pen)) best = { nx: ex / (d || 1), nz: ez / (d || 1), pen: m - d }; }
      if (!best) continue;
      const ma = a.kinematic ? 1e9 : a.mass, mb = b.kinematic ? 1e9 : b.mass, tot = ma + mb;
      if (!a.kinematic) { a.pos.x -= best.nx * best.pen * (mb / tot); a.pos.z -= best.nz * best.pen * (mb / tot); }
      if (!b.kinematic) { b.pos.x += best.nx * best.pen * (ma / tot); b.pos.z += best.nz * best.pen * (ma / tot); }
      const rvx = (b.kinematic ? b.kvx || 0 : b.vel.x) - (a.kinematic ? a.kvx || 0 : a.vel.x), rvz = (b.kinematic ? b.kvz || 0 : b.vel.z) - (a.kinematic ? a.kvz || 0 : a.vel.z);
      const vn = rvx * best.nx + rvz * best.nz;
      if (vn < 0) {
        const jimp = -(1.3) * vn / ((a.kinematic ? 0 : 1 / ma) + (b.kinematic ? 0 : 1 / mb) || 1);
        if (!a.kinematic) { a.vel.x -= jimp * best.nx / ma; a.vel.z -= jimp * best.nz / ma; a.yawRate += (R() - 0.5) * -vn * 0.08; }
        if (!b.kinematic) { b.vel.x += jimp * best.nx / mb; b.vel.z += jimp * best.nz / mb; b.yawRate += (R() - 0.5) * -vn * 0.08; }
        const imp = -vn;
        if (imp > 2) { a.hurt((imp - 2) * 2 * (mb / tot) * 2, imp); b.hurt((imp - 2) * 2 * (ma / tot) * 2, imp); bus.emit('vehicleCollision', a, b, imp); }
        for (const v of [a, b]) if (v.kinematic && v.traffic && imp > 1.5) G.traffic.bump(v, imp);
      }
    }
  }
  // owned garage
  addOwned(key, color, opts = {}) { const rec = { id: 'v' + Date.now().toString(36) + Math.floor(R() * 999), key, color: color || VEHICLES[key].colors[0], health: 100, battery: VEHICLES[key].electric ? 100 : null, spot: opts.spot || null }; this.owned.push(rec); return rec; }
  spawnOwned(rec, x, z, heading) {
    let v = this.list.find((q) => q.ownedId === rec.id); if (v) { if (v.driver) return v; v.place(x, z, heading); return v; }
    v = this.spawn(rec.key, x, z, heading, { color: rec.color, owner: 'player' }); v.ownedId = rec.id; v.health = rec.health; if (rec.battery != null) v.battery = rec.battery; return v;
  }
  syncOwned() { for (const v of this.list) if (v.ownedId) { const r = this.owned.find((o) => o.id === v.ownedId); if (r) { r.health = v.health; r.battery = v.battery; r.color = v.color; r.last = [v.pos.x, v.pos.z, v.heading]; } } }
}
function circles(v) {
  if (v.type === 'bike') return [{ x: v.pos.x, z: v.pos.z, r: 0.6 }];
  const n = Math.max(2, Math.round(v.L / v.W)), r = v.W * 0.5, out = [];
  for (let i = 0; i < n; i++) { const off = -v.L / 2 + r + (v.L - 2 * r) * i / (n - 1); out.push({ x: v.pos.x + v.fx * off, z: v.pos.z + v.fz * off, r }); }
  return out;
}
export { circles as vehicleCircles };
