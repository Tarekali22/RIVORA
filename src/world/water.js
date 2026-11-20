// Ocean surface shader + matching CPU wave function for boats and swimmers.
import { WATER_Y } from './layout.js';

const W = [ // dirX, dirZ, amp, wavelength, speed
  [0.8, 0.6, 0.18, 22, 1.2], [-0.4, 0.9, 0.12, 13, 1.6], [0.95, -0.3, 0.07, 7, 2.1],
];
export function waveHeight(x, z, t, storm = 0) {
  let h = 0; const s = 1 + storm * 1.6;
  for (const [dx, dz, a, l, sp] of W) h += a * s * Math.sin((x * dx + z * dz) * (6.2832 / l) + t * sp);
  return WATER_Y + h;
}

const vert = `
uniform float uTime, uStorm; varying vec3 vW; varying float vH;
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix*vec4(position,1.0);
  float h = 0.0; float s = 1.0 + uStorm*1.6;
  h += 0.18*s*sin(dot(wp.xz, vec2(0.8,0.6))*6.2832/22.0 + uTime*1.2);
  h += 0.12*s*sin(dot(wp.xz, vec2(-0.4,0.9))*6.2832/13.0 + uTime*1.6);
  h += 0.07*s*sin(dot(wp.xz, vec2(0.95,-0.3))*6.2832/7.0 + uTime*2.1);
  wp.y += h; vH = h; vW = wp.xyz;
  vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const frag = `
uniform float uTime, uStorm, uNight; uniform vec3 uSunDir, uSunColor, uSky, uHorizon, uDeep, uShallow;
varying vec3 vW; varying float vH;
#include <fog_pars_fragment>
float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float nn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 p = vW.xz; float t = uTime;
  float e = 0.15;
  float n1 = nn(p*0.35 + vec2(t*0.25, t*0.12)) + nn(p*0.9 - vec2(t*0.4, -t*0.3))*0.5 + nn(p*2.3 + vec2(t*0.7,t*0.5))*0.25;
  float nx = nn((p+vec2(e,0.0))*0.35 + vec2(t*0.25, t*0.12)) + nn((p+vec2(e,0.0))*0.9 - vec2(t*0.4,-t*0.3))*0.5;
  float nz = nn((p+vec2(0.0,e))*0.35 + vec2(t*0.25, t*0.12)) + nn((p+vec2(0.0,e))*0.9 - vec2(t*0.4,-t*0.3))*0.5;
  vec3 N = normalize(vec3((n1-nx)*(1.2+uStorm), 1.0, (n1-nz)*(1.2+uStorm)));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96*pow(1.0-max(dot(N,V),0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uSky, clamp(R.y*1.5,0.0,1.0));
  float shallow = clamp(1.0 - (vW.x-560.0)/120.0, 0.0, 1.0) * step(-660.0, vW.z) + clamp(1.0-(-vW.z-660.0)/30.0,0.0,1.0)*0.4;
  vec3 water = mix(uDeep, uShallow, shallow*0.85);
  vec3 col = mix(water*(0.35+0.65*(1.0-uNight)), sky, fres*0.85);
  float spec = pow(max(dot(R, uSunDir),0.0), 220.0) * 3.0 + pow(max(dot(R,uSunDir),0.0), 18.0)*0.12;
  col += uSunColor * spec * (1.0-uStorm*0.8);
  float foam = smoothstep(0.62, 0.95, n1*0.6 + vH*1.2 + shallow*0.55) * (0.35 + uStorm*0.5);
  float shore = smoothstep(14.0, 0.0, abs(vW.x - 600.0)) * step(-660.0, vW.z) * (0.5+0.5*sin(vW.x*0.9 - t*1.8 + nn(p*0.2)*6.0));
  col = mix(col, vec3(0.92,0.95,0.97)*(1.0-uNight*0.8), clamp(foam + shore*0.45, 0.0, 0.85));
  gl_FragColor = vec4(col, 0.94);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Ocean {
  constructor(scene, envUniforms, quality) {
    this.u = {
      uTime: { value: 0 }, uStorm: { value: 0 }, uNight: { value: 0 },
      uSunDir: envUniforms.uSunDir, uSunColor: envUniforms.uSunColor, uSky: envUniforms.uZenith, uHorizon: envUniforms.uHorizon,
      uDeep: { value: new THREE.Color(0.02, 0.17, 0.26) }, uShallow: { value: new THREE.Color(0.1, 0.52, 0.55) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), vertexShader: vert, fragmentShader: frag, fog: true, transparent: true,
    });
    Object.assign(mat.uniforms, this.u);
    const seg = quality.level >= 2 ? 160 : 90;
    const geo = new THREE.PlaneGeometry(9000, 9000, seg, seg); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.position.set(3600, WATER_Y, -2600); this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  update(dt, env) { this.u.uTime.value += dt; this.u.uStorm.value = env.w.wind * 0.4 + env.w.rain * 0.4; this.u.uNight.value = env.night; }
  height(x, z) { return waveHeight(x, z, this.u.uTime.value, this.u.uStorm.value); }
}
