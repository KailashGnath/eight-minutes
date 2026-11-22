import * as THREE from 'three';
import { u } from '../core/Scale';

export interface RulerMark {
  x: number;
  y: number;
  km: number;
}

const MAX = 180;
const STEPS_KM = [1e5, 1e6, 1e7, 1e8];
const INK = new THREE.Color('#f2eee6');
const GOLD = new THREE.Color('#ffc46e');

/**
 * A distance ruler running under the beam: a tick every 100,000 km, a taller
 * one every million, measured from the Sun's surface. Ticks the photon has
 * passed turn gold. Sizes are in screen pixels so it reads the same at any zoom.
 */
export class Ruler {
  readonly group = new THREE.Group();
  private ticks: THREE.InstancedMesh;
  private base: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  readonly marks: RulerMark[] = [];

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
    this.ticks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
    this.ticks.frustumCulled = false;
    this.ticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ticks.setColorAt(0, INK);
    this.base = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false }),
    );
    this.base.frustumCulled = false;
    this.group.add(this.ticks, this.base);
  }

  update(o: { startX: number; endX: number; cx: number; extent: number; unitsPerPx: number; offsetPx: number; photonX: number; opacity: number }) {
    const s = o.unitsPerPx;
    const lo = Math.max(o.startX, o.cx - o.extent * 0.62);
    const hi = Math.min(o.endX, o.cx + o.extent * 0.62);
    const y = -o.offsetPx * s;
    this.marks.length = 0;
    this.group.visible = o.opacity > 0.01 && hi > lo;
    if (!this.group.visible) return;

    const range = hi - lo;
    let step = STEPS_KM[STEPS_KM.length - 1];
    for (const k of STEPS_KM) {
      if (range / u(k) <= 70) {
        step = k;
        break;
      }
    }
    const stepU = u(step);
    const first = Math.ceil((lo - o.startX) / stepU);
    const last = Math.floor((hi - o.startX) / stepU);
    let n = 0;
    for (let i = Math.max(first, 0); i <= last && n < MAX; i++) {
      const x = o.startX + i * stepU;
      const major = i % 10 === 0;
      const h = (major ? 16 : 7) * s;
      this.dummy.position.set(x, y - h / 2, 0);
      this.dummy.scale.set(1.0 * s, h, 1);
      this.dummy.updateMatrix();
      this.ticks.setMatrixAt(n, this.dummy.matrix);
      // Fade toward the edges of the view so ticks never pop.
      const edge = 1 - Math.min(1, Math.abs(x - o.cx) / (o.extent * 0.58));
      const fade = Math.min(1, edge * 3) * o.opacity;
      const passed = x <= o.photonX;
      this.col.copy(passed ? GOLD : INK).multiplyScalar((major ? 0.55 : 0.26) * fade * (passed ? 1 : 0.85));
      this.ticks.setColorAt(n, this.col);
      if (major && i > 0) this.marks.push({ x, y: y - h - 6 * s, km: i * step });
      n++;
    }
    this.ticks.count = n;
    this.ticks.instanceMatrix.needsUpdate = true;
    if (this.ticks.instanceColor) this.ticks.instanceColor.needsUpdate = true;

    this.base.position.set((lo + hi) / 2, y, 0);
    this.base.scale.set(hi - lo, 1 * s, 1);
    (this.base.material as THREE.MeshBasicMaterial).opacity = 0.09 * o.opacity;
  }
}
