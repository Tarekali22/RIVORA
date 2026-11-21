// Firearms: the hero starts with a basic sidearm; stronger fictional weapons, ammunition, upgrades and body armour
// are bought at Ironclad Arms with money earned from missions. Aim (right mouse / L), fire (left mouse / J),
// reload (R), switch (T / Y / 1–5), holster (H). Hitscan with spread, recoil, line-of-sight and headshots.
import { T, isAR, addStrings } from '../core/i18n.js';
import { clamp, R, bus, fmtMoney, dist2 } from '../core/util.js';

export const WEAPONS = {
  fists: { name: 'Fists', cls: 'Melee', slot: 1 },
  pistol: { name: 'Hollis P9', cls: 'Pistol', slot: 2, dmg: 26, rate: 3.4, mag: 12, reload: 1.25, range: 75, spread: 0.010, hip: 0.035, recoil: 0.05, price: 0, ammoPrice: 2, pack: 24, auto: false, len: 0.2 },
  smg: { name: 'Wasp SMG', cls: 'Submachine gun', slot: 3, dmg: 15, rate: 11, mag: 30, reload: 1.8, range: 55, spread: 0.030, hip: 0.06, recoil: 0.028, price: 4500, ammoPrice: 1, pack: 60, auto: true, len: 0.42 },
  shotgun: { name: 'Breaker 12', cls: 'Shotgun', slot: 4, dmg: 11, pellets: 8, rate: 1.15, mag: 6, reload: 2.5, range: 26, spread: 0.085, hip: 0.1, recoil: 0.15, price: 3200, ammoPrice: 4, pack: 12, auto: false, len: 0.75 },
  rifle: { name: 'Longbow AR', cls: 'Rifle', slot: 5, dmg: 32, rate: 6.5, mag: 30, reload: 2.1, range: 150, spread: 0.006, hip: 0.045, recoil: 0.045, price: 12000, ammoPrice: 3, pack: 60, auto: true, len: 0.85 },
};
const ARMOR = [{ id: 'vest1', name: 'Light vest', armor: 50, price: 1500 }, { id: 'vest2', name: 'Heavy vest', armor: 100, price: 3500 }];
addStrings({
  'Fists': 'القبضة', 'Melee': 'اشتباك', 'Pistol': 'مسدس', 'Submachine gun': 'رشاش صغير', 'Shotgun': 'بندقية خرطوش', 'Rifle': 'بندقية', 'Light vest': 'سترة واقية خفيفة', 'Heavy vest': 'سترة واقية ثقيلة',
  'Ironclad Arms': 'آيرونكلاد للأسلحة', 'Licensed fictional weapons, ammunition and armour. Bought with money you earn.': 'أسلحة خيالية مرخّصة وذخيرة ودروع، تُشترى بالمال الذي تكسبه.',
  'Ammo ×{0} for {1}': 'ذخيرة ×{0} لـ {1}', 'Extended magazine · {0}': 'خزنة ممتدة · {0}', 'Steady grip · {0}': 'مقبض ثابت · {0}', '+50% magazine size': '+50٪ سعة الخزنة', '−35% spread and recoil': '−35٪ تشتت وارتداد', 'Owned': 'مملوك', 'Buy {0}': 'شراء {0}',
  'Damage {0} · rate {1}/s · magazine {2}': 'الضرر {0} · المعدل {1}/ث · الخزنة {2}', 'Armour +{0} (absorbs most of each hit)': 'درع +{0} (يمتص معظم الضربة)', 'Armour': 'الدرع', 'Reloading…': 'إعادة التعبئة…', 'No ammo — buy more at Ironclad Arms': 'لا ذخيرة — اشترِ من آيرونكلاد',
  'Weapon purchased': 'تم شراء السلاح', '{0} added to your inventory. Switch with T or 1–5.': 'أُضيف {0} لمخزونك. بدّل بـ T أو 1–5.', 'Shots fired': 'إطلاق نار', 'Holstered': 'السلاح في الجراب', 'Aim: right mouse · Fire: left mouse · Reload: R': 'تصويب: زر الماوس الأيمن · إطلاق: الأيسر · تعبئة: R',
});

