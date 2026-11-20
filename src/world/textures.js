// Procedural canvas textures. Everything is generated at load: no image downloads.
import { makeCanvas, rng } from '../core/util.js';

export let ANISO = 4;
export function setAniso(a) { ANISO = a; }
function tex(canvas, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = ANISO; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function noiseFill(g, w, h, base, amt, r, size = 1) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / (size * size * 3); i++) {
    const v = (r() - 0.5) * amt; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

// Facade: one tile = 2 bays (8 m) x 2 floors (7 m). Returns {map, emissive}
const FACADES = {
  glass: { wall: '#9fb4bf', win: ['#2c4d5e', '#38627a', '#24485a'], frame: '#c8d3d8', winW: 0.92, winH: 0.86, mullion: true },
  office: { wall: '#d8d2c8', win: ['#334a57', '#2a3e4b', '#3b5566'], frame: '#9b958c', winW: 0.78, winH: 0.5 },
  stucco: { wall: '#ffffff', win: ['#3a4a55', '#2e3d47'], frame: '#f2efe8', winW: 0.34, winH: 0.42, shutters: true },
  brick: { wall: '#9c5a44', win: ['#2b3238', '#333c44'], frame: '#e8e0d0', winW: 0.4, winH: 0.48, bricks: true },
  industrial: { wall: '#b9bdbf', win: ['#4a5560'], frame: '#8d9396', winW: 0.6, winH: 0.12, ribs: true },
  hotel: { wall: '#f4efe6', win: ['#3d6b80', '#467a91'], frame: '#ffffff', winW: 0.7, winH: 0.62, balcony: true },
};
export function facade(kind, seed = 1) {
  const f = FACADES[kind], r = rng(seed * 977 + kind.length * 31);
  const W = 256, H = 224; // 8m x 7m
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const e = makeCanvas(W, H), ge = e.getContext('2d');
  noiseFill(g, W, H, f.wall, 0.08, r, 2);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  if (f.bricks) { g.strokeStyle = 'rgba(60,30,20,0.35)'; g.lineWidth = 1; for (let y = 0; y < H; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / 6) % 2 ? 0 : 6; x < W; x += 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 6); g.stroke(); } } }
  if (f.ribs) { for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 3, 0, 2, H); } }
  const bayW = W / 2, flH = H / 2;
  for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) {
    const ww = bayW * f.winW, wh = flH * f.winH;
    const x = bx * bayW + (bayW - ww) / 2, y = fy * flH + (flH - wh) * 0.45;
    const panes = f.mullion ? 1 : (kind === 'stucco' || kind === 'brick') ? 2 : 1;
    const pw = ww / panes;
    for (let p = 0; p < panes; p++) {
      const px = x + p * pw;
      g.fillStyle = f.frame; g.fillRect(px - 2, y - 2, pw + 4, wh + 4);
      const grad = g.createLinearGradient(px, y, px + pw, y + wh);
      const wc = f.win[Math.floor(r() * f.win.length)];
      grad.addColorStop(0, wc); grad.addColorStop(0.55, lighten(wc, 0.25)); grad.addColorStop(1, wc);
      g.fillStyle = grad; g.fillRect(px, y, pw - (panes > 1 ? 2 : 0), wh);
      // night lights
      if (r() < 0.42) {
        const warm = r() < 0.75; ge.fillStyle = warm ? `rgba(255,${200 + r() * 40 | 0},${130 + r() * 60 | 0},1)` : 'rgba(190,220,255,1)';
        ge.globalAlpha = 0.55 + r() * 0.45; ge.fillRect(px, y, pw - (panes > 1 ? 2 : 0), wh); ge.globalAlpha = 1;
        if (r() < 0.5) { ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(px + pw * r() * 0.6, y, pw * 0.25, wh); }
      }
    }
    if (f.shutters) { g.fillStyle = 'rgba(60,90,80,0.85)'; g.fillRect(x - 12, y, 9, wh); g.fillRect(x + ww + 3, y, 9, wh); }
    if (f.balcony) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(bx * bayW + 6, y + wh + 2, bayW - 12, 4); g.fillStyle = 'rgba(120,140,150,0.6)'; for (let k = 0; k < 12; k++) g.fillRect(bx * bayW + 8 + k * (bayW - 16) / 12, y + wh - 12, 1.5, 14); }
    if (f.mullion) { g.fillStyle = f.frame; g.fillRect(bx * bayW, fy * flH + flH - 6, bayW, 6); }
  }
  if (kind === 'office' || kind === 'glass') { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, flH - 3, W, 3); g.fillRect(0, H - 3, W, 3); }
  return { map: tex(c), emissive: tex(e) };
}
function lighten(hex, a) { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, (n >> 16) + 255 * a), g = Math.min(255, (n >> 8 & 255) + 255 * a), b = Math.min(255, (n & 255) + 255 * a); return `rgb(${r | 0},${g | 0},${b | 0})`; }

