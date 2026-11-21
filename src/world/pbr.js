// Physically based surface detail generated in code: height → normal maps, roughness maps,
// high-resolution asphalt (aggregate, cracks, patches, oil), sidewalk tiles and weathered plaster.
import { makeCanvas, rng } from '../core/util.js';

let ANISO = 8; export function setPbrAniso(a) { ANISO = a; }
export function canvasTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}
// Sobel filter on a grey height canvas → tangent-space normal map
export function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h), og = out.getContext('2d'), img = og.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  og.putImageData(img, 0, 0); return canvasTex(out, { srgb: false });
}
function speckle(g, w, h, r, n, col, size) { g.fillStyle = col; for (let i = 0; i < n; i++) { const s = size * (0.4 + r()); g.fillRect(r() * w, r() * h, s, s); } }
function crack(g, r, x, y, len, wdt) { g.beginPath(); g.moveTo(x, y); let a = r() * 6.28; for (let i = 0; i < len; i++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); if (r() < 0.08) { const bx = x, by = y; g.moveTo(bx, by); } } g.lineWidth = wdt; g.stroke(); }

// Asphalt: albedo (aggregate + repairs + oil), roughness (patches and ruts are smoother → read as wet when it rains), normal (cracks, aggregate)
export function asphaltHD(seed = 3, size = 512) {
  const r = rng(seed), W = size, H = size;
  const c = makeCanvas(W, H), g = c.getContext('2d'), hc = makeCanvas(W, H), hg = hc.getContext('2d', { willReadFrequently: true }), rc = makeCanvas(W, H), rg = rc.getContext('2d');
  g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, W, H); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H); rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, W, H);
  // aggregate
  for (let i = 0; i < W * H / 9; i++) { const x = r() * W, y = r() * H, v = r(); g.fillStyle = v < 0.5 ? 'rgba(20,20,22,.35)' : v < 0.85 ? 'rgba(95,96,98,.32)' : 'rgba(150,148,140,.35)'; g.fillRect(x, y, 1.4, 1.4); hg.fillStyle = v < 0.5 ? 'rgba(60,60,60,.5)' : 'rgba(200,200,200,.45)'; hg.fillRect(x, y, 1.4, 1.4); }
  // tonal variation
  for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rad = 30 + r() * 90, grd = g.createRadialGradient(x, y, 0, x, y, rad); const dark = r() < 0.5; grd.addColorStop(0, dark ? 'rgba(15,15,18,.18)' : 'rgba(120,118,112,.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // repaired patches (darker, smoother)
  for (let i = 0; i < 3; i++) { const x = r() * W, y = r() * H, pw = 40 + r() * 120, ph = 30 + r() * 80; g.fillStyle = 'rgba(22,23,26,.55)'; g.fillRect(x, y, pw, ph); rg.fillStyle = '#9a9a9a'; rg.fillRect(x, y, pw, ph); hg.strokeStyle = 'rgba(40,40,40,.9)'; hg.lineWidth = 2; hg.strokeRect(x, y, pw, ph); }
  // cracks
  g.strokeStyle = 'rgba(10,10,12,.75)'; hg.strokeStyle = 'rgba(0,0,0,1)';
  for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, len = 8 + r() * 30, wd = 0.8 + r() * 1.4; const s = r() * 1e6 | 0; crack(g, rng(s), x, y, len, wd); crack(hg, rng(s), x, y, len, wd + 1); }
  // oil stains (glossy)
  for (let i = 0; i < 5; i++) { const x = r() * W, y = r() * H, rad = 8 + r() * 26, grd = g.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, 'rgba(8,8,10,.45)'); grd.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); const gr2 = rg.createRadialGradient(x, y, 0, x, y, rad); gr2.addColorStop(0, '#606060'); gr2.addColorStop(1, 'rgba(224,224,224,0)'); rg.fillStyle = gr2; rg.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // shallow depressions where puddles gather (smooth + slightly darker)
  for (let i = 0; i < 4; i++) { const x = r() * W, y = r() * H, rad = 20 + r() * 50; const gr = rg.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, '#404040'); gr.addColorStop(1, 'rgba(224,224,224,0)'); rg.fillStyle = gr; rg.fillRect(x - rad, y - rad, rad * 2, rad * 2); const gh = hg.createRadialGradient(x, y, 0, x, y, rad); gh.addColorStop(0, 'rgba(70,70,70,.6)'); gh.addColorStop(1, 'rgba(128,128,128,0)'); hg.fillStyle = gh; hg.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  return { map: canvasTex(c), normal: normalFromHeight(hc, 3.2), rough: canvasTex(rc, { srgb: false }) };
}
// Concrete sidewalk tiles 50 cm with grooves, chips and stains
export function sidewalkHD(seed = 5, size = 512, tiles = 8, base = '#bdb8ae') {
  const r = rng(seed), W = size, H = size, ts = W / tiles;
  const c = makeCanvas(W, H), g = c.getContext('2d'), hc = makeCanvas(W, H), hg = hc.getContext('2d', { willReadFrequently: true }), rc = makeCanvas(W, H), rg = rc.getContext('2d');
  rg.fillStyle = '#d8d8d8'; rg.fillRect(0, 0, W, H);
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const v = (r() - 0.5) * 18; const col = shade(base, v); g.fillStyle = col; g.fillRect(tx * ts, ty * ts, ts, ts);
    hg.fillStyle = `rgb(${150 + (r() * 10 | 0)},${150},${150})`; hg.fillRect(tx * ts, ty * ts, ts, ts);
  }
  speckle(g, W, H, r, W * H / 30, 'rgba(80,76,70,.18)', 1.6); speckle(g, W, H, r, W * H / 60, 'rgba(255,255,255,.12)', 1.4);
  g.strokeStyle = 'rgba(70,66,60,.55)'; hg.strokeStyle = '#303030'; g.lineWidth = 2; hg.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) { for (const G of [g, hg]) { G.beginPath(); G.moveTo(i * ts, 0); G.lineTo(i * ts, H); G.moveTo(0, i * ts); G.lineTo(W, i * ts); G.stroke(); } }
  for (let i = 0; i < 6; i++) { const x = r() * W, y = r() * H, rad = 10 + r() * 30, grd = g.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, 'rgba(60,50,40,.22)'); grd.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  g.strokeStyle = 'rgba(50,48,44,.5)'; hg.strokeStyle = '#000'; for (let i = 0; i < 3; i++) { const s = r() * 1e6 | 0, x = r() * W, y = r() * H; crack(g, rng(s), x, y, 5 + r() * 8, 0.8); crack(hg, rng(s), x, y, 5 + r() * 8, 1.5); }
  return { map: canvasTex(c), normal: normalFromHeight(hc, 2.4), rough: canvasTex(rc, { srgb: false }) };
}
export function shade(hex, v) { const n = parseInt(hex.slice(1), 16); const f = (x) => Math.max(0, Math.min(255, x + v)) | 0; return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

// Weathered plaster facade (Egyptian apartment style): 2 bays × 2 floors on 8 m × 7 m, with shutters, sills, AC streaks.
// Returns albedo, night-light emissive, normal and roughness maps.
export function plasterFacade(seed = 11) {
  const r = rng(seed), W = 512, H = 448, bayW = W / 2, flH = H / 2;
  const c = makeCanvas(W, H), g = c.getContext('2d'), e = makeCanvas(W, H), ge = e.getContext('2d'), hc = makeCanvas(W, H), hg = hc.getContext('2d', { willReadFrequently: true }), rc = makeCanvas(W, H), rg = rc.getContext('2d');
  g.fillStyle = '#d9cfbd'; g.fillRect(0, 0, W, H); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H); rg.fillStyle = '#e8e8e8'; rg.fillRect(0, 0, W, H);
  // plaster grain and blotches
  for (let i = 0; i < W * H / 14; i++) { const x = r() * W, y = r() * H, v = r(); g.fillStyle = v < 0.5 ? 'rgba(120,105,85,.10)' : 'rgba(255,255,250,.10)'; g.fillRect(x, y, 2, 2); hg.fillStyle = v < 0.5 ? 'rgba(90,90,90,.25)' : 'rgba(170,170,170,.25)'; hg.fillRect(x, y, 2, 2); }
  for (let i = 0; i < 18; i++) { const x = r() * W, y = r() * H, rad = 20 + r() * 70, grd = g.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, r() < 0.6 ? 'rgba(110,90,60,.14)' : 'rgba(255,250,240,.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // floor band (slab edge)
  for (let fy = 0; fy < 2; fy++) { const y = fy * flH + flH - 10; g.fillStyle = 'rgba(150,135,110,.35)'; g.fillRect(0, y, W, 10); hg.fillStyle = '#b0b0b0'; hg.fillRect(0, y, W, 10); }
  for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) {
    const ww = 96, wh = 128, x = bx * bayW + (bayW - ww) / 2, y = fy * flH + 40;
    const style = r();
    // sill + lintel
    g.fillStyle = '#d6cdbb'; g.fillRect(x - 10, y + wh, ww + 20, 9); g.fillRect(x - 6, y - 10, ww + 12, 8); hg.fillStyle = '#e0e0e0'; hg.fillRect(x - 10, y + wh, ww + 20, 9); hg.fillStyle = '#c8c8c8'; hg.fillRect(x - 6, y - 10, ww + 12, 8);
    // dirt streaks under the sill
    const sg = g.createLinearGradient(0, y + wh + 9, 0, y + wh + 70); sg.addColorStop(0, 'rgba(70,60,45,.30)'); sg.addColorStop(1, 'rgba(70,60,45,0)'); g.fillStyle = sg; g.fillRect(x - 4, y + wh + 9, 6, 60); g.fillRect(x + ww - 2, y + wh + 9, 6, 60);
    // opening (recessed, dark glass)
    g.fillStyle = '#1c2228'; g.fillRect(x, y, ww, wh); hg.fillStyle = '#202020'; hg.fillRect(x, y, ww, wh); rg.fillStyle = '#1a1a1a'; rg.fillRect(x, y, ww, wh);
    const lit = r() < 0.45; if (lit) { const warm = r() < 0.8; ge.fillStyle = warm ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 50 | 0},1)` : 'rgba(200,230,255,1)'; ge.globalAlpha = 0.5 + r() * 0.5; ge.fillRect(x, y, ww, wh); ge.globalAlpha = 1; }
    if (style < 0.55) { // wooden/green slatted shutters (شيش), sometimes one leaf open
      const col = r() < 0.5 ? '#5d6b4a' : r() < 0.5 ? '#6a4a32' : '#7d7a6e'; const open = r();
      const leaf = (lx, lw) => { g.fillStyle = col; g.fillRect(lx, y, lw, wh); for (let k = 0; k < wh; k += 6) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(lx, y + k, lw, 2); hg.fillStyle = '#9a9a9a'; hg.fillRect(lx, y + k, lw, 3); hg.fillStyle = '#6a6a6a'; hg.fillRect(lx, y + k + 3, lw, 3); } rg.fillStyle = '#c8c8c8'; rg.fillRect(lx, y, lw, wh); if (lit) { ge.fillStyle = 'rgba(0,0,0,.82)'; ge.fillRect(lx, y, lw, wh); } };
      if (open < 0.35) leaf(x, ww); else if (open < 0.75) leaf(x, ww / 2); else { leaf(x - ww / 2 + 2, ww / 2 - 4); }
    } else { // aluminium sliding window with frame and glare
      g.fillStyle = '#b8bcbf'; g.fillRect(x, y, ww, 5); g.fillRect(x, y + wh - 5, ww, 5); g.fillRect(x, y, 5, wh); g.fillRect(x + ww - 5, y, 5, wh); g.fillRect(x + ww / 2 - 2, y, 4, wh);
      hg.fillStyle = '#c0c0c0'; hg.fillRect(x, y, ww, 5); hg.fillRect(x, y + wh - 5, ww, 5); hg.fillRect(x + ww / 2 - 2, y, 4, wh);
      const gl = g.createLinearGradient(x, y, x + ww, y + wh); gl.addColorStop(0, 'rgba(180,205,220,.25)'); gl.addColorStop(0.5, 'rgba(255,255,255,.05)'); gl.addColorStop(1, 'rgba(150,180,200,.18)'); g.fillStyle = gl; g.fillRect(x + 5, y + 5, ww - 10, wh - 10);
      rg.fillStyle = '#101010'; rg.fillRect(x + 5, y + 5, ww - 10, wh - 10);
      if (r() < 0.4) { g.fillStyle = 'rgba(40,40,40,.85)'; for (let k = x + 10; k < x + ww; k += 14) g.fillRect(k, y, 3, wh); } // iron grill
      if (lit && r() < 0.5) { ge.fillStyle = 'rgba(0,0,0,.5)'; ge.fillRect(x + ww * 0.55, y, ww * 0.45, wh); } // curtain
    }
  }
  // hairline cracks
  g.strokeStyle = 'rgba(90,80,65,.35)'; hg.strokeStyle = '#404040'; for (let i = 0; i < 4; i++) { const s = r() * 1e6 | 0, x = r() * W, y = r() * H; crack(g, rng(s), x, y, 6 + r() * 10, 1); crack(hg, rng(s), x, y, 6 + r() * 10, 1.5); }
  return { map: canvasTex(c), emissive: canvasTex(e), normal: normalFromHeight(hc, 2.2), rough: canvasTex(rc, { srgb: false }) };
}
// Generic facade detail: add a normal + roughness map to an existing facade albedo (window rectangles detected by darkness)
export function detailFromAlbedo(tex, strength = 1.6) {
  const img = tex.image; if (!img || !img.width) return null;
  const sc = Math.min(1, 512 / Math.max(img.width, img.height)), W = Math.round(img.width * sc), H = Math.round(img.height * sc), hc = makeCanvas(W, H), hg = hc.getContext('2d', { willReadFrequently: true }); hg.drawImage(img, 0, 0, W, H);
  const id = hg.getImageData(0, 0, W, H), d = id.data, rc = makeCanvas(W, H), rgx = rc.getContext('2d'), rd = rgx.createImageData(W, H);
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11); const dark = l < 90; const v = dark ? 40 : 110 + l * 0.35; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; const rv = dark ? 25 : 215; rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = rv; rd.data[i + 3] = 255; }
  hg.putImageData(id, 0, 0); rgx.putImageData(rd, 0, 0);
  return { normal: normalFromHeight(hc, strength), rough: canvasTex(rc, { srgb: false }) };
}

// Wind sway for any instanced foliage material (trees, pines) sharing the palms' wind uniforms
export function addWind(mat, U, base = 1.5, height = 6, amp = 0.35) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ipw = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float hw = max(position.y - ${base.toFixed(2)}, 0.0) / ${height.toFixed(2)}; hw *= hw;
      transformed.x += sin(uTime*1.7 + ipw.x*0.11 + ipw.z*0.07) * (0.25 + uWind) * hw * ${amp.toFixed(2)};
      transformed.z += cos(uTime*1.4 + ipw.z*0.09) * (0.25 + uWind) * hw * ${(amp * 0.7).toFixed(2)};`);
  };
  mat.needsUpdate = true;
}
// Apply PBR detail to the city's shared materials (keeps their albedo where it carries road markings)
export function upgradeCityMaterials(city, quality) {
  const M = city.M, hi = (quality && quality.level >= 3), size = hi ? 1024 : 512; // 1024 px maps only on Ultra (memory)
  try {
    const asp = asphaltHD(7, size);
    for (const m of [M.road, M.asphalt]) { m.normalMap = asp.normal; m.normalScale = new THREE.Vector2(0.85, 0.85); m.roughnessMap = asp.rough; m.roughness = 0.95; m.needsUpdate = true; }
    M.asphalt.map = asp.map; M.asphalt.color = new THREE.Color(1, 1, 1);
    const sw = sidewalkHD(5, size);
    M.sidewalk.map = sw.map; M.sidewalk.normalMap = sw.normal; M.sidewalk.normalScale = new THREE.Vector2(0.7, 0.7); M.sidewalk.roughnessMap = sw.rough; M.sidewalk.needsUpdate = true;
    for (const k of Object.keys(city.F)) { const f = city.F[k]; if (!f.map || f.normalMap) continue; const d = detailFromAlbedo(f.map, k === 'brick' ? 2.6 : 1.6); if (d) { f.normalMap = d.normal; f.normalScale = new THREE.Vector2(0.8, 0.8); f.roughnessMap = d.rough; f.needsUpdate = true; } }
    if (M.glass) { M.glass.envMapIntensity = 1.4; M.glass.roughness = 0.04; }
    if (M.metal) M.metal.envMapIntensity = 1.1;
  } catch (e) { console.warn('[RIVORA] PBR upgrade skipped', e); }
}

