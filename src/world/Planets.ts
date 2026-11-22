import * as THREE from 'three';
import noise from './shaders/noise.glsl?raw';
import { EARTH_R, MERCURY, MOON_R, VENUS, u, type Trip } from '../core/Scale';

export type BodyId = 'mercury' | 'venus' | 'earth' | 'moon';

export interface Body {
  id: BodyId;
  name: string;
  mesh: THREE.Mesh;
  radius: number;
  widthKm: number;
}

/** Layer the telescope lens renders, so dust and trails stay out of the close-up. */
export const LENS_LAYER = 1;

const TYPE: Record<BodyId, number> = { mercury: 0, venus: 1, earth: 2, moon: 3 };

const vert = /* glsl */ `
  varying vec3 vN; varying vec3 vObjN; varying vec3 vWorld;
  void main(){
    vObjN = normal;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const frag = /* glsl */ `
  ${noise}
  uniform int uType; uniform float uTime; uniform vec3 uSun; uniform float uSpin;
  varying vec3 vN; varying vec3 vObjN; varying vec3 vWorld;
  float fbm(vec3 p){ return snoise(p) * 0.55 + snoise(p * 2.1) * 0.27 + snoise(p * 4.3) * 0.13; }
  void main(){
    vec3 n = normalize(vN);
    vec3 L = normalize(uSun - vWorld);
    float ndl = dot(n, L);
    float day = smoothstep(-0.06, 0.22, ndl);
    float c = cos(uSpin), s = sin(uSpin);
    vec3 p = normalize(vObjN);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    vec3 albedo; float spec = 0.0; vec3 night = vec3(0.0);
    if (uType == 0) {
      float h = fbm(p * 3.0);
      float crater = smoothstep(0.5, 0.62, abs(snoise(p * 11.0))) + smoothstep(0.55, 0.7, abs(snoise(p * 26.0))) * 0.6;
      albedo = vec3(0.5, 0.47, 0.44) * (0.78 + 0.32 * h) + crater * 0.07;
    } else if (uType == 1) {
      float b = snoise(vec3(p.x * 1.6, p.y * 7.5, p.z * 1.6) + vec3(uTime * 0.01, 0.0, 0.0)) * 0.55 + fbm(p * 3.5) * 0.35;
      albedo = mix(vec3(0.82, 0.68, 0.46), vec3(1.0, 0.92, 0.74), 0.5 + 0.5 * b);
    } else if (uType == 2) {
      float h = fbm(p * 1.5) + snoise(p * 7.0) * 0.08;
      float land = smoothstep(0.1, 0.16, h);
      float lat = abs(p.y);
      vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.02, 0.13, 0.3), 0.5 + 0.5 * snoise(p * 3.0));
      vec3 ground = mix(vec3(0.13, 0.25, 0.08), vec3(0.48, 0.38, 0.22), smoothstep(0.15, 0.45, h + snoise(p * 5.0) * 0.15));
      ground = mix(ground, vec3(0.55, 0.45, 0.3), smoothstep(0.2, 0.45, 1.0 - lat) * 0.3 * smoothstep(0.2, 0.4, h));
      albedo = mix(ocean, ground, land);
      albedo = mix(albedo, vec3(0.92, 0.95, 1.0), smoothstep(0.8, 0.88, lat + snoise(p * 4.0) * 0.05));
      // Clouds: domain-warped and stretched along latitude so they swirl in bands, not blobs.
      vec3 cp = p * vec3(2.2, 4.2, 2.2) + vec3(uTime * 0.012, 0.0, 0.0);
      vec3 warp = vec3(snoise(cp * 0.8 + 3.1), snoise(cp * 0.8 + 7.7), snoise(cp * 0.8 + 1.3));
      float cn = fbm(cp + warp * 0.9) + snoise(p * 16.0 + warp) * 0.12;
      float cl = smoothstep(0.12, 0.6, cn) * (0.75 + 0.25 * smoothstep(0.1, 0.5, lat));
      albedo = mix(albedo, vec3(0.97, 0.98, 1.0), cl * 0.82);
      spec = (1.0 - land) * (1.0 - cl);
      night = vec3(1.0, 0.72, 0.38) * land * smoothstep(0.62, 0.85, snoise(p * 60.0)) * (1.0 - cl) * 0.35 * smoothstep(0.8, 0.45, lat);
    } else {
      float m = fbm(p * 2.0);
      float maria = smoothstep(0.15, 0.45, snoise(p * 1.6 + 3.0));
      albedo = vec3(0.62, 0.61, 0.58) * (0.8 + 0.25 * m) - maria * 0.2;
    }
    vec3 col = albedo * max(ndl, 0.0) * 1.7 + albedo * 0.015;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.88, 0.72) * pow(max(dot(n, H), 0.0), 70.0) * spec * 1.4 * day;
    col += night * (1.0 - day);
    gl_FragColor = vec4(col, 1.0);
  }`;

/**
 * Mercury, Venus, Earth and the Moon at true size, lit from the Sun, lined up
 * along the beam. Surfaces are procedural, so there are no image downloads.
 */
export class Planets {
  readonly group = new THREE.Group();
  readonly bodies: Record<BodyId, Body>;
  readonly atmosphere: THREE.Mesh;
  private mats: THREE.ShaderMaterial[] = [];
  private atmoMat: THREE.ShaderMaterial;
  atmoPulse = 0;

  constructor(trip: Trip) {
    const make = (id: BodyId, name: string, rKm: number, segs: number): Body => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uType: { value: TYPE[id] },
          uTime: { value: 0 },
          uSun: { value: new THREE.Vector3(0, 0, 0) },
          uSpin: { value: 0 },
        },
        vertexShader: vert,
        fragmentShader: frag,
      });
      this.mats.push(mat);
      const radius = u(rKm);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, Math.round(segs * 0.75)), mat);
      mesh.layers.enable(LENS_LAYER);
      this.group.add(mesh);
      return { id, name, mesh, radius, widthKm: rKm * 2 };
    };

    this.bodies = {
      mercury: make('mercury', 'Mercury', MERCURY.r, 64),
      venus: make('venus', 'Venus', VENUS.r, 64),
      earth: make('earth', 'Earth', EARTH_R, 96),
      moon: make('moon', 'Moon', MOON_R, 48),
    };

    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3() }, uPulse: { value: 0 } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uPulse;
        varying vec3 vN; varying vec3 vObjN; varying vec3 vWorld;
        void main(){
          vec3 n = normalize(vN);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 L = normalize(uSun - vWorld);
          float f = pow(1.0 - max(dot(n, V), 0.0), 2.6);
          float lit = smoothstep(-0.35, 0.5, dot(n, L));
          vec3 sky = vec3(0.32, 0.6, 1.0);
          vec3 col = sky * f * (0.15 + 1.1 * lit) * (1.0 + uPulse * 2.5);
          col += sky * uPulse * 0.25 * lit;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(this.bodies.earth.radius * 1.045, 96, 72), this.atmoMat);
    this.atmosphere.layers.enable(LENS_LAYER);
    this.group.add(this.atmosphere);

    this.place(trip);
  }

  /** Line them up along the beam, just off-axis so the photon slips past (and hits Earth dead on). */
  place(trip: Trip) {
    const b = this.bodies;
    b.mercury.mesh.position.set(trip.mercuryX, 11, -3);
    b.venus.mesh.position.set(trip.venusX, -13, 2);
    b.earth.mesh.position.set(trip.earthX, 0, 0);
    b.moon.mesh.position.set(trip.moonX, 15, -9);
    this.atmosphere.position.copy(b.earth.mesh.position);
  }

  update(time: number) {
    for (const m of this.mats) {
      m.uniforms.uTime.value = time;
      m.uniforms.uSpin.value = time * 0.02;
    }
    this.atmoMat.uniforms.uPulse.value = this.atmoPulse;
  }
}

/** A burst of blue light where the photon meets the atmosphere: why the sky is blue. */
export class Scatter {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  progress = 1;

  constructor(count = 520) {
    const geo = new THREE.BufferGeometry();
    const dir = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const size = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // Mostly back toward the Sun and sideways, hugging the sunlit hemisphere.
      v.set(-Math.random() * 1.2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize();
      dir.set([v.x, v.y, v.z], i * 3);
      spd[i] = 0.3 + Math.pow(Math.random(), 1.8) * 2.6;
      size[i] = 1.5 + Math.random() * 3.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uP: { value: 1 }, uOrigin: { value: new THREE.Vector3() }, uScale: { value: 1 }, uDpr: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute float aSpd; attribute float aSize;
        uniform float uP; uniform vec3 uOrigin; uniform float uScale; uniform float uDpr;
        varying float vA;
        void main(){
          float e = 1.0 - pow(1.0 - uP, 3.0);
          vec3 w = uOrigin + aDir * aSpd * uScale * e;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uDpr * (1.0 - uP * 0.5);
          vA = (1.0 - uP) * smoothstep(0.0, 0.05, uP);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 4.0) * vA;
          gl_FragColor = vec4(vec3(0.45, 0.72, 1.0) * a * 1.6, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(origin: THREE.Vector3, scale: number, dpr: number) {
    this.points.visible = this.progress < 1;
    const u = this.mat.uniforms;
    u.uP.value = this.progress;
    u.uOrigin.value.copy(origin);
    u.uScale.value = scale;
    u.uDpr.value = dpr;
  }
}
