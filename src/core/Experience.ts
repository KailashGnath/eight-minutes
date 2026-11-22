import * as THREE from 'three';
import { Post } from '../post/Post';
import { FpsGovernor, type QualitySettings, type Tier } from './Quality';
import { Stars } from '../world/Stars';
import { Dust } from '../world/Dust';
import { Ruler } from '../world/Ruler';
import { Photon } from '../world/Photon';
import { Sun } from '../world/Sun';
import { Planets, Scatter } from '../world/Planets';
import { CoreWalk } from '../world/CoreWalk';
import { LensView } from '../world/LensView';
import { SUN_R, u, type Trip } from './Scale';
import type { View } from './CameraDirector';

const DOWNGRADE: Record<Tier, Tier | null> = { high: 'medium', medium: 'low', phone: 'low', low: null };

/** Renderer, scenes and every world object, plus resize and the frame render. */
export class Experience {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: Post;
  readonly stars: Stars;
  readonly dust: Dust;
  readonly ruler: Ruler;
  readonly photon: Photon;
  readonly sun: Sun;
  readonly planets: Planets;
  readonly scatter: Scatter;
  readonly core: CoreWalk;
  readonly lens: LensView;
  readonly governor: FpsGovernor;
  readonly view: View;
  dpr = 1;
  mode: 'space' | 'core' = 'space';

  constructor(
    canvas: HTMLCanvasElement,
    public quality: QualitySettings,
    trip: Trip,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x05060a, 1);

    this.view = { w: innerWidth, h: innerHeight, portrait: false, fov: 34 };
    this.camera = new THREE.PerspectiveCamera(this.view.fov, 1, 1, 300000);

    this.stars = new Stars(quality.stars);
    this.dust = new Dust(quality.dust);
    this.ruler = new Ruler();
    this.photon = new Photon();
    this.sun = new Sun(u(SUN_R), quality.sunDetail);
    this.planets = new Planets(trip);
    this.scatter = new Scatter();
    this.scene.add(this.stars.nebula, this.stars.mesh, this.sun.group, this.planets.group, this.ruler.group, this.dust.mesh, this.photon.group, this.scatter.points);

    this.core = new CoreWalk();
    this.lens = new LensView(quality.lensRes);
    this.post = new Post(this.renderer, this.scene, this.camera, quality);

    this.governor = new FpsGovernor(() => this.downgrade());
    this.resize();
  }

  private downgrade(): boolean {
    const next = DOWNGRADE[this.quality.tier];
    // Bloom is the look; the lowest tier keeps it and just renders fewer pixels.
    if (!next) return false;
    this.quality.tier = next;
    this.quality.maxDpr = Math.max(1, this.quality.maxDpr - 0.25);
    this.post.finish.uniforms.uCA.value = 0;
    this.resize();
    return true;
  }

  resize() {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    this.view.w = w;
    this.view.h = h;
    this.view.portrait = h > w * 1.08;
    this.dpr = Math.min(devicePixelRatio || 1, this.quality.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.core.resize(w, h, this.dpr);
  }

  render(time: number) {
    if (this.mode === 'core') this.post.use(this.core.scene, this.core.camera);
    else this.post.use(this.scene, this.camera);
    this.post.render(time);
    if (this.mode === 'space') this.lens.render(this.renderer, this.scene, this.view.w, this.view.h, time);
  }

  /** Compile every shader up front so the launch never hitches. */
  warm() {
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.core.scene, this.core.camera);
  }
}
