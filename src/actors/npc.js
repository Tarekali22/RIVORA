// Pedestrian simulation: daily routines, sidewalk navigation, social idles, reactions and fighting.
import { Humanoid, randomAppearance, uniformAppearance } from './humanoid.js';
import * as L from '../world/layout.js';
import { clamp, lerp, damp, dampAngle, angleDiff, R, dist2, bus, wrapAngle } from '../core/util.js';
import { prim } from '../core/geo.js';
import { firstName } from '../data/content.js';

const PERSONAS = ['friendly', 'shy', 'nervous', 'confident', 'aggressive', 'suspicious', 'wealthy', 'working', 'tourist', 'business'];
let NID = 1;
export class NPC {
  constructor(game, a, role = 'ped') {
    this.game = game; this.id = NID++; this.role = role;
    this.a = a; this.h = new Humanoid(a, { shadow: game.quality.npcShadows }); this.object = this.h.object; game.scene.add(this.object);
    this.pos = this.object.position; this.heading = 0; this.vel = new THREE.Vector3(); this.speed = 0; this.active = true;
    this.reset(role);
  }
  reset(role) {
    this.role = role; this.state = 'walk'; this.stateT = 0; this.persona = R.pick ? R.pick(PERSONAS) : PERSONAS[Math.floor(R() * PERSONAS.length)];
    if (role === 'thug' || role === 'police') this.persona = role === 'thug' ? 'aggressive' : 'confident';
    this.maxHealth = role === 'thug' ? 110 : role === 'police' ? 120 : 60 + R() * 40; this.health = this.maxHealth;
    this.walkSpeed = role === 'jogger' ? 3.6 + R() : 1.15 + R() * 0.45; this.baseWalk = this.walkSpeed;
    this.route = null; this.target = null; this.anim = { mode: 'loco', speed: 0 }; this.action = null; this.blocking = false;
    this.item = null; this.memory = { hits: 0, met: 0 }; this.onRoad = false; this.stuckT = 0; this.lastP = { x: 0, z: 0 };
    this.hostile = role === 'thug'; this.name = firstName(this.a.sex); this.fleeFrom = null; this.cooldowns = {}; this.down = false; this.dead = false;
    this.object.visible = true; this.h.drop('item'); this.h.drop('umb'); this.chatWith = null;
  }
  get fighter() { return this; }
  damage(amount, from, o = {}) {
    const G = this.game; if (this.dead) return 0;
    if (this.blocking && from && !o.fall) { const toA = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z); if (Math.abs(angleDiff(this.heading, toA)) < 1.2) { amount *= 0.25; G.audio.block(this.pos); } }
    this.health -= amount; this.hitT = 0.35; this.hitDir = R() < 0.5 ? 1 : -1;
    if (amount > 3) G.audio.human(R() < 0.6 ? 'ouch' : 'grunt', this.pos, this.a.sex === 'f' ? 1.5 : 1);
    if (from === G.player) { this.memory.hits++; if (this.role !== 'thug' && this.role !== 'police') { G.crime('assault', this.pos, this.memory.hits > 2 || this.health <= 0 ? 2 : 1); } }
    if (this.health <= 0) { this.health = 0; this.knockDown(true); bus.emit('npcDown', this, from); }
    else if (o.knock || amount > 18) this.knockDown(false);
    else if (from && this.state !== 'fight') this.react(from);
    return amount;
  }
  react(from) {
    const brave = this.persona === 'aggressive' || (this.persona === 'confident' && R() < 0.4) || this.hostile || this.role === 'police';
    if (brave && from) { this.state = 'fight'; this.foe = from; this.stateT = 0; this.atkT = 0.8; }
    else { this.flee(from.pos || from); }
  }
  flee(fromPos, t = 8 + R() * 6) { if (this.down || this.state === 'fight') return; this.state = 'flee'; this.stateT = t; this.fleeFrom = { x: fromPos.x, z: fromPos.z }; this.walkSpeed = 4.5 + R() * 1.5; if (R() < 0.15) this.game.audio.human('scream', this.pos, this.a.sex === 'f' ? 1.6 : 1); this.h.drop('item'); this.item = null; }
  knockDown(dead) { this.down = true; this.dead = dead; this.state = 'down'; this.stateT = dead ? 9999 : 4 + R() * 3; this.action = null; this.h.drop('item'); this.item = null; }
}

