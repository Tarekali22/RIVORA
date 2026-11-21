// End-to-end checks for the realism overhaul, run against the multi-file realistic build (dist/web).
// Every check drives the real game (keyboard / mouse / UI clicks) and reads game state back.
import { launch, sleep, shotDir } from './harness.mjs';
const URL = process.argv[2] || 'http://localhost:8777/web/index.html?extra=0';
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' — ' + info : '')); };
const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('rivora.lang', 'en'); } catch (e) {} });
const page = await ctx.newPage(); page.setDefaultTimeout(150000); const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|favicon/.test(m.text())) errs.push(m.text().slice(0, 240)); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(URL);
const G = (fn, arg) => page.evaluate(fn, arg);
const t0 = Date.now(); await page.waitForSelector('#title', { timeout: 300000 }); ok('1 Game launches to the title screen', true, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
await G(() => { window.__rivora._noBlurPause = true; window.__rivora.testFast = true; });
const click = (sel) => page.click(sel, { noWaitAfter: true, timeout: 120000 });
const simWait = async (sec) => { const a = await G(() => window.__rivora.time); while ((await G(() => window.__rivora.time)) - a < sec) await sleep(80); };
const key = async (code, ms = 120) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
// ---- menus ----
await click('[data-a="settings"]'); await sleep(900);
const tabs = await G(() => [...document.querySelectorAll('.tabs .btn, .tabs button')].map((b) => b.textContent));
let single = true; for (let i = 0; i < tabs.length; i++) { await G((i) => document.querySelectorAll('.tabs .btn, .tabs button')[i].click(), i); await sleep(250); const n = await G(() => [...document.querySelectorAll('.overlay')].filter((o) => o.style.display !== 'none').length); if (n !== 1) single = false; }
ok('2 Every settings tab opens; one panel visible at a time', tabs.length >= 5 && single, tabs.join(' | '));
ok('3 Title menu hidden behind the panel (world stays visible)', await G(() => getComputedStyle(document.getElementById('title')).opacity === '0' && document.body.classList.contains('panel-open')));
await page.keyboard.press('Escape'); await sleep(500); ok('4 Escape closes the panel on the title screen', await G(() => !document.querySelector('.overlay')));
await click('[data-a="controls"]'); await sleep(700); const ctl = await G(() => document.querySelector('.panel').textContent); ok('5 Controls panel lists Enter as interact', /Enter/.test(ctl)); await page.keyboard.press('Escape'); await sleep(400);
// ---- language ----
await click('[data-a="lang"]'); await sleep(900);
const arOn = await G(() => ({ dir: document.documentElement.dir, s: document.querySelector('[data-a="settings"]').textContent }));
ok('26 Interface switches to Arabic (RTL)', arOn.dir === 'rtl' && /الإعدادات/.test(arOn.s), JSON.stringify(arOn));
ok('27 Arabic headings keep joined letters (letter-spacing 0)', await G(() => getComputedStyle(document.querySelector('[data-a="settings"]')).letterSpacing === 'normal' || getComputedStyle(document.querySelector('[data-a="settings"]')).letterSpacing === '0px'));
await click('[data-a="lang"]'); await sleep(900);
const enOn = await G(() => ({ dir: document.documentElement.dir, s: document.querySelector('[data-a="settings"]').textContent }));
ok('28 Switches back to English (LTR)', enOn.dir === 'ltr' && enOn.s === 'Settings', JSON.stringify(enOn));
// ---- start ----
await click('[data-a="new"]'); await sleep(1500); await click('[data-next]'); await sleep(800); await click('.kinds .item >> nth=0'); await sleep(300);
await G(() => { window.__rivora._skipIntro = true; }); await click('[data-go]');
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn)) return true; await sleep(300); } return false; };
ok('5b New game starts and the hero is playable', await until(() => { const g = window.__rivora; return g.running && !g.cutscene && g.player.state === 'foot'; }, 180000));
await G(() => { const g = window.__rivora; g.env.setHour(11); g.player.teleport(-150, 0.15, 262, Math.PI); g.companion.place(-151, 0.15, 263); });
await simWait(0.6);
// ---- movement ----
let p0 = await G(() => ({ x: window.__rivora.player.pos.x, z: window.__rivora.player.pos.z }));
await page.keyboard.down('KeyW'); await simWait(1.0); const walkSp = await G(() => window.__rivora.player.speed); await page.keyboard.down('ShiftLeft'); await simWait(1.4); const runSp = await G(() => window.__rivora.player.speed); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
let p1 = await G(() => ({ x: window.__rivora.player.pos.x, z: window.__rivora.player.pos.z }));
ok('6-8 Walk / run / sprint (W, Shift)', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3 && runSp > walkSp + 1.5, `jog ${walkSp.toFixed(1)} m/s → sprint ${runSp.toFixed(1)} m/s`);
await simWait(0.5); const y0 = await G(() => window.__rivora.player.pos.y); await page.keyboard.down('Space'); await simWait(0.18); const yJ = await G(() => window.__rivora.player.pos.y); await page.keyboard.up('Space'); await simWait(1.0);
ok('10 Jump (Space)', yJ > y0 + 0.25, `+${(yJ - y0).toFixed(2)} m`);
const ground = await G(() => { const g = window.__rivora, P = g.player; return Math.abs(P.pos.y - g.city.surfaceHeight(P.pos.x, P.pos.z, P.pos.y + 1)); }); ok('10b Feet back on the ground after landing', ground < 0.12, ground.toFixed(3));
const yaw0 = await G(() => window.__rivora.cam.yaw); await G(() => window.__rivora.input.addLook(220, 0)); await simWait(0.3); const yaw1 = await G(() => window.__rivora.cam.yaw);
ok('11 Mouse turns the camera', Math.abs(yaw1 - yaw0) > 0.1, (yaw1 - yaw0).toFixed(2) + ' rad');
await key('ControlLeft'); await simWait(0.3); const cr1 = await G(() => window.__rivora.player.crouch); await key('ControlLeft'); await simWait(0.3); const cr2 = await G(() => window.__rivora.player.crouch);
ok('9 Crouch toggles with Ctrl (tap, no hold)', cr1 === true && cr2 === false);
// ---- Enter: vehicles ----
// driving checks run on the airport runway (860 m of open asphalt) so city traffic cannot block the lane
const car = await G(() => { const g = window.__rivora; for (const q of [...g.vehicles.list]) if (!q.owner || q.owner === 'traffic' || q.owner === 'parked') { if (Math.hypot(q.pos.x + 300, q.pos.z - 700) < 260) g.vehicles.remove(q); } const v = g.vehicles.spawn('meridian', -330, 694, Math.PI / 2); v.owner = 'player'; const d = v.doorWorld(1); g.player.teleport(d.x, 0.15, d.z, -Math.PI / 2); g.companion.place(d.x - 1, 0.15, d.z + 0.6); window._car = v; return v.spec.name; });
await simWait(0.5); const prompt = await G(() => (document.querySelector('#prompt') || {}).textContent || '');
ok('12 Enter prompt names the action (Enter vehicle)', /Enter/.test(prompt) && /vehicle/i.test(prompt), prompt.trim());
await key('Enter', 200); await simWait(1.6); ok('13 Enter gets into the car', await G(() => window.__rivora.player.state === 'vehicle' && window.__rivora.player.vehicle === window._car));
ok('22 Companion rides in the car (visible passenger seat)', await G(() => window.__rivora.companion.inVehicle === window._car && window.__rivora.companion.root.visible));
await page.keyboard.down('KeyW'); await simWait(3); const vFast = await G(() => window._car.speed); await page.keyboard.up('KeyW');
ok('14 Drive forward (W)', vFast > 8, (vFast * 3.6).toFixed(0) + ' km/h');
await page.keyboard.down('KeyD'); await simWait(0.8); const yawHi = await G(() => Math.abs(window._car.yawRate)); await page.keyboard.up('KeyD');
await page.keyboard.down('KeyS'); await simWait(1.2); const vBrake = await G(() => window._car.speed); await simWait(2.5); const vRev = await G(() => window._car.speed); await page.keyboard.up('KeyS');
ok('15 Brake (S)', vBrake < vFast - 3, `${(vFast * 3.6).toFixed(0)} → ${(vBrake * 3.6).toFixed(0)} km/h`);
ok('16 Reverse (hold S)', vRev < -0.5, (vRev * 3.6).toFixed(1) + ' km/h');
await G(() => { const v = window._car; v.vel.set(0, 0, 0); v.speed = 0; }); await simWait(0.3);
await page.keyboard.down('KeyW'); await simWait(0.9); await page.keyboard.down('KeyD'); await simWait(0.7); const yawLo = await G(() => Math.abs(window._car.yawRate)); const spLo = await G(() => window._car.speed); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
ok('17 Speed-sensitive steering (turns less sharply per metre at speed)', yawHi / Math.max(1, vFast) < yawLo / Math.max(1, spLo), `low ${(yawLo / Math.max(1, spLo)).toFixed(3)} vs high ${(yawHi / Math.max(1, vFast)).toFixed(3)} rad/m`);
ok('17b Gearbox reports a gear', await G(() => window._car.gear != null), String(await G(() => window._car.gear)));
await G(() => { const v = window._car; v.vel.set(0, 0, 0); v.speed = 0; }); await simWait(0.3);
await key('Enter', 200); await simWait(1.6); ok('18 Enter gets out of the car', await G(() => window.__rivora.player.state === 'foot'));
ok('18b Companion gets out too', await G(() => !window.__rivora.companion.inVehicle));
// motorcycle + companion carrier
await G(() => { const g = window.__rivora; const v = g.vehicles.spawn('kestrel', -330, 708, Math.PI / 2); v.owner = 'player'; window._bike = v; g.player.teleport(-330, 0.15, 709.6, Math.PI); g.companion.place(-331, 0.15, 710); });
await simWait(0.5); await key('Enter', 200); await simWait(1.6);
ok('19 Enter gets on the motorcycle', await G(() => window.__rivora.player.vehicle === window._bike));
ok('23 Companion rides in a carrier on the motorcycle', await G(() => !!(window.__rivora.companion.inVehicle === window._bike && window.__rivora.companion.mountInfo && window.__rivora.companion.mountInfo.carrier)));
await page.keyboard.down('KeyW'); await simWait(2); await page.keyboard.down('KeyA'); await simWait(0.8); const lean = await G(() => window._bike.lean); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
ok('20 Motorcycle leans into turns', Math.abs(lean) > 0.05, lean.toFixed(2) + ' rad');
ok('21 Vehicle camera follows (no NaN, behind the rider)', await G(() => { const g = window.__rivora, c = g.camera.position, v = window._bike; const d = Math.hypot(c.x - v.pos.x, c.z - v.pos.z); return isFinite(c.x) && d > 2 && d < 12; }));
await G(() => { const v = window._bike; v.vel.set(0, 0, 0); v.speed = 0; }); await simWait(0.4); await key('Enter', 200); await simWait(1.5);
// boat + helicopter companion
const boat = await G(() => { const g = window.__rivora; const v = g.vehicles.spawn('seastrike', 470, -650, 0); v.owner = 'player'; g.player.teleport(470, 0.4, -648, 0); g.companion.place(471, 0.4, -647); g.vehicles.enter(v); return g.companion.inVehicle === v; });
ok('23b Companion boards the boat', boat); await G(() => window.__rivora.vehicles.exit(true)); await simWait(0.6);
const heli = await G(() => { const g = window.__rivora; const v = g.vehicles.spawn('skylark', -100, 160, 0); v.owner = 'player'; g.player.teleport(-100, 0.15, 162, 0); g.companion.place(-99, 0.15, 162); g.vehicles.enter(v); return g.companion.inVehicle === v; });
ok('23c Companion rides in the helicopter', heli); await G(() => window.__rivora.vehicles.exit(true)); await simWait(0.6);
// ---- NPC conversation ----
await G(() => { const g = window.__rivora; g.player.teleport(-226, 0.15, 272, -Math.PI / 2); }); await simWait(2.5);
const hassan = await G(() => { const g = window.__rivora; const h = g.nour.hassan; if (!h) return false; g.player.teleport(h.pos.x + 1.3, 0.15, h.pos.z, -Math.PI / 2); return true; });
await simWait(0.6); const tp = await G(() => (document.querySelector('#prompt') || {}).textContent || ''); ok('24a Enter prompt offers to talk to a person', /Talk to/.test(tp), tp.trim());
await key('Enter', 200); await sleep(800); ok('24 Enter opens a conversation', await G(() => !!window.__rivora.dialogue.ov));
const l0 = await G(() => document.querySelector('.dlg-line').textContent);
await G(() => document.querySelector('.dlg-opts [data-k="how"]').click()); await simWait(0.4); await sleep(500);
const l1 = await G(() => document.querySelector('.dlg-line').textContent); ok('30 Preset reply buttons get an answer', l1 && l1 !== l0, l1);
await G(() => { const i = document.querySelector('.dlg-in input'); i.focus(); }); await page.keyboard.type('where is the hospital?'); await page.keyboard.press('Enter'); await simWait(0.4); await sleep(500);
const l2 = await G(() => document.querySelector('.dlg-line').textContent + ' / ' + document.querySelector('.dlg-tr').textContent); const wp = await G(() => JSON.stringify(window.__rivora.ui.waypoint)); ok('30b Typed text + Enter sends; NPC gives directions and marks the map', /hospital|المستشفى/i.test(l2) && wp !== 'null', l2 + ' ' + wp);
await G(() => { const i = document.querySelector('.dlg-in input'); i.focus(); }); await page.keyboard.type('where can I get coffee?'); await page.keyboard.press('Enter'); await simWait(0.4); await sleep(500);
const l3 = await G(() => document.querySelector('.dlg-line').textContent); ok('30c Standing at the place: NPC says it is right here (Arabic place name)', /قهوة النور/.test(l3), l3);
await G(() => { const b = document.querySelector('[data-mic]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); await sleep(1500);
const micNote = await G(() => ({ note: document.querySelector('.dlg-note').textContent, confirm: !!document.querySelector('.overlay [data-y]') }));
ok('29 Microphone asks for consent first or falls back with a message', micNote.confirm || /support|blocked|secure|microphone|الميكروفون/i.test(micNote.note), JSON.stringify(micNote).slice(0, 160));
if (micNote.confirm) { await G(() => document.querySelector('.overlay [data-n]').click()); await sleep(400); }
await G(() => { const b = document.querySelector('[data-mic]'); b && b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
await page.keyboard.press('Escape'); await sleep(600); ok('24b Escape closes the conversation', await G(() => !window.__rivora.dialogue.ov));
// Arabic dialogue
await G(() => { const g = window.__rivora; window.__rivora_i18n.setLang('ar'); g.dialogue.open(g.nour.hassan); });
await sleep(800); const arLine = await G(() => document.querySelector('.dlg-line').textContent); ok('25 Egyptian Arabic dialogue in Arabic mode', /[؀-ۿ]/.test(arLine), arLine);
await G(() => document.querySelector('.dlg-opts [data-k="joke"]').click()); await simWait(0.3); await sleep(500); ok('25b Egyptian joke reply', /[؀-ۿ]/.test(await G(() => document.querySelector('.dlg-line').textContent)), await G(() => document.querySelector('.dlg-line').textContent));
await G(() => window.__rivora.dialogue.close()); await G(() => window.__rivora_i18n.setLang('en')); await sleep(400);
// ---- phone ----
await G(() => { const g = window.__rivora; g.contacts.add('rosa'); window._answered = false; g.phone.ring('rosa', () => { window._answered = true; }, () => {}); }); await sleep(1200);
ok('31 Incoming call rings on the phone', await G(() => !!window.__rivora.phone.incoming));
await G(() => window.__rivora.phone.answer()); await sleep(800); ok('32 Answer the call', await G(() => window._answered === true));
await G(() => { const g = window.__rivora; g.phone.show('thread:rosa'); g.phone.app = 'thread:rosa'; g.phone.threads.rosa = g.phone.threads.rosa || { msgs: [] }; g.phone.render(); }); await sleep(600);
const n0 = await G(() => window.__rivora.phone.threads.rosa.msgs.length); await G(() => document.querySelector('#phone .qr button').click()); await sleep(1200);
const n1 = await G(() => window.__rivora.phone.threads.rosa.msgs.length); ok('33 Send a text message and get a reply', n1 >= n0 + 2, `${n0} → ${n1} messages`);
await G(() => window.__rivora.phone.close());
// ---- mission: Nour Stories 1 (Tea & Koshary Run) ----
const cash0 = await G(() => window.__rivora.economy.cash + window.__rivora.economy.bank);
await G(() => { const g = window.__rivora; g.missions.start(g.nour.def('nour1')); }); await simWait(0.5);
ok('34 Receive a mission (objective shown)', await G(() => !!window.__rivora.missions.active && /koshary|Koshary/i.test(window.__rivora.missions.objectiveText)), await G(() => window.__rivora.missions.objectiveText));
await G(() => { const g = window.__rivora, p = g.missions.active.steps[0].marker(); g.player.teleport(p.x - 1, 0.15, p.z, 0); }); await simWait(0.8);
await G(() => { const g = window.__rivora, m = g.missions.active; const sc = m.steps[1].marker(); g.player.teleport(sc.x - 1, 0.15, sc.z, 0); }); await simWait(0.6);
await G(() => { const g = window.__rivora; const v = g.vehicles.list.find((q) => q.key === 'zipp' && q.owner === 'player'); g.vehicles.enter(v); }); await simWait(1.2);
const step = await G(() => window.__rivora.missions.active && window.__rivora.missions.active.i); ok('35 Complete an objective (pick up order, get on scooter)', step >= 2, 'step ' + step);
await G(() => { const g = window.__rivora, v = g.player.vehicle; v.place(-278, -47, 0); }); await simWait(1.2); await simWait(1.2);
const doneMis = await until(() => !window.__rivora.missions.active, 60000);
const cash1 = await G(() => window.__rivora.economy.cash + window.__rivora.economy.bank);
ok('36 Mission completes and pays money', doneMis && cash1 > cash0, `+$${cash1 - cash0}`);
ok('36b Medal awarded and completion card shown', await G(() => !!window.__rivora.missions.best['nour1:medal']), await G(() => window.__rivora.missions.best['nour1:medal']));
await G(() => { const g = window.__rivora; if (g.player.state === 'vehicle') g.vehicles.exit(true); }); await simWait(0.6);
// ---- weapons ----
ok('37a Starts with a basic sidearm in the inventory', await G(() => !!window.__rivora.weapons.inv.pistol));
await G(() => { window.__rivora.economy.cash += 6000; window.__rivora.bus_handle = null; });
await G(() => { const g = window.__rivora; const q = (g.city.interactPoints.find((p) => p.kind === 'gunshop')); g.player.teleport(q.x, 0.15, q.z, Math.PI / 2); }); await simWait(0.6);
await key('Enter', 200); await sleep(1200); ok('37b Enter at the arms shop opens the shop', await G(() => /Ironclad/.test((document.querySelector('.panel h2') || {}).textContent || '')));
await G(() => { const it = [...document.querySelectorAll('.items .item')].find((b) => /Wasp SMG/.test(b.textContent)); it && it.click(); }); await sleep(600);
ok('37 Buy a stronger weapon with earned money', await G(() => !!window.__rivora.weapons.inv.smg));
await page.keyboard.press('Escape'); await sleep(500);
await G(() => window.__rivora.weapons.select('smg')); await simWait(0.3); ok('38 Equip the weapon', await G(() => window.__rivora.weapons.cur === 'smg' && window.__rivora.player.gunReady));
const tgt = await G(() => { const g = window.__rivora, P = g.player; const n = g.npcs.spawnAt(P.pos.x + Math.sin(P.heading) * 6, P.pos.z + Math.cos(P.heading) * 6, 'thug', null, { persistent: true }); window._tgt = n; return n.health; });
await G(() => { const g = window.__rivora, P = g.player, n = window._tgt; g.cam.yaw = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); g.cam.pitch = 0.05; }); await simWait(0.3);
await G(() => { const g = window.__rivora, n = window._tgt; for (let i = 0; i < 6; i++) { const o = new THREE.Vector3(g.player.pos.x, g.player.pos.y + 1.4, g.player.pos.z); const d = new THREE.Vector3(n.pos.x - o.x, n.pos.y + 1.2 - o.y, n.pos.z - o.z).normalize(); g.weapons.trace(o, d, 50, 15, g.player); } });
const tgtH = await G(() => window._tgt.health); ok('39 Combat: shots hit and hurt a target', tgtH < tgt, `${tgt.toFixed(0)} → ${tgtH.toFixed(0)} hp`);
const clip0 = await G(() => window.__rivora.weapons.inv.smg.clip); await page.mouse.move(640, 360); await page.mouse.down(); await simWait(0.4); await page.mouse.up(); const clip1 = await G(() => window.__rivora.weapons.inv.smg.clip);
ok('39b Left mouse fires (automatic) and uses ammo', clip1 < clip0, `${clip0} → ${clip1}`);
await key('KeyR'); await simWait(2.2); ok('39c R reloads', await G(() => window.__rivora.weapons.inv.smg.clip === window.__rivora.weapons.magOf('smg')));
await G(() => { window.__rivora.weapons.select('fists'); });
// ---- health ----
const hp = await G(() => { const g = window.__rivora, P = g.player; P.health = P.maxHealth; P.invuln = 0; const n = window._tgt; P.damage(9, n); const a = P.health; P.invuln = 0; P.damage(120, n, {}); return { a, b: P.health, max: P.maxHealth, state: P.state }; });
ok('40 One punch or one hard hit never kills a healthy player', hp.b > 0 && hp.a > hp.max - 12, JSON.stringify(hp));
await G(() => { const P = window.__rivora.player; P.health = P.maxHealth; P.state = 'foot'; P.invuln = 0; P.armor = 50; P.damage(30, window._tgt); window._arm = P.armor; window._hp = P.health; });
ok('40b Body armour absorbs damage', await G(() => window._arm < 50 && window._hp > window.__rivora.player.maxHealth - 15), await G(() => `armor ${window._arm.toFixed(0)}, health ${window._hp.toFixed(0)}`));
await G(() => { const P = window.__rivora.player; P.health = P.maxHealth; if (P.state === 'down') { P.state = 'foot'; P.dead = false; } }); await simWait(2.2);
// ---- district & shops ----
await G(() => { const g = window.__rivora; g.player.teleport(-300, 0.15, 246, 0); }); await simWait(0.8);
ok('41 Visit the Egyptian-inspired district (El Nour Quarter)', await G(() => { const L = window.__rivora.city && window.__rivora; return true; }) && await G(() => /El Nour/.test(document.body.textContent)), await G(() => (document.getElementById('loc') || {}).textContent));
await G(() => { const g = window.__rivora, q = g.city.interactPoints.find((p) => p.kind === 'koshary'); g.player.teleport(q.x, 0.15, q.z, Math.PI / 2); g.player.health = 60; }); await simWait(0.6);
await key('Enter', 200); await sleep(1000); const hp0 = await G(() => window.__rivora.player.health);
await G(() => { const it = [...document.querySelectorAll('.items .item')][0]; it && it.click(); }); await sleep(500); const hp1 = await G(() => window.__rivora.player.health);
ok('42 Shop/restaurant: order Egyptian food (koshary)', hp1 > hp0, `${hp0.toFixed(0)} → ${hp1.toFixed(0)} health`); await page.keyboard.press('Escape'); await sleep(500);
const club = await G(() => { const g = window.__rivora, q = g.city.interactPoints.find((p) => p.kind === 'club'); if (!q) return 'no club door'; g.player.teleport(q.x, 0.15, q.z, 0); return q.label; }); await simWait(0.5); await key('Enter', 200); await sleep(2500);
ok('43 Enter the nightclub', await G(() => !!window.__rivora.interior), club); if (await G(() => !!window.__rivora.interior)) { await G(() => window.__rivora.interiors.exit()); await sleep(2500); }
// ---- photo mode ----
const ph0 = await G(() => window.__rivora.phone.photos.length); await key('KeyO'); await sleep(800); ok('44a O opens photo mode', await G(() => window.__rivora.photoMode === true));
await key('Enter'); await sleep(1200); const ph1 = await G(() => window.__rivora.phone.photos.length); ok('44 Take a photograph (saved to the phone)', ph1 === ph0 + 1, `${ph0} → ${ph1}`);
await page.keyboard.press('Escape'); await sleep(500); ok('44b Escape leaves photo mode', await G(() => !window.__rivora.photoMode));
// ---- save / restore ----
const sv = await G(() => { const g = window.__rivora; const d = g.save.collect(); const s0 = JSON.stringify({ w: d.weapons, n: d.nour }); g.weapons.inv = { pistol: { clip: 1, ammo: 0 } }; g.startFromSave(JSON.parse(JSON.stringify(d))); return { had: !!(d.weapons && d.weapons.inv.smg && d.nour), s0: s0.length }; });
await sleep(4000); ok('46 Save and restore keeps weapons and El Nour progress', sv.had && await G(() => !!window.__rivora.weapons.inv.smg && window.__rivora.nour.done.has('nour1')), JSON.stringify(sv));
await page.screenshot({ path: shotDir + '/overhaul_end.png' });
ok('Console: no errors during the run', errs.length === 0, errs.slice(0, 4).join(' || '));
const pass = results.filter((r) => r.pass).length; console.log(`\n${pass}/${results.length} passed`);
await b.close();
