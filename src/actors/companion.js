// Companion system: dog, cat or an original robot ("Orbi" class). Procedural models + follow AI.
import { GeoBuilder, prim } from '../core/geo.js';
import { clamp, lerp, damp, dampAngle, angleDiff, R, dist2, bus, makeCanvas, wrapAngle } from '../core/util.js';

const MAT = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
function part(b, geo, x, y, z, rx, ry, rz, sx, sy, sz, col) { b.add(geo, x, y, z, rx, ry, rz, sx, sy, sz, col); }
function meshOf(b, mat) { const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; return m; }

// ---------- quadrupeds ----------
function buildQuad(kind, o = {}) {
  const cat = kind === 'cat', s = o.small ? 0.75 : 1, col = o.color || (cat ? '#d9a066' : '#b8864e'), dark = o.dark || (cat ? '#6b4a2a' : '#5a3f22'), belly = o.belly || '#efe6d8';
  const mat = MAT(); const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const L = cat ? 0.42 : 0.62, H = cat ? 0.26 : 0.46, r = cat ? 0.1 : 0.16;
  const tb = new GeoBuilder();
  part(tb, prim('capsule', r, L, 4, 10), 0, 0, 0, Math.PI / 2, 0, 0, 1, 0.95, 1, col);
  part(tb, prim('sphere', r * 0.9, 10, 8), 0, -r * 0.35, 0.05, 0, 0, 0, 1, 0.7, 1.6, belly);
  const torso = meshOf(tb, mat); torso.position.y = H; body.add(torso);
  const neck = new THREE.Group(); neck.position.set(0, H + r * 0.6, L / 2 + r * 0.4); body.add(neck);
  const hb = new GeoBuilder();
  part(hb, prim('sphere', cat ? 0.085 : 0.12, 12, 10), 0, 0.08, 0.04, 0, 0, 0, 1, 0.95, 1.05, col);
  if (!cat) part(hb, prim('box', 0.1, 0.08, 0.14), 0, 0.04, 0.16, 0, 0, 0, 1, 1, 1, col); else part(hb, prim('sphere', 0.04, 8, 6), 0, 0.05, 0.1, 0, 0, 0, 1.2, 0.8, 1, belly);
  part(hb, prim('sphere', cat ? 0.012 : 0.02, 6, 4), 0, cat ? 0.07 : 0.07, cat ? 0.135 : 0.235, 0, 0, 0, 1, 1, 1, '#1a1a1a');
  for (const sd of [-1, 1]) {
    part(hb, prim('sphere', cat ? 0.016 : 0.018, 8, 6), sd * (cat ? 0.035 : 0.05), 0.11, cat ? 0.105 : 0.13, 0, 0, 0, 1, 1, 1, cat ? '#9ccf5a' : '#2a1a10');
    if (cat) part(hb, prim('cone', 0.035, 0.07, 4), sd * 0.05, 0.18, 0.02, 0, 0, sd * -0.25, 1, 1, 0.6, col);
  }
  const head = meshOf(hb, mat); neck.add(head);
  const ears = [];
  if (!cat) for (const sd of [-1, 1]) { const e = new THREE.Mesh(prim('box', 0.05, 0.11, 0.025), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 })); e.position.set(sd * 0.085, 0.14, 0.0); e.rotation.z = sd * 0.5; e.castShadow = true; neck.add(e); ears.push(e); }
  const tail = new THREE.Group(); tail.position.set(0, H + r * 0.3, -L / 2 - r * 0.6); body.add(tail);
  const tseg = []; let parent = tail;
  for (let i = 0; i < (cat ? 4 : 3); i++) { const g = new THREE.Group(); g.position.z = i === 0 ? 0 : -(cat ? 0.075 : 0.07); const m = new THREE.Mesh(prim('capsule', (cat ? 0.022 : 0.03) * (1 - i * 0.12), cat ? 0.06 : 0.06, 2, 6), new THREE.MeshStandardMaterial({ color: i > 1 && cat ? dark : col, roughness: 0.8 })); m.rotation.x = Math.PI / 2; m.position.z = -0.035; g.add(m); parent.add(g); parent = g; tseg.push(g); }
  const legs = [];
  for (const [fx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(sz * r * 0.65, H - 0.02, fx * (L / 2 - 0.02)); body.add(hip);
    const ul = H * 0.52, ll = H * 0.5;
    const up = new THREE.Mesh(prim('capsule', cat ? 0.028 : 0.042, ul, 2, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 })); up.position.y = -ul / 2; up.castShadow = true; hip.add(up);
    const knee = new THREE.Group(); knee.position.y = -ul; hip.add(knee);
    const lo = new THREE.Mesh(prim('capsule', cat ? 0.022 : 0.032, ll, 2, 6), new THREE.MeshStandardMaterial({ color: fx > 0 ? col : col, roughness: 0.8 })); lo.position.y = -ll / 2; lo.castShadow = true; knee.add(lo);
    const paw = new THREE.Mesh(prim('sphere', cat ? 0.028 : 0.04, 6, 4), new THREE.MeshStandardMaterial({ color: belly, roughness: 0.8 })); paw.position.set(0, -ll + 0.01, 0.015); paw.scale.set(1, 0.6, 1.3); knee.add(paw);
    legs.push({ hip, knee, front: fx > 0, side: sz });
  }
  root.scale.setScalar(s);
  let ph = R() * 6, wag = 0;
  const animate = (dt, speed, special, happy = 0.5) => {
    const run = clamp(speed / 5, 0, 1); ph += dt * (2 + speed * (cat ? 2.6 : 1.9));
    const amp = Math.min(0.75, speed * 0.16);
    const sit = special === 'sit', lie = special === 'lie', sniff = special === 'sniff' || special === 'groom';
    legs.forEach((lg, i) => {
      const p = ph + (i === 0 || i === 3 ? 0 : Math.PI) + (run > 0.7 ? (lg.front ? 0 : 0.6) : 0);
      let hx = Math.sin(p) * amp, kx = Math.max(0, Math.cos(p)) * amp * (lg.front ? -1.1 : 1.3);
      if (sit && !lg.front) { hx = -1.2; kx = 2.2; } if (sit && lg.front) { hx = 0.15; kx = 0; }
      if (lie) { hx = lg.front ? -1.3 : 1.25; kx = lg.front ? 0.3 : -0.2; }
      lg.hip.rotation.x = damp(lg.hip.rotation.x, hx, 14, dt); lg.knee.rotation.x = damp(lg.knee.rotation.x, kx, 14, dt);
    });
    const tgtPitch = sit ? -0.45 : 0, tgtY = lie ? -H * 0.75 : sit ? -H * 0.32 : Math.abs(Math.sin(ph * 2)) * 0.015 * run;
    body.rotation.x = damp(body.rotation.x, tgtPitch, 8, dt); body.position.y = damp(body.position.y, tgtY, 8, dt);
    neck.rotation.x = damp(neck.rotation.x, sniff ? 0.7 : sit ? -0.35 : -0.1 + Math.sin(ph) * 0.04 * run, 6, dt);
    neck.rotation.y = damp(neck.rotation.y, sniff ? Math.sin(ph * 0.7) * 0.4 : special === 'look' ? 0.5 : 0, 4, dt);
    wag += dt * (cat ? 2 : 6 + happy * 10);
    tseg.forEach((g, i) => { g.rotation.y = Math.sin(wag - i * 0.6) * (cat ? 0.25 : 0.25 + happy * 0.35); g.rotation.x = cat ? -0.5 + i * 0.1 : (-0.6 + (sit ? 0.6 : 0)) / (i + 1); });
    for (const e of ears) e.rotation.x = damp(e.rotation.x, run > 0.5 ? -0.6 : 0, 6, dt);
  };
  return { root, animate, kind, height: H + 0.25 };
}

