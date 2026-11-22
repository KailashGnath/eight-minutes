import * as THREE from 'three';
import gsap from 'gsap';

export interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

export type Shot = () => Pose;

export interface View {
  w: number;
  h: number;
  portrait: boolean;
  fov: number;
}

/** Screen-space framing helpers shared by every shot. */
export class Framing {
  constructor(public view: View) {}

  /** Camera distance that gives `ppu` screen pixels per world unit at the beam plane. */
  distFor(ppu: number) {
    const visH = this.view.h / ppu;
    return visH / (2 * Math.tan(THREE.MathUtils.degToRad(this.view.fov / 2)));
  }

  /** World units visible along the beam's screen axis. */
  along(ppu: number) {
    return (this.view.portrait ? this.view.h : this.view.w) / ppu;
  }

  across(ppu: number) {
    return (this.view.portrait ? this.view.w : this.view.h) / ppu;
  }

  get up() {
    return this.view.portrait ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 1, 0);
  }

  /**
   * A pose looking at (cx, cy) on the beam plane from the side, slightly
   * lifted for a touch of perspective.
   */
  pose(cx: number, ppu: number, lift = 0, cy = 0, z = 0): Pose {
    const dist = this.distFor(ppu);
    const target = new THREE.Vector3(cx, cy, z);
    const pos = target.clone().addScaledVector(new THREE.Vector3(0, 1, 0), dist * lift).add(new THREE.Vector3(0, 0, dist * Math.sqrt(1 - lift * lift)));
    return { pos, target, up: this.up };
  }
}

/**
 * Blends between shots. Shots are functions, so a moving subject (the
 * photon) stays framed while the camera travels between setups.
 */
export class CameraDirector {
  private shot: Shot;
  private from: Pose | null = null;
  private last: Pose | null = null;
  private mix = 1;
  private tween: gsap.core.Tween | null = null;
  private tmp = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };

  constructor(initial: Shot) {
    this.shot = initial;
  }

  cut(shot: Shot) {
    this.tween?.kill();
    this.shot = shot;
    this.from = null;
    this.mix = 1;
  }

  to(shot: Shot, duration: number, ease = 'power3.inOut') {
    this.tween?.kill();
    if (duration <= 0 || !this.last) return this.cut(shot);
    this.from = {
      pos: this.last.pos.clone(),
      target: this.last.target.clone(),
      up: this.last.up.clone(),
    };
    this.shot = shot;
    this.mix = 0;
    this.tween = gsap.to(this, { mix: 1, duration, ease });
  }

  /** Where the camera is looking, from the last update. */
  get target() {
    return this.last?.target ?? null;
  }

  get moving() {
    return this.mix < 1;
  }

  update(camera: THREE.PerspectiveCamera) {
    const b = this.shot();
    const t = this.tmp;
    if (this.from && this.mix < 1) {
      const k = this.mix;
      t.pos.lerpVectors(this.from.pos, b.pos, k);
      t.target.lerpVectors(this.from.target, b.target, k);
      t.up.lerpVectors(this.from.up, b.up, k).normalize();
    } else {
      t.pos.copy(b.pos);
      t.target.copy(b.target);
      t.up.copy(b.up);
    }
    camera.position.copy(t.pos);
    camera.up.copy(t.up);
    camera.lookAt(t.target);
    const dist = t.pos.distanceTo(t.target);
    camera.near = Math.max(0.05, dist * 0.02);
    camera.far = dist * 40 + 200000;
    camera.updateProjectionMatrix();
    this.last = { pos: t.pos.clone(), target: t.target.clone(), up: t.up.clone() };
    return dist;
  }
}
