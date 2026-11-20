// Player character controller: on foot, swimming, freefall, parachute, activities, knockdowns.
import { Humanoid, HERO_DEFAULT } from './humanoid.js';
import { clamp, lerp, damp, dampAngle, angleDiff, wrapAngle, bus } from '../core/util.js';
import { GeoBuilder, prim } from '../core/geo.js';
import { WATER_Y, terrainHeight, districtAt } from '../world/layout.js';

const GRAV = -22;
export class Player {
  constructor(game, appearance) {
    this.game = game; this.a = JSON.parse(JSON.stringify(appearance || HERO_DEFAULT));
    this.h = new Humanoid(this.a); this.object = this.h.object; game.scene.add(this.object);
    this.pos = this.object.position; this.vel = new THREE.Vector3(); this.heading = Math.PI;
    this.state = 'foot'; this.grounded = true; this.speed = 0; this.landT = 0; this.airT = 0;
    this.stats = { strength: 10, stamina: 10, endurance: 10, recovery: 10 };
    this.health = 100; this.stamina = 100; this.exert = 0;
    this.action = null; this.combo = 0; this.comboT = 0; this.blocking = false; this.guardT = 0;
    this.item = null; this.itemT = 0; this.vehicle = null; this.activity = null;
    this.downT = 0; this.invuln = 0; this.hurt = 0; this.stepPhase = 0; this.lastStep = 0;
    this.chute = this._buildChute(); this.chute.visible = false; this.object.add(this.chute);
    this.chuteOpen = 0; this.name = 'Marcus Reed';
  }
  get maxHealth() { return 100 + this.stats.endurance * 1.5; }
  get maxStamina() { return 100 + this.stats.stamina * 1.5; }
  get fighter() { return this; }
  setAppearance(a) { this.a = JSON.parse(JSON.stringify(a)); this.h.setAppearance(this.a); }
  teleport(x, y, z, heading) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); if (heading !== undefined) this.heading = heading; this.object.rotation.y = this.heading; this.grounded = true; }

  _buildChute() {
    const g = new THREE.Group(); const b = new GeoBuilder();
    const cells = 9, span = 7.2, chord = 2.6;
    for (let i = 0; i < cells; i++) {
      const u = (i + 0.5) / cells - 0.5, x = u * span, arc = Math.cos(u * 2.2) * 1.2;
      b.box(x, 6.6 + arc, 0, span / cells + 0.06, 0.42, chord, i % 2 ? '#13a3a3' : '#0d2b3a', { faces: 'px nx py ny pz nz', rotY: 0 });
    }
    const canopy = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    canopy.castShadow = true; g.add(canopy);
    const pts = [];
    for (let i = 0; i < cells; i += 2) { const u = (i + 0.5) / cells - 0.5, x = u * span, y = 6.4 + Math.cos(u * 2.2) * 1.2; for (const z of [-1, 1]) pts.push(x, y, z * 0.9, x > 0 ? 0.25 : -0.25, 1.75, 0); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.7 })));
    g.position.y = 0; this.canopy = canopy; return g;
  }

  // ------------- main update -------------
  update(dt, input, camYaw) {
    const G = this.game; this.hurt = Math.max(0, this.hurt - dt * 2.5); this.invuln = Math.max(0, this.invuln - dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    const regen = (this.state === 'foot' && !this.action ? 1 : 0.4) * (0.6 + this.stats.recovery * 0.04);
    if (this.health > 0 && G.time - (this.lastHitT || -99) > 6) this.health = Math.min(this.maxHealth, this.health + dt * regen * (this.health < this.maxHealth * 0.5 ? 1 : 0.35));
    const anim = { mode: 'loco', speed: 0, exert: this.exert };
    switch (this.state) {
      case 'foot': this._foot(dt, input, camYaw, anim); break;
      case 'swim': this._swim(dt, input, camYaw, anim); break;
      case 'freefall': this._freefall(dt, input, camYaw, anim); break;
      case 'parachute': this._parachute(dt, input, camYaw, anim); break;
      case 'vehicle': this._inVehicle(dt, input, anim); break;
      case 'activity': this._activity(dt, input, anim); break;
      case 'down': this._down(dt, anim); break;
      case 'cutscene': anim.mode = this.cutPose || 'loco'; anim.talk = this.cutTalk; anim.lookYaw = this.cutLook; break;
      case 'sit': anim.mode = 'sit'; anim.sitH = this.sitH || 0.5; anim.item = this.item; if (input.pressed('interact') || input.pressed('jump') || input.move().mag > 0.5) { if (!this.eating) this.standUp(); } break;
    }
    if (this.state !== 'parachute' && this.chute.visible) this.chute.visible = false;
    if (this.item && this.state !== 'vehicle') { anim.item = this.item; this._itemUpdate(dt, input); }
    if (this.hurt > 0) anim.hurt = this.hurt;
    this.object.rotation.y = this.heading;
    this.h.update(dt, anim);
    this.anim = anim;
  }
  standUp() { this.state = 'foot'; if (this.seat) { this.pos.x += Math.sin(this.heading) * 0.6; this.pos.z += Math.cos(this.heading) * 0.6; this.seat = null; } }

  _moveDir(input, camYaw) {
    const m = input.move(); if (m.mag < 0.05) return null;
    const a = camYaw + Math.atan2(-m.x, m.y) + Math.PI; // camera looks along -z of its yaw
    return { x: Math.sin(a), z: Math.cos(a), mag: m.mag, ang: a };
  }
  _foot(dt, input, camYaw, anim) {
    const G = this.game, city = G.city;
    const dir = this._moveDir(input, camYaw);
    this.crouch = input.down('crouch') && this.grounded;
    const wantSprint = input.down('sprint') && dir && !this.crouch && this.stamina > 2 && !this.action;
    let target = 0;
    if (dir) target = this.crouch ? 1.5 : wantSprint ? 7.2 + this.stats.stamina * 0.02 : dir.mag < 0.55 ? 1.6 : 4.3;
    if (this.action || this.blocking) target *= 0.25;
    if (this.landT > 0) { this.landT -= dt; target *= 0.3; }
    // stamina
    if (wantSprint && this.speed > 5) { this.stamina = Math.max(0, this.stamina - dt * (14 - this.stats.stamina * 0.06)); this.exert = Math.min(1, this.exert + dt * 0.25); }
    else { this.stamina = Math.min(this.maxStamina, this.stamina + dt * (9 + this.stats.recovery * 0.25)); this.exert = Math.max(0, this.exert - dt * 0.08); }
    const accel = this.grounded ? 12 : 2.5;
    const hv = { x: this.vel.x, z: this.vel.z };
    const dx = dir ? dir.x * target : 0, dz = dir ? dir.z * target : 0;
    hv.x = damp(hv.x, dx, accel, dt); hv.z = damp(hv.z, dz, accel, dt);
    this.vel.x = hv.x; this.vel.z = hv.z;
    this.speed = Math.hypot(hv.x, hv.z);
    if (dir && !this.blocking && !(this.action && this.action.lock)) this.heading = dampAngle(this.heading, Math.atan2(dir.x, dir.z), this.grounded ? 11 : 3, dt);
    if (this.faceTarget) { this.heading = dampAngle(this.heading, this.faceTarget, 14, dt); this.faceTarget = null; }
    // jump
    if (input.pressed('jump') && this.grounded && !this.action && !this.crouch) { this.vel.y = 6.4; this.grounded = false; this.airT = 0; G.audio.noiseHit({ pos: this.pos, f: 800, d: 0.05, v: 0.12 }); }
    // integrate
    this.vel.y += GRAV * dt; this.vel.y = Math.max(this.vel.y, -55);
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const p = { x: nx, z: nz };
    city.collideCircle(p, 0.32, this.pos.y + 0.05, 1.8);
    G.dynamicCollide(p, 0.32, this);
    this.pos.x = p.x; this.pos.z = p.z;
    let ny = this.pos.y + this.vel.y * dt;
    const ground = city.surfaceHeight(this.pos.x, this.pos.z, Math.max(this.pos.y, ny));
    if (ny <= ground) {
      if (!this.grounded) this._land(-this.vel.y);
      ny = ground; this.vel.y = 0; this.grounded = true;
    } else if (this.grounded && ny - ground < 0.45 && this.vel.y <= 0) { ny = ground; this.vel.y = 0; }
    else { this.grounded = false; this.airT += dt; }
    this.pos.y = ny;
    // water
    const wl = G.ocean.height(this.pos.x, this.pos.z);
    if (ground < wl - 1.3 && this.pos.y < wl - 0.9) { this.state = 'swim'; this.vel.y = 0; G.audio.splash(this.pos, Math.min(1, this.speed / 6 + 0.3)); this.dropItem(); bus.emit('swim'); return; }
    // fall off world guard
    if (this.pos.y < -30) this.teleport(this.pos.x, terrainHeight(this.pos.x, this.pos.z) + 1, this.pos.z);
    // freefall from great height
    if (!this.grounded && this.vel.y < -14 && this.pos.y - ground > 18) { this.state = 'freefall'; bus.emit('freefall'); }
    // anim
    anim.mode = this.grounded ? (this.landT > 0.05 && this.landHard ? 'land' : 'loco') : this.vel.y > 0 ? 'jump' : 'fall';
    anim.speed = this.speed; anim.crouch = this.crouch; anim.guard = this.guardT > 0;
    this.guardT -= dt;
    // combat actions
    this._combatInput(dt, input, anim);
    // footsteps
    if (this.grounded && this.speed > 0.6) {
      this.stepPhase += (this.speed / (1.25 + 0.27 * this.speed)) * 2 * dt;
      if (Math.floor(this.stepPhase) !== this.lastStep) { this.lastStep = Math.floor(this.stepPhase); G.audio.footstep(this.surface(), this.pos, this.crouch ? 0.25 : clamp(0.4 + this.speed * 0.08, 0.3, 1)); }
    }
  }
  surface() {
    const G = this.game, x = this.pos.x, z = this.pos.z, y = this.pos.y;
    if (G.interior) return G.interior.floor || 'tile';
    if (y > 0.2 && y < 2 && ((x > 486 && x < 506) || (x > 560 && z > 14 && z < 30))) return 'wood';
    if (y < 0.12 && x > 506 && x < 640) return 'sand';
    const d = districtAt(x, z); if (d === 'hillside' || d === 'outskirts') return 'grass';
    return 'concrete';
  }
  _land(v) {
    const G = this.game; this.landHard = v > 9; this.landT = v > 9 ? 0.35 : 0.08;
    if (v > 13) { const dmg = (v - 13) * 7; this.damage(dmg, null, { fall: true }); G.audio.impact(this.pos, 0.4); }
    G.audio.footstep(this.surface(), this.pos, clamp(v / 8, 0.4, 1));
  }
  _combatInput(dt, input, anim) {
    const G = this.game;
    this.blocking = input.down('block') && this.grounded && !this.action;
    if (this.blocking) { anim.action = { name: 'block', p: 0.5 }; this.blockStart = this.blockStart || G.time; }
    else this.blockStart = 0;
    if (this.action) {
      const a = this.action; a.t += dt; a.p = a.t / a.dur;
      if (!a.hitDone && a.p >= a.hitAt) { a.hitDone = true; G.combat.resolveAttack(this, a); }
      anim.action = { name: a.name, p: a.p, dir: a.dir }; anim.hookSide = a.side;
      if (a.p >= 1) { this.action = null; this.guardT = 1.6; }
      return;
    }
    if (!this.grounded || this.item === 'phoneText') return;
    const st = (c) => { if (this.stamina < c) { G.ui.toast('Too tired', 'Catch your breath', 'warn', 1.2); return false; } this.stamina -= c; return true; };
    let atk = null;
    if (input.pressed('punch')) {
      const heavy = input.down('sprint');
      const seq = heavy ? ['hook', 'uppercut'] : ['jab', 'cross', 'hook', 'uppercut'];
      const name = seq[this.combo % seq.length]; this.combo++; this.comboT = 0.9;
      if (st(heavy ? 10 : 5)) atk = { name, dur: name === 'jab' ? 0.36 : name === 'cross' ? 0.42 : 0.55, hitAt: 0.38, side: this.combo % 2 ? 'L' : 'R', heavy: heavy || name === 'uppercut' || name === 'hook' };
    } else if (input.pressed('kick')) {
      const knee = input.down('forward') && this.game.combat.nearestEnemy(this, 1.3);
      if (st(12)) atk = knee ? { name: 'knee', dur: 0.55, hitAt: 0.4, heavy: true } : { name: 'kick', dur: 0.7, hitAt: 0.42, heavy: true, reach: 1.7 };
    } else if (input.pressed('push')) { if (st(6)) atk = { name: 'push', dur: 0.5, hitAt: 0.4, push: true }; }
    else if (input.pressed('dodge')) { if (st(8)) { const m = input.move(); const dirS = m.x >= 0 ? 1 : -1; atk = { name: 'dodge', dur: 0.45, hitAt: 2, dir: -dirS, dodge: true }; const a = this.heading + (dirS > 0 ? -Math.PI / 2 : Math.PI / 2); this.vel.x += Math.sin(a) * 6; this.vel.z += Math.cos(a) * 6; this.invuln = 0.35; } }
    if (atk) {
      atk.t = 0; atk.p = 0; atk.hitDone = false; atk.lock = true; this.action = atk;
      const tgt = G.combat.nearestEnemy(this, 3.2); if (tgt) this.heading = Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
      if (!atk.dodge) G.audio.whoosh(this.pos);
      this.dropItem('phoneText');
    }
  }
  damage(amount, from, o = {}) {
    const G = this.game;
    if (this.invuln > 0 || this.state === 'down' || G.godMode) return 0;
    if (this.blocking && from && !o.fall) {
      const toA = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z);
      if (Math.abs(angleDiff(this.heading, toA)) < 1.2) {
        const perfect = G.time - this.blockStart < 0.3;
        amount *= perfect ? 0 : 0.2; G.audio.block(this.pos);
        if (perfect) { this.counter = G.time; G.ui.toast('Counter!', 'Perfect block — your next punch hits harder', 'good', 1.2); }
        if (amount <= 0) return 0;
      }
    }
    const diff = G.settings.difficulty === 'easy' ? 0.6 : G.settings.difficulty === 'hard' ? 1.3 : 1;
    amount *= diff; this.health -= amount; this.lastHitT = G.time; this.hurt = Math.min(1, this.hurt + amount / 25);
    G.ui.damageFlash(Math.min(1, amount / 30));
    if (amount > 4 && from) G.audio.human('grunt', this.pos, 0.9);
    if (this.health <= 0) { this.health = 0; this.knockDown(true); bus.emit('wasted', o); }
    else if (o.knock) this.knockDown(false);
    return amount;
  }
  knockDown(dead) { if (this.state === 'vehicle') return; this.state = 'down'; this.downT = dead ? 3.2 : 1.8; this.dead = dead; this.action = null; this.dropItem(); }
  _down(dt, anim) {
    anim.mode = 'down'; anim.fastFall = true; anim.eyesClosed = this.dead; this.downT -= dt;
    if (this.downT <= 0 && !this.dead) { this.state = 'foot'; this.invuln = 1; }
  }
  // ------------- water -------------
  _swim(dt, input, camYaw, anim) {
    const G = this.game, dir = this._moveDir(input, camYaw);
    const fast = input.down('sprint') && this.stamina > 2;
    const target = dir ? (fast ? 2.8 : 1.7) * dir.mag : 0;
    if (fast && dir) this.stamina -= dt * 10; else this.stamina = Math.min(this.maxStamina, this.stamina + dt * 4);
    if (this.stamina <= 0) { this.damage(dt * 6, null, { fall: true }); G.ui.hint('You are exhausted — get to shore!', 2); }
    this.vel.x = damp(this.vel.x, dir ? dir.x * target : 0, 3, dt); this.vel.z = damp(this.vel.z, dir ? dir.z * target : 0, 3, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (dir) this.heading = dampAngle(this.heading, Math.atan2(dir.x, dir.z), 4, dt);
    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    G.city.collideCircle(p, 0.4, this.pos.y, 1.8); G.dynamicCollide(p, 0.4, this);
    this.pos.x = p.x; this.pos.z = p.z;
    const wl = G.ocean.height(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, wl - 0.25, 6, dt);
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 1.0, 1.0);
    if (ground > wl - 1.2) { this.state = 'foot'; this.pos.y = Math.max(this.pos.y, ground); return; }
    // climb out onto quay / dock edges
    if (input.pressed('jump')) {
      const ax = this.pos.x + Math.sin(this.heading) * 1.2, az = this.pos.z + Math.cos(this.heading) * 1.2;
      const top = G.city.surfaceHeight(ax, az, wl + 2.2, 2.2);
      if (top > wl - 0.2 && top - wl < 2.0) { this.teleport(ax, top, az); this.state = 'foot'; G.audio.splash(this.pos, 0.4); return; }
    }
    anim.mode = 'swim'; anim.speed = this.speed;
    if (this.speed > 0.4 && Math.random() < dt * 2) G.audio.splash(this.pos, 0.2);
  }
  // ------------- skydiving -------------
  _freefall(dt, input, camYaw, anim) {
    const G = this.game, m = input.move();
    const fwd = this.heading;
    this.heading = wrapAngle(this.heading - m.x * 1.6 * dt);
    const glide = 6 + Math.max(0, m.y) * 22 - Math.max(0, -m.y) * 4;
    this.vel.x = damp(this.vel.x, Math.sin(fwd) * glide, 1.2, dt); this.vel.z = damp(this.vel.z, Math.cos(fwd) * glide, 1.2, dt);
    this.vel.y = damp(this.vel.y, -48 - Math.max(0, m.y) * 8, 0.6, dt);
    this.pos.addScaledVector(this.vel, dt);
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y);
    const alt = this.pos.y - Math.max(ground, WATER_Y);
    if (input.pressed('jump') || input.pressed('vehicle') || input.pressed('interact') || (G.settings.autoDeploy && alt < 60 && alt > 8)) this.deployChute();
    anim.mode = 'freefall'; anim.steer = m.x;
    if (this.pos.y <= Math.max(ground, WATER_Y) + 0.2) this._landFrom(true);
    G.ui.hint(alt > 60 ? `Altitude ${Math.round(alt)} m — press SPACE to open parachute` : 'OPEN PARACHUTE NOW (SPACE)', 0.2);
  }
  deployChute() {
    if (this.state !== 'freefall') return;
    this.state = 'parachute'; this.chute.visible = true; this.chuteOpen = 0; this.game.audio.deploy(); bus.emit('chute');
  }
  _parachute(dt, input, camYaw, anim) {
    const G = this.game, m = input.move();
    this.chuteOpen = Math.min(1, this.chuteOpen + dt * 1.6);
    const o = this.chuteOpen, e = 1 - Math.pow(1 - o, 3);
    this.chute.scale.set(0.2 + e * 0.8, 0.3 + e * 0.7, 0.3 + e * 0.7);
    this.yawRate = damp(this.yawRate || 0, -m.x * 0.9, 3, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    const flare = Math.max(0, -m.y), dive = Math.max(0, m.y);
    const fwd = 9 + dive * 5 - flare * 5, sink = lerp(48, 4.2 + dive * 2.5 - flare * 1.8, e);
    this.vel.x = damp(this.vel.x, Math.sin(this.heading) * fwd, 1.5, dt); this.vel.z = damp(this.vel.z, Math.cos(this.heading) * fwd, 1.5, dt);
    this.vel.y = damp(this.vel.y, -sink, 2.2, dt);
    this.pos.addScaledVector(this.vel, dt);
    const p = { x: this.pos.x, z: this.pos.z }; G.city.collideCircle(p, 0.5, this.pos.y, 1.8); this.pos.x = p.x; this.pos.z = p.z;
    this.chute.rotation.z = -this.yawRate * 0.25; this.chute.rotation.x = -flare * 0.25 + dive * 0.15;
    anim.mode = 'parachute'; anim.steer = m.x;
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= Math.max(ground, WATER_Y - 0.6) + 0.05) this._landFrom(false);
    G.ui.hint('Steer A/D · W dive · S flare before landing', 0.2);
  }
  _landFrom(freefall) {
    const G = this.game; this.chute.visible = false;
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 1);
    const wl = G.ocean.height(this.pos.x, this.pos.z);
    const vy = -this.vel.y;
    if (ground < wl - 1.3) { this.state = 'swim'; this.pos.y = wl - 0.25; G.audio.splash(this.pos, 1); this.vel.set(0, 0, 0); bus.emit('landed', { water: true }); return; }
    this.pos.y = ground; this.state = 'foot'; this.grounded = true;
    if (freefall) { this.damage(this.maxHealth * 2, null, { fall: true }); }
    else { if (vy > 7.5) this.damage((vy - 7.5) * 6, null, { fall: true }); this.landT = 0.4; this.landHard = true; }
    this.vel.set(this.vel.x * 0.2, 0, this.vel.z * 0.2);
    bus.emit('landed', { x: this.pos.x, z: this.pos.z, soft: vy < 6 });
  }
  // ------------- vehicles / activities -------------
  _inVehicle(dt, input, anim) {
    const v = this.vehicle; if (!v) { this.state = 'foot'; return; }
    anim.mode = v.seatPose || 'drive'; anim.sitH = v.sitH ?? 0.5; anim.steer = v.steerVis || 0; anim.lean = v.lean || 0; anim.cadence = v.cadence;
    if (v.enterT > 0) anim.action = { name: 'enter', p: 1 - v.enterT / 0.6 };
  }
  _activity(dt, input, anim) {
    const a = this.activity; if (!a) { this.state = 'foot'; return; }
    anim.mode = 'activity'; anim.activity = a.kind; anim.rep = a.rep; anim.beat = a.beat; anim.style = a.style;
    if (a.update) a.update(dt, input, anim);
  }
  _itemUpdate(dt, input) {
    this.itemT += dt;
    if (this.item === 'smoke') {
      if (this.itemT > 60 || input.pressed('interact')) { this.dropItem('smoke'); this.game.ui.toast('Cigarette', 'You put it out and dispose of it properly.', 'info', 2); }
      else if (Math.floor(this.itemT % 6 * 10) === 36 && this.game.fx) this.game.fx.smokePuff(this.h.bonePos('head', new THREE.Vector3()));
    }
  }
  holdItem(kind) {
    const G = this.game; this.dropItem(); this.item = kind; this.itemT = 0;
    let mesh;
    if (kind === 'phoneText' || kind === 'phoneCall') { mesh = new THREE.Mesh(prim('box', 0.075, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.3, metalness: 0.6 })); this.h.hold('item', mesh, 'handR', [0, -0.09, 0.04], [0, 0, 0]); }
    if (kind === 'smoke') { mesh = new THREE.Group(); const c = new THREE.Mesh(prim('cyl', 0.004, 0.004, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xf2efe8 })); c.rotation.x = Math.PI / 2; const tip = new THREE.Mesh(prim('sphere', 0.005, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5522 })); tip.position.z = 0.04; mesh.add(c, tip); this.h.hold('item', mesh, 'handR', [0, -0.1, 0.03]); G.audio.lighter(this.pos); }
    if (kind === 'eat' || kind === 'drink') { mesh = new THREE.Mesh(kind === 'drink' ? prim('cyl', 0.035, 0.03, 0.11, 10) : prim('box', 0.1, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: kind === 'drink' ? 0xf4f1ea : 0xd99b4a })); this.h.hold('item', mesh, 'handR', [0, -0.11, 0.03]); }
  }
  dropItem(only) { if (only && this.item !== only) return; this.item = null; this.h.drop('item'); }
  serialize() { return { a: this.a, stats: this.stats, health: this.health, pos: [this.pos.x, this.pos.y, this.pos.z], heading: this.heading, name: this.name }; }
  restore(s) { if (!s) return; if (s.a) this.setAppearance(s.a); Object.assign(this.stats, s.stats || {}); this.health = s.health || this.maxHealth; this.name = s.name || this.name; if (s.pos) this.teleport(s.pos[0], s.pos[1], s.pos[2], s.heading); }
}
