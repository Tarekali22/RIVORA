// Mission framework + content. Every mission has real objectives, fail states and rewards.
import { CONTACTS, SKYDIVE_PRICE } from '../data/content.js';
import { uniformAppearance, randomAppearance } from '../actors/humanoid.js';
import * as L from '../world/layout.js';
import { clamp, dist, R, bus, fmtMoney, angleDiff, dist2 } from '../core/util.js';
import { prim } from '../core/geo.js';
const FEMALE = new Set(['Rosa', 'Mila', 'Mona', 'Sofia', 'Leila', 'Maya', 'Nadia', 'Hana', 'Noor', 'Yara', 'Priya', 'Olivia', 'Mia', 'Amara', 'Chloe', 'Imani', 'Lucia', 'Zara', 'Elena', 'Talia', 'Iris', 'Camila', 'Bea', 'Ines', 'Dispatch']); // voice selection for mission speakers

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export class Missions {
  constructor(game) {
    this.game = game; this.active = null; this.done = new Set(); this.best = {}; this.objectiveText = ''; this.ents = []; this.flags = {};
    // 3D beacon for the current objective
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 30; const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    g.add(beam, ring); g.visible = false; game.scene.add(g); this.beacon = g; this.ring = ring;
    bus.on('wasted', () => this.active && this.fail('You were taken out.'));
    bus.on('busted', () => this.active && this.fail('You were arrested.'));
  }
  // ---------------- framework ----------------
  say(who, line, sec) { const G = this.game; sec = sec || Math.max(2.4, line.length * 0.055); if (G.testFast) sec *= 0.03; G.ui.subtitle(who, line, sec); if (G.speak) G.speak(line, this.sexOf(who), who); return wait(sec * 1000); }
  sexOf(who) { const G = this.game; if (G.player && who === G.player.name) return (G.player.a && G.player.a.sex) || 'm'; return FEMALE.has(String(who || '').split(' ')[0]) ? 'f' : 'm'; }
  async talk(lines) { for (const [w, l] of lines) { if (!this.game.running) return; await this.say(w, l); } }
  start(def) {
    if (this.active) { this.game.ui.toast('Already on a job', 'Finish or quit your current mission first (Pause menu).', 'warn'); return false; }
    this.active = def; def.i = -1; def.t = 0; def.data = def.data || {}; this.game.audio.ui('mission');
    this.game.ui.big(def.title.toUpperCase(), def.kind === 'story' ? 'Story mission' : def.kind === 'contract' ? 'Contract' : 'Activity', '#ffb35c', 3);
    bus.emit('missionStart', def.id); this.next(); return true;
  }
  next() {
    const m = this.active; if (!m) return; m.i++; m.stepT = 0;
    if (m.i >= m.steps.length) return this.complete();
    const s = m.steps[m.i]; this.objectiveText = typeof s.text === 'function' ? s.text() : s.text; this.game.ui.objective(this.objectiveText, m.kind === 'story' ? 'STORY' : m.kind === 'contract' ? 'CONTRACT' : 'ACTIVITY');
    if (s.start) s.start(m); bus.emit('missionStep', m.id, m.i);
  }
  complete() {
    const G = this.game, m = this.active; this.active = null; this.done.add(m.id); this.cleanup();
    G.ui.objective(''); const reward = typeof m.reward === 'function' ? m.reward(m) : m.reward || 0;
    if (reward) G.economy.earn(reward, 'Mission: ' + m.title);
    G.audio.ui('mission'); G.ui.big('MISSION PASSED', reward ? `${m.title} · ${fmtMoney(reward)}` : m.title, '#ffd166', 4);
    // medals (bronze / silver / gold) and optional objectives
    const medal = typeof m.medal === 'function' ? m.medal(m) : null; const rank = { bronze: 1, silver: 2, gold: 3 };
    if (medal) { const k = m.id + ':medal', prev = this.best[k]; if (!prev || rank[medal] > rank[prev]) this.best[k] = medal; }
    const opts = (m.optional || []).map((o) => ({ text: o.text, ok: !!o.ok(m) }));
    if (opts.some((o) => o.ok) && m.bonus) { const b = opts.filter((o) => o.ok).length * m.bonus; G.economy.earn(b, 'Mission bonus: ' + m.title); m._bonus = b; }
    this.summary(m, reward, medal, opts);
    if (m.onComplete) m.onComplete(m); bus.emit('missionComplete', m.id, reward); G.autosave('mission');
  }
  fail(reason) {
    const G = this.game, m = this.active; if (!m) return; this.active = null; this.cleanup(); G.ui.objective('');
    G.audio.ui('fail'); G.ui.big('MISSION FAILED', reason, '#ff4d5e', 4); if (m.onFail) m.onFail(m); bus.emit('missionFail', m.id, reason);
  }
  quit() { if (this.active) this.fail('You walked away from the job.'); }
  // completion card: medal, time, optional objectives, reward (non-blocking)
  summary(m, reward, medal, opts) {
    const G = this.game, ar = document.body.classList.contains('rtl'), el = document.createElement('div'); el.className = 'msum';
    const md = { gold: ['🥇', ar ? 'ذهبية' : 'Gold'], silver: ['🥈', ar ? 'فضية' : 'Silver'], bronze: ['🥉', ar ? 'برونزية' : 'Bronze'] }[medal];
    const tl = (o) => (typeof o === 'string' ? o : ar ? o.ar : o.en);
    el.innerHTML = `<div class="ms-h"></div><div class="ms-t"></div>${md ? `<div class="ms-m">${md[0]} <b>${md[1]}</b></div>` : ''}<div class="ms-r"></div><ul class="ms-o"></ul>`;
    el.querySelector('.ms-h').textContent = ar ? 'نجحت المهمة' : 'MISSION PASSED'; el.querySelector('.ms-t').textContent = (typeof m.title === 'object' ? tl(m.title) : m.title) + ' · ' + Math.round(m.t || 0) + (ar ? ' ث' : 's');
    el.querySelector('.ms-r').textContent = (reward ? fmtMoney(reward) : '') + (m._bonus ? ` + ${fmtMoney(m._bonus)} ${ar ? 'مكافأة' : 'bonus'}` : '');
    const ul = el.querySelector('.ms-o'); for (const o of opts) { const li = document.createElement('li'); li.textContent = (o.ok ? '✓ ' : '✗ ') + tl(o.text); li.className = o.ok ? 'ok' : 'no'; ul.appendChild(li); }
    (document.getElementById('hud') || document.body).appendChild(el); setTimeout(() => el.classList.add('out'), G.testFast ? 300 : 7000); setTimeout(() => el.remove(), G.testFast ? 600 : 7600);
  }
  track(e) { this.ents.push(e); return e; }
  cleanup() {
    const G = this.game;
    for (const e of this.ents) { if (e.isNPC) { if (e.active) { e.persistent = false; if (e.state === 'fight') e.state = 'walk'; } } else if (e.isVehicle) { if (G.player.vehicle !== e && !e.keep) G.vehicles.remove(e); } else if (e.isMesh || e.isGroup) G.scene.remove(e); }
    this.ents = []; this.beacon.visible = false; G.ui.hint('', 0);
  }
  marker() { const m = this.active; if (!m || m.i < 0) return null; const s = m.steps[m.i]; const mk = s && s.marker ? s.marker(m) : null; return mk; }
  extraMarkers() { const m = this.active; if (!m || m.i < 0) return []; const s = m.steps[m.i]; return s && s.extra ? s.extra(m) : []; }
  update(dt) {
    const G = this.game; const m = this.active;
    this._timers(dt);
    if (!m) { this.beacon.visible = false; return; }
    m.stepT += dt; m.t = (m.t || 0) + dt; m.hpMin = Math.min(m.hpMin ?? 1e9, G.player.health); const s = m.steps[m.i];
    if (s.update) { const r = s.update(dt, m); if (r === 'done') this.next(); else if (typeof r === 'string' && r.startsWith('fail:')) this.fail(r.slice(5)); }
    const mk = this.marker();
    if (mk && !G.interior) { this.beacon.visible = true; this.beacon.position.set(mk.x, mk.y ?? G.city.surfaceHeight(mk.x, mk.z, 300), mk.z); this.ring.rotation.z += dt; this.ring.scale.setScalar(mk.r ? mk.r / 2.4 : 1); }
    else this.beacon.visible = false;
    if (mk && m.showDist !== false) { const d = Math.round(dist(G.player.pos.x, G.player.pos.z, mk.x, mk.z)); const t = this.objectiveText + (d > 12 ? ` · ${d} m` : '') + (m.timer != null ? ` · ${Math.max(0, m.timer).toFixed(0)}s` : ''); if (this._lastObj !== t) { this._lastObj = t; G.ui.objective(t, m.kind === 'story' ? 'STORY' : m.kind === 'contract' ? 'CONTRACT' : 'ACTIVITY'); } }
  }
  near(p, r) { const P = this.game.player.pos; return dist2(P.x, P.z, p.x, p.z) < r * r; }
  // ---------------- scheduled story beats ----------------
  _timers(dt) {
    const G = this.game, f = this.flags;
    if (!G.running || G.cutscene) return;
    f.t = (f.t || 0) + dt;
    if (!this.done.has('homecoming') && !this.active && !f.daniCalled && f.t > (f.introDone ? 12 : 9999)) { f.daniCalled = true; this.offerHomecoming(); }
    if (this.done.has('homecoming') && !this.done.has('collector') && !this.active && !f.valeCalled && f.t > (f.homeDoneT || 0) + 60) { f.valeCalled = true; this.offerCollector(); }
    if (this.done.has('homecoming') && !f.kaiText && f.t > (f.homeDoneT || 0) + 150) { f.kaiText = true; G.contacts.add('kai'); G.phone.addMessage('kai', `Kai here from Muscle Shore — Dani says you're back. Come train on the beach: bench, pull-ups, squats. Strength pays off in this city.`, { coords: { x: 528, z: 150, label: 'Muscle Shore' } }); }
    if (this.done.has('homecoming') && !f.milaText && f.t > (f.homeDoneT || 0) + 260) { f.milaText = true; G.contacts.add('mila'); G.phone.addMessage('mila', 'Mila, Coral Beach lifeguards. We could use a volunteer with a jet ski when swimmers get into trouble. Check Jobs → Lifeguard rescue.'); }
    if (this.done.has('homecoming') && !f.jetText && f.t > (f.homeDoneT || 0) + 360) { f.jetText = true; G.contacts.add('jet'); G.phone.addMessage('jet', 'Heard you can drive. Coastline Sprint — Ocean Blvd up to Vista Heights. Beat my time. Jobs → Coastline Sprint.'); }
  }
  onCallContact(id) {
    if (id === 'dani' && !this.done.has('homecoming') && !this.active) return () => this.homecomingCall();
    if (id === 'vale' && this.done.has('homecoming') && !this.done.has('collector') && !this.active) return () => this.collectorCall();
    return null;
  }
  smallTalk(id) {
    const t = { dani: ['The garage is quiet without you causing trouble.', 'Stop by anytime — repairs are on me for friends. Well, half price.'], vale: ['I only call when there\'s money involved.', 'Patience. Work finds people like you.'], rosa: ['Table by the window is yours.'], kai: ['Hydrate, stretch, repeat.', 'Sunrise sessions are the best.'], mila: ['Water\'s calm today. Stay safe out there.'], jet: ['Think you can beat my time? Prove it.'] }[id] || ['…'];
    return t[Math.floor(R() * t.length)];
  }
  // ---------------- HOMECOMING ----------------
  offerHomecoming() {
    const G = this.game; G.contacts.add('dani');
    G.phone.ring('dani', () => this.homecomingCall(), (k) => { G.phone.addMessage('dani', 'Hey! Call me back when you get this. Need your help with something. — Dani'); });
  }
  async homecomingCall() {
    await this.talk([['Dani', 'You\'re really back in San Aurelia? Man, it\'s good to hear your voice.'], ['Dani', 'Listen — I\'m in a bit of a mess. Meet me at Sol & Salt on the boardwalk.'], ['Dani', 'Your old pickup is parked outside your place. Keys are in it.']]);
    this.start(this.defHomecoming());
  }
  defHomecoming() {
    const G = this.game, me = this; const cafe = L.POI.cafe, yard = G.city.warehouseYard, garage = L.POI.garage;
    return {
      id: 'homecoming', title: 'Homecoming', kind: 'story', reward: 2500,
      onComplete: () => { G.relations.dani = (G.relations.dani || 0) + 20; me.flags.homeDoneT = me.flags.t; G.phone.addMessage('dani', 'Owe you big. The garage is yours for repairs and paint anytime. And hey — a guy named Vale asked about you. Careful with him.'); },
      steps: [
        { text: 'Meet Dani at Sol & Salt Café on the boardwalk', marker: () => ({ x: cafe.x + 3, z: cafe.z, label: 'Sol & Salt' }),
          start: (m) => { const d = G.npcs.spawnAt(cafe.x + 2.6, cafe.z - 10.6, 'ped', { ...randomAppearance(R, { sex: 'm' }), top: { type: 'jacket', color: '#f2b134' }, bottom: { type: 'jeans', color: '#2c3a52' }, hair: { style: 'curly', color: '#1b1512' }, skin: '#9a6a4f', facial: 'short' }, { persistent: true, heading: Math.PI, state: 'idle', t: 9999 }); d.name = 'Dani'; d.fixed = 'staff'; d.isNPC = true; m.data.dani = me.track(d); },
          update: (dt, m) => { const d = m.data.dani; if (d && d.active) { d.state = 'idle'; d.stateT = 99; } if (me.near(cafe, 9)) return 'done'; } },
        { text: 'Talk to Dani (press E)', marker: (m) => m.data.dani && ({ x: m.data.dani.pos.x, z: m.data.dani.pos.z }),
          start: (m) => { G.interactTargets.push({ id: 'dani', label: 'Talk to Dani', get x() { return m.data.dani.pos.x; }, get z() { return m.data.dani.pos.z; }, r: 2.5, act: async () => { G.interactTargets = G.interactTargets.filter((t) => t.id !== 'dani'); m.data.talked = true; const d = m.data.dani; d.state = 'staff'; d.talking = true; await G.cutTalk(d, [['Dani', 'Some crew — the Harbor Saints — jacked my delivery van last night. All my stock was in it.'], ['Dani', 'The tracker puts it at the Pier 9 yard in Foundry Port. Three of them hanging around.'], ['You', 'I\'ll get it back. Quietly if I can.'], ['Dani', 'Bring it to my garage in Mercado. And… be careful.']]); d.talking = false; m.data.ready = true; } }); },
          update: (dt, m) => (m.data.ready ? 'done' : null) },
        { text: 'Go to the Pier 9 yard in Foundry Port', marker: () => ({ x: yard.x, z: yard.z + 10, label: 'Pier 9' }),
          start: (m) => {
            const van = G.vehicles.spawn('courier', yard.x - 6, yard.z + 8, Math.PI / 2, { color: '#f2b134', owner: 'mission' }); van.isVehicle = true; m.data.van = me.track(van);
            m.data.thugs = []; for (const [dx, dz] of [[4, 6], [-12, 14], [2, 18]]) { const t = G.npcs.spawnAt(yard.x + dx, yard.z + dz, 'thug', null, { persistent: true, state: 'idle', t: 9999 }); t.hostile = true; t.isNPC = true; t.guard = { x: t.pos.x, z: t.pos.z }; m.data.thugs.push(me.track(t)); }
            G.ui.hint('Tip: crouch (C) to sneak — the crew notices you less', 6);
          },
          update: (dt, m) => { me._thugs(m, dt); if (me.near(yard, 45)) return 'done'; } },
        { text: 'Take back Dani\'s van (fight or sneak in)', marker: (m) => ({ x: m.data.van.pos.x, z: m.data.van.pos.z }),
          extra: (m) => m.data.thugs.filter((t) => t.active && !t.down).map((t) => ({ x: t.pos.x, z: t.pos.z, c: '#ef4444', r: 3 })),
          update: (dt, m) => { me._thugs(m, dt); if (m.data.van.health <= 0) return 'fail:The van was wrecked.'; if (G.player.vehicle === m.data.van) return 'done'; } },
        { text: 'Deliver the van to Navarro Garage', marker: () => ({ x: garage.x, z: garage.z - 8, label: 'Navarro Garage', r: 4 }),
          start: (m) => { m.data.van.owner = 'player'; const alerted = m.data.thugs.some((t) => t.active && !t.down && t.state === 'fight') || m.data.alerted; if (alerted || R() < 0.7) { const P = G.player.pos; const car = G.vehicles.spawn('brawler', yard.x + 30, yard.z + 30, 0, { color: '#5a0a0a', owner: 'mission' }); car.isVehicle = true; me.track(car); car.ai = () => me._chaseAI(car); m.data.chaser = car; G.ui.toast('Harbor Saints', 'They\'re coming after the van!', 'bad', 3); } },
          extra: (m) => (m.data.chaser && !m.data.chaser.disabled ? [{ x: m.data.chaser.pos.x, z: m.data.chaser.pos.z, c: '#ef4444', r: 4 }] : []),
          update: (dt, m) => { const v = m.data.van; if (v.health <= 0) return 'fail:The van was wrecked.'; if (G.player.vehicle !== v && dist(G.player.pos.x, G.player.pos.z, v.pos.x, v.pos.z) > 120) return 'fail:You abandoned the van.'; if (dist(v.pos.x, v.pos.z, garage.x, garage.z - 8) < 9 && Math.abs(v.speed) < 3) return 'done'; if (G.player.vehicle !== v) G.ui.hint('Get back in the van', 0.3); } },
        { text: 'Hand over the van', start: async (m) => { const v = m.data.van; if (G.player.vehicle === v) G.vehicles.exit(true); v.keep = false; const d = G.npcs.spawnAt(garage.x + 3, garage.z - 3, 'ped', m.data.dani ? m.data.dani.a : null, { persistent: true, heading: Math.PI }); d.isNPC = true; me.track(d); d.state = 'staff'; d.talking = true; await G.cutTalk(d, [['Dani', 'You actually did it! Not a scratch… well, a few scratches.'], ['Dani', 'Here — your cut. And welcome home, for real this time.']]); m.data.over = true; }, update: (dt, m) => (m.data.over ? 'done' : null) },
      ],
    };
  }
  _thugs(m, dt) {
    const G = this.game, P = G.player;
    for (const t of m.data.thugs) {
      if (!t.active || t.down) continue;
      if (t.state === 'fight') continue;
      const d = dist(t.pos.x, t.pos.z, P.pos.x, P.pos.z); const vis = P.crouch ? 8 : P.state === 'vehicle' ? 22 : 18;
      const facing = Math.abs(angleDiff(t.heading, Math.atan2(P.pos.x - t.pos.x, P.pos.z - t.pos.z))) < 1.0;
      t.heading += Math.sin(G.time * 0.5 + t.id) * dt * 0.6; // look around
      if (d < vis && (facing || d < 3) && G.city.segmentClear(t.pos.x, 1.6, t.pos.z, P.pos.x, P.pos.y + 1.2, P.pos.z) > 0.97) {
        m.data.alerted = true; for (const o of m.data.thugs) if (o.active && !o.down) { o.state = 'fight'; o.foe = P; o.atkT = 0.6 + R(); }
        G.ui.subtitle('Harbor Saint', ['Hey! Who are you?', 'That\'s our van now, friend.', 'Get him!'][Math.floor(R() * 3)], 2.5); break;
      }
    }
  }
  _chaseAI(car) {
    const G = this.game, P = G.player; const T = P.state === 'vehicle' ? P.vehicle.pos : P.pos;
    const want = Math.atan2(T.x - car.pos.x, T.z - car.pos.z), err = angleDiff(car.heading, want), d = dist(T.x, T.z, car.pos.x, car.pos.z);
    car._st = (car._st || 0) + 1 / 60; if (car._st > 2) { car._st = 0; if (car._lp && car._lp.distanceTo(car.pos) < 1.5) car._rev = 1.4; car._lp = car.pos.clone(); }
    if (car._rev > 0) { car._rev -= 1 / 60; return { throttle: -0.8, steer: -clamp(err * 2, -1, 1) }; }
    if (d > 260) return { throttle: 0, steer: 0, handbrake: true };
    return { throttle: Math.abs(err) > 1.8 ? 0.5 : 1, steer: clamp(err * 2.4, -1, 1), handbrake: false };
  }
  // ---------------- THE COLLECTOR ----------------
  offerCollector() { const G = this.game; G.contacts.add('vale'); G.phone.ring('vale', () => this.collectorCall(), () => G.phone.addMessage('vale', 'I have work that pays $4,000. Call me when you\'re ready to listen.')); }
  async collectorCall() {
    const G = this.game;
    await this.talk([['Mr. Vale', 'You helped Navarro. Efficient. I like efficient.'], ['Mr. Vale', 'A loan shark named Rico Feld has been squeezing shop owners in Neon Row. He keeps a ledger.'], ['Mr. Vale', 'Take him down — no killing, I need him scared, not dead — and bring me that ledger.'], ['Mr. Vale', 'Details are in your messages.']]);
    const rico = { sex: 'm', height: 1.8, build: 0.6, skin: '#d9a382', faceW: 1.0, jaw: 0.8, hair: { style: 'medium', color: '#2a1f1a' }, facial: 'short', brow: 1.2, eyes: '#3b2414', top: { type: 'blazer', color: '#f0ece2', shirt: '#1d1d1d' }, bottom: { type: 'pants', color: '#1d1d1d' }, shoes: { color: '#7a4a2a' }, acc: { chain: true, glasses: true, watch: true } };
    const photo = G.portrait(rico);
    G.phone.addMessage('vale', 'TARGET: Rico Feld (fictional). Loan shark. Usually outside Pulse on Neon Row with one bodyguard. OBJECTIVE: knock him down, take the ledger, drop it at Vista Overlook. REWARD: $4,000, +$1,000 if no bystanders get hurt.', { img: photo, coords: { x: 270, z: 104, label: 'Neon Row' }, actions: [['Accept contract', () => this.start(this.defCollector(rico))]] });
    G.phone.addMessage('vale', 'Accept from this message when you\'re ready.');
  }
  defCollector(ricoA) {
    const G = this.game, me = this; const club = L.POI.club, ov = L.POI.overlook;
    let civHits = 0; const off = bus.on('hit', (a, t) => { if (a === G.player && t.role === 'ped' && !t.mission) civHits++; });
    return {
      id: 'collector', title: 'The Collector', kind: 'contract', reward: () => 4000 + (civHits === 0 ? 1000 : 0), onComplete: () => { off(); G.phone.addMessage('vale', civHits === 0 ? 'Clean work. The bonus is in your account.' : 'Done, but messy. Base fee only.'); }, onFail: () => off(),
      steps: [
        { text: 'Find Rico Feld on Neon Row', marker: (m) => (m.data.seen ? { x: m.data.rico.pos.x, z: m.data.rico.pos.z } : { x: club.x, z: club.z - 4, r: 10, label: 'Neon Row' }),
          start: (m) => { const r = G.npcs.spawnAt(club.x + 6, club.z - 3, 'ped', ricoA, { persistent: true, state: 'idle', t: 9999, heading: Math.PI }); r.name = 'Rico Feld'; r.isNPC = true; r.mission = true; r.maxHealth = r.health = 90; m.data.rico = me.track(r); const b = G.npcs.spawnAt(club.x + 8, club.z - 4, 'thug', null, { persistent: true, state: 'idle', t: 9999 }); b.isNPC = true; b.mission = true; b.hostile = true; m.data.guard = me.track(b); },
          update: (dt, m) => { const r = m.data.rico; r.state === 'idle' && (r.stateT = 99); if (me.near(r.pos, 30)) { m.data.seen = true; return 'done'; } } },
        { text: 'Take down Rico Feld (knock him out)', marker: (m) => ({ x: m.data.rico.pos.x, z: m.data.rico.pos.z }),
          start: (m) => { G.ui.subtitle('Rico Feld', 'You lost, friend? This is my street.', 3); },
          update: (dt, m) => { const r = m.data.rico, g = m.data.guard; if (me.near(r.pos, 6) && r.state === 'idle') { r.state = 'fight'; r.foe = G.player; r.atkT = 1; r.persona = 'aggressive'; if (g.active && !g.down) { g.state = 'fight'; g.foe = G.player; g.atkT = 1.4; } } if (r.state === 'flee' && r.health > 0) { r.stateT = Math.max(r.stateT, 3); } if (!r.active || r.down) return 'done'; if (dist(r.pos.x, r.pos.z, G.player.pos.x, G.player.pos.z) > 200) return 'fail:Rico got away.'; } },
        { text: 'Grab the ledger (press E)', marker: (m) => ({ x: m.data.rico.pos.x, z: m.data.rico.pos.z }),
          start: (m) => { const r = m.data.rico; const led = new THREE.Mesh(prim('box', 0.22, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x7a3b1e, emissive: 0xffa040, emissiveIntensity: 0.6 })); led.position.set(r.pos.x + 0.6, r.pos.y + 0.05, r.pos.z); G.scene.add(led); me.track(led); m.data.led = led; G.interactTargets.push({ id: 'ledger', label: 'Take the ledger', x: led.position.x, z: led.position.z, r: 2.2, act: () => { G.scene.remove(led); m.data.got = true; G.audio.ui('ding'); G.interactTargets = G.interactTargets.filter((t) => t.id !== 'ledger'); } }); },
          update: (dt, m) => { if (m.data.led) m.data.led.rotation.y += dt * 2; if (m.data.got) return 'done'; } },
        { text: () => (G.police.level ? 'Lose the police' : 'Drop the ledger at Vista Overlook'), marker: () => (G.police.level ? null : { x: ov.x, z: ov.z, y: L.HILL_TOP, label: 'Vista Overlook' }),
          update: (dt, m) => { const want = G.police.level ? 'Lose the police' : 'Drop the ledger at Vista Overlook'; if (want !== me.objectiveText) { me.objectiveText = want; } if (!G.police.level && me.near(ov, 6)) return 'done'; } },
      ],
    };
  }
  // ---------------- repeatable jobs ----------------
  jobList() {
    const G = this.game, d = this.done, busy = !!this.active;
    const list = [];
    if (!d.has('homecoming')) list.push({ title: 'Homecoming (story)', desc: 'Dani needs help. Call Dani from Contacts.', enabled: !busy && G.contacts.has('dani'), button: 'Call Dani', start: () => G.phone.callOut('dani') });
    if (d.has('homecoming') && !d.has('collector')) list.push({ title: 'The Collector (contract)', desc: 'Mr. Vale has paid work. Call him.', enabled: !busy && G.contacts.has('vale'), button: 'Call Vale', start: () => G.phone.callOut('vale') });
    list.push({ title: 'Courier run', desc: 'Deliver an order across town before the timer runs out. $120–$450.', enabled: !busy, start: () => this.start(this.defDelivery()) });
    list.push({ title: 'Coastline Sprint', desc: `Time trial in any vehicle along Ocean Blvd to Vista Heights. Best: ${this.best.sprint ? this.best.sprint.toFixed(1) + 's' : '—'}`, enabled: !busy, start: () => this.start(this.defSprint()) });
    list.push({ title: 'Lifeguard rescue', desc: 'Take a jet ski out to a swimmer in trouble and bring them to shore. $350.', enabled: !busy, start: () => this.start(this.defRescue()) });
    list.push({ title: 'Skydive San Aurelia', desc: `Book at the airport Skydive desk ($${SKYDIVE_PRICE}). Land on the beach target for a bonus.`, enabled: !busy, button: 'Set GPS', start: () => { G.ui.waypoint = { x: L.POI.airport.x, z: L.POI.airport.z }; G.ui.toast('GPS set', 'Skydive desk, Aurelia International', 'info'); } });
    list.push({ title: 'Beach workout', desc: 'Complete 3 different exercises at Muscle Shore. Stat bonus + $100.', enabled: !busy, start: () => this.start(this.defWorkout()) });
    return list;
  }
  defDelivery() {
    const G = this.game, me = this; const pick = R() < 0.5 ? L.POI.store : L.POI.cafe;
    const homes = [[-300, 248], [-30, 388], [200, 512], [-430, 388], [-780, -12], [350, -330], [-150, -450], [60, 520], [-360, 100], [340, 380]];
    let dest; do { dest = homes[Math.floor(R() * homes.length)]; } while (dist(dest[0], dest[1], pick.x, pick.z) < 250);
    const D = dist(dest[0], dest[1], pick.x, pick.z);
    return { id: 'delivery', title: 'Courier run', kind: 'activity', reward: (m) => Math.round(120 + D * 0.35 + Math.max(0, m.timer) * 2),
      steps: [
        { text: `Pick up the order at ${pick.name}`, marker: () => ({ x: pick.x, z: pick.z }), update: () => (me.near(pick, 5) ? 'done' : null) },
        { text: 'Deliver the package', marker: () => ({ x: dest[0], z: dest[1] }), start: (m) => { m.timer = Math.round(D / 9 + 25); G.audio.ui('ding'); G.ui.toast('Package collected', `Deliver within ${m.timer}s`, 'mission'); },
          update: (dt, m) => { m.timer -= dt; if (m.timer <= 0) return 'fail:The delivery was late.'; if (me.near({ x: dest[0], z: dest[1] }, 6)) { m.timerLeft = m.timer; return 'done'; } } },
      ] };
  }
  defSprint() {
    const G = this.game, me = this;
    const cps = [[480, -460], [480, -180], [480, 100], [340, 100], [200, 100], [60, 100], [60, -40], [-80, -40], [-360, -40], [-500, -40], [-700, -40], [-850, -40]].map(([x, z]) => ({ x, z }));
    const ghost = 80;
    return { id: 'sprint', title: 'Coastline Sprint', kind: 'activity',
      reward: (m) => { const t = m.data.time; if (!this.best.sprint || t < this.best.sprint) this.best.sprint = t; return t < ghost ? 600 : t < ghost * 1.2 ? 350 : 150; },
      steps: [
        { text: 'Get a vehicle and drive to the start on Ocean Blvd', marker: () => ({ x: 480, z: -560, r: 5 }), update: () => (G.player.state === 'vehicle' && me.near({ x: 480, z: -560 }, 10) ? 'done' : null) },
        { text: 'Race through the checkpoints!', start: (m) => { m.data.k = 0; m.data.time = 0; G.ui.big('GO!', `Jett's time: ${ghost}s`, '#ffd166', 1.5); G.audio.ui('mission'); },
          marker: (m) => ({ ...cps[m.data.k], y: L.roadY(cps[m.data.k].x, cps[m.data.k].z), r: 6 }), extra: (m) => cps.slice(m.data.k + 1, m.data.k + 3).map((c) => ({ x: c.x, z: c.z, c: '#ffd166', r: 3 })),
          update: (dt, m) => { m.data.time += dt; G.ui.hint(`${m.data.time.toFixed(1)}s · checkpoint ${m.data.k + 1}/${cps.length}`, 0.3); if (G.player.state !== 'vehicle') return 'fail:You left your vehicle.'; if (me.near(cps[m.data.k], 12)) { m.data.k++; G.audio.ui('ding'); if (m.data.k >= cps.length) { G.ui.toast('Finish!', `${m.data.time.toFixed(1)}s`, 'good'); return 'done'; } } } },
      ] };
  }
  defRescue() {
    const G = this.game, me = this; const sw = { x: 700 + R() * 90, z: -360 + R() * 300 }; const shore = { x: 572, z: sw.z };
    return { id: 'rescue', title: 'Lifeguard rescue', kind: 'activity', reward: 350,
      steps: [
        { text: 'Get on the lifeguard jet ski at the shoreline', marker: (m) => ({ x: m.data.ski.pos.x, z: m.data.ski.pos.z }),
          start: (m) => { const ski = G.vehicles.spawn('wavedart', 612, sw.z, Math.PI / 2, { color: '#ff3b30', owner: 'player' }); ski.isVehicle = true; m.data.ski = me.track(ski); const s = G.npcs.spawnAt(sw.x, sw.z, 'ped', null, { persistent: true, state: 'idle', t: 9999 }); s.isNPC = true; s.swimmer = true; s.mission = true; m.data.sw = me.track(s); },
          update: (dt, m) => { me._swimmer(m, dt); return G.player.vehicle === m.data.ski ? 'done' : null; } },
        { text: 'Reach the swimmer in distress', marker: (m) => ({ x: sw.x, z: sw.z }), start: (m) => { m.timer = 90; },
          update: (dt, m) => { me._swimmer(m, dt); m.timer -= dt; if (m.timer <= 0) return 'fail:You were too late.'; if (me.near(sw, 5) && Math.abs(m.data.ski.speed) < 6) { m.data.carry = true; G.ui.toast('Swimmer aboard', 'Get them to shore', 'good'); return 'done'; } } },
        { text: 'Bring the swimmer back to shore', marker: () => ({ x: shore.x + 30, z: shore.z }), start: (m) => { m.timer = null; },
          update: (dt, m) => { me._swimmer(m, dt); if (G.player.vehicle !== m.data.ski) return 'fail:You left the swimmer behind.'; if (m.data.ski.pos.x < 630) { m.data.sw.swimmer = false; m.data.sw.pos.set(shore.x, 0, shore.z); m.data.sw.state = 'idle'; G.ui.subtitle('Swimmer', 'Thank you… thank you so much!', 3); return 'done'; } } },
      ] };
  }
  _swimmer(m, dt) {
    const G = this.game, s = m.data.sw; if (!s || !s.active) return;
    if (m.data.carry && m.data.ski) { const p = m.data.ski.local(0, -1.1); s.pos.set(p.x, m.data.ski.pos.y + 0.2, p.z); s.heading = m.data.ski.heading; s.anim.mode = 'ride'; s.anim.sitH = 0.5; return; }
    s.pos.y = G.ocean.height(s.pos.x, s.pos.z) - 0.25; s.anim.mode = 'swim'; s.anim.speed = 0; s.anim.wave = Math.sin(G.time * 2) > 0;
    if (R() < dt * 0.3) G.audio.splash(s.pos, 0.3);
  }
  defWorkout() {
    const G = this.game; const done = new Set();
    const off = bus.on('rep', (k) => { done.add(k); });
    return { id: 'workout', title: 'Beach workout', kind: 'activity', reward: 100, onComplete: () => { off(); for (const k of Object.keys(G.player.stats)) G.player.stats[k] += 0.5; G.ui.toast('Workout complete', 'All stats +0.5', 'good'); }, onFail: () => off(),
      steps: [{ text: () => `Train at Muscle Shore: ${done.size}/3 exercises`, marker: () => ({ x: 528, z: 150 }), update: () => { const t = `Train at Muscle Shore: ${done.size}/3 exercises`; this.objectiveText = t; return done.size >= 3 ? 'done' : null; } }] };
  }
  defSkydive() {
    const G = this.game, me = this; const tgt = { x: 530, z: -60 };
    return { id: 'skydive', title: 'Skydive San Aurelia', kind: 'activity', reward: (m) => (m.data.d < 15 ? 400 : m.data.d < 45 ? 200 : 0), showDist: true,
      steps: [
        { text: 'Jump! Open your parachute and land on the beach target', marker: () => ({ x: tgt.x, z: tgt.z, r: 8 }),
          start: (m) => { const off = bus.on('landed', (e) => { m.data.d = dist(G.player.pos.x, G.player.pos.z, tgt.x, tgt.z); m.data.landed = true; off(); }); m.data.off = off; },
          update: (dt, m) => { if (m.data.landed) { G.ui.toast('Landed', `${Math.round(m.data.d)} m from the target`, m.data.d < 15 ? 'good' : 'info'); return 'done'; } } },
      ] };
  }
  serialize() { return { done: [...this.done], best: this.best, flags: { ...this.flags, t: this.flags.t } }; }
  restore(s) { if (!s) return; this.done = new Set(s.done || []); this.best = s.best || {}; this.flags = s.flags || {}; }
}
