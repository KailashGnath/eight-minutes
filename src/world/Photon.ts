import * as THREE from 'three';

/**
 * The photon: a white-hot core with layered glow, an anamorphic flare along
 * the beam and a faint prismatic ring, pulling a trail that stretches with
 * time-warp. Everything is sized in screen pixels so it reads the same from
 * the surface of the Sun to the edge of the solar system.
 */
export class Photon {
  readonly group = new THREE.Group();
  readonly core: THREE.Mesh;
  readonly trail: THREE.Mesh;
  readonly shock: THREE.Mesh;
  readonly position = new THREE.Vector3();
  intensity = 0;
  shockProgress = 1;

  private coreMat: THREE.ShaderMaterial;
  private trailMat: THREE.ShaderMaterial;
  private shockMat: THREE.ShaderMaterial;

  constructor() {
    this.coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uDir: { value: new THREE.Vector2(1, 0) },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uDir; uniform float uIntensity; uniform float uTime;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float along = dot(p, uDir);
          float perp = dot(p, vec2(-uDir.y, uDir.x));
          float pulse = 1.0 + 0.07 * sin(uTime * 7.0) + 0.04 * sin(uTime * 17.0);
          float core = exp(-r * r * 900.0) * 7.0;
          float inner = exp(-r * r * 90.0) * 1.5;
          float halo = exp(-r * 6.5) * 0.42 * pulse;
          float spike = exp(-abs(perp) * 140.0) * exp(-abs(along) * 2.6) * 1.1;
          float spike2 = exp(-abs(along) * 180.0) * exp(-abs(perp) * 9.0) * 0.4;
          float ang = atan(p.y, p.x);
          vec3 spec = 0.5 + 0.5 * cos(6.2831 * (ang / 6.2831 * 2.0 + vec3(0.0, 0.33, 0.67)) + uTime * 0.6);
          float ring = exp(-pow((r - 0.36) / 0.028, 2.0)) * 0.09;
          vec3 col = vec3(1.0) * core
                   + vec3(1.0, 0.94, 0.82) * inner
                   + vec3(1.0, 0.72, 0.42) * halo
                   + vec3(1.0, 0.88, 0.7) * (spike + spike2)
                   + spec * ring;
          col *= uIntensity * smoothstep(1.0, 0.75, r);
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.coreMat);
    this.core.frustumCulled = false;
    this.core.renderOrder = 10;

    this.trailMat = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uLenPx: { value: 400 },
        uWarp: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity; uniform float uTime; uniform float uLenPx; uniform float uWarp;
        varying vec2 vUv;
        void main(){
          float head = vUv.x;
          float px = (1.0 - head) * uLenPx; // pixels behind the photon
          // A faint electromagnetic wobble near the head, settling into a clean line behind.
          float wob = sin(px * 0.11 - uTime * 24.0) * 0.07 * exp(-px / 90.0) * (1.0 - uWarp);
          float y = (vUv.y - 0.5) * 2.0 - wob;
          float fall = pow(head, 1.7 + uWarp * 0.8);
          float core = exp(-y * y * 140.0);
          float glow = exp(-y * y * 7.0) * 0.32;
          float flow = 0.82 + 0.18 * sin(px * 0.045 + uTime * 9.0) * sin(px * 0.013 - uTime * 3.0);
          vec3 hot = vec3(1.0, 0.95, 0.85);
          vec3 warm = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.8, 0.5), head);
          vec3 col = (hot * core * 1.9 + warm * glow) * fall * flow;
          col *= smoothstep(0.0, 0.08, head) * smoothstep(1.0, 0.985, head);
          gl_FragColor = vec4(col * uIntensity, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 9;

    this.shockMat = new THREE.ShaderMaterial({
      uniforms: { uP: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uP; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float rad = 0.08 + uP * 0.92;
          float w = 0.02 + uP * 0.05;
          float ring = exp(-pow((r - rad) / w, 2.0));
          float fill = exp(-r * r * 30.0) * (1.0 - uP);
          float a = (1.0 - uP) * (1.0 - uP);
          vec3 col = vec3(1.0, 0.82, 0.55) * ring * 1.6 * a + vec3(1.0, 0.95, 0.85) * fill * 2.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shockMat);
    this.shock.frustumCulled = false;
    this.shock.visible = false;

    this.group.add(this.trail, this.core, this.shock);
  }

  update(o: {
    camera: THREE.Camera;
    unitsPerPx: number;
    portrait: boolean;
    visualRate: number;
    trailStartX: number;
    time: number;
    reduceMotion: boolean;
    shockAt: THREE.Vector3;
  }) {
    const s = o.unitsPerPx;
    const vis = this.intensity > 0.001;
    this.core.visible = vis;
    this.trail.visible = vis;

    this.core.position.copy(this.position);
    this.core.quaternion.copy(o.camera.quaternion);
    const coreSize = 170 * s;
    this.core.scale.set(coreSize, coreSize, 1);
    this.coreMat.uniforms.uDir.value.set(o.portrait ? 0 : 1, o.portrait ? -1 : 0);
    this.coreMat.uniforms.uIntensity.value = this.intensity;
    this.coreMat.uniforms.uTime.value = o.time;

    // Trail length grows with how fast time is moving (log scale), never back into the Sun.
    const vr = Math.max(1, o.visualRate);
    const warp = Math.min(1, Math.log10(vr) / 3);
    const lenPx = o.reduceMotion ? 300 : 340 + 1500 * warp;
    const len = Math.max(0, Math.min(lenPx * s, this.position.x - o.trailStartX));
    const width = (o.reduceMotion ? 36 : 40 + 10 * warp) * s;
    this.trail.position.set(this.position.x - len / 2, this.position.y, this.position.z);
    this.trail.scale.set(Math.max(len, 1e-3), width, 1);
    this.trailMat.uniforms.uIntensity.value = this.intensity;
    this.trailMat.uniforms.uTime.value = o.time;
    this.trailMat.uniforms.uLenPx.value = len / s;
    this.trailMat.uniforms.uWarp.value = warp;

    this.shock.visible = this.shockProgress < 1;
    if (this.shock.visible) {
      this.shock.position.copy(o.shockAt);
      this.shock.quaternion.copy(o.camera.quaternion);
      const r = 260 * s;
      this.shock.scale.set(r, r, 1);
      this.shockMat.uniforms.uP.value = this.shockProgress;
    }
  }
}
