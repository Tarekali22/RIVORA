// San Aurelia: map constants, districts, terrain height and the road graph.
// Everything spatial (rendering, physics, AI, map UI) derives from this file.
import { smoothstep, fbm, clamp } from '../core/util.js';

export const AVE_X = [-500, -360, -220, -80, 60, 200, 340, 480];      // north-south avenues
export const ST_Z = [-600, -460, -320, -180, -40, 100, 240, 380, 520]; // east-west streets
export const ROAD_HALF = 6, LANE_OFF = 2.6, WALK_IN = 10, SIDEWALK_H = 0.15, STOP_DIST = 9.5;
export const WATER_Y = -1.0;
export const AVE_NAMES = ['Canyon Ave', 'Mercado Ave', 'Harbor Ave', 'Civic Ave', 'Palmera Ave', 'Neon Ave', 'Seabreeze Ave', 'Ocean Boulevard'];
export const ST_NAMES = ['Quay Road', 'Foundry St', 'Commerce St', 'Grand St', 'Vista St', 'Sunset St', 'Laurel St', 'Jacaranda St', 'Airport Rd'];

export const DISTRICTS = {
  downtown: { name: 'Downtown', density: 1.0 },
  boardwalk: { name: 'Coral Boardwalk', density: 0.8 },
  hillside: { name: 'Vista Heights', density: 0.25 },
  residential: { name: 'Laurel Park', density: 0.55 },
  commercial: { name: 'Mercado', density: 0.8 },
  industrial: { name: 'Foundry Port', density: 0.35 },
  airport: { name: 'Aurelia International', density: 0.3 },
  marina: { name: 'Bayside Marina', density: 0.5 },
  outskirts: { name: 'Sierra Outskirts', density: 0.05 },
  nightlife: { name: 'Neon Row', density: 0.9 },
  beach: { name: 'Coral Beach', density: 0.6 },
  nour: { name: 'El Nour Quarter', density: 1.0 },
};

export function blockDistrict(i, j) {
  if (j === 0) return i === 6 ? 'marina' : 'industrial';
  if (j === 1) return i <= 1 ? 'industrial' : i === 6 ? 'boardwalk' : 'downtown';
  if ((j === 5 || j === 6) && i <= 1) return 'nour'; // El Nour Quarter (Egyptian-inspired)
  if (i === 6) return 'boardwalk';
  if (j <= 3) return i <= 1 ? 'commercial' : 'downtown';
  if (j === 4) return i <= 1 ? 'commercial' : i === 5 ? 'nightlife' : 'downtown';
  if (j === 5) return i >= 4 ? 'nightlife' : 'residential';
  return 'residential';
}

export function districtAt(x, z) {
  if (x > 486 && z > -600 && z < 560) return x > 506 ? 'beach' : 'boardwalk';
  if (z < -660 || (x > 340 && z < -600)) return 'marina';
  if (x < -520) return x < -880 || z < -320 || z > 220 ? 'outskirts' : 'hillside';
  if (z > 520) return z > 820 ? 'outskirts' : 'airport';
  if (z < -600) return 'industrial';
  let i = -1, j = -1;
  for (let k = 0; k < AVE_X.length - 1; k++) if (x >= AVE_X[k] && x < AVE_X[k + 1]) i = k;
  for (let k = 0; k < ST_Z.length - 1; k++) if (z >= ST_Z[k] && z < ST_Z[k + 1]) j = k;
  if (i < 0 || j < 0) return 'residential';
  return blockDistrict(i, j);
}

// ---------------- Terrain ----------------
export const HILL_TOP = 20;
export const hillBase = (x) => HILL_TOP * smoothstep(-540, -700, x);
export function terrainHeight(x, z) {
  let h = 0;
  // East beach and sea floor
  if (x > 556) h = -3 * smoothstep(556, 650, x) - 4 * smoothstep(650, 900, x);
  // North harbour: quay wall then deep water
  if (z < -660) h = Math.min(h, -8);
  // West hills, plateau and mountains
  if (x < -530) {
    const base = hillBase(x);
    const roadBand = 1 - smoothstep(14, 30, Math.abs(z + 40));
    const plateau = (x < -690 && x > -880 && z > -330 && z < 230) ? 1 : 0;
    const zMask = smoothstep(200, 300, z) + smoothstep(-300, -400, z);
    let rough = 22 * fbm(x * 0.008, z * 0.008, 4) * smoothstep(-560, -680, x) * clamp(zMask, 0, 1);
    let mount = (70 + 60 * fbm(x * 0.004 + 3, z * 0.004, 4)) * smoothstep(-880, -1150, x);
    rough *= (1 - roadBand); mount *= (1 - roadBand * (x > -900 ? 1 : 0));
    if (plateau) { rough = 0; mount = 0; }
    h = base + rough + mount;
  }
  // South hills beyond the airport
  if (z > 820) h = Math.max(h, (25 + 40 * fbm(x * 0.006, z * 0.006 + 9, 4)) * smoothstep(820, 1050, z));
  return h;
}