export function egyptShopfront(seed = 21) {
  const r = rng(seed), W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d'), e = makeCanvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let bay = 0; bay < 2; bay++) {
    const x0 = bay * 256;
    // tiled pillars
    for (const px of [x0, x0 + 236]) { g.fillStyle = r() < 0.5 ? '#c9c3b6' : '#b7c4c9'; g.fillRect(px, 0, 20, H); g.strokeStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < H; y += 20) { g.beginPath(); g.moveTo(px, y); g.lineTo(px + 20, y); g.stroke(); } }
    // interior: back wall, shelves with goods, counter
    const ix = x0 + 20, iw = 216, top = 54; g.fillStyle = '#3b3026'; g.fillRect(ix, top, iw, H - top);
    for (let sh = 0; sh < 4; sh++) { const y = top + 22 + sh * 38; g.fillStyle = '#6a5a48'; g.fillRect(ix + 6, y + 26, iw - 12, 5); for (let k = ix + 8; k < ix + iw - 10; k += 7 + r() * 7) { g.fillStyle = `hsl(${r() * 360 | 0},${50 + r() * 40 | 0}%,${35 + r() * 35 | 0}%)`; const bh = 10 + r() * 15; g.fillRect(k, y + 26 - bh, 5 + r() * 4, bh); } }
    g.fillStyle = '#5b4b3a'; g.fillRect(ix + 20, H - 46, iw - 40, 46); g.fillStyle = '#8a775f'; g.fillRect(ix + 20, H - 48, iw - 40, 4);
    // warm/cold interior light at night
    const warm = r() < 0.6; ge.fillStyle = warm ? 'rgba(255,214,150,.75)' : 'rgba(210,235,255,.8)'; ge.fillRect(ix, top, iw, H - top); ge.fillStyle = 'rgba(0,0,0,.35)'; for (let sh = 0; sh < 4; sh++) ge.fillRect(ix + 6, top + 48 + sh * 38, iw - 12, 6);
    // roll-up shutter, partly down
    const down = top + r() * 40; g.fillStyle = '#9aa0a3'; g.fillRect(ix, 0, iw, down); g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 2; y < down; y += 6) g.fillRect(ix, y, iw, 2); g.fillStyle = '#6d7275'; g.fillRect(ix, down - 4, iw, 4);
    ge.fillStyle = '#000'; ge.fillRect(ix, 0, iw, down);
    // fluorescent tube
    g.fillStyle = '#f4f7f2'; g.fillRect(ix + 40, down + 4, iw - 80, 4); ge.fillStyle = '#fff'; ge.fillRect(ix + 40, down + 4, iw - 80, 4);
  }
  return { map: canvasTex(c), emissive: canvasTex(e) };
}
