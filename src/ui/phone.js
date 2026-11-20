// In-game smartphone: calls, messages, jobs, map, bank, garage, camera, photos, fitness, companion, settings.
import { CONTACTS } from '../data/content.js';
import { VEHICLES } from '../data/vehicles.js';
import { fmtMoney, fmtTime, bus, R } from '../core/util.js';
import * as L from '../world/layout.js';

const APPS = [
  ['messages', 'Messages', '#22c55e', 'M'], ['contacts', 'Contacts', '#3b82f6', 'C'], ['jobs', 'Jobs', '#ff7a45', 'J'], ['map', 'Maps', '#14b8a6', 'N'],
  ['bank', 'Bank', '#0f766e', '$'], ['garage', 'Garage', '#64748b', 'G'], ['camera', 'Camera', '#111827', '◉'], ['photos', 'Photos', '#f59e0b', 'P'],
  ['fitness', 'Fitness', '#ef4444', 'F'], ['pet', 'Companion', '#a855f7', 'C'], ['calls', 'Calls', '#16a34a', '☏'], ['settings', 'Settings', '#475569', 'S'],
];
export class Phone {
  constructor(game) { this.game = game; this.open = false; this.app = null; this.threads = {}; this.unread = 0; this.calls = []; this.photos = []; this.incoming = null; this.blocking = false; this.el = null; }
  toggle() { this.open ? this.close() : this.show(); }
  show(app = null) {
    const G = this.game; if (this.el) this.el.remove();
    this.open = true; this.app = app; G.input.releaseLock();
    const el = document.createElement('div'); el.id = 'phone'; el.innerHTML = `<div class="scr"><div class="sb"><span class="tm"></span><span>5G ▮▮▮ 87%</span></div><div class="body"></div></div>`;
    document.getElementById('layer').appendChild(el); this.el = el;
    el.addEventListener('click', (e) => { if (e.target.closest('button')) G.audio.ui('click'); });
    if (G.player.state === 'foot' && !G.player.action) G.player.holdItem('phoneText');
    this.render(); bus.emit('phoneOpen');
  }
  close() { if (this.incoming) return; this.open = false; if (this.el) this.el.remove(); this.el = null; this.game.player.dropItem('phoneText'); bus.emit('phoneClose'); }
  render() {
    if (!this.el) return; const b = this.el.querySelector('.body'); this.el.querySelector('.tm').textContent = fmtTime(this.game.env.hour);
    if (this.incoming) return this._renderCall();
    const page = this.app; b.innerHTML = '';
    if (!page) {
      const grid = document.createElement('div'); grid.className = 'apps';
      for (const [id, name, col, ic] of APPS) {
        const a = document.createElement('button'); a.className = 'app'; a.innerHTML = `<i style="background:${col}">${ic}</i>${name}`;
        if (id === 'messages' && this.unread) a.insertAdjacentHTML('beforeend', `<em>${this.unread}</em>`);
        if (id === 'calls' && this.calls.some((c) => c.missed && !c.seen)) a.insertAdjacentHTML('beforeend', `<em>!</em>`);
        a.onclick = () => { if (id === 'map') { this.close(); this.game.ui.openMap(); return; } if (id === 'camera') { this.takePhoto(); return; } this.app = id; this.render(); };
        grid.appendChild(a);
      }
      b.appendChild(grid);
      const tip = document.createElement('div'); tip.className = 'page'; tip.style.minHeight = '0'; tip.style.marginTop = '8px';
      const m = this.game.missions; tip.innerHTML = `<div class="li"><b>Now</b><small></small></div>`; tip.querySelector('small').textContent = m.active ? m.active.title + ' — ' + (m.objectiveText || '') : 'Free roam. Check Jobs for work.';
      b.appendChild(tip);
      return;
    }
    const p = document.createElement('div'); p.className = 'page'; b.appendChild(p);
    const back = document.createElement('button'); back.className = 'back'; back.textContent = '‹ Home'; back.onclick = () => { this.app = this.app.startsWith('thread:') ? 'messages' : null; this.render(); }; p.appendChild(back);
    const h = (t) => { const e = document.createElement('h4'); e.textContent = t; p.appendChild(e); };
    const li = (title, sub, btns = []) => { const d = document.createElement('div'); d.className = 'li'; d.innerHTML = '<b></b><small></small><div></div>'; d.querySelector('b').textContent = title; d.querySelector('small').textContent = sub || ''; for (const [label, fn, alt] of btns) { const x = document.createElement('button'); x.className = 'pbtn' + (alt ? ' alt' : ''); x.textContent = label; x.onclick = fn; d.lastChild.appendChild(x); } p.appendChild(d); return d; };
    const G = this.game;
    if (page === 'messages') { h('Messages'); const ids = Object.keys(this.threads); if (!ids.length) li('No messages yet', ''); for (const id of ids) { const t = this.threads[id]; const last = t.msgs[t.msgs.length - 1]; li(CONTACTS[id] ? CONTACTS[id].name : id, (t.unread ? '● ' : '') + (last ? last.text.slice(0, 60) : ''), [['Open', () => { this.app = 'thread:' + id; this.render(); }]]); } }
    else if (page.startsWith('thread:')) {
      const id = page.slice(7), t = this.threads[id]; h(CONTACTS[id] ? CONTACTS[id].name : id);
      this.unread -= t.unread || 0; t.unread = 0;
      for (const m of t.msgs) { const d = document.createElement('div'); d.className = 'msg' + (m.me ? ' me' : ''); d.textContent = m.text; if (m.img) { const im = document.createElement('img'); im.className = 'target-photo'; im.src = m.img; im.alt = 'Photo attachment'; d.prepend(im); } if (m.coords) { const g = document.createElement('button'); g.className = 'pbtn'; g.textContent = 'Set GPS'; g.onclick = () => { G.ui.waypoint = { x: m.coords.x, z: m.coords.z }; G.ui.routeT = 0; G.ui.toast('GPS set', m.coords.label || 'Destination marked', 'info', 2); }; d.appendChild(g); } if (m.actions) for (const [label, fn] of m.actions) { const x = document.createElement('button'); x.className = 'pbtn'; x.textContent = label; x.onclick = () => { fn(); m.actions = null; this.render(); }; d.appendChild(x); } p.appendChild(d); }
      if (CONTACTS[id] && !CONTACTS[id].system) { const c = document.createElement('button'); c.className = 'pbtn'; c.textContent = 'Call ' + CONTACTS[id].name.split(' ')[0]; c.onclick = () => this.callOut(id); p.appendChild(c); }
    }
    else if (page === 'contacts') { h('Contacts'); for (const [id, c] of Object.entries(CONTACTS)) { if (c.system || !G.contacts.has(id)) continue; li(c.name, c.role + (G.relations[id] ? ` · Friendship ${G.relations[id]}` : ''), [['Call', () => this.callOut(id)], ['Text', () => { this.app = 'thread:' + id; this.threads[id] = this.threads[id] || { msgs: [] }; this.render(); }, true]]); } }
    else if (page === 'calls') { h('Recent calls'); if (!this.calls.length) li('No calls', ''); for (const c of this.calls.slice(0, 15)) { c.seen = true; li(CONTACTS[c.id] ? CONTACTS[c.id].name : c.id, (c.missed ? 'Missed · ' : c.out ? 'Outgoing · ' : 'Incoming · ') + c.t, c.missed ? [['Call back', () => this.callOut(c.id)]] : []); } }
    else if (page === 'jobs') { h('Jobs & activities'); for (const j of G.missions.jobList()) li(j.title, j.desc, j.enabled ? [[j.button || 'Start', () => { this.close(); j.start(); }]] : []); }
    else if (page === 'bank') {
      const E = G.economy; h('Harbor Bank');
      li('Balance', `Cash ${fmtMoney(E.cash)} · Bank ${fmtMoney(E.bank)}`, [['Deposit $500', () => { E.deposit(500); this.render(); }], ['Withdraw $500', () => { E.withdraw(500); this.render(); }, true]]);
      if (E.fines.length) { li('Fines', `${E.fines.length} recorded · total ${fmtMoney(E.fines.reduce((a, f) => a + f.amount, 0))}`); for (const f of E.fines.slice(0, 5)) li(fmtMoney(-f.amount), f.desc + ' · Day ' + f.t); }
      li('Recent transactions', ''); for (const t of E.tx.slice(0, 14)) li((t.amount >= 0 ? '+' : '') + fmtMoney(t.amount), `${t.desc} · ${t.kind} · Day ${t.t}`);
      for (const [id, own] of Object.entries(E.props)) if (own) li('Property', id === 'safehouse' ? 'Laurel Apartments #4B (home)' : id === 'villa' ? 'Villa Mirador (safehouse)' : id === 'cafeShare' ? 'Sol & Salt Café 25% — $450/day' : id);
    }
    else if (page === 'garage') {
      h('My vehicles'); const V = G.vehicles;
      if (!V.owned.length) li('No vehicles yet', 'Buy one at Aurelia Motors.');
      for (const r of V.owned) { const s = VEHICLES[r.key]; li(s.name, `${s.cls} · condition ${Math.round(r.health)}%${r.battery != null ? ' · battery ' + Math.round(r.battery) + '%' : ''}`, [['Deliver near me ($50)', () => { if (G.deliverOwned(r)) this.close(); }]]); }
    }
    else if (page === 'photos') { h('Photos'); if (!this.photos.length) li('No photos yet', 'Open Camera to take one.'); for (const ph of this.photos) { const im = document.createElement('img'); im.src = ph.src; im.className = 'target-photo'; im.alt = 'Photo taken in San Aurelia'; p.appendChild(im); const s = document.createElement('small'); s.textContent = ph.t; p.appendChild(s); } }
    else if (page === 'fitness') { const S = G.player.stats; h('Fitness'); li('Strength', bar(S.strength) + ' ' + S.strength.toFixed(1) + ' — melee damage'); li('Stamina', bar(S.stamina) + ' ' + S.stamina.toFixed(1) + ' — sprint duration'); li('Endurance', bar(S.endurance) + ' ' + S.endurance.toFixed(1) + ' — max health'); li('Recovery', bar(S.recovery) + ' ' + S.recovery.toFixed(1) + ' — regeneration'); li('Today', `Workouts left before fatigue: ${Math.max(0, 40 - (G.gymToday || 0))}`); }
    else if (page === 'pet') { const C = G.companion; h(C.name); li('Companion', `${C.kind === 'robot' ? 'Robot' : C.kind === 'dog' ? 'Dog' : 'Cat'} · ${C.mode}`, [['Follow', () => C.command('follow')], ['Stay', () => C.command('stay'), true], ['Come here', () => C.command('come'), true]]); li('Tip', 'Walk up to your companion and press E to pet them. Z toggles follow/stay; X calls them over.'); }
    else if (page === 'settings') { h('Settings'); li('Game settings', 'Audio, graphics, controls, accessibility', [['Open', () => { this.close(); G.menus.settings(); }]]); li('Save game', 'Export or import your progress', [['Open', () => { this.close(); G.menus.saveMenu(); }]]); li('Time', fmtTime(G.env.hour) + ' · ' + G.weatherLabel()); }
    function bar(v) { const n = Math.round(Math.min(100, v) / 10); return '■'.repeat(n) + '□'.repeat(10 - n); }
  }
  addMessage(id, text, o = {}) {
    const t = this.threads[id] = this.threads[id] || { msgs: [], unread: 0 };
    t.msgs.push({ text, img: o.img, coords: o.coords, actions: o.actions, me: o.me }); if (!o.me) { t.unread = (t.unread || 0) + 1; this.unread++; }
    if (!o.me) { this.game.audio.ui('ding'); this.game.audio.vibrate(); this.game.ui.toast((CONTACTS[id] || {}).name || id, text.length > 70 ? text.slice(0, 68) + '…' : text, o.system ? 'warn' : 'info', 4); }
    if (this.open) this.render();
  }
  // incoming call -> resolves 'accepted' | 'declined' | 'missed'
  ring(id, onAnswer, onDecline) {
    const G = this.game; if (this.incoming) return;
    this.incoming = { id, onAnswer, onDecline, t: 0 }; if (!this.open) this.show(); else this.render();
    G.audio.ringtone(true); G.ui.toast('Incoming call', (CONTACTS[id] || {}).name || id, 'mission', 3);
    this._ringTimeout = setTimeout(() => { if (this.incoming && this.incoming.id === id && !this.incoming.live) this._endRing('missed'); }, 20000);
  }
  _renderCall() {
    const b = this.el.querySelector('.body'), c = this.incoming, info = CONTACTS[c.id] || { name: c.id, color: '#555', initials: '?' };
    b.innerHTML = `<div class="call"><div class="avatar" style="background:${info.color}">${info.initials}</div><div style="font-weight:800;font-size:20px"></div><div class="st" style="opacity:.75">${c.live ? 'On call…' : 'Incoming call'}</div><div class="callbtns">${c.live ? '<button style="background:#ef4444" data-h>END</button>' : '<button style="background:#ef4444" data-d>DECLINE</button><button style="background:#22c55e" data-a>ANSWER</button>'}</div></div>`;
    b.querySelector('.call > div:nth-child(2)').textContent = info.name;
    const a = b.querySelector('[data-a]'), d = b.querySelector('[data-d]'), hh = b.querySelector('[data-h]');
    if (a) a.onclick = () => this.answer(); if (d) d.onclick = () => this._endRing('declined'); if (hh) hh.onclick = () => this.hangup();
  }
  answer() {
    const c = this.incoming; if (!c || c.live) return; c.live = true; clearTimeout(this._ringTimeout); this.game.audio.ringtone(false);
    this.calls.unshift({ id: c.id, t: 'Day ' + this.game.env.day + ' ' + fmtTime(this.game.env.hour) }); this.render();
    if (this.game.player.state === 'foot') this.game.player.holdItem('phoneCall');
    Promise.resolve(c.onAnswer && c.onAnswer()).then(() => this.hangup());
  }
  hangup() { if (!this.incoming) return; this.incoming = null; this.game.audio.ringtone(false); this.game.player.dropItem('phoneCall'); this.close(); }
  _endRing(kind) {
    const c = this.incoming; if (!c) return; this.incoming = null; clearTimeout(this._ringTimeout); this.game.audio.ringtone(false);
    this.calls.unshift({ id: c.id, missed: kind === 'missed', t: 'Day ' + this.game.env.day + ' ' + fmtTime(this.game.env.hour) });
    if (kind === 'missed') this.game.ui.toast('Missed call', (CONTACTS[c.id] || {}).name || c.id, 'warn');
    if (c.onDecline) c.onDecline(kind); this.close();
  }
  callOut(id) {
    const G = this.game; this.calls.unshift({ id, out: true, t: 'Day ' + G.env.day + ' ' + fmtTime(G.env.hour) });
    const handler = G.missions.onCallContact(id);
    if (handler) { this.incoming = { id, live: true }; this.render(); if (G.player.state === 'foot') G.player.holdItem('phoneCall'); Promise.resolve(handler()).then(() => this.hangup()); }
    else { G.ui.subtitle((CONTACTS[id] || {}).name, G.missions.smallTalk(id), 3.5); }
  }
  takePhoto() {
    const G = this.game; this.close();
    setTimeout(() => {
      try {
        G.renderNow(); const src = G.renderer.domElement; const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * src.height / src.width);
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); const url = c.toDataURL('image/jpeg', 0.75);
        this.photos.unshift({ src: url, t: 'Day ' + G.env.day + ' ' + fmtTime(G.env.hour) }); if (this.photos.length > 24) this.photos.pop();
        G.audio.ui('shutter'); G.ui.flash(); G.ui.toast('Photo saved', 'View it in Photos.', 'good', 2); bus.emit('photo');
      } catch (e) { G.ui.toast('Camera unavailable', 'This browser blocked reading the frame.', 'warn'); }
    }, 60);
  }
  serialize() { const th = {}; for (const [k, t] of Object.entries(this.threads)) th[k] = { msgs: t.msgs.slice(-12).map((m) => ({ text: m.text, me: m.me, coords: m.coords })) }; return { threads: th, calls: this.calls.slice(0, 10) }; }
  restore(s) { if (!s) return; this.threads = s.threads || {}; this.calls = s.calls || []; this.unread = 0; }
}
