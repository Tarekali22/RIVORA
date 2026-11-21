// Realistic car bodies (merged from "Miami Nights 2"), used in the multi-file build when the models are loaded.
//  (A Ferrari 458 replica used before was removed: the overhaul rules ask for original designs, not copies of real brands' models.)
//  - Concept: "Car Concept" by Eric Chadwick / DGG (CC BY 4.0, Khronos glTF sample assets)
//  - Muscle: classic muscle car by Karol Miklas (CC BY 4.0, via pmndrs/racing-game)
// Each template is normalised once (front = +Z, wheels on the ground, centred) and shared by every car.
export const REAL_CAR_FOR = { strada: 'concept', vortex: 'concept', meridian: 'concept', valence: 'concept', ion: 'concept', brawler: 'muscle', cab: 'muscle', police: 'muscle', ecab: 'muscle' };
export const realCarsAvailable = () => !!(typeof window !== 'undefined' && window.RIVORA_REAL && window.RIVORA_REAL.cars);

const CLS = {
  concept: (n) => (/^Paint/.test(n) ? 'paint' : /^Glass/.test(n) ? 'glass' : /Headlight|Signallight/.test(n) ? 'lightF' : /Brakelight/.test(n) ? 'lightR' : /^Rim|Mirror|Mechanical|License/.test(n) ? 'chrome' : 'dark'),
  muscle: (n) => (/^BodyPaint$/.test(n) ? 'paint' : /^Glass/.test(n) ? 'glass' : /^BrakeLight/.test(n) ? 'lightR' : /^HeadLight/.test(n) ? 'lightF' : /^Chrome|^License|^TurnSignal/.test(n) ? 'chrome' : 'dark'),
};
const FILE = { concept: 'car_concept', muscle: 'car_muscle' };
const VCOL = { dark: [0.035, 0.036, 0.04], chrome: [0.78, 0.79, 0.8] };

function f32(g) { // de-quantise + de-index (meshopt-compressed sources)
  const s = g.index ? g.toNonIndexed() : g, o = new THREE.BufferGeometry();
  for (const k of ['position', 'normal']) { const a = s.attributes[k]; if (!a) continue; const n = a.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = a.getX(i); arr[i * 3 + 1] = a.getY(i); arr[i * 3 + 2] = a.getZ(i); } o.setAttribute(k, new THREE.BufferAttribute(arr, 3)); }
  if (!o.attributes.normal) o.computeVertexNormals(); return o;
}
function colorize(g, rgb) { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }
const merge = (a) => (a && a.length ? window.RIVORA_REAL.BGU.mergeGeometries(a, false) : null);
function boxOf(arr) { const b = new THREE.Box3(); for (const g of arr) { g.computeBoundingBox(); b.union(g.boundingBox); } return b; }

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    rest: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0d1418, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.78, envMapIntensity: 1.4 }),
    tire: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55 }),
  };
  return MATS;
}

