// Title screen, character creator, companion select, pause/settings, save/load, store/service menus.
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLES, FACIAL, TOPS, BOTTOMS, OUTFITS, HERO_DEFAULT, randomAppearance } from '../actors/humanoid.js';
import { VEHICLES, DEALER_STOCK } from '../data/vehicles.js';
import { Input, ACTION_LABELS } from '../core/input.js';
import { fmtMoney, rgbToHex, R, bus, clamp } from '../core/util.js';
import { WEATHERS } from '../world/environment.js';
import * as L from '../world/layout.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export class Menus {
  constructor(game) { this.game = game; this.ui = game.ui; }
  // ---------------- title ----------------
  title() {
    const G = this.game; const el = document.createElement('div'); el.id = 'title';
    const has = !!G.save.peekAutosave();
    el.innerHTML = `<h1 class="logo">RIVORA</h1><div class="tag">THE CITY IS YOURS</div><div class="menu">
      ${has ? '<button class="btn primary" data-a="continue">Continue</button>' : ''}
      <button class="btn ${has ? '' : 'primary'}" data-a="new">New game</button>
      <button class="btn" data-a="load">Load a save code</button>
      <button class="btn" data-a="settings">Settings</button>
      <button class="btn" data-a="controls">Controls</button>
      <button class="btn" data-a="about">About & credits</button></div>
      <div class="foot">An original open-world game set in the fictional coastal city of San Aurelia. All characters, brands and places are invented. Built entirely from procedural 3D and synthesized audio.</div>`;
    document.getElementById('layer').appendChild(el); this.titleEl = el;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; G.audio.start(); G.audio.ui('click');
      const a = b.dataset.a;
      if (a === 'continue') { const s = G.save.peekAutosave(); el.remove(); G.startFromSave(s); }
      if (a === 'new') { el.remove(); this.creator(); }
      if (a === 'load') this.saveMenu(true);
      if (a === 'settings') this.settings(); if (a === 'controls') this.controls(); if (a === 'about') this.about();
    });
  }
  // ---------------- character creator ----------------
  creator() {
    const G = this.game, P = G.player; const a = JSON.parse(JSON.stringify(HERO_DEFAULT)); G.creatorMode(true);
    let name = 'Marcus Reed'; const apply = () => { P.setAppearance(a); };
    apply();
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.style.justifyContent = 'flex-start'; ov.style.background = 'linear-gradient(90deg, rgba(5,10,14,.85), rgba(5,10,14,.2) 60%, rgba(5,10,14,0))'; ov.style.backdropFilter = 'none';
    ov.innerHTML = `<div class="panel" style="width:min(460px,100%);height:100%;max-height:none"><h2>Create your character</h2><p>Make the hero yours. The default look was configured from the reference portraits, so it already resembles you; fine-tune anything below.</p><div class="cbody"></div>
      <div class="row" style="margin-top:16px;position:sticky;bottom:0;background:linear-gradient(0deg,rgba(14,22,28,1) 70%,rgba(14,22,28,0));padding-top:12px"><button class="btn" data-back>Back</button><button class="btn primary" data-next style="margin-left:auto">Choose companion →</button></div></div>`;
    document.getElementById('layer').appendChild(ov);
    const body = ov.querySelector('.cbody');
    const sec = (t) => { const h = document.createElement('h3'); h.textContent = t; body.appendChild(h); };
    const row = () => { const r = document.createElement('div'); r.className = 'row'; body.appendChild(r); return r; };
    const swatches = (list, get, set) => { const r = row(); for (const c of list) { const b = document.createElement('button'); b.className = 'sw' + (get() === c ? ' sel' : ''); b.style.background = c; b.title = c; b.onclick = () => { set(c); apply(); r.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; r.appendChild(b); } const ci = document.createElement('input'); ci.type = 'color'; ci.value = get(); ci.style.width = '38px'; ci.style.height = '30px'; ci.style.border = '0'; ci.style.background = 'none'; ci.oninput = () => { set(ci.value); apply(); }; r.appendChild(ci); return r; };
    const choices = (list, get, set, labels) => { const r = row(); for (const v of list) { const b = document.createElement('button'); b.className = 'btn small' + (get() === v ? ' sel' : ''); b.textContent = labels ? labels[v] || v : v[0].toUpperCase() + v.slice(1); b.onclick = () => { set(v); apply(); r.querySelectorAll('.btn').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; r.appendChild(b); } return r; };
    const slider = (label, min, max, step, get, set) => { const l = document.createElement('label'); l.className = 'f'; l.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}">`; const i = l.querySelector('input'); i.value = get(); i.oninput = () => { set(+i.value); apply(); }; body.appendChild(l); };
    const nl = document.createElement('label'); nl.className = 'f'; nl.innerHTML = '<span>Name</span><input type="text" id="cc-name" maxlength="24">'; nl.querySelector('input').value = name; nl.querySelector('input').oninput = (e) => name = e.target.value || 'Marcus Reed'; body.appendChild(nl);
    sec('Quick start'); const qs = row(); for (const [t, fn] of [['Default hero', () => Object.assign(a, JSON.parse(JSON.stringify(HERO_DEFAULT)))], ['Randomize', () => Object.assign(a, randomAppearance(R))]]) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t; b.onclick = () => { fn(); apply(); }; qs.appendChild(b); }
    sec('Use your photo (optional, on this device)');
    const photo = document.createElement('div'); photo.innerHTML = `<p class="note">Pick a clear, well-lit face photo. It never leaves your browser: it's only used to sample your skin and hair colour, then discarded. Real 3D face reconstruction is not available in this build.</p><label class="row note"><input type="checkbox" id="cc-consent"> I consent to processing this photo locally</label><input type="file" id="cc-file" accept="image/*" disabled style="margin-top:8px"><div class="pick" style="margin-top:8px"></div>`;
    body.appendChild(photo); const cons = photo.querySelector('#cc-consent'), file = photo.querySelector('#cc-file'), pick = photo.querySelector('.pick');
    cons.onchange = () => file.disabled = !cons.checked;
    file.onchange = () => {
      const f = file.files[0]; if (!f) return; const url = URL.createObjectURL(f); const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); const w = 300, h = Math.round(300 * img.height / img.width); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
        let mode = 'skin'; pick.innerHTML = '<p class="note">Tap your <b>cheek</b> to sample skin, then your <b>hair</b>.</p>'; c.style.cssText = 'width:100%;border-radius:10px;cursor:crosshair'; pick.appendChild(c);
        c.onclick = (e) => {
          const r = c.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / r.width * w), y = Math.floor((e.clientY - r.top) / r.height * h);
          const d = g.getImageData(Math.max(0, x - 4), Math.max(0, y - 4), 9, 9).data; let rr = 0, gg = 0, bb = 0; for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; } const n = d.length / 4;
          const hex = rgbToHex(rr / n / 255 * 0.92, gg / n / 255 * 0.9, bb / n / 255 * 0.9);
          if (mode === 'skin') { a.skin = hex; mode = 'hair'; pick.querySelector('p').innerHTML = 'Skin sampled. Now tap your <b>hair</b>.'; }
          else { a.hair.color = hex; pick.innerHTML = '<p class="note">Colours applied. The photo has been discarded from memory.</p>'; g.clearRect(0, 0, w, h); file.value = ''; }
          apply();
        };
      };
      img.src = url;
    };
    sec('Body'); slider('Height', 1.55, 1.98, 0.01, () => a.height, (v) => a.height = v); slider('Build', 0, 1, 0.01, () => a.build, (v) => a.build = v);
    choices(['m', 'f'], () => a.sex, (v) => a.sex = v, { m: 'Masculine frame', f: 'Feminine frame' });
    sec('Skin'); swatches([...SKIN_TONES, HERO_DEFAULT.skin], () => a.skin, (v) => a.skin = v);
    sec('Face'); slider('Face width', 0.86, 1.1, 0.01, () => a.faceW, (v) => a.faceW = v); slider('Jaw', 0, 1, 0.01, () => a.jaw, (v) => a.jaw = v); slider('Brows', 0.6, 1.6, 0.01, () => a.brow, (v) => a.brow = v);
    choices(EYE_COLORS, () => a.eyes, (v) => a.eyes = v, Object.fromEntries(EYE_COLORS.map((c, i) => [c, ['Dark brown', 'Brown', 'Blue', 'Green', 'Grey'][i]])));
    sec('Hair'); choices(HAIR_STYLES, () => a.hair.style, (v) => a.hair.style = v); swatches(HAIR_COLORS, () => a.hair.color, (v) => a.hair.color = v);
    sec('Facial hair'); choices(FACIAL, () => a.facial, (v) => a.facial = v);
    sec('Outfit'); const orow = row(); for (const [k, o] of Object.entries(OUTFITS)) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = o.name; b.onclick = () => { a.top = JSON.parse(JSON.stringify(o.top)); a.bottom = JSON.parse(JSON.stringify(o.bottom)); a.shoes = { ...o.shoes }; apply(); }; orow.appendChild(b); }
    const tl = document.createElement('p'); tl.className = 'note'; tl.textContent = 'Top colour'; body.appendChild(tl); swatches(['#151517', '#f4f4f2', '#8e3b26', '#1d3557', '#2a9d8f', '#e63946', '#e9c46a', '#6d597a'], () => a.top.color, (v) => a.top.color = v);
    const bl = document.createElement('p'); bl.className = 'note'; bl.textContent = 'Bottom colour'; body.appendChild(bl); swatches(['#2c3a52', '#16181c', '#c9b79a', '#5a6b7a', '#f1f1f1', '#6b4f3a'], () => a.bottom.color, (v) => a.bottom.color = v);
    sec('Accessories'); const ar = row(); for (const k of ['watch', 'earbuds', 'cap', 'glasses', 'chain']) { const b = document.createElement('button'); b.className = 'btn small' + (a.acc[k] ? ' sel' : ''); b.textContent = k[0].toUpperCase() + k.slice(1); b.onclick = () => { a.acc[k] = !a.acc[k]; b.classList.toggle('sel', a.acc[k]); apply(); }; ar.appendChild(b); }
    ov.querySelector('[data-back]').onclick = () => { ov.remove(); G.creatorMode(false); this.title(); };
    ov.querySelector('[data-next]').onclick = () => { ov.remove(); P.name = name; this.companionSelect((c) => { G.creatorMode(false); G.newGame(c); }); };
  }
  companionSelect(done) {
    const G = this.game; let kind = 'robot', cname = 'Orbi', color = null;
    const ov = this.ui.panel(`<h2>Choose a companion</h2><p>They follow you through San Aurelia, react to the city, ride along in cars and wait when you fly. You can make them stay or come with Z / X.</p>
      <div class="grid2 kinds" style="margin-top:12px"></div><label class="f" style="margin-top:14px"><span>Name</span><input type="text" id="cmp-name" maxlength="16"></label><div class="row cols" style="margin-top:10px"></div>
      <div class="row" style="margin-top:16px"><button class="btn primary" data-go>Start in San Aurelia</button></div>`, { dismiss: false });
    const K = [['robot', 'Robot', 'An original companion bot with an expressive visor face. Scans, waves and recharges.', 'Orbi'], ['dog', 'Dog', 'Loyal, playful, sniffs everything and barks at trouble.', 'Rocket'], ['cat', 'Cat', 'Curious and independent. Grooms, explores and purrs when petted.', 'Mango']];
    const kinds = ov.querySelector('.kinds'), nm = ov.querySelector('#cmp-name'), cols = ov.querySelector('.cols'); nm.value = cname; nm.oninput = () => cname = nm.value || cname;
    const renderCols = () => { cols.innerHTML = ''; const list = kind === 'robot' ? ['#eef2f4', '#2b2d33', '#ffd166'] : kind === 'dog' ? ['#b8864e', '#2b2b2b', '#f2efe9', '#7a4f2a'] : ['#d9a066', '#3a3a3a', '#f2efe9', '#9a9a9a']; for (const c of list) { const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.onclick = () => { color = c; cols.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); G.companion.setKind(kind, cname, color); }; cols.appendChild(b); } };
    for (const [k, t, d, n] of K) { const b = document.createElement('button'); b.className = 'item btn' + (k === kind ? ' sel' : ''); b.innerHTML = `<div><div class="t">${t}</div><div class="d">${d}</div></div>`; b.onclick = () => { kind = k; cname = n; nm.value = n; color = null; kinds.querySelectorAll('.item').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); G.companion.setKind(kind, cname); renderCols(); }; kinds.appendChild(b); }
    renderCols(); G.companion.setKind(kind, cname);
    ov.querySelector('[data-go]').onclick = () => { this.ui.close(ov); done({ kind, name: cname, color }); };
  }
  // ---------------- pause ----------------
  pause() {
    const G = this.game; if (this.ui.panelStack.length) return; G.paused = true;
    const ov = this.ui.panel(`<h2>Paused</h2><p class="pz"></p><div class="grid2" style="margin-top:12px">
      <button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="map">Map</button><button class="btn" data-a="phone">Phone</button><button class="btn" data-a="bag">Bag</button>
      <button class="btn" data-a="settings">Settings</button><button class="btn" data-a="controls">Controls</button><button class="btn" data-a="save">Save & load</button>
      ${G.missions.active ? '<button class="btn" data-a="quit">Quit current mission</button>' : ''}<button class="btn" data-a="about">About & status</button><button class="btn" data-a="title">Exit to title</button></div>`, { onClose: () => { G.paused = false; } });
    ov.querySelector('.pz').textContent = `${G.player.name} · Day ${G.env.day} · ${G.missions.active ? 'On mission: ' + G.missions.active.title : 'Free roam'} · Reputation ${G.economy.reputation}`;
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'resume') this.ui.close(ov); if (a === 'map') { this.ui.close(ov); this.ui.openMap(); } if (a === 'phone') { this.ui.close(ov); G.phone.show(); } if (a === 'bag') { this.ui.close(ov); this.bag(); }
      if (a === 'settings') this.settings(); if (a === 'controls') this.controls(); if (a === 'save') this.saveMenu(); if (a === 'about') this.about();
      if (a === 'quit') { G.missions.quit(); this.ui.close(ov); } if (a === 'title') { G.autosave('exit'); location.reload(); } });
  }
  // ---------------- settings ----------------
  settings() {
    const G = this.game, S = G.settings, A = G.audio;
    const ov = this.ui.panel(`<h2>Settings</h2><div class="tabs"></div><div class="tb"></div><div class="row" style="margin-top:14px"><button class="btn primary" data-x>Done</button></div>`, { wide: true, onClose: () => G.saveSettings() });
    const tabs = ov.querySelector('.tabs'), tb = ov.querySelector('.tb');
    const slider = (label, min, max, step, get, set, fmt = (v) => Math.round(v * 100) + '%') => { const l = document.createElement('label'); l.className = 'f'; l.innerHTML = `<span><b class="v"></b> ${label}</span><input type="range" min="${min}" max="${max}" step="${step}">`; const i = l.querySelector('input'), v = l.querySelector('.v'); i.value = get(); v.textContent = fmt(get()); i.oninput = () => { set(+i.value); v.textContent = fmt(+i.value); }; tb.appendChild(l); };
    const toggle = (label, get, set, note) => { const r = document.createElement('div'); r.className = 'item'; r.innerHTML = `<div><div class="t"></div><div class="d"></div></div><button class="btn small"></button>`; r.querySelector('.t').textContent = label; r.querySelector('.d').textContent = note || ''; const b = r.querySelector('button'); const upd = () => b.textContent = get() ? 'On' : 'Off'; upd(); b.onclick = () => { set(!get()); upd(); }; tb.appendChild(r); };
    const pick = (label, opts, get, set) => { const r = document.createElement('div'); r.innerHTML = `<p class="note" style="margin:10px 0 6px">${label}</p><div class="row"></div>`; for (const [v, t] of opts) { const b = document.createElement('button'); b.className = 'btn small' + (get() === v ? ' sel' : ''); b.textContent = t; b.onclick = () => { set(v); r.querySelectorAll('.btn').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; r.lastChild.appendChild(b); } tb.appendChild(r); };
    const pages = {
      Gameplay: () => {
        pick('Difficulty', [['easy', 'Relaxed'], ['normal', 'Normal'], ['hard', 'Hard']], () => S.difficulty, (v) => S.difficulty = v);
        pick('Violence', [['full', 'Full (light blood)'], ['reduced', 'Reduced (no blood)'], ['off', 'Minimal (knockouts only, softer effects)']], () => S.violence, (v) => S.violence = v);
        toggle('Optional smoking content', () => S.smoking, (v) => S.smoking = v, 'Show cigarettes in stores and occasional NPC smoking. Off hides all smoking.');
        toggle('Parachute auto-deploy assist', () => S.autoDeploy, (v) => S.autoDeploy = v, 'Opens the canopy automatically at 60 m if you forget.');
        toggle('Show red-light cameras on map', () => S.showCams, (v) => S.showCams = v);
        slider('Time speed (1 game hour = minutes)', 1, 10, 0.5, () => 1 / (G.env.timeScale * 60), (v) => { G.env.timeScale = 1 / (v * 60); }, (v) => v + ' min');
        slider('Time of day', 0, 23.5, 0.5, () => G.env.hour, (v) => G.env.setHour(v), (v) => String(Math.floor(v)).padStart(2, '0') + ':' + (v % 1 ? '30' : '00'));
        pick('Weather', [['auto', 'Dynamic'], ...Object.entries(WEATHERS).map(([k, w]) => [k, w.label])], () => (G.env.autoWeather ? 'auto' : G.env.weatherKey), (v) => { if (v === 'auto') G.env.autoWeather = true; else { G.env.autoWeather = false; G.env.setWeather(v); } });
      },
      Audio: () => { for (const [k, t] of [['master', 'Master'], ['music', 'Music'], ['ambience', 'Street ambience'], ['voices', 'Voices & crowd'], ['traffic', 'Traffic'], ['effects', 'Effects'], ['ui', 'Interface']]) slider(t, 0, 1, 0.01, () => A.levels[k], (v) => A.setLevel(k, v)); toggle('Spoken dialogue (browser voice)', () => S.tts, (v) => S.tts = v, 'Uses your device\'s built-in speech voices for story calls. Availability varies by device.'); toggle('Mute everything', () => A.muted, (v) => { A.muted = v; A.applyLevels(); }); },
      Graphics: () => { pick('Quality preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], () => S.quality, (v) => { S.quality = v; G.applyQuality(v); }); slider('Render scale', 0.5, 1, 0.05, () => S.renderScale, (v) => { S.renderScale = v; G.resize(); }); toggle('Shadows', () => S.shadows, (v) => { S.shadows = v; G.applyShadows(); }); toggle('Performance mode (auto-adjust when FPS drops)', () => S.autoPerf, (v) => S.autoPerf = v); toggle('Show FPS', () => S.showFps, (v) => S.showFps = v); },
      Controls: () => {
        slider('Mouse sensitivity', 0.2, 3, 0.05, () => G.input.sens, (v) => G.input.sens = v, (v) => v.toFixed(2)); slider('Touch camera sensitivity', 0.3, 3, 0.05, () => G.input.touchSens, (v) => G.input.touchSens = v, (v) => v.toFixed(2));
        toggle('Invert camera Y', () => G.input.invertY, (v) => G.input.invertY = v);
        const h = document.createElement('h3'); h.textContent = 'Key bindings (click to rebind, Esc cancels)'; tb.appendChild(h);
        const list = document.createElement('div'); list.className = 'grid2'; tb.appendChild(list);
        const render = () => { list.innerHTML = ''; for (const [act, codes] of Object.entries(G.input.bindings)) { const r = document.createElement('div'); r.className = 'item'; r.innerHTML = `<div class="t"></div><button class="btn small"></button>`; r.querySelector('.t').textContent = ACTION_LABELS[act] || act; const b = r.querySelector('button'); b.textContent = codes.map(Input.keyName).join(' / ') || '—'; b.onclick = () => { b.textContent = 'Press a key…'; G.input.rebind(act, () => { render(); G.saveSettings(); }); }; list.appendChild(r); } };
        render(); const rs = document.createElement('button'); rs.className = 'btn small'; rs.style.marginTop = '10px'; rs.textContent = 'Reset to defaults'; rs.onclick = () => { G.input.resetBindings(); render(); }; tb.appendChild(rs);
      },
      Accessibility: () => { toggle('Subtitles', () => S.subtitles, (v) => S.subtitles = v); slider('Text size', 0.85, 1.4, 0.05, () => S.textSize, (v) => { S.textSize = v; document.documentElement.style.setProperty('--fs', v); }, (v) => Math.round(v * 100) + '%'); toggle('Reduce camera shake', () => S.reduceShake, (v) => S.reduceShake = v); toggle('Reduce flashing (camera flash, strobes)', () => S.reduceFlash, (v) => S.reduceFlash = v); },
    };
    let cur = 'Gameplay';
    const show = (k) => { cur = k; tb.innerHTML = ''; tabs.querySelectorAll('.btn').forEach((b) => b.classList.toggle('sel', b.textContent === k)); pages[k](); };
    for (const k of Object.keys(pages)) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = k; b.onclick = () => show(k); tabs.appendChild(b); }
    show(cur); ov.querySelector('[data-x]').onclick = () => this.ui.close(ov);
  }
  // ---------------- save / load ----------------
  saveMenu(fromTitle) {
    const G = this.game; const code = fromTitle ? '' : G.save.exportCode(); const auto = G.save.peekAutosave();
    const ov = this.ui.panel(`<h2>Save & load</h2><p>Your progress lives in this browser's storage when it's available, plus a <b>save code</b> you can copy anywhere (notes, email to yourself) and paste back later — the most reliable way to keep a save. File downloads are blocked inside Claude artifacts, so copy the code instead.</p>
      ${fromTitle ? '' : `<h3>Export</h3><textarea id="save-out" readonly></textarea><div class="row" style="margin-top:8px"><button class="btn small primary" data-copy>Copy save code</button><button class="btn small" data-store>Save to this browser now</button><span class="note st"></span></div>`}
      <h3>Import</h3><textarea id="save-in" placeholder="Paste a RIVORA save code here"></textarea><div class="row" style="margin-top:8px"><button class="btn small primary" data-load>Load code</button><label class="btn small">Open .json file<input type="file" accept=".json,.txt,application/json" hidden id="save-file"></label>${auto ? '<button class="btn small" data-auto>Load browser autosave</button>' : ''}<span class="note err"></span></div>
      <p class="note">Browser storage: ${G.save.storageOK() ? 'available (autosaves after missions, sleep and every few minutes)' : 'unavailable in this view — use the save code'}.</p>
      <div class="row" style="margin-top:12px"><button class="btn" data-x>Close</button></div>`);
    if (!fromTitle) { ov.querySelector('#save-out').value = code; ov.querySelector('[data-copy]').onclick = async () => { const t = ov.querySelector('#save-out'); try { await navigator.clipboard.writeText(code); ov.querySelector('.st').textContent = 'Copied.'; } catch (e) { t.focus(); t.select(); ov.querySelector('.st').textContent = 'Select-all done — press Ctrl/⌘+C to copy.'; } }; ov.querySelector('[data-store]').onclick = () => { const ok = G.autosave('manual'); ov.querySelector('.st').textContent = ok ? 'Saved to this browser.' : 'Browser storage unavailable here.'; }; }
    const err = ov.querySelector('.err');
    const load = (txt) => { const r = G.save.parse(txt); if (!r.ok) { err.textContent = r.error; G.audio.ui('error'); return; } this.ui.closeAll(); if (this.titleEl) this.titleEl.remove(); G.startFromSave(r.data); };
    ov.querySelector('[data-load]').onclick = () => load(ov.querySelector('#save-in').value);
    ov.querySelector('#save-file').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => load(String(rd.result)); rd.readAsText(f); };
    const au = ov.querySelector('[data-auto]'); if (au) au.onclick = () => { this.ui.closeAll(); if (this.titleEl) this.titleEl.remove(); G.startFromSave(auto); };
    ov.querySelector('[data-x]').onclick = () => this.ui.close(ov);
  }
  // ---------------- controls help ----------------
  controls() {
    const k = (a) => (this.game.input.bindings[a] || []).map(Input.keyName).join(' / ');
    const rows = [['On foot', `Move ${k('forward')}/${k('left')}/${k('back')}/${k('right')} · Sprint ${k('sprint')} · Jump ${k('jump')} · Crouch/sneak ${k('crouch')} · Interact ${k('interact')} · Enter vehicle ${k('vehicle')} · Camera: mouse (click the view to lock the pointer) or drag`], ['Combat', `Punch ${k('punch')} (combo jab-cross-hook-uppercut; hold Sprint for heavy hooks) · Kick ${k('kick')} (+forward near an enemy: knee) · Block ${k('block')} (block just before a hit to counter) · Dodge ${k('dodge')} · Shove ${k('push')}`], ['Driving', `Throttle/brake/reverse ${k('forward')}/${k('back')} · Steer ${k('left')}/${k('right')} · Handbrake ${k('jump')} · Horn ${k('horn')} · Lights ${k('lights')} · Radio ${k('radio')} · View ${k('camera')} · Exit ${k('vehicle')}`], ['Helicopter', `Up ${k('jump')} · Down ${k('crouch')} · Tilt forward/back ${k('forward')}/${k('back')} · Turn ${k('left')}/${k('right')}`], ['Plane', `Throttle up ${k('sprint')} or ${k('jump')} · Throttle down ${k('crouch')} · Nose down/up ${k('forward')}/${k('back')} · Bank ${k('left')}/${k('right')} · Rotate for take-off above 110 km/h with ${k('back')}`], ['Skydiving', `Steer ${k('left')}/${k('right')} · Dive ${k('forward')} · Open parachute ${k('jump')} · Flare before landing ${k('back')}`], ['Swimming', `Swim with movement keys · Fast swim ${k('sprint')} · Climb onto docks/quays ${k('jump')}`], ['Other', `Phone ${k('phone')} · Map ${k('map')} · Bag I · Companion follow/stay ${k('companion')}, come ${k('companionCome')} · Pause ${k('pause')}`], ['Touch', 'Left half: virtual stick. Right half: drag to look. Buttons change with what you are doing (on foot, driving, flying, swimming). Top-right: pause, phone, map, camera.'], ['Gamepad', 'Left stick move · right stick camera · A jump · B crouch · X interact · Y vehicle · RB punch · LB block · RT/LT throttle/brake · Start pause.']];
    const ov = this.ui.panel(`<h2>Controls</h2><div class="kv" style="margin-top:12px">${rows.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}</div><div class="row" style="margin-top:14px"><button class="btn" data-x>Close</button></div>`, { wide: true });
    ov.querySelector('[data-x]').onclick = () => this.ui.close(ov);
  }
  about() {
    const st = [['Implemented & tested', 'Title, character creator with local photo colour assist, companion (dog/cat/robot), procedural city with 10 districts, day/night, weather, ocean, pedestrians with routines, traffic AI with signals, red-light cameras & fines, cars/bikes/boats/helicopter/plane, parachuting, melee combat, 6-level wanted system, phone (calls, messages, jobs, bank, garage, camera), story mission, contract mission, courier/time-trial/rescue/skydive/workout activities, café/store/gym/club/clothes/home interiors, gym stats, economy, save code export/import, desktop + touch + gamepad controls.'], ['Prototype / simplified', 'Procedural (non-photoreal) art; humanoids are rigid-skinned procedural models; ragdolls are scripted falls; spatial audio uses distance + panning without full occlusion; police helicopter and roadblocks are basic; photo-to-avatar samples colours only.'], ['Not in this build (roadmap)', 'Firearms, 18 further story missions, property businesses beyond one café share, friend dates/house visits, swimming dives, cockpit instrument detail, photoreal assets, voice-acted dialogue.']];
    const ov = this.ui.panel(`<h2>About RIVORA</h2><p>RIVORA is an original game. San Aurelia, its people, companies, vehicles and gangs are fictional; no real celebrities, brands or likenesses are used. The default hero's look was configured from reference portraits supplied by the player-owner; those photos are not included in this game.</p>
      <h3>Build status</h3><div class="kv">${st.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>
      <h3>Assets & licences</h3><div class="kv"><span>3D</span><span>All geometry procedurally generated in code (this project).</span><span>Textures</span><span>Procedural canvas textures (this project).</span><span>Audio & music</span><span>Synthesized live with the Web Audio API (this project). Optional spoken lines use the browser's own speech voices.</span><span>Engine</span><span>three.js r158 (MIT licence), loaded from jsDelivr.</span><span>Fonts</span><span>Big Shoulders Display & Figtree via Google Fonts (SIL Open Font Licence).</span><span>Concept art</span><span>One GPT Image 2.5 concept was generated via OpenArt during development (free credits); it is not bundled because the free-plan file is watermarked.</span></div>
      <div class="row" style="margin-top:14px"><button class="btn" data-x>Close</button></div>`, { wide: true });
    ov.querySelector('[data-x]').onclick = () => this.ui.close(ov);
  }
  // ---------------- stores & services ----------------
  dealer() {
    const G = this.game, V = G.vehicles;
    this.ui.shop('Aurelia Motors', 'Every vehicle is delivered to the curb outside and added to your phone\'s Garage app.', DEALER_STOCK.map((k) => { const s = VEHICLES[k]; return { id: k, name: s.name, price: s.price, desc: `${s.cls} · top ${Math.round(s.top * 3.6)} km/h${s.electric ? ' · electric' : ''}`, disabled: V.owned.some((o) => o.key === k) }; }), (it) => {
      if (!G.economy.pay(it.price, 'Aurelia Motors: ' + it.name)) return;
      const rec = V.addOwned(it.id); const v = V.spawnOwned(rec, -430, -44.9, -Math.PI / 2); G.ui.big('NEW VEHICLE', it.name, '#60a5fa', 3); G.autosave('purchase'); bus.emit('bought', it.id); return 'close';
    }, { wide: true });
  }
  garage() {
    const G = this.game, P = G.player; const v = P.vehicle || G.vehicles.list.filter((q) => q.type === 'car' || q.type === 'bike').sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
    if (!v || v.pos.distanceTo(P.pos) > 14 || v.kinematic || v.display) { this.ui.toast('Navarro Garage', 'Bring a car or bike to the garage door first.', 'info'); return; }
    const friend = (G.relations.dani || 0) >= 20; const rep = Math.round((100 - v.health) * 8 * (friend ? 0.5 : 1));
    const items = [{ id: 'repair', name: 'Repair', price: rep, desc: friend ? 'Friends discount: 50% off' : 'Restore full condition', disabled: v.health >= 99.5 }, { id: 'tune', name: 'Performance tune', price: 3000, desc: '+12% acceleration, +5% top speed', disabled: v.tuned }];
    for (const c of ['#d62828', '#003049', '#fcbf49', '#f8f9fa', '#111111', '#2a9d8f', '#ff4fa3', '#7a5af8']) items.push({ id: 'paint:' + c, name: 'Paint ' + c, price: 200, desc: 'Fresh respray', label: '$200' });
    const ov = this.ui.shop('Navarro Garage', `${v.spec.name} · condition ${Math.round(v.health)}%`, items, (it) => {
      if (!G.economy.pay(it.price, 'Navarro Garage: ' + it.name)) return;
      if (it.id === 'repair') { v.health = 100; v.disabled = false; }
      else if (it.id === 'tune') { v.tuned = true; v.spec = { ...v.spec, power: v.spec.power * 1.12, top: v.spec.top * 1.05 }; }
      else { v.setColor(it.id.slice(6)); }
      G.vehicles.syncOwned(); G.audio.metalClank(v.pos); bus.emit('garage', it.id); return 'close';
    });
  }
  policeDesk() {
    const G = this.game, E = G.economy, lvl = G.police.level;
    const items = [];
    if (lvl) items.push({ id: 'surrender', name: 'Turn yourself in', price: 500 * lvl, desc: `Clears your ${lvl}-star wanted level` });
    if (E.bank < 0) items.push({ id: 'debt', name: 'Settle unpaid fines', price: -E.bank, desc: 'Brings your bank balance back to zero' });
    items.push({ id: 'record', name: 'View fines on record', price: 0, desc: `${E.fines.length} fine(s), ${fmtMoney(E.fines.reduce((a, f) => a + f.amount, 0))} total`, label: 'View' });
    this.ui.shop('Central Police', 'Red-light camera fines are charged to your bank automatically.', items, (it) => {
      if (it.id === 'record') { this.ui.toast('Fines', E.fines.slice(0, 3).map((f) => `${fmtMoney(f.amount)} ${f.desc}`).join(' · ') || 'No fines on record.', 'info', 5); return; }
      if (it.id === 'debt') { const n = -E.bank; if (E.cash >= n) { E.cash -= n; E.bank = 0; E.log('Fine settlement', -n, 'cash'); } else this.ui.toast('Not enough cash', '', 'bad'); return 'close'; }
      if (it.id === 'surrender') { if (!E.pay(it.price, 'Bail')) return; G.police.clear(); this.ui.toast('Released', 'Wanted level cleared.', 'good'); return 'close'; }
    });
  }
  hospital() {
    const G = this.game, P = G.player;
    this.ui.shop('St. Aurelia Medical', `Health ${Math.round(P.health)} / ${Math.round(P.maxHealth)}`, [{ id: 'treat', name: 'Treatment', price: 150, desc: 'Restore full health and stamina', disabled: P.health >= P.maxHealth - 1 }], (it) => { if (!G.economy.pay(150, 'Hospital treatment')) return; P.health = P.maxHealth; P.stamina = P.maxStamina; return 'close'; });
  }
  wardrobe() {
    const G = this.game, P = G.player;
    this.ui.shop('Wardrobe', 'Outfits you own.', [...G.ownedOutfits].map((k) => ({ id: k, name: OUTFITS[k].name, price: 0, label: 'Wear' })), (it) => { const o = OUTFITS[it.id]; P.a.top = JSON.parse(JSON.stringify(o.top)); P.a.bottom = JSON.parse(JSON.stringify(o.bottom)); P.a.shoes = { ...o.shoes }; P.setAppearance(P.a); return 'close'; });
  }
  clothesShop() {
    const G = this.game, P = G.player;
    this.ui.shop('Thread & Co', 'New looks are added to your home wardrobe.', Object.entries(OUTFITS).map(([k, o]) => ({ id: k, name: o.name, price: G.ownedOutfits.has(k) ? 0 : o.price, label: G.ownedOutfits.has(k) ? 'Wear' : null })), (it) => {
      if (!G.ownedOutfits.has(it.id)) { if (!G.economy.pay(it.price, 'Thread & Co: ' + it.name)) return; G.ownedOutfits.add(it.id); }
      const o = OUTFITS[it.id]; P.a.top = JSON.parse(JSON.stringify(o.top)); P.a.bottom = JSON.parse(JSON.stringify(o.bottom)); P.a.shoes = { ...o.shoes }; if (o.watch) P.a.acc.watch = true; P.setAppearance(P.a); bus.emit('outfit', it.id); return 'close';
    }, { wide: true });
  }
  bag() {
    const G = this.game, I = G.economy.inventory;
    const items = [{ id: 'medkit', name: `First-aid kit ×${I.medkit}`, price: 0, label: 'Use', disabled: !I.medkit }];
    if (G.settings.smoking) items.push({ id: 'smoke', name: `Cigarettes ×${I.cigs}${I.lighter ? '' : ' (need a lighter)'}`, price: 0, label: 'Smoke', disabled: !I.cigs || !I.lighter });
    this.ui.shop('Bag', 'Items you carry.', items, (it) => { if (it.id === 'medkit') G.activities.medkit(); if (it.id === 'smoke') G.activities.smoke(); return 'close'; });
  }
}
