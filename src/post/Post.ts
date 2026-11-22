// Adapted from kailash-lab/src/post/Post.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import finishFrag from './finish.frag?raw';
import type { QualitySettings } from '../core/Quality';

export class Post {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloom: UnrealBloomPass;
  readonly finish: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, q: QualitySettings) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.62, 0.55, 0.86);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);

    this.finish = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uCA: { value: q.chromatic ? 0.01 : 0 },
        uGrain: { value: 0.035 },
        uVignette: { value: 0.9 },
        uFlash: { value: 0 },
        uStreak: { value: 0 },
        uStreakDir: { value: new THREE.Vector2(1, 0) },
        uStreakOrigin: { value: new THREE.Vector2(0.35, 0.5) },
        uAspect: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: finishFrag,
    });
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
  }

  use(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  render(time: number) {
    this.finish.uniforms.uTime.value = time;
    this.composer.render();
  }
}
