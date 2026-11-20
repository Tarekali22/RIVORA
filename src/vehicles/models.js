// Procedural vehicle meshes. Each builder returns { root, body, wheels, door, lightsF, lightsR, paint, extras }.
import { GeoBuilder, prim } from '../core/geo.js';
import { signTex } from '../world/textures.js';

let SH = null;
function shared() {
  if (SH) return SH;
  SH = {
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.62 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
    headOff: new THREE.MeshBasicMaterial({ color: 0xbfc7cc, toneMapped: false }), headOn: new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false }),
    rearOff: new THREE.MeshBasicMaterial({ color: 0x5a0a0a, toneMapped: false }), rearOn: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xff1a1a, toneMapped: false }), blue: new THREE.MeshBasicMaterial({ color: 0x1a5cff, toneMapped: false }), dim: new THREE.MeshBasicMaterial({ color: 0x222233, toneMapped: false }),
    wheelGeo: new Map(),
  };
  SH.headOn.color.setRGB(3, 2.8, 2.4); SH.rearOn.color.setRGB(3, 0.25, 0.15); SH.red.color.setRGB(3, 0.1, 0.1); SH.blue.color.setRGB(0.2, 0.5, 3);
  return SH;
}
export function sharedMats() { return shared(); }

function wheelGeo(r, w) {
  const S = shared(), k = r.toFixed(2) + w.toFixed(2); if (S.wheelGeo.has(k)) return S.wheelGeo.get(k);
  const b = new GeoBuilder();
  b.add(prim('cyl', r, r, w, 18), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, '#151515');
  b.add(prim('cyl', r * 0.62, r * 0.62, w + 0.02, 14), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, '#b8bcc0');
  for (let i = 0; i < 5; i++) b.add(prim('box', w + 0.04, r * 0.12, r * 1.05), 0, 0, 0, i / 5 * Math.PI, 0, 0, 1, 1, 1, '#8a8e92');
  b.add(prim('cyl', r * 0.16, r * 0.16, w + 0.05, 8), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, '#d8dadc');
  const g = b.build(); S.wheelGeo.set(k, g); return g;
}
function extrudeProfile(pts, depth, bevel = 0.05) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 2 });
  g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2);
  return g;
}
// thin bar between two profile points (x=forward, y=up) at side z
function bar(b, x0, y0, x1, y1, side, t, col) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  b.add(prim('box', t, t, len), side, (y0 + y1) / 2, (x0 + x1) / 2, -ang, 0, 0, 1, 1, 1, col);
}

