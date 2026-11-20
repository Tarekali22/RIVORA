// Second suite: contract mission, boats, plane, EV charging, purchases, club, sleep, weather, respawns.
import { launch, openGame, sleep, shotDir } from './harness.mjs';
const results = []; const ok = (n, p, i = '') => { results.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const b = await launch();
const { page, logs } = await openGame(b);
const G = (fn, a) => page.evaluate(fn, a);
const simWait = async (sec) => { const t0 = await G(() => window.__rivora.time); let last = t0, lastReal = Date.now();
  while (true) { const t = await G(() => window.__rivora.time); if (t - t0 >= sec) return; if (t > last) { last = t; lastReal = Date.now(); } else if (Date.now() - lastReal > 20000) { console.log('STALL', JSON.stringify(await G(() => { const g = window.__rivora; return { paused: g.paused, panels: g.ui.panelStack.map((o) => o.textContent.slice(0, 60)), st: g.player.state, running: g.running, err: document.getElementById('err').textContent.slice(0, 200), hidden: document.hidden }; }))); await G(() => { const g = window.__rivora; g.ui.closeAll(); g.paused = false; }); lastReal = Date.now(); } await sleep(150); } };
const hold = async (codes, sec) => { for (const c of codes) await page.keyboard.down(c); await simWait(sec); for (const c of codes) await page.keyboard.up(c); };
await page.waitForSelector('#title', { timeout: 120000 });
await G(() => { const g = window.__rivora; g._noBlurPause = true; g.testFast = true; g._skipIntro = true; document.getElementById('title').remove(); g.audio.start(); g.newGame({ kind: 'robot', name: 'Orbi' }); });
await page.waitForFunction(() => window.__rivora.running && !window.__rivora.cutscene, null, { timeout: 60000 });
await G(() => { const g = window.__rivora; g.settings.quality = 'low'; g.applyQuality('low'); g.settings.renderScale = 0.6; g.resize(); g.economy.cash = 20000; g.economy.bank = 200000; g.missions.done.add('homecoming'); });
// ---- contract mission with generated target photo
const col = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.contacts.add('vale'); await g.missions.collectorCall(); const th = g.phone.threads.vale; const m = th.msgs.find((x) => x.img); return { img: !!m && m.img.startsWith('data:image/jpeg') && m.img.length > 3000, acts: !!(m && m.actions) }; });
ok('Contract message includes a generated target photo', col.img && col.acts, JSON.stringify(col));
await G(() => { window.__rivora.phone.show('thread:vale'); }); await simWait(0.5);
await page.screenshot({ path: shotDir + '/30_contract_photo.png' });
const acc = await G(async () => { const g = window.__rivora; const m = g.phone.threads.vale.msgs.find((x) => x.actions); m.actions[0][1](); g.phone.close(); return g.missions.active && g.missions.active.id; });
ok('Contract can be accepted from the message', acc === 'collector', String(acc));
const col2 = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); const sw = async (s) => { const t0 = g.time; while (g.time - t0 < s) await w(100); }; const M = g.missions; const r = M.active.data.rico; g.player.teleport(r.pos.x + 3, 0.15, r.pos.z + 3); await sw(1); const s1 = M.active.i; r.damage(200, g.player, { knock: true }); await sw(1); const s2 = M.active && M.active.i; const t = g.interactTargets.find((q) => q.id === 'ledger'); if (t) t.act(); await sw(1); const s3 = M.active && M.active.i; g.police.clear(); const ov = g.L.POI.overlook; g.player.teleport(ov.x, 20.1, ov.z); await sw(2); return { s1, s2, s3, done: M.done.has('collector') }; });
ok('Contract mission progresses to completion', col2.done, JSON.stringify(col2));
// ---- weather + time
const wt = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.env.autoWeather = false; g.env.setWeather('storm', true); g.env.setHour(22.5); const sw = async (s) => { const t0 = g.time; while (g.time - t0 < s) await w(100); }; await sw(2); return { rain: g.env.w.rain, night: g.env.night, rainVis: g.env.rain.mesh.visible, lamp: g.city.lampPoolM.opacity, win: g.city.nightMats[0].emissiveIntensity }; });
ok('Storm weather shows rain', wt.rain > 0.9 && wt.rainVis, JSON.stringify(wt));
ok('Night turns on street lights and windows', wt.night > 0.8 && wt.lamp > 0.3 && wt.win > 0.5);
await G(() => { const g = window.__rivora; g.player.teleport(60, 0.15, -60, 0); g.cam.snapBehind(); }); await simWait(2);
await page.screenshot({ path: shotDir + '/31_night_rain.png' });
await G(() => { const g = window.__rivora; g.env.setWeather('clear', true); g.env.setHour(13); });
// ---- dealer purchase
const dl = await G(async () => { const g = window.__rivora; const n0 = g.vehicles.owned.length; g.menus.dealer(); return n0; });
await page.click('.items .item >> text=Kestrel 1000'); await simWait(0.5);
const dl2 = await G(() => ({ n: window.__rivora.vehicles.owned.length, k: window.__rivora.vehicles.owned.map((o) => o.key) }));
ok('Buy a vehicle at the dealership', dl2.n === dl + 1 && dl2.k.includes('kestrel'), JSON.stringify(dl2));
// ---- clothes
await G(() => { const g = window.__rivora; g.menus.clothesShop(); }); await page.click('.items .item >> text=Rust Knit Polo'); await simWait(0.3);
const cl = await G(() => ({ top: window.__rivora.player.a.top.type, owned: [...window.__rivora.ownedOutfits] }));
ok('Buy and wear an outfit', cl.top === 'polo' && cl.owned.includes('rustpolo'), JSON.stringify(cl));
// ---- boat rental & water driving
const bt = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); const s = g.city.marinaSlips[0]; g.player.teleport(470, 0.2, -690); const v = g.vehicles.spawn('wavedart', s.x, s.z, s.heading, { owner: 'player' }); await w(200); g.vehicles.enter(v); return { y: v.pos.y, x: v.pos.x }; });
await hold(['KeyW'], 4);
const bt2 = await G(() => { const g = window.__rivora, v = g.player.vehicle; const wl = g.ocean.height(v.pos.x, v.pos.z); return { sp: v.speed, dy: v.pos.y - wl, type: v.type }; });
ok('Jet ski drives on water and floats', bt2.type === 'boat' && bt2.sp > 4 && Math.abs(bt2.dy) < 0.8, JSON.stringify(bt2));
await page.screenshot({ path: shotDir + '/32_jetski.png' });
await G(() => window.__rivora.vehicles.exit(true)); await simWait(0.5);
ok('Leaving a boat at sea puts you in the water', await G(() => window.__rivora.player.state === 'swim'));
// ---- plane takeoff
await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.player.state = 'foot'; g.player.teleport(-400, 0.1, 690); const p = g.vehicles.spawn('aerolite', -380, 700, Math.PI / 2, { owner: 'player' }); await w(200); g.vehicles.enter(p); });
await page.keyboard.down('ShiftLeft'); await simWait(6); await page.keyboard.down('KeyS'); await simWait(5); await page.keyboard.up('KeyS'); await simWait(3); await page.keyboard.up('ShiftLeft');
const pl = await G(() => { const v = window.__rivora.player.vehicle; return { alt: v.alt, sp: v.speed, hp: v.health }; });
ok('Plane takes off from the runway', pl.alt > 8 && pl.sp > 25, JSON.stringify(pl));
await page.screenshot({ path: shotDir + '/33_plane.png' });
// ---- jump from plane -> freefall
const jf = await G(async () => { const g = window.__rivora; g.player.vehicle.pos.y = 300; g.vehicles.exit(); return g.player.state; });
ok('Jumping out of an aircraft starts freefall', jf === 'freefall', jf);
await G(() => { const g = window.__rivora; g.player.state = 'foot'; g.player.teleport(-184, 0.15, 249); });
// ---- EV charging
const ev = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); const v = g.vehicles.list.find((q) => q.key === 'ridgeback'); v.place(-184, 244.9, Math.PI / 2); v.battery = 40; const c0 = g.economy.cash; await g.activities.charge(g.L.POI.charger1); await w(1200); return { bat: v.battery, paid: c0 - g.economy.cash }; });
ok('EV charger charges the battery and bills the player', ev.bat === 100 && ev.paid > 0, JSON.stringify(ev));
// ---- club + dance
const cb = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); await g.interiors.enter('club'); await w(1500); const r = g.interiorRoom; g.player.teleport(r.ox, 0.02, r.oz + 0.5); g.activities.startDance(); return { inside: g.interiorId, dancers: r.npcs.filter((n) => n.state === 'dance').length, st: g.player.state }; });
for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await simWait(0.5); }
await page.screenshot({ path: shotDir + '/34_club.png' });
const music = await G(() => window.__rivora.audio.music.style);
ok('Nightclub interior with dancing crowd, player dances, club music plays', cb.inside === 'club' && cb.dancers >= 5 && cb.st === 'activity' && music === 'club', JSON.stringify({ ...cb, music }));
await G(async () => { const g = window.__rivora; g.activities.stopActivity(); await g.interiors.exit(); }); await simWait(1);
// ---- home sleep saves + skips time
const sl = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); await g.interiors.enter('home'); await w(1200); const h0 = g.env.hour; g.player.health = 30; await g.interiors.sleep(); await w(500); const saved = !!g.save.peekAutosave(); const r = { h0, h1: g.env.hour, hp: g.player.health, max: g.player.maxHealth, saved, storage: g.save.storageOK() }; await g.interiors.exit(); return r; });
ok('Sleeping skips time and restores health', Math.abs(sl.h1 - sl.h0) > 2 && sl.hp === sl.max, JSON.stringify(sl));
ok('Browser autosave written when storage is available', !sl.storage || sl.saved, `storage=${sl.storage}`);
// ---- wasted -> hospital, busted -> police
const ws = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.player.state = 'foot'; g.player.teleport(0, 0.15, 100); g.player.damage(9999, null, { fall: true }); for (let i = 0; i < 100 && g._dying !== false; i++) await w(200); await w(4500); return { st: g.player.state, hp: g.player.health, d: Math.hypot(g.player.pos.x - 130, g.player.pos.z - 244) }; });
ok('Wasted respawns at the hospital with full health', ws.st === 'foot' && ws.d < 5 && ws.hp > 100, JSON.stringify(ws));
const bs = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.police.report('assault', 1, g.player.pos, true); g.busted(); await w(4500); return { st: g.player.state, lvl: g.police.level, d: Math.hypot(g.player.pos.x + 10, g.player.pos.z + 316) }; });
ok('Busted clears wanted level and releases at the police station', bs.st === 'foot' && bs.lvl === 0 && bs.d < 5, JSON.stringify(bs));
// ---- pedestrian navigation (daytime downtown): movement rate while in the walking state
const nav = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.env.setHour(12); g.player.teleport(60, 0.15, -100); const sw = async (s) => { const t0 = g.time; while (g.time - t0 < s) await w(120); }; await sw(12); const tr = new Map(); for (let k = 0; k < 16; k++) { for (const n of g.npcs.list) { if (!n.active || n.boardwalk) continue; let t = tr.get(n); if (!t) { t = { wt: 0, mv: 0, x: n.pos.x, z: n.pos.z }; tr.set(n, t); } const d = Math.hypot(n.pos.x - t.x, n.pos.z - t.z); if (n.state === 'walk') { t.wt += 0.5; t.mv += d; } t.x = n.pos.x; t.z = n.pos.z; } await sw(0.5); } const rows = [...tr.values()].filter((t) => t.wt >= 4); const stuck = rows.filter((t) => t.mv / t.wt < 0.3).length; return { walkers: rows.length, stuck, active: g.npcs.list.filter((n) => n.active).length }; });
ok('Pedestrians navigate sidewalks (few stuck)', nav.walkers > 3 && nav.stuck <= Math.ceil(nav.walkers * 0.15), JSON.stringify(nav));
// ---- population snapshot
const pop = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.player.teleport(60, 0.15, -100); const t0 = g.time; while (g.time - t0 < 20) await w(150); return { npcs: g.npcs.list.filter((n) => n.active).length, traffic: g.traffic.cars.length, parked: g.traffic.parkedActive.length }; });
ok('City populated with pedestrians and traffic', pop.npcs >= 10 && pop.traffic >= 10, JSON.stringify(pop));
await page.screenshot({ path: shotDir + '/35_population.png' });
const errs = logs.filter((l) => !l.includes('ERR_FAILED') && !l.includes('deprecated') && !l.includes('GL Driver') && !l.includes('GPU stall'));
ok('No runtime errors (systems suite)', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(`\n${results.filter((r) => r.p).length}/${results.length} system checks passed`);
await b.close();
