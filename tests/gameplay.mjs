// End-to-end checks of the mandatory systems, driven through real input events + the game's own state.
import { launch, openGame, sleep, shotDir } from './harness.mjs';
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
const b = await launch();
const { page, logs } = await openGame(b);
const G = (fn, arg) => page.evaluate(fn, arg);
const key = async (code, ms = 120) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
const simWait = async (sec) => { const t0 = await G(() => window.__rivora.time); while ((await G(() => window.__rivora.time)) - t0 < sec) await sleep(100); };
const hold = async (codes, sec) => { for (const c of codes) await page.keyboard.down(c); await simWait(sec); for (const c of codes) await page.keyboard.up(c); };
const until = async (fn, ms = 20000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn, arg)) return true; await sleep(200); } return false; };
await page.waitForSelector('#title', { timeout: 120000 });
await G(() => { window.__rivora._noBlurPause = true; window.__rivora.testFast = true; });
ok('Title screen renders with menu', await page.isVisible('#title .menu'));
// ---- new game via the real UI
await page.click('[data-a="new"]'); await sleep(1500);
ok('Character creator opens', await page.isVisible('text=Create your character'));
await page.screenshot({ path: shotDir + '/02_creator.png' });
await page.click('text=Randomize'); await sleep(300); await page.click('text=Default hero'); await sleep(300);
await page.click('[data-next]'); await sleep(800);
ok('Companion selection opens', await page.isVisible('text=Choose a companion'));
await page.click('.kinds .item >> nth=1'); await sleep(400);
await G(() => { window.__rivora._skipIntro = true; });
await page.click('[data-go]');
ok('Game reaches playable state', await until(() => { const g = window.__rivora; return g.running && !g.cutscene && g.player.state === 'foot'; }, 60000));
await simWait(1.5);
await page.screenshot({ path: shotDir + '/03_start.png' });
ok('HUD visible (minimap, money)', await page.isVisible('#mmc') && await page.isVisible('#money'));
// ---- on-foot movement
const p0 = await G(() => { const p = window.__rivora.player.pos; return { x: p.x, y: p.y, z: p.z }; });
await page.screenshot({ path: shotDir + '/03b_start_full.png' });
await G(() => { const g = window.__rivora; g.settings.renderScale = 0.55; g.resize(); });
await hold(['KeyW'], 2.5);
const p1 = await G(() => { const p = window.__rivora.player.pos; return { x: p.x, y: p.y, z: p.z }; });
const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z); ok('Keyboard movement (W)', walked > 2, walked.toFixed(2) + ' m');
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await simWait(1.5);
const spd = await G(() => window.__rivora.player.speed); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
ok('Sprint speed > jog speed', spd > 5, spd.toFixed(2) + ' m/s');
await simWait(0.8);
const y0 = await G(() => window.__rivora.player.pos.y); await page.keyboard.down('Space'); let ymax = y0; for (let i = 0; i < 12; i++) { await sleep(90); ymax = Math.max(ymax, await G(() => window.__rivora.player.pos.y)); } await page.keyboard.up('Space');
ok('Jump raises the player', ymax - y0 > 0.3, (ymax - y0).toFixed(2) + ' m'); await simWait(1.2);
const grounded = await G(() => { const g = window.__rivora, p = g.player.pos; return p.y >= g.city.surfaceHeight(p.x, p.z, p.y + 1) - 0.05; });
ok('Player stands on ground (no fall-through)', grounded);
// ---- camera (drag-to-look fallback, pointer lock unavailable headless)
const yawA = await G(() => window.__rivora.cam.yaw);
await page.mouse.move(640, 360); await page.mouse.down(); for (let i = 0; i < 10; i++) { await page.mouse.move(640 + i * 20, 360); await sleep(30); } await page.mouse.up(); await sleep(300);
const yawB = await G(() => window.__rivora.cam.yaw); ok('Mouse camera rotates', Math.abs(yawB - yawA) > 0.2, (yawB - yawA).toFixed(2) + ' rad');
// ---- vehicle enter / drive / exit
await G(() => { const g = window.__rivora; const v = g.vehicles.list.find((q) => q.ownedId); const d = v.doorWorld(1); g.player.teleport(d.x, 0.15, d.z, v.heading); });
await simWait(0.4); await key('KeyF', 250); await simWait(1.2);
ok('Enter vehicle (F)', await G(() => window.__rivora.player.state === 'vehicle'));
const seat = await G(() => { const g = window.__rivora, v = g.player.vehicle; return Math.hypot(g.player.pos.x - v.pos.x, g.player.pos.z - v.pos.z); }); ok('Driver seated inside vehicle', seat < 1.5, seat.toFixed(2) + ' m from centre');
await page.keyboard.down('KeyW'); await simWait(3);
const vs = await G(() => window.__rivora.player.vehicle.speed); ok('Vehicle accelerates', vs > 5, (vs * 3.6).toFixed(0) + ' km/h');
const h0 = await G(() => window.__rivora.player.vehicle.heading); await page.keyboard.down('KeyA'); await simWait(0.9); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
const h1 = await G(() => window.__rivora.player.vehicle.heading); ok('Vehicle steers', Math.abs(h1 - h0) > 0.1, (h1 - h0).toFixed(2) + ' rad');
await page.screenshot({ path: shotDir + '/04_driving.png' });
await hold(['KeyS'], 2.5);
const vs2 = await G(() => Math.abs(window.__rivora.player.vehicle.speed)); ok('Vehicle brakes', vs2 < vs, (vs2 * 3.6).toFixed(0) + ' km/h');
await G(() => { const v = window.__rivora.player.vehicle; v.vel.set(0, 0, 0); });
await simWait(0.3); await key('KeyF', 250); await simWait(1);
const ex = await G(() => { const g = window.__rivora, P = g.player; const v = g.vehicles.list.find((q) => q.ownedId); return { st: P.state, d: Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z), inside: g.city.inBuilding(P.pos.x, P.pos.z) }; });
ok('Exit vehicle beside the door', ex.st === 'foot' && ex.d > 0.8 && ex.d < 3.5 && !ex.inside, JSON.stringify(ex));
// ---- traffic lights + AI compliance
const cyc = await G(() => { const g = window.__rivora; const n = g.city.heads[0].node; const seen = new Set(); for (let t = 0; t < 40; t += 0.5) seen.add(g.signal(n, g.time + t, 'ns')); return [...seen]; });
ok('Traffic signals cycle red/yellow/green', cyc.includes('red') && cyc.includes('green') && cyc.includes('yellow'), cyc.join(','));
await sleep(4000);
const stopped = await G(() => { const g = window.__rivora; let compliant = 0, violators = 0; for (const tc of g.traffic.cars) { if (tc.turn || tc.state !== 'lane') continue; const e = tc.edge, E = g.L.nodes[tc.dir > 0 ? e.b : e.a]; if (!E.light) continue; const front = tc.t + tc.v.L / 2, stopAt = e.len - 10.4; const st = g.signal(E, g.time, e.axis); if (st === 'red' && front > stopAt + 1.5 && front < stopAt + 8 && tc.speed > 2) violators++; if (st === 'red' && Math.abs(stopAt - front) < 6 && tc.speed < 0.5) compliant++; } return { compliant, violators, cars: g.traffic.cars.length }; });
ok('Traffic stops at red lights (no violators)', stopped.violators === 0 && stopped.cars > 3, JSON.stringify(stopped));
// ---- red-light camera fines (active camera vs none)
const fineTest = await G(async () => {
  const g = window.__rivora, L = g.L; const res = {};
  const run = async (node) => {
    // approach from the south along the NS axis, signal forced red for 'ns'
    const v = g.vehicles.list.find((q) => q.ownedId); if (g.player.vehicle !== v) { g.vehicles.enter(v); }
    const z0 = node.z - 30; v.place(node.x - 2.6, z0, 0); v.vel.set(0, 0, 18); v.speed = 18; g.traffic.enf.approach = null;
    const off = g.time; g._forceRed = node.id; const before = g.economy.fines.length;
    for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 30)); if (v.pos.z > node.z + 4) break; v.vel.set(0, 0, 18); }
    g._forceRed = null; return g.economy.fines.length - before;
  };
  const cam = L.nodes.find((n) => n.camera === 'active' && n.edges.length === 4);
  const none = L.nodes.find((n) => n.light && !n.camera && n.edges.length === 4 && n.ix > 0 && n.ix < 6 && n.iz > 1 && n.iz < 7);
  res.cam = await run(cam); res.none = await run(none); res.camName = cam.ix + ',' + cam.iz; return res;
});
ok('Fine issued at ACTIVE camera on red', fineTest.cam === 1, JSON.stringify(fineTest));
ok('No fine at intersection WITHOUT camera', fineTest.none === 0);
await G(() => { const g = window.__rivora; g.vehicles.exit(true); });
await sleep(500);
// ---- phone
await key('KeyP', 250); await simWait(0.6); ok('Phone opens (P)', await page.isVisible('#phone'));
await page.click('#phone .app >> nth=0'); await sleep(300); const msgs = await page.isVisible('#phone .page'); await page.screenshot({ path: shotDir + '/05_phone.png' });
await key('KeyP', 250); await simWait(0.5); ok('Phone closes (P) and messages page renders', !(await page.isVisible('#phone')) && msgs);
// ---- story mission end-to-end
const mis = await G(async () => {
  const g = window.__rivora, M = g.missions, P = g.player, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cash0 = g.economy.cash; g.missions.offerHomecoming(); await wait(300); g.phone.answer(); for (let i = 0; i < 80 && !M.active; i++) await wait(100);
  const log = [M.active && M.active.id];
  const tp = (x, z) => { if (P.state === 'vehicle') g.vehicles.exit(true); P.teleport(x, g.city.surfaceHeight(x, z, 50), z); };
  tp(g.L.POI.cafe.x + 3, g.L.POI.cafe.z); for (let i = 0; i < 30 && M.active.i < 1; i++) await wait(100); log.push('step' + M.active.i);
  const t = g.interactTargets.find((q) => q.id === 'dani'); await t.act(); for (let i = 0; i < 50 && M.active.i < 2; i++) await wait(100); log.push('step' + M.active.i);
  tp(g.city.warehouseYard.x + 20, g.city.warehouseYard.z + 40); for (let i = 0; i < 30 && M.active.i < 3; i++) await wait(100); log.push('step' + M.active.i);
  const van = M.active.data.van; g.vehicles.enter(van); for (let i = 0; i < 30 && M.active.i < 4; i++) await wait(100); log.push('step' + M.active.i);
  const gx = g.L.POI.garage.x, gz = g.L.POI.garage.z - 8; van.place(gx, gz, 0); van.vel.set(0, 0, 0); for (let i = 0; i < 40 && M.active && M.active.i < 5; i++) await wait(100); log.push('step' + (M.active ? M.active.i : 'done'));
  for (let i = 0; i < 80 && M.active; i++) await wait(100);
  return { log, done: M.done.has('homecoming'), cash: g.economy.cash - cash0 };
});
ok('Story mission accepts, progresses and completes', mis.done, JSON.stringify(mis));
ok('Mission reward paid ($2,500)', mis.cash === 2500, '+$' + mis.cash);
await page.screenshot({ path: shotDir + '/06_mission_done.png' });
await sleep(2000);
// ---- interior shop purchase
const cafe = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); if (g.player.state === 'vehicle') g.vehicles.exit(true); await g.interiors.enter('cafe'); await wait(1300); const inside = g.interiorId; const c0 = g.economy.cash + g.economy.bank; g.interiors.menu('cafe'); await wait(300); return { inside, c0 }; });
await page.click('.items .item >> nth=0'); await sleep(800);
const cafe2 = await G(() => window.__rivora.economy.cash + window.__rivora.economy.bank);
ok('Enter café interior and buy a drink', cafe.inside === 'cafe' && cafe2 === cafe.c0 - 5, `${cafe.c0} -> ${cafe2}`);
await page.screenshot({ path: shotDir + '/07_cafe.png' });
await G(async () => { await window.__rivora.interiors.exit(); }); await sleep(1500);
// ---- gym
const gym = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); const pt = g.city.interactPoints.find((p) => p.kind === 'gym:bench'); g.player.teleport(pt.x, 0.05, pt.z + 0.5); await wait(200); const s0 = g.player.stats.strength; g.activities.startGym('bench', pt); await wait(300); return { s0, st: g.player.state, kind: g.player.activity && g.player.activity.kind }; });
for (let i = 0; i < 30; i++) { await key('Space', 200); await simWait(0.95); if ((await G(() => window.__rivora.player.stats.strength)) > gym.s0) break; }
await page.screenshot({ path: shotDir + '/08_gym.png' });
const gym2 = await G(() => window.__rivora.player.stats.strength);
ok('Gym bench press animates and raises strength', gym.st === 'activity' && gym.kind === 'bench' && gym2 > gym.s0, `${gym.s0} -> ${gym2.toFixed(2)}`);
await key('KeyE', 250); await simWait(0.5);
// ---- parachute
await G(() => { const g = window.__rivora; g.player.activity = null; g.player.state = 'freefall'; g.player.teleport(300, 240, -100, 0); g.player.vel.set(0, -40, 0); });
await simWait(0.6); await key('Space', 250); await simWait(1.5);
const chute = await G(() => ({ st: window.__rivora.player.state, vis: window.__rivora.player.chute.visible }));
ok('Parachute deploys from freefall', chute.st === 'parachute' && chute.vis, JSON.stringify(chute));
await page.screenshot({ path: shotDir + '/09_parachute.png' });
const landed = await until(() => window.__rivora.player.state === 'foot' || window.__rivora.player.state === 'swim', 400000);
const pl = await G(() => ({ st: window.__rivora.player.state, hp: window.__rivora.player.health, chute: window.__rivora.player.chute.visible }));
ok('Parachute lands safely', landed && pl.hp > 0 && !pl.chute, JSON.stringify(pl));
// ---- helicopter
const heli = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); const P = g.player; P.state = 'foot'; P.teleport(-330, 0.1, 630); const h = g.vehicles.spawn('skylark', -330, 640, 0, { owner: 'player' }); await wait(200); g.vehicles.enter(h); await wait(300); return h.pos.y; });
await hold(['Space'], 7);
const hy = await G(() => window.__rivora.player.vehicle && window.__rivora.player.vehicle.pos.y);
await hold(['KeyW'], 3);
const hv = await G(() => { const v = window.__rivora.player.vehicle; return Math.hypot(v.vel.x, v.vel.z); });
ok('Helicopter lifts off and flies forward', hy - heli > 5 && hv > 2, `alt +${(hy - heli).toFixed(1)} m, ${hv.toFixed(1)} m/s`);
await page.screenshot({ path: shotDir + '/10_heli.png' });
// ---- save export / import
const sv = await G(() => { const g = window.__rivora; const code = g.save.exportCode(); const cash = g.economy.cash; g.economy.cash = 1; const r = g.save.parse(code); g.economy.restore(r.data.economy); const bad = g.save.parse('RIVORA1:garbage!!'); const empty = g.save.parse(''); return { ok: r.ok, restored: g.economy.cash === cash, bad: bad.ok, emptyErr: empty.error, len: code.length }; });
ok('Save export/import round-trips', sv.ok && sv.restored, `code ${sv.len} chars`);
ok('Corrupt save rejected gracefully', sv.bad === false && !!sv.emptyErr);
// ---- companion follows on foot without teleport spam
const comp = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); if (g.player.state === 'vehicle') g.vehicles.exit(true); await wait(400); g.player.state = 'foot'; g.player.teleport(-150, 0.15, 200, Math.PI); g.companion.place(-148, 0.15, 201); g.companion.mode = 'follow'; g.companion.teleports = 0; return true; });
await simWait(0.8); await hold(['KeyW'], 6); await simWait(2.5);
const cf = await G(() => { const g = window.__rivora; return { d: Math.hypot(g.player.pos.x - g.companion.pos.x, g.player.pos.z - g.companion.pos.z), tp: g.companion.teleports }; });
ok('Companion follows without repeated teleporting', cf.d < 6 && cf.tp <= 1, JSON.stringify(cf));
// ---- combat
const cb = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); const P = g.player; const n = g.npcs.spawnAt(P.pos.x + Math.sin(P.heading) * 1.1, P.pos.z + Math.cos(P.heading) * 1.1, 'thug', null, { persistent: true }); n.state = 'idle'; n.stateT = 99; n.hostile = true; return { h0: n.health, id: n.id }; });
for (let i = 0; i < 4; i++) { await key('KeyJ', 150); await simWait(0.65); }
const cb2 = await G((id) => { const g = window.__rivora; const n = g.npcs.list.find((q) => q.id === id); return { h: n.health, st: n.state, ph: g.player.health }; }, cb.id);
ok('Melee punches damage an enemy', cb2.h < cb.h0, `${cb.h0.toFixed(0)} -> ${cb2.h.toFixed(0)}, enemy ${cb2.st}`);
await simWait(4);
const ph = await G(() => window.__rivora.player.health); ok('Player survives single hits (not one-shot)', ph > 0, 'health ' + ph.toFixed(0));
// ---- wanted level via crime with police witness
const wl = await G(async () => { const g = window.__rivora; g.police.report('assault', 2, g.player.pos, true); return g.police.level; });
ok('Wanted level rises on reported crime', wl >= 2, 'level ' + wl);
await simWait(10);
const pu = await G(() => ({ units: window.__rivora.police.units.length, lvl: window.__rivora.police.level }));
ok('Police units respond', pu.units >= 1, JSON.stringify(pu));
await page.screenshot({ path: shotDir + '/11_wanted.png' });
await G(() => window.__rivora.police.clear());
// ---- NPC navigation health
const nav = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); g.player.teleport(60, 0.15, -100); const sw = async (s) => { const t0 = g.time; while (g.time - t0 < s) await wait(100); }; await sw(15); const snap = g.npcs.list.filter((n) => n.active && n.state === 'walk' && !n.boardwalk).map((n) => ({ n, x: n.pos.x, z: n.pos.z })); await sw(8); let stuck = 0; for (const s of snap) if (s.n.state === 'walk' && Math.hypot(s.n.pos.x - s.x, s.n.pos.z - s.z) < 1) stuck++; return { walkers: snap.length, stuck, active: g.npcs.list.filter((n) => n.active).length }; });
ok('Pedestrians navigate (few stuck)', nav.walkers > 2 && nav.stuck <= Math.ceil(nav.walkers * 0.2), JSON.stringify(nav));
await page.screenshot({ path: shotDir + '/12_downtown.png' });
// ---- audio is moderate
const au = await G(async () => { const g = window.__rivora, wait = (ms) => new Promise((r) => setTimeout(r, ms)); g.audio.start(); let pk = 0, rms = 0; for (let i = 0; i < 30; i++) { await wait(100); const m = g.audio.measure(); if (m) { pk = Math.max(pk, m.peak); rms = Math.max(rms, m.rms); } } return { ready: g.audio.ready, state: g.audio.ctx && g.audio.ctx.state, pk, rms, levels: g.audio.levels }; });
ok('Audio engine runs at moderate level (peak < 0.8)', au.ready && au.pk < 0.8, JSON.stringify({ ready: au.ready, state: au.state, peak: +au.pk.toFixed(3), rms: +au.rms.toFixed(3) }));
const perf = await G(() => ({ fps: window.__rivora.fps, calls: window.__rivora.renderer.info.render.calls, tris: window.__rivora.renderer.info.render.triangles, mem: window.__rivora.renderer.info.memory }));
console.log('PERF (software renderer)', JSON.stringify(perf));
const errs = logs.filter((l) => !l.includes('ERR_FAILED') && !l.includes('deprecated') && !l.includes('GL Driver') && !l.includes('GPU stall'));
ok('No runtime errors in console', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
await b.close();
