// Shared math helpers, seeded random, small data structures.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleDiff = (a, b) => wrapAngle(b - a);
export const dampAngle = (a, b, rate, dt) => a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
export const sign = (v) => (v < 0 ? -1 : 1);

// Mulberry32 seeded PRNG
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}
export const R = rng(Date.now() & 0xffffffff);

// Value noise for terrain
function hash2(x, z) { let h = x * 374761393 + z * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, z, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }

export function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
export function rgbToHex(r, g, b) { const c = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
export function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
export function shadeHex(a, f) { const A = hexToRgb(a); return rgbToHex(A[0] * f, A[1] * f, A[2] * f); }

export function fmtMoney(n) { const s = Math.round(Math.abs(n)).toLocaleString('en-US'); return (n < 0 ? '-$' : '$') + s; }
export function fmtTime(h) { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }

// Tiny event bus
export class Bus {
  constructor() { this.m = new Map(); }
  on(e, f) { if (!this.m.has(e)) this.m.set(e, new Set()); this.m.get(e).add(f); return () => this.m.get(e).delete(f); }
  emit(e, ...a) { const s = this.m.get(e); if (s) for (const f of [...s]) { try { f(...a); } catch (err) { console.error('[bus]', e, err); } } }
}
export const bus = new Bus();

// Uniform spatial hash for static colliders and dynamic actors
export class SpatialGrid {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  insertBox(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const k = this.key(ix, iz); let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); } a.push(item);
      }
  }
  query(minX, minZ, maxX, maxZ, out = [], stamp) {
    const c = this.cell; out.length = 0;
    const s = stamp ?? (this._stamp = (this._stamp || 0) + 1);
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const a = this.map.get(this.key(ix, iz)); if (!a) continue;
        for (const it of a) { if (it._q !== s) { it._q = s; out.push(it); } }
      }
    return out;
  }
}

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
