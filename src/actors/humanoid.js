// Procedural human: one SkinnedMesh (rigid skinning, vertex colours) + blended procedural animation.
import { GeoBuilder, prim } from '../core/geo.js';
import { clamp, lerp, mixHex, shadeHex, R, smoothstep, TAU } from '../core/util.js';
import { RealSkin, realAvailable, pickModel } from './realskin.js';

export const SKIN_TONES = ['#f4d3bd', '#eac0a2', '#d9a382', '#c8927e', '#b9805f', '#a46d4f', '#8a5a3e', '#6e4530', '#563424', '#3f261b'];
export const HAIR_COLORS = ['#1b1512', '#2a1f1a', '#3b2a20', '#5a3d28', '#7a5233', '#a27245', '#c9a46b', '#8f8a84', '#d8d2c8', '#6b2e1e'];
export const EYE_COLORS = ['#3b2414', '#5a3a1e', '#2f4f6f', '#4a6b3a', '#6b6b6b'];
export const HAIR_STYLES = ['buzz', 'short', 'medium', 'curly', 'long', 'bun', 'bald'];
export const FACIAL = ['none', 'stubble', 'short', 'full', 'mustache'];
export const TOPS = ['crew', 'tee', 'polo', 'blazer', 'hoodie', 'tank', 'jacket'];
export const BOTTOMS = ['jeans', 'pants', 'chinos', 'shorts', 'skirt', 'joggers'];

// The default hero: configured from the reference portraits supplied by the player-owner
// (skin tone, buzz cut, dark brows, slim athletic build, black crew with white shoulder stripes).
export const HERO_DEFAULT = {
  real: 'carlos', sex: 'm', height: 1.76, build: 0.42, skin: '#c48c74', faceW: 0.96, jaw: 0.55, hair: { style: 'buzz', color: '#231a16' },
  facial: 'stubble', brow: 1.25, eyes: '#3b2414', earsBig: 1.15,
  top: { type: 'crew', color: '#151517', stripes: '#e8eef6' }, bottom: { type: 'jeans', color: '#2c3a52' }, shoes: { color: '#f2f2f2', sole: '#d9d9d9' },
  acc: { watch: true, earbuds: true, cap: false, glasses: false, chain: false },
};
export const OUTFITS = {
  striped: { name: 'Striped Crew', top: { type: 'crew', color: '#151517', stripes: '#e8eef6' }, bottom: { type: 'jeans', color: '#2c3a52' }, shoes: { color: '#f2f2f2' }, price: 0 },
  rustpolo: { name: 'Rust Knit Polo', top: { type: 'polo', color: '#8e3b26' }, bottom: { type: 'pants', color: '#16181c' }, shoes: { color: '#efefef' }, price: 180 },
  blazer: { name: 'Check Blazer', top: { type: 'blazer', color: '#8a7f72', shirt: '#f4f4f2' }, bottom: { type: 'chinos', color: '#c9b79a' }, shoes: { color: '#3a2a20' }, price: 420, watch: true },
  beach: { name: 'Beach Day', top: { type: 'tank', color: '#2a9d8f' }, bottom: { type: 'shorts', color: '#e9c46a' }, shoes: { color: '#e76f51' }, price: 90 },
  hoodie: { name: 'Night Hoodie', top: { type: 'hoodie', color: '#2b2d42' }, bottom: { type: 'joggers', color: '#1d1e26' }, shoes: { color: '#111111' }, price: 140 },
  gym: { name: 'Gym Kit', top: { type: 'tee', color: '#e63946' }, bottom: { type: 'shorts', color: '#1d3557' }, shoes: { color: '#f1faee' }, price: 110 },
  street: { name: 'Track Jacket', top: { type: 'jacket', color: '#264653', stripes: '#f4a261' }, bottom: { type: 'pants', color: '#22223b' }, shoes: { color: '#f8f9fa' }, price: 210 },
};

const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'lidL', 'lidR',
  'clavL', 'armL', 'foreL', 'handL', 'fingL', 'clavR', 'armR', 'foreR', 'handR', 'fingR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));

function boneLayout(a) {
  const f = a.sex === 'f';
  const sw = f ? 0.86 : 1 + (a.build - 0.5) * 0.12, hw = f ? 1.12 : 1;
  return {
    root: [null, 0, 0, 0], hips: ['root', 0, 0.98, 0], spine: ['hips', 0, 0.08, 0], chest: ['spine', 0, 0.18, 0], neck: ['chest', 0, 0.23, 0], head: ['neck', 0, 0.09, 0],
    jaw: ['head', 0, 0.045, 0.02], lidL: ['head', 0.035, 0.118, 0.103], lidR: ['head', -0.035, 0.118, 0.103],
    clavL: ['chest', 0.045, 0.19, 0], armL: ['clavL', 0.145 * sw, 0, 0], foreL: ['armL', 0, -0.29, 0], handL: ['foreL', 0, -0.255, 0], fingL: ['handL', 0, -0.085, 0],
    clavR: ['chest', -0.045, 0.19, 0], armR: ['clavR', -0.145 * sw, 0, 0], foreR: ['armR', 0, -0.29, 0], handR: ['foreR', 0, -0.255, 0], fingR: ['handR', 0, -0.085, 0],
    thighL: ['hips', 0.092 * hw, -0.05, 0], shinL: ['thighL', 0, -0.43, 0], footL: ['shinL', 0, -0.415, 0],
    thighR: ['hips', -0.092 * hw, -0.05, 0], shinR: ['thighR', 0, -0.43, 0], footR: ['shinR', 0, -0.415, 0],
    _sw: sw, _hw: hw,
  };
}

function headGeo(a) {
  const g = new THREE.SphereGeometry(0.105, 22, 16); const P = g.attributes.position;
  const fw = a.faceW || 1, jaw = a.jaw ?? 0.5, f = a.sex === 'f';
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const ny = y / 0.105;
    let sx = 0.88 * fw, sz = 1.0;
    if (ny < 0) { const t = -ny; sx *= 1 - t * (0.32 - jaw * 0.12) * (f ? 1.15 : 1); z += t * 0.012; if (z < 0) z *= 1 - t * 0.35; }
    if (ny > 0.3 && z < 0) z *= 1.06;
    if (z > 0.06 && Math.abs(ny) < 0.35) z += 0.006; // brow/cheek fullness
    P.setXYZ(i, x * sx, y * 1.12, z * sz);
  }
  g.computeVertexNormals(); return g;
}
const capsule = (r, l) => prim('capsule', r, l, 4, 10);

