// Multi-file build bootstrap: local three.js r160 + add-ons, then the realistic people and cars
// (merged from "Miami Nights 2"), then the RIVORA game bundle.
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

window.THREE = Object.assign({}, T);
const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const q = new URLSearchParams(location.search);
const bar = document.querySelector('#loading .bar i'), msg = document.querySelector('#loading .msg');
const CH = touch ? ['carlos', 'ryan', 'emma', 'priya', 'andre', 'mei'] : ['carlos', 'ryan', 'luca', 'ethan', 'andre', 'emma', 'hannah', 'mei', 'priya'];
const CARS = ['car_sport_lo', 'car_concept', 'car_muscle', 'car_muscle_wheel'];
const HI = touch ? [] : ['carlos'];
const loader = new GLTFLoader();
async function glb(name) {
  const m = await import('./a/' + name + '.js'); const s = atob(m.default), n = s.length, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = s.charCodeAt(i);
  return loader.parseAsync(u.buffer, './a/');
}
async function loadReal() {
  const list = [...CARS.map((n) => ['cars', n, n]), ...CH.map((n) => ['chars', n, 'c_' + n]), ...HI.map((n) => ['hi', n, 'p_' + n])];
  const R = { chars: {}, cars: {}, hi: {}, SkeletonUtils, BGU, post: { EffectComposer, RenderPass, UnrealBloomPass, OutputPass }, touch };
  let done = 0; const up = () => { if (bar) bar.style.width = Math.round(done / list.length * 100) + '%'; if (msg) msg.textContent = 'Loading realistic people & cars… ' + Math.round(done / list.length * 100) + '%'; };
  up();
  await Promise.all(list.map(async ([kind, key, file]) => { R[kind][key] = await glb(file); done++; up(); }));
  window.RIVORA_REAL = R;
}
try { if (q.get('classic') !== '1') await loadReal(); }
catch (e) { console.warn('[RIVORA] realistic assets unavailable, using procedural art', e); window.RIVORA_REAL = null; }
const s = document.createElement('script'); s.src = './game.js'; document.body.appendChild(s);
