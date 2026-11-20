// Enterable interiors + every location's interactions (shops, seats, beds, gym, club, services).
import { GeoBuilder, prim } from '../core/geo.js';
import * as T from './textures.js';
import * as L from './layout.js';
import { CAFE_MENU, STORE_ITEMS, CLUB_BAR, PROPERTIES, SKYDIVE_PRICE, BOAT_RENTAL, HELI_PRICE } from '../data/content.js';
import { OUTFITS, uniformAppearance, randomAppearance } from '../actors/humanoid.js';
import { VEHICLES, DEALER_STOCK } from '../data/vehicles.js';
import { R, fmtMoney, clamp, bus, dist, fmtTime } from '../core/util.js';

const DEFS = {
  home: { name: 'Laurel Apartments #4B', size: [14, 10, 3.2], floor: 'wood', wall: '#e9e1d4', light: 0xffe2b8, door: 'safehouse' },
  villa: { name: 'Villa Mirador', size: [20, 14, 3.6], floor: 'tile', wall: '#f4efe6', light: 0xfff0d8, door: 'villa' },
  cafe: { name: 'Sol & Salt Café', size: [16, 12, 3.4], floor: 'wood', wall: '#f0e1c8', light: 0xffd9a8, door: 'cafe', ambience: 'cafe' },
  store: { name: 'Quik Corner', size: [12, 10, 3.2], floor: 'tile', wall: '#f2f2f0', light: 0xf2fbff, door: 'store' },
  gym: { name: 'Ironbay Fitness', size: [22, 14, 4.2], floor: 'gym', wall: '#2c3338', light: 0xe8f4ff, door: 'gym', music: 'drive' },
  club: { name: 'Pulse Nightclub', size: [24, 18, 5], floor: 'tile', wall: '#120e1a', light: 0x6a3cff, door: 'club', music: 'club' },
  clothes: { name: 'Thread & Co', size: [14, 10, 3.4], floor: 'wood', wall: '#efe6dc', light: 0xfff4e6, door: 'clothes' },
};

