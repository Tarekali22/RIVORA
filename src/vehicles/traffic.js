// Lane-following traffic AI, parked cars, and red-light camera enforcement.
import * as L from '../world/layout.js';
import { TRAFFIC_MIX, VEHICLES } from '../data/vehicles.js';
import { clamp, lerp, damp, R, rng, bus, dist2, wrapAngle, angleDiff } from '../core/util.js';
import { randomAppearance } from '../actors/humanoid.js';

const { nodes, edges, LANE_OFF, ROAD_HALF } = L;
const STOP_T = 10.4; // distance from node centre where front bumper must stop

function laneFrame(e, dir) {
  const S = nodes[dir > 0 ? e.a : e.b], E = nodes[dir > 0 ? e.b : e.a];
  const ux = dir * e.dx, uz = dir * e.dz, rx = -uz, rz = ux;
  return { S, E, ux, uz, rx, rz };
}
function lanePoint(e, dir, t, out = {}) {
  const f = laneFrame(e, dir);
  out.x = f.S.x + f.ux * t + f.rx * LANE_OFF; out.z = f.S.z + f.uz * t + f.rz * LANE_OFF; out.y = L.roadY(out.x, out.z) + 0.02; out.h = Math.atan2(f.ux, f.uz);
  return out;
}
const tStartOf = (e, dir) => (nodes[dir > 0 ? e.a : e.b].edges.length >= 2 ? ROAD_HALF : 0);
const tEndOf = (e, dir) => e.len - (nodes[dir > 0 ? e.b : e.a].edges.length >= 2 ? ROAD_HALF : 0);

