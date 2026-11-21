// El Nour Quarter (حي النور): an original Egyptian-inspired neighbourhood inside San Aurelia, west of the hero's home.
// Mid-rise plastered apartment blocks with balconies, shutters, AC units and satellite dishes, Arabic shop signs,
// an ahwa (street café) with sidewalk seating, a fuul cart, a kiosk, a mosque and a Coptic-style church,
// and bunting / lantern strings across the streets. Everything here is invented; no real businesses are depicted.
import * as L from './layout.js';
import { GeoBuilder, prim } from '../core/geo.js';
import { makeCanvas, shadeHex, lerp } from '../core/util.js';
import { addStrings } from '../core/i18n.js';
import { plasterFacade, egyptShopfront } from './pbr.js';

export const NOUR_BLOCKS = new Set(['0,5', '0,6', '1,5', '1,6']);
Object.assign(L.DISTRICTS, { nour: { name: 'El Nour Quarter', density: 1.0 } });
Object.assign(L.POI, {
  ahwa: { name: 'Ahwa El Nour', x: -227.5, z: 272, kind: 'ahwa', icon: 'food' },
  koshary: { name: 'Koshary El Nour', x: -227.5, z: 303, kind: 'koshary', icon: 'food' },
  bakery: { name: 'Al-Amal Bakery', x: -227.5, z: 193, kind: 'bakery', icon: 'food' },
  juice: { name: 'Nile Juice', x: -227.5, z: 206, kind: 'juice', icon: 'food' },
  nkiosk: { name: 'El Nour Kiosk', x: -227.5, z: 224, kind: 'kiosk', icon: 'shop' },
  gunshop: { name: 'Ironclad Arms', x: -350, z: -98, kind: 'gunshop', icon: 'shop' },
});
addStrings({
  'El Nour Quarter': 'حي النور', 'Ahwa El Nour': 'قهوة النور', 'Koshary El Nour': 'كشري النور', 'Al-Amal Bakery': 'مخبز الأمل', 'Nile Juice': 'عصائر النيل', 'El Nour Kiosk': 'كشك النور', 'Ironclad Arms': 'آيرونكلاد للأسلحة',
  'Ahwa El Nour: sit, order tea, meet people': 'قهوة النور: اقعد واطلب شاي وقابل الناس', 'Koshary El Nour: order food': 'كشري النور: اطلب أكل', 'Al-Amal Bakery: fresh bread & sweets': 'مخبز الأمل: عيش طازة وحلويات', 'Nile Juice: sugarcane & fresh juice': 'عصائر النيل: قصب وعصير فريش', 'El Nour Kiosk: drinks & snacks': 'كشك النور: مشروبات وسناكس', 'Ironclad Arms: weapons, ammo & armour': 'آيرونكلاد: أسلحة وذخيرة ودروع',
});
const PAL = ['#d8b98a', '#c99b6b', '#e2cfa4', '#b8865e', '#d6a28f', '#a99478', '#e9dcc4', '#9c7f63', '#cdb48c', '#c2a37f', '#dcb38f', '#b59d7c', '#cfc2ad', '#b0a08c', '#d9c06d', '#c4886a'];
const AWN = ['#b23a3a', '#2f6f4f', '#2b4c7e', '#c98b2b', '#7a3e6e', '#3d6b8a', '#8a2f2f', '#4b7a3a'];
const SHOPS = [
  ['سوبر ماركت الخير', 'EL KHEIR MARKET', '#1f6f3e', '#fff'], ['صيدلية الشفاء', 'EL SHIFA PHARMACY', '#0f7a6a', '#fff'], ['موبايلات الفجر', 'EL FAGR MOBILE', '#1b3e8a', '#ffd23f'], ['حلاق الأسطى سيد', 'BARBER', '#f2efe8', '#a12626'],
  ['مكوجي النور', 'IRONING', '#ffffff', '#1b3e8a'], ['بقالة البركة', 'GROCERY', '#c8302c', '#fff'], ['أدوات منزلية', 'HOUSEWARES', '#f4c430', '#222'], ['ملابس الأسرة', 'FAMILY CLOTHES', '#6a2c70', '#fff'],
  ['محمصة الصباح', 'ROASTERY', '#4a2c17', '#f5d08a'], ['حلويات الشرق', 'ORIENTAL SWEETS', '#a4161a', '#ffe8a3'], ['مكتبة المعرفة', 'BOOKSHOP', '#0b4f6c', '#fff'], ['عطارة الزهراء', 'SPICES', '#6b3e26', '#ffd166'],
  ['تصليح موبايلات', 'PHONE REPAIR', '#111', '#33d17a'], ['نظارات النور', 'OPTICS', '#e9ecef', '#003566'], ['مطعم بيت العائلة', 'FAMILY RESTAURANT', '#9c2a1c', '#fff'], ['أدوات كهربائية', 'ELECTRICALS', '#003566', '#ffd60a'],
  ['خياط الأناقة', 'TAILOR', '#2d2d2d', '#e5c07b'], ['مخبز السعادة', 'BAKERY', '#d98e04', '#fff'], ['فول وطعمية', 'FUUL & TAAMEYA', '#2a7d2e', '#fff5c2'], ['كافيه سما', 'SAMA CAFE', '#264653', '#e9c46a'],
];

