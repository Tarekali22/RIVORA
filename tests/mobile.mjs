// Mobile checks on an emulated landscape phone: touch stick, touch camera, buttons, layout overlap.
import { launch, openGame, sleep, shotDir } from './harness.mjs';
const results = []; const ok = (n, p, i = '') => { results.push({ n, p }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const b = await launch();
const { page, logs } = await openGame(b, { device: 'Pixel 7 landscape' });
const G = (fn, a) => page.evaluate(fn, a);
await page.waitForSelector('#title', { timeout: 120000 });
ok('Touch device detected', await G(() => document.body.classList.contains('touch')));
await G(() => { const g = window.__rivora; g._noBlurPause = true; g.testFast = true; g._skipIntro = true; document.getElementById('title').remove(); g.audio.start(); g.newGame({ kind: 'dog', name: 'Rocket' }); });
await page.waitForFunction(() => window.__rivora.running && !window.__rivora.cutscene, null, { timeout: 60000 });
await sleep(1500);
ok('Touch controls visible', await page.isVisible('#touch') && (await page.$$('#tbtns button')).length >= 6);
const vp = page.viewportSize();
const rects = await G(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }; return { btns: [...document.querySelectorAll('#tbtns button, #ttop button')].map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }), mm: r('#mmc'), money: r('#money'), obj: r('#objective'), hp: r('#hpArc') }; });
const inter = (a, c) => a && c && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
const overlaps = rects.btns.filter((bt) => inter(bt, rects.mm) || inter(bt, rects.money));
const offscreen = rects.btns.filter((bt) => bt.x < 0 || bt.y < 0 || bt.x + bt.w > vp.width || bt.y + bt.h > vp.height);
const small = rects.btns.filter((bt) => bt.w < 44 || bt.h < 44);
ok('Buttons do not cover minimap or money', overlaps.length === 0, `${overlaps.length} overlaps`);
ok('All touch buttons on screen and thumb-sized (>=44px)', offscreen.length === 0 && small.length === 0, `${offscreen.length} off, ${small.length} small`);
// joystick drag
const touch = async (type, x, y, id = 1, sel = '#touch .lz') => G(({ type, x, y, id, sel }) => { const el = document.querySelector(sel); const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); }, { type, x, y, id, sel });
const p0 = await G(() => ({ x: window.__rivora.player.pos.x, z: window.__rivora.player.pos.z }));
await touch('touchstart', 140, 260); await touch('touchmove', 140, 200); await sleep(2500);
await page.screenshot({ path: shotDir + '/20_mobile.png' });
await touch('touchend', 140, 200);
const p1 = await G(() => ({ x: window.__rivora.player.pos.x, z: window.__rivora.player.pos.z }));
ok('Virtual joystick moves the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2, Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2) + ' m');
const y0 = await G(() => window.__rivora.cam.yaw);
await touch('touchstart', 600, 150, 2, '#touch .rz'); for (let i = 1; i <= 8; i++) { await touch('touchmove', 600 + i * 15, 150, 2, '#touch .rz'); await sleep(30); } await touch('touchend', 720, 150, 2, '#touch .rz'); await sleep(200);
const y1 = await G(() => window.__rivora.cam.yaw); ok('Touch drag rotates camera', Math.abs(y1 - y0) > 0.2, (y1 - y0).toFixed(2));
const punch = await G(async () => { const btn = [...document.querySelectorAll('#tbtns button')].find((e) => e.textContent === 'PUNCH'); const t = new Touch({ identifier: 3, target: btn, clientX: 1, clientY: 1 }); btn.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 120)); const a = window.__rivora.player.action && window.__rivora.player.action.name; btn.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true, cancelable: true })); return a; });
ok('PUNCH button triggers an attack', !!punch, String(punch));
// context buttons swap in a vehicle
await G(() => { const g = window.__rivora; const v = g.vehicles.list.find((q) => q.ownedId); g.vehicles.enter(v); }); await sleep(800);
const labels = await G(() => [...document.querySelectorAll('#tbtns button')].map((e) => e.textContent));
ok('Vehicle context buttons appear', labels.includes('EXIT') && labels.includes('BRAKE'), labels.join(','));
await page.screenshot({ path: shotDir + '/21_mobile_drive.png' });
// portrait hint
await page.setViewportSize({ width: vp.height, height: vp.width }); await sleep(600);
ok('Portrait shows rotate-device notice', await page.isVisible('#rotate'));
const errs = logs.filter((l) => !l.includes('ERR_FAILED') && !l.includes('deprecated') && !l.includes('GL Driver') && !l.includes('GPU stall'));
ok('No runtime errors (mobile)', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${results.filter((r) => r.p).length}/${results.length} mobile checks passed`);
await b.close();
