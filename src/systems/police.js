// Six-level wanted system with witnesses, line-of-sight tracking, pursuit, search, decay, arrests.
import * as L from '../world/layout.js';
import { clamp, damp, angleDiff, R, bus, dist2, lerp } from '../core/util.js';
import { uniformAppearance } from '../actors/humanoid.js';

export const WANTED_LABELS = ['', 'Local suspicion', 'Patrol response', 'Pursuit', 'Tactical response', 'Specialized units', 'Maximum response'];
export class Police {
  constructor(game) {
    this.game = game; this.level = 0; this.lastKnown = null; this.seenT = 0; this.unseenT = 0; this.units = []; this.officers = []; this.heli = null;
    this.spawnT = 0; this.arrestT = 0; this.roadblockT = 30; this.searchLabel = '';
  }
  get searching() { return this.level > 0 && this.unseenT > 3; }
  // a crime happened: who saw it?
  crime(type, pos, sev, quiet) {
    const G = this.game;
    if (this._seesPlayer(75)) { this.report(type, sev, pos, true); return; }
    const w = G.npcs.witnesses(pos, quiet ? 14 : 32);
    let callers = 0;
    for (const n of w) { if (callers >= 2) { n.flee(pos); continue; } if (R() < 0.65) { G.npcs.witnessCall(n, type, sev); callers++; } else n.flee(pos); }
    if (callers) G.ui.hint('A witness is calling the police', 3);
    G.npcs.danger(pos, 22, sev);
  }
  report(type, sev, pos, exact) {
    const G = this.game; const before = this.level;
    this.level = clamp(Math.max(this.level, sev) + (this.level > 0 && sev >= 2 ? 1 : 0), 0, 6);
    const P = G.player.pos;
    this.lastKnown = exact ? { x: P.x, z: P.z, y: P.y } : { x: P.x + (R() - 0.5) * 30, z: P.z + (R() - 0.5) * 30, y: P.y };
    this.unseenT = exact ? 0 : 4;
    if (this.level > before) { G.audio.ui('error'); G.ui.toast('Wanted level ' + this.level, `${WANTED_LABELS[this.level]} — ${type === 'redlight' ? 'traffic violation' : type}`, 'bad', 3); bus.emit('wanted', this.level); }
  }
  setLevel(l) { this.level = clamp(l, 0, 6); if (!l) this.clear(); }
  clear() { this.level = 0; this.lastKnown = null; for (const u of this.units) u.v.siren = false; }
  _seesPlayer(range) {
    const G = this.game, P = G.player.pos;
    const eyes = [];
    for (const u of this.units) eyes.push(u.v.pos);
    for (const o of this.officers) if (o.active && !o.down) eyes.push(o.pos);
    for (const v of G.traffic.cars) if (v.v.owner === 'police') eyes.push(v.v.pos);
    if (this.heli) eyes.push(this.heli.pos);
    for (const e of eyes) {
      const r = e === (this.heli && this.heli.pos) ? 170 : range;
      if (dist2(e.x, e.z, P.x, P.z) > r * r) continue;
      if (G.city.segmentClear(e.x, e.y + 1.6, e.z, P.x, P.y + 1.2, P.z, 2) > 0.97) return true;
    }
    return false;
  }
  update(dt) {
    const G = this.game, P = G.player;
    if (this.level <= 0) { this._despawnAll(dt); return; }
    if (G.interior) { this.unseenT += dt * 2; }
    // tracking
    if (!G.interior && this._seesPlayer(80)) { this.lastKnown = { x: P.pos.x, z: P.pos.z, y: P.pos.y }; this.unseenT = 0; }
    else this.unseenT += dt;
    const evade = 12 + this.level * 5;
    if (this.unseenT > evade) { G.ui.toast('You lost the police', 'Wanted level cleared.', 'good', 3); bus.emit('evaded', this.level); this.clear(); return; }
    // desired units
    const want = Math.min(this.level + (this.level >= 3 ? 1 : 0), G.quality.policeMax);
    this.spawnT -= dt;
    if (this.units.length < want && this.spawnT <= 0 && !G.interior) { this.spawnT = 3.5; this._spawnUnit(); }
    if (this.level >= 4 && !this.heli && !G.interior) this._spawnHeli();
    for (const u of this.units) this._drive(u, dt);
    this._officers(dt);
    if (this.heli) this._heliUpdate(dt);
    // roadblocks at level 5+
    this.roadblockT -= dt; if (this.level >= 5 && this.roadblockT <= 0 && P.state === 'vehicle') { this.roadblockT = 45; this._roadblock(); }
    // cull far units
    for (let i = this.units.length - 1; i >= 0; i--) { const u = this.units[i]; if (dist2(u.v.pos.x, u.v.pos.z, P.pos.x, P.pos.z) > 420 * 420) { this._removeUnit(u); } }
  }
  _spawnUnit() {
    const G = this.game, P = G.player.pos;
    for (let k = 0; k < 20; k++) {
      const n = L.nodes[Math.floor(R() * L.nodes.length)]; const d2 = dist2(n.x, n.z, P.x, P.z);
      if (d2 < 120 * 120 || d2 > 260 * 260) continue;
      const v = G.vehicles.spawn('police', n.x, n.z, Math.atan2(P.x - n.x, P.z - n.z), { owner: 'police' });
      v.siren = true; v.sirenVoice = G.audio.siren();
      const u = { v, stuckT: 0, lastP: v.pos.clone(), reverseT: 0, officersOut: false };
      v.ai = () => this._ai(u);
      this.units.push(u); return u;
    }
  }
  _ai(u) {
    const G = this.game, P = G.player, v = u.v, T = this.lastKnown || P.pos;
    let tx = T.x, tz = T.z;
    const d = Math.hypot(tx - v.pos.x, tz - v.pos.z);
    // far away: aim for the next road node toward the target for better routing
    if (d > 70) { const path = u.path && u.pathT > 0 ? u.path : (u.path = L.routeNodes(v.pos.x, v.pos.z, tx, tz)); u.pathT = (u.pathT || 3) - 1 / 60; if (path && path.length > 1) { let nn = L.nodes[path[0]]; if (Math.hypot(nn.x - v.pos.x, nn.z - v.pos.z) < 14) { path.shift(); nn = L.nodes[path[0]]; } if (nn) { tx = nn.x; tz = nn.z; } } }
    else if (P.state === 'vehicle' && this.unseenT < 1) { tx += P.vehicle.vel.x * 0.8; tz += P.vehicle.vel.z * 0.8; }
    const want = Math.atan2(tx - v.pos.x, tz - v.pos.z); const err = angleDiff(v.heading, want);
    let thr = 1, steer = clamp(err * 2.2, -1, 1);
    if (Math.abs(err) > 1.6) thr = 0.4;
    const footNear = P.state !== 'vehicle' && d < 16;
    if (footNear) thr = v.speed > 1 ? -1 : 0;
    if (this.unseenT > 3 && d < 25) thr = 0.3;
    // unstick: reverse when blocked
    u.stuckT += 1 / 60; if (u.stuckT > 2) { if (u.lastP.distanceTo(v.pos) < 1.5 && thr > 0.3) u.reverseT = 1.6; u.stuckT = 0; u.lastP.copy(v.pos); }
    if (u.reverseT > 0) { u.reverseT -= 1 / 60; return { throttle: -0.8, steer: -steer, handbrake: false }; }
    if (footNear && v.speed < 1.5 && !u.officersOut) { u.officersOut = true; this._deploy(u); }
    return { throttle: thr, steer, handbrake: Math.abs(err) > 2.2 && v.speed > 12 };
  }
  _drive(u, dt) { const G = this.game; G.audio.sirenSet(u.v.sirenVoice, u.v.pos, u.v.siren && !G.interior); if (u.v.disabled) { u.v.siren = false; } }
  _deploy(u) {
    const G = this.game; const n = 1 + (this.level >= 3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = u.v.doorWorld(i ? -1 : 1);
      const o = G.npcs.spawnAt(d.x, d.z, 'police', uniformAppearance('police', R), { persistent: true });
      o.state = this.level <= 2 ? 'arrest' : 'fight'; o.foe = G.player; o.atkT = 1; o.walkSpeed = 5.5; this.officers.push(o);
    }
    G.ui.subtitle('Officer', this.level <= 2 ? 'Police! Stay where you are!' : 'Suspect on foot! Take them down!', 2.5);
  }
  _officers(dt) {
    const G = this.game, P = G.player;
    for (const o of this.officers) {
      if (!o.active || o.down) continue;
      if (o.state === 'walk' || o.state === 'idle') { o.state = P.state === 'foot' ? (this.level <= 2 ? 'arrest' : 'fight') : 'idle'; o.foe = P; }
      if (P.state === 'vehicle' && dist2(o.pos.x, o.pos.z, P.pos.x, P.pos.z) > 30 * 30) o.state = 'idle';
    }
  }
  tryArrest(officer, dt) {
    const G = this.game, P = G.player;
    if (P.state !== 'foot' && P.state !== 'down') return;
    const still = P.speed < 1.2 && !P.action;
    this.arrestT = still || P.health < P.maxHealth * 0.25 ? this.arrestT + dt : Math.max(0, this.arrestT - dt * 2);
    if (this.arrestT > 1.6) { this.arrestT = 0; G.busted(); }
    else if (this.arrestT > 0.3) G.ui.hint('Being arrested — move away to resist!', 0.3);
  }
  _spawnHeli() {
    const G = this.game, P = G.player.pos;
    const v = G.vehicles.spawn('skylark', P.x + 150, P.z + 150, 0, { owner: 'police', color: '#14254a', y: 80 });
    v.driver = 'ai'; v.rotor = 1; this.heli = v;
    const sl = new THREE.SpotLight(0xe8f0ff, 0, 220, 0.18, 0.5, 1); sl.position.set(0, 0, 0); v.object.add(sl); v.object.add(sl.target); this.spot = sl;
    v.ai = () => {
      const T = this.lastKnown || P; const t = G.time * 0.25;
      const tx = T.x + Math.cos(t) * 40, tz = T.z + Math.sin(t) * 40, ty = Math.max(70, G.city.surfaceHeight(v.pos.x, v.pos.z, 500) + 60);
      const want = Math.atan2(tx - v.pos.x, tz - v.pos.z), err = angleDiff(v.heading, want), d = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      return { pitch: clamp(d / 40, 0, 1) * (Math.abs(err) < 1 ? 1 : 0.2), yaw: clamp(err * 1.5, -1, 1), up: v.pos.y < ty - 3 ? 1 : 0, down: v.pos.y > ty + 3 ? 1 : 0 };
    };
    v.heliVoice = G.audio.engine('rotor');
  }
  _heliUpdate(dt) {
    const G = this.game, P = G.player, v = this.heli;
    G.audio.engineSet(v.heliVoice, { rpm: 1, pos: v.pos, vol: 0.8 });
    if (this.spot) {
      this.spot.intensity = G.env.night > 0.4 ? 60 : 0;
      const inv = new THREE.Matrix4().copy(v.object.matrixWorld).invert();
      const tgt = (this.unseenT < 2 ? P.pos : this.lastKnown) || P.pos; this.spot.target.position.copy(new THREE.Vector3(tgt.x, tgt.y, tgt.z).applyMatrix4(inv));
    }
  }
  _roadblock() {
    const G = this.game, P = G.player, v = P.vehicle; if (!v) return;
    const ahead = { x: v.pos.x + Math.sin(v.heading) * 140, z: v.pos.z + Math.cos(v.heading) * 140 };
    const ne = L.nearestEdge(ahead.x, ahead.z); if (!ne.edge || ne.d > 30) return;
    const A = L.nodes[ne.edge.a], x = A.x + ne.edge.dx * ne.t, z = A.z + ne.edge.dz * ne.t, h = Math.atan2(ne.edge.dx, ne.edge.dz) + Math.PI / 2;
    for (const s of [-1, 1]) { const c = G.vehicles.spawn('police', x + Math.sin(h) * s * 2.6, z + Math.cos(h) * s * 2.6, h, { owner: 'police' }); c.siren = true; c.roadblock = true; this.units.push({ v: c, stuckT: 0, lastP: c.pos.clone(), reverseT: 0, officersOut: true, static: true }); }
    G.ui.toast('Roadblock ahead', 'Police have blocked the road.', 'warn', 3);
  }
  _removeUnit(u) { const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1); this.game.audio.sirenStop(u.v.sirenVoice); this.game.vehicles.remove(u.v); }
  _despawnAll(dt) {
    const G = this.game, P = G.player.pos;
    for (const u of [...this.units]) { u.v.siren = false; G.audio.sirenSet(u.v.sirenVoice, u.v.pos, false); u.v.ai = null; if (dist2(u.v.pos.x, u.v.pos.z, P.x, P.z) > 120 * 120 || u.static) this._removeUnit(u); }
    for (const o of this.officers) { if (o.active && (o.state === 'fight' || o.state === 'arrest')) { o.state = 'walk'; o.foe = null; o.persistent = false; } }
    this.officers = this.officers.filter((o) => o.active);
    if (this.heli) { const h = this.heli; h.ai = () => ({ pitch: 1, yaw: 0, up: 1, down: 0 }); if (h.pos.y > 180 || dist2(h.pos.x, h.pos.z, P.x, P.z) > 500 * 500) { G.audio.engineStop(h.heliVoice); G.vehicles.remove(h); this.heli = null; this.spot = null; } else G.audio.engineSet(h.heliVoice, { rpm: 1, pos: h.pos, vol: 0.5 }); }
  }
  serialize() { return { level: 0 }; }
}