// ---------------- sign atlas: every Arabic sign in one texture, one draw call ----------------
class SignAtlas {
  constructor() { this.c = makeCanvas(2048, 2048); this.g = this.c.getContext('2d'); this.i = 0; this.cw = 512; this.ch = 128; this.geo = { pos: [], nor: [], uv: [] }; }
  cell(ar, en, bg, fg) {
    const key = ar + '|' + en; this.cache = this.cache || {}; if (this.cache[key]) return this.cache[key];
    const k = this.i++; if (k >= 64) return null; const cx = (k % 4) * this.cw, cy = Math.floor(k / 4) * this.ch, g = this.g;
    g.fillStyle = bg; g.fillRect(cx, cy, this.cw, this.ch);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 6; g.strokeRect(cx + 3, cy + 3, this.cw - 6, this.ch - 6);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.font = `700 ${en ? 56 : 70}px Cairo, "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif`; g.fillText(ar, cx + this.cw / 2, cy + (en ? 50 : 66), this.cw - 30);
    if (en) { g.direction = 'ltr'; g.font = '700 26px "Segoe UI", Arial, sans-serif'; g.fillText(en, cx + this.cw / 2, cy + 104, this.cw - 40); }
    return (this.cache[key] = [cx / 2048, 1 - (cy + this.ch) / 2048, (cx + this.cw) / 2048, 1 - cy / 2048]);
  }
  // vertical quad facing (nx, nz), centred at (x, y, z)
  quad(uv, x, y, z, nx, nz, w, h) {
    if (!uv) return; const tx = nz, tz = -nx, hw = w / 2, hh = h / 2, P = this.geo.pos, N = this.geo.nor, U = this.geo.uv;
    const pts = [[x - tx * hw, y - hh, z - tz * hw, uv[0], uv[1]], [x + tx * hw, y - hh, z + tz * hw, uv[2], uv[1]], [x + tx * hw, y + hh, z + tz * hw, uv[2], uv[3]], [x - tx * hw, y + hh, z - tz * hw, uv[0], uv[3]]];
    for (const i of [0, 1, 2, 0, 2, 3]) { const p = pts[i]; P.push(p[0], p[1], p[2]); N.push(nx, 0, nz); U.push(p[3], p[4]); }
  }
  mesh() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.geo.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.geo.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.geo.uv, 2));
    const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(g, m); mesh.name = 'nour_signs'; return mesh;
  }
}
let ATLAS = null, FLAGS = null;
function ensure(city) {
  if (city.F.egypt) return;
  const f = plasterFacade(29);
  city.F.egypt = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, normalMap: f.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: f.rough, vertexColors: true, roughness: 0.92, metalness: 0 });
  city.nightMats.push(city.F.egypt); city.B.F_egypt = new GeoBuilder();
  const sf = egyptShopfront(41); city.F.eshop = new THREE.MeshStandardMaterial({ map: sf.map, emissiveMap: sf.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.7 });
  city.nightMats.push(city.F.eshop); city.B.F_eshop = new GeoBuilder();
  ATLAS = new SignAtlas(); FLAGS = { pos: [], col: [] };
}
const faceOf = (side) => (side === 'n' ? [0, -1] : side === 's' ? [0, 1] : side === 'w' ? [-1, 0] : [1, 0]);