export class NPCManager {
  constructor(game) {
    this.game = game; this.list = []; this.max = game.quality.npcs; this.spawnT = 0; this.callers = [];
    this.umbrellaGeo = null;
    bus.on('npcDown', (victim) => this._summonHelp(victim));
  }
  _summonHelp(v) { // a calm bystander walks over and checks on the injured person
    if (!v || !v.pos) return; let best = null, bd = 25 * 25;
    for (const n of this.list) { if (!n.active || n === v || n.down || n.role !== 'ped' || ['flee', 'fight', 'call', 'help'].includes(n.state) || n.fixed) continue; const d = dist2(n.pos.x, n.pos.z, v.pos.x, v.pos.z); if (d < bd && n.persona !== 'nervous') { bd = d; best = n; } }
    if (!best) return; best.state = 'goto'; best.gotoT = { x: v.pos.x + 0.9, z: v.pos.z, then: 'help', heading: Math.atan2(-0.9, 0) }; best.helpTarget = v; best.walkSpeed = 3.2;
    setTimeout(() => { if (best.active && best.state === 'help') this.game.ui.subtitle(best.name, ['Are you okay? Stay with me!', 'Somebody call an ambulance!', 'Don\'t move, help is coming.'][Math.floor(R() * 3)], 3); }, 2500);
  }
  _make(a, role) {
    const free = this.list.find((n) => !n.active && n.role !== 'fixed');
    if (free && this.list.length >= this.max) { free.a = a; free.h.setAppearance(a); free.active = true; free.reset(role); return free; }
    const n = new NPC(this.game, a, role); this.list.push(n); return n;
  }
  spawnAt(x, z, role = 'ped', a, opts = {}) {
    a = a || (role === 'police' || role === 'thug' || role === 'barista' || role === 'athlete' || role === 'medic' ? uniformAppearance(role === 'athlete' ? 'athlete' : role, R) : randomAppearance(R));
    const n = this._make(a, role);
    n.pos.set(x, opts.y ?? this.game.city.surfaceHeight(x, z, 50), z); n.heading = opts.heading ?? R() * 6.28; n.object.rotation.y = n.heading;
    if (opts.state) { n.state = opts.state; n.stateT = opts.t ?? 999; }
    n.persistent = !!opts.persistent; n.fixed = opts.fixed; n.home = opts.home || null;
    return n;
  }
  despawn(n) { n.active = false; n.object.visible = false; n.route = null; n.foe = null; n.persistent = false; if (n.dog) { this.game.scene.remove(n.dog.root); n.dog = null; } }
  // pick a sidewalk node near the player but not too close
  _spawnAmbient() {
    const G = this.game, P = G.player.pos;
    const period = G.env.period, rain = G.env.w.rain;
    const ring = L.pedNodes.filter((q) => { if (!q.ok) return false; const d2 = dist2(q.x, q.z, P.x, P.z); return d2 > 35 * 35 && d2 < 125 * 125; });
    for (let k = 0; k < 4 && ring.length; k++) {
      const pn = ring[Math.floor(R() * ring.length)];
      const dist = L.districtAt(pn.x, pn.z); const D = L.DISTRICTS[dist] || { density: 0.5 };
      let dens = D.density * (period === 'night' ? (dist === 'nightlife' ? 1.2 : 0.35) : period === 'morning' ? 0.8 : 1) * (1 - rain * 0.5);
      if (R() > dens) continue;
      const role = period === 'morning' && R() < 0.15 ? 'jogger' : R() < 0.06 ? 'dogwalker' : 'ped';
      const a = randomAppearance(R);
      if (period === 'morning' && R() < 0.3) { a.top.type = 'blazer'; a.bottom.type = 'pants'; }
      const n = this.spawnAt(pn.x + (R() - 0.5) * 2, pn.z + (R() - 0.5) * 2, role, a);
      n.route = { from: pn.id, to: this._nextNode(pn.id, -1), cross: null };
      if (role === 'dogwalker') this._giveDog(n);
      if (rain > 0.3 && R() < 0.4) this._umbrella(n);
      else if (R() < 0.12 && period === 'morning') this._holdCup(n);
      return n;
    }
    // boardwalk / beach life
    if (R() < 0.6) {
      const z = P.z + (R() - 0.5) * 200; if (z < -560 || z > 500 || Math.abs(P.x - 500) > 220) return null;
      if (R() < 0.6) { const n = this.spawnAt(492 + R() * 12, z, R() < (period === 'evening' || period === 'morning' ? 0.35 : 0.12) ? 'jogger' : 'ped', null, { y: 0.3 }); n.boardwalk = true; n.heading = R() < 0.5 ? 0 : Math.PI; return n; }
      const spot = G.city.beachSpots[Math.floor(R() * G.city.beachSpots.length)];
      if (spot && period !== 'night' && rain < 0.2) { const a = randomAppearance(R); a.top.type = 'tank'; a.bottom.type = 'shorts'; const n = this.spawnAt(spot[0], spot[1], 'ped', a, { state: 'lie', heading: Math.PI / 2, y: 0.05 }); n.fixed = true; return n; }
    }
    return null;
  }
  _nextNode(id, prevId) {
    const pn = L.pedNodes[id]; const opts = pn.links.map((eid) => L.pedEdges[eid]).filter((e) => { const o = e.a === id ? e.b : e.a; return L.pedNodes[o].ok && o !== prevId; });
    if (!opts.length) return prevId;
    const e = opts[Math.floor(R() * opts.length)]; return e.a === id ? e.b : e.a;
  }
  _edgeBetween(a, b) { return L.pedNodes[a].links.map((id) => L.pedEdges[id]).find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }
  _giveDog(n) {
    const G = this.game; if (!G.companionFactory) return;
    const dog = G.companionFactory('dog', { small: true, color: ['#c8a165', '#2b2b2b', '#f2efe9', '#7a4f2a'][Math.floor(R() * 4)] });
    dog.root.position.copy(n.pos); G.scene.add(dog.root); n.dog = dog;
  }
  _umbrella(n) {
    const g = new THREE.Group(); const c = new THREE.Mesh(prim('cone', 0.55, 0.3, 10, 1, true), new THREE.MeshStandardMaterial({ color: ['#1d3557', '#e63946', '#2a9d8f', '#222'][Math.floor(R() * 4)], side: THREE.DoubleSide, roughness: 0.6 }));
    c.position.y = 0.95; const s = new THREE.Mesh(prim('cyl', 0.01, 0.01, 0.95, 4), new THREE.MeshStandardMaterial({ color: 0x333333 })); s.position.y = 0.48; g.add(c, s);
    n.h.hold('umb', g, 'handR', [0, -0.08, 0.02], [Math.PI, 0, 0]); n.umbrella = true;
  }
  _holdCup(n) { const m = new THREE.Mesh(prim('cyl', 0.035, 0.03, 0.11, 8), new THREE.MeshStandardMaterial({ color: 0xf4f1ea })); n.h.hold('item', m, 'handR', [0, -0.1, 0.03]); n.item = 'drink'; }

