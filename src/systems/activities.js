// Activities: eating, gym training with stat gains, dancing, skydiving, EV charging, smoking, first aid.
import { clamp, R, bus, lerp } from '../core/util.js';
import * as L from '../world/layout.js';

const GYM = {
  bench: { stats: { strength: 0.35 }, label: 'Bench press', pose: 'bench', cam: 3.2 },
  pullup: { stats: { strength: 0.25, endurance: 0.15 }, label: 'Pull-ups', pose: 'pullup', cam: 3.4 },
  squat: { stats: { strength: 0.25, stamina: 0.15 }, label: 'Squats', pose: 'squat', cam: 3.4 },
  dumbbell: { stats: { strength: 0.3 }, label: 'Dumbbell curls', pose: 'dumbbell', cam: 3 },
  pushup: { stats: { endurance: 0.35 }, label: 'Push-ups', pose: 'pushup', cam: 3.2 },
  treadmill: { stats: { stamina: 0.4 }, label: 'Treadmill', pose: 'treadmill', cam: 3.6, hold: true },
  bike: { stats: { stamina: 0.25, recovery: 0.15 }, label: 'Stationary bike', pose: 'bike', cam: 3.4, hold: true },
  stretch: { stats: { recovery: 0.4 }, label: 'Stretching', pose: 'stretch', cam: 3.2, hold: true },
};
const GEAR = {};
function gear(kind) {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 }), plate = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
  if (kind === 'bar') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.7, 8), steel); b.rotation.z = Math.PI / 2; g.add(b); for (const s of [-0.68, 0.68]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), plate); p.rotation.z = Math.PI / 2; p.position.x = s; g.add(p); } }
  else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), steel); b.rotation.x = Math.PI / 2; g.add(b); for (const s of [-0.12, 0.12]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), plate); p.rotation.x = Math.PI / 2; p.position.z = s; g.add(p); } }
  return g;
}
export class Activities {
  constructor(game) { this.game = game; }
  consume(it) {
    const G = this.game, P = G.player;
    const sit = P.state === 'sit';
    P.holdItem(it.kind === 'drink' ? 'drink' : 'eat'); P.eating = true;
    G.ui.toast(it.name, `+${it.hp || 0} health · +${it.st || 0} stamina`, 'good', 2.5);
    const dur = 5000; const h0 = P.health;
    let t = 0; const iv = setInterval(() => { t += 250; P.health = Math.min(P.maxHealth, P.health + (it.hp || 0) / (dur / 250)); P.stamina = Math.min(P.maxStamina, P.stamina + (it.st || 0) / (dur / 250)); if (t >= dur) { clearInterval(iv); P.dropItem(); P.eating = false; bus.emit('ate', it.id); } }, 250);
    if (G.interiorId === 'cafe' && !sit) G.ui.hint('Tip: take a seat (E near a chair) to enjoy your meal', 4);
  }
  // ---------------- gym ----------------
  startGym(kind, p) {
    const G = this.game, P = G.player, def = GYM[kind]; if (!def || P.state !== 'foot') return;
    if ((G.gymToday || 0) >= 40) { G.ui.toast('Muscles are spent', 'Rest or sleep before training again.', 'warn'); return; }
    // position the body on the equipment
    const h = p.h ?? p.rot ?? 0, head = kind === 'bench' ? Math.PI + h : h, fx = Math.sin(head), fz = Math.cos(head);
    let x = p.x, z = p.z; const y = G.city.surfaceHeight(p.x, p.z, P.pos.y + 0.5);
    if (kind === 'bench') { x += fx * 0.85; z += fz * 0.85; }
    if (kind === 'pullup') { x += fx * 0.7; z += fz * 0.7; }
    if (kind === 'pushup') { x -= fx * 1.0; z -= fz * 1.0; }
    P.teleport(x, y, z, head); P.state = 'activity';
    if (kind === 'bench' || kind === 'squat') P.h.hold('item', gear('bar'), 'handR', [0.27, -0.06, 0.0]);
    if (kind === 'dumbbell') { P.h.hold('item', gear('db'), 'handR', [0, -0.07, 0]); P.h.hold('item2', gear('db'), 'handL', [0, -0.07, 0]); }
    let rep = 0, reps = 0, sets = 0, prog = 0, phase = 0, auto = 0;
    const target = def.hold ? 0 : 8;
    const self = this;
    P.activity = { kind: def.pose, rep: 0, cam: def.cam, update(dt, input, anim) {
      if (input.pressed('interact') || input.move().mag > 0.6 && !def.hold) { self.stopActivity(); return; }
      if (def.hold) {
        const on = input.down('sprint') || input.down('jump') || input.down('forward') || input.down('punch') || G.ui.touch;
        if (on && P.stamina > 3) { phase += dt; P.stamina -= dt * (kind === 'stretch' ? -6 : 7); P.exert = Math.min(1, P.exert + dt * 0.1); prog += dt; }
        this.rep = (this.rep + dt * (kind === 'stretch' ? 0.2 : 0.8)) % 1;
        if (prog >= 10) { prog = 0; self._gain(def, kind); }
        G.ui.hint(`${def.label}: hold SPRINT/SPACE to train · ${Math.round(prog * 10)}% · E to stop`, 0.3);
        if (kind === 'bike') anim.mode = 'sit', anim.sitH = 0.85;
        return;
      }
      // rep-based: press JUMP/PUNCH on each rep; tempo matters
      if (rep > 0) { rep += dt * 1.15; if (rep >= 1) { rep = 0; reps++; G.audio.metalClank(P.pos); if (reps >= target) { reps = 0; sets++; self._gain(def, kind); } } }
      else if (input.pressed('jump') || input.pressed('punch')) { if (P.stamina > 6) { rep = 0.001; P.stamina -= 6; P.exert = Math.min(1, P.exert + 0.04); if (R() < 0.3) G.audio.human('grunt', P.pos, 1.1); } else G.ui.hint('Too tired — catch your breath', 1); }
      this.rep = rep;
      G.ui.hint(`${def.label}: press SPACE for each rep · ${reps}/${target} · sets ${sets} · E to stop`, 0.3);
    } };
    G.audio.ui('click');
  }
  _gain(def, kind) {
    const G = this.game, P = G.player; G.gymToday = (G.gymToday || 0) + 1;
    const parts = [];
    for (const [k, v] of Object.entries(def.stats)) { const before = P.stats[k]; P.stats[k] = Math.min(100, P.stats[k] + v * (1 - P.stats[k] / 120)); parts.push(`${k} +${(P.stats[k] - before).toFixed(2)}`); }
    G.audio.ui('stat'); G.ui.toast('Set complete', parts.join(' · '), 'good', 2.5); bus.emit('rep', kind);
    // gradual physique change
    const b = clamp(0.4 + P.stats.strength / 140, 0, 1); if (Math.abs(b - P.a.build) > 0.04) { P.a.build = b; P.h.setAppearance(P.a); }
  }
  stopActivity() { const G = this.game, P = G.player; P.h.drop('item'); P.h.drop('item2'); P.activity = null; P.state = 'foot'; P.pos.y = G.city.surfaceHeight(P.pos.x, P.pos.z, P.pos.y + 1); P.pos.x += Math.sin(P.heading) * 0.8; P.pos.z += Math.cos(P.heading) * 0.8; }
  // ---------------- nightclub ----------------
  startDance() {
    const G = this.game, P = G.player; if (P.state !== 'foot') return; P.state = 'activity'; let style = 0, vibe = 0, last = -1;
    P.activity = { kind: 'dance', cam: 4.2, update(dt, input, anim) {
      if (input.pressed('interact') || input.move().mag > 0.6) { P.activity = null; P.state = 'foot'; return; }
      const beatT = G.time * 2.03; anim.beat = beatT; anim.style = style; const onBeat = Math.abs(beatT - Math.round(beatT)) < 0.14;
      if (input.pressed('jump') || input.pressed('punch')) { if (onBeat && Math.round(beatT) !== last) { vibe = Math.min(100, vibe + 8); last = Math.round(beatT); } else vibe = Math.max(0, vibe - 4); style = (style + (R() < 0.3 ? 1 : 0)) % 3; }
      vibe = Math.max(0, vibe - dt * 1.5);
      if (vibe >= 100) { vibe = 0; G.economy.reputation += 5; G.ui.toast('The crowd loves it', 'Reputation +5', 'good'); bus.emit('danced'); }
      G.ui.hint(`Dance: tap SPACE on the beat · vibe ${Math.round(vibe)}% · E to stop`, 0.3);
    } };
  }
  // ---------------- skydiving ----------------
  async skydive() {
    const G = this.game, P = G.player; await G.ui.fade(true);
    const plane = G.vehicles.spawn('aerolite', 300, 220, -Math.PI / 2 - 0.3, { owner: 'mission', y: 700 }); plane.driver = 'ai'; plane.throttleP = 0.8; plane.speed = 40; plane.ai = () => ({ throttle: 0, yaw: 0, pitch: 0, boost: 1 });
    P.teleport(plane.pos.x + 3, 699, plane.pos.z, plane.heading); P.state = 'freefall'; P.vel.set(Math.sin(plane.heading) * 30, 0, Math.cos(plane.heading) * 30);
    G.missions.start(G.missions.defSkydive());
    G.missions.track(Object.assign(plane, { isVehicle: true }));
    G.cam.snapBehind(); await G.ui.fade(false);
    G.ui.big('JUMP!', 'Steer with WASD · SPACE opens the parachute', '#fff', 3);
  }
  // ---------------- EV charging ----------------
  async charge(pt) {
    const G = this.game, P = G.player;
    const v = G.vehicles.list.find((q) => q.battery != null && Math.hypot(q.pos.x - pt.x, q.pos.z - pt.z) < 7 && !q.kinematic);
    if (!v) { G.ui.toast('EV charger', 'Park an electric vehicle next to the charger first.', 'warn'); return; }
    const need = 100 - v.battery; if (need < 1) { G.ui.toast('EV charger', 'Battery already full.', 'info'); return; }
    const cost = Math.ceil(need * 0.3);
    if (!G.economy.pay(cost, 'EV charging')) return;
    if (P.vehicle === v) G.vehicles.exit(true);
    await G.ui.fade(true); G.env.setHour(G.env.hour + need / 100 * 0.75); v.battery = 100; await G.ui.fade(false);
    G.ui.toast('Charged', `Battery 100% · ${need.toFixed(0)}% added`, 'good'); bus.emit('charged');
  }
  // ---------------- bag ----------------
  smoke() {
    const G = this.game, E = G.economy, P = G.player;
    if (!G.settings.smoking) { G.ui.toast('Smoking disabled', 'Enable optional smoking content in Settings → Gameplay.', 'info'); return; }
    if (E.inventory.cigs <= 0 || !E.inventory.lighter) { G.ui.toast('Nothing to smoke', 'Buy cigarettes and a lighter at Quik Corner.', 'info'); return; }
    if (P.state !== 'foot') return; E.inventory.cigs--; P.holdItem('smoke'); G.ui.hint('Smoking · press E to put it out', 3); bus.emit('smoked');
  }
  medkit() { const G = this.game, E = G.economy, P = G.player; if (E.inventory.medkit <= 0) return; E.inventory.medkit--; P.health = Math.min(P.maxHealth, P.health + 60); G.ui.toast('First aid', '+60 health', 'good'); }
}