// ---------------- named places and landmarks ----------------
const RESERVED = { // per block: rectangles that the generic row-houses must avoid
  '1,5': [[-266, 110, -230, 146]], '0,6': [[-406, 334, -370, 370]],
};
const FORCED = { // [block, side, a0, a1, sign(ar), sign(en), bg, fg, door kind, door label]
  '1,6': [['e', 262, 284, 'قهوة النور', 'AHWA EL NOUR', '#2b4c2b', '#ffe8a3', 'ahwa', 'Ahwa El Nour: sit, order tea, meet people'], ['e', 296, 312, 'كشري النور', 'KOSHARY', '#b5121b', '#fff3b0', 'koshary', 'Koshary El Nour: order food'], ['n', -300, -286, 'صيدلية الشفاء', 'EL SHIFA PHARMACY', '#0f7a6a', '#fff']],
  '1,5': [['e', 186, 200, 'مخبز الأمل', 'AL-AMAL BAKERY', '#d98e04', '#fff', 'bakery', 'Al-Amal Bakery: fresh bread & sweets'], ['e', 200, 214, 'عصائر النيل · قصب', 'NILE JUICE', '#2f8f2f', '#fff', 'juice', 'Nile Juice: sugarcane & fresh juice']],
};

export function buildNourBlock(city, b) {
  ensure(city); const r = city.r, key = b.i + ',' + b.j, depth = 14;
  const reserved = RESERVED[key] || [], forced = FORCED[key] || [];
  const sides = [['n', b.lx0, b.lx1], ['s', b.lx0, b.lx1], ['w', b.lz0 + depth, b.lz1 - depth], ['e', b.lz0 + depth, b.lz1 - depth]];
  for (const [side, A0, A1] of sides) {
    const rectOf = (a0, a1) => (side === 'n' ? [a0, b.lz0, a1, b.lz0 + depth] : side === 's' ? [a0, b.lz1 - depth, a1, b.lz1] : side === 'w' ? [b.lx0, a0, b.lx0 + depth, a1] : [b.lx1 - depth, a0, b.lx1, a1]);
    const blocked = (a0, a1) => reserved.some((q) => { const R2 = rectOf(a0, a1); return R2[0] < q[2] && R2[2] > q[0] && R2[1] < q[3] && R2[3] > q[1]; });
    const fs = forced.filter((f) => f[0] === side).sort((p, q) => p[1] - q[1]);
    let a = A0;
    const emit = (a0, a1, named) => { if (a1 - a0 < 5 || blocked(a0, a1)) return; rowHouse(city, rectOf(a0, a1), side, a0, a1, named, r); };
    for (const f of fs) { while (a < f[1] - 5) { let w = 10 + r() * 6; if (f[1] - (a + w) < 6) w = f[1] - a; emit(a, a + w); a += w; } emit(f[1], f[2], f); a = f[2]; }
    while (a < A1 - 5) { let w = 10 + r() * 6; if (A1 - (a + w) < 7) w = A1 - a; emit(a, a + w); a += w; }
  }
  if (key === '1,5') mosque(city, -248, 128);
  if (key === '0,6') church(city, -388, 352);
  if (key === '0,5') pigeonTower(city, b.cx, b.cz);
}
function rowHouse(city, rect, side, a0, a1, named, r) {
  const B = city.B, floors = 3 + Math.floor(r() * r() * 8) + Math.floor(r() * 2), h = 3.5 * (floors + 1) + 0.2, tint = PAL[Math.floor(r() * PAL.length)];
  const bld = city.building(rect[0], rect[1], rect[2], rect[3], h, 'egypt', tint, { clean: true, noParapet: r() < 0.6 });
  { const d = 0.12, sh = 4.2, Bs = city.B.F_eshop, yb = L.SIDEWALK_H, o = { u: 8, v: 4, yBase: yb }; const [x0, z0, x1, z1] = rect;
    if (side === 'n') Bs.box((x0 + x1) / 2, yb + sh / 2, z0 - d / 2, x1 - x0, sh, d, '#ffffff', { ...o, faces: 'nz' }); if (side === 's') Bs.box((x0 + x1) / 2, yb + sh / 2, z1 + d / 2, x1 - x0, sh, d, '#ffffff', { ...o, faces: 'pz' });
    if (side === 'w') Bs.box(x0 - d / 2, yb + sh / 2, (z0 + z1) / 2, d, sh, z1 - z0, '#ffffff', { ...o, faces: 'nx' }); if (side === 'e') Bs.box(x1 + d / 2, yb + sh / 2, (z0 + z1) / 2, d, sh, z1 - z0, '#ffffff', { ...o, faces: 'px' }); }
  const y0 = L.SIDEWALK_H, [nx, nz] = faceOf(side), w = a1 - a0;
  const fx = side === 'w' ? rect[0] : side === 'e' ? rect[2] : 0, fz = side === 'n' ? rect[1] : side === 's' ? rect[3] : 0;
  const at = (u, out) => (side === 'n' || side === 's' ? [a0 + u, fz + nz * out] : [fx + nx * out, a0 + u]);
  const rotY = side === 'n' || side === 's' ? 0 : Math.PI / 2;
  const wall = shadeHex(tint, 0.86), along = (sx, sz) => (side === 'n' || side === 's' ? [sx, sz] : [sz, sx]);
  // ground floor: awning + Arabic sign (+ a door for named places)
  const awn = AWN[Math.floor(r() * AWN.length)], aw = Math.max(3, w - 2);
  { const [x, z] = at(w / 2, 0.75); const [sx, sz] = along(aw, 1.5); B.prop.add(prim('box', 1, 1, 1), x, y0 + 3.05, z, side === 'n' ? -0.32 : side === 's' ? 0.32 : 0, 0, side === 'e' ? -0.32 : side === 'w' ? 0.32 : 0, sx, 0.06, sz, awn); }
  const sg = named ? ATLAS.cell(named[3], named[4], named[5], named[6]) : (r() < 0.85 ? ATLAS.cell(...SHOPS[Math.floor(r() * SHOPS.length)]) : null);
  { const [x, z] = at(w / 2, 0.16); ATLAS.quad(sg, x, y0 + 3.85, z, nx, nz, Math.min(w - 1.5, named ? 7 : 5.5), named ? 1.2 : 1.0); }
  if (named && named[7]) { const [x, z] = at(w / 2, 2.4); city.door(x, z, named[7], named[7], named[8], { r: 3 }); }
  // upper floors: balconies with solid balustrades, AC units, laundry
  for (let k = 2; k <= floors; k++) {
    const yf = y0 + 3.5 * k;
    for (let u = 2; u < w - 1.5; u += 4) {
      const roll = r();
      if (roll < 0.42) {
        const bw = 2.9, bd = 1.05; const [x, z] = at(u, bd / 2); const [sx, sz] = along(bw, bd);
        B.prop.box(x, yf + 0.08, z, sx, 0.16, sz, wall);
        const [x2, z2] = at(u, bd - 0.05); const [fx2, fz2] = along(bw, 0.1); B.prop.box(x2, yf + 0.6, z2, fx2, 1.0, fz2, wall);
        for (const s of [-1, 1]) { const [x3, z3] = at(u + s * (bw / 2 - 0.05), bd / 2); const [sx3, sz3] = along(0.1, bd); B.prop.box(x3, yf + 0.6, z3, sx3, 1.0, sz3, wall); }
        if (r() < 0.3) { // laundry line
          const [xa, za] = at(u - 1.2, bd - 0.1), [xb, zb] = at(u + 1.2, bd - 0.1); B.prop.box((xa + xb) / 2, yf + 1.75, (za + zb) / 2, Math.abs(xb - xa) + 0.02, 0.02, Math.abs(zb - za) + 0.02, '#444');
          for (let c = 0; c < 4; c++) { const [xc, zc] = at(u - 1.0 + c * 0.66, bd - 0.1); const [cx, cz] = along(0.42, 0.03); B.prop.box(xc, yf + 1.43, zc, cx, 0.62, cz, ['#e63946', '#f1faee', '#457b9d', '#ffb703', '#8ecae6', '#6a4c93'][Math.floor(r() * 6)]); }
        }
      } else if (roll < 0.78) {
        const [x, z] = at(u + (r() < 0.5 ? -0.9 : 0.9), 0.2); const [sx, sz] = along(0.82, 0.4); B.prop.box(x, yf + 0.5, z, sx, 0.5, sz, r() < 0.8 ? '#e8e8e4' : '#b9bcbf');
      }
    }
  }
  // roof: water tanks, satellite dishes, stair housing, rebar stubs, antennas
  const top = bld.top, cx = (rect[0] + rect[2]) / 2, cz = (rect[1] + rect[3]) / 2, rw = rect[2] - rect[0], rd = rect[3] - rect[1];
  const rp = () => [lerp(rect[0] + 1.2, rect[2] - 1.2, r()), lerp(rect[1] + 1.2, rect[3] - 1.2, r())];
  B.prop.box(rect[0] + 2, top + 1.3, rect[1] + 2, 3, 2.6, 3, wall);
  for (let i = 0; i < 1 + Math.floor(r() * 3); i++) { const [x, z] = rp(); B.prop.add(prim('cyl', 0.55, 0.55, 1.3, 10), x, top + 0.65, z, 0, 0, 0, 1, 1, 1, r() < 0.5 ? '#2b2b2b' : r() < 0.5 ? '#e8e8e8' : '#3a6fa5'); }
  for (let i = 0; i < 2 + Math.floor(r() * 6); i++) { const [x, z] = rp(); B.prop.box(x, top + 0.45, z, 0.06, 0.9, 0.06, '#8d8d8d'); B.prop.add(prim('sphere', 0.5, 10, 5, 0, Math.PI * 2, 0, 0.75), x, top + 1.0, z, -1.0, r() * 6.28, 0, 1, 0.45, 1, '#dcdcd8'); }
  if (r() < 0.6) for (let i = 0; i < 6; i++) { const x = i < 3 ? rect[0] + 0.3 : rect[2] - 0.3, z = i % 3 === 0 ? rect[1] + 0.3 : i % 3 === 1 ? cz : rect[3] - 0.3; B.prop.box(x, top + 0.5, z, 0.05, 1.0, 0.05, '#6b4a3a'); }
  if (r() < 0.35) { const [x, z] = rp(); B.prop.box(x, top + 2.5, z, 0.06, 5, 0.06, '#9a9a9a'); B.prop.box(x, top + 4.4, z, 1.6, 0.05, 0.05, '#9a9a9a'); }
  void rw; void rd;
}
function mosque(city, cx, cz) {
  const B = city.B, y0 = L.SIDEWALK_H, c = '#efe6d4', trim = '#cdb894';
  city.building(cx - 16, cz - 16, cx + 16, cz + 16, 9, 'stucco', c, { clean: true });
  B.prop.add(prim('cyl', 1, 1, 1, 24), cx, y0 + 9.75, cz, 0, 0, 0, 8.2, 1.5, 8.2, trim);
  B.prop.add(prim('sphere', 1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cx, y0 + 10.5, cz, 0, 0, 0, 8, 7, 8, '#e9dfcb');
  B.prop.add(prim('cyl', 0.12, 0.12, 2.2, 6), cx, y0 + 18.4, cz, 0, 0, 0, 1, 1, 1, '#d4af37');
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) B.prop.add(prim('sphere', 1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cx + dx, y0 + 9, cz + dz, 0, 0, 0, 2.2, 1.8, 2.2, '#e9dfcb');
  // minaret
  const mx = cx + 13.5, mz = cz - 13.5;
  B.prop.box(mx, y0 + 7, mz, 4.2, 14, 4.2, c); B.prop.box(mx, y0 + 14.2, mz, 4.8, 0.4, 4.8, trim);
  B.prop.add(prim('cyl', 1, 1, 1, 8), mx, y0 + 22.2, mz, 0, 0, 0, 1.75, 16, 1.75, c);
  B.prop.add(prim('cyl', 1, 1, 1, 16), mx, y0 + 30.4, mz, 0, 0, 0, 2.5, 0.4, 2.5, trim); B.prop.add(prim('torus', 2.45, 0.06, 4, 24), mx, y0 + 31.5, mz, Math.PI / 2, 0, 0, 1, 1, 1, trim);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; B.prop.box(mx + Math.cos(a) * 2.45, y0 + 31, mz + Math.sin(a) * 2.45, 0.06, 1.0, 0.06, trim); }
  B.prop.add(prim('cyl', 1, 1, 1, 8), mx, y0 + 34.4, mz, 0, 0, 0, 1.25, 7.6, 1.25, c);
  B.prop.add(prim('cyl', 1, 1, 1, 16), mx, y0 + 38.3, mz, 0, 0, 0, 1.6, 0.3, 1.6, trim);
  B.prop.add(prim('sphere', 1, 14, 10), mx, y0 + 39.4, mz, 0, 0, 0, 1.15, 1.35, 1.15, '#e9dfcb');
  B.prop.add(prim('cone', 0.35, 1.6, 8), mx, y0 + 41.2, mz, 0, 0, 0, 1, 1, 1, '#d4af37');
  B.prop.add(prim('torus', 0.42, 0.07, 6, 16, Math.PI * 1.35), mx, y0 + 42.4, mz, 0, 0, 0.9, 1, 1, 1, '#d4af37');
  city.addCircle(mx, mz, 2.4, y0 + 42);
}
function church(city, cx, cz) {
  const B = city.B, y0 = L.SIDEWALK_H, c = '#ebe4d6';
  city.building(cx - 14, cz - 7, cx + 14, cz + 7, 10, 'stucco', c, { roof: 'hip', roofH: 4, roofCol: '#8a5a44', clean: true });
  const tx = cx - 17, tz = cz;
  B.prop.box(tx, y0 + 12, tz, 5, 24, 5, c); B.prop.box(tx, y0 + 18, tz, 5.3, 0.4, 5.3, '#cbb89a');
  for (const [dx, dz] of [[0, 2.55], [0, -2.55], [2.55, 0], [-2.55, 0]]) B.prop.box(tx + dx, y0 + 21, tz + dz, dx ? 0.1 : 1.6, 2.6, dz ? 0.1 : 1.6, '#2a2a2a');
  B.prop.add(prim('cone', 0.7071, 1, 4, 1), tx, y0 + 26.2, tz, 0, Math.PI / 4, 0, 5.6, 4.4, 5.6, '#8a5a44');
  B.prop.box(tx, y0 + 29.6, tz, 0.16, 2.4, 0.16, '#d4af37'); B.prop.box(tx, y0 + 30.1, tz, 1.3, 0.16, 0.16, '#d4af37');
  city.addBox(tx - 2.5, tz - 2.5, tx + 2.5, tz + 2.5, y0 + 24);
}
function pigeonTower(city, x, z) { const B = city.B; B.prop.box(x, 2, z, 2.2, 4, 2.2, '#5a4632'); B.prop.box(x, 4.3, z, 2.8, 0.25, 2.8, '#3e3022'); for (let i = 0; i < 5; i++) B.prop.box(x, 0.6 + i * 0.75, z, 2.25, 0.06, 2.25, '#7a6248'); city.addBox(x - 1.1, z - 1.1, x + 1.1, z + 1.1, 4.4); }

