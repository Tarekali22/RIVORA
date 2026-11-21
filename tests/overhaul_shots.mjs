// Visual checks for the realism overhaul: Arabic UI, El Nour district, dialogue, weapons, menus.
import { launch, sleep, shotDir } from './harness.mjs';
const lang = process.argv[2] || 'ar';
const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript((l) => { try { localStorage.setItem('rivora.lang', l); } catch (e) {} }, lang);
const page = await ctx.newPage(); const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) logs.push('err: ' + m.text().slice(0, 300)); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto('http://localhost:8777/web/index.html');
const G = (fn, arg) => page.evaluate(fn, arg);
await page.waitForSelector('#title', { timeout: 300000 });
await G(() => { window.__rivora._noBlurPause = true; window.__rivora.testFast = true; });
const snap = async (n) => { await sleep(400); await page.screenshot({ path: `${shotDir}/o_${lang}_${n}.png` }); };
await snap('title');
await page.click('[data-a="settings"]', { noWaitAfter: true, timeout: 120000 }); await sleep(1500); await snap('settings'); await page.keyboard.press('Escape'); await sleep(600);
await page.click('[data-a="new"]', { noWaitAfter: true, timeout: 120000 }); await sleep(1500); await page.click('[data-next]', { noWaitAfter: true, timeout: 120000 }); await sleep(800);
await page.click('.kinds .item >> nth=2', { noWaitAfter: true, timeout: 120000 }); await sleep(300); await G(() => { window.__rivora._skipIntro = true; }); await page.click('[data-go]', { noWaitAfter: true, timeout: 120000 });
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn)) return true; await sleep(300); } return false; };
await until(() => { const g = window.__rivora; return g.running && !g.cutscene && g.player.state === 'foot'; }, 120000);
await G(() => { const g = window.__rivora; g.env.setHour(16.8); });
const view = async (n, pos, look, hideHud) => { await G(([pos, look, hide]) => { const g = window.__rivora; g.paused = true; if (hide) g.ui.showHUD(false); g.camera.position.set(...pos); g.camera.lookAt(...look); g.renderNow(); }, [pos, look, !!hideHud]); await sleep(500); await page.screenshot({ path: `${shotDir}/o_${lang}_${n}.png` }); await G(() => { const g = window.__rivora; g.paused = false; g.ui.showHUD(true); }); };
// walk the hero into El Nour (teleport) and let people spawn
await G(() => { const g = window.__rivora; g.player.teleport(-224, 0.15, 276, -Math.PI / 2); });
const simWait = async (sec) => { const t0 = await G(() => window.__rivora.time); while ((await G(() => window.__rivora.time)) - t0 < sec) await sleep(100); };
await simWait(2.5);
await view('ahwa', [-212, 6.5, 300], [-229, 3, 266], true);
await view('street', [-360, 2.2, 150], [-360, 9, 245], true);
await view('mosque', [-205, 3, 175], [-246, 18, 125], true);
await view('roofs', [-300, 40, 160], [-380, 15, 300], true);
console.log('district', await G(() => { const g = window.__rivora, L = g.city.bldList || []; return JSON.stringify({ egypt: L.filter((q) => q.kind === 'egypt').length, signs: !!g.city.nourSignMat, residents: g.nour.residents.length, hassan: g.nour.hassan && g.nour.hassan.name, district: g.npcs.list.filter((n) => n.active && n.pos.x < -220 && n.pos.x > -500 && n.pos.z > 100 && n.pos.z < 380).length }); }));
// talk to Hassan
await G(() => { const g = window.__rivora; const h = g.nour.hassan; g.player.teleport(h.pos.x + 1.6, 0.15, h.pos.z, -Math.PI / 2); });
await simWait(1);
const ok = await G(() => { const g = window.__rivora; g.dialogue.open(g.nour.hassan); return !!g.dialogue.ov; });
await G(() => { const g = window.__rivora; g.dialogue.send(document.body.classList.contains('rtl') ? 'ازيك يا عم حسن؟' : 'Hi, how are you?'); });
await simWait(1); await sleep(800);
await G(() => { const g = window.__rivora, h = g.nour.hassan, p = g.player.pos; g.paused = true; g.camera.position.set(p.x + 2.2, p.y + 1.9, p.z + 2.4); g.camera.lookAt(h.pos.x, h.pos.y + 1.4, h.pos.z); g.renderNow(); });
await sleep(400); await page.screenshot({ path: `${shotDir}/o_${lang}_dialogue.png` }); await G(() => { window.__rivora.paused = false; });
console.log('dialogue', ok, await G(() => document.querySelector('.dlg-line') && document.querySelector('.dlg-line').textContent));
await G(() => { const g = window.__rivora; g.dialogue.send(document.body.classList.contains('rtl') ? 'فين أقرب مطعم؟' : 'where is the nearest restaurant?'); });
await simWait(0.6); await sleep(1500); console.log('directions', await G(() => [...document.querySelectorAll('.dlg-line')].map((e) => e.textContent).join(' || ')), await G(() => JSON.stringify(window.__rivora.ui.waypoint)), await G(() => JSON.stringify(window.__rivora.dialogue.log.slice(-4))));
await G(() => window.__rivora.dialogue.close());
// weapons: equip pistol, aim, fire
await G(() => { const g = window.__rivora; g.player.teleport(-215, 0.15, 330, Math.PI); g.weapons.select('pistol'); });
await simWait(0.5);
await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await simWait(0.6);
const fire = await G(() => { const g = window.__rivora, w = g.weapons, before = w.inv.pistol.clip; w.fire(true); return before + '->' + w.inv.pistol.clip; });
await simWait(0.15); await snap('aim');
await G(() => { const g = window.__rivora, P = g.player, h = P.heading; g.paused = true; g.weapons.pose(P.h); P.h.real && P.h.real.sync(0.016, P.h, {}, 'loco'); g.camera.position.set(P.pos.x + Math.sin(h + 1.5) * 3.2, P.pos.y + 1.5, P.pos.z + Math.cos(h + 1.5) * 3.2); g.camera.lookAt(P.pos.x, P.pos.y + 1.2, P.pos.z); g.renderNow(); });
await sleep(400); await page.screenshot({ path: `${shotDir}/o_${lang}_aimside.png` }); await G(() => { window.__rivora.paused = false; }); await page.mouse.up({ button: 'right' });
console.log('fire', fire, await G(() => JSON.stringify({ wanted: window.__rivora.police.level, armor: window.__rivora.player.armor })));
// phone + map in this language
await G(() => { window.__rivora.phone.toggle(); }); await sleep(1200); await snap('phone'); await G(() => window.__rivora.phone.close());
const miss = await G(() => [...(window.__i18nMissing ? window.__i18nMissing : [])].slice(0, 5));
console.log('missingSample', await G(() => { try { return JSON.stringify([...window.__rivora_i18n.missing].slice(0, 60)); } catch (e) { return 'n/a'; } }));
console.log(logs.slice(0, 12).join('\n')); await b.close();