  ejectDriver(v, mode = 'flee') {
    const tc = v.traffic; const a = tc && tc.driverNpc ? tc.driverNpc : randomAppearance(R);
    if (tc) tc.driverNpc = null;
    const d = v.doorWorld(1);
    const n = this.spawnAt(d.x, d.z, mode === 'rage' ? 'ped' : 'ped', a, { heading: v.heading + Math.PI / 2 });
    n.persistent = true;
    if (mode === 'rage') { n.persona = 'aggressive'; n.state = 'fight'; n.foe = this.game.player; n.atkT = 1; this.game.ui.subtitle(n.name, ['Are you blind?!', 'You hit my car!', 'Get out here!'][Math.floor(R() * 3)], 2.5); }
    else { n.flee(this.game.player.pos); n.memory.hits++; if (R() < 0.7) this.witnessCall(n, 'carjack', 2); }
    return n;
  }
  witnessCall(n, crime, sev) { if (n.down || n.calling) return; n.calling = { crime, sev, t: 4 + R() * 2 }; n.state = 'call'; n.stateT = n.calling.t + 1; n.h.drop('item'); }
  // crime witnesses (called from game.crime)
  witnesses(pos, radius = 32) {
    const G = this.game, out = [];
    for (const n of this.list) {
      if (!n.active || n.down || n.role === 'thug' || n.role === 'police') continue;
      if (dist2(n.pos.x, n.pos.z, pos.x, pos.z) > radius * radius) continue;
      if (G.city.segmentClear(n.pos.x, n.pos.y + 1.6, n.pos.z, pos.x, pos.y + 1.2, pos.z, 2.5) < 0.98) continue;
      out.push(n);
    }
    return out;
  }
  danger(pos, radius, sev = 1) { for (const n of this.list) { if (!n.active || n.down || n.state === 'fight' || n.role === 'police' || n.role === 'thug' || n.fixed === 'staff') continue; if (dist2(n.pos.x, n.pos.z, pos.x, pos.z) < radius * radius) { if (n.persona === 'confident' && sev < 2 && R() < 0.4) { n.state = 'watch'; n.stateT = 5; n.watchPos = pos; } else n.flee(pos); } } }