// ---------------- Road graph ----------------
export const nodes = [];   // {id,x,z,edges:[],light,camera,ix,iz}
export const edges = [];   // {id,a,b,len,dx,dz,axis:'ns'|'ew',name}
const nodeAt = new Map();
function addNode(x, z, ix = -1, iz = -1) {
  const k = x + ',' + z; if (nodeAt.has(k)) return nodeAt.get(k);
  const n = { id: nodes.length, x, z, edges: [], light: false, camera: null, ix, iz, y: 0 };
  nodes.push(n); nodeAt.set(k, n); return n;
}
function addEdge(a, b, name, opts = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const e = { id: edges.length, a: a.id, b: b.id, len, dx: dx / len, dz: dz / len, axis: Math.abs(dx) > Math.abs(dz) ? 'ew' : 'ns', name, hill: !!opts.hill, speed: opts.speed || 14 };
  edges.push(e); a.edges.push(e.id); b.edges.push(e.id); return e;
}
for (let i = 0; i < AVE_X.length; i++) for (let j = 0; j < ST_Z.length; j++) addNode(AVE_X[i], ST_Z[j], i, j);
for (let i = 0; i < AVE_X.length; i++) for (let j = 0; j < ST_Z.length - 1; j++) addEdge(nodeAt.get(AVE_X[i] + ',' + ST_Z[j]), nodeAt.get(AVE_X[i] + ',' + ST_Z[j + 1]), AVE_NAMES[i], { speed: i === 7 ? 16 : 14 });
for (let j = 0; j < ST_Z.length; j++) for (let i = 0; i < AVE_X.length - 1; i++) addEdge(nodeAt.get(AVE_X[i] + ',' + ST_Z[j]), nodeAt.get(AVE_X[i + 1] + ',' + ST_Z[j]), ST_NAMES[j]);
// Vista Drive up to the hillside plateau
const v1 = addNode(-700, -40), v2 = addNode(-860, -40);
addEdge(nodeAt.get('-500,-40'), v1, 'Vista Drive', { hill: true, speed: 12 }); addEdge(v1, v2, 'Vista Drive', { hill: true, speed: 10 });
// Airport access loop
const ap1 = addNode(-80, 600), ap2 = addNode(200, 600);
addEdge(nodeAt.get('-80,520'), ap1, 'Terminal Way'); addEdge(ap1, ap2, 'Terminal Way'); addEdge(ap2, nodeAt.get('200,520'), 'Terminal Way');
for (const n of nodes) n.y = terrainHeight(n.x, n.z) > 0 && n.x < -520 ? hillBase(n.x) : 0;

export const roadY = (x, z) => (x < -520 ? hillBase(x) : 0);

// Traffic lights on 3/4-way intersections inside the grid; enforcement cameras on a fixed subset
for (const n of nodes) n.light = n.edges.length >= 3 && n.ix >= 0;
const camActive = ['-80,-180', '60,-40', '200,-320', '-220,100', '340,240', '480,-40', '-360,-180', '60,380'];
const camInactive = ['200,-40', '-80,240', '480,240'];
for (const k of camActive) { const n = nodeAt.get(k); if (n) n.camera = 'active'; }
for (const k of camInactive) { const n = nodeAt.get(k); if (n) n.camera = 'inactive'; }
export const getNode = (x, z) => nodeAt.get(x + ',' + z);

// Signal timing (seconds). Phase A = north-south green, phase B = east-west green.
export const SIGNAL = { green: 14, yellow: 3, allRed: 1.5 };
export const CYCLE = 2 * (SIGNAL.green + SIGNAL.yellow + SIGNAL.allRed);
export function signalState(node, t, axis) {
  const off = ((node.ix + node.iz) % 2) * (CYCLE / 2) * 0.35;
  let p = (t + off) % CYCLE;
  const half = SIGNAL.green + SIGNAL.yellow + SIGNAL.allRed;
  const nsActive = p < half;
  if (!nsActive) p -= half;
  const mine = (axis === 'ns') === nsActive;
  if (!mine) return 'red';
  if (p < SIGNAL.green) return 'green';
  if (p < SIGNAL.green + SIGNAL.yellow) return 'yellow';
  return 'red';
}

