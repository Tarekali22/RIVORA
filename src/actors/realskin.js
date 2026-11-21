// Realistic skins (merged from "Miami Nights 2"): Microsoft Rocketbox avatars (MIT licence),
// driven every frame by RIVORA's procedural rig, with motion-captured idle/walk/talk/phone clips
// blended in when the character is simply standing, walking or chatting.
// Only active when the multi-file build has loaded the models into window.RIVORA_REAL.
import { clamp } from '../core/util.js';

export const MALE = ['carlos', 'ryan', 'luca', 'ethan', 'andre', 'arjun', 'daniel', 'leo', 'noah'];
export const FEMALE = ['emma', 'hannah', 'mei', 'priya', 'mia', 'olivia'];
export const REAL_NAMES = { carlos: 'Carlos', ryan: 'Ryan', luca: 'Luca', ethan: 'Ethan', andre: 'Andre', emma: 'Emma', hannah: 'Hannah', mei: 'Mei', priya: 'Priya', arjun: 'Arjun', daniel: 'Daniel', leo: 'Leo', noah: 'Noah', mia: 'Mia', olivia: 'Olivia' };
export const realAvailable = () => !!(typeof window !== 'undefined' && window.RIVORA_REAL && window.RIVORA_REAL.chars);
export const realModels = () => (realAvailable() ? Object.keys(window.RIVORA_REAL.chars) : []);

// procedural bone -> Rocketbox bone
const MAP = { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
  clavL: 'LeftShoulder', armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand',
  clavR: 'RightShoulder', armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand',
  thighL: 'LeftUpLeg', shinL: 'LeftLeg', footL: 'LeftFoot', thighR: 'RightUpLeg', shinR: 'RightLeg', footR: 'RightFoot' };
const RB2P = Object.fromEntries(Object.entries(MAP).map(([p, r]) => [r, p]));
const FING = ['Index', 'Middle', 'Ring', 'Pinky'];
const short = (n) => n.replace(/^mixamorig:?/, '');

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function pointBone(bone, child, dir) { // swing a bone so that bone->child points along a world direction
  bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false);
  _a.setFromMatrixPosition(bone.matrixWorld); _b.setFromMatrixPosition(child.matrixWorld).sub(_a).normalize();
  _dq.setFromUnitVectors(_b, dir); bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_dq.multiply(_wq)));
}
function bonesOf(root) { const o = {}; root.traverse((b) => { if (b.isBone) o[short(b.name)] = b; }); return o; }

// ---------- per-model template: reference pose matching the procedural rest pose ----------
const TPL = {};
function template(name, hi) {
  const R = window.RIVORA_REAL, useHi = !!(hi && R.hi && R.hi[name]), tk = name + (useHi ? '#hi' : '');
  if (TPL[tk]) return TPL[tk];
  const gltf = useHi ? R.hi[name] : R.chars[name], SU = R.SkeletonUtils;
  const clips = {};
  for (const c of gltf.animations) {
    for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) { const v = tr.values; for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; } }
    clips[c.name] = c;
  }
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.transparent || /opacity/i.test(m.name)) { m.transparent = false; m.alphaTest = 0.45; m.depthWrite = true; m.side = THREE.DoubleSide; }
    m.envMapIntensity = 0.8;
    if (o.geometry) o.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.9);
  });
  const box = new THREE.Group(), sc = SU.clone(gltf.scene); box.add(sc); box.updateMatrixWorld(true);
  const B = bonesOf(sc), down = new THREE.Vector3(0, -1, 0);
  for (const s of ['Left', 'Right']) {
    if (B[s + 'Arm'] && B[s + 'ForeArm']) pointBone(B[s + 'Arm'], B[s + 'ForeArm'], down);
    if (B[s + 'ForeArm'] && B[s + 'Hand']) pointBone(B[s + 'ForeArm'], B[s + 'Hand'], down);
    if (B[s + 'Hand'] && B[s + 'HandMiddle1']) pointBone(B[s + 'Hand'], B[s + 'HandMiddle1'], down);
    if (B[s + 'UpLeg'] && B[s + 'Leg']) pointBone(B[s + 'UpLeg'], B[s + 'Leg'], down);
    if (B[s + 'Leg'] && B[s + 'Foot']) pointBone(B[s + 'Leg'], B[s + 'Foot'], down);
  }
  box.updateMatrixWorld(true);
  const refQ = {}, refL = {};
  for (const k in B) { refL[k] = B[k].quaternion.clone(); if (RB2P[k]) refQ[k] = B[k].getWorldQuaternion(new THREE.Quaternion()); }
  const hipRef = B.Hips.position.clone();
  // base orientation of everything above the hips (Rig + scene root), container-space
  const base = B.Hips.parent.getWorldQuaternion(new THREE.Quaternion());
  return (TPL[tk] = { gltf, clips, refQ, refL, hipRef, base, k: 0.98 / Math.max(0.5, hipRef.y) });
}