export function buildHumanGeometry(a) {
  const Lb = boneLayout(a), W = {};
  for (const b of BONES) { const [p, x, y, z] = Lb[b]; const pw = p ? W[p] : [0, 0, 0]; W[b] = [pw[0] + x, pw[1] + y, pw[2] + z]; }
  const g = new GeoBuilder({ skin: true });
  const at = (bone, geo, ox, oy, oz, rx, ry, rz, sx, sy, sz, col) => { const w = W[bone]; g.add(geo, w[0] + ox, w[1] + oy, w[2] + oz, rx, ry, rz, sx, sy, sz, col, BI[bone]); };
  const f = a.sex === 'f', skin = a.skin, sw = Lb._sw, hw = Lb._hw, bld = a.build ?? 0.5;
  const top = a.top || { type: 'tee', color: '#888' }, bot = a.bottom || { type: 'pants', color: '#333' };
  const tc = top.color, bc = bot.color, shoe = (a.shoes && a.shoes.color) || '#222', sole = (a.shoes && a.shoes.sole) || '#e0e0e0';
  const hairC = (a.hair && a.hair.color) || '#222', hs = (a.hair && a.hair.style) || 'short';
  const muscle = 1 + (bld - 0.5) * 0.35;
  const sleeveLong = ['crew', 'blazer', 'hoodie', 'jacket'].includes(top.type);
  const sleeveNone = top.type === 'tank';
  const shortsLeg = bot.type === 'shorts', skirt = bot.type === 'skirt';
  const darkTop = shadeHex(tc, 0.8);
  // --- torso
  at('hips', prim('sphere', 0.1, 14, 10), 0, 0.01, 0, 0, 0, 0, 1.7 * hw, 1.05, 1.15, bc);
  at('hips', prim('cyl', 0.152 * hw, 0.155 * hw, 0.05, 16), 0, 0.075, 0, 0, 0, 0, 1, 1, 0.78, shadeHex(bc, 0.6));
  at('spine', capsule(0.13, 0.1), 0, 0.09, 0, 0, 0, 0, 1.12 * (f ? 0.95 : 1), 1, 0.8, top.type === 'blazer' ? top.shirt || '#f2f2f2' : tc);
  at('chest', capsule(0.155, 0.1), 0, 0.09, -0.005, 0, 0, Math.PI / 2, 0.85, 1.32 * sw * muscle * 0.92, 0.78, tc);
  at('chest', prim('sphere', 0.07, 14, 8), 0, 0.2, -0.012, 0, 0, 0, 2.55 * sw * (f ? 0.85 : 1), 0.62, 1.05, top.type === 'tank' ? skin : tc); // trapezius slope
  if (f) { at('chest', prim('sphere', 0.062, 10, 8), 0.068, 0.065, 0.085, 0, 0, 0, 1, 0.9, 0.85, tc); at('chest', prim('sphere', 0.062, 10, 8), -0.068, 0.065, 0.085, 0, 0, 0, 1, 0.9, 0.85, tc); }
  if (top.type === 'blazer') {
    at('chest', prim('box', 0.11, 0.24, 0.02), 0, 0.07, 0.112, 0, 0, 0, 1, 1, 1, top.shirt || '#f4f4f2');
    for (const s of [-1, 1]) at('chest', prim('box', 0.05, 0.22, 0.015), s * 0.06, 0.07, 0.118, 0, 0, s * 0.35, 1, 1, 1, shadeHex(tc, 0.75));
    at('spine', prim('box', 0.02, 0.12, 0.01), 0.0, 0.08, 0.108, 0, 0, 0, 1, 1, 1, top.shirt || '#f4f4f2');
  }
  if (top.type === 'polo') { for (const s of [-1, 1]) at('chest', prim('box', 0.06, 0.02, 0.05), s * 0.04, 0.215, 0.07, 0.6, 0, s * 0.4, 1, 1, 1, shadeHex(tc, 0.9)); at('chest', prim('box', 0.018, 0.07, 0.01), 0, 0.16, 0.115, 0, 0, 0, 1, 1, 1, shadeHex(tc, 0.8)); }
  if (top.type === 'hoodie') { at('chest', prim('torus', 0.085, 0.035, 6, 12), 0, 0.22, -0.05, 1.2, 0, 0, 1, 1, 1, darkTop); at('spine', prim('box', 0.16, 0.07, 0.03), 0, 0.03, 0.095, 0, 0, 0, 1, 1, 1, darkTop); }
  if (top.type === 'jacket') at('chest', prim('box', 0.012, 0.26, 0.01), 0, 0.06, 0.118, 0, 0, 0, 1, 1, 1, '#c8c8c8');
  if (top.type === 'police') { at('chest', prim('box', 0.035, 0.04, 0.01), 0.07, 0.11, 0.115, 0, 0, 0, 1, 1, 1, '#e8c547'); at('hips', prim('cyl', 0.158, 0.16, 0.06, 16), 0, 0.07, 0, 0, 0, 0, 1, 1, 0.8, '#151515'); }
  at('chest', prim('torus', 0.062, 0.016, 6, 16), 0, 0.225, 0.0, Math.PI / 2 - 0.25, 0, 0, 1, 1, 0.85, top.type === 'blazer' ? top.shirt || '#f2f2f2' : darkTop);
  if (top.stripes) { // white shoulder stripes running over the shoulders and down the sleeves
    for (const s of [-1, 1]) for (const k of [-1, 1]) at('chest', prim('box', 0.13, 0.008, 0.009), s * 0.13 * sw, 0.205, k * 0.016, 0, 0, s * -0.12, 1, 1, 1, top.stripes);
  }
  if (a.acc && a.acc.chain) at('chest', prim('torus', 0.07, 0.006, 4, 20), 0, 0.17, 0.06, 1.2, 0, 0, 1, 1, 1, '#d4af37');
  // --- neck + head
  at('neck', prim('cyl', 0.05, 0.056, 0.13, 12), 0, 0.03, 0.005, 0, 0, 0, 1, 1, 1, skin);
  at('head', headGeo(a), 0, 0.1, 0.012, 0, 0, 0, 1, 1, 1, skin);
  const darker = shadeHex(skin, 0.86), lip = mixHex(skin, '#9b4b45', 0.35);
  at('head', prim('cone', 0.016, 0.05, 8), 0, 0.094, 0.114, Math.PI / 2 - 0.25, 0, 0, 1, 1, 1.15, darker);
  at('head', prim('sphere', 0.012, 8, 6), 0, 0.079, 0.124, 0, 0, 0, 1.35, 0.8, 1, darker);
  const ear = (a.earsBig || 1);
  for (const s of [-1, 1]) at('head', prim('sphere', 0.024, 10, 8), s * 0.094, 0.1, -0.002, 0, s * 0.3, 0, 0.45 * ear, 1.05 * ear, 0.78 * ear, darker);
  for (const s of [-1, 1]) {
    at('head', prim('sphere', 0.0145, 10, 8), s * 0.035, 0.118, 0.1025, 0, 0, 0, 1, 0.92, 1, '#f3efe8');
    at('head', prim('sphere', 0.0085, 10, 8), s * 0.035, 0.118, 0.1145, 0, 0, 0, 1, 1, 0.55, a.eyes || '#3b2414');
    at('head', prim('sphere', 0.0035, 6, 4), s * 0.035, 0.118, 0.1192, 0, 0, 0, 1, 1, 0.5, '#0a0a0a');
    at(s > 0 ? 'lidL' : 'lidR', new THREE.SphereGeometry(0.0168, 12, 6, 0, TAU, 0, Math.PI / 2), 0, 0, 0, 0, 0, 0, 1, 1, 1, skin);
    const bw = (a.brow || 1);
    at('head', prim('box', 0.042, 0.008 * bw, 0.012), s * 0.037, 0.141, 0.111, 0.12, -s * 0.08, -s * 0.12, 1, 1, 1, f ? shadeHex(hairC, 1.1) : hairC);
  }
  at('head', prim('box', 0.042, 0.009, 0.012), 0, 0.056, 0.113, 0, 0, 0, 1, 1, 1, lip);
  at('jaw', prim('box', 0.038, 0.01, 0.012), 0, 0.0, 0.091, 0, 0, 0, 1, 1, 1, lip);
  // hair
  const hairCap = (r, tl, tilt, col = hairC) => at('head', new THREE.SphereGeometry(r, 20, 10, 0, TAU, 0, tl), 0, 0.105, 0.0, tilt, 0, 0, 0.9 * (a.faceW || 1), 1.12, 1.03, col);
  if (hs === 'buzz') hairCap(0.1085, Math.PI * 0.43, -0.42, mixHex(hairC, skin, 0.22));
  if (hs === 'short') { hairCap(0.113, Math.PI * 0.47, -0.35); at('head', prim('box', 0.12, 0.02, 0.03), 0, 0.2, 0.06, -0.3, 0, 0, 1, 1, 1, hairC); }
  if (hs === 'medium') { hairCap(0.12, Math.PI * 0.55, -0.25); at('head', prim('sphere', 0.1, 12, 8), 0, 0.12, -0.04, 0, 0, 0, 0.98, 1, 0.8, hairC); }
  if (hs === 'curly') { hairCap(0.112, Math.PI * 0.5, -0.3); for (let k = 0; k < 22; k++) { const u = R() * TAU, v = R() * 1.1; at('head', prim('ico', 0.028, 0), Math.sin(u) * Math.sin(v) * 0.1, 0.12 + Math.cos(v) * 0.1, Math.cos(u) * Math.sin(v) * 0.1 - 0.01, 0, 0, 0, 1, 1, 1, hairC); } }
  if (hs === 'long') { hairCap(0.118, Math.PI * 0.56, -0.2); at('head', prim('box', 0.2, 0.3, 0.05), 0, -0.02, -0.075, 0.12, 0, 0, 1, 1, 1, hairC); for (const s of [-1, 1]) at('head', prim('box', 0.03, 0.22, 0.06), s * 0.095, 0.02, 0.0, 0, 0, 0, 1, 1, 1, hairC); }
  if (hs === 'bun') { hairCap(0.114, Math.PI * 0.52, -0.25); at('head', prim('sphere', 0.045, 10, 8), 0, 0.2, -0.08, 0, 0, 0, 1, 1, 1, hairC); }
  // facial hair
  const fh = a.facial || 'none';
  if (fh === 'stubble' || fh === 'short' || fh === 'full') {
    const col = fh === 'stubble' ? mixHex(skin, hairC, 0.32) : hairC; const rr = fh === 'full' ? 0.112 : fh === 'short' ? 0.1075 : 0.1062;
    at('head', new THREE.SphereGeometry(rr, 18, 8, Math.PI * 0.04, Math.PI * 0.92, Math.PI * (fh === 'full' ? 0.6 : 0.63), Math.PI * (fh === 'full' ? 0.32 : 0.28)), 0, 0.1, 0.012, 0, 0, 0, 0.88 * (a.faceW || 1), 1.12, 1.0, col);
  }
  if (fh === 'mustache' || fh === 'short' || fh === 'full') at('head', prim('box', 0.05, 0.012, 0.012), 0, 0.066, 0.117, 0, 0, 0, 1, 1, 1, hairC);
  if (a.acc && a.acc.earbuds) for (const s of [-1, 1]) at('head', prim('capsule', 0.006, 0.012, 2, 6), s * 0.098, 0.093, 0.012, 0, 0, 0, 1, 1, 1, '#f5f5f5');
  if (a.acc && a.acc.cap) { at('head', new THREE.SphereGeometry(0.117, 18, 8, 0, TAU, 0, Math.PI * 0.46), 0, 0.11, 0, -0.15, 0, 0, 0.92, 1.05, 1.04, a.acc.capColor || '#1d3557'); at('head', prim('box', 0.15, 0.012, 0.09), 0, 0.17, 0.1, -0.15, 0, 0, 1, 1, 1, a.acc.capColor || '#1d3557'); }
  if (a.acc && a.acc.glasses) { for (const s of [-1, 1]) at('head', prim('box', 0.038, 0.024, 0.006), s * 0.036, 0.118, 0.125, 0, 0, 0, 1, 1, 1, '#121212'); at('head', prim('box', 0.12, 0.006, 0.006), 0, 0.128, 0.125, 0, 0, 0, 1, 1, 1, '#121212'); }
  // --- arms
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const am = muscle * (f ? 0.85 : 1);
    at('arm' + side, prim('sphere', 0.057 * am, 12, 8), 0, -0.012, 0, 0, 0, 0, 1, 1, 1, sleeveNone ? skin : tc);
    if (sleeveLong) at('arm' + side, capsule(0.052 * am, 0.2), 0, -0.145, 0, 0, 0, 0, 1, 1, 1, tc);
    else if (sleeveNone) at('arm' + side, capsule(0.047 * am, 0.2), 0, -0.145, 0, 0, 0, 0, 1, 1, 1, skin);
    else { at('arm' + side, capsule(0.056 * am, 0.08), 0, -0.07, 0, 0, 0, 0, 1, 1, 1, tc); at('arm' + side, capsule(0.046 * am, 0.15), 0, -0.175, 0, 0, 0, 0, 1, 1, 1, skin); }
    at('fore' + side, capsule(0.041 * am, 0.19), 0, -0.125, 0, 0, 0, 0, 1, 1, 1, sleeveLong ? tc : skin);
    if (sleeveLong && top.type === 'blazer') at('fore' + side, prim('cyl', 0.045, 0.045, 0.03, 10), 0, -0.235, 0, 0, 0, 0, 1, 1, 1, top.shirt || '#f2f2f2');
    if (top.stripes && sleeveLong) for (const k of [-1, 1]) {
      at('arm' + side, prim('box', 0.009, 0.3, 0.009), s * 0.05 * am, -0.14, k * 0.016, 0, 0, 0, 1, 1, 1, top.stripes);
      at('fore' + side, prim('box', 0.009, 0.24, 0.009), s * 0.04 * am, -0.12, k * 0.015, 0, 0, 0, 1, 1, 1, top.stripes);
    }
    at('hand' + side, prim('box', 0.032, 0.085, 0.075), 0, -0.045, 0, 0, 0, 0, 1, 1, 1, skin);
    at('hand' + side, capsule(0.012, 0.035), s * -0.004, -0.04, 0.042, -0.6, 0, 0, 1, 1, 1, skin);
    for (let k = 0; k < 4; k++) at('fing' + side, capsule(0.0095, 0.05), 0, -0.03, -0.027 + k * 0.018, 0, 0, 0, 1, 1, 1, skin);
    if (side === 'L' && a.acc && a.acc.watch) { at('foreL', prim('cyl', 0.047, 0.047, 0.026, 12), 0, -0.225, 0, 0, 0, 0, 1, 1, 1, '#1c1c1c'); at('foreL', prim('cyl', 0.02, 0.02, 0.01, 10), 0.047, -0.225, 0, 0, 0, Math.PI / 2, 1, 1, 1, '#c9a77c'); }
  }
  // --- legs
  for (const side of ['L', 'R']) {
    const lm = (f ? 1.05 : 1) * (1 + (bld - 0.5) * 0.25);
    if (skirt) { /* skirt covers thighs */ at('thigh' + side, capsule(0.064 * lm, 0.3), 0, -0.21, 0, 0, 0, 0, 1, 1, 1, skin); }
    else if (shortsLeg) { at('thigh' + side, capsule(0.078 * lm, 0.16), 0, -0.12, 0, 0, 0, 0, 1, 1, 1, bc); at('thigh' + side, capsule(0.064 * lm, 0.18), 0, -0.27, 0, 0, 0, 0, 1, 1, 1, skin); }
    else at('thigh' + side, capsule(0.074 * lm, 0.3), 0, -0.21, 0, 0, 0, 0, 1, 1, 1, bc);
    const shinCol = shortsLeg || skirt ? skin : bc;
    at('shin' + side, capsule(0.054 * lm, 0.32), 0, -0.2, -0.008, 0, 0, 0, 1, 1, 1, shinCol);
    if (bot.type === 'joggers') at('shin' + side, prim('cyl', 0.05, 0.05, 0.04, 10), 0, -0.38, 0, 0, 0, 0, 1, 1, 1, shadeHex(bc, 0.8));
    at('foot' + side, capsule(0.045, 0.17), 0, -0.035, 0.055, Math.PI / 2, 0, 0, 1.05, 1, 0.82, shoe);
    at('foot' + side, prim('box', 0.092, 0.022, 0.27), 0, -0.075, 0.055, 0, 0, 0, 1, 1, 1, sole);
  }
  if (skirt) at('hips', prim('cyl', 0.16 * hw, 0.25 * hw, 0.46, 16, 1, true), 0, -0.2, 0, 0, 0, 0, 1, 1, 0.85, bc);
  return { geo: g.build(), layout: Lb };
}

