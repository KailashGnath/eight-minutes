import * as THREE from 'three';
import { el } from './dom';

export class WorldLabel {
  readonly pos = new THREE.Vector3();
  opacity = 0;
  private shown = -1;
  private x = -1;
  private y = -1;
  constructor(readonly el: HTMLElement) {}

  place(x: number, y: number, opacity: number) {
    const o = Math.round(opacity * 100) / 100;
    if (o !== this.shown) {
      this.el.style.opacity = String(o);
      this.shown = o;
    }
    if (o <= 0) return;
    if (Math.abs(x - this.x) > 0.25 || Math.abs(y - this.y) > 0.25) {
      this.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      this.x = x;
      this.y = y;
    }
  }
}

/**
 * HTML labels pinned to points in the 3D world: crisp text that matches the
 * UI typography and stays upright when the world is rotated for portrait.
 */
export class Labels {
  private v = new THREE.Vector3();
  private rulerPool: WorldLabel[] = [];

  constructor(private root: HTMLElement) {}

  body(name: string, sub: string, cls = ''): WorldLabel {
    const e = el('div', `wl wl-body ${cls}`, `<span class="ring"></span><span class="name">${name}<small>${sub}</small></span>`);
    this.root.appendChild(e);
    return new WorldLabel(e);
  }

  /** Project to CSS pixels. Returns null when behind the camera. */
  project(p: THREE.Vector3, camera: THREE.Camera, w: number, h: number) {
    this.v.copy(p).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return null;
    return { x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h };
  }

  rulers(marks: { x: number; y: number; text: string }[], camera: THREE.Camera, w: number, h: number, opacity: number) {
    while (this.rulerPool.length < marks.length) {
      const e = el('div', 'wl wl-ruler', '<span></span>');
      this.root.appendChild(e);
      this.rulerPool.push(new WorldLabel(e));
    }
    this.rulerPool.forEach((l, i) => {
      const m = marks[i];
      if (!m) return l.place(0, 0, 0);
      const s = this.project(this.v.set(m.x, m.y, 0), camera, w, h);
      if (!s) return l.place(0, 0, 0);
      const span = l.el.firstElementChild as HTMLElement;
      if (span.textContent !== m.text) span.textContent = m.text;
      const edge = Math.min(s.x, w - s.x, s.y, h - s.y);
      l.place(s.x, s.y, opacity * Math.max(0, Math.min(1, (edge - 30) / 80)));
    });
  }
}