function gunMesh(kind) {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.38, metalness: 0.85 }), poly = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.7, metalness: 0.1 });
  const B = (w, h, d, x, y, z, m = dark) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  // barrel along -Y (the arm's direction), top of the gun along +Z (the thumb)
  if (kind === 'pistol') { B(0.03, 0.19, 0.034, 0, -0.07, 0.03); B(0.028, 0.04, 0.1, 0, 0.01, -0.02, poly); }
  if (kind === 'smg') { B(0.045, 0.34, 0.06, 0, -0.12, 0.035); B(0.03, 0.05, 0.14, 0, -0.02, -0.04, poly); B(0.028, 0.04, 0.16, 0, -0.16, -0.05); B(0.02, 0.18, 0.02, 0, 0.12, 0.02, poly); }
  if (kind === 'shotgun') { B(0.04, 0.72, 0.045, 0, -0.26, 0.04); B(0.05, 0.22, 0.05, 0, -0.33, 0.0, poly); B(0.045, 0.3, 0.09, 0, 0.17, 0.01, poly); B(0.03, 0.05, 0.11, 0, 0.0, -0.04, poly); }
  if (kind === 'rifle') { B(0.05, 0.62, 0.07, 0, -0.2, 0.04); B(0.03, 0.06, 0.15, 0, -0.04, -0.06, poly); B(0.03, 0.05, 0.14, 0, 0.0, -0.04, poly); B(0.05, 0.28, 0.08, 0, 0.22, 0.02, poly); B(0.02, 0.12, 0.03, 0, -0.18, 0.1); }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -(WEAPONS[kind].len || 0.2) + 0.02, 0.035); g.add(muzzle); g.userData.muzzle = muzzle;
  return g;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function pointBone(bone, child, dir) {
  if (!bone || !child || !bone.parent) return; bone.updateWorldMatrix(true, false); child.updateWorldMatrix(false, false);
  _a.setFromMatrixPosition(bone.matrixWorld); _b.setFromMatrixPosition(child.matrixWorld).sub(_a); if (_b.lengthSq() < 1e-8) return; _b.normalize();
  _q.setFromUnitVectors(_b, dir); bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq))); bone.updateWorldMatrix(false, true);
}