export function otherNode(e, id) { return e.a === id ? e.b : e.a; }

// Nearest point on any road edge (for GPS snapping, spawning)
export function nearestEdge(x, z) {
  let best = null, bd = 1e18, bt = 0;
  for (const e of edges) {
    const A = nodes[e.a];
    let t = (x - A.x) * e.dx + (z - A.z) * e.dz; t = clamp(t, 0, e.len);
    const px = A.x + e.dx * t, pz = A.z + e.dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = e; bt = t; }
  }
  return { edge: best, t: bt, d: Math.sqrt(bd) };
}

// A* on the road graph -> list of node ids
export function routeNodes(fromX, fromZ, toX, toZ) {
  const s = nearestEdge(fromX, fromZ), g = nearestEdge(toX, toZ);
  if (!s.edge || !g.edge) return [];
  const starts = [s.edge.a, s.edge.b], goals = new Set([g.edge.a, g.edge.b]);
  const gScore = new Map(), came = new Map(), open = new Set();
  const hfun = (id) => Math.hypot(nodes[id].x - toX, nodes[id].z - toZ);
  for (const id of starts) { gScore.set(id, Math.hypot(nodes[id].x - fromX, nodes[id].z - fromZ)); open.add(id); }
  let found = -1;
  while (open.size) {
    let cur = -1, cf = 1e18;
    for (const id of open) { const f = gScore.get(id) + hfun(id); if (f < cf) { cf = f; cur = id; } }
    open.delete(cur);
    if (goals.has(cur)) { found = cur; break; }
    for (const eid of nodes[cur].edges) {
      const e = edges[eid], nb = otherNode(e, cur), ng = gScore.get(cur) + e.len;
      if (ng < (gScore.get(nb) ?? 1e18)) { gScore.set(nb, ng); came.set(nb, cur); open.add(nb); }
    }
  }
  if (found < 0) return [];
  const path = [found]; let c = found; while (came.has(c)) { c = came.get(c); path.unshift(c); }
  return path;
}

// ---------------- Pedestrian sidewalk graph ----------------
// 4 corners per intersection: 0:-x-z 1:+x-z 2:+x+z 3:-x+z, at WALK offset from road axes
export const WALK = 8;
export const pedNodes = [];
export const pedEdges = []; // {a,b,cross:null|'ns'|'ew', node}
for (const n of nodes) for (let c = 0; c < 4; c++) {
  const sx = (c === 1 || c === 2) ? 1 : -1, sz = (c >= 2) ? 1 : -1;
  pedNodes.push({ id: pedNodes.length, x: n.x + sx * WALK, z: n.z + sz * WALK, node: n.id, corner: c, links: [] });
}
const pid = (nodeId, c) => nodeId * 4 + c;
function pedLink(a, b, cross, nodeId) { const e = { id: pedEdges.length, a, b, cross, node: nodeId }; pedEdges.push(e); pedNodes[a].links.push(e.id); pedNodes[b].links.push(e.id); }
for (const e of edges) {
  const A = nodes[e.a], B = nodes[e.b];
  const [a0, a1, b0, b1] = e.axis === 'ew'
    ? (A.x < B.x ? [[A.id, 1], [A.id, 2], [B.id, 0], [B.id, 3]] : [[A.id, 0], [A.id, 3], [B.id, 1], [B.id, 2]])
    : (A.z < B.z ? [[A.id, 3], [A.id, 2], [B.id, 0], [B.id, 1]] : [[A.id, 0], [A.id, 1], [B.id, 3], [B.id, 2]]);
  pedLink(pid(...a0), pid(...b0), null, -1);
  pedLink(pid(...a1), pid(...b1), null, -1);
}
for (const n of nodes) {
  if (n.edges.length < 2 || n.ix < 0) continue;
  const has = (dx, dz) => n.edges.some((id) => { const e = edges[id], o = nodes[otherNode(e, n.id)]; return Math.sign(o.x - n.x) === dx && Math.sign(o.z - n.z) === dz; });
  if (has(0, -1)) pedLink(pid(n.id, 0), pid(n.id, 1), 'ns', n.id);   // crosses north arm (NS road)
  if (has(0, 1)) pedLink(pid(n.id, 3), pid(n.id, 2), 'ns', n.id);
  if (has(-1, 0)) pedLink(pid(n.id, 0), pid(n.id, 3), 'ew', n.id);
  if (has(1, 0)) pedLink(pid(n.id, 1), pid(n.id, 2), 'ew', n.id);
}
// Corners that sit in water or off the land are dropped from use
for (const p of pedNodes) p.ok = p.links.length > 0 && terrainHeight(p.x, p.z) > -0.5 && !(p.x > 486);