function carProfile(s) {
  const L = s.L, H = s.H, hl = L / 2, body = s.body;
  const c = body === 'offroad' ? 0.42 : body === 'suv' || body === 'pickup' || body === 'evtruck' ? 0.36 : body === 'truck' || body === 'bus' ? 0.32 : body === 'super' ? 0.14 : 0.2;
  let belt = c + (H - c) * 0.5;
  const P = { c, belt };
  switch (body) {
    case 'hatch': P.lower = [[-hl + 0.1, c], [hl - 0.1, c], [hl, c + 0.25], [hl - 0.04, c + 0.45], [hl - 0.25, belt - 0.05], [hl - 0.24 * L, belt], [-hl + 0.06, belt + 0.02], [-hl, c + 0.42], [-hl + 0.02, c + 0.15]]; P.cabin = [[hl - 0.24 * L, belt], [hl - 0.43 * L, H], [-hl + 0.16 * L, H], [-hl + 0.04, belt + 0.04]]; break;
    case 'coupe': belt = c + (H - c) * 0.55; P.belt = belt; P.lower = [[-hl + 0.12, c], [hl - 0.12, c], [hl, c + 0.2], [hl - 0.03, c + 0.36], [hl - 0.3, belt - 0.04], [hl - 0.36 * L, belt], [-hl + 0.17 * L, belt + 0.02], [-hl + 0.04, belt - 0.02], [-hl, c + 0.38], [-hl + 0.02, c + 0.14]]; P.cabin = [[hl - 0.36 * L, belt], [hl - 0.55 * L, H], [-hl + 0.36 * L, H], [-hl + 0.17 * L, belt + 0.02]]; break;
    case 'super': belt = c + (H - c) * 0.5; P.belt = belt; P.lower = [[-hl + 0.12, c], [hl - 0.2, c], [hl, c + 0.12], [hl - 0.05, c + 0.24], [hl - 0.3 * L, belt], [-hl + 0.25 * L, belt + 0.06], [-hl + 0.02, belt + 0.02], [-hl, c + 0.32], [-hl + 0.04, c + 0.1]]; P.cabin = [[hl - 0.3 * L, belt], [hl - 0.5 * L, H], [-hl + 0.42 * L, H - 0.02], [-hl + 0.22 * L, belt + 0.06]]; break;
    case 'fastback': P.lower = [[-hl + 0.12, c], [hl - 0.12, c], [hl, c + 0.22], [hl - 0.03, c + 0.4], [hl - 0.28, belt - 0.06], [hl - 0.28 * L, belt], [-hl + 0.08 * L, belt + 0.04], [-hl + 0.03, belt], [-hl, c + 0.4], [-hl + 0.02, c + 0.16]]; P.cabin = [[hl - 0.28 * L, belt], [hl - 0.47 * L, H], [-hl + 0.38 * L, H], [-hl + 0.08 * L, belt + 0.04]]; break;
    case 'suv': belt = c + (H - c) * 0.52; P.belt = belt; P.lower = [[-hl + 0.12, c], [hl - 0.12, c], [hl, c + 0.3], [hl - 0.02, c + 0.55], [hl - 0.25, belt - 0.03], [hl - 0.24 * L, belt], [-hl + 0.02, belt + 0.02], [-hl, c + 0.25], [-hl + 0.05, c + 0.05]]; P.cabin = [[hl - 0.24 * L, belt], [hl - 0.37 * L, H], [-hl + 0.05, H], [-hl + 0.02, belt + 0.02]]; break;
    case 'offroad': belt = c + (H - c) * 0.48; P.belt = belt; P.lower = [[-hl + 0.05, c], [hl - 0.05, c], [hl, c + 0.6], [hl - 0.22 * L, belt], [-hl, belt], [-hl, c + 0.1]]; P.cabin = [[hl - 0.22 * L, belt], [hl - 0.3 * L, H], [-hl + 0.12, H], [-hl + 0.05, belt]]; P.sharp = true; break;
    case 'pickup': belt = c + (H - c) * 0.5; P.belt = belt; P.lower = [[-hl + 0.1, c], [hl - 0.1, c], [hl, c + 0.35], [hl - 0.02, c + 0.6], [hl - 0.2 * L, belt], [-hl + 0.02, belt], [-hl, c + 0.15]]; P.cabin = [[hl - 0.2 * L, belt], [hl - 0.31 * L, H], [-0.05 * L, H], [-0.05 * L, belt]]; P.bed = true; break;
    case 'evtruck': belt = c + (H - c) * 0.42; P.belt = belt; P.lower = [[-hl + 0.15, c], [hl - 0.15, c], [hl, c + 0.32], [hl - 0.1, belt - 0.02], [hl - 0.25 * L, belt + 0.06], [-hl, belt + 0.04], [-hl + 0.03, c + 0.1]]; P.cabin = [[hl - 0.25 * L, belt + 0.06], [hl - 0.47 * L, H], [-0.07 * L, H - 0.02], [-0.22 * L, belt + 0.05]]; P.sharp = true; P.bed = true; break;
    case 'van': P.lower = [[-hl + 0.1, c], [hl - 0.1, c], [hl, c + 0.4], [hl - 0.05, c + 0.62], [hl - 0.13 * L, belt], [hl - 0.24 * L, H], [-hl + 0.02, H], [-hl, c + 0.1]]; P.cabin = null; P.vanGlass = true; break;
    case 'truck': P.lower = [[-hl, c], [hl - 0.1, c], [hl, c + 0.4], [hl, belt * 0.95], [hl - 0.25 * L, belt * 0.95], [hl - 0.25 * L, c + 0.3], [-hl, c + 0.3]]; P.cabin = [[hl - 0.01, belt * 0.95], [hl - 0.04, H * 0.86], [hl - 0.24 * L, H * 0.86], [hl - 0.24 * L, belt * 0.95]]; P.box = true; P.sharp = true; break;
    case 'bus': P.lower = [[-hl, c], [hl, c], [hl, c + 0.9], [-hl, c + 0.9]]; P.cabin = [[hl, c + 0.9], [hl - 0.08, H - 0.25], [-hl, H - 0.25], [-hl, c + 0.9]]; P.busRoof = true; P.sharp = true; break;
    default: // sedan
      P.lower = [[-hl + 0.12, c], [hl - 0.12, c], [hl, c + 0.22], [hl - 0.02, c + 0.42], [hl - 0.26, belt - 0.06], [hl - 0.28 * L, belt], [-hl + 0.2 * L, belt + 0.03], [-hl + 0.04, belt - 0.03], [-hl, c + 0.4], [-hl + 0.02, c + 0.17]];
      P.cabin = [[hl - 0.28 * L, belt], [hl - 0.45 * L, H], [-hl + 0.34 * L, H], [-hl + 0.2 * L, belt + 0.03]];
  }
  return P;
}

