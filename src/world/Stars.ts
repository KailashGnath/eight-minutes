import * as THREE from 'three';
import noise from './shaders/noise.glsl?raw';

/**
 * Background stars drawn in screen space at the far plane. Three parallax
 * layers scroll a tiny fraction of the camera's travel, and stretch into
 * streaks during time-warp. A faint nebula wash sits behind them.
 */
export class Stars {
  readonly mesh: THREE.Mesh;
  readonly nebula: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private nebMat: THREE.ShaderMaterial;

  constructor(count: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));

    const pos = new Float32Array(count * 2);
    const size = new Float32Array(count);
    const bright = new Float32Array(count);
    const layer = new Float32Array(count);
    const tint = new Float32Array(count * 3);
    const warm = new THREE.Color('#ffd9a8');
    const white = new THREE.Color('#ffffff');
    const blue = new THREE.Color('#bcd4ff');
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 2] = Math.random();
      pos[i * 2 + 1] = Math.random();
      const r = Math.random();
      const l = r < 0.6 ? 0 : r < 0.9 ? 1 : 2;
      layer[i] = [0.012, 0.03, 0.07][l];
      size[i] = [1.2, 1.7, 2.4][l] + Math.random() * [0.6, 0.9, 1.4][l];
      bright[i] = Math.pow(Math.random(), 2.4) * [0.55, 0.8, 1.1][l] + 0.06;
      const h = Math.random();
      c.copy(h < 0.2 ? warm : h < 0.75 ? white : blue);
      tint.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 2));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.setAttribute('aBright', new THREE.InstancedBufferAttribute(bright, 1));
    geo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layer, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    geo.instanceCount = count;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uOffset: { value: 0 },
        uDir: { value: new THREE.Vector2(1, 0) },
        uStreak: { value: 0 },
        uTime: { value: 0 },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aPos; attribute float aSize; attribute float aBright; attribute float aLayer; attribute vec3 aTint;
        uniform vec2 uRes; uniform float uDpr; uniform float uOffset; uniform vec2 uDir; uniform float uStreak; uniform float uTime;
        varying vec2 vUv; varying vec3 vCol; varying float vRatio;
        void main(){
          vec2 p = fract(aPos - uDir * (uOffset * aLayer) / uRes);
          vec2 ndc = p * 2.0 - 1.0;
          float s = aSize * uDpr;
          float len = s + uStreak * aLayer * 14.0 * uDpr;
          vec2 across = vec2(-uDir.y, uDir.x);
          vec2 px = position.x * uDir * len + position.y * across * s;
          px -= uDir * (len - s) * 0.5; // the streak trails behind the star
          gl_Position = vec4(ndc + px * 2.0 / uRes, 0.99999, 1.0);
          vUv = position.xy + 0.5;
          vRatio = len / s;
          float tw = 0.82 + 0.18 * sin(uTime * (1.3 + aPos.x * 3.0) + aPos.y * 80.0);
          vCol = aTint * aBright * tw / mix(1.0, vRatio, 0.6);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade;
        varying vec2 vUv; varying vec3 vCol; varying float vRatio;
        void main(){
          float a = abs(vUv.x - 0.5) * 2.0;
          float b = abs(vUv.y - 0.5) * 2.0;
          float along = 1.0 - smoothstep(1.0 - 1.0 / vRatio, 1.0, a);
          float d = exp(-b * b * 3.2) * along;
          gl_FragColor = vec4(vCol * d * uFade, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    this.nebMat = new THREE.ShaderMaterial({
      uniforms: {
        uOffset: { value: 0 },
        uDir: { value: new THREE.Vector2(1, 0) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.999995, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${noise}
        uniform float uOffset; uniform vec2 uDir; uniform vec2 uRes; uniform float uFade;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 1.6;
          p -= uDir * uOffset * 0.004 / uRes.y;
          float n = snoise(vec3(p * 0.9, 1.7)) * 0.6 + snoise(vec3(p * 2.3, 4.1)) * 0.3;
          float band = exp(-pow((p.y + p.x * 0.35) * 1.4, 2.0));
          vec3 col = mix(vec3(0.02, 0.03, 0.07), vec3(0.06, 0.035, 0.08), smoothstep(-0.3, 0.6, n));
          col *= (0.35 + 0.65 * band) * smoothstep(-0.6, 0.8, n);
          gl_FragColor = vec4(col * 0.4 * uFade, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.nebula = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.nebMat);
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = -11;
  }

  update(o: { w: number; h: number; dpr: number; offsetPx: number; portrait: boolean; streakPx: number; time: number; fade: number }) {
    const u = this.mat.uniforms;
    u.uRes.value.set(o.w * o.dpr, o.h * o.dpr);
    u.uDpr.value = o.dpr;
    u.uOffset.value = o.offsetPx * o.dpr;
    u.uDir.value.set(o.portrait ? 0 : 1, o.portrait ? -1 : 0);
    u.uStreak.value = o.streakPx;
    u.uTime.value = o.time;
    u.uFade.value = o.fade;
    const n = this.nebMat.uniforms;
    n.uOffset.value = o.offsetPx;
    n.uDir.value.copy(u.uDir.value);
    n.uRes.value.set(o.w, o.h);
    n.uFade.value = o.fade;
  }
}