// ---------- original robot companion ----------
function hawaiianTex() {
  const c = makeCanvas(256, 128), g = c.getContext('2d'); g.fillStyle = '#17a3a0'; g.fillRect(0, 0, 256, 128);
  const leaf = (x, y, r, a) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#0d6b5e'; g.beginPath(); g.ellipse(0, 0, r * 1.8, r * 0.55, 0, 0, 7); g.fill(); g.restore(); };
  const flower = (x, y, r, col) => { g.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.62, r * 0.42, a, 0, 7); g.fill(); } g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, r * 0.22, 0, 7); g.fill(); };
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) leaf(rnd() * 256, rnd() * 128, 6 + rnd() * 8, rnd() * 3);
  for (let i = 0; i < 18; i++) flower(rnd() * 256, rnd() * 128, 7 + rnd() * 7, ['#ff4f9a', '#ffcf3d', '#ff7b39', '#ffffff'][i % 4]);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
}
function buildRobot(o = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shell = o.color || '#c9b292', accent = o.accent || '#e0a948', dark = '#2a2622';
  const mat = MAT(); const tb = new GeoBuilder();
  part(tb, prim('capsule', 0.2, 0.22, 6, 14), 0, 0, 0, 0, 0, 0, 1, 1, 0.85, shell);
  part(tb, prim('box', 0.3, 0.06, 0.2), 0, -0.05, 0.12, 0, 0, 0, 1, 1, 1, accent);
  part(tb, prim('cyl', 0.06, 0.06, 0.03, 12), 0, 0.08, 0.17, Math.PI / 2, 0, 0, 1, 1, 1, accent);
  part(tb, prim('torus', 0.21, 0.02, 6, 24), 0, 0.12, 0, Math.PI / 2, 0, 0, 1, 1, 0.85, dark);
  const torso = meshOf(tb, mat); torso.position.y = 0.62; body.add(torso);
  // boardwalk style: open Hawaiian shirt, gold chains (inspired by the reference stills)
  const shirtTex = hawaiianTex(), shirtMat = new THREE.MeshStandardMaterial({ map: shirtTex, roughness: 0.8, side: THREE.DoubleSide });
  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.218, 0.238, 0.36, 28, 1, true, 0.42, Math.PI * 2 - 0.84), shirtMat); shirt.position.y = 0.66; shirt.scale.z = 0.88; shirt.castShadow = true; body.add(shirt);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a92e, metalness: 1, roughness: 0.28 });
  for (const [r, y, t] of [[0.13, 0.82, 0.3], [0.155, 0.79, 0.42]]) { const ch = new THREE.Mesh(new THREE.TorusGeometry(r, 0.013, 6, 28), gold); ch.position.set(0, y, 0.035); ch.rotation.x = Math.PI / 2 - t; ch.scale.set(1, 1.15, 1); body.add(ch); }
  const neck = new THREE.Group(); neck.position.set(0, 0.92, 0); body.add(neck);
  const hb = new GeoBuilder();
  part(hb, prim('sphere', 0.17, 18, 14), 0, 0.14, 0, 0, 0, 0, 1.25, 0.9, 1, shell);
  part(hb, prim('cyl', 0.012, 0.012, 0.16, 6), 0.1, 0.32, -0.02, 0, 0, -0.3, 1, 1, 1, dark);
  part(hb, prim('torus', 0.08, 0.015, 6, 16), 0, 0.05, 0, Math.PI / 2, 0, 0, 1.2, 1, 1, dark);
  for (const sd of [-1, 1]) part(hb, prim('cyl', 0.05, 0.05, 0.04, 12), sd * 0.215, 0.14, 0, 0, 0, Math.PI / 2, 1, 1, 1, accent);
  const head = meshOf(hb, mat); neck.add(head);
  // aviator sunglasses pushed up on the head + twin antennas
  const lens = new THREE.MeshStandardMaterial({ color: 0x3a2a10, metalness: 0.9, roughness: 0.08 });
  for (const sd of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), lens); l.scale.set(1, 0.72, 0.32); l.position.set(sd * 0.062, 0.27, 0.12); l.rotation.x = -0.5; neck.add(l); }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), gold); bridge.position.set(0, 0.29, 0.125); bridge.rotation.x = -0.5; neck.add(bridge);
  for (const sd of [-1, 1]) { const an = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x9a8f80, metalness: 0.8, roughness: 0.35 })); an.position.set(sd * 0.17, 0.33, -0.02); an.rotation.z = -sd * 0.25; neck.add(an); }
  const tip = new THREE.Mesh(prim('sphere', 0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3ff5e9, toneMapped: false })); tip.position.set(0.125, 0.4, -0.02); neck.add(tip);
  // animated visor face (canvas texture)
  const cv = makeCanvas(128, 64), g = cv.getContext('2d'); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.172, 24, 12, -0.85, 1.7, Math.PI * 0.36, Math.PI * 0.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  visor.scale.set(1.25, 0.9, 1); visor.position.y = 0.14; visor.rotation.y = Math.PI / 2; neck.add(visor);
  let face = '', blinkT = 2;
  const drawFace = (mood, blink) => {
    const key = mood + blink; if (key === face) return; face = key;
    g.fillStyle = '#071417'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#3ff5e9'; g.shadowColor = '#3ff5e9'; g.shadowBlur = 8;
    const ey = 30;
    for (const ex of [38, 90]) {
      if (blink) g.fillRect(ex - 12, ey, 24, 4);
      else if (mood === 'happy') { g.beginPath(); g.arc(ex, ey + 8, 12, Math.PI * 1.1, Math.PI * 1.9); g.lineWidth = 6; g.strokeStyle = '#3ff5e9'; g.stroke(); }
      else if (mood === 'sleep') { g.fillRect(ex - 10, ey + 4, 20, 3); }
      else if (mood === 'alert') { g.fillRect(ex - 6, ey - 12, 12, 24); }
      else if (mood === 'charge') { g.strokeStyle = '#7dff7a'; g.lineWidth = 3; g.strokeRect(ex - 12, ey - 7, 22, 14); g.fillStyle = '#7dff7a'; g.fillRect(ex - 10, ey - 5, 6 + (Date.now() / 300 % 3) * 5, 10); }
      else { g.beginPath(); g.ellipse(ex, ey, 9, 12, 0, 0, 7); g.fill(); }
    }
    tex.needsUpdate = true;
  };
  drawFace('neutral', false);
  // arms + legs
  const limbs = [];
  for (const sd of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sd * 0.25, 0.74, 0); body.add(sh);
    const a = new THREE.Mesh(prim('capsule', 0.045, 0.22, 3, 8), new THREE.MeshStandardMaterial({ color: shell, roughness: 0.5 })); a.position.y = -0.14; a.castShadow = true; sh.add(a);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.12, 14, 1, true), shirtMat); sl.position.y = -0.04; sh.add(sl);
    const hand = new THREE.Mesh(prim('sphere', 0.055, 8, 6), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.4 })); hand.position.y = -0.3; sh.add(hand);
    const hip = new THREE.Group(); hip.position.set(sd * 0.11, 0.44, 0); body.add(hip);
    const th = new THREE.Mesh(prim('capsule', 0.05, 0.16, 3, 8), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.4 })); th.position.y = -0.1; th.castShadow = true; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.21; hip.add(knee);
    const sn = new THREE.Mesh(prim('capsule', 0.045, 0.15, 3, 8), new THREE.MeshStandardMaterial({ color: shell, roughness: 0.5 })); sn.position.y = -0.09; sn.castShadow = true; knee.add(sn);
    const foot = new THREE.Group(); foot.position.set(0, -0.2, 0.02); knee.add(foot); // roller skate
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.17), new THREE.MeshStandardMaterial({ color: shell, roughness: 0.45, metalness: 0.5 })); boot.castShadow = true; foot.add(boot);
    const wmat = new THREE.MeshStandardMaterial({ color: 0xe0566f, roughness: 0.5 });
    for (const wz of [-0.055, 0.055]) for (const wx of [-0.035, 0.035]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 10), wmat); wh.rotation.z = Math.PI / 2; wh.position.set(wx, -0.05, wz); foot.add(wh); }
    limbs.push({ sh, hip, knee, sd });
  }
  let ph = 0, scanT = 0;
  const animate = (dt, speed, special, happy = 0.5) => {
    ph += dt * (1.5 + speed * 2.6); const amp = Math.min(0.7, speed * 0.2);
    const sit = special === 'sit' || special === 'charge';
    for (const l of limbs) {
      const p = ph + (l.sd > 0 ? 0 : Math.PI);
      l.hip.rotation.x = damp(l.hip.rotation.x, sit ? -1.4 : -Math.sin(p) * amp, 12, dt); l.knee.rotation.x = damp(l.knee.rotation.x, sit ? 1.5 : Math.max(0, Math.cos(p)) * amp * 1.4, 12, dt);
      l.sh.rotation.x = damp(l.sh.rotation.x, special === 'wave' && l.sd < 0 ? -2.6 : Math.sin(p) * amp * 0.7, 10, dt);
      l.sh.rotation.z = damp(l.sh.rotation.z, special === 'wave' && l.sd < 0 ? Math.sin(ph * 4) * 0.4 : l.sd * 0.12, 10, dt);
    }
    body.position.y = damp(body.position.y, sit ? -0.3 : Math.abs(Math.sin(ph)) * 0.02 * Math.min(1, speed), 8, dt);
    scanT += dt;
    neck.rotation.y = damp(neck.rotation.y, special === 'scan' ? Math.sin(scanT * 1.4) * 0.7 : special === 'look' ? 0.5 : 0, 4, dt);
    neck.rotation.z = damp(neck.rotation.z, special === 'tilt' || happy > 0.8 ? 0.25 : 0, 4, dt);
    blinkT -= dt; const blink = blinkT < 0.12; if (blinkT < 0) blinkT = 2 + R() * 3;
    drawFace(special === 'charge' ? 'charge' : special === 'sleep' ? 'sleep' : happy >= 0.5 ? 'happy' : special === 'alert' ? 'alert' : 'neutral', blink && special !== 'charge');
    tip.material.color.setHSL(0.48, 1, 0.5 + Math.sin(scanT * 4) * 0.2);
  };
  return { root, animate, kind: 'robot', height: 1.15 };
}