export function buildVehicleModel(spec, color, opts = {}) {
  const t = spec.type;
  if (t === 'bike') return buildBike(spec, color);
  if (t === 'boat') return buildBoat(spec, color);
  if (t === 'heli') return buildHeli(spec, color);
  if (t === 'plane') return buildPlane(spec, color);
  return buildCar(spec, color, opts);
}

function finish(root, body, paintGeo, trimGeo, glassGeo, frontGeo, rearGeo, color, metal = 0.55) {
  const S = shared();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: metal });
  const pm = new THREE.Mesh(paintGeo, paint); pm.castShadow = true; pm.receiveShadow = true; body.add(pm);
  if (trimGeo) { const tm = new THREE.Mesh(trimGeo, S.trim); tm.castShadow = true; body.add(tm); }
  if (glassGeo) body.add(new THREE.Mesh(glassGeo, S.glass));
  let lightsF = null, lightsR = null;
  if (frontGeo) { lightsF = new THREE.Mesh(frontGeo, S.headOff); body.add(lightsF); }
  if (rearGeo) { lightsR = new THREE.Mesh(rearGeo, S.rearOff); body.add(lightsR); }
  return { paint, lightsF, lightsR };
}

function buildCar(s, color, opts) {
  const P = carProfile(s), L = s.L, W = s.W, H = s.H, hl = L / 2, c = P.c, belt = P.belt;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new GeoBuilder(), trim = new GeoBuilder(), glass = new GeoBuilder(), lf = new GeoBuilder(), lr = new GeoBuilder();
  const I = new THREE.Matrix4();
  paint.addGeometry(extrudeProfile(P.lower, W, P.sharp ? 0.02 : 0.06), I, '#ffffff');
  const cw = W * 0.86;
  if (P.cabin) {
    glass.addGeometry(extrudeProfile(P.cabin, cw, P.sharp ? 0.01 : 0.03), I, '#ffffff');
    const C = P.cabin, roofF = C[1][0], roofR = C[2][0], rh = C[1][1];
    if (!P.box) paint.box(0, rh + 0.03, (roofF + roofR) / 2, cw + 0.02, 0.07, roofF - roofR + 0.06, '#ffffff');
    for (const side of [-1, 1]) {
      const z = side * (cw / 2 + 0.005);
      bar(paint, C[0][0], C[0][1], C[1][0], C[1][1], z, 0.08, '#ffffff');
      bar(paint, C[3][0], C[3][1], C[2][0], C[2][1], z, 0.1, '#ffffff');
      if (!P.busRoof && !P.box) { const mx = (C[0][0] + C[3][0]) / 2 - 0.1; paint.box(z, (belt + rh) / 2, mx, 0.05, rh - belt, 0.1, '#ffffff'); }
      if (P.busRoof) for (let x = -hl + 1.2; x < hl - 1; x += 1.4) paint.box(z, (C[0][1] + C[1][1]) / 2, x, 0.04, C[1][1] - C[0][1], 0.12, '#ffffff');
    }
    if (P.busRoof) paint.box(0, H - 0.12, 0, W, 0.25, L, '#ffffff');
  }
  if (P.box) { paint.box(0, (c + 0.3 + H) / 2 + 0.05, -hl + 0.37 * L, W, H - c - 0.3, 0.74 * L, '#ffffff'); trim.box(0, c + 0.25, -0.1 * L, W * 0.9, 0.2, L * 0.8, '#222'); }
  if (P.vanGlass) {
    glass.box(0, (belt + H - 0.1) / 2, hl - 0.18 * L, W * 0.88, H - 0.1 - belt, 0.08, '#fff', { rotY: 0 });
    for (const sd of [-1, 1]) glass.box(sd * (W / 2 + 0.01), (belt + H - 0.15) / 2, hl - 0.33 * L, 0.03, H - 0.25 - belt, 0.7, '#fff');
  }
  if (P.bed) { trim.box(0, belt - 0.05, -hl + (s.body === 'evtruck' ? 0.3 : 0.27) * L * 0.5 + 0.1, W * 0.84, 0.04, L * (s.body === 'evtruck' ? 0.28 : 0.42), '#2a2a2a'); }
  // bumpers, grille, plates
  trim.box(0, c + 0.2, hl + 0.02, W * 0.96, 0.22, 0.1, '#1e1e1e'); trim.box(0, c + 0.2, -hl - 0.02, W * 0.96, 0.22, 0.1, '#1e1e1e');
  trim.box(0, c + 0.42, hl + 0.01, W * 0.42, 0.14, 0.04, s.body === 'evtruck' || s.electric ? '#2a2d30' : '#0d0d0d');
  trim.box(0, c + 0.3, hl + 0.075, 0.5, 0.11, 0.01, '#f2f2f2'); trim.box(0, c + 0.34, -hl - 0.075, 0.5, 0.11, 0.01, '#f2f2f2');
  for (const sd of [-1, 1]) {
    trim.box(sd * (W / 2 + 0.09), belt + 0.08, hl - 0.28 * L - 0.05, 0.16, 0.1, 0.18, '#151515'); // mirrors
    lf.box(sd * (W / 2 - 0.24), c + (s.body === 'super' ? 0.28 : 0.46), hl + 0.0, 0.34, 0.09, 0.06, '#fff');
    lr.box(sd * (W / 2 - 0.2), c + (s.body === 'super' ? 0.34 : 0.5), -hl - 0.01, 0.3, 0.1, 0.05, '#fff');
  }
  if (s.body === 'evtruck') { lf.box(0, belt - 0.02, hl - 0.08, W * 0.9, 0.03, 0.04, '#fff'); lr.box(0, belt + 0.02, -hl - 0.01, W * 0.92, 0.04, 0.04, '#fff'); }
  if (s.electric && s.body !== 'evtruck') lf.box(0, c + 0.52, hl - 0.05, W * 0.7, 0.025, 0.03, '#fff');
  // interior: seats, dash, steering wheel
  const seatZ = P.cabin ? (P.cabin[0][0] + P.cabin[3][0]) / 2 : hl - 0.3 * L;
  for (const sd of [-1, 1]) { trim.box(sd * 0.38, c + 0.3, seatZ - 0.15, 0.5, 0.12, 0.5, '#2b2b2b'); trim.box(sd * 0.38, c + 0.62, seatZ - 0.42, 0.5, 0.6, 0.1, '#2b2b2b'); }
  trim.box(0, belt - 0.02, (P.cabin ? P.cabin[0][0] : hl * 0.6) - 0.05, W * 0.84, 0.16, 0.3, '#1a1a1a');
  trim.add(prim('torus', 0.17, 0.025, 6, 16), 0.38, belt + 0.06, (P.cabin ? P.cabin[0][0] : hl * 0.6) - 0.32, -0.9, 0, 0, 1, 1, 1, '#111');
  if (s.taxi) { trim.box(0, H + 0.14, (P.cabin[1][0] + P.cabin[2][0]) / 2, 0.8, 0.22, 0.3, '#fff6c2'); }
  // police / ambulance light bars
  const extras = {};
  if (s.police || s.ambulance) {
    const ry = (P.cabin ? P.cabin[1][1] : H) + 0.1, rz = P.cabin ? (P.cabin[1][0] + P.cabin[2][0]) / 2 : 0;
    trim.box(0, ry - 0.02, rz, 1.2, 0.05, 0.3, '#222');
    const S = shared(); const lb = new THREE.Group();
    const r1 = new THREE.Mesh(prim('box', 0.52, 0.12, 0.26), S.dim); r1.position.set(0.3, ry + 0.06, rz);
    const b1 = new THREE.Mesh(prim('box', 0.52, 0.12, 0.26), S.dim); b1.position.set(-0.3, ry + 0.06, rz);
    lb.add(r1, b1); body.add(lb); extras.lightbar = [r1, b1];
    if (s.police) { paint.box(0, (c + belt) / 2 + 0.05, 0.2, W + 0.02, belt - c - 0.2, 1.6, '#ffffff'); }
    if (s.ambulance) { paint.box(0, c + 0.75, 0, W + 0.02, 0.18, L * 0.98, '#d62828'); }
    const decal = signTex(s.police ? 'SAPD' : 'MEDIC', { bg: s.police ? '#ffffff' : '#ffffff', fg: s.police ? '#0b2a6f' : '#d62828', w: 256, h: 96, size: 70 });
    const dm = new THREE.MeshBasicMaterial({ map: decal, transparent: false });
    for (const sd of [-1, 1]) { const d = new THREE.Mesh(prim('plane', 1, 0.36), dm); d.position.set(sd * (W / 2 + 0.035), c + 0.45 + (s.ambulance ? 0.6 : 0), 0.2); d.rotation.y = sd * Math.PI / 2; body.add(d); }
  }
  if (s.taxi) { const d = new THREE.Mesh(prim('plane', 0.7, 0.18), new THREE.MeshBasicMaterial({ map: signTex('TAXI', { bg: '#fff6c2', fg: '#111', w: 256, h: 64, size: 56 }) })); d.position.set(0, H + 0.14, (P.cabin[1][0] + P.cabin[2][0]) / 2 + 0.152); body.add(d); const d2 = d.clone(); d2.rotation.y = Math.PI; d2.position.z -= 0.304; body.add(d2); }
  const { paint: pmat, lightsF, lightsR } = finish(root, body, paint.build(), trim.build(), P.cabin || P.vanGlass ? glass.build() : null, lf.build(), lr.build(), color, s.body === 'evtruck' ? 0.85 : 0.55);
  // driver door (opens outward around a front hinge)
  const doorLen = Math.min(1.15, L * 0.22), doorH = belt - c - 0.08;
  const dz = P.cabin ? P.cabin[0][0] - 0.05 : hl - 0.2 * L;
  const door = new THREE.Group(); door.position.set(W / 2 + 0.035, c + 0.06 + doorH / 2, dz);
  const dm = new THREE.Mesh(prim('box', 0.05, doorH, doorLen), pmat); dm.position.z = -doorLen / 2; dm.castShadow = true; door.add(dm);
  const handle = new THREE.Mesh(prim('box', 0.03, 0.03, 0.14), shared().trim); handle.position.set(0.03, doorH * 0.25, -doorLen + 0.2); door.add(handle);
  body.add(door);
  // wheels
  const wr = s.body === 'offroad' ? 0.46 : s.body === 'bus' || s.body === 'truck' ? 0.52 : s.body === 'suv' || s.body === 'pickup' || s.body === 'evtruck' ? 0.4 : s.body === 'super' ? 0.35 : 0.33;
  const ww = s.body === 'super' ? 0.3 : 0.24;
  const wg = wheelGeo(wr, ww);
  const fa = hl - Math.max(0.75, L * 0.17), ra = -hl + Math.max(0.8, L * (s.body === 'bus' ? 0.22 : 0.17));
  const wheels = [];
  for (const [z, front] of [[fa, true], [ra, false]]) for (const sd of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sd * (W / 2 - ww / 2 + 0.02), wr, z);
    const m = new THREE.Mesh(wg, shared().trim); m.castShadow = true; piv.add(m); root.add(piv);
    wheels.push({ piv, m, front, r: wr });
  }
  if (s.body === 'offroad') { const sp = new THREE.Mesh(wg, shared().trim); sp.rotation.y = Math.PI / 2; sp.position.set(0, c + 0.9, -hl - 0.15); sp.scale.setScalar(0.9); body.add(sp); }
  return { root, body, wheels, door, lightsF, lightsR, paint: pmat, extras, wheelBase: fa - ra, track: W - ww, seat: [0.38, Math.min(c + 0.3, H - 0.92) - 0.5, seatZ - 0.1], camH: Math.max(1.6, H * 0.85), dims: { L, W, H } };
}

