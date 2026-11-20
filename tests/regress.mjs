import { launch, openGame, sleep } from './harness.mjs';
const results = []; const ok = (n, p, i = '') => { results.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const b = await launch(); const { page, logs } = await openGame(b); const G = (fn, a) => page.evaluate(fn, a);
await page.waitForSelector('#title', { timeout: 120000 });
await G(() => { const g = window.__rivora; g._noBlurPause = true; g._skipIntro = true; document.getElementById('title').remove(); g.newGame({ kind: 'dog', name: 'R' }); g.settings.shadows = false; g.applyQuality('low'); g.settings.renderScale = 0.5; g.resize(); });
await page.waitForFunction(() => window.__rivora.running && !window.__rivora.cutscene, null, { timeout: 60000 });
const jf = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); const p = g.vehicles.spawn('aerolite', 0, 0, 0, { owner: 'player', y: 300 }); g.vehicles.enter(p); p.speed = 40; p.pos.y = 300; await w(300); g.vehicles.exit(); await w(300); return { st: g.player.state, hp: g.player.health }; });
ok('Jumping out of a moving plane starts freefall (no knockdown)', jf.st === 'freefall' && jf.hp > 100, JSON.stringify(jf));
// ---- pedestrian navigation (daytime downtown): movement rate while in the walking state
const nav = await G(async () => { const g = window.__rivora, w = (ms) => new Promise((r) => setTimeout(r, ms)); g.env.setHour(12); g.player.teleport(60, 0.15, -100); const sw = async (s) => { const t0 = g.time; while (g.time - t0 < s) await w(120); }; await sw(12); const tr = new Map(); for (let k = 0; k < 16; k++) { for (const n of g.npcs.list) { if (!n.active || n.boardwalk) continue; let t = tr.get(n); if (!t) { t = { wt: 0, mv: 0, x: n.pos.x, z: n.pos.z }; tr.set(n, t); } const d = Math.hypot(n.pos.x - t.x, n.pos.z - t.z); if (n.state === 'walk') { t.wt += 0.5; t.mv += d; } t.x = n.pos.x; t.z = n.pos.z; } await sw(0.5); } const rows = [...tr.values()].filter((t) => t.wt >= 4); const stuck = rows.filter((t) => t.mv / t.wt < 0.3).length; return { walkers: rows.length, stuck, active: g.npcs.list.filter((n) => n.active).length }; });
ok('Pedestrians navigate sidewalks (few stuck)', nav.walkers > 3 && nav.stuck <= Math.ceil(nav.walkers * 0.15), JSON.stringify(nav));
const errs = logs.filter((l) => !l.includes('ERR_FAILED') && !l.includes('deprecated') && !l.includes('GL Driver') && !l.includes('GPU stall'));
ok('No runtime errors (regression)', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${results.filter((r) => r.p).length}/${results.length} regression checks passed`);
await b.close();