let SHARED_MAT = null;
export function humanMaterial() { if (!SHARED_MAT) SHARED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 }); return SHARED_MAT; }

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export class Humanoid {
  constructor(appearance, opts = {}) {
    this.a = appearance;
    this.object = new THREE.Group();   // world placement (position + heading)
    this.body = new THREE.Group();     // pose-level offsets (lying, swimming)
    this.object.add(this.body);
    this.build(appearance, opts);
    this.t = R() * 100; this.phase = R() * TAU; this.blinkT = 2 + R() * 3; this.blink = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.lookT = 0; this.lookTarget = 0;
    this.targets = {}; for (const b of BONES) this.targets[b] = [0, 0, 0];
    this.hipsY = 0.98; this.hipsX = 0; this.hipsZ = 0; this.bodyPitch = 0; this.bodyRoll = 0; this.bodyY = 0;
    this.props = {};
  }
  build(a, opts) {
    opts = opts || this._opts || {}; this._opts = opts;
    if (this.mesh) { this.body.remove(this.mesh); this.mesh.geometry.dispose(); }
    const { geo, layout } = buildHumanGeometry(a);
    const bones = {}, list = [];
    for (const b of BONES) { const [p, x, y, z] = layout[b]; const bone = new THREE.Bone(); bone.name = b; bone.position.set(x, y, z); bones[b] = bone; list.push(bone); if (p) bones[p].add(bone); }
    const mesh = new THREE.SkinnedMesh(geo, humanMaterial());
    mesh.add(bones.root); mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(list));
    mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
    mesh.frustumCulled = true;
    this.mesh = mesh; this.bones = bones;
    const s = (a.height || 1.78) / 1.78; this.body.scale.setScalar(s); this.scale = s;
    this.body.add(mesh);
    // realistic skin (multi-file build): a motion-captured Rocketbox avatar driven by this rig
    if (realAvailable() && opts.real !== false) {
      const key = pickModel(a);
      if (key && (!this.real || this.real.name !== key)) { if (this.real) this.real.dispose(); this.real = new RealSkin(key, opts); this.body.add(this.real.root); }
      if (this.real) {
        mesh.visible = false;
        const top = a.top || {}, kind = top.type === 'police' ? 'police' : null;
        this.real.setTint(kind || (opts.tint === 'exact' ? (top.color || 'orig') : a.tint || 'orig'));
        this.real.setSkin(a.skinTone);
      }
    } else if (this.real) { this.real.dispose(); this.real = null; }
    // re-attach held props
    if (this.props) for (const [k, p] of Object.entries(this.props)) if (p && p.parentBone) this._boneFor(p.parentBone).add(p.obj);
  }
  _boneFor(name) { return this.real ? this.real.socket(name) : this.bones[name]; }
  setAppearance(a) { this.a = a; this.build(a); }
  // Attach a prop to a bone (e.g. phone in right hand)
  hold(name, obj, bone = 'handR', pos = [0, -0.09, 0.03], rot = [0, 0, 0]) {
    this.drop(name); obj.position.set(...pos); obj.rotation.set(...rot); this._boneFor(bone).add(obj); this.props[name] = { obj, parentBone: bone };
  }
  drop(name) { const p = this.props[name]; if (p) { p.obj.parent && p.obj.parent.remove(p.obj); delete this.props[name]; } }
  isHolding(name) { return !!this.props[name]; }

  // ---------- pose library ----------
  // s: { mode, speed, crouch, action:{name,p}, sitH, steer, talk, look, item, stroke, t }
  update(dt, s) {
    this.t += dt;
    const T = this.targets; for (const b of BONES) { const v = T[b]; v[0] = 0; v[1] = 0; v[2] = 0; }
    let hipsY = 0.98, hipsX = 0, hipsZ = 0, pitch = 0, roll = 0, bodyY = 0, rate = 12;
    const t = this.t, mode = s.mode || 'loco', sp = s.speed || 0;
    const set = (b, x, y, z) => { const v = T[b]; v[0] = x; v[1] = y; v[2] = z; };
    const add = (b, x, y, z) => { const v = T[b]; v[0] += x; v[1] += y; v[2] += z; };
    // idle arms resting
    const idleArms = (w = 1) => { add('armL', 0.02 * w, 0, 0.08 * w); add('armR', 0.02 * w, 0, -0.08 * w); add('foreL', -0.14 * w, 0, 0); add('foreR', -0.14 * w, 0, 0); add('fingL', 0, 0, -0.35 * w); add('fingR', 0, 0, 0.35 * w); };
    const breath = Math.sin(t * 1.7) * (0.012 + clamp(s.exert || 0, 0, 1) * 0.03);
    if (mode === 'loco') {
      const stride = 1.25 + 0.27 * sp;
      this.phase += (sp / stride) * TAU * dt;
      const ph = this.phase, w = clamp(sp / 1.1, 0, 1);
      const A = (0.22 + sp * 0.075) * w, K = (0.28 + sp * 0.19) * w, Aa = (0.2 + sp * 0.085) * w;
      const crouch = s.crouch ? 1 : 0;
      for (const [side, off] of [['L', 0], ['R', Math.PI]]) {
        const p = ph + off; const th = -A * Math.sin(p); const kn = 0.06 * w + K * Math.pow(Math.max(0, Math.cos(p)), 1.6) + 0.12 * w * Math.max(0, -Math.sin(p));
        add('thigh' + side, th, 0, 0); add('shin' + side, kn, 0, 0); add('foot' + side, -(th + kn) * 0.55 + (Math.sin(p) < 0 ? -0.25 * w * Math.max(0, -Math.cos(p)) : 0), 0, 0);
      }
      add('armL', Aa * Math.sin(ph), 0, 0.07 + sp * 0.01); add('armR', -Aa * Math.sin(ph), 0, -0.07 - sp * 0.01);
      const fb = -(0.14 + sp * 0.16);
      add('foreL', fb - 0.15 * w * Math.max(0, -Math.sin(ph)), 0, 0); add('foreR', fb - 0.15 * w * Math.max(0, Math.sin(ph)), 0, 0);
      add('fingL', 0, 0, -0.4 - sp * 0.08); add('fingR', 0, 0, 0.4 + sp * 0.08);
      add('chest', 0.03 + sp * 0.03 + breath, -Math.sin(ph) * 0.08 * w, 0); add('spine', 0.02 + sp * 0.015, 0, 0);
      add('hips', 0, Math.sin(ph) * 0.07 * w, Math.cos(ph) * 0.035 * w);
      add('neck', -sp * 0.025, 0, 0);
      hipsY = 0.98 - (0.012 + sp * 0.012) * (1 - Math.abs(Math.cos(ph))) * w - (sp > 4 ? 0.03 : 0);
      if (w < 0.99) { // idle blend
        const iw = 1 - w; idleArms(iw);
        add('chest', breath * iw, 0, 0); hipsX = Math.sin(t * 0.37) * 0.012 * iw;
        add('hips', 0, 0, Math.sin(t * 0.37) * 0.02 * iw);
        add('thighL', 0, 0.06 * iw, 0.03 * iw); add('thighR', 0, -0.06 * iw, -0.03 * iw); add('footL', 0, -0.06 * iw, 0); add('footR', 0, 0.06 * iw, 0);
      }
      if (crouch) { hipsY -= 0.32; add('thighL', -0.95, 0, 0.05); add('thighR', -0.95, 0, -0.05); add('shinL', 1.55, 0, 0); add('shinR', 1.55, 0, 0); add('footL', -0.55, 0, 0); add('footR', -0.55, 0, 0); add('chest', 0.3, 0, 0); add('spine', 0.15, 0, 0); add('armL', -0.4, 0, 0); add('armR', -0.4, 0, 0); add('foreL', -0.5, 0, 0); add('foreR', -0.5, 0, 0); add('neck', -0.3, 0, 0); }
      if (s.guard) this._guard(add, t);
    } else if (mode === 'jump' || mode === 'fall') {
      const up = mode === 'jump';
      add('thighL', up ? -0.7 : -0.3, 0, 0.1); add('thighR', up ? -0.15 : -0.1, 0, -0.1); add('shinL', up ? 1.0 : 0.5, 0, 0); add('shinR', up ? 0.5 : 0.4, 0, 0);
      add('armL', up ? -0.6 : -0.2, 0, up ? 0.4 : 0.9); add('armR', up ? 0.3 : -0.2, 0, up ? -0.3 : -0.9); add('foreL', -0.5, 0, 0); add('foreR', -0.5, 0, 0); add('chest', up ? 0.15 : -0.1, 0, 0);
      rate = 10;
    } else if (mode === 'land') {
      hipsY = 0.82; add('thighL', -0.6, 0, 0.05); add('thighR', -0.6, 0, -0.05); add('shinL', 1.1, 0, 0); add('shinR', 1.1, 0, 0); add('footL', -0.5, 0, 0); add('footR', -0.5, 0, 0); add('chest', 0.3, 0, 0); idleArms(); add('armL', -0.3, 0, 0.2); add('armR', -0.3, 0, -0.2); rate = 20;
    } else if (mode === 'sit' || mode === 'drive' || mode === 'ride' || mode === 'pedal' || mode === 'pilot') {
      hipsY = s.sitH ?? 0.5;
      const ride = mode === 'ride' || mode === 'pedal';
      add('thighL', ride ? -1.25 : -1.5, 0, ride ? 0.22 : 0.06); add('thighR', ride ? -1.25 : -1.5, 0, ride ? -0.22 : -0.06);
      add('shinL', ride ? 1.7 : 1.45, 0, 0); add('shinR', ride ? 1.7 : 1.45, 0, 0); add('footL', 0.05, 0, 0); add('footR', 0.05, 0, 0);
      if (mode === 'pedal') { const pc = this.phase += (s.cadence || 0) * dt; add('thighL', Math.sin(pc) * 0.35, 0, 0); add('thighR', -Math.sin(pc) * 0.35, 0, 0); add('shinL', -Math.cos(pc) * 0.35, 0, 0); add('shinR', Math.cos(pc) * 0.35, 0, 0); }
      add('chest', breath, 0, 0);
      if (mode === 'drive' || mode === 'pilot') {
        const st = clamp(s.steer || 0, -1, 1);
        add('armL', -0.95, 0, 0.12); add('armR', -0.95, 0, -0.12); add('foreL', -0.55, 0, -0.15 - st * 0.25); add('foreR', -0.55, 0, 0.15 - st * 0.25);
        add('chest', 0.0, st * 0.06, 0); add('neck', 0, st * 0.18, 0); add('fingL', 0, 0, -1.2); add('fingR', 0, 0, 1.2);
      } else if (ride) {
        add('chest', 0.55, 0, 0); add('spine', 0.2, 0, 0); add('neck', -0.6, 0, 0);
        add('armL', -1.1, 0, 0.18); add('armR', -1.1, 0, -0.18); add('foreL', -0.45, 0, 0); add('foreR', -0.45, 0, 0); add('fingL', 0, 0, -1.2); add('fingR', 0, 0, 1.2);
        add('chest', 0, 0, -(s.lean || 0) * 0.3);
      } else { idleArms(); add('armL', -0.35, 0, 0.05); add('armR', -0.35, 0, -0.05); add('foreL', -0.6, 0, 0); add('foreR', -0.6, 0, 0); }
    } else if (mode === 'swim') {
      const moving = sp > 0.4;
      if (moving) {
        pitch = 1.35; bodyY = -0.35; this.phase += dt * (2.2 + sp * 0.6);
        const ph = this.phase;
        set('armL', -(ph % TAU), 0, 0.15); set('armR', -((ph + Math.PI) % TAU), 0, -0.15);
        add('foreL', -0.3, 0, 0); add('foreR', -0.3, 0, 0);
        add('thighL', Math.sin(ph * 3) * 0.25, 0, 0.05); add('thighR', -Math.sin(ph * 3) * 0.25, 0, -0.05); add('shinL', 0.25, 0, 0); add('shinR', 0.25, 0, 0); add('footL', 0.6, 0, 0); add('footR', 0.6, 0, 0);
        add('neck', -0.9, Math.sin(ph) * 0.4, 0); rate = 30;
        this._directArms = true;
      } else {
        bodyY = -1.15; const ph = t * 2;
        add('armL', -0.2, 0, 1.2 + Math.sin(ph) * 0.3); add('armR', -0.2, 0, -1.2 - Math.sin(ph) * 0.3); add('foreL', -0.4, 0, 0); add('foreR', -0.4, 0, 0);
        add('thighL', -0.4 + Math.sin(ph) * 0.4, 0, 0.1); add('thighR', -0.4 - Math.sin(ph) * 0.4, 0, -0.1); add('shinL', 0.8, 0, 0); add('shinR', 0.8, 0, 0);
      }
    } else if (mode === 'freefall') {
      pitch = 1.25; bodyY = 0;
      add('armL', -0.35, 0, 1.25); add('armR', -0.35, 0, -1.25); add('foreL', -0.75, 0, 0); add('foreR', -0.75, 0, 0);
      add('thighL', 0.25, 0, 0.32); add('thighR', 0.25, 0, -0.32); add('shinL', 0.9, 0, 0); add('shinR', 0.9, 0, 0); add('neck', -0.7, 0, 0);
      add('armL', Math.sin(t * 9) * 0.04, 0, 0); add('armR', Math.cos(t * 8) * 0.04, 0, 0);
      roll = (s.steer || 0) * 0.35;
    } else if (mode === 'parachute') {
      const st = s.steer || 0;
      add('armL', -0.15, 0, 2.55 - st * 0.4); add('armR', -0.15, 0, -2.55 - st * 0.4); add('foreL', -0.3, 0, 0); add('foreR', -0.3, 0, 0);
      add('thighL', -0.25 + Math.sin(t * 1.5) * 0.08, 0, 0.06); add('thighR', -0.15 - Math.sin(t * 1.5) * 0.08, 0, -0.06); add('shinL', 0.3, 0, 0); add('shinR', 0.35, 0, 0);
      add('fingL', 0, 0, -1.3); add('fingR', 0, 0, 1.3); roll = st * 0.15;
    } else if (mode === 'down') { // knocked down / incapacitated, lying on back
      pitch = -1.52; bodyY = 0.12; hipsY = 0.98;
      add('armL', 0.2, 0, 0.6); add('armR', 0.1, 0, -0.5); add('foreL', -0.4, 0, 0); add('foreR', -0.2, 0, 0); add('thighL', -0.1, 0, 0.1); add('shinL', 0.3, 0, 0); add('neck', 0.2, 0.3, 0);
      rate = s.fastFall ? 9 : 4;
    } else if (mode === 'activity') {
      const r = this._activity(s, add, set, t, dt); hipsY = r.hipsY ?? hipsY; pitch = r.pitch ?? pitch; bodyY = r.bodyY ?? bodyY; rate = r.rate ?? rate; hipsZ = r.hipsZ ?? hipsZ;
    }
    // upper body overlays
    if (s.action) this._action(s.action, add, set, s);
    if (s.item === 'phoneCall') { set('armR', -0.25, 0.2, -0.95); set('foreR', -2.45, 0.2, 0); set('handR', 0, -0.4, 0.3); }
    else if (s.item === 'phoneText') { set('armR', -0.55, 0, -0.12); set('foreR', -1.5, 0.3, 0); set('armL', -0.5, 0, 0.12); set('foreL', -1.45, -0.3, 0); add('neck', 0.45, 0, 0); add('head', 0.15, 0, 0); }
    else if (s.item === 'smoke' || s.item === 'eat' || s.item === 'drink') {
      const cyc = (t % 6) / 6, up = s.item === 'smoke' ? smoothstep(0.0, 0.12, cyc) * (1 - smoothstep(0.3, 0.42, cyc)) : smoothstep(0, 0.15, cyc % 0.5 * 2) * (1 - smoothstep(0.5, 0.7, cyc % 0.5 * 2));
      set('armR', lerp(-0.1, -0.55, up), 0, lerp(-0.1, -0.5, up)); set('foreR', lerp(-0.5, -2.35, up), 0, 0);
      if (s.item === 'smoke' && cyc > 0.42 && cyc < 0.6) add('head', -0.1, 0, 0);
    }
    if (s.wave) { set('armR', -0.2, 0, -2.5); set('foreR', -0.4 + Math.sin(t * 9) * 0.35, 0, 0); }
    if (s.handsUp) { set('armL', -0.1, 0, 2.7); set('armR', -0.1, 0, -2.7); set('foreL', -0.5, 0, 0); set('foreR', -0.5, 0, 0); }
    if (s.talk) { const k = Math.sin(t * 2.3) * 0.5 + 0.5; add('foreR', -0.5 - k * 0.6, 0.3 * k, 0); add('armR', -0.25 * k, 0, -0.1); add('foreL', -0.3 - (1 - k) * 0.4, 0, 0); add('jaw', 0.12 + Math.sin(t * 13) * 0.1, 0, 0); add('head', Math.sin(t * 1.3) * 0.08, Math.sin(t * 0.7) * 0.15, 0); }
    if (s.hurt) { add('chest', -0.35 * s.hurt, 0, 0.15 * s.hurt); add('neck', -0.4 * s.hurt, 0.3 * s.hurt, 0); }
    // head look + blink
    this.lookT -= dt;
    if (s.lookYaw !== undefined) this.lookTarget = clamp(s.lookYaw, -1.1, 1.1);
    else if (this.lookT <= 0) { this.lookT = 2 + R() * 5; this.lookTarget = (R() - 0.5) * (sp > 3 ? 0.3 : 1.2); }
    this.lookYaw = lerp(this.lookYaw, this.lookTarget, 1 - Math.exp(-dt * 4));
    add('head', (s.lookPitch || 0) * 0.6, this.lookYaw * 0.65, 0); add('neck', (s.lookPitch || 0) * 0.3, this.lookYaw * 0.35, 0);
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2.2 + R() * 4; }
    const closed = this.blink > 0 || s.eyesClosed; this.blink = Math.max(0, this.blink - dt);
    set('lidL', closed ? 1.25 : -0.35, 0, 0); set('lidR', closed ? 1.25 : -0.35, 0, 0);
    add('chest', breath * 0.4, 0, 0); add('clavL', 0, 0, breath * 0.5); add('clavR', 0, 0, -breath * 0.5);
    // apply with smoothing
    const k = 1 - Math.exp(-rate * dt), kf = 1 - Math.exp(-30 * dt);
    for (const b of BONES) {
      if (b === 'root') continue;
      const v = T[b]; _e.set(v[0], v[1], v[2]); _q.setFromEuler(_e);
      const bone = this.bones[b];
      if (this._directArms && (b === 'armL' || b === 'armR')) bone.quaternion.copy(_q);
      else bone.quaternion.slerp(_q, b.startsWith('lid') ? kf : k);
    }
    this._directArms = false;
    const kb = 1 - Math.exp(-Math.min(rate, 14) * dt);
    this.hipsY = lerp(this.hipsY, hipsY, kb); this.hipsX = lerp(this.hipsX, hipsX, kb); this.hipsZ = lerp(this.hipsZ, hipsZ, kb);
    this.bones.hips.position.set(this.hipsX, this.hipsY, this.hipsZ);
    this.bodyPitch = lerp(this.bodyPitch, pitch, kb); this.bodyRoll = lerp(this.bodyRoll, roll, kb); this.bodyY = lerp(this.bodyY, bodyY, kb);
    this.body.rotation.set(this.bodyPitch, 0, this.bodyRoll); this.body.position.y = this.bodyY;
    // when lying, keep body pivot near hips so the figure rests on the ground
    if (Math.abs(this.bodyPitch) > 0.8 && mode !== 'swim' && mode !== 'freefall' && mode !== 'activity') this.body.position.y = this.bodyY + 0.0;
    if (this.postPose) this.postPose(this, dt);
    if (this.real) this.real.sync(dt, this, s, mode);
  }
  _guard(add, t) {
    const b = Math.sin(t * 5) * 0.02;
    add('armL', -0.75, 0, 0.22); add('armR', -0.65, 0, -0.25); add('foreL', -2.0, 0, -0.15); add('foreR', -2.1, 0, 0.15);
    add('fingL', 0, 0, -1.5); add('fingR', 0, 0, 1.5); add('chest', 0.12, 0.15, 0); add('neck', 0.1 + b, -0.1, 0);
    add('thighL', -0.2, 0, 0.05); add('thighR', 0.1, 0, -0.05); add('shinL', 0.25, 0, 0); add('shinR', 0.2, 0, 0);
  }
  _action(a, add, set, s) {
    const p = clamp(a.p, 0, 1), wind = smoothstep(0, 0.3, p), strike = smoothstep(0.25, 0.45, p) * (1 - smoothstep(0.55, 1, p));
    const n = a.name;
    const guardL = () => { set('armL', -0.75, 0, 0.22); set('foreL', -2.0, 0, -0.15); set('fingL', 0, 0, -1.5); };
    const guardR = () => { set('armR', -0.65, 0, -0.25); set('foreR', -2.1, 0, 0.15); set('fingR', 0, 0, 1.5); };
    if (n === 'jab' || n === 'cross' || n === 'body') {
      const L = n === 'jab'; const side = L ? 'L' : 'R', sg = L ? 1 : -1; const low = n === 'body' ? 0.45 : 0;
      L ? guardR() : guardL();
      set('arm' + side, lerp(-0.7, -1.5 + low, strike), 0, sg * lerp(0.22, 0.05, strike)); set('fore' + side, lerp(-2.0, -0.08, strike), 0, 0); set('fing' + side, 0, 0, -sg * 1.6);
      add('chest', 0.1 + low * 0.4, -sg * 0.35 * strike + sg * 0.1 * wind, 0); add('hips', 0, -sg * 0.15 * strike, 0);
      if (n === 'body') { add('thighL', -0.4, 0, 0); add('thighR', -0.4, 0, 0); add('shinL', 0.7, 0, 0); add('shinR', 0.7, 0, 0); }
    } else if (n === 'hook') {
      guardR(); const side = s.hookSide || 'L', sg = side === 'L' ? 1 : -1;
      set('arm' + side, lerp(-0.7, -1.1, strike), sg * lerp(0, -0.6, strike), sg * lerp(0.25, 1.45, strike)); set('fore' + side, lerp(-2.0, -1.55, strike), 0, 0); set('fing' + side, 0, 0, -sg * 1.6);
      add('chest', 0.1, -sg * lerp(-0.25, 0.6, strike), 0); add('hips', 0, -sg * 0.25 * strike, 0);
    } else if (n === 'uppercut') {
      guardL();
      set('armR', lerp(0.2, -2.0, strike), 0, -0.2); set('foreR', lerp(-1.9, -1.7, strike), 0, 0); set('fingR', 0, 0, 1.6);
      add('chest', lerp(0.3, -0.25, strike), 0.3 * strike, 0); add('thighL', -0.5 * (1 - strike), 0, 0); add('thighR', -0.5 * (1 - strike), 0, 0); add('shinL', 0.9 * (1 - strike), 0, 0); add('shinR', 0.9 * (1 - strike), 0, 0);
    } else if (n === 'kick') {
      guardL(); guardR();
      set('thighR', lerp(-0.4, -1.65, strike), 0, -0.05); set('shinR', lerp(1.9, 0.1, strike), 0, 0); set('footR', lerp(0, 0.5, strike), 0, 0);
      add('chest', -0.35 * strike, 0, 0); set('thighL', 0.05, 0, 0.05); set('shinL', 0.2, 0, 0);
    } else if (n === 'knee') {
      set('armL', -1.1, 0, 0.3); set('armR', -1.1, 0, -0.3); set('foreL', -0.9, 0, 0); set('foreR', -0.9, 0, 0);
      set('thighR', lerp(0, -1.9, strike), 0, 0); set('shinR', lerp(0.3, 2.3, strike), 0, 0); add('chest', 0.3 * strike, 0, 0);
    } else if (n === 'block') { set('armL', -0.95, 0, 0.3); set('armR', -0.95, 0, -0.3); set('foreL', -2.45, 0, -0.35); set('foreR', -2.45, 0, 0.35); add('neck', 0.3, 0, 0); add('chest', 0.25, 0, 0); set('fingL', 0, 0, -1.5); set('fingR', 0, 0, 1.5); }
    else if (n === 'dodge') { const sg = a.dir || 1; add('chest', 0.2, 0, sg * 0.55 * Math.sin(p * Math.PI)); add('spine', 0, 0, sg * 0.25 * Math.sin(p * Math.PI)); guardL(); guardR(); }
    else if (n === 'push') { set('armL', lerp(-0.8, -1.45, strike), 0, 0.15); set('armR', lerp(-0.8, -1.45, strike), 0, -0.15); set('foreL', lerp(-1.6, -0.1, strike), 0, 0); set('foreR', lerp(-1.6, -0.1, strike), 0, 0); add('chest', 0.25 * strike, 0, 0); }
    else if (n === 'hit') { add('chest', -0.45 * (1 - p), (a.dir || 1) * 0.3 * (1 - p), 0); add('neck', -0.5 * (1 - p), (a.dir || 1) * 0.4 * (1 - p), 0); }
    else if (n === 'pet') { add('chest', 0.7, 0, 0); add('spine', 0.4, 0, 0); set('armR', -1.0, 0, -0.1); set('foreR', -0.3, 0, 0); add('thighL', -0.6, 0, 0); add('thighR', -0.6, 0, 0); add('shinL', 0.9, 0, 0); add('shinR', 0.9, 0, 0); add('armR', Math.sin(p * 30) * 0.1, 0, 0); }
    else if (n === 'enter') { add('chest', 0.35 * Math.sin(p * Math.PI), 0, 0); add('thighR', -0.6 * Math.sin(p * Math.PI), 0, 0); add('shinR', 0.8 * Math.sin(p * Math.PI), 0, 0); set('armL', -0.9, 0, 0.3); set('foreL', -0.6, 0, 0); }
    else if (n === 'deploy') { set('armR', -0.2, 0, -2.0 + p); set('foreR', -1.0, 0, 0); }
  }
  _activity(s, add, set, t, dt) {
    const k = s.activity, rep = s.rep || 0; // rep phase 0..1 (driven by the controller)
    const c = 0.5 - 0.5 * Math.cos(rep * TAU);
    switch (k) {
      case 'bench': // lying on back, pressing bar
        set('armL', lerp(-0.25, -1.55, c), 0, lerp(1.15, 0.28, c)); set('armR', lerp(-0.25, -1.55, c), 0, lerp(-1.15, -0.28, c));
        set('foreL', lerp(-1.7, -0.05, c), 0, 0); set('foreR', lerp(-1.7, -0.05, c), 0, 0); set('fingL', 0, 0, -1.4); set('fingR', 0, 0, 1.4);
        set('thighL', -1.4, 0, 0.25); set('thighR', -1.4, 0, -0.25); set('shinL', 1.5, 0, 0); set('shinR', 1.5, 0, 0);
        return { pitch: -Math.PI / 2, bodyY: 0.66, hipsY: 0.98, rate: 16 };
      case 'pushup':
        set('armL', -lerp(0.75, 1.5, c), 0, lerp(0.5, 0.18, c)); set('armR', -lerp(0.75, 1.5, c), 0, -lerp(0.5, 0.18, c)); set('foreL', lerp(-1.45, -0.05, c), 0, 0); set('foreR', lerp(-1.45, -0.05, c), 0, 0);
        set('neck', -0.5, 0, 0); set('footL', 0.9, 0, 0); set('footR', 0.9, 0, 0);
        return { pitch: Math.PI / 2 - 0.15, bodyY: lerp(0.22, 0.55, c), hipsY: 0.98, rate: 16 };
      case 'pullup':
        set('armL', -0.15, 0, lerp(2.85, 1.35, c)); set('armR', -0.15, 0, -lerp(2.85, 1.35, c)); set('foreL', lerp(-0.1, -1.9, c), 0, 0); set('foreR', lerp(-0.1, -1.9, c), 0, 0);
        set('thighL', -0.3, 0, 0); set('thighR', -0.3, 0, 0); set('shinL', 1.0, 0, 0); set('shinR', 1.0, 0, 0); set('fingL', 0, 0, -1.5); set('fingR', 0, 0, 1.5);
        return { bodyY: 0.38 + c * 0.42, rate: 16 };
      case 'squat':
        set('thighL', lerp(-0.05, -1.35, c), 0, 0.12); set('thighR', lerp(-0.05, -1.35, c), 0, -0.12); set('shinL', lerp(0.05, 1.65, c), 0, 0); set('shinR', lerp(0.05, 1.65, c), 0, 0); set('footL', -lerp(0, 0.35, c), 0, 0); set('footR', -lerp(0, 0.35, c), 0, 0);
        set('chest', lerp(0.05, 0.45, c), 0, 0); set('armL', -0.3, 0, 1.6); set('armR', -0.3, 0, -1.6); set('foreL', -2.3, 0, 0); set('foreR', -2.3, 0, 0);
        return { hipsY: lerp(0.98, 0.56, c), rate: 14 };
      case 'dumbbell':
        set('armL', -0.1, 0, 0.12); set('armR', -0.1, 0, -0.12); set('foreL', -lerp(0.1, 2.3, c), 0, 0); set('foreR', -lerp(0.1, 2.3, (0.5 - 0.5 * Math.cos((rep + 0.5) * TAU))), 0, 0); set('fingL', 0, 0, -1.5); set('fingR', 0, 0, 1.5);
        return { rate: 14 };
      case 'treadmill': { const sp = 4.2; this.phase += (sp / (1.25 + 0.27 * sp)) * TAU * dt; const ph = this.phase; for (const [sd, o] of [['L', 0], ['R', Math.PI]]) { const p = ph + o; set('thigh' + sd, -0.55 * Math.sin(p), 0, 0); set('shin' + sd, 0.1 + 1.0 * Math.pow(Math.max(0, Math.cos(p)), 1.6), 0, 0); } set('armL', 0.5 * Math.sin(ph), 0, 0.1); set('armR', -0.5 * Math.sin(ph), 0, -0.1); set('foreL', -1.0, 0, 0); set('foreR', -1.0, 0, 0); set('chest', 0.12, 0, 0); return { hipsY: 0.96 - 0.02 * (1 - Math.abs(Math.cos(ph))), rate: 20 }; }
      case 'stretch': { const w = Math.sin(t * 0.8); set('armL', -0.1, 0, 2.9); set('armR', -0.1, 0, -2.9); set('chest', 0, 0, w * 0.35); set('spine', 0, 0, w * 0.2); return { rate: 6 }; }
      case 'dance': {
        const beat = (s.beat || t * 2) * TAU, style = s.style || 0, b = Math.sin(beat);
        if (style === 0) { set('armL', -0.6 + b * 0.5, 0, 0.6); set('armR', -0.6 - b * 0.5, 0, -0.6); set('foreL', -1.4, 0, 0); set('foreR', -1.4, 0, 0); set('chest', 0.1, b * 0.25, 0); set('thighL', -0.2 - Math.max(0, b) * 0.3, 0, 0.1); set('thighR', -0.2 - Math.max(0, -b) * 0.3, 0, -0.1); set('shinL', 0.4, 0, 0); set('shinR', 0.4, 0, 0); }
        else if (style === 1) { set('armL', -0.2, 0, 2.4 + b * 0.3); set('armR', -0.2, 0, -2.4 + b * 0.3); set('foreL', -0.6, 0, 0); set('foreR', -0.6, 0, 0); set('chest', 0, 0, b * 0.15); set('hips', 0, 0, -b * 0.15); }
        else { set('armL', -1.2, b * 0.6, 0.3); set('armR', -1.2, b * 0.6, -0.3); set('foreL', -1.0, 0, 0); set('foreR', -1.0, 0, 0); set('chest', 0.15, -b * 0.4, 0); set('hips', 0, b * 0.3, 0); set('thighL', -0.3, 0, 0.1); set('thighR', -0.3, 0, -0.1); set('shinL', 0.5, 0, 0); set('shinR', 0.5, 0, 0); }
        set('neck', Math.abs(Math.sin(beat)) * 0.2, 0, 0);
        return { hipsY: 0.95 - Math.abs(Math.sin(beat)) * 0.04, rate: 14 };
      }
      case 'lie': set('armL', 0.1, 0, 0.3); set('armR', 0.1, 0, -0.3); return { pitch: -Math.PI / 2, bodyY: 0.65, rate: 6 };
      case 'sleep': set('armL', 0.1, 0, 0.2); set('armR', -0.6, 0, -0.2); set('foreR', -1.2, 0, 0); return { pitch: -Math.PI / 2, bodyY: 0.75, rate: 6 };
      case 'hose': case 'idle': default: return {};
    }
  }
  // world-space position of a bone (e.g. for hit detection)
  bonePos(name, out) { return this.bones[name].getWorldPosition(out); }
}