function buildBike(s, color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new GeoBuilder(), trim = new GeoBuilder(), lf = new GeoBuilder(), lr = new GeoBuilder();
  const L = s.L, bike = s.body;
  const wr = bike === 'bicycle' ? 0.34 : bike === 'scooter' ? 0.24 : 0.31;
  const fz = L / 2 - wr * 0.9, rz = -L / 2 + wr * 0.9;
  if (bike === 'bicycle') {
    for (const [a, b] of [[[0, 0.42, rz], [0, 0.55, 0.0]], [[0, 0.55, 0.0], [0, 0.92, -0.1]], [[0, 0.92, -0.1], [0, 0.42, rz]], [[0, 0.55, 0.0], [0, 0.95, 0.45]], [[0, 0.95, 0.45], [0, wr, fz]], [[0, 0.92, -0.1], [0, 0.95, 0.45]]]) {
      const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), len = d.length(); const mid = new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5);
      paint.add(prim('cyl', 0.022, 0.022, len, 6), mid.x, mid.y, mid.z, Math.atan2(d.z, d.y), 0, 0, 1, 1, 1, '#ffffff');
    }
    trim.box(0, 1.0, -0.12, 0.14, 0.05, 0.26, '#1b1b1b'); trim.box(0, 1.05, 0.48, 0.55, 0.03, 0.03, '#1b1b1b');
  } else {
    paint.add(prim('capsule', bike === 'scooter' ? 0.16 : 0.2, bike === 'scooter' ? 0.5 : 0.7, 4, 10), 0, 0.72, 0.05, Math.PI / 2 - 0.25, 0, 0, 1, 1, 1, '#ffffff');
    if (bike === 'sportbike') { paint.add(prim('box', 0.42, 0.42, 0.55), 0, 0.85, fz - 0.35, -0.45, 0, 0, 1, 1, 1, '#ffffff'); paint.add(prim('box', 0.3, 0.2, 0.6), 0, 0.82, rz + 0.25, 0.25, 0, 0, 1, 1, 1, '#ffffff'); }
    else { paint.add(prim('box', 0.5, 0.55, 0.2), 0, 0.72, fz - 0.15, -0.2, 0, 0, 1, 1, 1, '#ffffff'); paint.box(0, 0.38, -0.05, 0.36, 0.08, 0.9, '#ffffff'); }
    trim.box(0, bike === 'scooter' ? 0.85 : 0.93, -0.22, 0.3, 0.1, 0.6, '#1b1b1b');
    trim.box(0, 1.08, fz - 0.28, 0.65, 0.04, 0.05, '#222'); trim.add(prim('cyl', 0.03, 0.03, 0.75, 6), 0, 0.7, fz - 0.12, 0.35, 0, 0, 1, 1, 1, '#9a9a9a');
    trim.box(0, 0.45, 0, 0.25, 0.3, 0.45, '#2a2a2a');
    lf.box(0, 0.95, fz - 0.05, 0.16, 0.1, 0.05, '#fff'); lr.box(0, 0.85, rz - 0.05, 0.14, 0.06, 0.04, '#fff');
  }
  const { paint: pmat, lightsF, lightsR } = finish(root, body, paint.build(), trim.build(), null, lf.empty ? null : lf.build(), lr.empty ? null : lr.build(), color, 0.45);
  const wg = new GeoBuilder(); wg.add(prim('torus', wr - 0.04, 0.045, 8, 22), 0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1, '#151515'); wg.add(prim('cyl', wr * (bike === 'bicycle' ? 0.12 : 0.6), wr * (bike === 'bicycle' ? 0.12 : 0.6), 0.08, 12), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1, '#9da3a8');
  if (bike === 'bicycle') for (let i = 0; i < 8; i++) wg.add(prim('box', 0.01, 0.008, wr * 1.9), 0, 0, 0, i / 8 * Math.PI, 0, 0, 1, 1, 1, '#c0c0c0');
  const wgeo = wg.build(); const wheels = [];
  for (const [z, front] of [[fz, true], [rz, false]]) { const piv = new THREE.Group(); piv.position.set(0, wr, z); const m = new THREE.Mesh(wgeo, shared().trim); m.castShadow = true; piv.add(m); root.add(piv); wheels.push({ piv, m, front, r: wr }); }
  return { root, body, wheels, door: null, lightsF, lightsR, paint: pmat, extras: {}, wheelBase: fz - rz, track: 0.2, seat: [0, bike === 'bicycle' ? 0.48 : 0.42, -0.2], camH: 1.5, dims: { L, W: s.W, H: s.H } };
}

