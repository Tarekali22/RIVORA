// RIVORA — game bootstrap, main loop and cross-system glue.
import { clamp, lerp, R, bus, dist2, fmtTime, isTouch, fmtMoney } from './core/util.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { CameraRig } from './core/camera.js';
import { SaveSystem } from './core/save.js';
import { Environment, WEATHERS } from './world/environment.js';
import { Ocean } from './world/water.js';
import { City } from './world/city.js';
import { Interiors } from './world/interiors.js';
import * as L from './world/layout.js';
import { setAniso } from './world/textures.js';
import { Player } from './actors/player.js';
import { Humanoid, HERO_DEFAULT } from './actors/humanoid.js';
import { NPCManager } from './actors/npc.js';
import { Companion, makeCompanionModel } from './actors/companion.js';
import { VehicleManager, vehicleCircles } from './vehicles/vehicle.js';
import { Traffic } from './vehicles/traffic.js';
import { Combat } from './systems/combat.js';
import { Police } from './systems/police.js';
import { FX } from './systems/fx.js';
import { Economy } from './systems/economy.js';
import { Missions } from './systems/missions.js';
import { Activities } from './systems/activities.js';
import { UI } from './ui/ui.js';
import { Phone } from './ui/phone.js';
import { Menus } from './ui/menus.js';
import { CONTACTS, TIPS } from './data/content.js';

const QUALITY = {
  low: { level: 0, dpr: 1, shadows: false, shadowSize: 1024, traffic: 12, parked: 16, npcs: 16, drawDistance: 650, rainDrops: 1200, npcShadows: false, policeMax: 3 },
  medium: { level: 1, dpr: 1.25, shadows: true, shadowSize: 1024, traffic: 20, parked: 24, npcs: 26, drawDistance: 950, rainDrops: 2400, npcShadows: false, policeMax: 4 },
  high: { level: 2, dpr: 1.75, shadows: true, shadowSize: 2048, traffic: 28, parked: 32, npcs: 38, drawDistance: 1350, rainDrops: 4000, npcShadows: true, policeMax: 6 },
  ultra: { level: 3, dpr: 2, shadows: true, shadowSize: 4096, traffic: 36, parked: 40, npcs: 50, drawDistance: 1800, rainDrops: 5000, npcShadows: true, policeMax: 7 },
};
const DEFAULT_SETTINGS = { quality: 'high', renderScale: 1, shadows: true, autoPerf: true, showFps: false, difficulty: 'normal', violence: 'reduced', smoking: true, autoDeploy: true, showCams: true, subtitles: true, tts: true, textSize: 1, reduceShake: false, reduceFlash: false };

