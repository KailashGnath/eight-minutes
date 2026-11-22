import * as THREE from 'three';

/**
 * Interplanetary dust around the camera. Particles live in a box that wraps
 * around the camera target entirely on the GPU, at many depths, so they give
 * real parallax — the main cue for how fast the photon is going. During warp
 * they stretch into streaks along the beam.
 */
export class Dust {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(count: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));

    const seed = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const cool = new THREE.Color('#c6d4ff');
    const warm = new THREE.Color('#ffcf91');
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      seed.set([Math.random(), Math.random(), Math.random()], i * 3);
      size[i] = 0.9 + Math.pow(Math.random(), 3) * 2.6;
      const b = 0.12 + Math.pow(Math.random(), 2) * 0.5;
      c.copy(Math.random() < 0.28 ? warm : cool).multiplyScalar(b);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    geo.instanceCount = count;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector2(2400, 2400) },
        uZ: { value: new THREE.Vector2(-1600, 700) },
        uScale: { value: 1 },
        uStreak: { value: 0 },
        uOpacity: { value: 1 },
        uNear: { value: 100 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; attribute float aSize; attribute vec3 aCol;
        uniform vec3 uCenter; uniform vec2 uBox; uniform vec2 uZ; uniform float uScale; uniform float uStreak; uniform float uNear; uniform float uTime;
        varying vec2 vUv; varying vec3 vCol; varying float vRatio; varying float vFade;
        void main(){
          vec3 w;
          w.x = uCenter.x + (fract(aSeed.x - uCenter.x / uBox.x) - 0.5) * uBox.x;
          w.y = uCenter.y + (fract(aSeed.y - uCenter.y / uBox.y) - 0.5) * uBox.y;
          w.z = mix(uZ.x, uZ.y, aSeed.z) * uScale;
          w.y += sin(uTime * 0.15 + aSeed.x * 60.0) * 3.0 * uScale;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vec2 d = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xy;
          d = normalize(d + vec2(1e-6));
          vec2 across = vec2(-d.y, d.x);
          float s = aSize * uScale;
          float len = s + uStreak;
          mv.xy += position.x * d * len + position.y * across * s - d * (len - s) * 0.5;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy + 0.5;
          vRatio = len / s;
          float depth = -mv.z;
          vFade = smoothstep(uNear * 0.3, uNear, depth);
          vCol = aCol / mix(1.0, vRatio, 0.75);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv; varying vec3 vCol; varying float vRatio; varying float vFade;
        void main(){
          float a = abs(vUv.x - 0.5) * 2.0;
          float b = abs(vUv.y - 0.5) * 2.0;
          float along = 1.0 - smoothstep(1.0 - 1.0 / vRatio, 1.0, a);
          float m = exp(-b * b * 3.5) * along;
          gl_FragColor = vec4(vCol * m * uOpacity * vFade, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  update(o: { center: THREE.Vector3; unitsPerPx: number; extent: number; streak: number; opacity: number; camDist: number; time: number }) {
    const u = this.mat.uniforms;
    // The box tracks the framing so density on screen stays constant at any zoom.
    const s = o.unitsPerPx;
    u.uCenter.value.copy(o.center);
    u.uScale.value = s;
    u.uBox.value.set(o.extent * 1.5, o.extent * 1.5);
    u.uStreak.value = o.streak;
    u.uOpacity.value = o.opacity;
    u.uNear.value = o.camDist * 0.35;
    u.uTime.value = o.time;
  }
}