function buildBoat(s, color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = s.L, W = s.W, ski = s.body === 'jetski';
  const sh = new THREE.Shape(); const hl = L / 2, hw = W / 2;
  sh.moveTo(-hl, -hw * 0.9); sh.lineTo(hl * 0.25, -hw); sh.quadraticCurveTo(hl * 0.85, -hw * 0.7, hl, 0); sh.quadraticCurveTo(hl * 0.85, hw * 0.7, hl * 0.25, hw); sh.lineTo(-hl, hw * 0.9); sh.closePath();
  const hh = ski ? 0.55 : 1.1;
  const hull = new THREE.ExtrudeGeometry(sh, { depth: hh, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 10 });
  hull.rotateX(-Math.PI / 2); hull.rotateY(-Math.PI / 2); hull.translate(0, -0.3, 0);
  // taper the bottom into a V
  const P = hull.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0) { P.setX(i, P.getX(i) * (0.45 + 0.55 * (y + 0.42) / 0.42)); } }
  hull.computeVertexNormals();
  const paint = new GeoBuilder(), trim = new GeoBuilder(), glass = new GeoBuilder(), lr = new GeoBuilder();
  paint.addGeometry(hull, new THREE.Matrix4(), '#ffffff');
  if (!ski) {
    trim.box(0, hh - 0.2, -0.4, W * 0.82, 0.06, L * 0.6, '#c9a27a');
    trim.box(0, hh + 0.1, 0.6, 0.9, 0.6, 0.5, '#e8e8e8'); glass.box(0, hh + 0.55, 0.95, W * 0.7, 0.5, 0.06, '#fff');
    for (const sd of [-1, 1]) trim.box(sd * 0.5, hh, -0.4, 0.6, 0.35, 0.6, '#f4f4f4');
    trim.box(0, hh - 0.05, -hl + 0.2, 0.5, 0.6, 0.35, '#222');
  } else { trim.box(0, hh + 0.12, -0.2, 0.42, 0.25, 1.2, '#1b1b1b'); trim.box(0, hh + 0.45, 0.6, 0.7, 0.05, 0.06, '#1b1b1b'); trim.add(prim('cyl', 0.04, 0.04, 0.5, 6), 0, hh + 0.25, 0.55, 0.4, 0, 0, 1, 1, 1, '#333'); }
  lr.box(0, hh + 0.05, -hl - 0.02, 0.2, 0.08, 0.04, '#fff');
  const { paint: pmat, lightsF, lightsR } = finish(root, body, paint.build(), trim.build(), glass.empty ? null : glass.build(), null, lr.build(), color, 0.25);
  return { root, body, wheels: [], door: null, lightsF, lightsR, paint: pmat, extras: {}, wheelBase: L * 0.6, track: W, seat: ski ? [0, 0.38, -0.3] : [0.45, hh - 0.35, 0.3], camH: 2.2, dims: { L, W, H: s.H } };
}