export class Interiors {
  constructor(game) {
    this.game = game; this.rooms = {}; this.n = 0;
    for (const [id, d] of Object.entries(DEFS)) this.rooms[id] = this._build(id, d);
    this._showroom();
  }
  _build(id, d) {
    const G = this.game, city = G.city, ox = 3000 + this.n++ * 120, oz = 0; const [W, D, H] = d.size;
    const g = new THREE.Group(); g.position.set(ox, 0, oz); g.visible = false; G.scene.add(g);
    const b = new GeoBuilder(), wb = new GeoBuilder();
    const floorTex = d.floor === 'wood' ? T.woodTex() : d.floor === 'gym' ? null : T.tileTex(id === 'club' ? '#1a1424' : '#e8e2d6', id === 'club' ? '#120e1a' : '#d6cfc0');
    const fm = new THREE.MeshStandardMaterial({ map: floorTex, color: d.floor === 'gym' ? 0x2a2d30 : 0xffffff, roughness: 0.6 });
    if (floorTex) { floorTex.repeat.set(W / 3, D / 3); }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), fm); floor.position.y = -0.1; floor.receiveShadow = true; g.add(floor);
    const wc = d.wall;
    wb.box(0, H / 2, -D / 2, W, H, 0.2, wc); wb.box(-W / 2, H / 2, 0, 0.2, H, D, wc); wb.box(W / 2, H / 2, 0, 0.2, H, D, wc);
    wb.box(-W / 4 - 0.75, H / 2, D / 2, W / 2 - 1.5, H, 0.2, wc); wb.box(W / 4 + 0.75, H / 2, D / 2, W / 2 - 1.5, H, 0.2, wc); wb.box(0, H - 0.5, D / 2, 3, 1, 0.2, wc);
    wb.box(0, H + 0.05, 0, W, 0.1, D, '#f5f5f2');
    wb.box(0, 1.1, D / 2 + 0.05, 1.5, 2.2, 0.08, '#5a3b2a'); // exit door
    const wm = new THREE.Mesh(wb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })); wm.receiveShadow = true; g.add(wm);
    // colliders: walls + floor deck
    city.addDeck(ox - W / 2, oz - D / 2, ox + W / 2, oz + D / 2, 0, 'interior:' + id);
    city.addBox(ox - W / 2 - 1, oz - D / 2 - 1, ox + W / 2 + 1, oz - D / 2 + 0.1, H, -1); city.addBox(ox - W / 2 - 1, oz - D / 2, ox - W / 2 + 0.1, oz + D / 2, H, -1); city.addBox(ox + W / 2 - 0.1, oz - D / 2, ox + W / 2 + 1, oz + D / 2, H, -1);
    city.addBox(ox - W / 2, oz + D / 2 - 0.1, ox - 0.75, oz + D / 2 + 1, H, -1); city.addBox(ox + 0.75, oz + D / 2 - 0.1, ox + W / 2, oz + D / 2 + 1, H, -1);
    // lights
    const amb = new THREE.HemisphereLight(0xffffff, 0x404040, 0.55); g.add(amb);
    const lights = [];
    for (const [lx, lz] of [[-W / 4, -D / 4], [W / 4, -D / 4], [0, D / 4]]) { const p = new THREE.PointLight(d.light, id === 'club' ? 18 : 14, Math.max(W, D) * 1.2, 1.6); p.position.set(lx, H - 0.4, lz); g.add(p); lights.push(p); b.add(prim('cyl', 0.3, 0.3, 0.06, 12), lx, H - 0.05, lz, 0, 0, 0, 1, 1, 1, '#fff8e6'); }
    city.addBox(ox - 0.8, oz + D / 2 - 0.05, ox + 0.8, oz + D / 2 + 1.5, H, -1); // doorway (keeps the camera inside)
    const room = { id, def: d, g, ox, oz, W, D, H, points: [], npcs: [], lights, b, spawn: { x: 0, z: D / 2 - 2.6, h: Math.PI } };
    this['_furnish_' + id] && this['_furnish_' + id](room, b);
    if (!b.empty) { const fm2 = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 })); fm2.castShadow = true; fm2.receiveShadow = true; g.add(fm2); }
    room.points.push({ x: 0, z: D / 2 - 0.9, r: 1.7, kind: 'exit', label: 'Leave' });
    return room;
  }
  P(room, x, z, kind, label, extra = {}) { room.points.push({ x, z, r: extra.r || 1.4, kind, label, ...extra }); }
  col(room, x0, z0, x1, z1, top = 1.2) { this.game.city.addBox(room.ox + x0, room.oz + z0, room.ox + x1, room.oz + z1, top, -1); }
  // ---------------- furnishing ----------------
  _furnish_home(r, b) {
    const { W, D } = r;
    b.box(-W / 2 + 1.6, 0.3, -D / 2 + 1.4, 2.2, 0.6, 2.6, '#3b4a6b'); b.box(-W / 2 + 1.6, 0.65, -D / 2 + 0.4, 2.2, 0.9, 0.2, '#5a3b2a'); b.box(-W / 2 + 1.6, 0.66, -D / 2 + 1.6, 2.0, 0.1, 1.6, '#e8e4dc');
    this.col(r, -W / 2, -D / 2, -W / 2 + 2.8, -D / 2 + 2.8, 0.7); this.P(r, -W / 2 + 3.2, -D / 2 + 1.5, 'bed', 'Sleep (skip time & save)');
    b.box(W / 2 - 0.5, 1.1, -D / 2 + 2, 0.8, 2.2, 2.2, '#7a5a3b'); this.col(r, W / 2 - 0.9, -D / 2 + 0.9, W / 2, -D / 2 + 3.1, 2.2); this.P(r, W / 2 - 1.6, -D / 2 + 2, 'wardrobe', 'Change outfit');
    b.box(W / 2 - 0.5, 0.95, 1.8, 0.8, 1.9, 0.8, '#d9dde0'); this.col(r, W / 2 - 0.9, 1.4, W / 2, 2.2, 1.9); this.P(r, W / 2 - 1.5, 1.8, 'fridge', 'Grab a snack from the fridge');
    b.box(0, 0.25, -1, 3.2, 0.5, 1.0, '#4a5d6e'); b.box(0, 0.65, -1.45, 3.2, 0.5, 0.2, '#4a5d6e'); this.col(r, -1.6, -1.5, 1.6, -0.5, 0.6);
    b.box(0, 1.5, -D / 2 + 0.15, 2.2, 1.2, 0.08, '#111'); const tvs = this._tvScreen(); tvs.position.set(0, 1.5, -D / 2 + 0.2); r.g.add(tvs); r.tv = tvs;
    this.P(r, 0, -0.2, 'couch', 'Sit and watch TV', { seat: { x: 0, z: -1.05, h: Math.PI, y: 0.0 } });
    b.box(-W / 2 + 1, 0.4, 2.5, 1.4, 0.8, 0.8, '#6b4f3a'); b.box(-W / 2 + 1, 0.85, 2.5, 0.5, 0.05, 0.35, '#333'); this.col(r, -W / 2, 2.1, -W / 2 + 1.7, 2.9, 0.8); this.P(r, -W / 2 + 2.2, 2.5, 'laptop', 'Laptop: save / load game');
  }
  _furnish_villa(r, b) { this._furnish_home(r, b); r.b.box(0, 0.02, 3, 6, 0.04, 3, '#c9b48a'); }
  _furnish_cafe(r, b) {
    const { W, D } = r;
    b.box(0, 0.55, -D / 2 + 1.6, 7, 1.1, 0.9, '#7a4a2a'); b.box(0, 1.12, -D / 2 + 1.6, 7.2, 0.06, 1.0, '#e9e2d6'); b.box(-2.5, 1.45, -D / 2 + 1.5, 0.6, 0.6, 0.5, '#c0c0c0');
    this.col(r, -3.6, -D / 2 + 1.1, 3.6, -D / 2 + 2.1, 1.2);
    this.P(r, 0, -D / 2 + 2.8, 'order', 'Order food & drinks', { menu: 'cafe' });
    r.staff = { x: 0.5, z: -D / 2 + 0.9, h: 0, role: 'barista' };
    r.seats = [];
    for (const [tx, tz] of [[-4.5, -0.5], [0, 0], [4.5, -0.5], [-4.5, 3], [4.5, 3]]) {
      b.add(prim('cyl', 0.55, 0.55, 0.05, 16), tx, 0.75, tz, 0, 0, 0, 1, 1, 1, '#f2efe8'); b.add(prim('cyl', 0.06, 0.08, 0.72, 8), tx, 0.38, tz, 0, 0, 0, 1, 1, 1, '#333');
      this.game.city.addCircle(r.ox + tx, r.oz + tz, 0.55, 0.8);
      for (const s of [-1, 1]) { const cx = tx + s * 0.95; b.box(cx, 0.45, tz, 0.45, 0.06, 0.45, '#a0522d'); b.box(cx + s * 0.22, 0.75, tz, 0.05, 0.6, 0.45, '#a0522d'); r.seats.push({ x: cx, z: tz, h: s > 0 ? -Math.PI / 2 : Math.PI / 2 }); }
    }
    r.seats.forEach((s, i) => { if (i % 3 === 0) this.P(r, s.x, s.z, 'seat', 'Sit down', { seat: { ...s, y: 0 }, r: 0.9 }); });
  }
  _furnish_store(r, b) {
    const { W, D } = r;
    for (const x of [-3, 0, 3]) { b.box(x, 0.9, 0, 1.0, 1.8, 5, '#e6e6e6'); for (let k = 0; k < 4; k++) for (let j = 0; j < 8; j++) b.box(x + (R() < 0.5 ? -0.35 : 0.35), 0.3 + k * 0.45, -2.2 + j * 0.6, 0.25, 0.25, 0.3, `hsl(${R() * 360},55%,55%)`); this.col(r, x - 0.5, -2.5, x + 0.5, 2.5, 1.8); }
    b.box(W / 2 - 1.5, 0.5, D / 2 - 2.5, 2.4, 1.0, 1.0, '#b03a2e'); b.box(W / 2 - 1.5, 1.05, D / 2 - 2.5, 2.5, 0.06, 1.1, '#eee'); this.col(r, W / 2 - 2.7, D / 2 - 3, W / 2 - 0.3, D / 2 - 2, 1.1);
    this.P(r, W / 2 - 3.3, D / 2 - 2.5, 'order', 'Buy from Quik Corner', { menu: 'store' }); r.staff = { x: W / 2 - 1.2, z: D / 2 - 3.6, h: -Math.PI / 2 + Math.PI, role: 'barista' };
  }
  _furnish_gym(r, b) {
    const { W, D } = r;
    const eq = (kind, x, z, label, h = 0) => { this.P(r, x, z, 'gym:' + kind, label, { h }); };
    b.box(-W / 2 + 2, 0.4, -D / 2 + 2, 1.0, 0.8, 2.2, '#222'); b.box(-W / 2 + 2, 1.2, -D / 2 + 1.1, 0.9, 0.9, 0.1, '#444'); eq('treadmill', -W / 2 + 2, -D / 2 + 2, 'Treadmill (stamina)', 0);
    b.box(-W / 2 + 4.5, 0.4, -D / 2 + 2, 1.0, 0.8, 2.2, '#222'); eq('treadmill', -W / 2 + 4.5, -D / 2 + 2, 'Treadmill (stamina)', 0);
    b.box(0, 0.45, -D / 2 + 2.5, 0.45, 0.12, 1.7, '#b03a2e'); b.box(0, 1.3, -D / 2 + 1.7, 1.8, 0.05, 0.05, '#bbb'); eq('bench', 0, -D / 2 + 2.5, 'Bench press (strength)', 0);
    b.box(4, 1.25, -D / 2 + 1.5, 0.1, 2.5, 0.1, '#666'); b.box(6, 1.25, -D / 2 + 1.5, 0.1, 2.5, 0.1, '#666'); b.box(5, 2.45, -D / 2 + 1.5, 2.1, 0.06, 0.06, '#aaa'); eq('pullup', 5, -D / 2 + 2.2, 'Pull-ups (strength, endurance)', Math.PI);
    b.box(W / 2 - 2, 1.1, 0, 0.08, 2.2, 0.08, '#555'); b.box(W / 2 - 2, 1.1, 2, 0.08, 2.2, 0.08, '#555'); b.box(W / 2 - 2, 1.5, 1, 0.05, 0.05, 2.4, '#bbb'); eq('squat', W / 2 - 2.6, 1, 'Squats (strength, stamina)', Math.PI / 2);
    b.box(W / 2 - 1, 0.5, -3, 0.6, 1, 3, '#444'); eq('dumbbell', W / 2 - 2.2, -3, 'Dumbbell curls (strength)', Math.PI / 2);
    b.box(-3, 0.02, 2.5, 2, 0.04, 3, '#2d6a4f'); eq('pushup', -3, 2.5, 'Push-ups (endurance)', 0);
    b.box(-6.5, 0.02, 2.5, 2, 0.04, 3, '#3a5a8f'); eq('stretch', -6.5, 2.5, 'Stretch (recovery)', Math.PI);
    b.box(2, 0.45, 3, 0.5, 0.9, 1.2, '#222'); eq('bike', 2, 3, 'Stationary bike (stamina, recovery)', 0);
    for (const [x0, z0, x1, z1] of [[-W / 2 + 1.5, -D / 2 + 0.9, -W / 2 + 2.5, -D / 2 + 3.1], [-W / 2 + 4, -D / 2 + 0.9, -W / 2 + 5, -D / 2 + 3.1], [W / 2 - 1.3, -4.5, W / 2 - 0.7, -1.5]]) this.col(r, x0, z0, x1, z1, 1);
    r.users = [[0, -D / 2 + 2.5, 'bench'], [-W / 2 + 4.5, -D / 2 + 2, 'treadmill'], [W / 2 - 2.6, 1, 'squat']];
  }
  _furnish_club(r, b) {
    const { W, D, H } = r;
    b.box(0, 0.6, -D / 2 + 1.5, 5, 1.2, 1.6, '#1b1b26'); b.box(0, 1.25, -D / 2 + 1.5, 5.2, 0.1, 1.8, '#ff4fd8');
    this.col(r, -2.5, -D / 2 + 0.7, 2.5, -D / 2 + 2.3, 1.3);
    r.staff = { x: 0, z: -D / 2 + 0.9, h: 0, role: 'dj' };
    b.box(W / 2 - 1.2, 0.55, 2, 1.4, 1.1, 8, '#2a2236'); b.box(W / 2 - 1.2, 1.12, 2, 1.6, 0.06, 8.2, '#4ef0ff'); this.col(r, W / 2 - 2, -2, W / 2, 6, 1.2);
    this.P(r, W / 2 - 2.6, 2, 'order', 'Bar: order a drink', { menu: 'club' });
    // dance floor tiles (animated emissive)
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.04, 1.9), new THREE.MeshBasicMaterial({ toneMapped: false }), 25);
    const m = new THREE.Matrix4(); let i = 0; for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { m.makeTranslation(x * 2, 0.03, z * 2 + 0.5); tiles.setMatrixAt(i, m); tiles.setColorAt(i++, new THREE.Color(0x222222)); }
    r.g.add(tiles); r.tiles = tiles;
    this.P(r, 0, 0.5, 'dance', 'Dance', { r: 3 });
    r.dancers = 14;
    const strobe = []; for (const c of [0xff4fd8, 0x4ef0ff, 0xffd23f]) { const p = new THREE.PointLight(c, 30, 18, 1.5); p.position.set(0, H - 0.6, 0); r.g.add(p); strobe.push(p); } r.strobe = strobe;
    for (const l of r.lights) l.intensity = 4;
  }
  _furnish_clothes(r, b) {
    const { W, D } = r;
    for (const x of [-4, 0, 4]) { b.box(x, 1.6, -1, 2.4, 0.05, 0.05, '#aaa'); for (let k = 0; k < 9; k++) b.box(x - 1.0 + k * 0.25, 1.1, -1, 0.06, 0.9, 0.5, `hsl(${R() * 360},45%,${40 + R() * 30}%)`); this.col(r, x - 1.3, -1.4, x + 1.3, -0.6, 1.8); }
    b.box(W / 2 - 0.2, 1.2, 0, 0.05, 2.0, 1.2, '#cfe3ea');
    this.P(r, 0, 1.5, 'clothes', 'Browse outfits', { r: 2.5 }); r.staff = { x: -W / 2 + 1.5, z: D / 2 - 2.5, h: Math.PI / 2, role: 'barista' };
  }
  _tvScreen() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 144; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.12), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.userData = { c, t, x: 0 }; return m;
  }
  _tvUpdate(m, dt) {
    const u = m.userData, g = u.c.getContext('2d'); u.x -= dt * 60; const head = this.headlines();
    g.fillStyle = '#0a2a44'; g.fillRect(0, 0, 256, 144); g.fillStyle = '#ff7a45'; g.fillRect(0, 0, 256, 26); g.fillStyle = '#fff'; g.font = '700 16px Figtree, sans-serif'; g.fillText('SAN AURELIA NEWS 7', 8, 19);
    g.fillStyle = '#e8f1f8'; g.font = '600 14px Figtree, sans-serif'; g.fillText(head[0], 8, 60); g.fillStyle = '#9fb3c2'; g.fillText(head[1], 8, 84);
    g.fillStyle = '#111'; g.fillRect(0, 118, 256, 26); g.fillStyle = '#ffd166'; g.font = '600 13px Figtree, sans-serif'; const txt = head.join('   •   '); const w = g.measureText(txt).width; if (u.x < -w) u.x = 256; g.fillText(txt, u.x, 136); u.t.needsUpdate = true;
  }
  headlines() { const G = this.game, w = G.weatherLabel(); return [`Weather: ${w}, ${fmtTime(G.env.hour)}`, G.police.level ? `Police pursuit reported, wanted level ${G.police.level}` : 'Neon Row nightlife booming this weekend', 'Coral Beach lifeguards seek volunteers', 'Ferris wheel on Pier 21 turns 40', `Fines collected by red-light cameras: ${G.economy.fines.length}`]; }
  _showroom() { // display cars inside the dealership glass
    const G = this.game, d = G.city.dealerDisplay; if (!d) return;
    const keys = ['vortex', 'ion', 'strada']; keys.forEach((k, i) => { const v = G.vehicles.spawn(k, d.x0 + 12 + i * 22, (d.z0 + d.z1) / 2, Math.PI / 2 + 0.4, { owner: 'display', y: L.SIDEWALK_H + 0.12 }); v.display = true; v.locked = true; });
  }
  // ---------------- enter / exit ----------------
  async enter(id) {
    const G = this.game, r = this.rooms[id]; if (!r) return;
    await G.ui.fade(true);
    G.interior = r.def; G.interiorId = id; G.interiorRoom = r; r.g.visible = true; G.city.group.visible = false; G.ocean.mesh.visible = false; G.env.sky.visible = false;
    for (const v of G.vehicles.list) v.object.visible = false;
    G.scene.fog.near = 50; G.scene.fog.far = 200;
    G.player.teleport(r.ox + r.spawn.x, 0.02, r.oz + r.spawn.z, r.spawn.h); G.cam.snapBehind();
    if (G.companion) { G.companion.interior = id; G.companion.place(r.ox + 1, 0.02, r.oz + r.spawn.z - 0.6); }
    this._populate(r);
    G.audio.ui('chime'); G.ui.toast(r.def.name, id === 'home' || id === 'villa' ? 'Home sweet home.' : 'Walk up to the counter or equipment and press E.', 'info', 2.5);
    bus.emit('enterInterior', id);
    await G.ui.fade(false);
  }
  async exit() {
    const G = this.game, r = G.interiorRoom; if (!r) return;
    await G.ui.fade(true);
    r.g.visible = false; G.city.group.visible = true; G.ocean.mesh.visible = true; G.env.sky.visible = true;
    for (const n of r.npcs) G.npcs.despawn(n); r.npcs = [];
    const door = Object.values(L.POI).find((p) => p.kind === r.def.door || (r.id === 'home' && p.kind === 'home')) || L.POI.safehouse;
    const p = r.id === 'villa' ? { x: G.city.villas[0].door.x, z: G.city.villas[0].door.z } : r.id === 'home' ? L.POI.safehouse : L.POI[r.def.door] || door;
    G.interior = null; G.interiorId = null; G.interiorRoom = null;
    const out = this._outside(p); G.player.teleport(out.x, G.city.surfaceHeight(out.x, out.z, 40) + 0.02, out.z, out.h); G.cam.snapBehind();
    if (G.companion) { G.companion.interior = null; G.companion.place(out.x + 1, G.player.pos.y, out.z); }
    G.audio.door(G.player.pos); bus.emit('exitInterior', r.id);
    await G.ui.fade(false);
  }
  _outside(p) { // step out onto the sidewalk facing away from the building
    const G = this.game; const best = [[0, -2.5], [0, 2.5], [-2.5, 0], [2.5, 0]].map(([dx, dz]) => ({ x: p.x + dx, z: p.z + dz })).find((q) => !G.city.inBuilding(q.x, q.z)) || { x: p.x, z: p.z - 2 };
    return { ...best, h: Math.atan2(best.x - p.x, best.z - p.z) };
  }
  _populate(r) {
    const G = this.game, N = G.npcs; r.npcs = [];
    const add = (x, z, role, state, o = {}) => { const n = N.spawnAt(r.ox + x, r.oz + z, role, o.a || null, { persistent: true, heading: o.h ?? R() * 6, state, t: 9999, y: o.y ?? 0.02 }); n.interior = r.id; n.fixed = 'staff'; Object.assign(n, o.extra || {}); r.npcs.push(n); return n; };
    if (r.staff) { const a = r.staff.role === 'dj' ? { ...randomAppearance(R), top: { type: 'hoodie', color: '#111' }, acc: { cap: true, capColor: '#ff4fd8', earbuds: false } } : uniformAppearance('barista', R); add(r.staff.x, r.staff.z, 'ped', r.staff.role === 'dj' ? 'dance' : 'staff', { a, h: r.staff.h }); }
    if (r.id === 'cafe') { for (const s of r.seats) if (R() < 0.45) { const n = add(s.x - Math.sin(s.h) * 0.0, s.z, 'ped', 'sit', { h: s.h, y: 0.0 }); n.anim.item = R() < 0.5 ? 'drink' : null; } }
    if (r.id === 'club') { const n = this.game.env.isNight ? r.dancers : 6; for (let i = 0; i < n; i++) add(-4 + R() * 8, -3.5 + R() * 8, 'ped', 'dance'); for (let i = 0; i < 3; i++) add(r.W / 2 - 3, -1 + i * 2.5, 'ped', 'chat', { h: Math.PI / 2 }); }
    if (r.id === 'gym') for (const [x, z, k] of r.users) { if (R() < 0.7) { const n = add(x, z, 'athlete', 'activity', { a: uniformAppearance('athlete', R) }); n.activityKind = k; if (k === 'bench') { n.pos.y = 0.0; } } }
    if (r.id === 'store' && R() < 0.6) add(-1.5, 1.5, 'ped', 'phone');
    if (r.id === 'clothes') add(2, 3, 'ped', 'phone');
  }
  update(dt) {
    const G = this.game, r = G.interiorRoom; if (!r) return;
    if (r.tv) this._tvUpdate(r.tv, dt);
    if (r.tiles) { const beat = Math.floor(G.time * 2.03); if (beat !== r._beat) { r._beat = beat; for (let i = 0; i < 25; i++) r.tiles.setColorAt(i, new THREE.Color().setHSL(((i * 7 + beat * 3) % 25) / 25, 1, R() < 0.5 ? 0.5 : 0.12)); r.tiles.instanceColor.needsUpdate = true; } r.strobe.forEach((p, i) => { const a = G.time * (0.8 + i * 0.3) + i * 2; p.position.set(Math.cos(a) * 6, r.H - 0.6, Math.sin(a) * 5); }); }
    if (r.def.ambience === 'cafe' && R() < dt * 0.08) G.audio.coffee(); if (r.def.ambience === 'cafe' && R() < dt * 0.4) G.audio.clink(new THREE.Vector3(r.ox + (R() - 0.5) * 10, 1, r.oz + (R() - 0.5) * 8));
    if (r.id === 'gym' && R() < dt * 0.3) G.audio.metalClank(new THREE.Vector3(r.ox + (R() - 0.5) * 16, 1, r.oz - 4));
  }
  pointsForCurrent() { const r = this.game.interiorRoom; if (!r) return []; return r.points.map((p) => ({ ...p, x: r.ox + p.x, z: r.oz + p.z, room: r })); }
  // ---------------- interactions ----------------
  async act(p) {
    const G = this.game, P = G.player, E = G.economy, r = p.room;
    const k = p.kind;
    if (k === 'exit') return this.exit();
    if (k === 'order') return this.menu(p.menu);
    if (k === 'bed') return this.sleep();
    if (k === 'wardrobe') return G.menus.wardrobe();
    if (k === 'fridge') { P.holdItem('eat'); P.health = Math.min(P.maxHealth, P.health + 15); setTimeout(() => P.dropItem('eat'), 3500); G.ui.toast('Snack', '+15 health', 'good', 2); return; }
    if (k === 'laptop') return G.menus.saveMenu();
    if (k === 'couch' || k === 'seat') { const s = p.seat; P.state = 'sit'; P.sitH = 0.5; P.seat = s; P.teleport(r.ox + s.x - Math.sin(s.h) * 0.0, (s.y || 0) + 0.0, r.oz + s.z, s.h); P.object.rotation.y = s.h; G.ui.hint(k === 'couch' ? 'Watching TV — move to stand up' : 'Seated — order food at the counter, move to stand', 3); return; }
    if (k === 'dance') return this.dance();
    if (k === 'clothes') return G.menus.clothesShop();
    if (k.startsWith('gym:')) return G.activities.startGym(k.slice(4), p);
  }
  menu(kind) {
    const G = this.game, E = G.economy, P = G.player;
    const list = kind === 'cafe' ? CAFE_MENU : kind === 'club' ? CLUB_BAR : STORE_ITEMS.filter((i) => !i.smoking || G.settings.smoking);
    const title = kind === 'cafe' ? 'Sol & Salt Café' : kind === 'club' ? 'Pulse Bar' : 'Quik Corner';
    G.ui.shop(title, kind === 'cafe' ? 'Order at the counter, then take a seat to eat. Food restores health and stamina.' : 'Pay with cash first, then your bank card.', list.map((i) => ({ ...i, desc: i.desc || (i.hp || i.st ? `+${i.hp || 0} health · +${i.st || 0} stamina` : '') })), (it) => {
      if (!E.pay(it.price, `${title}: ${it.name}`)) return;
      if (it.kind === 'cigs') { E.inventory.cigs += 10; G.ui.toast('Cigarettes', 'Open your bag (I) to smoke one. You need a lighter.', 'info'); return; }
      if (it.kind === 'lighter') { E.inventory.lighter = 1; return; }
      if (it.kind === 'use') { E.inventory.medkit++; G.ui.toast('First-aid kit', 'Use it from your bag (I).', 'info'); return; }
      G.ui.close(); G.activities.consume(it); return 'close';
    });
  }
  async sleep() {
    const G = this.game, P = G.player; await G.ui.fade(true);
    const h = G.env.hour; const target = h > 6 && h < 19 ? 21 : 7.5; const skip = ((target - h) + 24) % 24;
    G.env.setHour(target); if (target < h) { G.env.day++; G.economy.dailyIncome(); G.gymToday = 0; }
    P.health = P.maxHealth; P.stamina = P.maxStamina; G.police.clear();
    G.ui.big('RESTED', `Slept ${skip.toFixed(1)} hours · progress saved`, '#ffd166', 2.5); G.autosave('sleep');
    await new Promise((r) => setTimeout(r, 700)); await G.ui.fade(false);
  }
  dance() { this.game.activities.startDance(); }
  // ---------------- exterior door services ----------------
  async door(pt) {
    const G = this.game, E = G.economy, P = G.player, k = pt.kind;
    if (['home', 'cafe', 'store', 'gym', 'club', 'clothes'].includes(k)) return this.enter(k === 'home' ? 'home' : k);
    if (k === 'villa') { if (E.props.villa) return this.enter('villa'); const ok = await G.ui.confirm('Villa Mirador', `${PROPERTIES.villa.desc} Price ${fmtMoney(PROPERTIES.villa.price)}.`, 'Buy villa', 'Not now'); if (ok && E.buyProperty('villa')) { G.ui.big('PROPERTY PURCHASED', 'Villa Mirador is now a safehouse', '#4ade80'); G.autosave('property'); } return; }
    if (k === 'dealer') return G.menus.dealer();
    if (k === 'garage') return G.menus.garage();
    if (k === 'police') return G.menus.policeDesk();
    if (k === 'hospital') return G.menus.hospital();
    if (k === 'skydive') { const ok = await G.ui.confirm('Skydive San Aurelia', `A pilot flies you to 700 m above the city. Jump, open your parachute and land on the Coral Beach target for a bonus. Price ${fmtMoney(SKYDIVE_PRICE)}.`, 'Book jump', 'Cancel'); if (ok && E.pay(SKYDIVE_PRICE, 'Skydive booking')) G.activities.skydive(); return; }
    if (k === 'marina') { G.ui.shop('Bayside Boat Rental', 'Rentals are delivered to the nearest slip. Return them whenever you like.', BOAT_RENTAL.map((b) => ({ id: b.key, name: VEHICLES[b.key].name, desc: VEHICLES[b.key].cls, price: b.price })), (it) => { if (!E.pay(it.price, 'Boat rental: ' + it.name)) return; const s = G.city.marinaSlips[Math.floor(R() * G.city.marinaSlips.length)]; const v = G.vehicles.spawn(it.id, s.x, s.z, s.heading, { owner: 'player' }); v.rental = true; G.ui.waypoint = { x: s.x, z: s.z }; G.ui.toast('Boat ready', 'Waypoint set to your slip.', 'good'); return 'close'; }); return; }
    if (k === 'elevator') { await G.ui.fade(true); if (pt.id === 'tower') { P.teleport(141, 150.7, -101, Math.PI); G.audio.ui('chime'); this._ensureRoofHeli(); } else { P.teleport(130, L.SIDEWALK_H, -145, Math.PI); } G.cam.snapBehind(); if (G.companion) G.companion.place(P.pos.x + 1, P.pos.y, P.pos.z); await G.ui.fade(false); return; }
    if (k === 'overlook') { G.ui.toast('Vista Overlook', 'The whole city at your feet. Photo saved.', 'good'); G.phone.takePhoto(); bus.emit('overlook'); return; }
    if (k === 'charger') return G.activities.charge(pt);
  }
  _ensureRoofHeli() { const G = this.game; if (G.vehicles.list.some((v) => v.roofHeli)) return; const h = G.vehicles.spawn('skylark', 130, -110, Math.PI / 2, { color: '#f1faee', owner: 'rental', y: 150.6 }); h.roofHeli = true; h.rentPrice = HELI_PRICE; }
}