// ---------------- Blocks ----------------
export const blocks = [];
for (let i = 0; i < AVE_X.length - 1; i++) for (let j = 0; j < ST_Z.length - 1; j++) {
  const x0 = AVE_X[i] + ROAD_HALF, x1 = AVE_X[i + 1] - ROAD_HALF, z0 = ST_Z[j] + ROAD_HALF, z1 = ST_Z[j + 1] - ROAD_HALF;
  blocks.push({ i, j, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, lx0: x0 + 4, lx1: x1 - 4, lz0: z0 + 4, lz1: z1 - 4, district: blockDistrict(i, j) });
}
export const blockAt = (i, j) => blocks.find((b) => b.i === i && b.j === j);
export function insideBlockSlab(x, z) {
  for (let i = 0; i < AVE_X.length - 1; i++) {
    if (x < AVE_X[i] + ROAD_HALF || x > AVE_X[i + 1] - ROAD_HALF) continue;
    for (let j = 0; j < ST_Z.length - 1; j++) if (z > ST_Z[j] + ROAD_HALF && z < ST_Z[j + 1] - ROAD_HALF) return true;
  }
  return false;
}

// ---------------- Places of interest ----------------
// door: where the interaction prompt sits (on the sidewalk); face: outward heading
export const POI = {
  safehouse: { name: 'Laurel Apartments (Home)', x: -150, z: 248, kind: 'home', icon: 'home' },
  cafe: { name: 'Sol & Salt Café', x: 472, z: 30, kind: 'cafe', icon: 'food' },
  store: { name: 'Quik Corner', x: -150, z: 108, kind: 'store', icon: 'shop' },
  kiosk: { name: 'Boardwalk Kiosk', x: 500, z: -120, kind: 'store', icon: 'shop' },
  gym: { name: 'Ironbay Fitness', x: -290, z: -172, kind: 'gym', icon: 'gym' },
  beachgym: { name: 'Muscle Shore', x: 528, z: 150, kind: 'beachgym', icon: 'gym' },
  club: { name: 'Pulse Nightclub', x: 270, z: 108, kind: 'club', icon: 'club' },
  clothes: { name: 'Thread & Co', x: -430, z: -172, kind: 'clothes', icon: 'shirt' },
  dealer: { name: 'Aurelia Motors', x: -430, z: -32, kind: 'dealer', icon: 'car' },
  garage: { name: 'Navarro Garage', x: -290, z: -32, kind: 'garage', icon: 'wrench' },
  police: { name: 'Central Police', x: -10, z: -312, kind: 'police', icon: 'police' },
  hospital: { name: 'St. Aurelia Medical', x: 130, z: 248, kind: 'hospital', icon: 'hospital' },
  airport: { name: 'Skydive Desk', x: 60, z: 608, kind: 'skydive', icon: 'plane' },
  marina: { name: 'Bayside Boat Rental', x: 470, z: -618, kind: 'marina', icon: 'boat' },
  warehouse: { name: 'Pier 9 Warehouse', x: -290, z: -592, kind: 'warehouse', icon: 'box' },
  overlook: { name: 'Vista Overlook', x: -705, z: 60, kind: 'overlook', icon: 'eye' },
  villa: { name: 'Villa Mirador (for sale)', x: -780, z: -12, kind: 'villa', icon: 'home' },
  heliport: { name: 'Meridian Tower Helipad', x: 130, z: -110, kind: 'helipad', icon: 'heli' },
  charger1: { name: 'EV Charging', x: -184, z: 249, kind: 'charger', icon: 'bolt' },
  charger2: { name: 'EV Charging', x: -380, z: -49, kind: 'charger', icon: 'bolt' },
  charger3: { name: 'EV Charging', x: 186, z: -49, kind: 'charger', icon: 'bolt' },
};
export const SPAWN = { x: -150, z: 248.6, heading: Math.PI };