function buildHeli(s, color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new GeoBuilder(), trim = new GeoBuilder(), glass = new GeoBuilder(), lr = new GeoBuilder();
  paint.add(prim('sphere', 1, 20, 14), 0, 1.75, 0.4, 0, 0, 0, 1.15, 1.05, 1.9, '#ffffff');
  paint.add(prim('cyl', 0.32, 0.16, 5.4, 10), 0, 2.1, -3.7, Math.PI / 2 + 0.06, 0, 0, 1, 1, 1, '#ffffff');
  paint.box(0, 2.9, -6.2, 0.1, 1.4, 0.9, '#ffffff'); paint.box(0, 2.2, -6.0, 1.6, 0.08, 0.5, '#ffffff');
  glass.add(prim('sphere', 1.02, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 1.85, 0.75, -1.05, 0, 0, 1.1, 1.0, 1.55, '#fff');
  trim.box(0, 2.85, 0.1, 0.9, 0.35, 1.6, '#3a3a3a'); trim.add(prim('cyl', 0.1, 0.1, 0.5, 8), 0, 3.15, 0.1, 0, 0, 0, 1, 1, 1, '#2a2a2a');
  for (const sd of [-1, 1]) { trim.add(prim('cyl', 0.05, 0.05, 3.4, 8), sd * 1.05, 0.08, 0.3, Math.PI / 2, 0, 0, 1, 1, 1, '#2b2b2b'); for (const z of [-0.6, 1.2]) trim.add(prim('cyl', 0.04, 0.04, 0.9, 6), sd * 0.85, 0.45, z, 0, 0, sd * 0.35, 1, 1, 1, '#2b2b2b'); }
  for (const sd of [-1, 1]) { trim.box(sd * 0.4, 1.0, 0.5, 0.5, 0.12, 0.5, '#202020'); trim.box(sd * 0.4, 1.35, 0.25, 0.5, 0.6, 0.1, '#202020'); }
  lr.box(0, 2.15, -6.4, 0.1, 0.1, 0.1, '#fff');
  const { paint: pmat, lightsR } = finish(root, body, paint.build(), trim.build(), glass.build(), null, lr.build(), color, 0.4);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.42, 0.1);
  const bladeG = new GeoBuilder(); for (let i = 0; i < 4; i++) bladeG.add(prim('box', 0.28, 0.04, 5.4), Math.sin(i * Math.PI / 2) * 2.7, 0, Math.cos(i * Math.PI / 2) * 2.7, 0, i * Math.PI / 2, 0, 1, 1, 1, '#1d1d1d');
  rotor.add(new THREE.Mesh(bladeG.build(), shared().trim)); body.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.12, 2.9, -6.25); const tb = new GeoBuilder(); tb.box(0, 0, 0, 0.04, 1.3, 0.16, '#1d1d1d'); tb.box(0, 0, 0, 0.04, 0.16, 1.3, '#1d1d1d'); tail.add(new THREE.Mesh(tb.build(), shared().trim)); body.add(tail);
  const door = new THREE.Group(); door.position.set(1.12, 1.6, 1.0); const dm = new THREE.Mesh(prim('box', 0.05, 1.1, 1.1), pmat); dm.position.z = -0.55; door.add(dm); body.add(door);
  return { root, body, wheels: [], door, lightsF: null, lightsR, paint: pmat, extras: { rotor, tail }, wheelBase: 3, track: 2, seat: [0.4, 0.62, 0.55], camH: 2.5, dims: { L: 11, W: 2.4, H: 3.4 } };
}

