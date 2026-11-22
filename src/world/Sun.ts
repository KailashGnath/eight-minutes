import * as THREE from 'three';
import noise from './shaders/noise.glsl?raw';

/**
 * The Sun at true size (≈ 300 units radius): a boiling photosphere with
 * granulation, sunspots and limb darkening; a streamered corona with
 * prominences curling off the limb; and a wide, faint glare that lingers at
 * the edge of the screen long after the Sun itself has left it.
 */
export class Sun {
  readonly group = new THREE.Group();
  readonly sphere: THREE.Mesh;
  readonly radius: number;
  private sphereMat: THREE.ShaderMaterial;
  private coronaMat: THREE.ShaderMaterial;
  private glareMat: THREE.ShaderMaterial;
  private corona: THREE.Mesh;
  private glare: THREE.Mesh;
  hot = 0;
  readonly hotDir = new THREE.Vector3(1, 0, 0);

  constructor(radius: number, detail: number) {
    this.radius = radius;
    this.sphereMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHot: { value: 0 },
        uHotDir: { value: this.hotDir },
        uDetail: { value: detail },
      },
      vertexShader: /* glsl */ `
        varying vec3 vObjN; varying vec3 vViewN; varying vec3 vViewPos;
        void main(){
          vObjN = normal;
          vViewN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${noise}
        uniform float uTime; uniform float uHot; uniform vec3 uHotDir; uniform float uDetail;
        varying vec3 vObjN; varying vec3 vViewN; varying vec3 vViewPos;
        void main(){
          vec3 n = normalize(vObjN);
          float t = uTime;
          vec3 v = normalize(-vViewPos);
          float mu = clamp(dot(normalize(vViewN), v), 0.0, 1.0);

          // Granulation: soft mottling at two scales, drifting at different rates.
          float g1 = snoise(n * 26.0 + vec3(0.0, 0.0, t * 0.04));
          float g2 = snoise(n * 72.0 + vec3(t * 0.07, 0.0, 0.0));
          float g3 = uDetail > 0.6 ? snoise(n * 190.0 + vec3(0.0, t * 0.12, 0.0)) : 0.0;
          float gran = 0.56 + 0.13 * g1 + 0.1 * (0.5 - abs(g2)) + 0.05 * g3;

          // A few small sunspots inside active regions; faculae brighten near the limb.
          float act = snoise(n * 3.0 + vec3(t * 0.006));
          float spotN = snoise(n * 9.0 + vec3(11.0, 3.0, t * 0.002)) * smoothstep(0.35, 0.8, act);
          float umbra = smoothstep(0.42, 0.47, spotN);
          float penumbra = smoothstep(0.32, 0.42, spotN);
          float faculae = smoothstep(0.2, 0.8, act) * (1.0 - penumbra) * 0.14 * (1.0 - mu);
          float heat = clamp(gran + faculae - penumbra * 0.3 - umbra * 0.36, 0.0, 1.2);

          float limb = 0.32 + 0.68 * pow(mu, 0.5);
          vec3 cool = vec3(0.8, 0.17, 0.02);
          vec3 warm = vec3(1.0, 0.44, 0.07);
          vec3 hot = vec3(1.0, 0.73, 0.36);
          vec3 col = mix(cool, warm, smoothstep(0.2, 0.52, heat));
          col = mix(col, hot, smoothstep(0.52, 0.85, heat));
          col *= (0.72 + 0.95 * heat) * limb;
          col = mix(col * vec3(1.0, 0.5, 0.28), col, smoothstep(0.0, 0.5, mu));

          float d = 1.0 - dot(n, normalize(uHotDir));
          col += vec3(1.0, 0.96, 0.88) * uHot * (exp(-d * 5000.0) * 14.0 + exp(-d * 700.0) * 2.6 + exp(-d * 90.0) * 0.5);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 160, 120), this.sphereMat);

    this.coronaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${noise}
        uniform float uTime; uniform float uIntensity;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 5.0; // in solar radii
          float r = length(p);
          if (r < 0.97) discard;
          float ang = atan(p.y, p.x);
          vec2 cs = vec2(cos(ang), sin(ang));
          float fall = exp(-(r - 1.0) * 3.0);
          float streams = 0.55 + 0.45 * snoise(vec3(cs * 2.2, r * 0.7 - uTime * 0.035));
          float fine = 0.72 + 0.28 * snoise(vec3(cs * 13.0, r * 1.8 - uTime * 0.08));
          float corona = fall * streams * fine * smoothstep(0.98, 1.03, r);
          float band = smoothstep(0.995, 1.015, r) * (1.0 - smoothstep(1.02, 1.17, r));
          float ridge = 1.0 - abs(snoise(vec3(cs * 4.5, (r - 1.0) * 5.0 - uTime * 0.05)));
          float gate = smoothstep(0.25, 0.65, snoise(vec3(cs * 1.7, uTime * 0.01)));
          float prom = pow(ridge, 14.0) * gate * band;
          float rim = exp(-pow((r - 1.0) / 0.012, 2.0));
          vec3 col = vec3(1.0, 0.7, 0.4) * corona * 1.25
                   + vec3(1.0, 0.32, 0.1) * prom * 2.6
                   + vec3(1.0, 0.45, 0.2) * rim * 1.3;
          col *= uIntensity * smoothstep(2.5, 1.6, r);
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.coronaMat);
    this.corona.scale.setScalar(radius * 5);
    this.corona.frustumCulled = false;

    this.glareMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 80.0; // solar radii
          float g = exp(-(r - 1.0) * 0.55) * 0.07 + exp(-(r - 1.0) * 0.08) * 0.018;
          g *= smoothstep(40.0, 25.0, r);
          gl_FragColor = vec4(vec3(1.0, 0.58, 0.28) * g * uIntensity, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glareMat);
    this.glare.scale.setScalar(radius * 80);
    this.glare.frustumCulled = false;
    this.glare.renderOrder = -5;

    this.group.add(this.glare, this.sphere, this.corona);
  }

  update(time: number, camera: THREE.Camera) {
    this.sphereMat.uniforms.uTime.value = time;
    this.sphereMat.uniforms.uHot.value = this.hot;
    this.coronaMat.uniforms.uTime.value = time;
    this.corona.quaternion.copy(camera.quaternion);
    this.glare.quaternion.copy(camera.quaternion);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }
}
