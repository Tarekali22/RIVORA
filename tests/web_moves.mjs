// Visual checks of the retargeted realistic people: run, punch, kick, crouch, drive, NPC mocap.
import { launch, sleep, shotDir } from './harness.mjs';
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const page = await ctx.newPage(); const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') logs.push('err: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto('http://localhost:8777/web/index.html');
const G = (fn, arg) => page.evaluate(fn, arg);
await page.waitForSelector('#title', { timeout: 300000 });
await G(() => { window.__rivora._noBlurPause = true; window.__rivora.testFast = true; });
await page.click('[data-a="new"]'); await sleep(1500); await page.click('[data-next]'); await sleep(800);
await page.click('.kinds .item >> nth=2'); await sleep(300); await G(() => { window.__rivora._skipIntro = true; }); await page.click('[data-go]');
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn)) return true; await sleep(300); } return false; };
await until(() => { const g = window.__rivora; return g.running && !g.cutscene && g.player.state === 'foot'; }, 120000);
const simWait = async (sec) => { const t0 = await G(() => window.__rivora.time); while ((await G(() => window.__rivora.time)) - t0 < sec) await sleep(80); };
// side camera helper: look at player from the side
const side = (d = 3.2, h = 1.2, ang = 1.4) => G(([d, h, ang]) => { const g = window.__rivora, p = g.player.pos, hd = g.player.heading || 0; const a = hd + ang; g.cam.cine = null; g.cam.play([{ pos: [p.x + Math.sin(a) * d, p.y + h, p.z + Math.cos(a) * d], look: [p.x, p.y + 0.9, p.z], t: 999, hold: true }]); }, [d, h, ang]);
const shot = async (n, d = 3.4, ang = 1.35) => { await G(([d, ang]) => { const g = window.__rivora; g.paused = true; const P = g.player, o = P.state === 'vehicle' ? P.vehicle.pos : P.pos, hd = P.state === 'vehicle' ? P.vehicle.heading : P.object.rotation.y; const a = hd + ang; g.camera.position.set(o.x + Math.sin(a) * d, o.y + 1.3, o.z + Math.cos(a) * d); g.camera.lookAt(o.x, o.y + 0.95, o.z); g.renderNow(); }, [d, ang]); await sleep(400); await page.screenshot({ path: shotDir + '/m_' + n + '.png' }); await G(() => { window.__rivora.paused = false; }); };
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await simWait(1.2); await shot('run'); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
await simWait(1); await page.keyboard.down('KeyW'); await G(() => { window.__rivora.player.walkMode = true; }); await simWait(0.6); await shot('jog'); await page.keyboard.up('KeyW'); await simWait(0.8);
await page.keyboard.down('KeyJ'); await sleep(60); await page.keyboard.up('KeyJ'); await simWait(0.18); await shot('punch');
await simWait(0.6); await page.keyboard.down('KeyK'); await sleep(60); await page.keyboard.up('KeyK'); await simWait(0.22); await shot('kick');
await simWait(0.8); await page.keyboard.down('KeyC'); await sleep(80); await page.keyboard.up('KeyC'); await simWait(0.8); await shot('crouch'); await page.keyboard.down('KeyC'); await sleep(80); await page.keyboard.up('KeyC'); await simWait(0.5);
// drive a real car
const ok = await G(() => { const g = window.__rivora; const v = g.vehicles.list.find((q) => q.m.real && q.type === 'car' && !q.traffic && !q.display && q.owner !== 'police'); if (!v) return 'none'; const d = v.doorWorld(1); g.player.teleport(d.x, 0.15, d.z, v.heading); return v.spec.name; });
console.log('car', ok); await simWait(0.4); await page.keyboard.down('KeyF'); await sleep(250); await page.keyboard.up('KeyF'); await simWait(2);
console.log('state', await G(() => window.__rivora.player.state));
await G(() => { const g = window.__rivora; g.cam.cine = null; }); await page.keyboard.down('KeyW'); await simWait(1.5); await shot('drive'); await page.keyboard.up('KeyW');
await G(() => { const g = window.__rivora, v = g.player.vehicle, p = v.pos, hd = v.heading; g.cam.play([{ pos: [p.x + Math.sin(hd + 1.2) * 4, p.y + 1.6, p.z + Math.cos(hd + 1.2) * 4], look: [p.x, p.y + 0.8, p.z], t: 999, hold: true }]); }); await simWait(0.3); await shot('car_side', 4.5, 2.3);
await page.keyboard.down('KeyF'); await sleep(250); await page.keyboard.up('KeyF'); await simWait(2);
// NPC close-up (mocap)
await G(() => { const g = window.__rivora; const n = g.npcs.list.filter((n) => n.active && n.object.visible).sort((a, b) => Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) - Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z))[0]; const p = n.pos; g.cam.play([{ pos: [p.x + 3, p.y + 1.5, p.z + 3], look: [p.x, p.y + 1, p.z], t: 999, hold: true }]); window._n = n; });
await simWait(0.3); await sleep(300); await page.screenshot({ path: shotDir + '/m_npc.png' });
console.log(await G(() => JSON.stringify({ st: window._n.state, w: window._n.h.real && window._n.h.real.w.toFixed(2) })));
console.log(logs.slice(0, 10).join('\n')); await b.close();
