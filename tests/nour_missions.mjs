// El Nour story chapters 2–4 and the bread sprint, run through their real objectives.
// Travel between objectives is shortened with teleports; every objective still has to be met in the game.
import { launch, sleep, shotDir } from './harness.mjs';
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== '' ? ' — ' + i : '')); };
const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('rivora.lang', 'en'); } catch (e) {} });
const page = await ctx.newPage(); page.setDefaultTimeout(150000); const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' | ' + (e.stack || '').split('\n').slice(0, 2).join(' '))); page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|favicon/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto('http://localhost:8777/web/index.html?extra=0');
const G = (fn, a) => page.evaluate(fn, a);
const simWait = async (sec) => { const t0 = await G(() => window.__rivora.time); while ((await G(() => window.__rivora.time)) - t0 < sec) await sleep(80); };
const until = async (fn, ms, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn, arg)) return true; await sleep(250); } return false; };
await page.waitForSelector('#title', { timeout: 300000 });
await G(() => { const g = window.__rivora; g._noBlurPause = true; g.testFast = true; g._skipIntro = true; document.getElementById('title').remove(); g.audio.start(); g.newGame({ kind: 'dog', name: 'Rocket' }); });
await page.waitForFunction(() => window.__rivora.running && !window.__rivora.cutscene, null, { timeout: 180000 });
await G(() => { const g = window.__rivora; g.settings.renderScale = 0.45; g.resize(); g.env.setHour(11); g.player.teleport(-222, 0.15, 275, -Math.PI / 2); g.nour.done.add('nour1'); });
await simWait(1.5);
const step = () => G(() => { const m = window.__rivora.missions.active; return m ? m.i + ':' + window.__rivora.missions.objectiveText : 'none'; });
const goMarker = () => G(() => { const g = window.__rivora, m = g.missions.active; const mk = m.steps[m.i].marker && m.steps[m.i].marker(); if (mk) g.player.teleport(mk.x + 0.6, 0.15, mk.z + 0.6, 0); return mk ? [Math.round(mk.x), Math.round(mk.z)] : null; });
const cash = () => G(() => window.__rivora.economy.cash + window.__rivora.economy.bank);
// ---------- chapter 2: The Missing Microbus ----------
let c0 = await cash();
await G(() => { const g = window.__rivora; g.missions.start(g.nour.def('nour2')); }); await simWait(0.4);
ok('Ch.2 starts: ask the regulars', /Ask the regulars/.test(await step()), await step());
await goMarker(); await until(() => window.__rivora.missions.active && window.__rivora.missions.active.i >= 1, 60000);
ok('Ch.2 witness points to Foundry Port', /Foundry Port/.test(await step()), await step());
await goMarker(); await simWait(0.6); await until(() => window.__rivora.missions.active && window.__rivora.missions.active.i >= 2, 60000);
ok('Ch.2 microbus and thugs found at the port', await G(() => !!window.__rivora.vehicles.list.find((v) => v.key === 'micro')), await step());
await G(() => { const g = window.__rivora; const v = g.vehicles.list.find((q) => q.key === 'micro'); const d = v.doorWorld(1); g.player.teleport(d.x, 0.15, d.z, 0); g.vehicles.enter(v); }); await simWait(1);
ok('Ch.2 take the microbus back', /Drive the microbus back/.test(await step()), await step());
await G(() => { const g = window.__rivora; g.player.vehicle.place(-300, 244, 0); }); await simWait(1.2);
const done2 = await until(() => !window.__rivora.missions.active, 90000);
ok('Ch.2 completes, pays and awards a medal', done2 && (await cash()) > c0 && !!(await G(() => window.__rivora.missions.best['nour2:medal'])), `+$${(await cash()) - c0} · ${await G(() => window.__rivora.missions.best['nour2:medal'])}`);
await G(() => { const g = window.__rivora; if (g.player.state === 'vehicle') g.vehicles.exit(true); }); await simWait(0.8);
// ---------- chapter 3: Trouble at the Ahwa (pay path) ----------
await G(() => { const g = window.__rivora; g.economy.cash += 400; g.missions.start(g.nour.def('nour3')); }); await simWait(0.3);
await goMarker(); await until(() => !!document.querySelector('.overlay [data-n]'), 90000);
ok('Ch.3 the gang demands money and you must choose', await G(() => !!document.querySelector('.overlay [data-y]') && !!document.querySelector('.overlay [data-n]')));
await G(() => { const g = window.__rivora, E = g.economy, op = E.pay.bind(E); window._paid = []; E.pay = (a, why) => { window._paid.push([a, why]); return op(a, why); }; });
await G(() => document.querySelector('.overlay [data-n]').click());
const done3 = await until(() => !window.__rivora.missions.active, 90000);
ok('Ch.3 paying ends it quietly ($300 paid)', done3 && (await G(() => window._paid.some(([a, w]) => a === 300 && /Protection/.test(w)))), JSON.stringify(await G(() => window._paid)));
ok('Ch.3 Uncle Hassan remembers the choice', await G(() => { const g = window.__rivora; return g.nour.flags.choice === 'paid' && /paid|what we paid|اللي دفعناه/i.test(g.nour.greetFor().en); }), await G(() => window.__rivora.nour.greetFor().en));
// ---------- chapter 4: Golden Hour photo ----------
await G(() => { const g = window.__rivora; g.env.setHour(17.6); g.missions.start(g.nour.def('nour4')); }); await simWait(0.3);
await goMarker(); await until(() => window.__rivora.missions.active && window.__rivora.missions.active.i >= 1, 60000);
ok('Ch.4 reach the corner and open photo mode', /photo mode/i.test(await step()), await step());
await G(() => { const g = window.__rivora; g.photo.enter(); }); await sleep(600);
// aim the photo camera at the minaret top (-234.5, 38, 114.5)
await G(() => { const g = window.__rivora, ph = g.photo, P = g.player.pos; const piv = { x: P.x, y: P.y + 1.3, z: P.z }; const dx = -234.5 - piv.x, dy = 38 - piv.y, dz = 114.5 - piv.z; const hd = Math.hypot(dx, dz);
  ph.yaw = Math.atan2(-dx, -dz); ph.pitch = -Math.atan2(dy, hd); ph.dist = 0.8; ph.h = 0; });