// ---------- outfit recolouring (cached textures/materials) ----------
const MATC = {};
function lum(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
const HUE = [null, 'hue-rotate(150deg) saturate(1.2)', 'hue-rotate(220deg) saturate(1.3)', 'hue-rotate(95deg)', 'grayscale(1) brightness(.45) contrast(1.2)', 'hue-rotate(290deg) saturate(1.4)', 'sepia(1) saturate(2.2) hue-rotate(-12deg)'];
function tinted(model, m0, key) {
  const k = m0.uuid + '|' + key; if (MATC[k]) return MATC[k];
  const img = m0.map && m0.map.image; if (!img || key === 'orig') return (MATC[k] = m0);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
  if (key.startsWith('v')) { g.filter = HUE[+key.slice(1)] || 'none'; g.drawImage(img, 0, 0); }
  else { // exact colour (#rrggbb) or a uniform
    const hex = key === 'police' ? '#25345c' : key; const L = lum(hex);
    g.filter = 'grayscale(1)' + (L < 0.12 ? ' brightness(.9)' : ' brightness(1.15)'); g.drawImage(img, 0, 0); g.filter = 'none';
    g.globalCompositeOperation = L < 0.22 ? 'multiply' : 'color';
    g.fillStyle = L < 0.22 ? '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), key === 'police' ? 0.1 : 0.32).getHexString() : hex; g.fillRect(0, 0, c.width, c.height);
    if (L >= 0.22) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.25; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'source-over';
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = m0.map.flipY; t.wrapS = m0.map.wrapS; t.wrapT = m0.map.wrapT; t.anisotropy = 4;
  const m = m0.clone(); m.map = t; return (MATC[k] = m);
}

let HASH = 0;
const TONES = { base: null, olive: [0.93, 0.84, 0.75], tan: [0.86, 0.73, 0.62], brown: [0.72, 0.57, 0.46], deep: [0.55, 0.42, 0.34] };
const DARK_BASE = { andre: 2, priya: 1, arjun: 1 }; const SKINC = {};
export function pickModel(a) {
  const names = realModels(); if (!names.length) return null;
  if (a.real && names.includes(a.real)) return a.real;
  const pool = (a.sex === 'f' ? FEMALE : MALE).filter((n) => names.includes(n)); const list = pool.length ? pool : names;
  const s = (a.skin || '') + (a.hair && a.hair.color || '') + (a.top && a.top.color || '') + (a.eyes || '');
  let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

export class RealSkin {
  constructor(name, opts = {}) {
    const T = template(name, opts.hi), SU = window.RIVORA_REAL.SkeletonUtils;
    this.name = name; this.T = T;
    this.root = new THREE.Group(); this.root.scale.setScalar(T.k);
    this.scene = SU.clone(T.gltf.scene); this.root.add(this.scene);
    this.B = bonesOf(this.scene);
    for (const k in this.B) if (T.refL[k]) this.B[k].quaternion.copy(T.refL[k]);
    this.meshes = []; this.outfits = [];
    this.scene.traverse((o) => { if (o.isMesh) { o.castShadow = opts.shadow !== false; o.receiveShadow = true; o.frustumCulled = true; this.meshes.push(o); const nm = o.name + ' ' + (o.parent ? o.parent.name : ''); o.userData.nm = nm; if (/Outfit|Top_/i.test(nm)) { o.userData.m0 = o.material; this.outfits.push(o); } } });
    // bone chain used for retargeting (ancestors of every mapped bone, parents first)
    const need = new Set();
    for (const r of Object.values(MAP)) { let b = this.B[r]; while (b && b.isBone) { need.add(b); b = b.parent; } }
    for (const s of ['Left', 'Right']) for (const f of FING) for (let j = 1; j <= 3; j++) { const b = this.B[s + 'Hand' + f + j]; if (b) need.add(b); }
    this.order = []; const idx = new Map();
    this.scene.traverse((b) => { if (need.has(b)) { idx.set(b, this.order.length); const sn = short(b.name); this.order.push({ b, p: b.parent && idx.has(b.parent) ? idx.get(b.parent) : -1, proc: RB2P[sn] || null, ref: T.refQ[sn], refL: T.refL[sn], fing: /Hand(Index|Middle|Ring|Pinky)(\d)/.exec(sn), left: sn.startsWith('Left') }); } });
    this.wq = this.order.map(() => new THREE.Quaternion());
    this.procQ = {}; this.w = 1; this.mocap = null;
    this.mixer = new THREE.AnimationMixer(this.scene); this.acts = {};
    for (const n of ['Idle', 'Walk', 'Talk', 'Phone', 'Argue']) if (T.clips[n]) { const a = this.mixer.clipAction(T.clips[n]); a.play(); a.setEffectiveWeight(0); a.time = Math.random() * 4; this.acts[n] = a; }
    this.talkClip = Math.random() < 0.35 && this.acts.Argue ? 'Argue' : 'Talk';
    this.sockets = {};
    this.tintKey = 'orig';
  }
  setTint(key) {
    if (key === this.tintKey) return; this.tintKey = key;
    for (const o of this.outfits) o.material = tinted(this.name, o.userData.m0, key);
  }
  // skin tone variation (multiplies the scanned skin texture) for more diverse people from the same licensed bodies
  setSkin(tone) {
    tone = tone || 'base'; if (DARK_BASE[this.name] && tone !== 'base') tone = DARK_BASE[this.name] === 2 ? 'base' : tone === 'deep' || tone === 'brown' ? 'olive' : tone;
    if (tone === this.skinKey) return; this.skinKey = tone; const mul = TONES[tone] || null;
    for (const o of this.meshes) {
      if (o.userData.m0skin === undefined) { const nm = o.userData.nm || o.name, mn = o.material.name || ''; const hair = /Hair/i.test(nm) || /opacity/i.test(mn); const skin = !hair && (/Skin_/i.test(nm) || ((/head|skin/i.test(mn) || /body/i.test(mn)) && !/Outfit|Top_|Trousers|Shoes/i.test(nm))); o.userData.m0skin = skin || hair ? o.material : null; o.userData.hair = hair; }
      const m0 = o.userData.m0skin; if (!m0) continue;
      if (!mul) { o.material = m0; continue; }
      const hm = o.userData.hair ? [0.42, 0.38, 0.36] : mul; const k = m0.uuid + '|' + tone; let m = SKINC[k]; if (!m) { m = m0.clone(); m.color = m0.color.clone().multiply(new THREE.Color(...hm)); SKINC[k] = m; }
      o.material = m;
    }
  }
  setShadow(on) { for (const m of this.meshes) m.castShadow = on; }
  // an object placed under this socket behaves as if it were parented to the procedural bone
  socket(proc) {
    if (this.sockets[proc]) return this.sockets[proc];
    const rb = MAP[proc] || (proc.startsWith('fing') ? MAP['hand' + proc.slice(4)] : proc === 'jaw' || proc.startsWith('lid') ? 'Head' : 'Spine2');
    const s = new THREE.Group(); const ref = this.T.refQ[rb]; if (ref) s.quaternion.copy(ref).invert();
    s.scale.setScalar(1 / this.T.k); (this.B[rb] || this.scene).add(s); this.sockets[proc] = s; return s;
  }
  _clipFor(s, mode) {
    if (this.forceProc) return null;
    if (mode !== 'loco' || s.crouch || s.guard || s.action || s.wave || s.handsUp || s.hurt || s.noMocap) return null;
    const sp = s.speed || 0;
    if (s.item === 'phoneCall' && sp < 0.3) return this.acts.Phone ? 'Phone' : null;
    if (s.item) return null;
    if (s.talk && sp < 0.3) return this.acts[this.talkClip] ? this.talkClip : null;
    if (sp > 2.6) return null; // jog / run: procedural stride
    return sp > 0.25 ? 'Walk' : 'Idle';
  }
  sync(dt, h, s, mode) {
    const T = this.T, PB = h.bones, PQ = this.procQ;
    // body-space orientation of every procedural bone (rest pose = identity)
    for (const name in PB) { const b = PB[name], p = b.parent && b.parent.isBone ? PQ[b.parent.name] : null; const q = PQ[name] || (PQ[name] = new THREE.Quaternion()); if (p) q.multiplyQuaternions(p, b.quaternion); else q.copy(b.quaternion); }
    // motion capture blend
    const clip = this._clipFor(s, mode);
    this.w += ((clip ? 0 : 1) - this.w) * Math.min(1, dt * 7);
    if (this.w > 0.995) this.w = 1;
    const useMix = this.w < 1;
    if (useMix) {
      const sp = s.speed || 0;
      for (const n in this.acts) { const a = this.acts[n]; const tw = n === clip ? 1 : 0; a._w = (a._w || 0) + (tw - (a._w || 0)) * Math.min(1, dt * 6); a.setEffectiveWeight(a._w); }
      if (this.acts.Walk) this.acts.Walk.timeScale = clamp(sp / 1.3, 0.6, 2.2);
      this.mixer.update(dt);
    }
    const w = this.w, O = this.order, WQ = this.wq;
    const fL = clamp(-2 * Math.atan2(PB.fingL.quaternion.z, PB.fingL.quaternion.w) / 1.5, 0, 1.1), fR = clamp(2 * Math.atan2(PB.fingR.quaternion.z, PB.fingR.quaternion.w) / 1.5, 0, 1.1);
    for (let i = 0; i < O.length; i++) {
      const e = O[i], pq = e.p < 0 ? T.base : WQ[e.p], bq = e.b.quaternion;
      if (e.proc && w > 0) {
        _dq.multiplyQuaternions(PQ[e.proc], e.ref); _pq.copy(pq).invert().multiply(_dq);
        if (w >= 1) bq.copy(_pq); else bq.slerp(_pq, w);
      } else if (e.fing && w > 0) {
        const j = +e.fing[2], c = (e.left ? fL : fR) * (j === 1 ? 1.0 : j === 2 ? 1.35 : 1.0);
        _dq.setFromAxisAngle(_b.set(0, 0, 1), c); _pq.copy(e.refL).multiply(_dq);
        if (w >= 1) bq.copy(_pq); else bq.slerp(_pq, w);
      } else if (!useMix && e.refL) bq.copy(e.refL);
      WQ[i].multiplyQuaternions(pq, bq);
    }
    // hips translation (procedural rest hips height 0.98 body units)
    const hp = PB.hips.position, H = this.B.Hips;
    const tx = T.hipRef.x + hp.x / T.k, ty = T.hipRef.y + (hp.y - 0.98) / T.k, tz = T.hipRef.z + hp.z / T.k;
    if (w >= 1) H.position.set(tx, ty, tz); else { H.position.x += (tx - H.position.x) * w; H.position.y += (ty - H.position.y) * w; H.position.z += (tz - H.position.z) * w; }
  }
  dispose() { if (this.root.parent) this.root.parent.remove(this.root); this.mixer.stopAllAction(); }
}
