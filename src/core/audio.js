// Procedural Web Audio engine. All sounds are synthesized at runtime (no files, no network).
// Mix philosophy: moderate defaults, a soft limiter, cooldowns and a voice budget so streets never get harsh.
import { clamp, lerp, R } from './util.js';

export const DEFAULT_LEVELS = { master: 0.7, music: 0.45, ambience: 0.55, voices: 0.6, traffic: 0.5, effects: 0.65, ui: 0.5 };

export class AudioEngine {
  constructor() { this.ctx = null; this.levels = { ...DEFAULT_LEVELS }; this.muted = false; this.cool = new Map(); this.voiceBudget = 0; this.engines = new Set(); }
  get ready() { return !!this.ctx; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -14; this.limiter.knee.value = 10; this.limiter.ratio.value = 6; this.limiter.attack.value = 0.004; this.limiter.release.value = 0.25;
    this.master = c.createGain(); this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048;
    this.master.connect(this.limiter); this.limiter.connect(this.analyser); this.analyser.connect(c.destination);
    this.bus = {};
    for (const k of ['music', 'ambience', 'voices', 'traffic', 'effects', 'ui']) { const g = c.createGain(); g.connect(this.master); this.bus[k] = g; }
    // indoor filter on ambience + traffic (outdoor sounds muffle when inside)
    this.outdoor = c.createBiquadFilter(); this.outdoor.type = 'lowpass'; this.outdoor.frequency.value = 20000;
    this.outdoor.connect(this.bus.ambience);
    this.trafficFilt = c.createBiquadFilter(); this.trafficFilt.type = 'lowpass'; this.trafficFilt.frequency.value = 20000; this.trafficFilt.connect(this.bus.traffic);
    this.applyLevels();
    this._noise();
    this._beds();
    this.music = new Sequencer(this);
    this.listenerPos = new THREE.Vector3();
  }
  applyLevels() {
    if (!this.ctx) return; const L = this.levels, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : L.master, t, 0.05);
    for (const k of Object.keys(this.bus)) this.bus[k].gain.setTargetAtTime(L[k], t, 0.05);
  }
  setLevel(k, v) { this.levels[k] = v; this.applyLevels(); }
  _noise() {
    const c = this.ctx, n = c.sampleRate * 2;
    const mk = (fill) => { const b = c.createBuffer(1, n, c.sampleRate); fill(b.getChannelData(0)); return b; };
    this.white = mk((d) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    this.pink = mk((d) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } });
    this.brown = mk((d) => { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  }
  _src(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.loopStart = Math.random(); return s; }
  _filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _bed(buf, chain, dest) { const s = this._src(buf); let n = s; for (const f of chain) { n.connect(f); n = f; } const g = this._gain(0); n.connect(g); g.connect(dest); s.start(); return g; }
  _beds() {
    const c = this.ctx;
    this.beds = {
      city: this._bed(this.brown, [this._filter('lowpass', 380)], this.outdoor),
      cityHi: this._bed(this.pink, [this._filter('bandpass', 900, 0.4), this._filter('lowpass', 2400)], this.outdoor),
      ocean: this._bed(this.pink, [this._filter('lowpass', 900), this._filter('highpass', 120)], this.outdoor),
      wind: this._bed(this.white, [this._filter('bandpass', 600, 0.6)], this.outdoor),
      rain: this._bed(this.white, [this._filter('highpass', 1300), this._filter('lowpass', 7000)], this.outdoor),
      rainLow: this._bed(this.pink, [this._filter('lowpass', 500)], this.outdoor),
      room: this._bed(this.brown, [this._filter('lowpass', 220)], this.bus.ambience),
      tire: this._bed(this.pink, [this._filter('lowpass', 650)], this.bus.traffic),
      skid: this._bed(this.white, [this._filter('bandpass', 1100, 2.2)], this.bus.effects),
      freefall: this._bed(this.white, [this._filter('bandpass', 380, 0.5)], this.bus.effects),
    };
    // ocean swell LFO
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = this._gain(0.5); lfo.connect(lg); this.oceanSwell = this._gain(1); lg.connect(this.oceanSwell.gain); lfo.start();
    // crowd babble: three formant voices with random syllables
    this.babble = this._gain(0); this.babble.connect(this._filter('lowpass', 1800)).connect(this.bus.voices);
    this.babbleVoices = [];
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110 + i * 35;
      const f1 = this._filter('bandpass', 600, 4), f2 = this._filter('bandpass', 1400, 5), g = this._gain(0);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.babble); o.start();
      this.babbleVoices.push({ o, f1, f2, g, next: 0 });
    }
  }
  setListener(cam) {
    if (!this.ctx) return; const L = this.ctx.listener, p = cam.position; this.listenerPos.copy(p);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) { const t = this.ctx.currentTime; L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02); L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02); L.upX.setTargetAtTime(u.x, t, 0.02); L.upY.setTargetAtTime(u.y, t, 0.02); L.upZ.setTargetAtTime(u.z, t, 0.02); }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
  panner(pos, ref = 6, roll = 1.2) {
    const p = this.ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 400;
    if (pos) { if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); }
    return p;
  }
  setPannerPos(p, pos) { if (p.positionX) { const t = this.ctx.currentTime; p.positionX.setTargetAtTime(pos.x, t, 0.03); p.positionY.setTargetAtTime(pos.y, t, 0.03); p.positionZ.setTargetAtTime(pos.z, t, 0.03); } else p.setPosition(pos.x, pos.y, pos.z); }
  far(pos, d = 90) { return pos && this.listenerPos.distanceToSquared(pos) > d * d; }
  cooldown(key, sec) { const t = performance.now() / 1000; if ((this.cool.get(key) || 0) > t) return false; this.cool.set(key, t + sec); return true; }
  // ---- generic one-shot helpers ----
  _env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _out(bus, pos, ref, roll) { if (!pos) return this.bus[bus]; const p = this.panner(pos, ref, roll); p.connect(bus === 'ambience' ? this.outdoor : bus === 'traffic' ? this.trafficFilt : this.bus[bus]); return p; }
  noiseHit({ bus = 'effects', pos, type = 'bandpass', f = 1000, q = 1, a = 0.002, d = 0.08, v = 0.3, buf, f2, ref = 4, roll = 1.3, delay = 0 }) {
    if (!this.ctx || this.far(pos)) return; const c = this.ctx, t = c.currentTime + delay;
    const s = this._src(buf || this.white, false), fl = this._filter(type, f, q), g = this._gain(0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    s.connect(fl).connect(g).connect(this._out(bus, pos, ref, roll)); this._env(g, t, a, v, d); s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.05);
  }
  tone({ bus = 'effects', pos, type = 'sine', f = 440, f2, a = 0.005, d = 0.2, v = 0.2, ref = 4, roll = 1.3, delay = 0, filter }) {
    if (!this.ctx || this.far(pos)) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = this._gain(0); let n = o; if (filter) { const fl = this._filter(filter[0], filter[1], filter[2] || 0.7); o.connect(fl); n = fl; }
    n.connect(g).connect(this._out(bus, pos, ref, roll)); this._env(g, t, a, v, d); o.start(t); o.stop(t + a + d + 0.05);
  }
  // ---- named sounds ----
  footstep(surface, pos, v = 0.5) {
    if (!this.ctx) return;
    const S = { concrete: [2200, 0.8, 0.045, 0.32], wood: [700, 1.2, 0.07, 0.38], sand: [3800, 0.5, 0.11, 0.16], grass: [3000, 0.6, 0.08, 0.16], tile: [3400, 2, 0.04, 0.3], metal: [1800, 6, 0.06, 0.25], gym: [300, 0.8, 0.06, 0.3], water: [900, 0.8, 0.18, 0.3] }[surface] || [2000, 0.8, 0.05, 0.3];
    this.noiseHit({ pos, f: S[0] * (0.9 + R() * 0.2), q: S[1], d: S[2], v: S[3] * v, ref: 3, roll: 1.6 });
    if (surface === 'wood' || surface === 'gym') this.tone({ pos, f: 110 + R() * 30, f2: 60, d: 0.07, v: 0.18 * v, ref: 3, roll: 1.6 });
  }
  whoosh(pos) { this.noiseHit({ pos, f: 500, f2: 2200, q: 1.5, d: 0.16, v: 0.16 }); }
  punch(pos, heavy = false) { this.tone({ pos, f: heavy ? 110 : 140, f2: 45, d: 0.13, v: heavy ? 0.5 : 0.38 }); this.noiseHit({ pos, type: 'lowpass', f: 1200, d: 0.05, v: 0.3 }); }
  block(pos) { this.noiseHit({ pos, type: 'lowpass', f: 700, d: 0.05, v: 0.22 }); }
  impact(pos, s = 0.5) { this.tone({ bus: 'traffic', pos, f: 70, f2: 35, d: 0.25, v: 0.25 + s * 0.35, ref: 8 }); this.noiseHit({ bus: 'traffic', pos, type: 'lowpass', f: 900, d: 0.2 + s * 0.3, v: 0.25 + s * 0.35, buf: this.brown, ref: 8 }); if (s > 0.55) for (let i = 0; i < 6; i++) this.tone({ pos, f: 2500 + R() * 3500, d: 0.08 + R() * 0.1, v: 0.05, delay: 0.03 + R() * 0.25 }); }
  splash(pos, s = 0.6) { this.noiseHit({ pos, f: 900, q: 0.6, d: 0.35 + s * 0.4, v: 0.25 * s + 0.1, buf: this.pink }); }
  horn(pos, kind = 'car') { if (!this.ctx || !this.cooldown('horn' + (pos ? Math.round(pos.x / 20) : ''), 2.5)) return; const d = kind === 'truck' ? 0.6 : 0.28; for (const f of kind === 'truck' ? [220, 277] : [370, 466]) this.tone({ bus: 'traffic', pos, type: 'square', f, d, a: 0.01, v: 0.08, filter: ['lowpass', 1800], ref: 10 }); }
  ui(kind = 'click') {
    if (!this.ctx) return;
    if (kind === 'click') this.tone({ bus: 'ui', f: 1250, d: 0.03, v: 0.12 });
    if (kind === 'back') this.tone({ bus: 'ui', f: 800, d: 0.04, v: 0.1 });
    if (kind === 'ding') { this.tone({ bus: 'ui', f: 988, d: 0.25, v: 0.12 }); this.tone({ bus: 'ui', f: 1319, d: 0.35, v: 0.1, delay: 0.09 }); }
    if (kind === 'cash') { for (const [f, dl] of [[1568, 0], [2093, 0.07], [2637, 0.14]]) this.tone({ bus: 'ui', f, d: 0.35, v: 0.09, delay: dl }); this.noiseHit({ bus: 'ui', f: 3000, d: 0.12, v: 0.06, delay: 0.02 }); }
    if (kind === 'error') this.tone({ bus: 'ui', type: 'square', f: 180, d: 0.18, v: 0.07, filter: ['lowpass', 900] });
    if (kind === 'mission') { [523, 659, 784, 1046].forEach((f, i) => this.tone({ bus: 'ui', type: 'triangle', f, d: 0.5, v: 0.1, delay: i * 0.11 })); }
    if (kind === 'fail') { [392, 330, 262].forEach((f, i) => this.tone({ bus: 'ui', type: 'triangle', f, d: 0.45, v: 0.1, delay: i * 0.16 })); }
    if (kind === 'shutter') { this.noiseHit({ bus: 'ui', f: 3000, d: 0.02, v: 0.2 }); this.noiseHit({ bus: 'ui', f: 2400, d: 0.03, v: 0.18, delay: 0.07 }); }
    if (kind === 'chime') { this.tone({ bus: 'ui', f: 659, d: 0.6, v: 0.1 }); this.tone({ bus: 'ui', f: 523, d: 0.8, v: 0.1, delay: 0.35 }); }
    if (kind === 'stat') { this.tone({ bus: 'ui', type: 'triangle', f: 880, f2: 1320, d: 0.2, v: 0.08 }); }
  }
  ringtone(on) {
    if (!this.ctx) return; clearInterval(this._ring); if (!on) return;
    const play = () => [659, 784, 988, 784, 659, 988].forEach((f, i) => this.tone({ bus: 'ui', type: 'sine', f, d: 0.14, v: 0.09, delay: i * 0.12 }));
    play(); this._ring = setInterval(play, 1800);
  }
  vibrate() { this.tone({ bus: 'ui', type: 'square', f: 70, d: 0.25, v: 0.05, filter: ['lowpass', 200] }); }
  // human non-verbal sounds (rare, quiet)
  human(kind, pos, pitch = 1) {
    if (!this.ctx || this.far(pos, 30) || !this.cooldown('human', 1.2)) return;
    const vf = (f, q) => ['bandpass', f, q];
    if (kind === 'cough') { for (const dl of [0, 0.22]) { this.noiseHit({ bus: 'voices', pos, f: 1100, q: 1.2, a: 0.01, d: 0.12, v: 0.22, delay: dl }); this.tone({ bus: 'voices', pos, type: 'sawtooth', f: 130 * pitch, d: 0.1, v: 0.06, filter: vf(500, 2), delay: dl }); } }
    if (kind === 'sneeze') { this.tone({ bus: 'voices', pos, type: 'sawtooth', f: 220 * pitch, f2: 320 * pitch, a: 0.3, d: 0.2, v: 0.06, filter: vf(800, 3) }); this.noiseHit({ bus: 'voices', pos, type: 'highpass', f: 2500, a: 0.005, d: 0.18, v: 0.25, delay: 0.5 }); }
    if (kind === 'laugh') { for (let i = 0; i < 5; i++) this.tone({ bus: 'voices', pos, type: 'sawtooth', f: (210 - i * 8) * pitch, d: 0.08, a: 0.01, v: 0.06, filter: vf(750, 3), delay: i * 0.14 }); }
    if (kind === 'yawn') this.tone({ bus: 'voices', pos, type: 'sawtooth', f: 280 * pitch, f2: 140 * pitch, a: 0.2, d: 1.1, v: 0.04, filter: vf(700, 2.5) });
    if (kind === 'sigh') this.noiseHit({ bus: 'voices', pos, f: 650, q: 0.9, a: 0.15, d: 0.8, v: 0.12, buf: this.pink });
    if (kind === 'clear') this.noiseHit({ bus: 'voices', pos, type: 'lowpass', f: 450, a: 0.02, d: 0.25, v: 0.15, buf: this.brown });
    if (kind === 'ouch') this.tone({ bus: 'voices', pos, type: 'sawtooth', f: 260 * pitch, f2: 170 * pitch, a: 0.01, d: 0.22, v: 0.09, filter: vf(800, 2.5) });
    if (kind === 'grunt') this.tone({ bus: 'voices', pos, type: 'sawtooth', f: 120 * pitch, f2: 95 * pitch, a: 0.01, d: 0.14, v: 0.1, filter: vf(450, 2) });
    if (kind === 'scream') this.tone({ bus: 'voices', pos, type: 'sawtooth', f: 520 * pitch, f2: 420 * pitch, a: 0.05, d: 0.7, v: 0.07, filter: vf(1400, 2.5) });
    if (kind === 'bark') { for (const dl of [0, 0.3]) { this.tone({ bus: 'effects', pos, type: 'sawtooth', f: 330 * pitch, f2: 200 * pitch, a: 0.005, d: 0.12, v: 0.12, filter: vf(900, 2), delay: dl }); this.noiseHit({ pos, f: 1200, d: 0.06, v: 0.1, delay: dl }); } }
    if (kind === 'meow') this.tone({ bus: 'effects', pos, type: 'sawtooth', f: 520 * pitch, f2: 760 * pitch, a: 0.1, d: 0.45, v: 0.06, filter: vf(1500, 3) });
    if (kind === 'robot') { [880, 1320, 1047, 1568].forEach((f, i) => this.tone({ bus: 'effects', pos, type: 'square', f: f * pitch, d: 0.06, v: 0.04, filter: ['lowpass', 3000], delay: i * 0.07 })); }
    if (kind === 'purr') this.noiseHit({ bus: 'effects', pos, type: 'lowpass', f: 160, a: 0.2, d: 1.2, v: 0.12, buf: this.brown });
  }
  birds(pos) { if (!this.ctx || !this.cooldown('birds', 3)) return; const n = 2 + Math.floor(R() * 5), base = 2400 + R() * 2400; for (let i = 0; i < n; i++) this.tone({ bus: 'ambience', pos, f: base * (0.9 + R() * 0.3), f2: base * (1.2 + R() * 0.4), d: 0.05 + R() * 0.06, v: 0.035, delay: i * (0.09 + R() * 0.08), ref: 10 }); }
  gull(pos) { if (!this.ctx || !this.cooldown('gull', 6)) return; for (let i = 0; i < 3; i++) this.tone({ bus: 'ambience', pos, type: 'sawtooth', f: 1300, f2: 750, a: 0.03, d: 0.28, v: 0.025, filter: ['bandpass', 1500, 3], delay: i * 0.36, ref: 15 }); }
  crickets(pos) { if (!this.ctx || !this.cooldown('crick', 1.4)) return; for (let i = 0; i < 4; i++) this.tone({ bus: 'ambience', pos, f: 4400 + R() * 300, d: 0.03, v: 0.018, delay: i * 0.06, ref: 8 }); }
  thunder(delay) { if (!this.ctx) return; this.noiseHit({ bus: 'ambience', type: 'lowpass', f: 420, f2: 70, a: 0.2, d: 3.5, v: 0.32, buf: this.brown, delay }); }
  metalClank(pos) { [312, 811, 1543].forEach((f) => this.tone({ pos, f, d: 0.35, v: 0.05 })); }
  coffee() { this.noiseHit({ bus: 'ambience', f: 3200, q: 0.8, a: 0.2, d: 1.4, v: 0.06 }); }
  clink(pos) { this.tone({ pos, f: 2800 + R() * 900, d: 0.15, v: 0.04 }); }
  deploy() { this.noiseHit({ f: 400, q: 0.5, a: 0.01, d: 0.6, v: 0.35, buf: this.pink }); for (let i = 0; i < 6; i++) this.noiseHit({ f: 300, q: 1, d: 0.05, v: 0.12, delay: 0.1 + i * 0.08 }); }
  lighter(pos) { this.noiseHit({ pos, f: 3500, d: 0.03, v: 0.12 }); this.noiseHit({ pos, type: 'lowpass', f: 800, a: 0.05, d: 0.3, v: 0.05, delay: 0.05 }); }
  door(pos) { this.noiseHit({ pos, type: 'lowpass', f: 500, d: 0.18, v: 0.2, buf: this.brown }); }
  carDoor(pos) { this.tone({ pos, f: 90, f2: 50, d: 0.12, v: 0.25 }); this.noiseHit({ pos, type: 'lowpass', f: 1500, d: 0.06, v: 0.2 }); }
  beep(pos) { this.tone({ pos, type: 'square', f: 2000, d: 0.06, v: 0.04, filter: ['lowpass', 3000] }); }

  // ---- continuous vehicle voices ----
  engine(kind = 'gas') {
    if (!this.ctx) return null; const c = this.ctx;
    const out = this._gain(0), pan = this.panner(null, 7, 1.1); out.connect(pan).connect(this.trafficFilt);
    const lp = this._filter('lowpass', 600, 1); lp.connect(out);
    const nodes = [];
    const v = { kind, out, pan, lp, nodes, rpm: 0, load: 0 };
    if (kind === 'ev') {
      const o1 = c.createOscillator(); o1.type = 'sine'; const o2 = c.createOscillator(); o2.type = 'triangle'; const g2 = this._gain(0.3);
      o1.connect(lp); o2.connect(g2).connect(lp); o1.start(); o2.start(); nodes.push(o1, o2); v.o1 = o1; v.o2 = o2; lp.frequency.value = 2500;
    } else if (kind === 'rotor' || kind === 'prop') {
      const s = this._src(this.brown); const am = this._gain(0.5); const lfo = c.createOscillator(); lfo.frequency.value = kind === 'rotor' ? 17 : 38; const lg = this._gain(0.5);
      lfo.connect(lg).connect(am.gain); s.connect(am).connect(lp); s.start(); lfo.start(); nodes.push(s, lfo); v.lfo = lfo; lp.frequency.value = kind === 'rotor' ? 420 : 900;
      const wh = c.createOscillator(); wh.type = 'sine'; wh.frequency.value = kind === 'rotor' ? 1700 : 300; const wg = this._gain(0.05); wh.connect(wg).connect(lp); wh.start(); nodes.push(wh); v.whine = wh;
    } else if (kind === 'boat') {
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; const s = this._src(this.pink); const sg = this._gain(0.6); o1.connect(lp); s.connect(sg).connect(lp); o1.start(); s.start(); nodes.push(o1, s); v.o1 = o1;
    } else {
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; const o2 = c.createOscillator(); o2.type = 'square'; const g2 = this._gain(0.35);
      o1.connect(lp); o2.connect(g2).connect(lp); o1.start(); o2.start(); nodes.push(o1, o2); v.o1 = o1; v.o2 = o2;
      const s = this._src(this.pink); const ng = this._gain(0.25); const nf = this._filter('bandpass', 400, 0.8); s.connect(nf).connect(ng).connect(lp); s.start(); nodes.push(s); v.noise = ng;
    }
    this.engines.add(v); return v;
  }
  engineSet(v, { rpm = 0, load = 0, speed = 0, pos, vol = 1, pitch = 1 }) {
    if (!v || !this.ctx) return; const t = this.ctx.currentTime;
    if (pos) this.setPannerPos(v.pan, pos);
    if (v.kind === 'ev') { const f = (90 + speed * 22) * pitch; v.o1.frequency.setTargetAtTime(f, t, 0.05); v.o2.frequency.setTargetAtTime(f * 2.01, t, 0.05); v.out.gain.setTargetAtTime((0.025 + Math.min(speed, 40) * 0.0016 + load * 0.03) * vol, t, 0.08); }
    else if (v.kind === 'rotor' || v.kind === 'prop') { v.lfo.frequency.setTargetAtTime((v.kind === 'rotor' ? 12 : 30) + rpm * (v.kind === 'rotor' ? 8 : 25), t, 0.2); v.whine.frequency.setTargetAtTime((v.kind === 'rotor' ? 1400 : 200) + rpm * 500, t, 0.2); v.out.gain.setTargetAtTime((0.12 + rpm * 0.16) * vol, t, 0.15); }
    else if (v.kind === 'boat') { v.o1.frequency.setTargetAtTime((38 + rpm * 70) * pitch, t, 0.06); v.lp.frequency.setTargetAtTime(300 + load * 900, t, 0.1); v.out.gain.setTargetAtTime((0.05 + rpm * 0.08) * vol, t, 0.1); }
    else { const f = (28 + rpm * 95) * pitch; v.o1.frequency.setTargetAtTime(f, t, 0.04); v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04); v.lp.frequency.setTargetAtTime(260 + load * 1500 + rpm * 500, t, 0.06); v.out.gain.setTargetAtTime((0.035 + rpm * 0.05 + load * 0.05) * vol, t, 0.06); }
  }
  engineStop(v) { if (!v || !this.ctx) return; const t = this.ctx.currentTime; v.out.gain.setTargetAtTime(0, t, 0.08); setTimeout(() => { for (const n of v.nodes) try { n.stop(); } catch (e) {} v.pan.disconnect(); }, 400); this.engines.delete(v); }
  siren() {
    if (!this.ctx) return null; const c = this.ctx; const o = c.createOscillator(); o.type = 'triangle'; const lfo = c.createOscillator(); lfo.frequency.value = 0.42; const lg = this._gain(330);
    lfo.connect(lg).connect(o.frequency); o.frequency.value = 980; const g = this._gain(0); const pan = this.panner(null, 12, 1.1); const f = this._filter('lowpass', 2800);
    o.connect(f).connect(g).connect(pan).connect(this.trafficFilt); o.start(); lfo.start(); return { o, lfo, g, pan };
  }
  sirenSet(s, pos, on) { if (!s) return; this.setPannerPos(s.pan, pos); s.g.gain.setTargetAtTime(on ? 0.075 : 0, this.ctx.currentTime, 0.1); }
  sirenStop(s) { if (!s) return; s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch (e) {} }, 300); }

  // ---- per-frame ambience mix ----
  update(dt, S) {
    if (!this.ctx) return; const t = this.ctx.currentTime, B = this.beds, set = (g, v, tc = 0.6) => g.gain.setTargetAtTime(v, t, tc);
    const inside = S.indoor;
    this.outdoor.frequency.setTargetAtTime(inside ? 420 : 20000, t, 0.3);
    this.trafficFilt.frequency.setTargetAtTime(inside ? 380 : S.inCar ? 2600 : 20000, t, 0.3);
    const night = S.night, dens = S.density;
    set(B.city, (0.1 + dens * 0.22) * (1 - night * 0.45) * (inside ? 0.5 : 1));
    set(B.cityHi, (0.015 + dens * 0.04) * (1 - night * 0.6));
    const coast = clamp(1 - S.coastDist / 260, 0, 1);
    set(B.ocean, coast * 0.42 * (0.7 + 0.3 * Math.sin(t * 0.7)) + (S.onWater ? 0.15 : 0));
    set(B.wind, 0.02 + S.wind * 0.12 + clamp(S.altitude / 200, 0, 1) * 0.1 + (S.speed > 15 && !S.inCar ? (S.speed - 15) * 0.004 : 0));
    set(B.rain, S.rain * 0.22 * (S.inCar ? 1.3 : 1)); set(B.rainLow, S.rain * 0.18);
    set(B.room, inside ? 0.12 : 0);
    set(B.tire, S.inCar ? clamp(S.speed / 40, 0, 1) * 0.16 * (S.wet ? 1.6 : 1) : 0, 0.1);
    set(B.skid, clamp(S.slip, 0, 1) * 0.18, 0.05);
    set(B.freefall, S.freefall ? clamp(S.fallSpeed / 50, 0, 1) * 0.5 : 0, 0.2);
    // crowd babble scaled by nearby talkers
    const crowd = clamp(S.crowd / 10, 0, 1) * (inside ? 0.9 : 0.75);
    set(this.babble, crowd * 0.07, 0.8);
    for (const v of this.babbleVoices) {
      if (t > v.next) {
        v.next = t + 0.09 + Math.random() * 0.16;
        const talk = Math.random() < 0.62;
        v.g.gain.setTargetAtTime(talk ? 0.3 + Math.random() * 0.5 : 0, t, 0.025);
        v.f1.frequency.setTargetAtTime(350 + Math.random() * 600, t, 0.03); v.f2.frequency.setTargetAtTime(1000 + Math.random() * 1300, t, 0.03);
        v.o.frequency.setTargetAtTime((v.o.frequency.value > 160 ? 180 : 105) * (0.9 + Math.random() * 0.25), t, 0.08);
      }
    }
    // random ambient creatures
    if (!inside) {
      if (night < 0.4 && S.green && Math.random() < dt * 0.25) this.birds(S.near(18));
      if (night > 0.6 && S.green && Math.random() < dt * 0.6) this.crickets(S.near(10));
      if (coast > 0.5 && night < 0.5 && Math.random() < dt * 0.06) this.gull(S.near(40, 20));
    }
    this.music.update(dt, S);
  }
  // test helper: peak + RMS of the master output
  measure() { if (!this.analyser) return null; const a = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(a); let pk = 0, s = 0; for (const v of a) { pk = Math.max(pk, Math.abs(v)); s += v * v; } return { peak: pk, rms: Math.sqrt(s / a.length) }; }
}