// Random NPC appearance
export function randomAppearance(r = R, opts = {}) {
  const sex = opts.sex || (r() < 0.5 ? 'm' : 'f');
  const f = sex === 'f';
  const pick = (a) => a[Math.floor(r() * a.length)];
  const topType = opts.top || (f ? pick(['tee', 'tank', 'blazer', 'crew', 'jacket', 'polo']) : pick(['tee', 'tee', 'polo', 'crew', 'hoodie', 'blazer', 'tank', 'jacket']));
  const colors = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#ffffff', '#111111', '#6d597a', '#b56576', '#8d99ae', '#ffb4a2', '#3a5a40', '#d4a373', '#ff006e', '#8338ec', '#fb8500'];
  const bottoms = f ? ['jeans', 'skirt', 'shorts', 'pants', 'skirt'] : ['jeans', 'pants', 'chinos', 'shorts', 'joggers'];
  const hs = f ? pick(['long', 'long', 'bun', 'medium', 'curly', 'short']) : pick(['buzz', 'short', 'short', 'medium', 'curly', 'bald']);
  const age = r();
  return {
    sex, height: f ? 1.58 + r() * 0.14 : 1.68 + r() * 0.2, build: r(), skin: pick(SKIN_TONES), faceW: 0.92 + r() * 0.12, jaw: r(),
    hair: { style: hs, color: age > 0.85 ? pick(['#8f8a84', '#d8d2c8']) : pick(HAIR_COLORS) }, facial: f ? 'none' : pick(FACIAL), brow: f ? 0.8 : 1 + r() * 0.3, eyes: pick(EYE_COLORS),
    top: { type: topType, color: pick(colors), shirt: '#f2f2f2', stripes: r() < 0.12 ? '#ffffff' : null }, bottom: { type: opts.bottom || pick(bottoms), color: pick(['#2c3a52', '#1d1e26', '#3b3b3b', '#c9b79a', '#5a6b7a', '#f1f1f1', '#6b4f3a', '#24324a']) },
    shoes: { color: pick(['#f2f2f2', '#111111', '#7a4a2a', '#d62828', '#1d3557', '#e9c46a']) },
    acc: { watch: r() < 0.3, earbuds: r() < 0.15, cap: r() < 0.12, capColor: pick(colors), glasses: r() < 0.15, chain: r() < 0.06 },
    tint: r() < 0.4 ? 'orig' : 'v' + (1 + Math.floor(r() * 6)),
  };
}
export function uniformAppearance(kind, r = R) {
  const a = randomAppearance(r, { sex: r() < 0.75 ? 'm' : 'f' });
  if (kind === 'police') { a.top = { type: 'police', color: '#1f2d4d' }; a.bottom = { type: 'pants', color: '#1a2238' }; a.shoes = { color: '#0d0d0d' }; a.acc = { cap: true, capColor: '#1a2238' }; }
  if (kind === 'thug') { a.top = { type: r() < 0.5 ? 'hoodie' : 'tank', color: r() < 0.5 ? '#3d0c11' : '#1b1b1b' }; a.bottom = { type: 'joggers', color: '#151515' }; a.acc = { chain: true, cap: r() < 0.5, capColor: '#7a0000' }; a.build = 0.7 + r() * 0.3; a.sex = 'm'; a.hair.style = r() < 0.5 ? 'buzz' : 'bald'; a.facial = 'short'; }
  if (kind === 'barista') { a.top = { type: 'tee', color: '#2f2f2f' }; a.bottom = { type: 'pants', color: '#3b2a20' }; }
  if (kind === 'medic') { a.top = { type: 'tee', color: '#ffffff' }; a.bottom = { type: 'pants', color: '#2a5d9f' }; }
  if (kind === 'athlete') { a.top = { type: r() < 0.5 ? 'tank' : 'tee', color: ['#e63946', '#2a9d8f', '#ffb703'][Math.floor(r() * 3)] }; a.bottom = { type: 'shorts', color: '#1d3557' }; a.build = 0.75; }
  return a;
}