class Game {
  constructor() {
    this.touch = isTouch();
    this.settings = { ...DEFAULT_SETTINGS, quality: this.touch ? 'low' : 'high' };
    this._loadSettings();
    this.quality = { ...QUALITY[this.settings.quality] };
    this.time = 0; this.running = false; this.paused = false; this.interior = null; this.interiorId = null; this.interactTargets = [];
    this.contacts = new Set(); this.relations = {}; this.ownedOutfits = new Set(['striped']); this.gymToday = 0;
    window.__rivora = this; this.L = L; // test/debug handles
    this.signal = (n, t, axis) => (this._forceRed === n.id && axis === 'ns' ? 'red' : L.signalState(n, t, axis));
  }
  async boot() {
    const bar = document.querySelector('#loading .bar i'), msg = document.querySelector('#loading .msg');
    const step = async (p, m) => { bar.style.width = p + '%'; msg.textContent = m; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); };
    await step(5, 'Starting renderer…');
    const view = document.getElementById('view');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !this.touch, powerPreference: 'high-performance', preserveDrawingBuffer: false }); }
    catch (e) { msg.textContent = 'WebGL is not available on this device/browser, so RIVORA cannot run here.'; throw e; }
    this.renderer = renderer; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = this.quality.shadows && this.settings.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    view.appendChild(renderer.domElement); renderer.domElement.tabIndex = 0;
    setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.input = new Input(renderer.domElement); this.audio = new AudioEngine(); this.save = new SaveSystem(this);
    this._applySavedControls();
    await step(12, 'Painting the sky…');
    this.env = new Environment(this.scene, renderer, this.quality); this.env.setHour(17.6);
    this.ocean = new Ocean(this.scene, this.env.uniforms, this.quality);
    await step(22, 'Raising San Aurelia…');
    this.city = new City(this.scene, this.quality);
    await step(55, 'Parking cars, opening shops…');
    this.economy = new Economy(this); this.fx = new FX(this); this.combat = new Combat(this);
    this.vehicles = new VehicleManager(this);
    this.ui = new UI(this); this.phone = new Phone(this); this.menus = new Menus(this); this.activities = new Activities(this);
    this.companionFactory = (k, o) => makeCompanionModel(k, o);
    this.player = new Player(this, HERO_DEFAULT); this.player.teleport(L.SPAWN.x, 0.15, L.SPAWN.z, L.SPAWN.heading);
    this.cam = new CameraRig(this.camera, this);
    this.npcs = new NPCManager(this); this.traffic = new Traffic(this); this.police = new Police(this);
    this.companion = new Companion(this, 'robot', 'Orbi'); this.companion.place(L.SPAWN.x + 1.2, 0.15, L.SPAWN.z - 1);
    await step(75, 'Furnishing interiors…');
    this.interiors = new Interiors(this);
    this.missions = new Missions(this);
    await step(88, 'Compiling shaders…');
    this.player.object.visible = false;
    this.renderer.compile(this.scene, this.camera);
    this._wire();
    await step(100, 'Ready');
    document.getElementById('loading').remove();
    this.ui.setupTouch();
    this.last = performance.now(); this.fpsAcc = 0; this.fpsN = 0; this.fps = 60; this.slowT = 0;
    renderer.setAnimationLoop((t) => { try { this.frame(t); } catch (e) { this._errs = (this._errs || 0) + 1; if (this._errs < 4) { console.error('[RIVORA frame]', e); if (this.ui) this.ui.toast('Something glitched', 'The game recovered from an error and kept running.', 'warn', 3); } } });
    // hot-reload continuity inside the Claude viewer
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) try { hot.snapshot(() => (this.running ? this.save.collect() : null)); } catch (e) {}
    const startTitle = (data) => { if (data && data.game === 'RIVORA') this.startFromSave(data); else this.titleScreen(); };
    if (hot && hot.ready) hot.ready(startTitle); else startTitle(hot && hot.data);
  }
  _wire() {
    bus.on('wasted', () => this._wasted());
    bus.on('newday', () => { this.economy.dailyIncome(); this.gymToday = 0; });
    bus.on('lightning', (d) => { this.audio.thunder(d); if (!this.settings.reduceFlash) this.renderer.toneMappingExposure *= 1; });
    bus.on('vehicleWrecked', (v) => { if (v.driver === 'player') this.ui.toast('Vehicle disabled', 'Get out and find another ride.', 'bad'); });
    this.input.onUnlock = () => { if (this._intentUnlock) { this._intentUnlock = false; return; } if (this.running && !this.ui.blockingUI && !this.phone.open && !this.cutscene) this.menus.pause(); };
    const rel = this.input.releaseLock.bind(this.input); this.input.releaseLock = () => { if (document.pointerLockElement) this._intentUnlock = true; rel(); };
    this.renderer.domElement.addEventListener('click', () => { this.audio.start(); if (this.running && !this.ui.blockingUI && !this.touch && !this.cutscene) this.input.requestLock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.running && !this.paused && !this.ui.panelStack.length) this.menus.pause(); if (this.audio.ctx) { if (document.hidden) this.audio.ctx.suspend(); else this.audio.ctx.resume(); } });
    window.addEventListener('blur', () => { if (this.running && !this.paused && !this.ui.panelStack.length && !this._noBlurPause) this.menus.pause(); });
  }
  // ---------------- settings ----------------
  _loadSettings() { try { const s = JSON.parse(localStorage.getItem('rivora.settings') || 'null'); if (s) Object.assign(this.settings, s.settings || {}), this._savedCtl = s; } catch (e) {} }
  _applySavedControls() { const s = this._savedCtl; if (!s) return; if (s.bindings) this.input.bindings = Object.assign(this.input.bindings, s.bindings); if (s.levels) Object.assign(this.audio.levels, s.levels); if (s.sens) this.input.sens = s.sens; if (s.invertY != null) this.input.invertY = s.invertY; if (s.touchSens) this.input.touchSens = s.touchSens; document.documentElement.style.setProperty('--fs', this.settings.textSize || 1); }
  saveSettings() { try { localStorage.setItem('rivora.settings', JSON.stringify({ settings: this.settings, bindings: this.input.bindings, levels: this.audio.levels, sens: this.input.sens, invertY: this.input.invertY, touchSens: this.input.touchSens })); } catch (e) {} }
  applyQuality(q) { Object.assign(this.quality, QUALITY[q]); this.traffic.max = this.quality.traffic; this.npcs.max = this.quality.npcs; this.env.fogFar = this.quality.drawDistance; this.applyShadows(); this.resize(); }
  applyShadows() { const on = this.quality.shadows && this.settings.shadows; this.renderer.shadowMap.enabled = on; this.env.sun.castShadow = on; this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => x.needsUpdate = true); } }); }
  resize() { const w = window.innerWidth, h = window.innerHeight; const dpr = Math.min(window.devicePixelRatio || 1, this.quality.dpr) * (this.settings.renderScale || 1); this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this._sizeComposer && this._sizeComposer(); }
  timeStr() { return fmtTime(this.env.hour); }
  weatherLabel() { return (WEATHERS[this.env.weatherKey] || {}).label || 'Clear'; }
  // ---------------- flow ----------------
  titleScreen() {
    this.running = false; this.player.object.visible = false; this.companion.root.visible = false; this.ui.showHUD(false);
    this.env.setHour(17.25); this.env.setWeather('clear', true); this.env.autoWeather = false;
    this.player.teleport(120, 0.15, -60); // keep the city alive around downtown
    const shots = [
      { pos: [760, 60, -140], look: [120, 40, -110], t: 14 }, { pos: [560, 26, 120], look: [480, 6, -40], t: 14 },
      { pos: [480, 8, 260], look: [470, 4, 40], t: 12 }, { pos: [-700, 34, 70], look: [100, 30, -100], t: 14 }, { pos: [200, 180, -400], look: [100, 140, -110], t: 12 }, { pos: [760, 60, -140], look: [120, 40, -110], t: 1 },
    ];
    const loop = () => { if (this.running) return; this.cam.play(shots.map((s) => ({ ...s })), loop); };
    loop(); this.menus.title();
  }
  creatorMode(on) {
    if (on) { this.player.teleport(496, 0.3, 42, -Math.PI / 2 - 0.25); this.player.object.visible = true; this.player.state = 'cutscene'; this.player.cutPose = 'loco'; this.cam.cine = null; this.cam.play([{ pos: [492.4, 1.75, 43.6], look: [496.0, 1.18, 41.2], t: 9999, hold: true }, { pos: [492.4, 1.75, 43.6], look: [496.0, 1.18, 41.2], t: 1 }]); this.companion.root.visible = true; this.companion.place(497.5, 0.3, 40.2); }
  }
  newGame(c) {
    const G = this; this.companion.setKind(c.kind, c.name, c.color); this.contacts = new Set(['dani']); this.relations = {};
    this.economy = new Economy(this); this.ownedOutfits = new Set(['striped']);
    const rec = this.vehicles.addOwned('ridgeback', '#b8bec4'); this.vehicles.spawnOwned(rec, -184, 244.9, Math.PI / 2);
    this.env.setHour(17.4); this.env.setWeather('clear', true); this.env.autoWeather = true; this.env.weatherTimer = 900;
    this.player.teleport(L.SPAWN.x, 0.15, L.SPAWN.z, L.SPAWN.heading); this.player.state = 'cutscene'; this.player.cutPose = 'loco';
    this.companion.place(L.SPAWN.x + 1.4, 0.15, L.SPAWN.z - 1.2); this.companion.mode = 'follow';
    this.intro();
  }
  async intro() {
    this.cutscene = true; this.ui.showHUD(false); this.player.object.visible = true; this.companion.root.visible = true; this.running = true;
    const S = L.SPAWN;
    const shots = [{ pos: [900, 140, -420], look: [300, 40, -150], t: 7 }, { pos: [520, 60, -40], look: [60, 20, 60], t: 7 }, { pos: [60, 30, 140], look: [-120, 5, 240], t: 7 }, { pos: [S.x + 3, 2.4, S.z - 6], look: [S.x, 1.4, S.z], t: 3.5 }, { pos: [S.x + 3, 2.4, S.z - 6], look: [S.x, 1.4, S.z], t: 0.5 }];
    let done = false; this.cam.play(shots, () => { done = true; });
    const lines = [['', 'San Aurelia. Twenty kilometres of coastline, a million stories.', 6000], ['', 'You left eight years ago. The city kept moving.', 6000], [this.player.name, 'Home again. Let\'s see who still remembers me.', 5000]];
    for (const [w, l, ms] of lines) { if (this._skipIntro) break; this.ui.subtitle(w, l, ms / 1000); await new Promise((r) => setTimeout(r, ms)); }
    while (!done && !this._skipIntro) await new Promise((r) => setTimeout(r, 100));
    this.cam.cine = null; this.cutscene = false; this.player.state = 'foot'; this.ui.showHUD(true); this.cam.snapBehind();
    this.ui.big('SAN AURELIA', 'Laurel Park · ' + fmtTime(this.env.hour), '#ffe4c9', 3.5);
    this.missions.flags.introDone = true; this.missions.flags.t = 0;
    this._tutorial();
    this.autosave('start');
  }
  async _tutorial() {
    const tips = this.touch ? ['Left side: move. Right side: look around. Buttons change with what you are doing.', 'Your pickup is parked by the curb — walk up and tap ENTER.', 'Tap PHONE (top right) for messages and jobs.'] : ['Click the view to control the camera with the mouse. WASD to move, Shift to sprint, Space to jump.', 'Your electric pickup is parked at the curb — press F next to it to get in.', 'Press P for your phone, M for the map, Esc for the menu.'];
    for (const t of tips) { if (!this.running) return; this.ui.toast('How to play', t, 'info', 7); await new Promise((r) => setTimeout(r, 7500)); }
  }
  startFromSave(d) {
    try {
      document.getElementById('title') && document.getElementById('title').remove();
      this.cam.cine = null; this.creatorMode(false);
      this.player.restore(d.player); this.economy.restore(d.economy); this.env.restore(d.env); this.missions.restore(d.missions); this.phone.restore(d.phone);
      if (d.companion) { this.companion.setKind(d.companion.kind, d.companion.name, d.companion.color); this.companion.mode = d.companion.mode || 'follow'; }
      this.ownedOutfits = new Set(d.outfits || ['striped']); this.contacts = new Set(d.contacts || ['dani']); this.relations = d.relations || {}; this.gymToday = d.gymToday || 0;
      if (d.settings) Object.assign(this.settings, d.settings); if (d.levels) Object.assign(this.audio.levels, d.levels); this.audio.applyLevels();
      this.vehicles.owned = d.owned || [];
      for (const r of this.vehicles.owned) { const p = r.last || [-184, 244.9, Math.PI / 2]; this.vehicles.spawnOwned(r, p[0], p[1], p[2]); }
      if (!d.player.pos) this.player.teleport(L.SPAWN.x, 0.15, L.SPAWN.z, L.SPAWN.heading);
      const P = this.player.pos; if (P.x > 2000) this.player.teleport(L.SPAWN.x, 0.15, L.SPAWN.z, L.SPAWN.heading);
      this.player.state = 'foot'; this.player.object.visible = true; this.companion.root.visible = true; this.companion.place(P.x + 1.2, P.y, P.z - 1);
      this.missions.flags.introDone = true;
      this.running = true; this.cutscene = false; this.ui.showHUD(true); this.cam.snapBehind();
      this.ui.toast('Welcome back', `Day ${this.env.day} · ${fmtMoney(this.economy.cash)} cash`, 'good', 3);
    } catch (e) { console.error(e); this.ui.toast('Could not load save', String(e.message || e), 'bad', 6); this.titleScreen(); }
  }
  autosave(why) { if (!this.running) return false; const ok = this.save.write(); this._lastSave = this.time; return ok; }
  // ---------------- crime / death / arrest ----------------
  crime(type, pos, sev, quiet) { if (!this.running) return; this.police.crime(type, pos, sev, quiet); bus.emit('crime', type, sev); }
  async _wasted() {
    if (this._dying) return; this._dying = true; const P = this.player;
    this.ui.big('WASTED', 'You will wake up at St. Aurelia Medical', '#ff4d5e', 3.2); this.audio.ui('fail');
    await new Promise((r) => setTimeout(r, 3000)); await this.ui.fade(true);
    if (this.interior) await this.interiors.exit();
    const bill = Math.min(500, Math.max(0, this.economy.cash + this.economy.bank)); if (bill) { this.economy.bank -= bill; this.economy.log('Hospital bill', -bill, 'bill'); }
    this.police.clear(); this.env.setHour(this.env.hour + 4);
    P.dead = false; P.state = 'foot'; P.health = P.maxHealth; P.stamina = P.maxStamina; P.teleport(130, 0.15, 244, Math.PI); this.cam.snapBehind();
    this.companion.place(131.5, 0.15, 243);
    bus.emit('respawn', 'hospital'); this._dying = false; await this.ui.fade(false);
    this.ui.toast('Discharged', `Hospital bill ${fmtMoney(bill)}`, 'warn', 4);
  }
  async busted() {
    if (this._dying) return; this._dying = true; const P = this.player;
    bus.emit('busted'); this.ui.big('BUSTED', 'Processing at Central Police…', '#93c5fd', 3); this.audio.ui('fail'); P.state = 'cutscene'; P.cutPose = 'loco';
    await new Promise((r) => setTimeout(r, 2600)); await this.ui.fade(true);
    const fine = Math.max(100, Math.round(this.economy.cash * 0.1)); this.economy.fine(fine, 'Arrest processing fee');
    for (const o of this.police.officers) this.npcs.despawn(o); this.police.officers = []; this.police.clear();
    this.env.setHour(this.env.hour + 6); P.state = 'foot'; P.teleport(-10, 0.15, -316, Math.PI); this.cam.snapBehind(); this.companion.place(-8.5, 0.15, -317);
    this._dying = false; await this.ui.fade(false); this.ui.toast('Released', `Fee ${fmtMoney(fine)} charged to your bank`, 'warn', 4);
  }
  // ---------------- helpers used by systems ----------------
  dynamicCollide(p, r, self) {
    for (const v of this.vehicles.list) {
      if (!v.object.visible || v === this.player.vehicle) continue; if (Math.abs(v.pos.y - this.player.pos.y) > 2.5 && self === this.player) continue;
      const dx = p.x - v.pos.x, dz = p.z - v.pos.z; if (dx * dx + dz * dz > (v.radius + r) ** 2) continue;
      if (v.type === 'heli' || v.type === 'plane') { const d = Math.hypot(dx, dz), m = v.type === 'plane' ? 2 : 1.6; if (d < m + r) { p.x = v.pos.x + dx / d * (m + r); p.z = v.pos.z + dz / d * (m + r); } continue; }
      for (const c of vehicleCircles(v)) { const ex = p.x - c.x, ez = p.z - c.z, d = Math.hypot(ex, ez), m = c.r + r; if (d < m && d > 1e-4) { p.x = c.x + ex / d * m; p.z = c.z + ez / d * m; } }
    }
    if (self === this.player) for (const n of this.npcs.list) { if (!n.active || n.down || !n.object.visible) continue; const dx = p.x - n.pos.x, dz = p.z - n.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.36 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = n.pos.x + dx / d * 0.6; p.z = n.pos.z + dz / d * 0.6; } }
  }
  _vehicleHits(dt) {
    const P = this.player;
    for (const v of this.vehicles.list) {
      const sp = Math.abs(v.kinematic ? v.speed : v.vel.length()); if (sp < 3 || v.type === 'heli' || v.type === 'plane' || !v.object.visible) continue;
      const circ = vehicleCircles(v);
      const test = (q, r) => circ.some((c) => (q.x - c.x) ** 2 + (q.z - c.z) ** 2 < (c.r + r) ** 2) && Math.abs(q.y - v.pos.y) < 1.8;
      for (const n of this.npcs.list) {
        if (!n.active || n.down || !test(n.pos, 0.35)) continue;
        n.damage(sp * 4.5, v.driver === 'player' ? P : null, { knock: true, fall: true }); n.knockDown(n.health <= 0); this.audio.impact(n.pos, 0.3); this.audio.human('ouch', n.pos);
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading); n.pos.x += fx * 1.2; n.pos.z += fz * 1.2;
        if (v.driver === 'player') { this.crime('hit-and-run', n.pos, sp > 12 ? 2 : 1); this.npcs.danger(n.pos, 20, 2); }
        if (!v.kinematic) v.vel.multiplyScalar(0.92);
      }
      if ((P.state === 'foot' || P.state === 'activity') && v.driver !== 'player' && test(P.pos, 0.35) && P.invuln <= 0) { P.damage(sp * 3, null, { knock: true, fall: true }); this.audio.impact(P.pos, 0.4); P.invuln = 1; }
    }
  }
  deliverOwned(rec) {
    if (this.interior) { this.ui.toast('Garage', 'Step outside first.', 'warn'); return false; }
    if (!this.economy.pay(50, 'Vehicle delivery')) return false;
    const P = this.player.pos; const ne = L.nearestEdge(P.x, P.z); if (!ne.edge || ne.d > 60) { this.ui.toast('Garage', 'No road nearby for delivery.', 'warn'); return false; }
    const e = ne.edge, A = L.nodes[e.a]; const t = clamp(ne.t + 12, 8, e.len - 8); const x = A.x + e.dx * t - e.dz * 4.9, z = A.z + e.dz * t + e.dx * 4.9;
    const v = this.vehicles.spawnOwned(rec, x, z, Math.atan2(e.dx, e.dz)); this.ui.waypoint = { x, z }; this.ui.toast('Delivered', `${v.spec.name} is parked nearby.`, 'good'); return true;
  }
  speak(text, sex, who) {
    if (!this.settings.tts || !window.speechSynthesis || !this.audio.ctx) return;
    try {
      const u = new SpeechSynthesisUtterance(text); const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); if (vs.length) u.voice = vs[(who ? who.length : 0) % vs.length];
      u.pitch = sex === 'f' ? 1.15 : who === 'Mr. Vale' ? 0.75 : 0.95; u.rate = 1.02; u.volume = clamp(this.audio.levels.voices * this.audio.levels.master * 1.1, 0, 1) * (this.audio.muted ? 0 : 1);
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }
  async cutTalk(npc, lines) {
    const P = this.player; this.cutscene = true; P.state = 'cutscene'; P.cutPose = 'loco';
    P.heading = Math.atan2(npc.pos.x - P.pos.x, npc.pos.z - P.pos.z); npc.heading = Math.atan2(P.pos.x - npc.pos.x, P.pos.z - npc.pos.z);
    const mid = { x: (P.pos.x + npc.pos.x) / 2, z: (P.pos.z + npc.pos.z) / 2 }; const side = P.heading + Math.PI / 2;
    const c1 = [mid.x + Math.sin(side) * 3.2, P.pos.y + 1.7, mid.z + Math.cos(side) * 3.2];
    this.cam.play([{ pos: c1, look: [mid.x, P.pos.y + 1.5, mid.z], t: 9999, hold: true }, { pos: c1, look: [mid.x, P.pos.y + 1.5, mid.z], t: 1 }]);
    for (const [w, l] of lines) { P.cutTalk = w === 'You'; npc.talking = w !== 'You'; await this.missions.say(w === 'You' ? P.name : w, l); }
    P.cutTalk = false; npc.talking = false; this.cam.cine = null; this.cutscene = false; P.state = 'foot'; this.cam.snapBehind();
  }
  portrait(a) {
    const r = this.renderer, sc = new THREE.Scene(), h = new Humanoid(a, { shadow: false });
    sc.add(h.object); sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2)); const dl = new THREE.DirectionalLight(0xfff0dd, 2.2); dl.position.set(1, 2, 2); sc.add(dl);
    sc.background = new THREE.Color(0x8fa3ad); h.update(0.016, { mode: 'loco', speed: 0, lookYaw: 0 });
    const cam = new THREE.PerspectiveCamera(30, 0.8, 0.05, 10); const hy = 1.6 * h.scale; cam.position.set(0.18, hy + 0.04, 1.35); cam.lookAt(0, hy - 0.04, 0);
    const W = 240, H = 300, rt = new THREE.WebGLRenderTarget(W, H); r.setRenderTarget(rt); r.render(sc, cam);
    const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px); r.setRenderTarget(null); rt.dispose();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const id = g.createImageData(W, H);
    for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(id, 0, 0); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 26, W, 26); g.fillStyle = '#fff'; g.font = '600 13px sans-serif'; g.fillText('SAPD FILE PHOTO · FICTIONAL', 8, H - 9);
    h.mesh.geometry.dispose();
    return c.toDataURL('image/jpeg', 0.85);
  }
  renderNow() { this._render(); }
  // cinematic bloom (multi-file build, high/ultra quality on non-touch devices)
  _render() {
    const RR = window.RIVORA_REAL, want = !!(RR && RR.post && !this.touch && this.quality.level >= 2 && !this.interior);
    if (want && !this.composer && !this._noPost) {
      try { const P = RR.post, rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }); const c = new P.EffectComposer(this.renderer, rt); c.addPass(new P.RenderPass(this.scene, this.camera)); this.bloom = new P.UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.5, 0.95); c.addPass(this.bloom); c.addPass(new P.OutputPass()); this.composer = c; this._sizeComposer(); }
      catch (e) { console.warn('[RIVORA] post-processing disabled', e); this._noPost = true; }
    }
    if (want && this.composer) { if (this.bloom) this.bloom.strength = this.env && this.env.night ? 0.42 : 0.24; this.composer.render(); }
    else this.renderer.render(this.scene, this.camera);
  }
  _sizeComposer() { if (!this.composer) return; const r = this.renderer, w = window.innerWidth, h = window.innerHeight; this.composer.setPixelRatio(r.getPixelRatio()); this.composer.setSize(w, h); }
  // ---------------- interaction prompts ----------------
  _interactions() {
    const P = this.player, I = this.input; if (this.cutscene || this.ui.blockingUI) { this.ui.prompt(); return; }
    if (P.state !== 'foot') { this.ui.prompt(); if (P.state === 'vehicle') { if (I.pressed('vehicle') || (I.pressed('interact') && P.vehicle.speed < 1)) this.vehicles.exit(); } return; }
    let best = null, bd = 1e9; const cand = [];
    if (this.interior) for (const p of this.interiors.pointsForCurrent()) cand.push({ ...p, src: 'room' });
    else for (const p of this.city.interactPoints) { if (Math.abs(P.pos.y - (p.y || 0)) > 2.5) continue; cand.push({ ...p, src: 'city' }); }
    for (const t of this.interactTargets) cand.push({ x: t.x, z: t.z, r: t.r, label: t.label, src: 'target', t });
    for (const c of cand) { const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); if (d < (c.r || 2) && d < bd) { bd = d; best = c; } }
    // companion & pedestrians
    const C = this.companion; if (!best && C.root.visible && Math.hypot(C.pos.x - P.pos.x, C.pos.z - P.pos.z) < 1.8) best = { label: 'Pet ' + C.name, src: 'pet' };
    const veh = !this.interior ? this.vehicles.nearestEnterable(P.pos, 3.2) : null;
    let npc = null; if (!best && !this.interior) { let nd = 2.2; for (const n of this.npcs.list) { if (!n.active || n.down || n.state === 'fight' || n.role === 'police' || n.fixed === 'staff') continue; const d = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z); if (d < nd) { nd = d; npc = n; } } if (npc) best = { label: 'Talk to ' + (npc.name || 'stranger'), src: 'npc' }; }
    if (best) this.ui.prompt('E', best.label + (veh ? ' · F enter vehicle' : ''));
    else if (veh) this.ui.prompt('F', veh.display ? 'Showroom display' : veh.roofHeli ? `Rent helicopter (${fmtMoney(veh.rentPrice)})` : (veh.owner === 'parked' ? 'Steal ' : veh.traffic ? 'Carjack ' : veh.owner === 'player' ? 'Drive ' : 'Enter ') + veh.spec.name);
    else this.ui.prompt();
    if (I.pressed('interact') && best) {
      I.consume('interact');
      if (best.src === 'room') this.interiors.act(best);
      else if (best.src === 'city') { if (best.kind.startsWith('gym:')) this.activities.startGym(best.kind.slice(4), best); else this.interiors.door(best); }
      else if (best.src === 'target') best.t.act();
      else if (best.src === 'pet') { P.action = { name: 'pet', t: 0, dur: 2, p: 0, hitAt: 9, lock: true }; C.pet(); bus.emit('petCompanion'); }
      else if (best.src === 'npc') this.npcs.talkTo(npc);
    } else if ((I.pressed('vehicle') || (I.pressed('interact') && !best)) && veh) {
      if (veh.display) { this.ui.toast('Aurelia Motors', 'Display models are not for test drives. Buy one inside.', 'info'); return; }
      if (veh.roofHeli && !veh.rented) { this.ui.confirm('Meridian Charter', `Rent this helicopter for ${fmtMoney(veh.rentPrice)}? Fly anywhere, land anywhere.`, 'Rent', 'Cancel').then((ok) => { if (ok && this.economy.pay(veh.rentPrice, 'Helicopter rental')) { veh.rented = true; veh.owner = 'player'; this.vehicles.enter(veh); } }); return; }
      this.vehicles.enter(veh);
    }
  }
  // ---------------- main loop ----------------
  frame(t) {
    let dt = Math.min(0.1, (t - this.last) / 1000); this.last = t; if (!(dt > 0)) dt = 0.016;
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this._perf(); }
    const I = this.input; I.poll();
    if (this.running && !this.cutscene) this._hotkeys();
    if (this.combat.hitStop > 0) dt *= 0.25;
    const sim = !this.paused;
    if (sim) {
      let rem = dt; while (rem > 1e-4) { const h = Math.min(rem, 1 / 45); this.step(h); rem -= h; }
    } else if (!this.running) this.step(dt);
    if (this.running) this._interactions();
    if (this.paused && ((this._pf = (this._pf || 0) + 1) % 4)) return; // save power while paused
    this._render();
    if (this.settings.showFps) this.ui.hint(`${this.fps.toFixed(0)} FPS · ${this.renderer.info.render.calls} draws`, 1.2);
  }
  step(dt) {
    this.time += dt; this.audio.voiceBudget = 3;
    const P = this.player, I = this.input;
    const focus = P.state === 'vehicle' && P.vehicle ? P.vehicle.pos : P.pos;
    this.env.update(dt, focus, this.camera); this.ocean.update(dt, this.env);
    if (!this.interior) this.city.update(dt, this.time, this.env);
    if (this.running) {
      if (this.ui.blockingUI && P.state === 'foot') { const saveIn = I.enabled; I.enabled = false; P.update(dt, I, this.cam.yaw); I.enabled = saveIn; }
      else P.update(dt, I, this.cam.yaw);
    } else if (P.object.visible) P.update(dt, I, this.cam.yaw);
    this.vehicles.update(dt, I);
    this.traffic.update(dt); this.npcs.update(dt); this.companion.update(dt);
    this.combat.update(dt); this.police.update(dt); this.missions.update(dt); this.interiors.update(dt); this.fx.update(dt);
    this._vehicleHits(dt);
    if (this.running && !this.ui.blockingUI) this.cam.update(dt, I); else if (this.cam.cine) this.cam.update(dt, I);
    this.audio.setListener(this.camera);
    this.audio.update(dt, this._audioState());
    if (this.running) this.ui.update(dt);
    if (this.running && this.time - (this._lastSave || 0) > 180) this.autosave('timer');
  }
  _audioState() {
    const P = this.player, cam = this.camera.position, v = P.vehicle;
    const d = this.interior ? 'interior' : L.districtAt(cam.x, cam.z); const dens = this.interior ? 0 : (L.DISTRICTS[d] || { density: 0.4 }).density;
    const coastDist = Math.min(Math.abs(cam.x - 600) + Math.max(0, cam.z - 560) * 0.2, cam.z < -600 ? Math.abs(cam.z + 660) : 1e9, Math.abs(cam.x - 600));
    let music = null;
    if (this.interiorId === 'club') music = { style: 'club', vol: 0.55 }; else if (this.interiorId === 'gym') music = { style: 'drive', vol: 0.25 };
    else if (!this.interior && dist2(cam.x, cam.z, L.POI.club.x, L.POI.club.z + 20) < 60 * 60) music = { style: 'club', vol: 0.35 * (1 - Math.sqrt(dist2(cam.x, cam.z, L.POI.club.x, L.POI.club.z + 20)) / 60), muffle: true };
    else if (v && this.vehicles.radio) music = { style: this.vehicles.radio, vol: 0.4 };
    const green = !this.interior && (d === 'residential' || d === 'hillside' || d === 'outskirts' || d === 'beach' || d === 'boardwalk');
    return { indoor: !!this.interior, night: this.env.night, density: dens, coastDist: this.interior ? 1e9 : coastDist, wind: this.env.w.wind, rain: this.interior ? 0 : this.env.w.rain, altitude: Math.max(0, cam.y - 10), speed: v ? Math.abs(v.speed) : P.speed || 0, inCar: !!v && v.type === 'car', wet: this.env.wet > 0.3, slip: v ? v.slip || 0 : 0, freefall: P.state === 'freefall', fallSpeed: -P.vel.y, crowd: this.npcs.crowd || 0, onWater: v && v.type === 'boat', music, green,
      near: (r, minR = 0) => { const a = R() * 6.283, dd = minR + R() * r; return new THREE.Vector3(cam.x + Math.cos(a) * dd, cam.y + 3, cam.z + Math.sin(a) * dd); } };
  }
  _hotkeys() {
    const I = this.input, P = this.player;
    if (I.pressed('pause')) { if (this.ui.panelStack.length) this.ui.close(); else if (this.ui.mapOpen) this.ui.closeMap(); else if (this.phone.open) this.phone.close(); else this.menus.pause(); return; }
    if (this.ui.panelStack.length) return;
    if (I.pressed('map')) { this.phone.open && this.phone.close(); this.ui.openMap(); }
    if (this.ui.mapOpen) return;
    if (I.pressed('phone')) { if (this.phone.incoming && !this.phone.incoming.live) this.phone.answer(); else this.phone.toggle(); }
    if (I.pressed('bag') || this.input.keys.has('KeyI')) { this.input.keys.delete('KeyI'); this.menus.bag(); }
    if (I.pressed('companion')) this.companion.command('toggle');
    if (I.pressed('companionCome')) this.companion.command('come');
  }
  _perf() {
    if (!this.running || !this.settings.autoPerf) return;
    if (this.fps < 24) this.slowT++; else this.slowT = Math.max(0, this.slowT - 1);
    if (this.slowT > 6) { this.slowT = 0; const order = ['ultra', 'high', 'medium', 'low']; const i = order.indexOf(this.settings.quality); if (i < order.length - 1) { this.settings.quality = order[i + 1]; this.applyQuality(this.settings.quality); this.ui.toast('Performance mode', `Graphics lowered to ${this.settings.quality} to keep things smooth.`, 'info', 3); } else if (this.settings.renderScale > 0.6) { this.settings.renderScale -= 0.15; this.resize(); } }
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); const b = document.getElementById('err'); if (b) { b.style.display = 'block'; b.textContent = 'RIVORA could not start: ' + (e && e.message ? e.message : e); } });