const TPL = {};
function template(kind) {
  if (TPL[kind]) return TPL[kind];
  const R = window.RIVORA_REAL, gl = R.cars[FILE[kind]]; const cls = CLS[kind];
  const parts = {}, wheels = {};
  gl.scene.updateMatrixWorld(true);
  gl.scene.traverse((o) => {
    if (!o.isMesh) return; const c = cls(o.material.name || '', o); if (!c) return;
    let wn = null; if (kind === 'ferrari') for (let p = o; p; p = p.parent) if (/^wheel_(fl|fr|rl|rr)$/.test(p.name)) { wn = p.name; break; }
    const g = f32(o.geometry); g.applyMatrix4(o.matrixWorld);
    if (wn) { const W = wheels[wn] || (wheels[wn] = []); W.push(colorize(g, VCOL[c === 'chrome' ? 'chrome' : 'dark'])); }
    else (parts[c] || (parts[c] = [])).push(g);
  });
  let wheelGeos = null; const wpos = [];
  if (kind === 'muscle') { // separate wheel model, mounted at known hub positions
    const wgl = R.cars.car_muscle_wheel; wgl.scene.updateMatrixWorld(true); const wl = [];
    wgl.scene.traverse((o) => { if (!o.isMesh) return; const col = o.material.color, dk = (col.r + col.g + col.b) / 3 < 0.12; const g = f32(o.geometry); g.applyMatrix4(o.matrixWorld); wl.push(colorize(g, VCOL[dk ? 'dark' : 'chrome'])); });
    const wg = merge(wl), wc = boxOf([wg]).getCenter(new THREE.Vector3()); wg.translate(-wc.x, -wc.y, -wc.z);
    for (const p of [[0.85, -0.03, 1.3], [-0.85, -0.03, 1.3], [0.85, -0.03, -1.15], [-0.85, -0.03, -1.15]]) wpos.push({ p: new THREE.Vector3(...p), g: wg, mir: p[0] < 0 });
  }
  // orientation: headlights to +Z
  const all = []; for (const k in parts) all.push(...parts[k]); for (const k in wheels) all.push(...wheels[k]);
  let yaw = 0; if (parts.lightF && parts.lightR) { const zf = boxOf(parts.lightF).getCenter(new THREE.Vector3()).z, zr = boxOf(parts.lightR).getCenter(new THREE.Vector3()).z; if (zf < zr) yaw = Math.PI; }
  const rot = new THREE.Matrix4().makeRotationY(yaw); for (const g of all) g.applyMatrix4(rot);
  for (const w of wpos) w.p.applyMatrix4(rot);
  const bb = boxOf(all), c = bb.getCenter(new THREE.Vector3()); let minY = bb.min.y;
  if (wpos.length) minY = Math.min(minY, Math.min(...wpos.map((w) => w.p.y)) - 0.33);
  const tr = new THREE.Matrix4().makeTranslation(-c.x, -minY, -c.z); for (const g of all) g.applyMatrix4(tr); for (const w of wpos) w.p.applyMatrix4(tr);
  for (const n in wheels) { const g = merge(wheels[n]), wc = boxOf([g]).getCenter(new THREE.Vector3()); g.translate(-wc.x, -wc.y, -wc.z); wpos.push({ p: wc, g, mir: false }); }
  const size = boxOf(all).getSize(new THREE.Vector3());
  const rest = []; for (const k of ['dark', 'chrome']) if (parts[k]) for (const g of parts[k]) rest.push(colorize(g, VCOL[k]));
  const G = { paint: merge(parts.paint), rest: merge(rest), glass: merge(parts.glass), lightF: merge(parts.lightF), lightR: merge(parts.lightR) };
  for (const k in G) if (G[k]) { G[k].computeBoundingSphere(); }
  for (const w of wpos) { w.r = Math.max(0.25, boxOf([w.g]).getSize(new THREE.Vector3()).y / 2); w.front = w.p.z > 0; }
  return (TPL[kind] = { G, wpos, size });
}

// Same interface as buildCar() in models.js
export function buildRealCar(spec, color, S) {
  const kind = REAL_CAR_FOR[spec.key]; const T = template(kind), M = mats();
  const k = spec.L / T.size.z; // scale to the vehicle's spec length
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const sc = new THREE.Group(); sc.scale.setScalar(k); body.add(sc);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15 });
  const add = (g, m, sh = true) => { if (!g) return null; const o = new THREE.Mesh(g, m); o.castShadow = sh; o.receiveShadow = true; sc.add(o); return o; };
  add(T.G.paint, paint); add(T.G.rest, M.rest); add(T.G.glass, M.glass, false);
  const lightsF = add(T.G.lightF, S.headOff, false), lightsR = add(T.G.lightR, S.rearOff, false);
  const wheels = [];
  for (const w of T.wpos) {
    const piv = new THREE.Group(); piv.position.copy(w.p).multiplyScalar(k); root.add(piv);
    const holder = new THREE.Group(); holder.scale.set(w.mir ? -k : k, k, k); piv.add(holder);
    const m = new THREE.Mesh(w.g, M.tire); m.castShadow = true; holder.add(m);
    // spinning is applied to `m.rotation.x` by vehicle.js; mirrored wheels use a negative-x holder so they spin the same way
    wheels.push({ piv, m, front: w.front, r: w.r * k });
  }
  const L = spec.L, W = T.size.x * k, H = T.size.y * k, extras = {};
  if (spec.police) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), M.rest); base.position.set(0, H + 0.02, -0.25 * L / 4.7); body.add(base);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.26), S.dim), b = r.clone(); r.material = S.dim; b.material = S.dim;
    r.position.set(0.27, H + 0.1, base.position.z); b.position.set(-0.27, H + 0.1, base.position.z); body.add(r, b); extras.lightbar = [r, b];
  }
  if (spec.taxi) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.17, 0.24), new THREE.MeshBasicMaterial({ color: 0xfff2a8, toneMapped: false })); s.position.set(0, H + 0.08, -0.2 * L / 4.7); body.add(s); }
  const wz = wheels.map((w) => w.piv.position.z), wb = wheels.length ? Math.max(...wz) - Math.min(...wz) : L * 0.6;
  const seatZ = kind === 'ferrari' ? 0.05 * L : kind === 'muscle' ? -0.1 * L : -0.04 * L;
  return { root, body, wheels, door: null, lightsF, lightsR, paint, extras, wheelBase: wb || L * 0.6, track: W * 0.84, seat: [0.36 * W / 1.85, kind === 'ferrari' ? -0.02 : 0.06, seatZ], camH: Math.max(1.5, H * 0.95), dims: { L, W, H }, real: kind };
}