// Procedural music: club set (Pulse) and two car-radio stations.
class Sequencer {
  constructor(A) {
    this.A = A; const c = A.ctx; this.out = A._gain(0); this.filt = A._filter('lowpass', 20000); this.out.connect(this.filt).connect(A.bus.music);
    this.style = null; this.next = 0; this.step = 0; this.bpm = 122;
    this.reverbish = A._gain(0.2); const d = c.createDelay(); d.delayTime.value = 0.18; const fb = A._gain(0.25); this.reverbish.connect(d); d.connect(fb).connect(d); d.connect(this.out);
  }
  setStyle(s) { if (this.style === s) return; this.style = s; this.step = 0; this.bpm = s === 'club' ? 122 : s === 'chill' ? 84 : s === 'drive' ? 104 : 120; this.next = this.A.ctx.currentTime + 0.05; }
  update(dt, S) {
    const A = this.A, c = A.ctx, t = c.currentTime;
    const style = S.music ? S.music.style : null;
    if (!style) { this.out.gain.setTargetAtTime(0, t, 0.3); this.style = null; return; }
    this.setStyle(style);
    this.out.gain.setTargetAtTime(S.music.vol, t, 0.3); this.filt.frequency.setTargetAtTime(S.music.muffle ? 520 : 18000, t, 0.2);
    const spb = 60 / this.bpm / 4;
    while (this.next < t + 0.12) { this._play(this.step, this.next, style); this.next += spb; this.step = (this.step + 1) % 64; }
  }
  _note(type, f, t, d, v, dest, filt) { const A = this.A, c = A.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); const g = A._gain(0); let n = o; if (filt) { const fl = A._filter('lowpass', filt, 2); o.connect(fl); n = fl; } n.connect(g).connect(dest || this.out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.start(t); o.stop(t + d + 0.02); }
  _play(st, t, style) {
    const A = this.A, c = A.ctx, beat = st % 4 === 0, bar = Math.floor(st / 16) % 4;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (style === 'club' || style === 'drive') {
      if (beat) { const o = c.createOscillator(); const g = A._gain(0); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); o.connect(g).connect(this.out); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.start(t); o.stop(t + 0.3); }
      if (st % 4 === 2) { const s = A._src(A.white, false); const f = A._filter('highpass', 7000); const g = A._gain(0); s.connect(f).connect(g).connect(this.out); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.start(t); s.stop(t + 0.06); }
      if (st % 8 === 4) { const s = A._src(A.white, false); const f = A._filter('bandpass', 1800, 0.8); const g = A._gain(0); s.connect(f).connect(g).connect(this.out); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); s.start(t); s.stop(t + 0.15); }
      const roots = [45, 45, 41, 43][bar]; const bassPat = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
      if (bassPat[st % 16]) this._note('sawtooth', mtof(roots + (st % 16 === 10 ? 12 : 0)), t, 0.14, 0.13, null, 520);
      if (st % 16 === 0 || st % 16 === 6 || st % 16 === 12) for (const iv of [12, 15, 19]) this._note('square', mtof(roots + iv + 12), t, 0.16, 0.025, this.reverbish, 2400);
    } else if (style === 'chill') {
      const prog = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]][bar];
      if (st % 16 === 0) for (const m of prog) this._note('triangle', mtof(m), t, 1.6, 0.04, this.reverbish);
      if (st % 8 === 0) { const o = c.createOscillator(); const g = A._gain(0); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.1); o.connect(g).connect(this.out); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.start(t); o.stop(t + 0.3); }
      if (st % 8 === 4) { const s = A._src(A.pink, false); const f = A._filter('bandpass', 2000, 0.7); const g = A._gain(0); s.connect(f).connect(g).connect(this.out); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); s.start(t); s.stop(t + 0.2); }
      if (st % 2 === 0 && Math.random() < 0.35) this._note('sine', mtof(prog[Math.floor(Math.random() * 4)] + 12), t, 0.35, 0.035, this.reverbish);
      if (st % 4 === 0) this._note('sine', mtof(prog[0] - 12), t, 0.4, 0.09);
    }
  }
}