// Shop front band: 8 m wide x 4 m tall
export function shopfront(seed = 1) {
  const r = rng(seed * 31 + 7), W = 256, H = 128;
  const c = makeCanvas(W, H), g = c.getContext('2d'); const e = makeCanvas(W, H), ge = e.getContext('2d');
  noiseFill(g, W, H, '#e9e4dc', 0.06, r, 2); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const awn = ['#c4532d', '#2b7a78', '#d9a441', '#3d5a80', '#7a3e65', '#4f7942'];
  for (let b = 0; b < 2; b++) {
    const x = b * 128;
    g.fillStyle = '#2b2f33'; g.fillRect(x + 8, 34, 112, 90);
    const gl = g.createLinearGradient(x, 34, x + 120, 124); gl.addColorStop(0, '#5c7c8c'); gl.addColorStop(1, '#2f4652');
    g.fillStyle = gl; g.fillRect(x + 12, 38, 104, 82);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 62, 38, 3, 82);
    // goods silhouettes
    for (let k = 0; k < 6; k++) { g.fillStyle = `hsl(${r() * 360},40%,${40 + r() * 30}%)`; g.fillRect(x + 16 + k * 16, 92 + r() * 10, 10, 26); }
    const col = awn[Math.floor(r() * awn.length)];
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? col : '#f3efe6'; g.fillRect(x + 4 + k * 15, 14, 15, 18); }
    ge.fillStyle = 'rgba(255,214,150,0.85)'; ge.fillRect(x + 12, 38, 104, 82);
  }
  return { map: tex(c), emissive: tex(e) };
}

export function roofTex() { const r = rng(5); const c = makeCanvas(128, 128), g = c.getContext('2d'); noiseFill(g, 128, 128, '#8a8a86', 0.25, r, 1); return tex(c); }
export function asphaltTex(markings = true) {
  const r = rng(11), W = 256, H = 256; const c = makeCanvas(W, H), g = c.getContext('2d');
  noiseFill(g, W, H, '#3c3e42', 0.22, r, 1);
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`; g.beginPath(); g.ellipse(r() * W, r() * H, 10 + r() * 30, 4 + r() * 10, r() * 3, 0, 7); g.fill(); }
  if (markings) {
    // 12 m wide road across U; 12 m along V. centre double yellow, edge white
    const px = W / 12;
    g.fillStyle = '#d9b43a'; g.fillRect(W / 2 - 0.22 * px, 0, 0.12 * px, H); g.fillRect(W / 2 + 0.1 * px, 0, 0.12 * px, H);
    g.fillStyle = '#e8e8e2'; g.fillRect(0.55 * px, 0, 0.14 * px, H); g.fillRect(W - 0.69 * px, 0, 0.14 * px, H);
  }
  return tex(c);
}
export function crosswalkTex() {
  const W = 256, H = 64; const c = makeCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(235,235,228,0.92)'; g.fillRect(i * 25.6 + 5, 4, 15, H - 8); }
  const t = tex(c, false); return t;
}
export function stopLineTex() { const c = makeCanvas(64, 8), g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 64, 8); return tex(c, false); }
export function sidewalkTex() {
  const r = rng(3), W = 128, H = 128; const c = makeCanvas(W, H), g = c.getContext('2d');
  noiseFill(g, W, H, '#c9c4ba', 0.12, r, 1);
  g.strokeStyle = 'rgba(80,75,65,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, H); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(W, i * 32); g.stroke(); }
  return tex(c);
}
export function sandTex() { const r = rng(9); const c = makeCanvas(128, 128), g = c.getContext('2d'); noiseFill(g, 128, 128, '#e3cfa2', 0.18, r, 1); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(160,130,90,0.15)'; g.fillRect(r() * 128, r() * 128, 2, 1); } return tex(c); }
export function grassTex() { const r = rng(4); const c = makeCanvas(128, 128), g = c.getContext('2d'); noiseFill(g, 128, 128, '#5f8a3a', 0.3, r, 1); for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(130,170,70,0.5)' : 'rgba(40,70,25,0.4)'; g.fillRect(r() * 128, r() * 128, 1, 3); } return tex(c); }
export function woodTex() {
  const r = rng(8), W = 128, H = 128; const c = makeCanvas(W, H), g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${35 + r() * 15}%,${42 + r() * 12}%)`; g.fillRect(0, i * 16, W, 15); g.fillStyle = 'rgba(40,25,10,0.6)'; g.fillRect(0, i * 16 + 15, W, 1); for (let k = 0; k < 20; k++) { g.fillStyle = 'rgba(60,35,15,0.18)'; g.fillRect(r() * W, i * 16 + r() * 14, 10 + r() * 30, 1); } }
  return tex(c);
}
export function tileTex(a = '#e8e2d6', b = '#d6cfc0') { const c = makeCanvas(64, 64), g = c.getContext('2d'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 16, j * 16, 16, 16); } return tex(c); }
export function terrainTex() {
  // grass/dirt/rock blend handled by vertex colours; this adds grain
  const r = rng(21); const c = makeCanvas(256, 256), g = c.getContext('2d'); noiseFill(g, 256, 256, '#ffffff', 0.35, r, 2); return tex(c, true, false);
}

// Text sign with a background plate
export function signTex(text, opts = {}) {
  const W = opts.w || 512, H = opts.h || 128;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = opts.bg || '#1d2a33'; g.fillRect(0, 0, W, H);
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12); }
  g.fillStyle = opts.fg || '#ffffff';
  const fam = opts.font || '"Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
  let fs = Math.min(opts.size || 64, H * 0.72);
  g.font = `${opts.weight || 800} ${fs}px ${fam}`;
  const tw = g.measureText(text).width; if (tw > W * 0.9) { fs *= (W * 0.9) / tw; g.font = `${opts.weight || 800} ${fs}px ${fam}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (opts.glow) { g.shadowColor = opts.glow; g.shadowBlur = 24; }
  g.fillText(text, W / 2, H / 2 + 4);
  const t = tex(c, false); return t;
}