export class Traffic {
  constructor(game) {
    this.game = game; this.cars = []; this.pool = new Map(); this.parked = []; this.parkedActive = []; this.t = 0;
    this.max = game.quality.traffic; this.spawnT = 0; this.rand = rng(77);
    this._buildParkingSlots();
    this.enf = { approach: null, lastFine: -99 };
  }
  get count() { return this.cars.length; }
  _take(key, color) {
    const p = this.pool.get(key);
    if (p && p.length) { const v = p.pop(); v.object.visible = true; v.health = 100; v.disabled = false; v.sunk = false; v.setColor(color || v.spec.colors[Math.floor(R() * v.spec.colors.length)]); v.alarm = 0; v.stolen = false; this.game.vehicles.list.push(v); return v; }
    const v = this.game.vehicles.spawn(key, 0, -2000, 0, { color }); return v;
  }
  _recycle(v) {
    const G = this.game; const i = G.vehicles.list.indexOf(v); if (i >= 0) G.vehicles.list.splice(i, 1);
    v.object.visible = false; v.traffic = null; v.kinematic = false; v.driver = null; v.ai = null; v.vel.set(0, 0, 0); v.owner = 'traffic'; v.siren = false;
    if (!this.pool.has(v.key)) this.pool.set(v.key, []); const p = this.pool.get(v.key);
    if (p.length < 4) p.push(v); else v.dispose();
  }
  _pickKey(x, z) {
    const d = L.districtAt(x, z); const mix = TRAFFIC_MIX[d] || TRAFFIC_MIX.default;
    if (R() < 0.05) return 'police';
    let k = mix[Math.floor(R() * mix.length)];
    if (this.game.env.isNight && k === 'citybus' && R() < 0.7) k = 'meridian';
    return k;
  }
  spawnCar(edge, dir, t, key) {
    const G = this.game;
    const p = lanePoint(edge, dir, t);
    key = key || this._pickKey(p.x, p.z);
    const v = this._take(key);
    v.kinematic = true; v.owner = key === 'police' ? 'police' : 'traffic';
    const tc = { v, edge, dir, t, speed: edge.speed * 0.7, state: 'lane', turn: null, aggr: 0.82 + R() * 0.3, honkT: 0, stopT: 0, driverNpc: key === 'police' ? null : randomAppearance(R), wait: 0 };
    v.traffic = tc; v.driver = null;
    v.place(p.x, p.z, p.h, p.y);
    this.cars.push(tc);
    return tc;
  }
  release(v) { // player takes the car or it becomes physics-driven
    const tc = v.traffic; if (!tc) return; const i = this.cars.indexOf(tc); if (i >= 0) this.cars.splice(i, 1);
    v.kinematic = false; v.vel.set(Math.sin(v.heading) * tc.speed, 0, Math.cos(v.heading) * tc.speed); v.traffic = null;
  }
  bump(v, imp) {
    const tc = v.traffic; if (!tc || tc.state === 'bumped') return;
    tc.state = 'bumped'; tc.bumpT = 5; v.kinematic = false; v.vel.set(v.kvx || 0, 0, v.kvz || 0);
    const G = this.game;
    if (imp > 3) { G.audio.horn(v.pos); }
    if (imp > 4 && tc.driverNpc && G.player.state === 'vehicle' && R() < 0.3) { tc.roadRage = true; tc.bumpT = 1.5; }
  }
  update(dt) {
    const G = this.game, P = G.player; this.t = G.time;
    const focus = P.pos;
    const night = G.env.isNight;
    const target = Math.round(this.max * (night ? 0.6 : 1) * (G.interior ? 0 : 1));
    // despawn far cars
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const tc = this.cars[i], v = tc.v;
      if (dist2(v.pos.x, v.pos.z, focus.x, focus.z) > 340 * 340 || (G.interior && !v.driver)) { this.cars.splice(i, 1); this._recycle(v); }
    }
    // spawn
    this.spawnT -= dt;
    if (this.cars.length < target && this.spawnT <= 0 && !G.interior) {
      this.spawnT = 0.15;
      for (let k = 0; k < 6; k++) {
        const e = edges[Math.floor(R() * edges.length)]; const dir = R() < 0.5 ? 1 : -1;
        const t = lerp(tStartOf(e, dir) + 4, tEndOf(e, dir) - STOP_T - 6, R());
        if (t <= 0) continue;
        const p = lanePoint(e, dir, t); const d2 = dist2(p.x, p.z, focus.x, focus.z);
        if (d2 < 90 * 90 || d2 > 300 * 300) continue;
        if (this.cars.some((c) => c.edge === e && c.dir === dir && Math.abs(c.t - t) < 18)) continue;
        this.spawnCar(e, dir, t); break;
      }
    }
    // obstacles (vehicles + pedestrians + player on foot)
    const obs = [];
    for (const v of G.vehicles.list) if (v.object.visible && v.type !== 'heli' && v.type !== 'plane') obs.push({ x: v.pos.x, z: v.pos.z, r: v.W * 0.6, self: v, veh: true, sp: v.kinematic ? v.speed : v.vel.length() });
    if (P.state === 'foot' || P.state === 'down') obs.push({ x: P.pos.x, z: P.pos.z, r: 0.5, player: true });
    for (const n of G.npcs.list) if (n.active && n.onRoad) obs.push({ x: n.pos.x, z: n.pos.z, r: 0.45, ped: true });
    for (const tc of this.cars) this._drive(tc, dt, obs);
    this._parkedUpdate();
    this._enforcement(dt);
  }
  _drive(tc, dt, obs) {
    const G = this.game, v = tc.v;
    if (tc.state === 'bumped' || tc.state === 'wreck') {
      tc.bumpT -= dt;
      if (tc.roadRage && tc.bumpT <= 0 && tc.driverNpc) { tc.roadRage = false; G.npcs.ejectDriver(v, 'rage'); tc.state = 'wreck'; return; }
      if (v.disabled) { if (tc.driverNpc) G.npcs.ejectDriver(v, 'flee'); tc.state = 'wreck'; return; }
      if (tc.state === 'bumped' && tc.bumpT <= 0 && v.vel.length() < 0.5 && tc.driverNpc) {
        const ne = L.nearestEdge(v.pos.x, v.pos.z); if (!ne.edge || ne.d > 6) { tc.state = 'wreck'; return; }
        const e = ne.edge; const dir = Math.abs(angleDiff(v.heading, Math.atan2(e.dx, e.dz))) < Math.PI / 2 ? 1 : -1;
        const t = dir > 0 ? ne.t : e.len - ne.t; tc.edge = e; tc.dir = dir; tc.t = clamp(t, tStartOf(e, dir), tEndOf(e, dir) - 1); tc.turn = null; tc.state = 'lane'; tc.speed = 0; v.kinematic = true;
      }
      return;
    }
    const e = tc.edge, dir = tc.dir;
    let desired = e.speed * tc.aggr * (G.env.w.rain > 0.5 ? 0.85 : 1);
    const tEnd = tEndOf(e, dir);
    const p = {};
    if (!tc.turn) {
      // signals
      const E = nodes[dir > 0 ? e.b : e.a];
      const front = tc.t + v.L / 2, stopAt = e.len - STOP_T;
      if (E.light && front < stopAt + 0.5) {
        const st = L.signalState(E, this.t, e.axis);
        const dist = stopAt - front;
        if (st === 'red' || (st === 'yellow' && dist > tc.speed * tc.speed / 8 + 2)) desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 4 * (dist - 0.3))));
        if (st === 'green' && dist < 1 && tc.speed < 0.5) tc.wait += dt; else tc.wait = 0;
      }
      if (tEnd - tc.t < 18 && tc.nextTurnSharp) desired = Math.min(desired, 7.5);
      if (!tc.next) tc.next = this._chooseNext(e, dir);
      tc.nextTurnSharp = tc.next && tc.next.edge.axis !== e.axis;
    } else desired = Math.min(desired, tc.turn.sharp ? 7 : desired);
    // obstacle ahead
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let gap = 1e9;
    const range = 10 + tc.speed * 2.4;
    for (const o of obs) {
      if (o.self === v) continue;
      const dx = o.x - v.pos.x, dz = o.z - v.pos.z; const f = dx * fx + dz * fz; if (f < 0 || f > range) continue;
      const lat = Math.abs(-dx * fz + dz * fx); const lim = (o.veh ? 1.5 : 1.3) + o.r * 0.5;
      if (lat < lim) gap = Math.min(gap, f - v.L / 2 - o.r);
      if (o.player && lat < 2.5 && f < 14) tc.blockedByPlayer = (tc.blockedByPlayer || 0) + dt;
    }
    if (gap < 1e9) desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 5 * (gap - 2.2))));
    if (gap < 2.5) desired = 0;
    if ((tc.blockedByPlayer || 0) > 3 && R() < dt) { G.audio.horn(v.pos); tc.blockedByPlayer = 0; }
    if (tc.wait > 4 && gap < 12) { G.audio.horn(v.pos); tc.wait = -6; }
    // accelerate
    const acc = desired > tc.speed ? 2.6 : 7.5;
    tc.speed = Math.max(0, tc.speed + clamp(desired - tc.speed, -acc * dt, acc * dt));
    v.brake = desired < tc.speed - 0.3 || tc.speed < 0.2;
    // advance
    const ds = tc.speed * dt;
    if (!tc.turn) {
      tc.t += ds;
      if (tc.t >= tEnd) {
        const nx = tc.next || this._chooseNext(e, dir); tc.next = null;
        if (!nx) { tc.dir = -dir; tc.t = tStartOf(e, -dir); }
        else tc.turn = this._turnCurve(e, dir, nx.edge, nx.dir, tc.t - tEnd);
      }
      lanePoint(tc.edge, tc.dir, Math.min(tc.t, tEndOf(tc.edge, tc.dir)), p);
    }
    if (tc.turn) {
      const T = tc.turn; T.s += ds;
      if (T.s >= T.len) { tc.edge = T.e2; tc.dir = T.d2; tc.t = tStartOf(T.e2, T.d2) + (T.s - T.len); tc.turn = null; lanePoint(tc.edge, tc.dir, tc.t, p); }
      else { const u = T.s / T.len; const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; p.x = a * T.p0.x + b * T.p1.x + c * T.p2.x; p.z = a * T.p0.z + b * T.p1.z + c * T.p2.z; p.y = L.roadY(p.x, p.z) + 0.02; const tx = 2 * (1 - u) * (T.p1.x - T.p0.x) + 2 * u * (T.p2.x - T.p1.x), tz = 2 * (1 - u) * (T.p1.z - T.p0.z) + 2 * u * (T.p2.z - T.p1.z); p.h = Math.atan2(tx, tz); }
    }
    const oh = v.heading;
    v.kvx = (p.x - v.pos.x) / Math.max(dt, 1e-3); v.kvz = (p.z - v.pos.z) / Math.max(dt, 1e-3);
    v.pos.set(p.x, p.y, p.z); v.heading = p.h; v.speed = tc.speed; v.steer = clamp(angleDiff(oh, p.h) / Math.max(dt, 1e-3) * 0.6, -1, 1);
    // gentle slope pitch on the hill road
    if (tc.edge.hill) { const ahead = L.roadY(p.x + Math.sin(p.h) * 2, p.z + Math.cos(p.h) * 2), back = L.roadY(p.x - Math.sin(p.h) * 2, p.z - Math.cos(p.h) * 2); v.pitchAng = Math.atan2(ahead - back, 4); } else v.pitchAng = 0;
    v.rollAng = 0; v.syncObject();
  }
  _chooseNext(e, dir) {
    const E = nodes[dir > 0 ? e.b : e.a];
    const opts = [];
    for (const id of E.edges) {
      if (id === e.id) continue; const e2 = edges[id]; const d2 = e2.a === E.id ? 1 : -1;
      const inA = Math.atan2(dir * e.dx, dir * e.dz), outA = Math.atan2(d2 * e2.dx, d2 * e2.dz), turn = angleDiff(inA, outA);
      const w = Math.abs(turn) < 0.3 ? 6 : turn < 0 ? 3 : 1.5; // right turns (negative) more common than left
      opts.push({ edge: e2, dir: d2, w });
    }
    if (!opts.length) return null;
    let s = opts.reduce((a, o) => a + o.w, 0) * R(); for (const o of opts) { s -= o.w; if (s <= 0) return o; } return opts[0];
  }
  _turnCurve(e1, d1, e2, d2, carry) {
    const p0 = lanePoint(e1, d1, tEndOf(e1, d1)), p2 = lanePoint(e2, d2, tStartOf(e2, d2));
    const f1 = laneFrame(e1, d1), f2 = laneFrame(e2, d2);
    // intersection of the two lane lines
    const den = f1.ux * f2.uz - f1.uz * f2.ux; let p1;
    if (Math.abs(den) < 0.1) p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    else { const t = ((p2.x - p0.x) * f2.uz - (p2.z - p0.z) * f2.ux) / den; p1 = { x: p0.x + f1.ux * t, z: p0.z + f1.uz * t }; }
    let len = 0, px = p0.x, pz = p0.z;
    for (let i = 1; i <= 10; i++) { const u = i / 10, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; const x = a * p0.x + b * p1.x + c * p2.x, z = a * p0.z + b * p1.z + c * p2.z; len += Math.hypot(x - px, z - pz); px = x; pz = z; }
    return { p0, p1, p2, len: Math.max(len, 0.5), s: carry || 0, e2, d2, sharp: Math.abs(den) >= 0.1 };
  }
  // ---------------- parked cars ----------------
  _buildParkingSlots() {
    const r = rng(4242), slots = [];
    for (const e of edges) {
      if (e.hill) continue;
      for (const dir of [1, -1]) {
        for (let t = 20; t < e.len - 20; t += 13) {
          if (r() > 0.32) continue;
          const f = laneFrame(e, dir); const x = f.S.x + f.ux * t + f.rx * 4.95, z = f.S.z + f.uz * t + f.rz * 4.95;
          if (x > 476 || (e.axis === 'ns' && Math.abs(x - 60) < 6.5 && false)) continue;
          if (L.terrainHeight(x, z) < -0.2) continue;
          slots.push({ x, z, h: Math.atan2(f.ux, f.uz), key: r.pick(['meridian', 'pico', 'atlas', 'ion', 'haulmark', 'courier', 'strada', 'valence', 'brawler', 'dune', 'kestrel', 'zipp', 'meridian', 'pico']), color: null, v: null, gone: false });
        }
      }
    }
    const lots = this.game.city.parkingSpots;
    for (const lot of lots) for (let i = 0; i < 6; i++) { const x = lot.x - lot.w / 2 + 4 + (i % 3) * (lot.w / 3), z = lot.z - lot.d / 2 + 6 + Math.floor(i / 3) * (lot.d - 12); if (r() < 0.6) slots.push({ x, z, h: Math.floor(i / 3) ? Math.PI : 0, key: r.pick(['meridian', 'pico', 'atlas', 'ion', 'courier', 'haulmark']), v: null, gone: false }); }
    this.parked = slots;
  }
  _parkedUpdate() {
    const G = this.game, P = G.player.pos;
    this._pt = (this._pt || 0) + 1; if (this._pt % 15) return;
    for (const s of this.parked) {
      if (s.gone) continue;
      const d2 = dist2(s.x, s.z, P.x, P.z);
      if (!s.v && d2 < 150 * 150 && !G.interior) {
        if (this.parkedActive.length >= this.game.quality.parked) continue;
        const v = this._take(s.key, s.color); v.owner = 'parked'; v.kinematic = false; v.place(s.x, s.z, s.h); s.v = v; v.slot = s; s.color = v.color; this.parkedActive.push(s);
      } else if (s.v && (d2 > 190 * 190 || G.interior)) {
        const v = s.v;
        if (v.owner !== 'parked' || v.driver || v.vel.lengthSq() > 0.1 || v.health < 100 || dist2(v.pos.x, v.pos.z, s.x, s.z) > 4) { s.gone = true; s.v = null; v.slot = null; this.parkedActive.splice(this.parkedActive.indexOf(s), 1); if (!v.driver && v.owner !== 'player') this._recycle(v); continue; }
        s.v = null; v.slot = null; this.parkedActive.splice(this.parkedActive.indexOf(s), 1); this._recycle(v);
      }
    }
  }
  // ---------------- red-light camera enforcement ----------------
  _enforcement(dt) {
    const G = this.game, P = G.player;
    if (P.state !== 'vehicle' || !P.vehicle || P.vehicle.type === 'heli' || P.vehicle.type === 'plane' || P.vehicle.type === 'boat') { this.enf.approach = null; return; }
    const v = P.vehicle, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    // find the lit node we are approaching along an axis-aligned road
    let best = null;
    for (const n of nodes) {
      if (!n.light) continue;
      const dx = n.x - v.pos.x, dz = n.z - v.pos.z; if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      const along = dx * fx + dz * fz; const lat = Math.abs(-dx * fz + dz * fx);
      if (along > 0 && along < 35 && lat < ROAD_HALF + 1) { const axis = Math.abs(fx) > Math.abs(fz) ? 'ew' : 'ns'; if (!best || along < best.along) best = { n, along, axis }; }
    }
    const prev = this.enf.approach;
    if (best && prev && prev.n === best.n) {
      // crossed the stop line this frame?
      if (prev.along > STOP_T - 0.2 && best.along <= STOP_T - 0.2 && Math.abs(v.speed) > 2) {
        const st = G.signal(best.n, this.t, best.axis);
        const turnedRedFor = G._forceRed === best.n.id ? 5 : this._redFor(best.n, best.axis);
        if (st === 'red' && turnedRedFor > 0.6) {
          bus.emit('redlight', { node: best.n, camera: best.n.camera, pos: v.pos.clone() });
          if (best.n.camera === 'active') {
            const where = streetCorner(best.n);
            G.economy.fine(250, `Red-light camera · ${where}`);
            G.audio.ui('shutter'); G.ui.flash(); G.ui.toast('Traffic fine $250', `Red-light camera at ${where} recorded your plate.`, 'bad', 4);
            G.phone && G.phone.addMessage('SAPD Traffic', `Notice of violation: red light at ${where}. A $250 fine was charged to your bank account.`, { system: true });
          }
        }
      }
    }
    this.enf.approach = best ? { n: best.n, along: best.along } : null;
  }
  _redFor(n, axis) { // seconds since the signal turned red for this axis
    let k = 0; while (k < 20 && L.signalState(n, this.t - k * 0.1, axis) === 'red') k++; return k * 0.1;
  }
}
export function streetCorner(n) {
  const a = n.ix >= 0 ? L.AVE_NAMES[n.ix] : 'Vista Dr', s = n.iz >= 0 ? L.ST_NAMES[n.iz] : '';
  return s ? `${a} & ${s}` : a;
}
export { lanePoint, laneFrame };