export class Weapons {
  constructor(game) {
    this.game = game; this.cur = 'fists'; this.inv = { pistol: { clip: 12, ammo: 36, ext: false, grip: false } }; this.cool = 0; this.reloadT = 0; this.models = {}; this.aimK = 0; this.lastShot = -9;
    // pooled effects
    this.tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); this.tracer.frustumCulled = false; game.scene.add(this.tracer);
    this.flashL = new THREE.PointLight(0xffb347, 0, 9, 2); game.scene.add(this.flashL);
    this.hud = document.createElement('div'); this.hud.id = 'weaponHud'; this.hud.innerHTML = '<div class="wn"></div><div class="wa"></div><div class="ar"><i></i></div>'; document.getElementById('hud') ? document.getElementById('hud').appendChild(this.hud) : document.body.appendChild(this.hud);
    this.cross = document.createElement('div'); this.cross.id = 'crosshair'; (document.getElementById('hud') || document.body).appendChild(this.cross);
    bus.onHandle('door', (pt) => { if (pt.kind !== 'gunshop') return false; this.shop(); return true; });
    bus.on('tick', (dt) => this.update(dt));
    this._wireTouch();
  }
  get spec() { return WEAPONS[this.cur]; }
  owned() { return ['fists', ...Object.keys(WEAPONS).filter((k) => k !== 'fists' && this.inv[k])].sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot); }
  magOf(k) { const s = WEAPONS[k], i = this.inv[k]; return Math.round(s.mag * (i && i.ext ? 1.5 : 1)); }
  select(k) {
    const P = this.game.player; if (k !== 'fists' && !this.inv[k]) return; if (k === this.cur) return;
    this.cur = k; this.reloadT = 0; P.gunReady = k !== 'fists'; this._attach(); this.game.audio.ui('click');
  }
  cycle(d) { const o = this.owned(); const i = o.indexOf(this.cur); this.select(o[(i + d + o.length) % o.length]); }
  _model(k) { if (!this.models[k]) this.models[k] = gunMesh(k); return this.models[k]; }
  _attach() { // equipped gun in the right hand; the sidearm rides on the hip and long guns on the back
    const h = this.game.player.h;
    for (const k of Object.keys(this.models)) { const m = this.models[k]; if (m.parent) m.parent.remove(m); }
    for (const k of this.owned()) { if (k === 'fists') continue; const m = this._model(k); m.rotation.set(0, 0, 0); m.position.set(0, 0, 0);
      if (k === this.cur) { const b = h._boneFor('handR'); m.position.set(0, -0.07, 0.01); b.add(m); }
      else if (k === 'pistol') { const b = h._boneFor('hips'); m.position.set(-0.19, -0.06, 0.0); m.rotation.set(0, 0, 0); b.add(m); }
      else { const b = h._boneFor('chest'); m.position.set(0.02, 0.05, -0.17); m.rotation.set(0, 0, 0.85); b.add(m); } }
  }
  shop() {
    const G = this.game, E = G.economy;
    const items = () => {
      const list = [];
      for (const [k, s] of Object.entries(WEAPONS)) { if (k === 'fists') continue; const own = !!this.inv[k];
        list.push({ id: 'buy:' + k, name: T(s.name) + ' · ' + T(s.cls), desc: T(`Damage ${s.dmg}${s.pellets ? '×' + s.pellets : ''} · rate ${s.rate}/s · magazine ${s.mag}`), price: own ? 0 : s.price, label: own ? T('Owned') : fmtMoney(s.price), disabled: own });
        if (own) { list.push({ id: 'ammo:' + k, name: T(`Ammo ×${s.pack} for ${s.name}`), desc: `${this.inv[k].clip} / ${this.inv[k].ammo}`, price: s.pack * s.ammoPrice });
          if (!this.inv[k].ext) list.push({ id: 'ext:' + k, name: T(`Extended magazine · ${s.name}`), desc: T('+50% magazine size'), price: 900 });
          if (!this.inv[k].grip) list.push({ id: 'grip:' + k, name: T(`Steady grip · ${s.name}`), desc: T('−35% spread and recoil'), price: 700 }); } }
      for (const a of ARMOR) list.push({ id: 'armor:' + a.id, name: T(a.name), desc: T(`Armour +${a.armor} (absorbs most of each hit)`), price: a.price, disabled: G.player.armor >= a.armor });
      return list;
    };
    const arr = items();
    const ov = G.ui.shop(T('Ironclad Arms'), T('Licensed fictional weapons, ammunition and armour. Bought with money you earn.'), arr, (it) => {
      const [kind, k] = it.id.split(':');
      if (!E.pay(it.price, it.name)) return;
      if (kind === 'buy') { this.inv[k] = { clip: WEAPONS[k].mag, ammo: WEAPONS[k].pack * 2, ext: false, grip: false }; this.select(k); G.ui.toast(T('Weapon purchased'), T(`${WEAPONS[k].name} added to your inventory. Switch with T or 1–5.`), 'good'); }
      if (kind === 'ammo') this.inv[k].ammo += WEAPONS[k].pack;
      if (kind === 'ext') { this.inv[k].ext = true; }
      if (kind === 'grip') this.inv[k].grip = true;
      if (kind === 'armor') { const a = ARMOR.find((x) => x.id === k); G.player.armor = Math.max(G.player.armor, a.armor); }
      G.audio.ui('buy'); bus.emit('weaponShop', kind, k);
      const fresh = items(); arr.length = 0; arr.push(...fresh); // ui.shop re-renders from this same array
    }, { wide: true });
    return ov;
  }
  // ---------------- per frame ----------------
  update(dt) {
    const G = this.game, P = G.player, I = G.input; if (!G.running || !P) return;
    this.cool -= dt; this.flashL.intensity = Math.max(0, this.flashL.intensity - dt * 120); this.tracer.material.opacity = Math.max(0, this.tracer.material.opacity - dt * 14);
    const canUse = P.state === 'foot' && !G.ui.blockingUI && !G.cutscene && !G.interior && !P.action;
    if (!G.ui.blockingUI && P.state === 'foot' && !G.cutscene) {
      if (I.pressed('weaponNext')) this.cycle(1); if (I.pressed('weaponPrev')) this.cycle(-1);
      for (let n = 1; n <= 5; n++) if (I.keys.has('Digit' + n) && !this['_d' + n]) { this['_d' + n] = true; const k = Object.keys(WEAPONS).find((q) => WEAPONS[q].slot === n); if (k) this.select(k); } else if (!I.keys.has('Digit' + n)) this['_d' + n] = false;
      if (I.pressed('holster') && P.state === 'foot') this.select('fists');
    }
    if (this._skin !== P.h.real || !P.h.postPose) { this._skin = P.h.real; P.h.postPose = (h) => this.pose(h); this._attach(); }
    if (P.state !== 'foot' && this.cur !== 'fists') { P.gunReady = false; } else P.gunReady = this.cur !== 'fists';
    const s = this.spec, inv = this.inv[this.cur];
    I.fireHold = canUse && this.cur !== 'fists';
    const aiming = canUse && this.cur !== 'fists' && I.down('block'); P.aiming = aiming;
    this.aimK += ((aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 12);
    G.cam.aimZoom = this.aimK;
    if (P.h.real) P.h.real.forceProc = this.cur !== 'fists' && P.state === 'foot' && (this.aimK > 0.05 || G.time - this.lastShot < 0.6);
    if (this.cur !== 'fists' && canUse) {
      // face where the camera looks while aiming / firing
      if (aiming || G.time - this.lastShot < 0.6) P.faceTarget = G.cam.yaw + Math.PI;
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const need = this.magOf(this.cur) - inv.clip, take = Math.min(need, inv.ammo); inv.clip += take; inv.ammo -= take; } }
      else if ((I.pressed('reload') && inv.clip < this.magOf(this.cur) && inv.ammo > 0)) this._reload();
      const trig = s.auto ? I.down('punch') || I.pressed('punch') : I.pressed('punch');
      if (trig && this.cool <= 0 && this.reloadT <= 0) { if (inv.clip > 0) this.fire(aiming); else if (inv.ammo > 0) this._reload(); else { if (I.pressed('punch')) { G.ui.hint(T('No ammo — buy more at Ironclad Arms'), 1.6); G.audio.ui('fail'); } } }
    }
    this._hud();
    this._police(dt);
  }
  _reload() { this.reloadT = this.spec.reload; this.game.ui.hint(T('Reloading…'), this.spec.reload); this.game.audio.noiseHit && this.game.audio.noiseHit({ pos: this.game.player.pos, f: 2200, d: 0.05, v: 0.12 }); }
  // aim pose: called by the humanoid after its own animation, before the realistic skin copies it
  pose(h) {
    if (this.cur === 'fists' || !this.game.player.gunReady || this.game.player.state !== 'foot') return;
    const k = Math.max(this.aimK, this.game.time - this.lastShot < 0.5 ? 1 : 0); if (k < 0.05) return;
    const cam = this.game.camera, B = h.bones; cam.getWorldDirection(_d);
    const fw = _d.clone(); if (k < 1) { const down = new THREE.Vector3(0, -1, 0); fw.lerp(down, (1 - k) * 0.85).normalize(); }
    pointBone(B.armR, B.foreR, fw); pointBone(B.foreR, B.handR, fw);
    if (WEAPONS[this.cur].slot >= 3 || this.cur === 'pistol') { // support hand
      const side = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
      const l = fw.clone().multiplyScalar(0.9).addScaledVector(side, this.cur === 'pistol' ? 0.35 : 0.55).normalize(); pointBone(B.armL, B.foreL, l);
      const l2 = fw.clone().addScaledVector(side, this.cur === 'pistol' ? 0.55 : 0.2).normalize(); pointBone(B.foreL, B.handL, l2);
    }
  }
  fire(aiming) {
    const G = this.game, P = G.player, s = this.spec, inv = this.inv[this.cur], cam = G.camera;
    this.cool = 1 / s.rate; inv.clip--; this.lastShot = G.time;
    const steady = inv.grip ? 0.65 : 1, spread = (aiming ? s.spread : s.hip) * steady * (P.speed > 3 ? 1.6 : 1);
    cam.getWorldDirection(_d); const org = cam.position.clone();
    // start the ray at the player's shoulder plane so walls behind the camera are ignored
    const shoulderDist = org.distanceTo(P.pos) * 0.92; org.addScaledVector(_d, Math.max(0, shoulderDist - 0.3));
    const muzzle = new THREE.Vector3(); const mm = this.models[this.cur]; if (mm && mm.parent) mm.userData.muzzle.getWorldPosition(muzzle); else muzzle.set(P.pos.x, P.pos.y + 1.4, P.pos.z);
    let last = null;
    for (let i = 0; i < (s.pellets || 1); i++) {
      const dir = _d.clone().add(new THREE.Vector3((R() - 0.5) * 2 * spread, (R() - 0.5) * 2 * spread, (R() - 0.5) * 2 * spread)).normalize();
      last = this.trace(org, dir, s.range, s.dmg, P);
    }
    // effects
    this.flashL.position.copy(muzzle); this.flashL.intensity = 6; G.fx.emit(muzzle.x, muzzle.y, muzzle.z, { color: 0xffd27a, alpha: 0.95, size: 0.35, life: 0.05, grow: 1 });
    if (last) { const p = this.tracer.geometry.attributes.position; p.setXYZ(0, muzzle.x, muzzle.y, muzzle.z); p.setXYZ(1, last.x, last.y, last.z); p.needsUpdate = true; this.tracer.material.opacity = 0.9; }
    this._sound(P.pos, this.cur, 1);
    G.cam.pitch = clamp(G.cam.pitch - s.recoil * steady * (aiming ? 0.7 : 1), -0.75, 1.25); G.cam.yaw += (R() - 0.5) * s.recoil * 0.3 * steady; G.cam.addShake(s.recoil * 1.5);
    if (!this._crimeT || G.time - this._crimeT > 1.2) { this._crimeT = G.time; if (!G.missions.active || !G.missions.active.allowGuns) G.crime('shots', P.pos.clone(), 2); for (const n of G.npcs.list) if (n.active && !n.down && n.role !== 'police' && n.role !== 'thug' && dist2(n.pos.x, n.pos.z, P.pos.x, P.pos.z) < 45 * 45) n.flee(P.pos, 25); }
    bus.emit('shot', this.cur);
  }
  // hitscan against people, vehicles, buildings and the ground; returns the impact point
  trace(org, dir, range, dmg, shooter) {
    const G = this.game; let best = range, hit = null, kind = null, head = false;
    for (const n of G.npcs.list) { // capsule test
      if (!n.active || n.down || n === shooter) continue; const p = n.pos; if (dist2(p.x, p.z, org.x, org.z) > (range + 2) * (range + 2)) continue;
      const t = rayCapsule(org, dir, p.x, p.y + 0.25, p.z, p.y + 1.72, 0.3); if (t !== null && t < best) { best = t; hit = n; kind = 'npc'; head = org.y + dir.y * t > p.y + 1.5; }
    }
    if (shooter !== G.player) { const p = G.player.pos; const t = rayCapsule(org, dir, p.x, p.y + 0.25, p.z, p.y + 1.72, 0.32); if (t !== null && t < best) { best = t; hit = G.player; kind = 'player'; } }
    for (const v of G.vehicles.list) { const t = rayOBB(org, dir, v); if (t !== null && t < best) { best = t; hit = v; kind = 'veh'; } }
    // ground
    if (dir.y < -0.01) { const tg = (org.y - (G.city.surfaceHeight(org.x + dir.x * 10, org.z + dir.z * 10, org.y) || 0)) / -dir.y; if (tg > 0 && tg < best) { best = tg; hit = null; kind = 'ground'; } }
    // walls: is the segment to the hit clear? if not, binary-search the impact distance
    const end = org.clone().addScaledVector(dir, best);
    if (!G.city.segmentClear(org.x, org.y, org.z, end.x, end.y, end.z, 1)) { let lo = 0, hi = best; for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2, m = org.clone().addScaledVector(dir, mid); if (G.city.segmentClear(org.x, org.y, org.z, m.x, m.y, m.z, 1)) lo = mid; else hi = mid; } best = hi; hit = null; kind = 'wall'; }
    const at = org.clone().addScaledVector(dir, best);
    if (kind === 'npc') { const d = dmg * (head ? 2.3 : 1) * (0.9 + R() * 0.2); hit.damage(d, shooter === G.player ? G.player : null, { knock: hit.health - d <= 0 || d > 30, shot: true }); if (G.settings.violence !== 'off') G.fx.blood(at, head ? at : null); bus.emit('npcShot', hit, d, head); }
    else if (kind === 'player') G.player.damage(dmg, shooter, { shot: true });
    else if (kind === 'veh') { hit.hurt(dmg * 0.35, 2); G.fx.emit(at.x, at.y, at.z, { color: 0xffe9a8, alpha: 1, size: 0.12, life: 0.12 }); if (hit.triggerAlarm) hit.triggerAlarm(); }
    else if (kind === 'wall' || kind === 'ground') { G.fx.dust(at, 3); G.fx.emit(at.x, at.y, at.z, { color: 0xffd9a0, alpha: 1, size: 0.08, life: 0.1 }); }
    return at;
  }
  _sound(pos, kind, vol) {
    const A = this.game.audio, c = A.ctx; if (!c || A.muted) return;
    const d = Math.hypot(pos.x - this.game.camera.position.x, pos.z - this.game.camera.position.z), att = clamp(1 / (1 + d / 18), 0.03, 1) * vol;
    const t = c.currentTime, len = kind === 'shotgun' ? 0.32 : kind === 'rifle' ? 0.22 : 0.16;
    const src = c.createBufferSource(); src.buffer = A.white || A.pink; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(kind === 'pistol' ? 3200 : 2600, t); f.frequency.exponentialRampToValueAtTime(380, t + len);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * att, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(A.bus.effects); src.start(t); src.stop(t + len + 0.05);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'shotgun' ? 70 : 110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); const og = c.createGain(); og.gain.setValueAtTime(0.5 * att, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.connect(og).connect(A.bus.effects); o.start(t); o.stop(t + 0.16);
  }
  // armed police at 3+ stars return fire (with limited accuracy)
  _police(dt) {
    const G = this.game, P = G.player, lvl = G.police && (G.police.level || G.police.wanted || 0); if (!lvl || lvl < 3 || P.state === 'down' || P.dead) return;
    for (const n of G.npcs.list) {
      if (!n.active || n.down || n.role !== 'police') continue; n._gunT = (n._gunT ?? 1 + R() * 2) - dt; if (n._gunT > 0) continue; n._gunT = 1.3 + R() * 1.4;
      const d = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z); if (d < 4 || d > 38) continue;
      const o = new THREE.Vector3(n.pos.x, n.pos.y + 1.45, n.pos.z), tgt = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
      if (!G.city.segmentClear(o.x, o.y, o.z, tgt.x, tgt.y, tgt.z, 1.5)) continue;
      n.heading = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
      const acc = clamp(0.55 - d / 70 - (P.speed > 4 ? 0.15 : 0) - (P.crouch ? 0.1 : 0), 0.08, 0.5);
      const dir = tgt.clone().sub(o).normalize(); if (R() > acc) dir.add(new THREE.Vector3((R() - 0.5) * 0.25, (R() - 0.5) * 0.12, (R() - 0.5) * 0.25)).normalize();
      const at = this.trace(o, dir, 45, 8 * (G.settings.difficulty === 'hard' ? 1.3 : G.settings.difficulty === 'easy' ? 0.6 : 1), n);
      const p = this.tracer.geometry.attributes.position; p.setXYZ(0, o.x, o.y, o.z); p.setXYZ(1, at.x, at.y, at.z); p.needsUpdate = true; this.tracer.material.opacity = 0.7;
      this._sound(n.pos, 'pistol', 0.9);
    }
  }
  _hud() {
    const G = this.game, P = G.player, on = G.running && P.state === 'foot' && !G.ui.blockingUI && !G.interior;
    const gun = this.cur !== 'fists';
    this.hud.style.display = on && (gun || P.armor > 0) ? '' : 'none'; this.cross.style.display = on && gun ? '' : 'none'; this.cross.classList.toggle('aim', this.aimK > 0.5);
    if (!on) return;
    const s = this.spec, inv = this.inv[this.cur], txt = gun ? `${T(s.name)}` : T('Fists'), am = gun ? `${inv.clip} / ${inv.ammo}` : '';
    if (this._lt !== txt + am + P.armor) { this._lt = txt + am + P.armor; this.hud.querySelector('.wn').textContent = txt; this.hud.querySelector('.wa').textContent = am; const ar = this.hud.querySelector('.ar'); ar.style.display = P.armor > 0 ? '' : 'none'; ar.querySelector('i').style.width = clamp(P.armor, 0, 100) + '%'; ar.title = T('Armour'); }
  }
  _wireTouch() {
    if (!this.game.touch) return;
    const mk = (label, cls, fn, up) => { const b = document.createElement('button'); b.className = 'tbtn wbtn ' + cls; b.textContent = label; b.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false }); if (up) b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false }); document.body.appendChild(b); return b; };
    this.tAim = mk('◎', 'w-aim', () => this.game.input.setVirtual('block', true), () => this.game.input.setVirtual('block', false));
    this.tSw = mk('⇄', 'w-sw', () => this.cycle(1)); this.tRl = mk('R', 'w-rl', () => { if (this.cur !== 'fists' && this.inv[this.cur].ammo > 0) this._reload(); });
    bus.on('tick', () => { const show = this.game.running && this.game.player.state === 'foot' && !this.game.ui.blockingUI; for (const b of [this.tSw]) b.style.display = show ? '' : 'none'; for (const b of [this.tAim, this.tRl]) b.style.display = show && this.cur !== 'fists' ? '' : 'none'; });
  }
  serialize() { return { cur: this.cur, inv: this.inv }; }
  restore(s) { if (!s) return; this.inv = s.inv || this.inv; if (!this.inv.pistol) this.inv.pistol = { clip: 12, ammo: 24, ext: false, grip: false }; this.select(s.cur && (s.cur === 'fists' || this.inv[s.cur]) ? s.cur : 'fists'); this._attach(); }
}
// ray vs vertical capsule (segment y0..y1 at x,z) – returns distance or null
function rayCapsule(o, d, x, y0, z, y1, r) {
  const ox = o.x - x, oz = o.z - z, a = d.x * d.x + d.z * d.z; if (a < 1e-6) return null;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) return null; const y = o.y + d.y * t; return y >= y0 - r && y <= y1 + r * 0.6 ? t : null;
}
function rayOBB(o, d, v) {
  const c = Math.cos(-v.heading), s = Math.sin(-v.heading), px = o.x - v.pos.x, pz = o.z - v.pos.z;
  const lx = px * c + pz * s, lz = -px * s + pz * c, dx = d.x * c + d.z * s, dz = -d.x * s + d.z * c, ly = o.y - v.pos.y, dy = d.y;
  const hx = (v.W || 1.8) / 2, hz = (v.L || 4.5) / 2, H = v.H || 1.5;
  let t0 = 0, t1 = 1e9; for (const [p, dd, lo, hi] of [[lx, dx, -hx, hx], [ly, dy, 0.2, H], [lz, dz, -hz, hz]]) { if (Math.abs(dd) < 1e-6) { if (p < lo || p > hi) return null; continue; } let a = (lo - p) / dd, b = (hi - p) / dd; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null; }
  return t0 > 0 ? t0 : null;
}
