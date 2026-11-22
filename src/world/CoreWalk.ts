import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import noise from './shaders/noise.glsl?raw';

const MAX_POINTS = 700;
const FLASHES = 28;

/**
 * Prologue: inside the Sun, a photon is absorbed and re-emitted again and
 * again, each time in a random direction. The path tangles while the camera
 * slowly pulls back, then the photon breaks out into open space.
 */
export class CoreWalk {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  readonly duration = 32;
  time = 0;
  done = false;

  private plasmaMat: THREE.ShaderMaterial;
  private line: Line2;
  private lineGeo: LineGeometry;
  private lineMat: LineMaterial;
  private head = new THREE.Vector2();
  private pts: THREE.Vector2[] = [];
  private nextStep = 0;
  private photon: THREE.Mesh;
  private photonMat: THREE.ShaderMaterial;
  private flashes: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; age: number }[] = [];
  private flashIdx = 0;
  private exitDir = new THREE.Vector2(1, 0);
  private camPos = new THREE.Vector2();
  private dirty = false;
  private aspect = 1;
  private escape = 0;

  constructor() {
    this.plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uCam: { value: new THREE.Vector2() },
        uZoom: { value: 1 },
        uExit: { value: 0 },
        uExitDir: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.999, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${noise}
        uniform float uTime; uniform float uAspect; uniform vec2 uCam; uniform float uZoom; uniform float uExit; uniform vec2 uExitDir;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0 / uZoom + uCam;
          float t = uTime;
          vec2 q = vec2(snoise(vec3(p * 1.3, t * 0.07)), snoise(vec3(p * 1.3 + 5.2, t * 0.07)));
          float n = snoise(vec3(p * 2.4 + q * 1.4, t * 0.11)) * 0.55
                  + snoise(vec3(p * 6.0 + q * 2.0, t * 0.2)) * 0.28
                  + snoise(vec3(p * 15.0, t * 0.35)) * 0.12;
          float heat = 0.5 + 0.5 * n;
          vec3 deep = vec3(0.28, 0.03, 0.01);
          vec3 mid = vec3(0.85, 0.22, 0.03);
          vec3 hot = vec3(1.0, 0.68, 0.28);
          vec3 col = mix(deep, mid, smoothstep(0.15, 0.6, heat));
          col = mix(col, hot, smoothstep(0.6, 0.95, heat));
          col *= 0.3 + 0.42 * heat;
          // Breaking out: the plasma thins toward the exit and floods with light.
          float toward = dot(normalize(vUv - 0.5 + 1e-4), uExitDir) * 0.5 + 0.5;
          col = mix(col, vec3(1.0, 0.9, 0.7) * 2.2, uExit * uExit * smoothstep(0.2, 1.0, toward));
          float vig = smoothstep(1.2, 0.2, length((vUv - 0.5) * vec2(uAspect, 1.0)));
          gl_FragColor = vec4(col * (0.4 + 0.6 * vig), 1.0);
        }`,
      depthWrite: false,
      depthTest: false,
    });
    const plasma = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.plasmaMat);
    plasma.frustumCulled = false;
    plasma.renderOrder = -1;
    this.scene.add(plasma);

    this.lineGeo = new LineGeometry();
    this.lineGeo.setPositions([0, 0, 0, 0, 0, 0]);
    this.lineMat = new LineMaterial({
      linewidth: 2.2,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.line = new Line2(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    const glowFrag = /* glsl */ `
      uniform float uA; uniform vec3 uCol; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float g = exp(-r * r * 60.0) * 3.0 + exp(-r * 5.0) * 0.5;
        gl_FragColor = vec4(uCol * g * uA * smoothstep(1.0, 0.7, r), 1.0);
      }`;
    const glowVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    this.photonMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 }, uCol: { value: new THREE.Color(1, 0.95, 0.85) } },
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.photon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.photonMat);
    this.photon.renderOrder = 5;
    this.scene.add(this.photon);

    for (let i = 0; i < FLASHES; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color(1, 0.7, 0.35) } },
        vertexShader: glowVert,
        fragmentShader: glowFrag,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.flashes.push({ mesh, mat, age: 1 });
    }
  }

  reset(portrait: boolean) {
    this.time = 0;
    this.done = false;
    this.escape = 0;
    this.head.set(0, 0);
    this.pts = [this.head.clone()];
    this.nextStep = 0.6;
    this.exitDir.set(portrait ? 0 : 1, portrait ? -1 : 0);
    this.plasmaMat.uniforms.uExitDir.value.copy(this.exitDir);
    this.camPos.set(0, 0);
    this.dirty = true;
    for (const f of this.flashes) {
      f.age = 1;
      f.mesh.visible = false;
    }
  }

  resize(w: number, h: number, dpr: number) {
    this.aspect = w / h;
    this.lineMat.resolution.set(w * dpr, h * dpr);
    this.plasmaMat.uniforms.uAspect.value = this.aspect;
  }

  /** Seconds between scatterings: slow enough to follow at first, then a blur. */
  private interval() {
    const t = this.time;
    return Math.max(0.022, 0.26 * Math.exp(-t / 7.5));
  }

  private step() {
    const ang = Math.random() * Math.PI * 2;
    const len = 0.025 + Math.random() * 0.06;
    const bias = 0.004 + 0.012 * Math.min(1, this.time / 24);
    this.head.x += Math.cos(ang) * len + this.exitDir.x * bias;
    this.head.y += Math.sin(ang) * len + this.exitDir.y * bias;
    this.pts.push(this.head.clone());
    if (this.pts.length > MAX_POINTS) this.pts.shift();
    this.dirty = true;
    const f = this.flashes[this.flashIdx++ % FLASHES];
    f.age = 0;
    f.mesh.visible = true;
    f.mesh.position.set(this.head.x, this.head.y, 0);
  }

  private rebuildLine() {
    const n = this.pts.length;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const old = new THREE.Color(0.7, 0.2, 0.05);
    const fresh = new THREE.Color(1.6, 1.35, 0.9);
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      pos.push(p.x, p.y, 0);
      const k = n > 1 ? i / (n - 1) : 1;
      c.copy(old).lerp(fresh, Math.pow(k, 3)).multiplyScalar(0.35 + 0.9 * Math.pow(k, 1.5));
      col.push(c.r, c.g, c.b);
    }
    if (n < 2) {
      pos.push(pos[0], pos[1], 0);
      col.push(col[0], col[1], col[2]);
    }
    this.lineGeo.dispose();
    this.lineGeo = new LineGeometry();
    this.lineGeo.setPositions(pos);
    this.lineGeo.setColors(col);
    this.line.geometry = this.lineGeo;
    this.line.computeLineDistances();
    this.dirty = false;
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    const breakAt = this.duration - 3.2;

    if (t < breakAt) {
      this.nextStep -= dt;
      let guard = 0;
      while (this.nextStep <= 0 && guard++ < 8) {
        this.step();
        this.nextStep += this.interval();
      }
    } else {
      // Escape: one long straight run toward open space.
      this.escape = Math.min(1, (t - breakAt) / 2.6);
      const sp = 0.4 + this.escape * this.escape * 6;
      this.head.addScaledVector(this.exitDir, sp * dt);
      const last = this.pts[this.pts.length - 1];
      if (last.distanceTo(this.head) > 0.02) {
        this.pts.push(this.head.clone());
        if (this.pts.length > MAX_POINTS) this.pts.shift();
        this.dirty = true;
      }
    }
    if (this.dirty) this.rebuildLine();

    // Camera: drift after the photon, pulling back as the tangle grows.
    const zoom = THREE.MathUtils.lerp(1.15, 0.42, THREE.MathUtils.smoothstep(t, 2, breakAt));
    const follow = 1 - Math.exp(-dt * (t > breakAt ? 3.5 : 0.9));
    this.camPos.lerp(this.head, follow);
    const cam = this.camera;
    cam.left = -this.aspect;
    cam.right = this.aspect;
    cam.top = 1;
    cam.bottom = -1;
    cam.zoom = zoom;
    cam.position.set(this.camPos.x, this.camPos.y, 5);
    cam.updateProjectionMatrix();

    const pu = this.plasmaMat.uniforms;
    pu.uTime.value = t;
    pu.uCam.value.copy(this.camPos);
    pu.uZoom.value = zoom;
    pu.uExit.value = this.escape;

    const ps = (0.16 + this.escape * 0.25) / zoom;
    this.photon.position.set(this.head.x, this.head.y, 0);
    this.photon.scale.set(ps, ps, 1);
    this.photonMat.uniforms.uA.value = 1 + this.escape * 2;

    for (const f of this.flashes) {
      if (f.age >= 1) {
        f.mesh.visible = false;
        continue;
      }
      f.age = Math.min(1, f.age + dt * 2.2);
      const s = (0.05 + f.age * 0.12) / zoom;
      f.mesh.scale.set(s, s, 1);
      f.mat.uniforms.uA.value = (1 - f.age) * (1 - f.age) * 1.4;
    }

    if (t >= this.duration) this.done = true;
  }
}
