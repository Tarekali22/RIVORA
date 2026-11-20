// Sky dome, sun/moon, hemisphere light, fog, day/night clock, weather and rain.
// Convention: geographic north = +z, ocean = west (+x), hills = east (-x).
import { clamp, lerp, smoothstep, R, bus } from '../core/util.js';

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,0.0)).xyz); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFrag = `
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor, uMoonDir; uniform float uTime, uCloud, uNight, uSunSize, uOvercast;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5;} return s; }
void main(){
  vec3 d = normalize(vDir); float el = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(el,0.0,1.0), 0.55));
  col = mix(col, uGround, smoothstep(0.0,-0.25,el));
  float sd = max(dot(d,uSunDir),0.0);
  col += uSunColor * (pow(sd, 8.0)*0.35 + pow(sd, 64.0)*0.6) * (1.0-uOvercast*0.8);
  col += uSunColor * smoothstep(1.0-uSunSize, 1.0-uSunSize*0.6, sd) * 4.0 * (1.0-uOvercast);
  // clouds on a plane
  if (el > 0.0) {
    vec2 uv = d.xz/(el+0.12)*0.9 + vec2(uTime*0.004, uTime*0.0015);
    float c = fbm(uv*1.4); float cov = mix(0.74, 0.3, uCloud);
    float cl = smoothstep(cov, cov+0.18, c) * smoothstep(0.0,0.25,el);
    vec3 cc = mix(vec3(1.0), uHorizon*1.1, 0.35) * (0.55 + 0.6*max(uSunDir.y,0.0)) + uSunColor*pow(sd,4.0)*0.4;
    cc = mix(cc, vec3(0.04,0.05,0.08), uNight*0.85);
    col = mix(col, cc, cl*0.9);
    col = mix(col, mix(vec3(0.55,0.58,0.62), vec3(0.05,0.06,0.08), uNight), uOvercast*0.75*smoothstep(-0.05,0.3,el));
    // stars
    float st = step(0.9975, h(floor(d.xz/(el+0.3)*420.0))) * uNight * (1.0-uCloud) * smoothstep(0.05,0.3,el);
    col += vec3(st);
    float md = max(dot(d,uMoonDir),0.0);
    col += vec3(0.85,0.88,1.0) * smoothstep(0.9994,0.9996,md) * uNight * (1.0-uOvercast);
    col += vec3(0.3,0.35,0.5) * pow(md, 30.0) * 0.25 * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Palette keyframes by sun elevation (radians)
const KEYS = [
  { e: -0.35, zen: [0.01, 0.02, 0.06], hor: [0.04, 0.06, 0.12], sun: [0.3, 0.35, 0.6], hemiS: [0.12, 0.15, 0.28], hemiG: [0.03, 0.03, 0.05], sunI: 0.14, hemiI: 0.42, exp: 1.0 },
  { e: -0.08, zen: [0.06, 0.08, 0.2], hor: [0.42, 0.26, 0.28], sun: [1.0, 0.45, 0.25], hemiS: [0.32, 0.27, 0.36], hemiG: [0.08, 0.06, 0.06], sunI: 0.3, hemiI: 0.45, exp: 0.95 },
  { e: 0.06, zen: [0.16, 0.26, 0.52], hor: [1.0, 0.58, 0.32], sun: [1.0, 0.62, 0.34], hemiS: [0.62, 0.6, 0.62], hemiG: [0.28, 0.2, 0.14], sunI: 1.9, hemiI: 0.62, exp: 0.82 },
  { e: 0.28, zen: [0.11, 0.3, 0.7], hor: [0.6, 0.72, 0.86], sun: [1.0, 0.86, 0.68], hemiS: [0.66, 0.76, 0.92], hemiG: [0.36, 0.3, 0.22], sunI: 2.6, hemiI: 0.75, exp: 0.72 },
  { e: 1.2, zen: [0.08, 0.26, 0.68], hor: [0.55, 0.7, 0.88], sun: [1.0, 0.96, 0.9], hemiS: [0.7, 0.8, 0.95], hemiG: [0.38, 0.33, 0.26], sunI: 3.0, hemiI: 0.8, exp: 0.68 },
];
function sampleKeys(e) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  if (e < KEYS[0].e) b = a; if (e > b.e) a = b;
  const t = a === b ? 0 : (e - a.e) / (b.e - a.e);
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t);
  return o;
}

export const WEATHERS = {
  clear: { cloud: 0.05, overcast: 0, rain: 0, fog: 0, wind: 0.2, label: 'Clear' },
  partly: { cloud: 0.45, overcast: 0.05, rain: 0, fog: 0, wind: 0.35, label: 'Partly cloudy' },
  overcast: { cloud: 0.9, overcast: 0.65, rain: 0, fog: 0.15, wind: 0.4, label: 'Overcast' },
  lightrain: { cloud: 0.95, overcast: 0.75, rain: 0.35, fog: 0.25, wind: 0.45, label: 'Light rain' },
  heavyrain: { cloud: 1, overcast: 0.9, rain: 0.85, fog: 0.4, wind: 0.6, label: 'Heavy rain' },
  storm: { cloud: 1, overcast: 1, rain: 1, fog: 0.45, wind: 0.9, lightning: true, label: 'Thunderstorm' },
  fog: { cloud: 0.6, overcast: 0.5, rain: 0, fog: 1, wind: 0.1, label: 'Fog' },
  windy: { cloud: 0.35, overcast: 0.05, rain: 0, fog: 0.05, wind: 1, label: 'Windy' },
};

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer;
    this.hour = 17.2; this.day = 1; this.timeScale = 1 / 120; // game hours per real second (1h = 2 min)
    this.weatherKey = 'clear'; this.autoWeather = true; this.weatherTimer = 600;
    this.w = { ...WEATHERS.clear }; this.target = WEATHERS.clear;
    this.wet = 0; this.flash = 0; this.nextLightning = 8;
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color(0.18, 0.17, 0.16) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uSunColor: { value: new THREE.Color() },
      uTime: { value: 0 }, uCloud: { value: 0 }, uNight: { value: 0 }, uSunSize: { value: 0.0009 }, uOvercast: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
    this.sky.scale.setScalar(5000); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = quality.shadows;
    const sm = quality.shadowSize; this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6b5a45, 0.7); scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xa0b8c8, 150, 1400);
    this.fogFar = quality.drawDistance;

    // env map for reflections
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), skyMat); this.envSky.scale.setScalar(100); this.envScene.add(this.envSky);
    this.envHour = -99; this.envWeather = ''; this.envRT = null;

    this.rain = this._makeRain(quality.rainDrops);
    scene.add(this.rain.mesh);
    this.night = 0; this.sunDir = new THREE.Vector3();
  }
  _makeRain(count) {
    const pos = new Float32Array(count * 6), vel = new Float32Array(count);
    for (let i = 0; i < count; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x, y - 0.6, z], i * 6); vel[i] = 18 + Math.random() * 8; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.35, depthWrite: false });
    const mesh = new THREE.LineSegments(g, m); mesh.frustumCulled = false; mesh.visible = false;
    return { mesh, pos, vel, count };
  }
  setWeather(key, instant = false) {
    if (!WEATHERS[key]) return; this.weatherKey = key; this.target = WEATHERS[key];
    if (instant) Object.assign(this.w, this.target);
    bus.emit('weather', key);
  }
  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.envHour = -99; }
  get isNight() { return this.hour < 6.2 || this.hour > 19.6; }
  get period() { const h = this.hour; return h < 5 ? 'night' : h < 11 ? 'morning' : h < 16 ? 'afternoon' : h < 20.5 ? 'evening' : 'night'; }
  update(dt, focus, cam) {
    this.hour += dt * this.timeScale; if (this.hour >= 24) { this.hour -= 24; this.day++; bus.emit('newday', this.day); }
    this.uniforms.uTime.value += dt;
    // weather transitions
    if (this.autoWeather) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.weatherTimer = 420 + R() * 600;
        const opts = ['clear', 'clear', 'clear', 'partly', 'partly', 'overcast', 'lightrain', 'heavyrain', 'storm', 'fog', 'windy'];
        this.setWeather(opts[Math.floor(R() * opts.length)]);
      }
    }
    const k = 1 - Math.exp(-dt * 0.12);
    for (const key of ['cloud', 'overcast', 'rain', 'fog', 'wind']) this.w[key] = lerp(this.w[key], this.target[key], k);
    this.wet = clamp(this.wet + (this.w.rain > 0.1 ? dt * 0.03 * this.w.rain : -dt * 0.004), 0, 1);

    // sun path: rises east (-x), sets west (+x) over the ocean, transits south (-z)
    const a = (this.hour - 6) / 12 * Math.PI;
    const sd = this.sunDir.set(-Math.cos(a), Math.sin(a) * 0.86, -Math.sin(a) * 0.5).normalize();
    const elev = Math.asin(clamp(sd.y, -1, 1));
    const P = sampleKeys(elev);
    this.night = 1 - smoothstep(-0.2, 0.04, elev);
    const U = this.uniforms;
    const oc = this.w.overcast;
    const grey = (c, f) => { const l = (c[0] + c[1] + c[2]) / 3; return c.map((v) => lerp(v, l * 0.95, f)); };
    U.uZenith.value.setRGB(...grey(P.zen, oc * 0.8)); U.uHorizon.value.setRGB(...grey(P.hor, oc * 0.7));
    U.uSunColor.value.setRGB(...P.sun); U.uSunDir.value.copy(sd); U.uMoonDir.value.set(-sd.x, Math.abs(sd.y) * 0.8 + 0.2, -sd.z * 0.4).normalize();
    U.uCloud.value = this.w.cloud; U.uNight.value = this.night; U.uOvercast.value = oc;
    // lights
    const moonUp = sd.y < 0.02;
    const ldir = moonUp ? U.uMoonDir.value : sd;
    const L = this.sun;
    L.position.set(focus.x + ldir.x * 300, focus.y + ldir.y * 300, focus.z + ldir.z * 300);
    // snap shadow target to texel grid to avoid shimmer
    const texel = 140 / L.shadow.mapSize.x;
    L.target.position.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
    L.position.x += L.target.position.x - focus.x; L.position.z += L.target.position.z - focus.z;
    L.intensity = (moonUp ? 0.25 : P.sunI) * (1 - oc * 0.7) + this.flash * 4;
    L.color.setRGB(...(moonUp ? [0.55, 0.62, 0.85] : P.sun));
    this.hemi.color.setRGB(...P.hemiS); this.hemi.groundColor.setRGB(...P.hemiG);
    this.hemi.intensity = P.hemiI * (1 - oc * 0.15) + this.flash * 2;
    this.renderer.toneMappingExposure = P.exp * (1 + oc * 0.15);
    // fog
    const fogDens = this.w.fog;
    const f = this.scene.fog;
    f.color.copy(U.uHorizon.value).lerp(new THREE.Color(0.55, 0.58, 0.6).multiplyScalar(1 - this.night * 0.85), oc * 0.6);
    const altK = 1 + Math.max(0, cam.position.y - 25) / 120;
    f.near = lerp(120, 8, fogDens) * altK; f.far = lerp(this.fogFar, 160, fogDens) * (1 - this.w.rain * 0.3) * altK;
    this.sky.position.copy(cam.position);
    // lightning
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.target.lightning && this.w.rain > 0.7) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) { this.nextLightning = 6 + R() * 16; this.flash = 1; bus.emit('lightning', 0.6 + R() * 3); }
    }
    // rain particles
    const rn = this.rain; rn.mesh.visible = this.w.rain > 0.03;
    if (rn.mesh.visible) {
      rn.mesh.position.set(cam.position.x, cam.position.y - 12, cam.position.z);
      const p = rn.pos, n = Math.floor(rn.count * clamp(this.w.rain, 0.05, 1)), wind = this.w.wind * 3;
      for (let i = 0; i < rn.count; i++) {
        const o = i * 6;
        if (i >= n) { p[o + 1] = -100; p[o + 4] = -100; continue; }
        let y = p[o + 1] - rn.vel[i] * dt; let x = p[o] + wind * dt;
        if (y < 0 || p[o + 1] < -50) { y = 28 + Math.random() * 4; x = (Math.random() - 0.5) * 60; p[o + 2] = (Math.random() - 0.5) * 60; }
        if (x > 30) x -= 60;
        p[o] = x; p[o + 1] = y; p[o + 3] = x - wind * 0.03; p[o + 4] = y - 0.55 - this.w.rain * 0.4; p[o + 5] = p[o + 2];
      }
      rn.mesh.geometry.attributes.position.needsUpdate = true;
      rn.mesh.material.opacity = 0.22 + 0.25 * this.w.rain;
    }
    // env map refresh
    const wkey = this.weatherKey + Math.round(oc * 4);
    if (Math.abs(this.hour - this.envHour) > 0.4 || wkey !== this.envWeather) {
      this.envHour = this.hour; this.envWeather = wkey;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt; this.scene.environment = rt.texture;
    }
  }
  serialize() { return { hour: this.hour, day: this.day, weather: this.weatherKey, auto: this.autoWeather }; }
  restore(s) { if (!s) return; this.setHour(s.hour ?? 17); this.day = s.day || 1; this.autoWeather = s.auto !== false; this.setWeather(s.weather || 'clear', true); }
}