export function makeCompanionModel(kind, o = {}) { return kind === 'robot' ? buildRobot(o) : buildQuad(kind, o); }

export class Companion {
  constructor(game, kind = 'dog', name = 'Rocket', o = {}) {
    this.game = game; this.kind = kind; this.name = name; this.color = o.color;
    this.model = makeCompanionModel(kind, { color: o.color }); this.root = this.model.root; game.scene.add(this.root);
    this.pos = this.root.position; this.heading = 0; this.speed = 0; this.mode = 'follow'; this.special = null; this.happy = 0.5;
    this.idleT = 0; this.stuckT = 0; this.lastP = new THREE.Vector3(); this.teleports = 0; this.inVehicle = null; this.soundT = 5; this.petT = 0;
  }
  setKind(kind, name, color) { this.game.scene.remove(this.root); this.kind = kind; if (name) this.name = name; this.color = color; this.model = makeCompanionModel(kind, { color }); const p = this.pos.clone(); this.root = this.model.root; this.pos = this.root.position; this.pos.copy(p); this.game.scene.add(this.root); }
  place(x, y, z) { this.pos.set(x, y, z); }
  command(cmd) {
    const G = this.game;
    if (cmd === 'toggle') this.mode = this.mode === 'stay' ? 'follow' : 'stay';
    else this.mode = cmd;
    G.ui.toast(this.name, this.mode === 'stay' ? 'Staying put.' : this.mode === 'come' ? 'Coming to you!' : 'Following you.', 'info', 1.6);
    this.voice();
  }
  voice() { const G = this.game; G.audio.human(this.kind === 'dog' ? 'bark' : this.kind === 'cat' ? 'meow' : 'robot', this.pos, this.kind === 'dog' ? 1 : 1.1); }
  pet() { this.happy = 1; this.petT = 3; this.special = this.kind === 'robot' ? 'tilt' : 'sit'; if (this.kind === 'cat') this.game.audio.human('purr', this.pos); else this.voice(); bus.emit('pet'); }
  onEnterVehicle(v) {
    const can = v.type === 'car' && v.spec.body !== 'bus'; const d = this.pos.distanceTo(v.pos);
    if (can && d < 14 && this.mode !== 'stay') { this.inVehicle = v; this.root.visible = true; }
    else if (this.mode !== 'stay') this.mode = 'waiting';
  }
  onExitVehicle(v) {
    const G = this.game, P = G.player;
    if (this.inVehicle) { const d = v.doorWorld(-1); this.pos.set(d.x, G.city.surfaceHeight(d.x, d.z, v.pos.y + 1), d.z); this.inVehicle = null; this.voice(); }
    else if (this.mode === 'waiting') { this.mode = 'follow'; if (this.pos.distanceTo(P.pos) > 60) this._recover(true); }
  }
  _recover(force) { // reappear behind the player, out of the camera's view
    const G = this.game, P = G.player, cam = G.cam.cam;
    const back = P.heading + Math.PI; for (let k = 0; k < 8; k++) {
      const a = back + (k % 2 ? 1 : -1) * k * 0.35, d = 6 + k; const x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
      const p = { x, z }; if (G.city.collideCircle(p, 0.4, P.pos.y + 0.2, 1)) continue;
      const toC = new THREE.Vector3(x - cam.position.x, 0, z - cam.position.z).normalize(); const fw = new THREE.Vector3(); cam.getWorldDirection(fw); fw.y = 0; fw.normalize();
      if (!force && toC.dot(fw) > 0.3) continue;
      this.pos.set(x, G.city.surfaceHeight(x, z, P.pos.y + 1), z); this.teleports++; return true;
    }
    return false;
  }
  update(dt) {
    const G = this.game, P = G.player;
    this.petT -= dt; if (this.petT <= 0 && this.special === 'tilt') this.special = null; this.happy = damp(this.happy, 0.5, 0.2, dt);
    if (this.inVehicle) {
      const v = this.inVehicle; if (v.disabled && !v.driver) { this.inVehicle = null; return; }
      const seat = new THREE.Vector3(-v.m.seat[0], v.m.seat[1] + (this.kind === 'robot' ? 0.45 : 0.55), v.m.seat[2]); v.body.localToWorld(seat);
      this.pos.copy(seat); this.root.quaternion.copy(v.body.getWorldQuaternion(new THREE.Quaternion())); this.model.animate(dt, 0, 'sit', this.happy); return;
    }
    this.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    if (G.interior && !this.interior) { this.root.visible = false; return; } this.root.visible = true;
    const inCombat = G.combat && G.combat.active > 0;
    let tx = P.pos.x, tz = P.pos.z, want = 0, special = null;
    const side = P.heading + Math.PI * 0.75;
    if (P.state === 'vehicle') { this.mode = this.mode === 'stay' ? 'stay' : 'waiting'; }
    if (this.mode === 'waiting' && P.state !== 'vehicle') this.mode = 'follow';
    const dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (this.mode === 'follow' || this.mode === 'come') {
      tx = P.pos.x + Math.sin(side) * (inCombat ? 6 : 1.6); tz = P.pos.z + Math.cos(side) * (inCombat ? 6 : 1.6);
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      want = d < 0.5 ? 0 : d < 3 ? Math.min(1.4, d) : d < 8 ? 3.5 : 7.5; if (this.kind === 'cat' && d < 6) want = Math.min(want, 2.5);
      if (this.mode === 'come' && dist < 2.2) this.mode = 'follow';
      if (dist > 70 && P.state !== 'vehicle') this._recover(false);
      if (P.state === 'swim' || P.state === 'freefall' || P.state === 'parachute') { want = Math.min(want, 2); }
    }
    if (this.mode === 'stay' || this.mode === 'waiting') { want = 0; special = this.kind === 'robot' ? (this.idleT > 30 ? 'charge' : 'scan') : 'sit'; }
    // steering with simple feelers
    const dx = tx - this.pos.x, dz = tz - this.pos.z; let ang = Math.atan2(dx, dz);
    if (want > 0) {
      for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const a = ang + off, fx = this.pos.x + Math.sin(a) * 1.2, fz = this.pos.z + Math.cos(a) * 1.2; const p = { x: fx, z: fz };
        if (!G.city.collideCircle(p, 0.3, this.pos.y + 0.2, 0.8)) { ang = a; break; }
      }
      this.heading = dampAngle(this.heading, ang, 7, dt);
    } else if (dist < 6) this.heading = dampAngle(this.heading, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), 2, dt);
    this.speed = damp(this.speed, want, 4, dt);
    const p = { x: this.pos.x + Math.sin(this.heading) * this.speed * dt, z: this.pos.z + Math.cos(this.heading) * this.speed * dt };
    G.city.collideCircle(p, 0.3, this.pos.y + 0.2, 0.8);
    // dodge oncoming vehicles
    for (const v of G.vehicles.list) { if (Math.abs(v.speed) < 6) continue; const ex = p.x - v.pos.x, ez = p.z - v.pos.z; if (ex * ex + ez * ez < 9) { p.x += ex * 0.3; p.z += ez * 0.3; special = 'alert'; } }
    this.pos.x = p.x; this.pos.z = p.z;
    const ground = G.city.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
    const wl = G.ocean.height(this.pos.x, this.pos.z);
    this.pos.y = ground < wl - 0.6 ? damp(this.pos.y, wl - 0.35, 6, dt) : damp(this.pos.y, ground, 14, dt);
    // stuck recovery
    this.stuckT += dt; if (this.stuckT > 2.5) { if (want > 1 && this.lastP.distanceTo(this.pos) < 0.8 && dist > 8) this._recover(false); this.stuckT = 0; this.lastP.copy(this.pos); }
    // idle behaviours
    if (want < 0.2 && P.speed < 0.3) this.idleT += dt; else this.idleT = 0;
    if (!special && this.idleT > 4) special = this.kind === 'dog' ? (this.idleT > 20 ? 'lie' : (Math.floor(this.idleT / 5) % 2 ? 'sit' : 'sniff')) : this.kind === 'cat' ? (this.idleT > 15 ? 'lie' : 'groom') : (this.idleT > 30 ? 'charge' : 'scan');
    if (this.petT > 0) special = this.kind === 'robot' ? 'tilt' : 'sit';
    if (G.env.w.rain > 0.5 && this.kind === 'dog' && R() < dt * 0.05) special = 'alert';
    this.special = special;
    this.model.animate(dt, this.speed, special, this.happy);
    this.soundT -= dt; if (this.soundT <= 0) { this.soundT = 12 + R() * 25; if (dist < 15 && R() < 0.5) this.voice(); }
  }
  serialize() { return { kind: this.kind, name: this.name, color: this.color, mode: this.mode === 'waiting' ? 'follow' : this.mode }; }
}
