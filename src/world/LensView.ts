import * as THREE from 'three';
import { LENS_LAYER, type Body } from './Planets';

/**
 * The telescope inset. Planets are only a couple of pixels wide at true scale,
 * so when the photon passes one we render a magnified close-up into a texture
 * and draw it, masked to a circle, where the HUD's lens frame sits.
 */
export class LensView {
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.01, 2000);
  private target: THREE.WebGLRenderTarget;
  private hudScene = new THREE.Scene();
  private hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private quad: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private dir = new THREE.Vector3(-0.62, 0.26, 1).normalize();
  rect: { x: number; y: number; size: number } | null = null;
  opacity = 0;
  body: Body | null = null;

  constructor(res: number) {
    this.target = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType });
    this.camera.layers.set(LENS_LAYER);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 112, 128, 128, 128);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const alpha = new THREE.CanvasTexture(c);
    this.mat = new THREE.MeshBasicMaterial({ map: this.target.texture, alphaMap: alpha, transparent: true, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.hudScene.add(this.quad);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number, time: number) {
    if (!this.body || !this.rect || this.opacity < 0.01) return;
    const b = this.body;
    const p = b.mesh.position;
    // A slow drift so the close-up feels alive, like a tracking telescope.
    const d = this.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(time * 0.15) * 0.15);
    this.camera.position.copy(p).addScaledVector(d, b.radius * 5.4);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(p);
    this.camera.near = b.radius * 0.5;
    this.camera.far = b.radius * 20;
    this.camera.updateProjectionMatrix();

    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x020306, 1);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);

    this.hudCam.left = 0;
    this.hudCam.right = w;
    this.hudCam.top = h;
    this.hudCam.bottom = 0;
    this.hudCam.updateProjectionMatrix();
    const r = this.rect;
    this.quad.position.set(r.x + r.size / 2, h - (r.y + r.size / 2), 0);
    this.quad.scale.set(r.size, r.size, 1);
    this.mat.opacity = this.opacity;

    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.hudScene, this.hudCam);
    renderer.autoClear = auto;
  }
}
