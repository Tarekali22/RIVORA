// Procedural San Aurelia: terrain, roads, signals, buildings, coast, port, airport, hillside, props.
// Also owns static collision (building boxes, prop circles, walkable decks) and surface queries.
import { GeoBuilder, prim } from '../core/geo.js';
import { rng, clamp, smoothstep, SpatialGrid, lerp, mixHex, shadeHex, fbm } from '../core/util.js';
import * as L from './layout.js';
import * as T from './textures.js';

const { AVE_X, ST_Z, ROAD_HALF, nodes, edges, blocks, terrainHeight, POI } = L;

export class City {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    this.group = new THREE.Group(); this.group.name = 'city'; scene.add(this.group);
    this.boxes = []; this.circles = []; this.decks = [];
    this.grid = new SpatialGrid(32);
    this.nightMats = []; this.wetMats = []; this.signs = [];
    this.interactPoints = []; // {x,z,y,r,kind,id,label}
    this.lamps = []; this.signalHeads = []; this.cams = [];
    this.r = rng(1337);
    this.treesAt = []; this.palmsAt = []; this.pinesAt = []; this.benches = []; this.seats = []; this.containerStacks = []; this.parkingSpots = []; this.terraceTables = []; this.pools = []; this.beachSpots = [];
    this._mats();
    this.buildTerrain();
    this.buildRoads();
    this.buildBlocks();
    this.buildBuildings();
    this.buildCoast();
    this.buildPort();
    this.buildAirport();
    this.buildHillside();
    this.buildProps();
    this.buildSignals();
    this.finishBuilders();
  }

  // ---------------- materials ----------------
  _mats() {
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      ground: std({ map: T.terrainTex(), vertexColors: true, roughness: 0.96 }),
      road: std({ map: T.asphaltTex(true), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      asphalt: std({ map: T.asphaltTex(false), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      cross: std({ map: T.crosswalkTex(), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4, depthWrite: false }),
      sidewalk: std({ map: T.sidewalkTex(), vertexColors: true, roughness: 0.92 }),
      sand: std({ map: T.sandTex(), vertexColors: true, roughness: 1 }),
      grass: std({ map: T.grassTex(), vertexColors: true, roughness: 1 }),
      wood: std({ map: T.woodTex(), vertexColors: true, roughness: 0.85 }),
      roof: std({ map: T.roofTex(), vertexColors: true, roughness: 0.95 }),
      prop: std({ vertexColors: true, roughness: 0.65, metalness: 0.15 }),
      metal: std({ vertexColors: true, roughness: 0.35, metalness: 0.75 }),
      glass: std({ color: 0x9ec6d6, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 }),
      pool: std({ color: 0x2fb7d6, roughness: 0.05, metalness: 0.2, emissive: 0x0a3a48, emissiveIntensity: 0.4 }),
      neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }),
    };
    this.wetMats.push(this.M.road, this.M.asphalt, this.M.sidewalk);
    this.F = {};
    for (const k of ['glass', 'office', 'stucco', 'brick', 'industrial', 'hotel']) {
      const t = T.facade(k, k.length * 7);
      this.F[k] = std({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: k === 'glass' ? 0.18 : 0.82, metalness: k === 'glass' ? 0.55 : 0.02 });
      this.nightMats.push(this.F[k]);
    }
    const sf = T.shopfront(3);
    this.F.shop = std({ map: sf.map, emissiveMap: sf.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.6 });
    this.nightMats.push(this.F.shop);
    this.B = {}; // builders per material
    for (const k of [...Object.keys(this.M), ...Object.keys(this.F).map((k) => 'F_' + k)]) this.B[k] = new GeoBuilder();
  }
  finishBuilders() {
    for (const [k, b] of Object.entries(this.B)) {
      if (b.empty) continue;
      const mat = k.startsWith('F_') ? this.F[k.slice(2)] : this.M[k];
      const cast = !['road', 'asphalt', 'cross', 'ground', 'sand', 'grass', 'sidewalk', 'pool', 'neon', 'bulb'].includes(k);
      const m = b.mesh(mat, { cast, receive: true });
      m.name = 'city_' + k; this.group.add(m);
    }
  }

  // ---------------- collision ----------------
  addBox(x0, z0, x1, z1, top, y0 = -50, tag) {
    const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, y0, tag };
    this.boxes.push(b); this.grid.insertBox(b, b.x0, b.z0, b.x1, b.z1); return b;
  }
  addCircle(x, z, r, top = 6) { const c = { x, z, r, top, circle: true }; this.circles.push(c); this.grid.insertBox(c, x - r, z - r, x + r, z + r); }
  addDeck(x0, z0, x1, z1, y, tag) { const d = { x0, z0, x1, z1, y, deck: true, tag }; this.decks.push(d); this.grid.insertBox(d, x0, z0, x1, z1); return d; }

  // Highest walkable surface under (x,z) that is not above y+step
  surfaceHeight(x, z, y = 1e9, step = 0.6) {
    let h = terrainHeight(x, z);
    if (h > -0.01 && L.insideBlockSlab(x, z)) h = Math.max(h, L.SIDEWALK_H);
    const items = this.grid.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1, this._qa || (this._qa = []));
    for (const it of items) {
      if (it.circle) continue;
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      const top = it.deck ? it.y : it.top;
      if (top <= y + step && top > h) h = top;
    }
    return h;
  }
  // Push a circle out of static colliders. Returns true if it collided.
  collideCircle(p, r, y, height = 1.8) {
    const items = this.grid.query(p.x - r, p.z - r, p.x + r, p.z + r, this._qb || (this._qb = []));
    let hit = false;
    for (const it of items) {
      if (it.deck) continue;
      if (it.circle) {
        if (y > it.top) continue;
        const dx = p.x - it.x, dz = p.z - it.z, d = Math.hypot(dx, dz), m = r + it.r;
        if (d < m && d > 1e-6) { p.x = it.x + dx / d * m; p.z = it.z + dz / d * m; hit = true; }
        continue;
      }
      if (y >= it.top - 0.35 || y + height < it.y0) continue;
      const cx = clamp(p.x, it.x0, it.x1), cz = clamp(p.z, it.z0, it.z1);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
        else { // centre inside box: push out along the shallowest axis
          const ex = [p.x - it.x0, it.x1 - p.x, p.z - it.z0, it.z1 - p.z]; const m = Math.min(...ex);
          if (m === ex[0]) p.x = it.x0 - r; else if (m === ex[1]) p.x = it.x1 + r; else if (m === ex[2]) p.z = it.z0 - r; else p.z = it.z1 + r;
        }
        hit = true; p.hitBox = it;
      }
    }
    return hit;
  }
  // Line of sight / camera occlusion: first blocking fraction along segment (1 = clear)
  segmentClear(ax, ay, az, bx, by, bz, stepLen = 1.5) {
    const len = Math.hypot(bx - ax, by - ay, bz - az); const n = Math.max(2, Math.ceil(len / stepLen));
    const items = this.grid.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this._qc || (this._qc = []));
    const boxes = items.filter((it) => !it.circle && !it.deck);
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < terrainHeight(x, z) - 0.2) return (i - 1) / n;
      for (const b of boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.top && y > b.y0) return (i - 1) / n;
    }
    return 1;
  }

  // ---------------- terrain ----------------
  buildTerrain() {
    const x0 = -1500, x1 = 760, z0 = -720, z1 = 1250, step = this.q.level >= 2 ? 8 : 12;
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const P = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(P.count * 3);
    const C = { grass: [0.42, 0.55, 0.28], dry: [0.62, 0.58, 0.38], rock: [0.5, 0.46, 0.42], sand: [0.9, 0.82, 0.62], wetsand: [0.68, 0.6, 0.45], city: [0.55, 0.53, 0.5], seabed: [0.6, 0.55, 0.42], dirt: [0.5, 0.4, 0.3] };
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i); const h = terrainHeight(x, z); P.setY(i, h);
      uv.setXY(i, x / 6, z / 6);
      let c;
      const dx = terrainHeight(x + 2, z) - h, dz = terrainHeight(x, z + 2) - h, slope = Math.hypot(dx, dz) / 2;
      if (x > 500 && z > -660) c = h < -0.7 ? (h < -1.4 ? C.seabed : C.wetsand) : C.sand;
      else if (z < -660) c = C.seabed;
      else if (x < -520 || z > 800) { const n = fbm(x * 0.02, z * 0.02, 3); c = slope > 0.5 ? C.rock : n > 0.55 ? C.dry : C.grass; if (slope > 0.3 && slope <= 0.5) c = C.dirt; }
      else if (z > 540) c = C.dry; else c = C.city;
      const v = 0.9 + fbm(x * 0.05, z * 0.05, 2) * 0.2;
      col[i * 3] = c[0] * v; col[i * 3 + 1] = c[1] * v; col[i * 3 + 2] = c[2] * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.M.ground); m.receiveShadow = true; m.name = 'terrain'; this.group.add(m);
  }

  // ---------------- roads ----------------
  buildRoads() {
    const B = this.B;
    for (const e of edges) {
      const A = nodes[e.a], Bn = nodes[e.b];
      const ix = e.axis === 'ew';
      // shorten to stop at intersection squares
      const trimA = A.edges.length >= 2 ? ROAD_HALF : 0, trimB = Bn.edges.length >= 2 ? ROAD_HALF : 0;
      const len = e.len - trimA - trimB; if (len <= 0) continue;
      const nx = -e.dz, nz = e.dx; // right vector
      const segs = e.hill ? Math.ceil(len / 6) : 1;
      for (let s = 0; s < segs; s++) {
        const t0 = trimA + len * s / segs, t1 = trimA + len * (s + 1) / segs;
        const ax = A.x + e.dx * t0, az = A.z + e.dz * t0, bx = A.x + e.dx * t1, bz = A.z + e.dz * t1;
        const ya = L.roadY(ax, az) + 0.03, yb = L.roadY(bx, bz) + 0.03;
        const h = ROAD_HALF;
        B.road.groundQuad(ax - nx * h, az - nz * h, ax + nx * h, az + nz * h, bx + nx * h, bz + nz * h, bx - nx * h, bz - nz * h, [ya, ya, yb, yb], 0xffffff,
          [[0, t0 / 12], [1, t0 / 12], [1, t1 / 12], [0, t1 / 12]]);
      }
      // stop lines + crosswalks at lit intersections
      for (const [N, sgn, tt] of [[A, 1, trimA], [Bn, -1, e.len - trimB]]) {
        if (!N.light) continue;
        const cx = A.x + e.dx * tt, cz = A.z + e.dz * tt;
        // crosswalk band 3 m wide just outside the box
        const c0 = tt + sgn * 0.3, c1 = tt + sgn * 3.3;
        const p0x = A.x + e.dx * c0, p0z = A.z + e.dz * c0, p1x = A.x + e.dx * c1, p1z = A.z + e.dz * c1;
        const y = 0.05;
        B.cross.groundQuad(p0x - nx * ROAD_HALF, p0z - nz * ROAD_HALF, p0x + nx * ROAD_HALF, p0z + nz * ROAD_HALF, p1x + nx * ROAD_HALF, p1z + nz * ROAD_HALF, p1x - nx * ROAD_HALF, p1z - nz * ROAD_HALF, y, 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        // stop line on the incoming lane (right side of travel towards N)
        const s0 = tt + sgn * 3.6, s1 = tt + sgn * 4.1; const side = -sgn; // incoming lane is on the right of travel dir (-sgn*e)
        const q0x = A.x + e.dx * s0, q0z = A.z + e.dz * s0, q1x = A.x + e.dx * s1, q1z = A.z + e.dz * s1;
        const o0 = 0.2 * side, o1 = (ROAD_HALF - 0.6) * side;
        B.cross.groundQuad(q0x + nx * o0, q0z + nz * o0, q0x + nx * o1, q0z + nz * o1, q1x + nx * o1, q1z + nz * o1, q1x + nx * o0, q1z + nz * o0, y, 0xffffff, [[0.04, 0.5], [0.06, 0.5], [0.06, 0.52], [0.04, 0.52]]);
      }
    }
    for (const n of nodes) {
      if (n.edges.length < 2) continue;
      const h = ROAD_HALF, y = n.y + 0.035;
      B.asphalt.groundQuad(n.x - h, n.z - h, n.x + h, n.z - h, n.x + h, n.z + h, n.x - h, n.z + h, y, 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    // Hill road: retaining shoulders so the ramp reads as a built road
    const hillE = edges.filter((e) => e.hill);
    for (const e of hillE) {
      const A = nodes[e.a];
      for (let t = 0; t < e.len; t += 12) {
        const x = A.x + e.dx * t, z = A.z + e.dz * t, y = L.roadY(x, z);
        for (const s of [-1, 1]) { this.B.prop.box(x, y + 0.4, z + s * (ROAD_HALF + 0.3), 12, 0.8, 0.5, '#bdb6a8'); }
      }
    }
  }

  // ---------------- blocks / sidewalks ----------------
  buildBlocks() {
    const H = L.SIDEWALK_H;
    for (const b of blocks) {
      // sidewalk ring = full slab; lot interior gets district ground on top
      this.B.sidewalk.box(b.cx, H / 2, b.cz, b.x1 - b.x0, H, b.z1 - b.z0, '#ffffff', { faces: 'py px nx pz nz', u: 4, v: 4, top: 4 });
      const lotCol = b.district === 'residential' || b.district === 'boardwalk' ? 'grass' : null;
      if (lotCol && b.district === 'residential') this.B.grass.box(b.cx, H + 0.01, b.cz, b.lx1 - b.lx0, 0.02, b.lz1 - b.lz0, '#ffffff', { faces: 'py', top: 6 });
    }
    // boardwalk deck east of Ocean Boulevard
    const bx0 = 486, bx1 = 506;
    this.B.wood.box((bx0 + bx1) / 2, 0.15, -30, bx1 - bx0, 0.3, 1100, '#e9d9c4', { faces: 'py px nx pz nz', u: 3, top: 2 });
    this.addDeck(bx0, -580, bx1, 520, 0.3, 'boardwalk');
  }

  // ---------------- buildings ----------------
  building(x0, z0, x1, z1, h, kind, tint = '#ffffff', o = {}) {
    const B = this.B, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0, y0 = o.y0 || L.SIDEWALK_H;
    const fb = B['F_' + kind];
    fb.box(cx, y0 + h / 2, cz, sx, h, sz, tint, { faces: 'px nx pz nz', u: 8, v: 7, yBase: y0, uOff: Math.floor(this.r() * 4) * 0.5 });
    if (o.roof === 'hip') {
      const rh = o.roofH || Math.min(sx, sz) * 0.28;
      B.prop.add(prim('cone', 0.7071, 1, 4, 1), cx, y0 + h + rh / 2, cz, 0, Math.PI / 4, 0, sx * 1.08, rh, sz * 1.08, o.roofCol || '#b65a3a');
    } else {
      B.roof.box(cx, y0 + h + 0.05, cz, sx, 0.1, sz, '#ffffff', { faces: 'py', top: 8 });
      if (!o.noParapet && h > 6) { // parapet
        const pc = shadeHex(tint === '#ffffff' ? '#d8d4cc' : tint, 0.9);
        B.prop.box(cx, y0 + h + 0.45, z0 + 0.2, sx, 0.9, 0.4, pc); B.prop.box(cx, y0 + h + 0.45, z1 - 0.2, sx, 0.9, 0.4, pc);
        B.prop.box(x0 + 0.2, y0 + h + 0.45, cz, 0.4, 0.9, sz, pc); B.prop.box(x1 - 0.2, y0 + h + 0.45, cz, 0.4, 0.9, sz, pc);
      }
      if (!o.clean && h > 8) { const n = Math.floor(this.r() * 4); for (let i = 0; i < n; i++) { const w = 2 + this.r() * 3; B.prop.box(lerp(x0 + 3, x1 - 3, this.r()), y0 + h + 0.8, lerp(z0 + 3, z1 - 3, this.r()), w, 1.6, w * 0.7, '#a7a9a8'); } }
    }
    if (o.shop) for (const side of o.shop) this.shopfront(x0, z0, x1, z1, side, y0);
    if (!o.noCollide) this.addBox(x0, z0, x1, z1, y0 + h, -50, o.tag);
    return { x0, z0, x1, z1, top: y0 + h };
  }
  shopfront(x0, z0, x1, z1, side, y0) {
    const d = 0.12, h = 4.2, B = this.B.F_shop, y = y0 + h / 2, o = { u: 8, v: 4, yBase: y0 };
    if (side === 'n') B.box((x0 + x1) / 2, y, z0 - d / 2, x1 - x0, h, d, '#ffffff', { ...o, faces: 'nz' });
    if (side === 's') B.box((x0 + x1) / 2, y, z1 + d / 2, x1 - x0, h, d, '#ffffff', { ...o, faces: 'pz' });
    if (side === 'w') B.box(x0 - d / 2, y, (z0 + z1) / 2, d, h, z1 - z0, '#ffffff', { ...o, faces: 'nx' });
    if (side === 'e') B.box(x1 + d / 2, y, (z0 + z1) / 2, d, h, z1 - z0, '#ffffff', { ...o, faces: 'px' });
  }
  sign(text, x, y, z, rotY, w = 8, h = 1.6, o = {}) {
    const t = T.signTex(text, { bg: o.bg || '#13232c', fg: o.fg || '#ffe9c7', border: o.border, glow: o.glow, size: o.size || 66, w: 512, h: Math.round(512 * h / w) });
    const mat = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: o.neon ? 1.2 : 0.15, roughness: 0.5 });
    const m = new THREE.Mesh(prim('plane', 1, 1), mat); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = rotY;
    m.matrixAutoUpdate = false; m.updateMatrix(); this.group.add(m);
    this.signs.push({ mat, neon: !!o.neon });
    return m;
  }
  // Facing helpers: front face outward normal heading for door/sign placement
  frontSign(bld, side, text, o = {}) {
    const y = (o.y ?? 5.4), w = o.w || Math.min(12, (side === 'n' || side === 's' ? bld.x1 - bld.x0 : bld.z1 - bld.z0) * 0.7), cx = (bld.x0 + bld.x1) / 2, cz = (bld.z0 + bld.z1) / 2, off = 0.2;
    if (side === 'n') return this.sign(text, cx, y, bld.z0 - off, Math.PI, w, o.h || 1.6, o);
    if (side === 's') return this.sign(text, cx, y, bld.z1 + off, 0, w, o.h || 1.6, o);
    if (side === 'w') return this.sign(text, bld.x0 - off, y, cz, -Math.PI / 2, w, o.h || 1.6, o);
    if (side === 'e') return this.sign(text, bld.x1 + off, y, cz, Math.PI / 2, w, o.h || 1.6, o);
  }
  door(x, z, kind, id, label, o = {}) { this.interactPoints.push({ x, z, y: o.y ?? 0.15, r: o.r || 2.2, kind, id, label }); }

  buildBuildings() {
    const r = this.r;
    const special = new Set(['2,6', '2,5', '6,4', '1,3', '0,3', '0,4', '1,4', '3,2', '4,6', '5,5', '1,0', '4,3', '3,6']);
    const stucco = ['#f3e6d3', '#f6d7c3', '#e9d8b8', '#f2efe6', '#e8c9a8', '#d9e4e0', '#f0d5c2', '#e6e0f0'];
    for (const b of blocks) {
      const key = b.i + ',' + b.j;
      this.specialLot(b, key);
      if (special.has(key)) continue;
      const d = b.district;
      if (d === 'downtown') this.lotDowntown(b);
      else if (d === 'commercial' || d === 'nightlife') this.lotCommercial(b, d === 'nightlife');
      else if (d === 'residential') (r() < 0.5 ? this.lotApartments(b, stucco) : this.lotHouses(b, stucco));
      else if (d === 'industrial') this.lotIndustrial(b);
      else if (d === 'boardwalk') this.lotBoardwalk(b, stucco);
      else if (d === 'marina') this.lotMarina(b);
    }
  }
  lotDowntown(b) {
    const r = this.r, cxD = 60, czD = -120;
    const dist = Math.hypot(b.cx - cxD, b.cz - czD);
    const parcels = r() < 0.5 ? [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
    for (const [u0, v0, u1, v1] of parcels) {
      if (r() < 0.12) { this.plaza(lerp(b.lx0, b.lx1, u0), lerp(b.lz0, b.lz1, v0), lerp(b.lx0, b.lx1, u1), lerp(b.lz0, b.lz1, v1)); continue; }
      const x0 = lerp(b.lx0, b.lx1, u0) + 3, x1 = lerp(b.lx0, b.lx1, u1) - 3, z0 = lerp(b.lz0, b.lz1, v0) + 3, z1 = lerp(b.lz0, b.lz1, v1) - 3;
      const tall = 30 + (150 * Math.exp(-dist / 260)) * (0.45 + r() * 0.75);
      const kind = r() < 0.6 ? 'glass' : 'office';
      const tint = kind === 'glass' ? ['#ffffff', '#e0f0ff', '#d8e8e0', '#f0e8ff'][Math.floor(r() * 4)] : ['#ffffff', '#efe6da', '#dfe3e6'][Math.floor(r() * 3)];
      // podium + setback tower
      const podH = 10 + Math.floor(r() * 2) * 4;
      this.building(x0, z0, x1, z1, podH, 'office', '#e9e2d6', { shop: this.streetSides(b, x0, z0, x1, z1), clean: true });
      const inset = Math.min((x1 - x0), (z1 - z0)) * (0.1 + r() * 0.15);
      this.building(x0 + inset, z0 + inset, x1 - inset, z1 - inset, tall - podH, kind, tint, { y0: L.SIDEWALK_H + podH });
    }
  }
  streetSides(b, x0, z0, x1, z1) { const s = []; if (z0 - b.lz0 < 6) s.push('n'); if (b.lz1 - z1 < 6) s.push('s'); if (x0 - b.lx0 < 6) s.push('w'); if (b.lx1 - x1 < 6) s.push('e'); return s; }
  plaza(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.B.prop.box(cx, L.SIDEWALK_H + 0.02, cz, x1 - x0 - 2, 0.04, z1 - z0 - 2, '#d7cfc2', { faces: 'py' });
    this.B.prop.add(prim('cyl', 4, 4.4, 0.8, 24), cx, L.SIDEWALK_H + 0.4, cz, 0, 0, 0, 1, 1, 1, '#cfc7ba');
    this.B.pool.add(prim('cyl', 3.6, 3.6, 0.1, 24), cx, L.SIDEWALK_H + 0.75, cz);
    this.addCircle(cx, cz, 4.4, 0.9);
    this.treesAt.push([x0 + 6, z0 + 6], [x1 - 6, z0 + 6], [x0 + 6, z1 - 6], [x1 - 6, z1 - 6]);
    for (let k = 0; k < 4; k++) this.benches.push([cx + (k < 2 ? -8 : 8), cz + (k % 2 ? -3 : 3), k < 2 ? Math.PI / 2 : -Math.PI / 2]);
  }
  lotCommercial(b, neon) {
    const r = this.r, cols = ['#efe2cf', '#f2d0b8', '#d9c7b0', '#e7dcc8', '#c9d7d2', '#f0e4c8', '#b7a28f'];
    // perimeter rows along the four street sides
    const rows = [['n', b.lx0, b.lz0, b.lx1, b.lz0 + 24], ['s', b.lx0, b.lz1 - 24, b.lx1, b.lz1], ['w', b.lx0, b.lz0 + 26, b.lx0 + 22, b.lz1 - 26], ['e', b.lx1 - 22, b.lz0 + 26, b.lx1, b.lz1 - 26]];
    for (const [side, ax0, az0, ax1, az1] of rows) {
      const horiz = side === 'n' || side === 's'; const L0 = horiz ? ax0 : az0, L1 = horiz ? ax1 : az1;
      let p = L0;
      while (p < L1 - 8) {
        const w = Math.min(L1 - p, 14 + r() * 18); if (r() < 0.15) { p += w; continue; }
        const h = neon ? 8 + r() * 16 : 7 + r() * 15; const kind = r() < 0.35 ? 'brick' : 'stucco';
        const tint = kind === 'brick' ? mixHex('#ffffff', '#d8b8a8', r()) : cols[Math.floor(r() * cols.length)];
        const bl = horiz ? this.building(p + 0.5, az0, p + w - 0.5, az1, h, kind, tint, { shop: [side] }) : this.building(ax0, p + 0.5, ax1, p + w - 0.5, h, kind, tint, { shop: [side] });
        if (neon && r() < 0.7) { const names = ['LOUNGE', 'SUSHI', 'TACOS', 'KARAOKE', 'BAR 22', 'NOODLES', 'JAZZ', 'ARCADE', 'COCKTAILS', 'VINYL']; this.frontSign(bl, side, names[Math.floor(r() * names.length)], { neon: true, bg: '#0b0b14', fg: ['#ff5fa2', '#4ef0ff', '#ffd23f', '#9d7bff'][Math.floor(r() * 4)], glow: '#ff7ad9', y: 5.6, w: 6, h: 1.4 }); }
        p += w;
      }
    }
    // central parking lot
    this.B.asphalt.groundQuad(b.lx0 + 24, b.lz0 + 26, b.lx1 - 24, b.lz0 + 26, b.lx1 - 24, b.lz1 - 26, b.lx0 + 24, b.lz1 - 26, L.SIDEWALK_H + 0.02, 0xffffff, [[0, 0], [6, 0], [6, 6], [0, 6]]);
    this.parkingSpots.push({ x: b.cx, z: b.cz, w: b.lx1 - b.lx0 - 60, d: b.lz1 - b.lz0 - 60 });
  }
  lotApartments(b, stucco) {
    const r = this.r;
    const spots = [[b.lx0 + 4, b.lz0 + 4, b.lx0 + 50, b.lz0 + 34], [b.lx1 - 50, b.lz0 + 4, b.lx1 - 4, b.lz0 + 34], [b.lx0 + 4, b.lz1 - 34, b.lx0 + 50, b.lz1 - 4], [b.lx1 - 50, b.lz1 - 34, b.lx1 - 4, b.lz1 - 4]];
    for (const [x0, z0, x1, z1] of spots) {
      if (r() < 0.15) continue;
      const h = 10 + Math.floor(r() * 5) * 3.5; const kind = r() < 0.75 ? 'stucco' : r() < 0.5 ? 'brick' : 'hotel';
      this.building(x0, z0, x1, z1, h, kind, stucco[Math.floor(r() * stucco.length)], { shop: r() < 0.3 ? this.streetSides(b, x0, z0, x1, z1).slice(0, 1) : null });
      if (r() < 0.5) this.B.prop.add(prim('cyl', 1.4, 1.4, 2.4, 12), lerp(x0 + 4, x1 - 4, r()), L.SIDEWALK_H + h + 1.2, lerp(z0 + 4, z1 - 4, r()), 0, 0, 0, 1, 1, 1, '#8b6f55');
    }
    for (let k = 0; k < 6; k++) this.treesAt.push([lerp(b.lx0 + 56, b.lx1 - 56, r()), lerp(b.lz0 + 40, b.lz1 - 40, r())]);
    for (let k = 0; k < 2; k++) this.benches.push([b.cx + (k ? 6 : -6), b.cz, k ? -Math.PI / 2 : Math.PI / 2]);
  }
  lotHouses(b, stucco) {
    const r = this.r, nx = 4, nz = 3, cw = (b.lx1 - b.lx0) / nx, cd = (b.lz1 - b.lz0) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (j === 1 && (i === 1 || i === 2)) { this.treesAt.push([b.lx0 + cw * (i + 0.5), b.lz0 + cd * 1.5]); continue; }
      const x0 = b.lx0 + cw * i + 5, x1 = b.lx0 + cw * (i + 1) - 5, z0 = b.lz0 + cd * j + 7, z1 = b.lz0 + cd * (j + 1) - 7;
      const h = r() < 0.7 ? 3.6 : 7;
      const roofCol = ['#b65a3a', '#9a4b33', '#6b5b52', '#c06a46', '#5d6870'][Math.floor(r() * 5)];
      this.building(x0, z0, x1, z1, h, 'stucco', stucco[Math.floor(r() * stucco.length)], { roof: 'hip', roofCol, roofH: 2.6 });
      if (r() < 0.6) this.treesAt.push([x0 - 2.5, z0 - 3]);
      // low fence
      this.B.prop.box((x0 + x1) / 2, L.SIDEWALK_H + 0.45, z1 + 4.5, x1 - x0 + 8, 0.9, 0.12, '#f4f1ea');
    }
  }
  lotIndustrial(b) {
    const r = this.r;
    const w1 = this.building(b.lx0 + 4, b.lz0 + 6, b.lx0 + 64, b.lz0 + 54, 11 + r() * 5, 'industrial', mixHex('#ffffff', '#c8d0d8', r()), { clean: true });
    this.building(b.lx1 - 50, b.lz1 - 60, b.lx1 - 4, b.lz1 - 6, 9 + r() * 6, 'industrial', mixHex('#ffffff', '#d8cfc0', r()), { clean: true });
    // roll-up doors
    this.B.prop.box((w1.x0 + w1.x1) / 2, 2.6, w1.z1 + 0.1, 8, 5, 0.2, '#6d7378');
    this.containerStacks.push([b.lx0 + 76, b.lz0 + 70, 3, 2, 2]);
    this.B.asphalt.groundQuad(b.lx0, b.lz0, b.lx1, b.lz0, b.lx1, b.lz1, b.lx0, b.lz1, L.SIDEWALK_H + 0.015, 0xffffff, [[0, 0], [8, 0], [8, 8], [0, 8]]);
  }
  lotBoardwalk(b, stucco) {
    const r = this.r;
    if (b.j <= 3) { // tall hotels facing the ocean
      this.building(b.lx1 - 46, b.lz0 + 10, b.lx1 - 6, b.lz1 - 10, 28 + r() * 40, 'hotel', stucco[Math.floor(r() * stucco.length)], { shop: ['e'] });
      this.building(b.lx0 + 6, b.lz0 + 30, b.lx0 + 50, b.lz1 - 30, 14 + r() * 10, 'stucco', stucco[Math.floor(r() * stucco.length)]);
      this.pools.push([b.lx1 - 70, b.cz, 14, 30]);
    } else {
      for (let k = 0; k < 3; k++) {
        const z0 = b.lz0 + 6 + k * 38, z1 = z0 + 30;
        this.building(b.lx1 - 34, z0, b.lx1 - 4, z1, 9 + r() * 14, r() < 0.5 ? 'stucco' : 'hotel', stucco[Math.floor(r() * stucco.length)], { shop: ['e'] });
      }
      this.building(b.lx0 + 6, b.lz0 + 10, b.lx0 + 46, b.lz1 - 10, 12 + r() * 12, 'stucco', stucco[Math.floor(r() * stucco.length)]);
    }
    for (let k = 0; k < 5; k++) this.palmsAt.push([lerp(b.lx0 + 56, b.lx1 - 40, r()), lerp(b.lz0 + 10, b.lz1 - 10, r())]);
  }
  lotMarina(b) {
    const bl = this.building(b.lx0 + 10, b.lz0 + 6, b.lx0 + 60, b.lz0 + 40, 8, 'hotel', '#eaf2f4', { shop: ['n'] });
    this.frontSign(bl, 'n', 'BAYSIDE MARINA', { bg: '#0f3b57', fg: '#ffffff', y: 6.2 });
    this.building(b.lx1 - 50, b.lz1 - 50, b.lx1 - 6, b.lz1 - 10, 18, 'stucco', '#dfe9ea');
    for (let k = 0; k < 6; k++) this.palmsAt.push([b.lx0 + 70 + (k % 3) * 14, b.lz0 + 10 + Math.floor(k / 3) * 30]);
  }

  specialLot(b, key) {
    const S = L.SIDEWALK_H;
    switch (key) {
      case '2,6': { // Home: Laurel Apartments
        const bl = this.building(-190, 252, -110, 290, 21, 'stucco', '#f1dcc6', { tag: 'home' });
        this.frontSign(bl, 'n', 'LAUREL APARTMENTS', { bg: '#284b4a', y: 4.2, w: 10, h: 1.3 });
        this.B.prop.box(-150, 1.4 + S, 251.6, 2.4, 2.8, 0.3, '#5a3b2a'); // door
        this.door(-150, 248, 'home', 'safehouse', 'Enter home');
        this.building(-200, 310, -150, 362, 14, 'brick', '#ffffff'); this.building(-140, 315, -100, 362, 17.5, 'stucco', '#e8d6bd');
        this.treesAt.push([-200, 300], [-120, 300], [-170, 300]);
        break;
      }
      case '2,5': { // Quik Corner + apartments
        const bl = this.building(-170, 112, -130, 135, 6, 'stucco', '#f3efe6', { shop: ['n'], tag: 'store' });
        this.frontSign(bl, 'n', 'QUIK CORNER', { bg: '#c0392b', fg: '#ffffff', y: 5.1, w: 9, h: 1.2 });
        this.door(-150, 108, 'store', 'store', 'Enter Quik Corner');
        this.building(-205, 150, -150, 225, 17.5, 'stucco', '#e9d8b8'); this.building(-140, 160, -95, 225, 14, 'brick', '#ffffff');
        break;
      }
      case '6,4': { // Sol & Salt café + beach shops
        const bl = this.building(440, 15, 468, 45, 7, 'stucco', '#f6efe2', { shop: ['e'], tag: 'cafe', clean: true });
        this.frontSign(bl, 'e', 'SOL & SALT CAFÉ', { bg: '#f0e1c8', fg: '#7a3a1d', y: 5.6, w: 10, h: 1.3 });
        // awning + terrace
        this.B.prop.box(469.5, 3.4, 30, 3, 0.15, 26, '#d9643a');
        for (let k = 0; k < 3; k++) this.terraceTables.push([472.5, 20 + k * 9]);
        this.door(472, 30, 'cafe', 'cafe', 'Enter Sol & Salt Café');
        this.building(440, -26, 468, 8, 11, 'hotel', '#eef3f0', { shop: ['e'] });
        this.building(440, 52, 468, 86, 9, 'stucco', '#f6d7c3', { shop: ['e'] });
        this.building(356, -20, 410, 80, 24, 'hotel', '#f2efe6');
        break;
      }
      case '1,3': { // Ironbay Fitness
        const bl = this.building(-320, -168, -260, -130, 10, 'industrial', '#d8dde2', { shop: ['n'], tag: 'gym' });
        this.frontSign(bl, 'n', 'IRONBAY FITNESS', { bg: '#151a1f', fg: '#ff7a45', y: 6.5, w: 12, h: 1.5 });
        this.door(-290, -172, 'gym', 'gym', 'Enter Ironbay Fitness');
        this.building(-345, -120, -280, -56, 15, 'brick', '#ffffff', { shop: ['s'] }); this.building(-270, -120, -235, -56, 11, 'stucco', '#efe2cf', { shop: ['e', 's'] });
        break;
      }
      case '0,3': { // Thread & Co
        const bl = this.building(-455, -168, -405, -140, 8, 'stucco', '#f5efe8', { shop: ['n'], tag: 'clothes' });
        this.frontSign(bl, 'n', 'THREAD & CO', { bg: '#efe6dc', fg: '#1b1b1b', y: 6, w: 10, h: 1.3 });
        this.door(-430, -172, 'clothes', 'clothes', 'Enter Thread & Co');
        this.building(-488, -130, -430, -56, 12, 'brick', '#ffffff', { shop: ['w'] }); this.building(-420, -125, -372, -56, 16, 'stucco', '#e7dcc8', { shop: ['e'] });
        break;
      }
      case '0,4': { // Aurelia Motors showroom
        const x0 = -465, x1 = -395, z0 = -28, z1 = 10;
        this.B.prop.box((x0 + x1) / 2, 7.2, (z0 + z1) / 2, x1 - x0, 0.6, z1 - z0, '#e8e8e8');
        this.B.glass.box((x0 + x1) / 2, 3.65, (z0 + z1) / 2, x1 - x0 - 0.2, 6.8, z1 - z0 - 0.2, '#ffffff', { faces: 'px nx pz nz' });
        this.B.prop.box((x0 + x1) / 2, S + 0.05, (z0 + z1) / 2, x1 - x0 - 0.4, 0.1, z1 - z0 - 0.4, '#f2f2f0', { faces: 'py' });
        for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.B.prop.box(px, 3.7, pz, 0.5, 7, 0.5, '#d0d0d0');
        this.addBox(x0, z0, x1, z1, 7.5, -50, 'dealer');
        this.sign('AURELIA MOTORS', (x0 + x1) / 2, 8.6, z0 - 0.1, Math.PI, 16, 1.8, { bg: '#0d1b2a', fg: '#e0f2ff' });
        this.door(-430, -32, 'dealer', 'dealer', 'Enter Aurelia Motors');
        this.dealerDisplay = { x0, z0, x1, z1 };
        this.building(-488, 30, -420, 88, 12, 'office', '#ffffff', { shop: ['s', 'w'] });
        break;
      }
      case '1,4': { // Navarro Garage
        const bl = this.building(-320, -28, -260, 5, 8, 'industrial', '#e8e2d6', { tag: 'garage' });
        this.B.prop.box(-290, 2.4 + S, -28.2, 10, 4.8, 0.2, '#4e5a62');
        this.frontSign(bl, 'n', 'NAVARRO GARAGE', { bg: '#f2b134', fg: '#1d1d1d', y: 6.4, w: 11, h: 1.3 });
        this.door(-290, -32, 'garage', 'garage', 'Navarro Garage: repair & paint');
        this.building(-345, 30, -280, 88, 14, 'brick', '#ffffff', { shop: ['s'] }); this.building(-270, 20, -235, 88, 10, 'stucco', '#f0e4c8', { shop: ['e'] });
        break;
      }
      case '3,2': { // Central Police
        const bl = this.building(-40, -308, 20, -260, 14, 'office', '#e3e6ea', { tag: 'police' });
        this.frontSign(bl, 'n', 'CENTRAL POLICE', { bg: '#14254a', fg: '#ffffff', y: 6, w: 12, h: 1.5 });
        this.door(-10, -312, 'police', 'police', 'Central Police: pay fines');
        this.building(-65, -250, 45, -196, 32, 'glass', '#e0f0ff');
        this.B.asphalt.groundQuad(25, -308, 48, -308, 48, -262, 25, -262, S + 0.02, 0xffffff, [[0, 0], [2, 0], [2, 4], [0, 4]]);
        this.policeLot = { x: 36, z: -285 };
        break;
      }
      case '4,6': { // Hospital
        const bl = this.building(95, 252, 165, 300, 22, 'office', '#f4f6f6', { tag: 'hospital' });
        this.frontSign(bl, 'n', 'ST. AURELIA MEDICAL', { bg: '#ffffff', fg: '#c62828', y: 4.6, w: 14, h: 1.5 });
        this.sign('+', 130, 19, 251.7, Math.PI, 4, 4, { bg: '#ffffff', fg: '#d32f2f', size: 380 });
        this.door(130, 248, 'hospital', 'hospital', 'St. Aurelia Medical: treatment');
        this.building(80, 315, 185, 365, 12, 'stucco', '#e9eef0');
        break;
      }
      case '5,5': { // Pulse nightclub (Neon Row)
        const bl = this.building(245, 112, 295, 150, 12, 'brick', '#5a4a5a', { tag: 'club', clean: true });
        this.frontSign(bl, 'n', 'PULSE', { neon: true, bg: '#08060f', fg: '#ff4fd8', glow: '#ff4fd8', y: 8.2, w: 12, h: 3, size: 200 });
        this.B.neon.box(270, 4.6, 111.7, 18, 0.25, 0.1, '#4ef0ff'); this.B.neon.box(270, 0.6, 111.7, 18, 0.12, 0.1, '#ff4fd8');
        this.door(270, 108, 'club', 'club', 'Enter Pulse');
        this.building(215, 112, 238, 170, 16, 'stucco', '#3f4a5c', { shop: ['n'] }); this.building(302, 112, 328, 175, 20, 'brick', '#ffffff', { shop: ['n', 'e'] });
        this.building(215, 185, 328, 228, 26, 'glass', '#f0e8ff');
        break;
      }
      case '1,0': { // Pier 9 warehouse (mission)
        const bl = this.building(-330, -588, -250, -540, 12, 'industrial', '#c5ccd2', { tag: 'warehouse', clean: true });
        this.frontSign(bl, 'n', 'PIER 9', { bg: '#2d3a40', fg: '#f5d76e', y: 9.5, w: 8, h: 1.6 });
        this.B.prop.box(-290, 2.8 + S, -588.2, 12, 5.6, 0.25, '#58626a');
        this.containerStacks.push([-340, -520, 4, 2, 3], [-245, -500, 3, 3, 2]);
        this.warehouseYard = { x: -290, z: -565 };
        break;
      }
      case '4,3': { // Meridian Tower with rooftop helipad
        const bl = this.building(100, -140, 160, -80, 150, 'glass', '#d8ecff', { tag: 'tower', noParapet: true, clean: true });
        this.B.prop.add(prim('cyl', 13, 13, 0.4, 32), 130, 150.4, -110, 0, 0, 0, 1, 1, 1, '#3d4348');
        this.B.neon.add(prim('torus', 10, 0.18, 6, 48), 130, 150.65, -110, Math.PI / 2, 0, 0, 1, 1, 1, '#ffe066');
        this.B.prop.box(130, 150.62, -110, 6, 0.05, 1, '#ffffff'); this.B.prop.box(127, 150.62, -110, 0.8, 0.05, 6, '#ffffff'); this.B.prop.box(133, 150.62, -110, 0.8, 0.05, 6, '#ffffff');
        this.addDeck(117, -123, 143, -97, 150.6, 'helipad');
        this.sign('MERIDIAN TOWER', 130, 6, -140.3, Math.PI, 14, 1.6, { bg: '#0e2233', fg: '#cfe8ff' });
        this.door(130, -143, 'elevator', 'tower', 'Elevator to helipad');
        this.door(130, 150.7, 'elevator', 'towerTop', 'Elevator down', { y: 150.6, r: 3 }); this.interactPoints[this.interactPoints.length - 1].x = 141; this.interactPoints[this.interactPoints.length - 1].z = -101;
        this.plaza(75, -168, 185, -146);
        break;
      }
      case '3,6': { // Laurel Park
        this.B.grass.box(b.cx, S + 0.015, b.cz, b.lx1 - b.lx0, 0.02, b.lz1 - b.lz0, '#ffffff', { faces: 'py', top: 6 });
        this.B.prop.box(b.cx, S + 0.03, b.cz, 4, 0.02, b.lz1 - b.lz0, '#cdbfa8', { faces: 'py' });
        this.B.prop.box(b.cx, S + 0.03, b.cz, b.lx1 - b.lx0, 0.02, 4, '#cdbfa8', { faces: 'py' });
        // basketball court
        this.B.prop.box(b.cx + 30, S + 0.04, b.cz - 30, 26, 0.04, 15, '#3a6f8f', { faces: 'py' });
        for (const s of [-1, 1]) { this.B.prop.box(b.cx + 30 + s * 12.5, S + 1.7, b.cz - 30, 0.15, 3.4, 0.15, '#666'); this.B.prop.box(b.cx + 30 + s * 12, S + 3.2, b.cz - 30, 0.1, 1.0, 1.6, '#ffffff'); }
        for (let k = 0; k < 18; k++) this.treesAt.push([lerp(b.lx0 + 6, b.lx1 - 6, this.r()), lerp(b.lz0 + 6, b.lz1 - 6, this.r())]);
        for (let k = 0; k < 6; k++) this.benches.push([b.cx + (k < 3 ? -4 : 4), b.cz - 30 + (k % 3) * 25, k < 3 ? Math.PI / 2 : -Math.PI / 2]);
        this.parkSpots = { x: b.cx, z: b.cz };
        break;
      }
    }
  }

  // ---------------- coast: beach, pier, ferris wheel, marina ----------------
  buildCoast() {
    const r = this.r;
    // Beach props
    const umbCols = ['#e74c3c', '#f39c12', '#16a085', '#2980b9', '#f5f5f5', '#8e44ad'];
    for (let z = -540; z < 500; z += 18 + r() * 14) {
      if (Math.abs(z - 21) < 20 || Math.abs(z - 150) < 26) continue;
      const x = 520 + r() * 40; const c = umbCols[Math.floor(r() * umbCols.length)];
      this.B.prop.add(prim('cyl', 0.04, 0.04, 2.4, 6), x, 1.2, z, 0.1, 0, 0, 1, 1, 1, '#dddddd');
      this.B.prop.add(prim('cone', 1.4, 0.5, 10), x + 0.12, 2.5, z, 0.1, 0, 0, 1, 1, 1, c);
      this.B.prop.box(x + 1.5, 0.03, z + 0.6, 0.9, 0.04, 1.9, umbCols[Math.floor(r() * umbCols.length)]);
      this.beachSpots.push([x + 1.5, z + 0.6]);
    }
    // lifeguard towers
    for (const z of [-300, 80, 340]) {
      const x = 560;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.B.prop.box(x + dx * 1.1, 1.2, z + dz * 1.1, 0.15, 2.4, 0.15, '#f4f4f0');
      this.B.prop.box(x, 2.5, z, 2.8, 0.2, 2.8, '#f4f4f0'); this.B.prop.box(x, 3.6, z, 2.4, 2.0, 2.4, '#3aa6c9'); this.B.prop.add(prim('cone', 2.2, 0.8, 4), x, 5.0, z, 0, Math.PI / 4, 0, 1, 1, 1, '#e74c3c');
      this.addCircle(x, z, 1.8, 5.4);
    }
    // volleyball nets
    for (const z of [-200, 260]) { this.B.prop.box(540, 1.2, z - 4.5, 0.1, 2.4, 0.1, '#ddd'); this.B.prop.box(540, 1.2, z + 4.5, 0.1, 2.4, 0.1, '#ddd'); this.B.prop.box(540, 2.2, z, 0.04, 0.9, 9, '#f6f6f6'); }
    // Muscle Shore outdoor gym (fenced) around (528,150)
    const gx = 532, gz = 150;
    this.B.prop.box(gx, 0.02, gz, 26, 0.04, 22, '#c1b59a', { faces: 'py' });
    for (const [fx, fz, w, d] of [[gx, gz - 11, 26, 0.08], [gx, gz + 11, 26, 0.08], [gx + 13, gz, 0.08, 22]]) {
      const len = Math.max(w, d), along = w > d; const n = Math.round(len / 2.6);
      for (let k = 0; k <= n; k++) { const t = -len / 2 + k * len / n; this.B.metal.box(along ? fx + t : fx, 1.0, along ? fz : fz + t, 0.07, 2.0, 0.07, '#8f979c'); }
      for (const ry of [0.35, 1.0, 1.95]) this.B.metal.box(fx, ry, fz, along ? len : 0.04, 0.04, along ? 0.04 : len, '#9aa2a7');
    }
    this.addBox(gx - 13, gz - 11.1, gx + 13, gz - 10.9, 2, -5); this.addBox(gx - 13, gz + 10.9, gx + 13, gz + 11.1, 2, -5); this.addBox(gx + 12.9, gz - 11, gx + 13.1, gz + 11, 2, -5);
    this.sign('MUSCLE SHORE', gx - 13.2, 2.6, gz + 6, -Math.PI / 2, 6, 1.1, { bg: '#ff7a45', fg: '#1a1a1a' });
    this.gymEquip = [];
    const equip = (kind, x, z, rot, label) => { this.gymEquip.push({ kind, x, z, rot }); this.interactPoints.push({ x, z, y: 0, r: 1.6, kind: 'gym:' + kind, id: 'beach_' + kind, rot, label }); };
    // bench press
    this.B.metal.box(gx - 6, 0.45, gz - 5, 0.4, 0.15, 1.6, '#3b3f44'); this.B.prop.box(gx - 6, 0.55, gz - 5, 0.45, 0.12, 1.5, '#b03a2e');
    for (const sx of [-0.62, 0.62]) this.B.metal.box(gx - 6 + sx, 0.6, gz - 5.7, 0.07, 1.2, 0.07, '#555');
    this.B.metal.add(prim('cyl', 0.025, 0.025, 1.7, 8), gx - 6, 1.18, gz - 5.7, 0, 0, Math.PI / 2, 1, 1, 1, '#c8c8c8');
    equip('bench', gx - 6, gz - 5, 0, 'Bench press');
    // pull-up bar
    this.B.metal.box(gx + 2, 1.25, gz - 7, 0.1, 2.5, 0.1, '#666'); this.B.metal.box(gx + 4, 1.25, gz - 7, 0.1, 2.5, 0.1, '#666'); this.B.metal.box(gx + 3, 2.45, gz - 7, 2.1, 0.06, 0.06, '#aaa');
    equip('pullup', gx + 3, gz - 6.3, Math.PI, 'Pull-ups');
    // dumbbell rack
    this.B.metal.box(gx + 8, 0.5, gz, 0.6, 1, 3, '#444'); for (let k = 0; k < 5; k++) this.B.metal.box(gx + 8, 1.05, gz - 1.2 + k * 0.6, 0.5, 0.12, 0.22, '#222');
    equip('dumbbell', gx + 6.8, gz, -Math.PI / 2, 'Dumbbell curls');
    // squat rack
    this.B.metal.box(gx - 6, 1.1, gz + 5, 0.08, 2.2, 0.08, '#555'); this.B.metal.box(gx - 4, 1.1, gz + 5, 0.08, 2.2, 0.08, '#555'); this.B.metal.box(gx - 5, 1.5, gz + 5, 2.4, 0.05, 0.05, '#bbb');
    equip('squat', gx - 5, gz + 5.6, Math.PI, 'Squats');
    // mat
    this.B.prop.box(gx + 3, 0.03, gz + 6, 1.2, 0.04, 2.2, '#2d6a4f'); equip('pushup', gx + 3, gz + 6, 0, 'Push-ups');
    this.beachGymCenter = { x: gx, z: gz };

    // Pier with ferris wheel
    const px0 = 590, px1 = 770, pz0 = 15, pz1 = 29, py = 1.8;
    this.B.wood.box((px0 + px1) / 2, py - 0.15, (pz0 + pz1) / 2, px1 - px0, 0.3, pz1 - pz0, '#e3d2bb', { u: 3, top: 2 });
    for (let x = px0 + 4; x < px1; x += 8) for (const z of [pz0 + 1, pz1 - 1]) this.B.prop.add(prim('cyl', 0.3, 0.3, 8, 8), x, py - 4.2, z, 0, 0, 0, 1, 1, 1, '#6b5a48');
    for (const z of [pz0 + 0.1, pz1 - 0.1]) { this.B.prop.box((px0 + px1) / 2, py + 0.55, z, px1 - px0, 0.08, 0.08, '#f2f2f2'); for (let x = px0; x < px1; x += 2.5) this.B.prop.box(x, py + 0.28, z, 0.06, 0.55, 0.06, '#f2f2f2'); }
    // ramp from beach
    this.addDeck(560, pz0, px0, pz1, 0.9, 'pierramp'); this.B.wood.box(575, 0.75, (pz0 + pz1) / 2, 30, 0.3, pz1 - pz0, '#e3d2bb', { u: 3, top: 2 });
    this.addDeck(px0, pz0, px1, pz1, py, 'pier');
    this.addBox(px0, pz0 - 0.3, px1, pz0, py + 1.0, py - 0.5); this.addBox(px0, pz1, px1, pz1 + 0.3, py + 1.0, py - 0.5); this.addBox(px1, pz0, px1 + 0.3, pz1, py + 1.0, py - 0.5);
    // bait shop at the end
    this.building(745, 17, 765, 27, 4, 'stucco', '#f5f0e6', { y0: py, roof: 'hip', roofCol: '#2a7f8f', roofH: 1.6, noCollide: false });
    this.sign('PIER 21', 744.8, py + 3, 22, -Math.PI / 2, 4, 1, { bg: '#2a7f8f', fg: '#ffffff' });
    // Ferris wheel (animated)
    const fw = new THREE.Group(); fw.position.set(705, py + 16, 22);
    const wb = new GeoBuilder();
    const R0 = 14;
    wb.add(prim('torus', R0, 0.18, 6, 64), 0, 0, 0, 0, 0, 0, 1, 1, 1, '#f5f5f5');
    wb.add(prim('torus', R0 * 0.6, 0.12, 6, 48), 0, 0, 0, 0, 0, 0, 1, 1, 1, '#f5f5f5');
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; wb.add(prim('cyl', 0.07, 0.07, R0, 4), Math.cos(a) * R0 / 2, Math.sin(a) * R0 / 2, 0, 0, 0, a - Math.PI / 2, 1, 1, 1, '#e8e8e8'); }
    const wheelMesh = new THREE.Mesh(wb.build(), this.M.metal); wheelMesh.castShadow = true;
    const lights = new GeoBuilder();
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; lights.add(prim('sphere', 0.22, 6, 4), Math.cos(a) * R0, Math.sin(a) * R0, 0.2, 0, 0, 0, 1, 1, 1, ['#ff5f6d', '#ffc371', '#4ef0ff', '#b36bff'][k % 4]); }
    const lightMesh = new THREE.Mesh(lights.build(), this.M.neon);
    const spin = new THREE.Group(); spin.add(wheelMesh, lightMesh);
    const gondB = new GeoBuilder(); gondB.box(0, -1.1, 0, 1.6, 1.4, 1.6, '#ffffff'); gondB.box(0, -0.35, 0, 1.8, 0.12, 1.8, '#d9534f');
    const gondGeo = gondB.build(); this.gondolas = [];
    for (let k = 0; k < 16; k++) { const g = new THREE.Mesh(gondGeo, this.M.prop); g.castShadow = true; fw.add(g); this.gondolas.push({ g, a: k / 16 * Math.PI * 2 }); }
    fw.add(spin); this.wheelSpin = spin; this.ferris = fw; this.ferrisR = R0;
    const legs = new GeoBuilder();
    for (const s of [-1, 1]) for (const d of [-1, 1]) legs.add(prim('cyl', 0.25, 0.35, 17.5, 8), d * 4, -8.5, s * 1.6, 0, 0, d * 0.25, 1, 1, 1, '#dcdcdc');
    fw.add(new THREE.Mesh(legs.build(), this.M.metal));
    this.group.add(fw);

    // Marina docks north of the quay (z < -660)
    const dy = 0.15;
    this.B.wood.box(470, dy - 0.15, -712, 6, 0.3, 104, '#d8c7ae', { u: 3, top: 2 }); this.addDeck(467, -764, 473, -660, dy, 'dock');
    this.marinaSlips = [];
    for (let k = 0; k < 4; k++) {
      const z = -680 - k * 22;
      for (const s of [-1, 1]) {
        const x0 = 473, x1 = 473 + 24; const xa = s > 0 ? x0 : 467 - 24, xb = s > 0 ? x1 : 467;
        this.B.wood.box((xa + xb) / 2, dy - 0.15, z, xb - xa, 0.3, 3, '#d8c7ae', { u: 3, top: 2 }); this.addDeck(xa, z - 1.5, xb, z + 1.5, dy, 'dock');
        this.marinaSlips.push({ x: s > 0 ? x0 + 12 : 467 - 12, z: z + 6, heading: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
    // Quay wall edge (visual) and boat ramp
    this.B.prop.box(-100, -4, -662, 1280, 8.2, 4, '#9a9a94', { faces: 'nz py' });
    this.addBox(-760, -664, 560, -660, 0.0, -10, 'quaywall');
    this.B.prop.box(520, -0.55, -671, 14, 0.2, 22, '#8d8d86'); // ramp visual only
    for (let x = -500; x < 340; x += 30) this.B.metal.add(prim('cyl', 0.3, 0.35, 0.6, 8), x, 0.3, -657, 0, 0, 0, 1, 1, 1, '#2f2f2f');
  }

  // ---------------- port ----------------
  buildPort() {
    const r = this.r;
    // quay apron between Quay Road and the water
    this.B.asphalt.groundQuad(-540, -660, 480, -660, 480, -606, -540, -606, 0.01, 0xffffff, [[0, 0], [60, 0], [60, 4], [0, 4]]);
    // gantry cranes
    for (const x of [-420, -250, -60, 120]) {
      const cy = 0, H = 34;
      for (const dx of [-7, 7]) for (const dz of [-640, -616]) this.B.metal.box(x + dx, H / 2, dz, 1.2, H, 1.2, '#d35400');
      this.B.metal.box(x, H, -628, 16, 2, 26, '#d35400'); this.B.metal.box(x, H + 2.2, -650, 3, 2.4, 70, '#e67e22');
      this.B.metal.box(x, H + 4.5, -628, 6, 4, 6, '#f0f0f0');
      for (const dx of [-7, 7]) for (const dz of [-640, -616]) this.addCircle(x + dx, dz, 1, H);
    }
    // container stacks
    this.containerStacks.push([-470, -630, 6, 1, 3], [-180, -630, 5, 1, 2], [20, -640, 4, 1, 3], [200, -625, 6, 1, 2]);
    const cc = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#5d6d7e', '#d35400', '#117a65'];
    for (const [x, z, nx, nz, ny] of this.containerStacks) {
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const hgt = 1 + Math.floor(r() * ny);
        for (let k = 0; k < hgt; k++) { const c = cc[Math.floor(r() * cc.length)]; this.B.metal.box(x + i * 12.6, 1.3 + k * 2.6, z + j * 2.6, 12.2, 2.5, 2.45, c); }
        this.addBox(x + i * 12.6 - 6.1, z + j * 2.6 - 1.25, x + i * 12.6 + 6.1, z + j * 2.6 + 1.25, hgt * 2.6, -5);
      }
    }
    // cargo ship
    const sx = -150, sz = -720;
    this.B.metal.box(sx, -1, sz, 180, 9, 28, '#1f3a5f'); this.B.metal.box(sx, 3.6, sz, 176, 0.4, 26, '#7b2d26');
    this.B.prop.box(sx + 70, 10, sz, 20, 13, 22, '#f2f2f2'); this.B.metal.box(sx + 74, 18, sz, 4, 4, 4, '#c0392b');
    for (let i = 0; i < 9; i++) for (let k = 0; k < 2; k++) this.B.metal.box(sx - 70 + i * 13, 5.2 + k * 2.6, sz - 6 + (i % 2) * 6, 12.2, 2.5, 7.5, cc[(i + k) % cc.length]);
    this.addBox(sx - 90, sz - 14, sx + 90, sz + 14, 4, -10, 'ship');
  }

  // ---------------- airport ----------------
  buildAirport() {
    const S = 0.02;
    this.B.asphalt.groundQuad(-470, 606, 450, 606, 450, 790, -470, 790, S, 0xffffff, [[0, 0], [70, 0], [70, 14], [0, 14]]);
    // runway with markings
    const rz = 700, rw = 40, rx0 = -440, rx1 = 420;
    this.B.asphalt.groundQuad(rx0, rz - rw / 2, rx1, rz - rw / 2, rx1, rz + rw / 2, rx0, rz + rw / 2, 0.04, 0xffffff, [[0, 0], [0, 70], [3.3, 70], [3.3, 0]]);
    for (let x = rx0 + 30; x < rx1 - 30; x += 30) this.B.cross.groundQuad(x, rz - 0.4, x + 14, rz - 0.4, x + 14, rz + 0.4, x, rz + 0.4, 0.06, 0xffffff, [[0.02, 0.3], [0.05, 0.3], [0.05, 0.7], [0.02, 0.7]]);
    for (const xx of [rx0 + 8, rx1 - 20]) for (let k = -6; k <= 6; k++) if (k) this.B.cross.groundQuad(xx, rz + k * 2.8 - 0.8, xx + 12, rz + k * 2.8 - 0.8, xx + 12, rz + k * 2.8 + 0.8, xx, rz + k * 2.8 + 0.8, 0.06, 0xffffff, [[0.02, 0.3], [0.05, 0.3], [0.05, 0.7], [0.02, 0.7]]);
    this.runway = { x0: rx0, x1: rx1, z: rz, w: rw };
    // runway edge lights
    for (let x = rx0; x <= rx1; x += 20) for (const s of [-1, 1]) this.B.neon.box(x, 0.2, rz + s * (rw / 2 + 1), 0.4, 0.3, 0.4, s > 0 ? '#ffffff' : '#ffd36b');
    // terminal
    const t = this.building(-120, 612, 100, 650, 14, 'glass', '#e6f3ff', { tag: 'terminal', noParapet: true, clean: true, y0: 0.02 });
    this.B.prop.box(-10, 14.6, 631, 228, 1.2, 46, '#f4f4f4');
    this.sign('AURELIA INTERNATIONAL', -10, 16.5, 607.6, Math.PI, 26, 2.4, { bg: '#ffffff', fg: '#0b3c5d' });
    this.sign('SKYDIVE SAN AURELIA', 60, 4.5, 611.6, Math.PI, 9, 1.2, { bg: '#ff7a45', fg: '#ffffff' });
    this.door(60, 608, 'skydive', 'skydive', 'Skydive desk: book a jump ($250)', { y: 0.02 });
    // control tower
    this.B.prop.add(prim('cyl', 3, 4, 34, 16), 180, 17, 640, 0, 0, 0, 1, 1, 1, '#e8e8e8'); this.B.glass.add(prim('cyl', 6, 5, 4, 16), 180, 36, 640);
    this.B.prop.add(prim('cyl', 6.4, 6.4, 0.8, 16), 180, 38.4, 640, 0, 0, 0, 1, 1, 1, '#d0d0d0'); this.addCircle(180, 640, 4.2, 40);
    // hangars
    for (const x of [262, 330]) { this.building(x - 30, 612, x + 30, 660, 13, 'industrial', '#dfe4e8', { y0: 0.02, clean: true }); this.B.prop.box(x, 6.5, 660.15, 40, 11, 0.2, '#6d7378'); }
    // airport helipad
    this.B.prop.add(prim('cyl', 10, 10, 0.1, 32), -330, 0.07, 640, 0, 0, 0, 1, 1, 1, '#3d4348');
    this.B.neon.add(prim('torus', 8, 0.15, 6, 40), -330, 0.14, 640, Math.PI / 2, 0, 0, 1, 1, 1, '#ffe066');
    this.airportPads = { heli: { x: -330, z: 640 }, plane: { x: -380, z: 700 } };
    // perimeter fence (with gates where Terminal Way enters)
    this.B.metal.box(-10, 1.2, 795, 920, 2.4, 0.08, '#9aa3a8'); this.addBox(-470, 794.5, 450, 795.5, 2.4);
  }

  // ---------------- hillside villas & overlook ----------------
  buildHillside() {
    const Y = L.HILL_TOP;
    const villas = [[-760, 10, 'Villa Mirador'], [-830, 10, null], [-760, -100, null], [-830, -100, null], [-790, 120, null], [-790, -200, null]];
    this.villas = [];
    for (const [x, z, name] of villas) {
      const north = z > -40; // door faces Vista Drive (z=-40)
      const w = 26, d = 18;
      const z0 = north ? z - d / 2 : z - d / 2, z1 = z0 + d;
      this.building(x - w / 2, z0, x + w / 2, z1, 7, 'stucco', '#f6f1e7', { y0: Y, roof: 'hip', roofCol: '#b5552f', roofH: 3 });
      this.building(x + w / 2 - 2, z0 + 3, x + w / 2 + 8, z1 - 3, 3.6, 'stucco', '#f6f1e7', { y0: Y, roof: 'hip', roofCol: '#b5552f', roofH: 1.8 });
      // pool + garden
      const pz = north ? z1 + 8 : z0 - 8;
      this.B.prop.box(x, Y + 0.05, pz, 16, 0.1, 9, '#e9e2d4'); this.B.pool.box(x, Y + 0.12, pz, 12, 0.05, 5, '#ffffff', { faces: 'py' });
      this.B.grass.box(x, Y + 0.02, z, 44, 0.02, 44, '#ffffff', { faces: 'py', top: 6 });
      for (let k = 0; k < 4; k++) this.palmsAt.push([x - 18 + k * 12, north ? z0 - 6 : z1 + 6]);
      // garden wall
      this.B.prop.box(x, Y + 0.6, north ? z + 22 : z - 22, 44, 1.2, 0.4, '#efe7d8');
      this.villas.push({ x, z, name, door: { x, z: north ? z0 - 1.5 : z1 + 1.5 } });
      if (name) { this.door(x, z0 - 1.5, 'villa', 'villa', name + ' — view property', { y: Y }); L.POI.villa.x = x; L.POI.villa.z = z0 - 1.5; }
    }
    // overlook terrace on the plateau's city-facing edge
    const ox = -705, oz = 60;
    this.B.prop.box(ox - 4, Y + 0.05, oz, 12, 0.1, 30, '#d8cfbf');
    this.B.metal.box(ox + 2, Y + 0.55, oz, 0.08, 1.1, 30, '#666'); this.B.metal.box(ox + 2, Y + 1.1, oz, 0.12, 0.08, 30, '#888');
    this.addBox(ox + 1.9, oz - 15, ox + 2.2, oz + 15, Y + 1.2, Y - 3);
    for (let k = 0; k < 3; k++) this.benches.push([ox - 3, oz - 10 + k * 10, Math.PI / 2, Y]);
    this.B.metal.add(prim('cyl', 0.06, 0.06, 1.2, 6), ox, Y + 0.6, oz - 4, 0, 0, 0, 1, 1, 1, '#555'); this.B.metal.add(prim('cyl', 0.12, 0.08, 0.5, 8), ox, Y + 1.3, oz - 4, 0, 0, Math.PI / 2.4, 1, 1, 1, '#1e6f5c');
    this.door(ox, oz, 'overlook', 'overlook', 'Take in the view (photo)', { y: Y });
    // a few rural homes in the outskirts
    for (const [x, z] of [[-620, 300], [-660, 420], [-560, 880], [-300, 900], [120, 920]]) {
      const y = terrainHeight(x, z);
      this.building(x - 7, z - 5, x + 7, z + 5, 3.4, 'stucco', '#efe2cf', { y0: y, roof: 'hip', roofCol: '#7a4a32', roofH: 2.2 });
    }
  }

  // ---------------- props: trees, palms, lamps, benches ----------------
  buildProps() {
    const r = this.r;
    // palms along Ocean Boulevard, Palmera Ave, Vista Drive and the boardwalk
    for (let z = -590; z < 515; z += 16) { this.palmsAt.push([471.5, z]); this.palmsAt.push([510, z + 8]); }
    for (let z = -450; z < 515; z += 20) { this.palmsAt.push([60 - 8.8, z + 6]); this.palmsAt.push([60 + 8.8, z + 16]); }
    for (let x = -690; x > -860; x -= 18) { this.palmsAt.push([x, -40 - 10]); this.palmsAt.push([x - 9, -40 + 10]); }
    for (let x = -520; x > -690; x -= 22) { this.palmsAt.push([x, -40 - 10]); this.palmsAt.push([x - 11, -40 + 10]); }
    for (let x = -100; x < 300; x += 24) this.palmsAt.push([x, 608]);
    // hill forest
    for (let k = 0; k < 500; k++) {
      const x = -560 - r() * 900, z = -680 + r() * 1900; const h = terrainHeight(x, z);
      if (h < 2 || (x > -890 && x < -680 && z > -340 && z < 240) || Math.abs(z + 40) < 14) continue;
      this.pinesAt.push([x, z, h]);
    }
    for (let k = 0; k < 160; k++) { const x = -500 + r() * 950, z = 830 + r() * 380; const h = terrainHeight(x, z); if (h > 1) this.pinesAt.push([x, z, h]); }

    this._instancedPalms(); this._instancedTrees(); this._instancedPines();
    // street lamps along every edge, both sides
    for (const e of edges) {
      const A = nodes[e.a]; const nx = -e.dz, nz = e.dx;
      for (let t = 18; t < e.len - 14; t += 34) for (const s of [-1, 1]) {
        const x = A.x + e.dx * t + nx * s * 6.9, z = A.z + e.dz * t + nz * s * 6.9;
        if (x > 484 && s * nx > 0 && e.axis === 'ns') continue;
        this.lamps.push({ x, z, y: e.hill ? L.roadY(x, z) : L.SIDEWALK_H, face: Math.atan2(-nx * s, -nz * s) });
      }
    }
    for (let z = -560; z < 510; z += 28) this.lamps.push({ x: 505, z, y: 0.3, face: Math.PI / 2 });
    for (let x = 600; x < 770; x += 20) this.lamps.push({ x, z: 28.6, y: 1.8, face: -Math.PI }), this.lamps.push({ x: x + 10, z: 15.4, y: 1.8, face: 0 });
    this._instancedLamps();
    // benches
    for (let z = -560; z < 510; z += 42) this.benches.push([495, z, Math.PI / 2, 0.3]);
    const bb = this.B.prop;
    for (const [x, z, rot, y = L.SIDEWALK_H] of this.benches) {
      const c = Math.cos(rot), s = Math.sin(rot);
      bb.box(x, y + 0.45, z, 1.8, 0.08, 0.5, '#8a5a3b', { rotY: rot }); bb.box(x - s * 0.22, y + 0.75, z - c * 0.22, 1.8, 0.45, 0.06, '#8a5a3b', { rotY: rot });
      bb.box(x, y + 0.22, z, 1.6, 0.44, 0.4, '#3a3a3a', { rotY: rot });
      this.seats.push({ x, z, y: y + 0.5, heading: rot });
    }
    // terrace tables at the café
    for (const [x, z] of this.terraceTables) { bb.add(prim('cyl', 0.5, 0.5, 0.05, 16), x, 0.9, z, 0, 0, 0, 1, 1, 1, '#f2f2f2'); bb.add(prim('cyl', 0.05, 0.05, 0.75, 6), x, 0.5, z, 0, 0, 0, 1, 1, 1, '#444'); this.addCircle(x, z, 0.5, 1); }
    // pools on boardwalk hotel lots
    for (const [x, z, w, d] of this.pools) { this.B.prop.box(x, L.SIDEWALK_H + 0.05, z, w + 4, 0.1, d + 4, '#e9e2d4'); this.B.pool.box(x, L.SIDEWALK_H + 0.12, z, w, 0.05, d, '#ffffff', { faces: 'py' }); }
    // EV chargers
    for (const k of ['charger1', 'charger2', 'charger3']) {
      const p = POI[k];
      this.B.prop.box(p.x, L.SIDEWALK_H + 0.8, p.z, 0.5, 1.6, 0.35, '#f4f4f4'); this.B.neon.box(p.x, L.SIDEWALK_H + 1.3, p.z + (p.z > 0 ? -0.18 : 0.18), 0.3, 0.3, 0.02, '#36e2a0');
      this.addCircle(p.x, p.z, 0.4, 1.6);
      this.door(p.x, p.z, 'charger', k, 'Charge EV');
    }
    // fire hydrants & bins sprinkled on sidewalks
    for (let k = 0; k < 140; k++) {
      const e = edges[Math.floor(r() * edges.length)]; if (e.hill) continue; const A = nodes[e.a]; const t = 20 + r() * (e.len - 40); const s = r() < 0.5 ? -1 : 1;
      const x = A.x + e.dx * t - e.dz * s * 8.8, z = A.z + e.dz * t + e.dx * s * 8.8;
      if (x > 484) continue;
      if (r() < 0.5) { bb.add(prim('cyl', 0.16, 0.2, 0.7, 8), x, L.SIDEWALK_H + 0.35, z, 0, 0, 0, 1, 1, 1, '#c0392b'); }
      else { bb.add(prim('cyl', 0.28, 0.24, 0.9, 10), x, L.SIDEWALK_H + 0.45, z, 0, 0, 0, 1, 1, 1, '#2f4f4f'); }
      this.addCircle(x, z, 0.3, 1);
    }
  }
  _instancedPalms() {
    // template: curved trunk + drooping fronds, vertex coloured
    const b = new GeoBuilder(); const segs = this.q.level >= 2 ? 6 : 4, H = 9;
    for (let i = 0; i < segs; i++) { const t = i / segs, y = t * H, bend = Math.sin(t * 1.4) * 0.8; b.add(prim('cyl', 0.2 - t * 0.06, 0.22 - t * 0.05, H / segs + 0.05, 7), bend, y + H / segs / 2, 0, 0, 0, -0.08, 1, 1, 1, i % 2 ? '#8a7356' : '#7a6448'); }
    const topX = Math.sin(1.4) * 0.8;
    const NF = this.q.level >= 2 ? 9 : 7, NS = this.q.level >= 2 ? 4 : 3;
    for (let k = 0; k < NF; k++) {
      const a = k / NF * Math.PI * 2;
      for (let s = 0; s < NS; s++) {
        const len = 1.15 * 4 / NS, t = s / NS;
        const dx = Math.cos(a), dz = Math.sin(a); const dist = 0.4 + s * len * 0.95;
        const droop = -t * t * 2.2 + t * 0.5;
        b.add(prim('box', 1, 0.05, 1), topX + dx * dist, H + droop, dz * dist, 0, -a, -0.3 - t * 0.6, len * 1.05, 1, 0.9 - t * 0.35, s % 2 ? '#3f7a32' : '#4d8c3a');
      }
    }
    b.add(prim('sphere', 0.35, 6, 4), topX, H - 0.1, 0, 0, 0, 0, 1, 1, 1, '#5b4a2e');
    const geo = b.build();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.windU = { uTime: { value: 0 }, uWind: { value: 0.3 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windU.uTime; sh.uniforms.uWind = this.windU.uWind;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float hf = max(position.y - 2.0, 0.0) / 9.0; hf *= hf;
        transformed.x += sin(uTime*1.3 + ip.x*0.07 + ip.z*0.05) * uWind * hf * 0.9 + uWind*hf*0.6;
        transformed.z += cos(uTime*1.1 + ip.z*0.08) * uWind * hf * 0.5;`);
    };
    const pts = this.palmsAt.filter(([x, z], i) => !this.inBuilding(x, z) && (this.q.level >= 1 || i % 2 === 0));
    const im = new THREE.InstancedMesh(geo, mat, pts.length); im.castShadow = true; im.receiveShadow = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    pts.forEach(([x, z], i) => {
      const sc = 0.8 + this.r() * 0.5; const y = this.surfaceHeight(x, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.r() * 6.28); m.compose(p.set(x, y, z), q, s.set(sc, sc * (0.85 + this.r() * 0.4), sc)); im.setMatrixAt(i, m);
      this.addCircle(x, z, 0.35, 10);
    });
    im.name = 'palms'; this.group.add(im);
  }
  _instancedTrees() {
    const b = new GeoBuilder();
    b.add(prim('cyl', 0.18, 0.26, 3, 7), 0, 1.5, 0, 0, 0, 0, 1, 1, 1, '#6b5038');
    b.add(prim('ico', 2.2, 1), 0, 4.4, 0, 0, 0, 0, 1, 0.85, 1, '#4f7d34'); b.add(prim('ico', 1.6, 1), 0.9, 5.3, 0.4, 0, 0, 0, 1, 1, 1, '#5d8f3c'); b.add(prim('ico', 1.5, 1), -0.8, 5.0, -0.6, 0, 0, 0, 1, 1, 1, '#456f2e');
    const geo = b.build(); const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const pts = this.treesAt.filter(([x, z]) => !this.inBuilding(x, z));
    const im = new THREE.InstancedMesh(geo, mat, pts.length); im.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    pts.forEach(([x, z], i) => { const sc = 0.8 + this.r() * 0.6; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.r() * 6.28); m.compose(p.set(x, this.surfaceHeight(x, z), z), q, s.set(sc, sc, sc)); im.setMatrixAt(i, m); im.setColorAt(i, c.setRGB(0.85 + this.r() * 0.2, 0.9 + this.r() * 0.15, 0.82 + this.r() * 0.15)); this.addCircle(x, z, 0.35, 6); });
    im.name = 'trees'; this.group.add(im);
  }
  _instancedPines() {
    const b = new GeoBuilder(); b.add(prim('cyl', 0.15, 0.25, 2, 6), 0, 1, 0, 0, 0, 0, 1, 1, 1, '#5a4330');
    for (let k = 0; k < 3; k++) b.add(prim('cone', 2.2 - k * 0.5, 3, 7), 0, 2.8 + k * 1.7, 0, 0, 0, 0, 1, 1, 1, k % 2 ? '#2f5d3a' : '#3a6b43');
    const im = new THREE.InstancedMesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), this.pinesAt.length);
    im.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.pinesAt.forEach(([x, z, h], i) => { const sc = 0.9 + this.r() * 1.2; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.r() * 6.28); m.compose(p.set(x, h - 0.2, z), q, s.set(sc, sc, sc)); im.setMatrixAt(i, m); });
    im.name = 'pines'; this.group.add(im);
  }
  _instancedLamps() {
    const b = new GeoBuilder();
    b.add(prim('cyl', 0.07, 0.11, 7, 7), 0, 3.5, 0, 0, 0, 0, 1, 1, 1, '#3b4045');
    b.add(prim('cyl', 0.05, 0.05, 2.0, 5), 0, 6.9, 0.95, Math.PI / 2, 0, 0, 1, 1, 1, '#3b4045');
    b.add(prim('box', 0.5, 0.18, 0.9), 0, 6.85, 1.9, 0, 0, 0, 1, 1, 1, '#2f3438');
    const pole = new THREE.InstancedMesh(b.build(), this.M.metal, this.lamps.length); pole.castShadow = true;
    const bulbM = new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false });
    const bulbs = new THREE.InstancedMesh(prim('box', 0.42, 0.06, 0.8), bulbM, this.lamps.length);
    // light pools on the ground (additive radial decals)
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,214,160,0.9)'); grd.addColorStop(0.5, 'rgba(255,190,120,0.35)'); grd.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const poolM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const pg = new THREE.PlaneGeometry(14, 14); pg.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(pg, poolM, this.lamps.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, l.face); m.compose(p.set(l.x, l.y, l.z), q, one); pole.setMatrixAt(i, m);
      const fx = Math.sin(l.face) * 1.9, fz = Math.cos(l.face) * 1.9;
      m.compose(p.set(l.x + fx, l.y + 6.75, l.z + fz), q, one); bulbs.setMatrixAt(i, m);
      m.compose(p.set(l.x + fx, l.y + 0.06, l.z + fz), q, one); pools.setMatrixAt(i, m);
      this.addCircle(l.x, l.z, 0.18, 7);
    });
    pole.name = 'lamps'; this.group.add(pole, bulbs, pools);
    this.lampBulbM = bulbM; this.lampPoolM = poolM;
  }
  inBuilding(x, z) { const it = this.grid.query(x, z, x, z, []); return it.some((b) => !b.circle && !b.deck && x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1 && b.top > 1); }

  // ---------------- traffic signals and enforcement cameras ----------------
  buildSignals() {
    const heads = []; const poleB = new GeoBuilder();
    for (const n of nodes) {
      if (!n.light) continue;
      for (const eid of n.edges) {
        const e = edges[eid]; const o = nodes[L.otherNode(e, n.id)];
        // approach direction: travelling from o towards n
        const dx = Math.sign(n.x - o.x), dz = Math.sign(n.z - o.z);
        const rx = -dz, rz = dx; // right of travel
        // pole at near-right corner, head overhanging the incoming lane
        const px = n.x - dx * 8.5 + rx * 7.2, pz = n.z - dz * 8.5 + rz * 7.2;
        const face = Math.atan2(-dx, -dz);
        poleB.add(prim('cyl', 0.1, 0.13, 6, 7), px, L.SIDEWALK_H + 3, pz, 0, 0, 0, 1, 1, 1, '#33383c');
        poleB.add(prim('box', 0.12, 0.12, 4.6), px - rx * 2.3, 5.9, pz - rz * 2.3, 0, face + Math.PI / 2, 0, 1, 1, 1, '#33383c');
        const hx = px - rx * 3.6, hz = pz - rz * 3.6;
        poleB.add(prim('box', 0.45, 1.25, 0.32), hx, 5.25, hz, 0, face, 0, 1, 1, 1, '#1f2326');
        this.addCircle(px, pz, 0.2, 6);
        const axis = e.axis;
        const h = { node: n, axis, x: hx, z: hz, face, idx: heads.length };
        heads.push(h);
        // enforcement camera on the approach
        if (n.camera) {
          const cx = n.x - dx * 8.5 - rx * 7.4, cz = n.z - dz * 8.5 - rz * 7.4;
          poleB.add(prim('cyl', 0.08, 0.1, 4.2, 6), cx, L.SIDEWALK_H + 2.1, cz, 0, 0, 0, 1, 1, 1, '#4d5358');
          poleB.add(prim('box', 0.35, 0.3, 0.6), cx, 4.4, cz, 0.25, face, 0, 1, 1, 1, '#d7d9db');
          this.cams.push({ node: n, x: cx, z: cz, face, active: n.camera === 'active', axis });
          this.addCircle(cx, cz, 0.2, 4);
          this.sign(n.camera === 'active' ? 'PHOTO ENFORCED' : 'CAMERA OUT OF SERVICE', cx, 3.1, cz, face, 1.6, 0.5, { bg: n.camera === 'active' ? '#f6f6f6' : '#777777', fg: '#111', size: 70 });
        }
      }
    }
    this.group.add(poleB.mesh(this.M.metal, { cast: true }));
    this.heads = heads;
    const bulbGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const bm = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.bulbIM = new THREE.InstancedMesh(bulbGeo, bm, heads.length * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    heads.forEach((h, i) => {
      q.setFromAxisAngle(up, h.face); const fx = Math.sin(h.face) * 0.17, fz = Math.cos(h.face) * 0.17;
      for (let k = 0; k < 3; k++) { m.compose(p.set(h.x + fx, 5.65 - k * 0.38, h.z + fz), q, one); this.bulbIM.setMatrixAt(i * 3 + k, m); this.bulbIM.setColorAt(i * 3 + k, new THREE.Color(0x222222)); }
    });
    this.group.add(this.bulbIM);
    // camera LEDs
    this.camLed = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, this.cams.length));
    this.cams.forEach((c, i) => { m.compose(p.set(c.x + Math.sin(c.face) * 0.32, 4.55, c.z + Math.cos(c.face) * 0.32), q.identity(), one); this.camLed.setMatrixAt(i, m); this.camLed.setColorAt(i, new THREE.Color(0x111111)); });
    this.group.add(this.camLed);
  }

  // ---------------- per-frame ----------------
  update(dt, t, env) {
    // signals (update colours a few times a second)
    this._sigT = (this._sigT || 0) - dt;
    if (this._sigT <= 0) {
      this._sigT = 0.2;
      const C = this._sigC || (this._sigC = { red: [new THREE.Color(3, 0.15, 0.1), new THREE.Color(0.022, 0.004, 0.004)], yellow: [new THREE.Color(3, 1.9, 0.1), new THREE.Color(0.02, 0.015, 0.003)], green: [new THREE.Color(0.2, 3, 0.9), new THREE.Color(0.003, 0.02, 0.01)] });
      for (const h of this.heads) {
        const st = L.signalState(h.node, t, h.axis);
        this.bulbIM.setColorAt(h.idx * 3, C.red[st === 'red' ? 0 : 1]); this.bulbIM.setColorAt(h.idx * 3 + 1, C.yellow[st === 'yellow' ? 0 : 1]); this.bulbIM.setColorAt(h.idx * 3 + 2, C.green[st === 'green' ? 0 : 1]);
      }
      this.bulbIM.instanceColor.needsUpdate = true;
      const blink = Math.floor(t * 1.5) % 2 === 0;
      this.cams.forEach((c, i) => this.camLed.setColorAt(i, c.active && blink ? new THREE.Color(3, 0.1, 0.1) : new THREE.Color(0.1, 0.1, 0.1)));
      if (this.camLed.instanceColor) this.camLed.instanceColor.needsUpdate = true;
    }
    // night lighting
    const n = env.night, dusk = smoothstep(0.15, 0.6, n);
    for (const m of this.nightMats) m.emissiveIntensity = dusk * 0.95;
    for (const s of this.signs) s.mat.emissiveIntensity = s.neon ? 0.5 + dusk * 1.4 : 0.1 + dusk * 0.6;
    this.lampBulbM.color.setRGB(0.15 + dusk * 2.6, 0.15 + dusk * 2.1, 0.12 + dusk * 1.4);
    this.lampPoolM.opacity = dusk * 0.55;
    this.M.neon.color.setScalar(0.6 + dusk * 0.8);
    // wet surfaces
    const w = env.wet;
    for (const m of this.wetMats) { m.roughness = lerp(0.9, 0.25, w); m.metalness = lerp(0, 0.35, w); m.color.setScalar(lerp(1, 0.62, w)); }
    // wind on palms
    this.windU.uTime.value = t; this.windU.uWind.value = 0.15 + env.w.wind * 0.9;
    // ferris wheel
    if (this.wheelSpin) {
      const a = t * 0.08; this.wheelSpin.rotation.z = a;
      for (const g of this.gondolas) { const aa = g.a + a; g.g.position.set(Math.cos(aa) * this.ferrisR, Math.sin(aa) * this.ferrisR, 0); }
    }
  }
}