function buildPlane(s, color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new GeoBuilder(), trim = new GeoBuilder(), glass = new GeoBuilder(), lr = new GeoBuilder(), lf = new GeoBuilder();
  paint.add(prim('capsule', 0.62, 4.2, 6, 14), 0, 1.6, 0, Math.PI / 2, 0, 0, 1, 1, 1, '#ffffff');
  paint.add(prim('cyl', 0.55, 0.12, 3.2, 12), 0, 1.75, -3.6, Math.PI / 2 - 0.08, 0, 0, 1, 1, 1, '#ffffff');
  paint.box(0, 2.55, 0.5, 11, 0.12, 1.5, '#ffffff'); paint.box(0, 1.85, -5.0, 3.6, 0.08, 0.9, '#ffffff'); paint.box(0, 2.45, -5.0, 0.08, 1.4, 1.0, '#ffffff');
  paint.box(0, 1.6, -1.2, 1.26, 0.18, 6.5, '#e63946');
  glass.box(0, 2.15, 1.25, 1.0, 0.55, 1.0, '#fff');
  for (const sd of [-1, 1]) { trim.add(prim('cyl', 0.04, 0.04, 1.6, 6), sd * 0.9, 2.0, 0.6, 0, 0, sd * 0.55, 1, 1, 1, '#ccc'); trim.add(prim('cyl', 0.05, 0.05, 1.0, 6), sd * 0.9, 0.55, 0.3, 0, 0, sd * 0.4, 1, 1, 1, '#333'); }
  trim.add(prim('cyl', 0.05, 0.05, 0.8, 6), 0, 0.6, 2.2, 0, 0, 0, 1, 1, 1, '#333');
  for (const sd of [-1, 1]) { trim.box(sd * 0.3, 1.2, 0.6, 0.45, 0.12, 0.45, '#2a2a2a'); }
  lf.box(-5.4, 2.55, 0.5, 0.15, 0.1, 0.2, '#fff'); lr.box(5.4, 2.55, 0.5, 0.15, 0.1, 0.2, '#fff');
  const { paint: pmat, lightsF, lightsR } = finish(root, body, paint.build(), trim.build(), glass.build(), lf.build(), lr.build(), color, 0.3);
  const prop = new THREE.Group(); prop.position.set(0, 1.6, 2.75); const pb = new GeoBuilder(); pb.box(0, 0, 0, 0.12, 2.0, 0.05, '#1d1d1d'); pb.add(prim('cone', 0.22, 0.4, 10), 0, 0, 0.12, Math.PI / 2, 0, 0, 1, 1, 1, '#d0d0d0'); prop.add(new THREE.Mesh(pb.build(), shared().trim)); body.add(prop);
  const wg = wheelGeo(0.28, 0.14); const wheels = [];
  for (const [x, z, front] of [[-0.9, 0.2, false], [0.9, 0.2, false], [0, 2.2, true]]) { const piv = new THREE.Group(); piv.position.set(x, 0.28, z); const m = new THREE.Mesh(wg, shared().trim); piv.add(m); root.add(piv); wheels.push({ piv, m, front, r: 0.28 }); }
  const door = new THREE.Group(); door.position.set(0.63, 1.9, 1.6); const dm = new THREE.Mesh(prim('box', 0.04, 0.8, 1.0), pmat); dm.position.z = -0.5; door.add(dm); body.add(door);
  return { root, body, wheels, door, lightsF, lightsR, paint: pmat, extras: { prop }, wheelBase: 2, track: 1.8, seat: [0.3, 0.75, 0.6], camH: 2.6, dims: { L: 8.3, W: 11, H: 2.7 } };
}