// ---------------- street life: ahwa seating, carts, kiosk, bunting and lanterns ----------------
export function finishNour(city) {
  if (!ATLAS) return; const B = city.B, y0 = L.SIDEWALK_H;
  // ahwa: metal tables and plastic chairs on the sidewalk (NPCs use these seats)
  for (let k = 0; k < 5; k++) {
    const x = -227.9, z = 264 + k * 4;
    B.metal.add(prim('cyl', 0.32, 0.32, 0.04, 14), x, y0 + 0.74, z, 0, 0, 0, 1, 1, 1, '#c9ccd0'); B.metal.box(x, y0 + 0.37, z, 0.06, 0.74, 0.06, '#7d8288');
    for (const s of [-1, 1]) {
      const cz = z + s * 0.68, col = ['#f1f1f1', '#2f6fb5', '#c0392b', '#2e8b57'][(k + (s > 0 ? 1 : 0)) % 4];
      B.prop.box(x, y0 + 0.45, cz, 0.42, 0.04, 0.42, col); B.prop.box(x, y0 + 0.7, cz + s * 0.2, 0.42, 0.46, 0.04, col);
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) B.prop.box(x + lx, y0 + 0.22, cz + lz, 0.035, 0.44, 0.035, col);
      city.seats.push({ x, z: cz, y: y0 + 0.5, heading: s > 0 ? Math.PI : 0 });
    }
  }
  // fuul cart with copper pot and umbrella
  { const x = -227.4, z = 258.5; B.wood.box(x, y0 + 0.75, z, 0.9, 0.7, 1.7, '#7a4b2a'); B.metal.add(prim('cyl', 0.34, 0.26, 0.55, 14), x, y0 + 1.38, z + 0.3, 0, 0, 0, 1, 1, 1, '#b87333'); for (const s of [-1, 1]) B.metal.add(prim('cyl', 0.32, 0.32, 0.06, 12), x + s * 0.48, y0 + 0.33, z - 0.3, 0, 0, Math.PI / 2, 1, 1, 1, '#2a2a2a'); B.metal.box(x, y0 + 1.6, z, 0.04, 2.0, 0.04, '#777'); B.prop.add(prim('cone', 1.25, 0.45, 12), x, y0 + 2.7, z, 0, 0, 0, 1, 1, 1, '#d62828'); city.addCircle(x, z, 0.8, y0 + 1.6); }
  // kiosk
  { const x = -227.7, z = 224; B.prop.box(x, y0 + 1.2, z, 1.6, 2.4, 2.2, '#1f5f9e'); B.prop.box(x + 0.81, y0 + 1.0, z, 0.04, 1.5, 1.9, '#d8e6f2'); B.prop.box(x, y0 + 2.45, z, 2.0, 0.1, 2.6, '#f2f2f2'); ATLAS.quad(ATLAS.cell('كشك النور', 'KIOSK', '#f2f2f2', '#1f5f9e'), x + 0.83, y0 + 2.0, z, 1, 0, 1.9, 0.5); city.addBox(x - 0.8, z - 1.1, x + 0.8, z + 1.1, y0 + 2.5); city.door(x + 1.4, z, 'nkiosk', 'nkiosk', 'El Nour Kiosk: drinks & snacks', { r: 2.2 }); }
  // gun shop sign + door in Mercado (outside this district)
  { const cand = (city.bldList || []).filter((q) => Math.abs(q.x0 + 350) < 1.5 && q.z0 > -312 && q.z1 < -188 && q.kind !== 'egypt' && q.z1 - q.z0 > 9).sort((a, b) => Math.abs((a.z0 + a.z1) / 2 + 250) - Math.abs((b.z0 + b.z1) / 2 + 250));
    const q = cand[0]; if (q) { const zc = (q.z0 + q.z1) / 2; Object.assign(L.POI.gunshop, { x: q.x0 - 2.4, z: zc }); city.door(q.x0 - 2.4, zc, 'gunshop', 'gunshop', 'Ironclad Arms: weapons, ammo & armour', { r: 2.8 }); ATLAS.quad(ATLAS.cell('آيرونكلاد للأسلحة', 'IRONCLAD ARMS', '#141414', '#ff8c42'), q.x0 - 0.2, y0 + 4.7, zc, -1, 0, Math.min(6.5, q.z1 - q.z0 - 1), 1.3); }
    else { const p = L.POI.gunshop; city.door(p.x, p.z, 'gunshop', 'gunshop', 'Ironclad Arms: weapons, ammo & armour', { r: 2.8 }); } }
  // bunting and lanterns across the district's inner streets
  const strings = [];
  for (let z = 120; z <= 220; z += 14) strings.push([[-370.2, z], [-349.8, z]]);
  for (let z = 260; z <= 360; z += 14) strings.push([[-370.2, z], [-349.8, z]]);
  for (let x = -480; x <= -380; x += 14) strings.push([[x, 229.8], [x, 250.2]]);
  for (let x = -340; x <= -240; x += 14) strings.push([[x, 229.8], [x, 250.2]]);
  const flagCols = [[0.85, 0.12, 0.15], [0.98, 0.98, 0.98], [0.12, 0.55, 0.3], [0.98, 0.78, 0.1], [0.15, 0.35, 0.75]], P = FLAGS.pos, C = FLAGS.col;
  let si = 0;
  for (const [[ax, az], [bx, bz]] of strings) {
    const span = Math.hypot(bx - ax, bz - az), n = Math.floor(span / 0.55), y = 8.2 + (si % 3) * 0.6, sag = 1.3; const lights = si % 2 === 1; si++;
    const dx = (bx - ax) / span, dz = (bz - az) / span;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.8) / n, yy = (t) => y - sag * 4 * t * (1 - t);
      const p0 = [ax + (bx - ax) * t0, yy(t0), az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, yy(t1), az + (bz - az) * t1], pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.42, (p0[2] + p1[2]) / 2];
      if (lights) { if (i % 2 === 0) B.bulb.add(prim('sphere', 0.07, 6, 4), pm[0], pm[1] + 0.3, pm[2]); continue; }
      const c = flagCols[(i + si) % flagCols.length]; P.push(...p0, ...p1, ...pm); C.push(...c, ...c, ...c);
    }
    if (lights) { // a fanous (lantern) in the middle of lit strings
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = y - sag - 0.6;
      B.metal.add(prim('cyl', 0.28, 0.2, 0.7, 8), mx, my, mz, 0, 0, 0, 1, 1, 1, '#b08d57'); B.metal.add(prim('cone', 0.3, 0.35, 8), mx, my + 0.52, mz, 0, 0, 0, 1, 1, 1, '#b08d57');
      B.neon.add(prim('cyl', 0.22, 0.16, 0.55, 8), mx, my, mz, 0, 0, 0, 1, 1, 1, ['#ff9f1c', '#e71d36', '#2ec4b6', '#ffbf69'][si % 4]);
    }
    void dx; void dz;
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); fg.computeVertexNormals();
  const flags = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 })); flags.name = 'nour_bunting'; city.group.add(flags);
  const signs = ATLAS.mesh(); city.group.add(signs); city.nourSignMat = signs.material;
}
