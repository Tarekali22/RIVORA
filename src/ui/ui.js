// HUD, minimap, world map with GPS, notifications, panels and touch controls.
import * as L from '../world/layout.js';
import { T } from '../core/i18n.js';
import { clamp, fmtMoney, fmtTime, lerp, isTouch, dist } from '../core/util.js';

const $ = (s) => document.querySelector(s);
const ICON = { home: '#4ade80', food: '#ffb35c', shop: '#f472b6', gym: '#2ec4b6', club: '#c084fc', shirt: '#f9a8d4', car: '#60a5fa', wrench: '#fbbf24', police: '#93c5fd', hospital: '#f87171', plane: '#e5e7eb', boat: '#67e8f9', box: '#d6d3d1', eye: '#fde68a', heli: '#fca5a5', bolt: '#86efac' };
const DCOL = { downtown: '#3a4550', boardwalk: '#5a5146', hillside: '#3d4a33', residential: '#3e4a3c', commercial: '#4a4440', industrial: '#3c4044', airport: '#3f4448', marina: '#384a52', outskirts: '#3a4430', nightlife: '#463a4c', beach: '#8a7a55' };

export class UI {
  constructor(game) {
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.game.running && this.panelStack.length) { e.preventDefault(); this.close(); } });
    this.game = game; this.layer = $('#layer'); this.toastEl = $('#toasts'); this.subT = 0; this.hintT = 0; this.blockingUI = false;
    this.wantedEl = $('#wanted'); this.wantedEl.innerHTML = '<i></i>'.repeat(6);
    this.mm = $('#mmc'); this.mmx = this.mm.getContext('2d');
    this.touch = isTouch(); if (this.touch) document.body.classList.add('touch');
    this.waypoint = null; this.route = []; this.routeT = 0; this.mapOpen = false; this.panelStack = [];
    this._buildBaseMap();
  }
  // ---------------- notifications ----------------
  toast(title, text, kind = 'info', sec = 3.5) {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = `<b></b><span></span>`; el.querySelector('b').textContent = title; el.querySelector('span').textContent = text || '';
    this.toastEl.prepend(el); while (this.toastEl.children.length > 4) this.toastEl.lastChild.remove();
    setTimeout(() => el.remove(), sec * 1000);
  }
  subtitle(who, text, sec = 3) { if (!this.game.settings.subtitles) return; $('#subs').innerHTML = who ? `<b></b> ` : ''; if (who) $('#subs b').textContent = who + ':'; $('#subs').append(document.createTextNode(text)); this.subT = sec; }
  hint(text, sec = 2) { const h = $('#hint'); if (h.textContent !== text) h.textContent = text; this.hintT = sec; }
  objective(text, tag = 'OBJECTIVE') { const o = $('#objective'); if (!text) { o.innerHTML = ''; return; } o.innerHTML = `<b></b><span></span>`; o.querySelector('b').textContent = tag; o.querySelector('span').textContent = text; }
  prompt(key, text) { const p = $('#prompt'); if (!text) { if (p.innerHTML) p.innerHTML = ''; return; } const k = this.touch ? 'TAP' : key; const html = `<kbd>${k}</kbd><span>${text}</span>`; if (p.innerHTML !== html) p.innerHTML = html; }
  flash() { const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = 0.85; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; }); }
  damageFlash(a) { if (this.game.settings.violence === 'off') a *= 0.5; const v = $('#vignette'); v.style.boxShadow = `inset 0 0 160px 40px rgba(170,0,0,${0.25 + a * 0.5})`; clearTimeout(this._dv); this._dv = setTimeout(() => v.style.boxShadow = '', 260); }
  fade(on) { $('#fade').style.opacity = on ? 1 : 0; return new Promise((r) => setTimeout(r, 470)); }
  big(title, sub, color = '#fff', sec = 3) { const b = $('#bigtext'); b.innerHTML = `<h1></h1><p></p>`; b.querySelector('h1').textContent = title; b.querySelector('h1').style.color = color; b.querySelector('p').textContent = sub || ''; clearTimeout(this._bt); this._bt = setTimeout(() => b.innerHTML = '', sec * 1000); }
  showHUD(on) { $('#hud').classList.toggle('hidden', !on); $('#touch').classList.toggle('hidden', !on || !this.touch); document.body.classList.toggle('playing', on); }
  // ---------------- generic panels ----------------
  panel(html, opts = {}) {
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.innerHTML = `<div class="panel" role="dialog">${opts.dismiss === false ? '' : '<button class="xclose" aria-label="Close" title="Close (Esc)">✕</button>'}${html}</div>`;
    if (opts.wide) ov.querySelector('.panel').style.width = 'min(980px, 100%)';
    // only the newest panel is shown; older ones are hidden until it closes (no stacked panels)
    const prev = this.panelStack[this.panelStack.length - 1]; if (prev) prev.style.display = 'none';
    this.layer.appendChild(ov); this.panelStack.push(ov); this.blockingUI = true; this.game.input.releaseLock(); document.body.classList.add('panel-open');
    const xb = ov.querySelector('.xclose'); if (xb) xb.onclick = (e) => { e.stopPropagation(); this.close(ov); };
    ov.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.game.audio.ui('click'); if (e.target === ov && opts.dismiss !== false) this.close(ov); });
    if (opts.onClose) ov._onClose = opts.onClose;
    return ov;
  }
  close(ov) { ov = ov || this.panelStack[this.panelStack.length - 1]; if (!ov) return; ov.remove(); this.panelStack = this.panelStack.filter((p) => p !== ov); const top = this.panelStack[this.panelStack.length - 1]; if (top) top.style.display = ''; else document.body.classList.remove('panel-open'); if (ov._onClose) ov._onClose(); this.blockingUI = this.panelStack.length > 0 || this.mapOpen || (this.game.phone && this.game.phone.open && this.game.phone.blocking); }
  closeAll() { while (this.panelStack.length) this.close(); }
  confirm(title, text, yes = 'Confirm', no = 'Cancel') {
    return new Promise((res) => {
      const ov = this.panel(`<h2></h2><p></p><div class="row" style="margin-top:14px"><button class="btn primary" data-y>${yes}</button><button class="btn" data-n>${no}</button></div>`, { onClose: () => res(false) });
      ov.querySelector('h2').textContent = title; ov.querySelector('p').textContent = text;
      ov.querySelector('[data-y]').onclick = () => { ov._onClose = null; this.close(ov); res(true); };
      ov.querySelector('[data-n]').onclick = () => this.close(ov);
    });
  }
  // menu of priced items: [{id,name,price,desc,disabled}]
  shop(title, sub, items, onBuy, opts = {}) {
    const ov = this.panel(`<h2></h2><p class="sub"></p><div class="grid2 items"></div><div class="row" style="margin-top:14px"><button class="btn" data-x>Leave</button><span class="note wallet" style="margin-left:auto"></span></div>`, { wide: opts.wide });
    ov.querySelector('h2').textContent = title; ov.querySelector('.sub').textContent = sub || '';
    const grid = ov.querySelector('.items');
    const render = () => {
      grid.innerHTML = ''; ov.querySelector('.wallet').textContent = `Cash ${fmtMoney(this.game.economy.cash)} · Bank ${fmtMoney(this.game.economy.bank)}`;
      for (const it of items) {
        const b = document.createElement('button'); b.className = 'item btn'; b.disabled = !!it.disabled;
        b.innerHTML = `<div><div class="t"></div><div class="d"></div></div><div class="price"></div>`;
        b.querySelector('.t').textContent = it.name; b.querySelector('.d').textContent = it.desc || ''; b.querySelector('.price').textContent = it.label || (it.price ? fmtMoney(it.price) : 'Free');
        b.onclick = () => { const r = onBuy(it); if (r === 'close') this.close(ov); else render(); };
        grid.appendChild(b);
      }
    };
    render(); ov.querySelector('[data-x]').onclick = () => this.close(ov);
    return ov;
  }
  // ---------------- per-frame HUD ----------------
  update(dt) {
    const G = this.game, P = G.player, E = G.economy;
    this.subT -= dt; if (this.subT <= 0 && $('#subs').innerHTML) $('#subs').innerHTML = '';
    this.hintT -= dt; if (this.hintT <= 0 && $('#hint').textContent) $('#hint').textContent = '';
    const m = $('#money'); const mt = `${fmtMoney(E.cash)}<small>BANK ${fmtMoney(E.bank)}</small>`; if (m._t !== mt) { m.innerHTML = mt; m._t = mt; }
    const wl = G.police.level; const stars = this.wantedEl.children; for (let i = 0; i < 6; i++) stars[i].className = i < wl ? 'on' : ''; this.wantedEl.classList.toggle('search', G.police.searching); this.wantedEl.style.visibility = wl ? 'visible' : 'hidden';
    const ck = `${fmtTime(G.env.hour)} · Day ${G.env.day} · ${G.weatherLabel()}`; if ($('#clock')._t !== ck) { $('#clock').textContent = ck; $('#clock')._t = ck; }
    const C = 2 * Math.PI * 100 * 0.47;
    $('#hpArc').setAttribute('stroke-dasharray', `${C * clamp(P.health / P.maxHealth, 0, 1)} 999`); $('#hpArc').setAttribute('stroke', P.health < P.maxHealth * 0.3 ? '#ff4d5e' : '#4ade80');
    $('#stArc').setAttribute('stroke-dasharray', `${C * clamp(P.stamina / P.maxStamina, 0, 1)} 999`);
    // location label
    this._locT = (this._locT || 0) - dt;
    if (this._locT <= 0) { this._locT = 0.5; const d = G.interior ? null : L.districtAt(P.pos.x, P.pos.z); const st = G.interior ? G.interior.name : (L.DISTRICTS[d] || {}).name; const ne = G.interior ? null : L.nearestEdge(P.pos.x, P.pos.z); const road = ne && ne.d < 14 ? ne.edge.name : ''; const html = `${st || ''}<small>${road}</small>`; if ($('#loc')._t !== html) { $('#loc').innerHTML = html; $('#loc')._t = html; } }
    // vehicle panel
    const vEl = $('#veh');
    if (P.state === 'vehicle' && P.vehicle) {
      vEl.classList.remove('hidden'); const v = P.vehicle;
      const air = v.type === 'heli' || v.type === 'plane'; const kmh = Math.round(Math.abs(air ? Math.hypot(v.vel.x, v.vel.z) : v.speed) * 3.6);
      vEl.querySelector('.spd').textContent = kmh; vEl.querySelector('.unit').textContent = air ? `KM/H · ALT ${Math.round(v.pos.y - Math.max(0, G.city.surfaceHeight(v.pos.x, v.pos.z, v.pos.y)))} M` : (v.gear != null && v.type === 'car' ? `KM/H · ${v.gear === 'R' ? 'R' : 'G' + v.gear}` : 'KM/H');
      let bars = `<div>DMG<div class="bar"><i style="width:${v.health}%;background:${v.health < 30 ? '#ff4d5e' : '#a3e635'}"></i></div></div>`;
      if (v.battery != null) bars += `<div>BATTERY ${Math.round(v.battery)}%<div class="bar"><i style="width:${v.battery}%"></i></div></div>`;
      if (v.type === 'plane') bars += `<div>THROTTLE<div class="bar"><i style="width:${Math.round(v.throttleP * 100)}%"></i></div></div>`;
      if (vEl._b !== bars) { vEl.querySelector('.bars').innerHTML = bars; vEl._b = bars; }
    } else vEl.classList.add('hidden');
    // GPS route refresh
    const tgt = this.navTarget();
    this.routeT -= dt; if (tgt && this.routeT <= 0) { this.routeT = 1; this.route = L.routeNodes(P.pos.x, P.pos.z, tgt.x, tgt.z).map((id) => L.nodes[id]); }
    if (!tgt) this.route = [];
    if (this.waypoint && dist(P.pos.x, P.pos.z, this.waypoint.x, this.waypoint.z) < 15) { this.waypoint = null; this.toast('Waypoint reached', '', 'good', 1.5); }
    this._minimap();
    if (this.mapOpen) this._drawMap();
    if (this.touch) this._touchContext();
  }
  navTarget() { const m = this.game.missions && this.game.missions.marker(); return m || this.waypoint; }
  // ---------------- map rendering ----------------
  _buildBaseMap() {
    // world bounds for the base image
    this.W0 = -1000; this.Z0 = -800; this.MW = 1800; this.MH = 1700; this.S = 0.6;
    const c = document.createElement('canvas'); c.width = this.MW * this.S; c.height = this.MH * this.S; const g = c.getContext('2d');
    const S = this.S, X = (x) => (this.W0 + this.MW - x) * S, Z = (z) => (this.MH - (z - this.Z0)) * S; // north (+z) up, east (-x) right
    this.wx = X; this.wz = Z;
    g.fillStyle = '#123444'; g.fillRect(0, 0, c.width, c.height);
    // land by sampling terrain
    const step = 8;
    for (let x = this.W0; x < this.W0 + this.MW; x += step) for (let z = this.Z0; z < this.Z0 + this.MH; z += step) {
      const h = L.terrainHeight(x + step / 2, z + step / 2); if (h < -0.9) continue;
      const d = L.districtAt(x, z); g.fillStyle = h < 0.2 && x > 500 ? '#b9a36f' : x < -530 || z > 800 ? `rgb(${50 + h},${70 + h * 0.8},${44 + h * 0.5})` : DCOL[d] || '#3d443f';
      g.fillRect(X(x + step), Z(z + step), step * S + 0.6, step * S + 0.6);
    }
    // blocks + buildings
    for (const b of L.blocks) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(X(b.x1), Z(b.z1), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S); }
    g.fillStyle = 'rgba(10,14,18,0.55)';
    for (const bx of this.game.city.boxes) if (bx.top > 2 && bx.y0 < 1) g.fillRect(X(bx.x1), Z(bx.z1), (bx.x1 - bx.x0) * S, (bx.z1 - bx.z0) * S);
    // roads
    g.lineCap = 'round';
    for (const [w, col] of [[13 * S, '#1c2226'], [11 * S, '#8b949b']]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (const e of L.edges) { const a = L.nodes[e.a], b = L.nodes[e.b]; g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); } g.stroke(); }
    g.fillStyle = '#5b636a'; g.fillRect(X(420), Z(720), 860 * S, 40 * S); // runway
    g.fillStyle = '#c9b48a'; g.fillRect(X(506), Z(520), 20 * S, 1100 * S); // boardwalk
    g.fillRect(X(770), Z(29), 210 * S, 14 * S); // pier
    this.base = c;
  }
  _markers() {
    const G = this.game, out = [];
    for (const [k, p] of Object.entries(L.POI)) if (!k.startsWith('charger') || G.player.vehicle && G.player.vehicle.battery != null) out.push({ x: p.x, z: p.z, c: ICON[p.icon] || '#fff', r: 4, label: p.name });
    for (const c of G.city.cams) if (c.active && G.settings.showCams) out.push({ x: c.x, z: c.z, c: '#ef4444', r: 2, cam: true });
    for (const u of G.police.units) out.push({ x: u.v.pos.x, z: u.v.pos.z, c: (G.time * 4 | 0) % 2 ? '#ef4444' : '#3b82f6', r: 4 });
    for (const v of G.vehicles.list) if (v.ownedId && v !== G.player.vehicle) out.push({ x: v.pos.x, z: v.pos.z, c: '#a3e635', r: 3.5, sq: true });
    if (G.companion && !G.companion.inVehicle) out.push({ x: G.companion.pos.x, z: G.companion.pos.z, c: '#fde047', r: 2.5 });
    const m = G.missions && G.missions.marker(); if (m) out.push({ x: m.x, z: m.z, c: '#ffb35c', r: 7, ring: true, label: m.label });
    for (const mm of (G.missions ? G.missions.extraMarkers() : [])) out.push(mm);
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, c: '#c084fc', r: 6, ring: true });
    return out;
  }
  _minimap() {
    const G = this.game, P = G.player, g = this.mmx, Wd = this.mm.width, H = this.mm.height;
    const zoom = P.state === 'vehicle' ? lerp(1.4, 0.75, clamp(Math.abs(P.vehicle.speed || 0) / 40, 0, 1)) * (P.vehicle.type === 'plane' || P.vehicle.type === 'heli' ? 0.5 : 1) : 1.8;
    const rot = G.cam.yaw; // camera-up minimap
    g.save(); g.clearRect(0, 0, Wd, H); g.beginPath(); g.arc(Wd / 2, H / 2, Wd / 2, 0, 7); g.clip();
    g.fillStyle = '#0f2b38'; g.fillRect(0, 0, Wd, H);
    g.translate(Wd / 2, H / 2); g.rotate(rot - Math.PI); g.scale(zoom / this.S, zoom / this.S);
    if (G.interior) { g.restore(); g.save(); g.fillStyle = '#1b2228'; g.fillRect(0, 0, Wd, H); g.fillStyle = '#9aa'; g.font = '600 22px Figtree, sans-serif'; g.textAlign = 'center'; g.fillText(T('INDOORS'), Wd / 2, H / 2); g.restore(); return; }
    g.drawImage(this.base, -this.wx(P.pos.x), -this.wz(P.pos.z));
    // route
    const X = (x) => this.wx(x) - this.wx(P.pos.x), Z = (z) => this.wz(z) - this.wz(P.pos.z);
    if (this.route.length) { g.strokeStyle = '#ffb35c'; g.lineWidth = 6 * this.S; g.lineJoin = 'round'; g.beginPath(); g.moveTo(0, 0); for (const n of this.route) g.lineTo(X(n.x), Z(n.z)); const t = this.navTarget(); if (t) g.lineTo(X(t.x), Z(t.z)); g.stroke(); }
    for (const m of this._markers()) {
      let x = X(m.x), z = Z(m.z); const lim = (Wd / 2 - 10) * this.S / zoom, d = Math.hypot(x, z);
      if (d > lim) { if (!m.ring) continue; x *= lim / d; z *= lim / d; }
      g.fillStyle = m.c; g.beginPath(); const r = m.r / zoom * this.S * 2.2; if (m.sq) g.rect(x - r, z - r, r * 2, r * 2); else g.arc(x, z, r, 0, 7); g.fill();
      if (m.ring) { g.strokeStyle = '#fff'; g.lineWidth = 1.5 / zoom * this.S * 2; g.stroke(); }
    }
    g.restore();
    // player arrow (always centre, pointing along heading relative to camera)
    g.save(); g.translate(Wd / 2, H / 2); g.rotate(-(P.heading - rot) + Math.PI * 0);
    g.rotate(Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#0b0f12'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 11); g.lineTo(0, 6); g.lineTo(-10, 11); g.closePath(); g.stroke(); g.fill(); g.restore();
    // north marker
    const na = rot - Math.PI; g.fillStyle = '#ffb35c'; g.font = '800 22px "Big Shoulders Display", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', Wd / 2 + Math.sin(na) * (Wd / 2 - 18), H / 2 - Math.cos(na) * (H / 2 - 18));
  }
  openMap() {
    if (this.mapOpen) return this.closeMap();
    this.mapOpen = true; this.blockingUI = true; this.game.input.releaseLock();
    const el = document.createElement('div'); el.id = 'map';
    el.innerHTML = `<div class="mbar"><div><b style="font:900 26px var(--display);letter-spacing:.06em">SAN AURELIA</b><div class="note">Tap or click to place a GPS waypoint. Drag to pan, scroll or pinch to zoom.</div></div><div class="row"><button class="btn small" data-clear>Clear waypoint</button><button class="btn small" data-me>Center on me</button><button class="btn small primary" data-x>Close (M)</button></div></div><canvas></canvas><div class="legend"></div>`;
    this.layer.appendChild(el); this.mapEl = el; const cv = el.querySelector('canvas');
    const lg = el.querySelector('.legend'); lg.innerHTML = [['You', '#ffffff'], ['Mission', '#ffb35c'], ['Waypoint', '#c084fc'], ['Food', ICON.food], ['Shops', ICON.shop], ['Gyms', ICON.gym], ['Vehicles', ICON.car], ['Home', ICON.home], ['Police', ICON.police], ['Red-light cameras', '#ef4444'], ['Your vehicles', '#a3e635']].map(([t, c]) => `<span style="--c:${c}">${t}</span>`).join('');
    const P = this.game.player; this.mv = { cx: P.pos.x, cz: P.pos.z, zoom: 1.1 };
    let drag = null, moved = 0; const pts = new Map();
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY }; moved = 0; });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId);
      if (pts.size === 2) { const o = [...pts.entries()].find(([k]) => k !== e.pointerId)[1]; const d0 = Math.hypot(prev.x - o.x, prev.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y); this.mv.zoom = clamp(this.mv.zoom * d1 / Math.max(1, d0), 0.35, 4); }
      else { const dx = e.clientX - prev.x, dy = e.clientY - prev.y; moved += Math.abs(dx) + Math.abs(dy); this.mv.cx += dx / (this.mv.zoom * this._mapScale); this.mv.cz += dy / (this.mv.zoom * this._mapScale); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    cv.addEventListener('pointerup', (e) => { pts.delete(e.pointerId); if (moved < 8 && drag) { const r = cv.getBoundingClientRect(); const w = this._screenToWorld(e.clientX - r.left, e.clientY - r.top, cv); this.waypoint = { x: w.x, z: w.z }; this.routeT = 0; this.game.audio.ui('ding'); } drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.mv.zoom = clamp(this.mv.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 0.35, 4); }, { passive: false });
    el.querySelector('[data-x]').onclick = () => this.closeMap();
    el.querySelector('[data-clear]').onclick = () => { this.waypoint = null; };
    el.querySelector('[data-me]').onclick = () => { this.mv.cx = P.pos.x; this.mv.cz = P.pos.z; };
  }
  closeMap() { if (this.mapEl) this.mapEl.remove(); this.mapEl = null; this.mapOpen = false; this.blockingUI = this.panelStack.length > 0; }
  _screenToWorld(sx, sy, cv) { const k = this.mv.zoom * this._mapScale; return { x: this.mv.cx - (sx - cv.clientWidth / 2) / k, z: this.mv.cz - (sy - cv.clientHeight / 2) / k }; }
  _drawMap() {
    const cv = this.mapEl.querySelector('canvas'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._mapScale = Math.min(w, h) / 900; const k = this.mv.zoom * this._mapScale;
    g.fillStyle = '#0f2b38'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.scale(k / this.S, k / this.S); g.drawImage(this.base, -this.wx(this.mv.cx), -this.wz(this.mv.cz)); g.restore();
    const X = (x) => w / 2 - (x - this.mv.cx) * k, Z = (z) => h / 2 - (z - this.mv.cz) * k;
    if (this.route.length) { g.strokeStyle = '#ffb35c'; g.lineWidth = 4; g.beginPath(); const P = this.game.player.pos; g.moveTo(X(P.x), Z(P.z)); for (const n of this.route) g.lineTo(X(n.x), Z(n.z)); const t = this.navTarget(); if (t) g.lineTo(X(t.x), Z(t.z)); g.stroke(); }
    g.font = '600 12px Figtree, sans-serif'; g.textAlign = 'left';
    for (const m of this._markers()) { g.fillStyle = m.c; g.beginPath(); g.arc(X(m.x), Z(m.z), m.ring ? 7 : m.r + 1, 0, 7); g.fill(); if (m.ring) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); } if (m.label && this.mv.zoom > 0.9) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(T(m.label), X(m.x) + 8, Z(m.z) + 4); } }
    const P = this.game.player; g.save(); g.translate(X(P.pos.x), Z(P.pos.z)); g.rotate(-P.heading); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill(); g.restore();
    // district labels
    g.font = '800 16px "Big Shoulders Display", sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)'; g.textAlign = 'center';
    for (const [n, x, z] of [['DOWNTOWN', 60, -120], ['CORAL BOARDWALK', 520, -300], ['VISTA HEIGHTS', -780, -60], ['LAUREL PARK', -150, 330], ['MERCADO', -360, -120], ['FOUNDRY PORT', -150, -560], ['AIRPORT', 0, 700], ['NEON ROW', 270, 170], ['BAYSIDE MARINA', 470, -700], ['PACIFIC', 760, 200], ['EL NOUR QUARTER', -360, 240]]) g.fillText(T(n), X(x), Z(z));
  }
  // ---------------- touch controls ----------------
  setupTouch() {
    const G = this.game, I = G.input; if (!this.touch) return; I.touch = true;
    const stick = $('#stick'), knob = stick.querySelector('i'); let sid = null, sx = 0, sy = 0;
    const lz = $('#touch .lz'), rz = $('#touch .rz');
    lz.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; sx = t.clientX; sy = t.clientY; stick.style.display = 'block'; stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; e.preventDefault(); }, { passive: false });
    lz.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { let dx = t.clientX - sx, dy = t.clientY - sy; const d = Math.hypot(dx, dy), m = 52; if (d > m) { dx *= m / d; dy *= m / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; I.stick.x = dx / m; I.stick.y = -dy / m; } e.preventDefault(); }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; I.stick.x = I.stick.y = 0; stick.style.display = 'none'; knob.style.transform = ''; } };
    lz.addEventListener('touchend', end); lz.addEventListener('touchcancel', end);
    const look = new Map();
    rz.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) look.set(t.identifier, { x: t.clientX, y: t.clientY }); e.preventDefault(); }, { passive: false });
    rz.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { const p = look.get(t.identifier); if (!p) continue; I.addLook(t.clientX - p.x, t.clientY - p.y); look.set(t.identifier, { x: t.clientX, y: t.clientY }); } e.preventDefault(); }, { passive: false });
    const lend = (e) => { for (const t of e.changedTouches) look.delete(t.identifier); }; rz.addEventListener('touchend', lend); rz.addEventListener('touchcancel', lend);
    const top = $('#ttop'); top.innerHTML = '';
    for (const [a, label] of [['pause', 'II'], ['phone', 'PHONE'], ['map', 'MAP']]) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('touchstart', (e) => { e.preventDefault(); I.tap(a); }, { passive: false }); top.appendChild(b); }
    this._ctx = '';
  }
  _touchContext() {
    const G = this.game, P = G.player; let ctx = 'foot', set;
    if (P.state === 'vehicle') { const t = P.vehicle.type; ctx = t; }
    else if (P.state === 'freefall' || P.state === 'parachute') ctx = 'air';
    else if (P.state === 'swim') ctx = 'swim';
    else if (P.state === 'activity' || P.state === 'sit') ctx = 'act';
    else if (P.state === 'foot' && P.gunReady) ctx = 'gun'; // a drawn gun: hold FIRE (aim / reload / switch are the round buttons beside it)
    if (ctx === this._ctx) return; this._ctx = ctx;
    const S = { foot: [['punch', 'PUNCH'], ['kick', 'KICK'], ['jump', 'JUMP'], ['block', 'BLOCK', 1], ['interact', 'USE'], ['sprint', 'RUN', 1], ['dodge', 'DODGE'], ['vehicle', 'ENTER'], ['crouch', 'CROUCH', 1]],
      gun: [['punch', 'FIRE', 1], ['jump', 'JUMP'], ['interact', 'USE'], ['sprint', 'RUN', 1], ['dodge', 'DODGE'], ['vehicle', 'ENTER'], ['crouch', 'CROUCH', 1]],
      car: [['jump', 'BRAKE', 1], ['horn', 'HORN'], ['vehicle', 'EXIT'], ['lights', 'LIGHTS'], ['radio', 'RADIO'], ['camera', 'VIEW']], bike: [['jump', 'BRAKE', 1], ['horn', 'HORN'], ['vehicle', 'EXIT'], ['camera', 'VIEW']], boat: [['vehicle', 'EXIT'], ['horn', 'HORN'], ['camera', 'VIEW']],
      heli: [['jump', 'UP', 1], ['crouch', 'DOWN', 1], ['vehicle', 'EXIT'], ['camera', 'VIEW']], plane: [['sprint', 'THR +', 1], ['crouch', 'THR −', 1], ['vehicle', 'EXIT'], ['camera', 'VIEW']],
      air: [['jump', 'CHUTE']], swim: [['sprint', 'FAST', 1], ['jump', 'CLIMB']], act: [['interact', 'STOP'], ['jump', 'REP'], ['punch', 'REP']] }[ctx];
    const box = $('#tbtns'); box.innerHTML = '';
    for (const [a, label, hold] of S) {
      const b = document.createElement('button'); b.textContent = label;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); if (hold) { this.game.input.setVirtual(a, true); b.classList.add('on'); } else this.game.input.tap(a); }, { passive: false });
      const up = (e) => { e.preventDefault(); if (hold) { this.game.input.setVirtual(a, false); b.classList.remove('on'); } };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
      box.appendChild(b);
    }
  }
}