await sleep(900); await G(() => window.__rivora.photo.capture()); await sleep(600);
await page.screenshot({ path: shotDir + '/nour4_photo.png' });
await G(() => window.__rivora.photo.exit());
const done4 = await until(() => !window.__rivora.missions.active, 60000);
ok('Ch.4 photographing the minaret at golden hour completes with gold', done4 && (await G(() => window.__rivora.missions.best['nour4:medal'])) === 'gold', String(await G(() => window.__rivora.missions.best['nour4:medal'])));
// ---------- bread sprint ----------
c0 = await cash();
await G(() => { const g = window.__rivora; g.env.setHour(9); g.missions.start(g.nour.def('bread')); }); await simWait(0.4);
await G(() => { const g = window.__rivora; const v = g.vehicles.list.find((q) => q.key === 'bicycle' && q.owner === 'player'); const d = v.doorWorld(1); g.player.teleport(d.x, 0.15, d.z, 0); g.vehicles.enter(v); }); await simWait(1);
ok('Bread sprint: on the bicycle with a timer', /Deliver the bread/.test(await step()), await step());
await G(() => { const g = window.__rivora, m = g.missions.active; const mk = m.steps[m.i].marker(); g.player.vehicle.place(mk.x, mk.z, 0); }); await simWait(1);
const doneB = await until(() => !window.__rivora.missions.active, 60000);
ok('Bread sprint completes and pays', doneB && (await cash()) > c0, `+$${(await cash()) - c0}`);
ok('Story chapters recorded as done', await G(() => ['nour2', 'nour3', 'nour4'].every((id) => window.__rivora.nour.done.has(id))));
ok('No console errors', errs.length === 0, errs.slice(0, 3).join(' || '));
console.log(`\n${results.filter((r) => r.p).length}/${results.length} El Nour mission checks passed`);
await b.close();
