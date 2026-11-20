// GeoBuilder: merges many primitives into one BufferGeometry (one draw call)
// with optional vertex colours, world-unit UVs and rigid skin weights.
import { hexToRgb } from './util.js';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function toRGB(c) { if (!c) return [1, 1, 1]; if (typeof c === 'string') return hexToRgb(c); if (c.isColor) return [c.r, c.g, c.b]; return c; }

export class GeoBuilder {
  constructor(opts = {}) {
    this.skin = !!opts.skin;
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.si = []; this.sw = [];
    this.count = 0;
  }
  get empty() { return this.count === 0; }
  // Add an existing BufferGeometry transformed by matrix
  addGeometry(geo, matrix, color, bone = 0, uvMode) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    const rgb = toRGB(color);
    const base = this.count;
    _n.getNormalMatrix(matrix);
    const cAttr = geo.attributes.color;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (N) { _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); this.nor.push(_v.x, _v.y, _v.z); } else this.nor.push(0, 1, 0);
      if (U && !uvMode) this.uv.push(U.getX(i), U.getY(i)); else this.uv.push(0, 0);
      if (cAttr) this.col.push(cAttr.getX(i) * rgb[0], cAttr.getY(i) * rgb[1], cAttr.getZ(i) * rgb[2]);
      else this.col.push(rgb[0], rgb[1], rgb[2]);
      if (this.skin) { this.si.push(bone, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    }
    if (geo.index) { const I = geo.index; for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i)); }
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    this.count += P.count;
    return this;
  }
  // Primitive with transform given as position/rotation/scale
  add(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color, bone = 0) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    return this.addGeometry(geo, _m, color, bone);
  }
  // Axis-aligned box (optionally rotated about Y around its centre) with world-unit UVs.
  // faces: string containing any of 'px nx py ny pz nz'
  box(cx, cy, cz, sx, sy, sz, color, o = {}) {
    const faces = o.faces || 'px nx py ny pz nz';
    const us = o.u || 4, vs = o.v || 4, rot = o.rotY || 0, yBase = o.yBase ?? 0;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    const rgb = toRGB(color);
    const T = (lx, ly, lz) => [cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c];
    const R = (nx, ny, nz) => [nx * c + nz * s, ny, -nx * s + nz * c];
    const quad = (a, b, cc, d, n, uvs) => {
      const base = this.count;
      for (const [k, p] of [a, b, cc, d].entries()) {
        const w = T(...p); this.pos.push(w[0], w[1], w[2]);
        const nn = R(...n); this.nor.push(nn[0], nn[1], nn[2]);
        this.uv.push(uvs[k][0], uvs[k][1]);
        this.col.push(rgb[0], rgb[1], rgb[2]);
        if (this.skin) { this.si.push(o.bone || 0, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.count += 4;
    };
    const y0 = cy - hy - yBase, y1 = cy + hy - yBase;
    const vy0 = y0 / vs, vy1 = y1 / vs;
    const uo = o.uOff || 0;
    if (faces.includes('pz')) quad([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1], [[uo, vy0], [uo + sx / us, vy0], [uo + sx / us, vy1], [uo, vy1]]);
    if (faces.includes('nz')) quad([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1], [[uo, vy0], [uo + sx / us, vy0], [uo + sx / us, vy1], [uo, vy1]]);
    if (faces.includes('px')) quad([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0], [[uo, vy0], [uo + sz / us, vy0], [uo + sz / us, vy1], [uo, vy1]]);
    if (faces.includes('nx')) quad([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0], [[uo, vy0], [uo + sz / us, vy0], [uo + sz / us, vy1], [uo, vy1]]);
    const ts = o.top || us;
    if (faces.includes('py')) quad([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0], [[(cx - hx) / ts, -(cz + hz) / ts], [(cx + hx) / ts, -(cz + hz) / ts], [(cx + hx) / ts, -(cz - hz) / ts], [(cx - hx) / ts, -(cz - hz) / ts]]);
    if (faces.includes('ny')) quad([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    return this;
  }
  // Flat quad on XZ plane (for roads, decals); uv tiles along length
  groundQuad(x0, z0, x1, z1, x2, z2, x3, z3, y, color, uvs) {
    const rgb = toRGB(color); const base = this.count;
    const P = [[x0, z0], [x1, z1], [x2, z2], [x3, z3]];
    for (let k = 0; k < 4; k++) {
      this.pos.push(P[k][0], typeof y === 'number' ? y : y[k], P[k][1]); this.nor.push(0, 1, 0);
      this.uv.push(uvs[k][0], uvs[k][1]); this.col.push(rgb[0], rgb[1], rgb[2]);
      if (this.skin) { this.si.push(0, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    }
    // auto-correct winding so the quad always faces +Y
    const cr = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
    if (cr < 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    this.count += 4;
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.skin) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, opts = {}) {
    const m = new THREE.Mesh(this.build(), material);
    m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
    m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }
}

// Shared primitive cache
const cache = new Map();
export function prim(kind, ...a) {
  const k = kind + a.join(',');
  if (cache.has(k)) return cache.get(k);
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(...a); break;
    case 'sphere': g = new THREE.SphereGeometry(...a); break;
    case 'cyl': g = new THREE.CylinderGeometry(...a); break;
    case 'cone': g = new THREE.ConeGeometry(...a); break;
    case 'capsule': g = new THREE.CapsuleGeometry(...a); break;
    case 'torus': g = new THREE.TorusGeometry(...a); break;
    case 'circle': g = new THREE.CircleGeometry(...a); break;
    case 'plane': g = new THREE.PlaneGeometry(...a); break;
    case 'ico': g = new THREE.IcosahedronGeometry(...a); break;
    default: throw new Error('prim ' + kind);
  }
  cache.set(k, g); return g;
}