  update(dt) {
    const G = this.game, P = G.player, cam = G.cam.cam.position;
    // population management
    this.spawnT -= dt;
    const activeCount = this.list.filter((n) => n.active && !n.fixedRole).length;
    if (this.spawnT <= 0 && !G.interior) { this.spawnT = 0.25; if (activeCount < this.max) this._spawnAmbient(); }
    let crowd = 0;
    for (const n of this.list) {
      if (!n.active) continue;
      const d2 = dist2(n.pos.x, n.pos.z, P.pos.x, P.pos.z);
      if (!n.persistent && !n.interior && (d2 > 160 * 160 || (G.interior && !n.interior))) { this.despawn(n); continue; }
      if (n.interior && n.interior !== G.interiorId) { n.object.visible = false; continue; }
      if (d2 < 22 * 22 && (n.state === 'chat' || n.state === 'call' || n.state === 'sit' || n.state === 'walk')) crowd += n.state === 'chat' ? 2 : 0.5;
      const near = d2 < 55 * 55;
      n._lod = (n._lod || 0) + 1;
      const step = near || n.state === 'fight' || n.state === 'flee' ? 1 : 3;
      if (n._lod % step === 0) this._think(n, dt * step, d2);
      n.object.visible = d2 < 140 * 140;
      if (n.object.visible) { n.object.rotation.y = n.heading; if (n._lod % (d2 < 70 * 70 ? 1 : 2) === 0) n.h.update(dt * (d2 < 70 * 70 ? 1 : 2), n.anim); }
      if (n.dog) this._dogFollow(n, dt);
    }
    this.crowd = crowd;
    // witness phone calls resolve into police reports
    for (const n of this.list) if (n.active && n.calling) { n.calling.t -= dt; if (n.down) n.calling = null; else if (n.calling.t <= 0) { G.police.report(n.calling.crime, n.calling.sev, n.pos); n.calling = null; } }
  }
  _think(n, dt, d2) {
    const G = this.game, P = G.player; n.stateT -= dt; n.onRoad = false;
    const A = n.anim; A.mode = 'loco'; A.speed = 0; A.item = n.item; A.talk = false; A.wave = false; A.handsUp = false; A.lookYaw = undefined; A.action = null; A.guard = false; A.hurt = 0; A.activity = null; A.eyesClosed = false;
    if (n.hitT > 0) { n.hitT -= dt; A.action = { name: 'hit', p: 1 - n.hitT / 0.35, dir: n.hitDir }; }
    switch (n.state) {
      case 'walk': this._walk(n, dt, A); break;
      case 'wait': A.speed = 0; if (this._crossOk(n)) n.state = 'walk'; else if (n.stateT < -25) { n.route.to = n.route.from; n.state = 'walk'; } this._lookAtPlayer(n, A, d2); break;
      case 'idle': case 'phone': case 'smoke': A.speed = 0; if (n.state === 'phone') A.item = 'phoneText'; if (n.state === 'smoke') A.item = 'smoke'; this._lookAtPlayer(n, A, d2); if (n.stateT <= 0) { n.state = 'walk'; if (n.state !== 'smoke') n.item = n.item === 'phoneText' ? null : n.item; } break;
      case 'chat': A.talk = Math.sin(G.time * 0.7 + n.id) > 0; if (n.chatWith) n.heading = dampAngle(n.heading, Math.atan2(n.chatWith.pos.x - n.pos.x, n.chatWith.pos.z - n.pos.z), 4, dt); if (R() < dt * 0.04) G.audio.human('laugh', n.pos, n.a.sex === 'f' ? 1.4 : 1); if (n.stateT <= 0 || !n.chatWith || !n.chatWith.active) { n.state = 'walk'; n.chatWith = null; } break;
      case 'sit': A.mode = 'sit'; A.sitH = 0.5; A.talk = false; if (n.stateT <= 0 && !n.fixed) { n.state = 'walk'; n.pos.x += Math.sin(n.heading) * 0.6; n.pos.z += Math.cos(n.heading) * 0.6; if (n.seat) n.seat.taken = false; } break;
      case 'lie': A.mode = 'activity'; A.activity = 'lie'; break;
      case 'activity': A.mode = 'activity'; A.activity = n.activityKind; n.rep = (n.rep || 0) + dt * 0.45; A.rep = n.rep % 1; A.beat = G.time * 2.03; A.style = n.id % 3; break;
      case 'call': A.item = 'phoneCall'; A.speed = 0; if (n.stateT <= 0) { n.state = 'flee'; n.stateT = 6; n.fleeFrom = { x: P.pos.x, z: P.pos.z }; } break;
      case 'watch': A.speed = 0; if (n.watchPos) n.heading = dampAngle(n.heading, Math.atan2(n.watchPos.x - n.pos.x, n.watchPos.z - n.pos.z), 3, dt); A.item = R() < 0.5 ? 'phoneText' : null; if (n.stateT <= 0) n.state = 'walk'; break;
      case 'flee': this._flee(n, dt, A); break;
      case 'down': A.mode = 'down'; A.eyesClosed = n.dead; if (!n.dead && n.stateT <= 0) { n.down = false; n.health = Math.max(n.health, n.maxHealth * 0.3); n.flee(P.pos, 10); } break;
      case 'fight': this._fight(n, dt, A); break;
      case 'arrest': this._arrest(n, dt, A); break;
      case 'surrender': A.handsUp = true; if (n.stateT <= 0) n.flee(P.pos); break;
      case 'goto': this._goto(n, dt, A); break;
      case 'staff': A.speed = 0; A.talk = n.talking; this._lookAtPlayer(n, A, d2, true); break;
      case 'help': A.action = { name: 'pet', p: (this.game.time % 2) / 2 }; if (n.helpTarget) n.heading = Math.atan2(n.helpTarget.pos.x - n.pos.x, n.helpTarget.pos.z - n.pos.z); if (n.stateT <= 0 || !n.helpTarget || !n.helpTarget.down) { n.state = 'call'; n.stateT = 4; n.walkSpeed = n.baseWalk; n.helpTarget = null; } break;
      case 'dance': A.mode = 'activity'; A.activity = 'dance'; A.beat = G.time * 2.03 + n.id * 0.13; A.style = n.id % 3; break;
    }
    if (n.state !== 'down' && n.state !== 'sit' && n.state !== 'lie' && n.state !== 'activity' && n.state !== 'dance') this._ambientSounds(n, dt, d2);
  }
  _lookAtPlayer(n, A, d2, always) {
    const P = this.game.player; if (d2 > 12 * 12 && !always) return;
    const a = angleDiff(n.heading, Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z)); if (Math.abs(a) < 1.3) A.lookYaw = a;
    if (!always && n.persona === 'friendly' && d2 < 4 * 4 && P.speed < 0.5 && R() < 0.01 && this.game.audio.cooldown('greet', 6)) { A.wave = true; this.game.ui.subtitle(n.name, ['Hey there!', 'Nice day, huh?', 'Morning!', 'Hi!', 'Love that dog!'][Math.floor(R() * (this.game.companion && this.game.companion.kind === 'dog' ? 5 : 4))], 2); }
  }
  _ambientSounds(n, dt, d2) {
    if (d2 > 25 * 25) return; const G = this.game;
    if (R() < dt * 0.012) G.audio.human(['cough', 'sneeze', 'yawn', 'sigh', 'clear'][Math.floor(R() * 5)], n.pos, n.a.sex === 'f' ? 1.4 : 1);
    if (n.speed > 0.8 && d2 < 14 * 14) { n.stepAcc = (n.stepAcc || 0) + n.speed * dt / 0.75; if (n.stepAcc > 1) { n.stepAcc = 0; if (G.audio.voiceBudget-- > 0) G.audio.footstep(n.boardwalk ? 'wood' : 'concrete', n.pos, 0.25); } }
  }
  _crossOk(n) {
    const e = n.route && n.route.cross; if (!e) return true;
    const node = L.nodes[e.node]; if (!node.light) return true;
    const other = e.cross === 'ns' ? 'ew' : 'ns';
    return L.signalState(node, this.game.time, other) === 'green' && L.signalState(node, this.game.time + 6, other) === 'green';
  }
  _walk(n, dt, A) {
    const G = this.game;
    if (n.boardwalk) { // stroll along the boardwalk deck
      const dir = Math.cos(n.heading) > 0 ? 1 : -1; n.heading = dir > 0 ? 0 : Math.PI;
      n.pos.x = damp(n.pos.x, clamp(n.pos.x, 489, 503), 2, dt); n.pos.z += dir * n.walkSpeed * dt; n.pos.y = 0.3;
      if (n.pos.z > 510 || n.pos.z < -575) n.heading += Math.PI;
      A.speed = n.walkSpeed; n.speed = n.walkSpeed; this._avoid(n, dt);
      if (R() < dt * 0.02 && n.role !== 'jogger') { n.state = R() < 0.5 ? 'phone' : 'idle'; n.stateT = 4 + R() * 8; n.heading = Math.PI / 2; }
      return;
    }
    if (!n.route) { const pn = this._nearestPed(n.pos); if (!pn) { n.state = 'idle'; n.stateT = 5; return; } n.route = { from: pn.id, to: pn.id, cross: null }; }
    const tgt = L.pedNodes[n.route.to];
    const dx = tgt.x - n.pos.x, dz = tgt.z - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8) {
      // arrived at a corner: maybe pause for something social, then choose next
      const prev = n.route.from; n.route.from = n.route.to; n.route.to = this._nextNode(n.route.from, prev);
      const e = this._edgeBetween(n.route.from, n.route.to); n.route.cross = e && e.cross ? e : null;
      if (n.route.cross && !this._crossOk(n)) { n.state = 'wait'; n.stateT = 0; }
      if (n.role !== 'jogger' && R() < 0.22) this._socialPause(n);
      return;
    }
    n.onRoad = !!n.route.cross;
    const wantH = Math.atan2(dx, dz); n.heading = dampAngle(n.heading, wantH, 6, dt);
    const sp = n.walkSpeed * (this.game.env.w.rain > 0.4 && !n.umbrella ? 1.35 : 1) * (n.route.cross ? 1.25 : 1);
    n.speed = damp(n.speed, sp, 4, dt);
    n.pos.x += Math.sin(n.heading) * n.speed * dt; n.pos.z += Math.cos(n.heading) * n.speed * dt;
    this._avoid(n, dt);
    const p = { x: n.pos.x, z: n.pos.z }; G.city.collideCircle(p, 0.3, n.pos.y + 0.1, 1.7); n.pos.x = p.x; n.pos.z = p.z;
    n.pos.y = damp(n.pos.y, G.city.surfaceHeight(n.pos.x, n.pos.z, n.pos.y + 0.5), 12, dt);
    A.speed = n.speed;
    // stuck detection
    n.stuckT += dt; if (n.stuckT > 3) { const moved = Math.hypot(n.pos.x - n.lastP.x, n.pos.z - n.lastP.z); n.stuckT = 0; n.lastP = { x: n.pos.x, z: n.pos.z }; if (moved < 0.6) { const t = n.route.to; n.route.to = n.route.from; n.route.from = t; n.stuck = (n.stuck || 0) + 1; } }
  }
  _socialPause(n) {
    const G = this.game, r = R();
    if (r < 0.3) { // chat with someone nearby
      const o = this.list.find((m) => m !== n && m.active && m.state === 'walk' && !m.boardwalk && dist2(m.pos.x, m.pos.z, n.pos.x, n.pos.z) < 9);
      if (o) { const t = 8 + R() * 14; n.state = o.state = 'chat'; n.stateT = o.stateT = t; n.chatWith = o; o.chatWith = n; return; }
    }
    if (r < 0.5) { n.state = 'phone'; n.stateT = 4 + R() * 8; n.item = 'phoneText'; return; }
    if (r < 0.62 && G.settings.smoking && n.persona !== 'business' && !n.umbrella) { n.state = 'smoke'; n.stateT = 12 + R() * 10; return; }
    if (r < 0.85) { const seat = G.city.seats.find((s) => !s.taken && dist2(s.x, s.z, n.pos.x, n.pos.z) < 20 * 20); if (seat) { seat.taken = true; n.seat = seat; n.state = 'goto'; n.gotoT = { x: seat.x + Math.sin(seat.heading) * 0.5, z: seat.z + Math.cos(seat.heading) * 0.5, then: 'sit', heading: seat.heading, y: seat.y - 0.5 }; return; } }
    n.state = 'idle'; n.stateT = 2 + R() * 4;
  }
  _goto(n, dt, A) {
    const g = n.gotoT; if (!g) { n.state = 'walk'; return; }
    const dx = g.x - n.pos.x, dz = g.z - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { n.state = g.then; n.stateT = g.then === 'help' ? 7 : 20 + R() * 40; n.heading = g.heading ?? n.heading; if (g.y !== undefined) n.pos.y = g.y + 0.5 - 0.5; if (g.then === 'sit') { n.pos.x = g.x - Math.sin(g.heading) * 0.45; n.pos.z = g.z - Math.cos(g.heading) * 0.45; n.pos.y = (g.y ?? 0) + 0.02; } return; }
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 6, dt); n.speed = damp(n.speed, n.walkSpeed, 4, dt);
    n.pos.x += Math.sin(n.heading) * n.speed * dt; n.pos.z += Math.cos(n.heading) * n.speed * dt; n.pos.y = this.game.city.surfaceHeight(n.pos.x, n.pos.z, n.pos.y + 0.5); A.speed = n.speed;
    n.stuckT += dt; if (n.stuckT > 8) { n.stuckT = 0; n.state = 'walk'; if (n.seat) n.seat.taken = false; }
  }
  _flee(n, dt, A) {
    const G = this.game; const f = n.fleeFrom || G.player.pos;
    let a = Math.atan2(n.pos.x - f.x, n.pos.z - f.z) + Math.sin(G.time * 0.7 + n.id) * 0.4;
    n.heading = dampAngle(n.heading, a, 5, dt); n.speed = damp(n.speed, n.walkSpeed, 5, dt);
    const p = { x: n.pos.x + Math.sin(n.heading) * n.speed * dt, z: n.pos.z + Math.cos(n.heading) * n.speed * dt };
    if (G.city.collideCircle(p, 0.3, n.pos.y + 0.1, 1.7)) n.heading += 0.9 * dt * 10;
    n.pos.x = p.x; n.pos.z = p.z; n.pos.y = G.city.surfaceHeight(n.pos.x, n.pos.z, n.pos.y + 0.5);
    A.speed = n.speed;
    if (n.stateT <= 0) { n.state = 'walk'; n.walkSpeed = n.baseWalk; n.route = null; }
  }
  _fight(n, dt, A) {
    const G = this.game, foe = n.foe; if (!foe || (foe.health !== undefined && foe.health <= 0) || foe.down || (foe === G.player && (G.player.state !== 'foot'))) { n.state = n.role === 'thug' ? 'idle' : 'walk'; n.stateT = 3; n.foe = null; return; }
    const dx = foe.pos.x - n.pos.x, dz = foe.pos.z - n.pos.z, d = Math.hypot(dx, dz);
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 8, dt); A.guard = true;
    if (n.health < n.maxHealth * 0.2 && n.role !== 'thug' && n.role !== 'police') { n.flee(foe.pos); return; }
    if (d > 30 && n.role !== 'thug') { n.state = 'walk'; n.foe = null; return; }
    if (n.action) {
      const a = n.action; a.t += dt; a.p = a.t / a.dur; A.action = { name: a.name, p: a.p };
      if (!a.hitDone && a.p >= a.hitAt) { a.hitDone = true; G.combat.resolveAttack(n, a); }
      if (a.p >= 1) n.action = null;
      return;
    }
    n.blocking = foe.action && !foe.action.hitDone && d < 2.2 && R() < (n.role === 'thug' ? 0.5 : 0.3);
    if (n.blocking) A.action = { name: 'block', p: 0.5 };
    const want = 1.15;
    let mv = 0; if (d > want + 0.25) mv = Math.min(n.role === 'police' ? 5.5 : 4.2, (d - want) * 3); else if (d < want - 0.3) mv = -1.2;
    const strafe = Math.sin(G.time * 1.3 + n.id) * (d < 2 ? 0.8 : 0);
    n.pos.x += (Math.sin(n.heading) * mv + Math.cos(n.heading) * strafe) * dt; n.pos.z += (Math.cos(n.heading) * mv - Math.sin(n.heading) * strafe) * dt;
    const p = { x: n.pos.x, z: n.pos.z }; G.city.collideCircle(p, 0.32, n.pos.y + 0.1, 1.7); n.pos.x = p.x; n.pos.z = p.z; n.pos.y = G.city.surfaceHeight(n.pos.x, n.pos.z, n.pos.y + 0.5);
    A.speed = Math.abs(mv) + Math.abs(strafe);
    n.atkT -= dt;
    if (n.atkT <= 0 && d < 1.9 && !n.blocking) {
      n.atkT = (n.role === 'thug' ? 1.0 : 1.5) + R() * 1.2;
      const k = R(); const name = k < 0.45 ? 'jab' : k < 0.75 ? 'cross' : k < 0.9 ? 'hook' : 'kick';
      n.action = { name, t: -0.18, p: 0, dur: name === 'kick' ? 0.75 : 0.5, hitAt: 0.42, side: 'L', heavy: name === 'hook' || name === 'kick', dmgMul: n.role === 'police' ? 1.1 : n.role === 'thug' ? 1.0 : 0.7 };
      G.audio.whoosh(n.pos);
    }
  }
  _arrest(n, dt, A) { // police officer approaching to cuff the player
    const G = this.game, P = G.player, dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, d = Math.hypot(dx, dz);
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 8, dt);
    if (d > 1.4) { const sp = Math.min(5.8, d * 2); n.pos.x += Math.sin(n.heading) * sp * dt; n.pos.z += Math.cos(n.heading) * sp * dt; A.speed = sp; const p = { x: n.pos.x, z: n.pos.z }; G.city.collideCircle(p, 0.32, n.pos.y + 0.1, 1.7); n.pos.x = p.x; n.pos.z = p.z; n.pos.y = G.city.surfaceHeight(n.pos.x, n.pos.z, n.pos.y + 0.5); }
    else { A.speed = 0; A.action = { name: 'push', p: 0.3 }; G.police.tryArrest(n, dt); }
    if (P.action && P.action.name && d < 2) { n.state = 'fight'; n.foe = P; n.atkT = 0.4; }
  }
  _avoid(n, dt) {
    for (const m of this.list) {
      if (m === n || !m.active || m.state === 'down') continue;
      const dx = n.pos.x - m.pos.x, dz = n.pos.z - m.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.5 && d2 > 1e-4) { const d = Math.sqrt(d2), k = (0.7 - d) * 0.5; n.pos.x += dx / d * k; n.pos.z += dz / d * k; }
    }
    const P = this.game.player; const dx = n.pos.x - P.pos.x, dz = n.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
    if (d2 < 0.6 && d2 > 1e-4 && P.state === 'foot') { const d = Math.sqrt(d2), k = (0.78 - d) * 0.6; n.pos.x += dx / d * k; n.pos.z += dz / d * k; if (P.speed > 5 && n.persona !== 'aggressive' && R() < 0.3) this.game.ui.subtitle(n.name, ['Hey, watch it!', 'Whoa!', 'Excuse you!'][Math.floor(R() * 3)], 1.5); }
  }
  _nearestPed(p) { let b = null, bd = 1e9; for (const n of L.pedNodes) { if (!n.ok) continue; const d = dist2(n.x, n.z, p.x, p.z); if (d < bd) { bd = d; b = n; } } return b; }
  _dogFollow(n, dt) {
    const d = n.dog, tgt = { x: n.pos.x + Math.sin(n.heading + 0.6) * 1.2, z: n.pos.z + Math.cos(n.heading + 0.6) * 1.2 };
    const dx = tgt.x - d.root.position.x, dz = tgt.z - d.root.position.z, dist = Math.hypot(dx, dz);
    const sp = dist > 0.4 ? Math.min(5, dist * 2.5) : 0; if (dist > 0.05) d.root.rotation.y = dampAngle(d.root.rotation.y, Math.atan2(dx, dz), 6, dt);
    d.root.position.x += Math.sin(d.root.rotation.y) * sp * dt; d.root.position.z += Math.cos(d.root.rotation.y) * sp * dt; d.root.position.y = n.pos.y;
    d.animate(dt, sp, n.state === 'idle' ? 'sniff' : null); d.root.visible = n.object.visible;
  }
  // player-initiated conversation with an ambient pedestrian
  talkTo(n) {
    const G = this.game; n.memory.met++;
    const lines = {
      friendly: ['Beautiful evening for the boardwalk.', 'Try the cold brew at Sol & Salt, trust me.', 'You new around here? Welcome to San Aurelia!'],
      shy: ['Oh — um, hi.', 'Sorry, I was miles away.', '…Nice to meet you.'],
      nervous: ['Did you hear sirens just now?', 'This city moves too fast for me.', 'Please don\'t stand so close.'],
      confident: ['Name\'s ' + n.name + '. Remember it.', 'If you want a real workout, hit Muscle Shore at sunrise.', 'Neon Row is where the night starts.'],
      aggressive: ['What are you looking at?', 'Keep walking, pal.', 'You want trouble?'],
      suspicious: ['Do I know you?', 'Why are you asking?', 'Hmm. You look like trouble.'],
      wealthy: ['The view from Vista Heights is worth every dollar.', 'My driver is late again.', 'Have you been to the Meridian Tower helipad?'],
      working: ['Double shift today. Coffee is my blood.', 'The port\'s been busy all week.', 'Rent went up again in Laurel Park.'],
      tourist: ['Could you take our picture? Never mind, selfie!', 'Which way to the pier and the ferris wheel?', 'The sunsets here are unreal.'],
      business: ['Can\'t talk, closing a deal.', 'Downtown never sleeps.', 'Ever think about investing in property?'],
    }[n.persona] || ['Hello.'];
    const line = n.memory.met > 1 ? 'Hey, you again! ' + lines[Math.floor(R() * lines.length)] : lines[Math.floor(R() * lines.length)];
    n.state = 'idle'; n.stateT = 5; n.heading = Math.atan2(G.player.pos.x - n.pos.x, G.player.pos.z - n.pos.z);
    n.anim.talk = true; G.ui.subtitle(n.name, line, 3.5); G.speak && G.speak(line, n.a.sex);
    if (n.persona === 'aggressive' && n.memory.met > 1 && R() < 0.5) { n.state = 'fight'; n.foe = G.player; n.atkT = 1.2; G.ui.subtitle(n.name, 'I warned you!', 2); }
    bus.emit('talked', n);
  }
}
