import '@fontsource/geist-sans/200.css';
import '@fontsource/geist-sans/300.css';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/hud.css';
import './styles/mobile.css';

import * as THREE from 'three';
import gsap from 'gsap';
import { Clock } from './core/Clock';
import { CameraDirector, Framing, type Pose } from './core/CameraDirector';
import { Experience } from './core/Experience';
import { getQuality, supportsWebGL } from './core/Quality';
import { C, KM_PER_UNIT, kmAt, makeTrip, type Trip } from './core/Scale';
import { distShort, distWords, duration, int, conv, today } from './core/format';
import { buildMilestones, type Milestone } from './content/milestones';
import { $, show, store } from './ui/dom';
import { Hud, RATES } from './ui/Hud';
import { Minimap } from './ui/Minimap';
import { Cards } from './ui/Cards';
import { Race, raceResults } from './ui/Race';
import { Sheets, type Settings } from './ui/Sheets';
import { Labels, type WorldLabel } from './ui/Labels';
import { SpaceAudio } from './ui/Audio';
import type { Body, BodyId } from './world/Planets';

type State = 'loading' | 'landing' | 'prologue' | 'launch' | 'journey' | 'arrival' | 'end';

// This whole experience runs on real time: never let animations stretch after a stall.
gsap.ticker.lagSmoothing(0);

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = THREE.MathUtils.lerp;
const logLerp = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));

const CAPTIONS = [
  { at: 0.8, out: 8.6, html: 'Deep in the Sun’s core, nuclear fusion has just made a <em>photon</em>.' },
  {
    at: 9.4,
    out: 17.8,
    html: 'It can’t fly free. The plasma is so dense that the photon is absorbed and re-emitted, again and again, each time in a random direction.',
  },
  {
    at: 18.6,
    out: 26.6,
    html: 'This stumbling walk to the surface takes <em>tens of thousands of years</em>, maybe more than a hundred thousand.',
  },
  { at: 27.4, out: 31.4, html: 'Then, suddenly: open space.' },
];

class App {
  state: State = 'loading';
  trip: Trip = makeTrip();
  milestones: Milestone[] = [];
  next = 0;
  readonly clock = new Clock();
  readonly settings: Settings;

  xp: Experience | null = null;
  framing: Framing | null = null;
  director: CameraDirector | null = null;

  readonly hud: Hud;
  readonly minimap: Minimap;
  readonly cards = new Cards();
  readonly race = new Race();
  readonly sheets: Sheets;
  readonly labels = new Labels($('labels'));
  readonly audio = new SpaceAudio();
  private bodyLabels: Partial<Record<BodyId | 'sun', WorldLabel>> = {};

  // Journey state
  private release = new THREE.Vector3();
  private photonPos = new THREE.Vector3();
  private zoom = 0;
  zoomTarget = 0;
  private finalLock = false;
  private slowmo = false;
  private arrived = false;
  private lensId: 'mercury' | 'venus' | null = null;
  private lensOpacity = 0;
  private warpLabel = '';

  // Frame bookkeeping
  private last = performance.now();
  private elapsed = 0;
  private starOffset = 0;
  private prevTargetX = 0;
  private camVel = 0;
  private dustOpacity = 0;
  private flash = 0;
  private captionEls: HTMLElement[] = [];
  private prologueCaption = -1;

  constructor() {
    const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.settings = {
      units: store.get('units', 'km'),
      sound: false,
      labels: store.get('labels', true),
      reduceMotion: store.get('reduceMotion', prefersReduced),
    };

    this.hud = new Hud({
      onRate: (r) => this.setRate(r),
      onPause: () => this.togglePause(),
      onWarpPill: () => this.setRate(1),
      onBack: () => (this.zoomTarget = 0),
    });
    this.minimap = new Minimap((m) => this.warpTo(m));
    this.sheets = new Sheets(
      this.settings,
      (s, key) => this.onSettings(s, key),
      () => this.cards.log,
      () => this.hud.wake(),
    );

    this.applySettings();
    this.bindUi();
    this.boot();
  }

  // ---------------------------------------------------------------- boot

  private async boot() {
    const fill = $('loader-fill');
    show($('loader'), true);
    const t0 = performance.now();
    requestAnimationFrame(() => (fill.style.transform = 'scaleX(0.25)'));

    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    fill.style.transform = 'scaleX(0.55)';
    await new Promise((r) => setTimeout(r, 60));

    if (supportsWebGL()) {
      try {
        this.xp = new Experience($('gl') as HTMLCanvasElement, getQuality(), this.trip);
        this.framing = new Framing(this.xp.view);
        this.director = new CameraDirector(() => this.heroShot());
        this.buildBodyLabels();
        this.xp.planets.place(this.trip);
        this.syncOrientation();
        this.director.update(this.xp.camera);
        this.xp.warm();
      } catch (e) {
        console.warn('WebGL failed, using the fallback scene', e);
        this.xp = null;
      }
    }
    if (!this.xp) document.body.classList.add('no-gl');
    fill.style.transform = 'scaleX(1)';

    addEventListener('resize', () => this.onResize());
    this.onResize();
    const wait = Math.max(0, 1300 - (performance.now() - t0));
    setTimeout(() => {
      this.toLanding();
      requestAnimationFrame((t) => this.frame(t));
    }, wait);
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop = (now: number) => {
    // Render while loading so shaders and the hero are ready behind the loader.
    if (this.state === 'loading' && this.xp) {
      this.xp.sun.update(now / 1000, this.xp.camera);
      this.xp.render(now / 1000);
      requestAnimationFrame(this.loop);
    }
  };

  // ---------------------------------------------------------------- UI wiring

  private bindUi() {
    $('btn-track').addEventListener('click', () => this.launch());
    $('btn-core').addEventListener('click', () => this.prologue());
    $('btn-skip').addEventListener('click', () => this.endPrologue());
    $('btn-again').addEventListener('click', () => this.rideAgain());
    $('btn-end-core').addEventListener('click', () => this.prologue());
    $('btn-share').addEventListener('click', () => this.share());
    $('btn-next').addEventListener('click', () => this.nextMilestone());
    $('btn-sound').addEventListener('click', () => this.setSound(!this.settings.sound));
    $('btn-sound-landing').addEventListener('click', () => this.setSound(!this.settings.sound));

    addEventListener('keydown', (e) => this.onKey(e));

    // Zoom out to see the whole scale: wheel and pinch.
    addEventListener(
      'wheel',
      (e) => {
        if (this.state !== 'journey' || this.sheets.isOpen) return;
        if ((e.target as HTMLElement).closest('.race, .sheet')) return;
        e.preventDefault();
        this.zoomTarget = clamp01(this.zoomTarget + e.deltaY * 0.0016);
      },
      { passive: false },
    );
    const canvas = $('gl');
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let zoom0 = 0;
    let tap: { x: number; y: number; t: number; wasIdle: boolean } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tap = pts.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), wasIdle: this.hud.idle } : null;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        zoom0 = this.zoomTarget;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch0 > 0 && this.state === 'journey') {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomTarget = clamp01(zoom0 - Math.log(d / pinch0) * 0.5);
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch0 = 0;
      // A quick tap on the scene toggles the HUD on touch screens.
      if (tap && e.pointerType !== 'mouse' && performance.now() - tap.t < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) {
        if (this.state === 'journey') {
          if (tap.wasIdle) this.hud.wake();
          else this.hud.sleep();
        }
      }
      tap = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.xp?.governor.pause(2500);
    });
  }

  private onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || this.sheets.isOpen) return;
    const k = e.key.toLowerCase();
    if (this.state === 'prologue' && (k === 'escape' || k === 'enter' || k === ' ')) {
      e.preventDefault();
      return this.endPrologue();
    }
    if (k === 'm') return this.setSound(!this.settings.sound);
    if (this.state !== 'journey') return;
    if (k === ' ') {
      e.preventDefault();
      this.togglePause();
    } else if (k === 'arrowright' || k === 'arrowleft') {
      e.preventDefault();
      const i = RATES.indexOf(this.clock.rate);
      const n = RATES[Math.max(0, Math.min(RATES.length - 1, i + (k === 'arrowright' ? 1 : -1)))];
      this.setRate(n);
    } else if (k === 'n') this.nextMilestone();
    else if (k === 'z') this.zoomTarget = this.zoomTarget > 0.5 ? 0 : 1;
    else if (k === 'escape' && this.zoomTarget > 0) this.zoomTarget = 0;
  }

  // ---------------------------------------------------------------- settings

  private onSettings(s: Settings, key: keyof Settings) {
    if (key === 'sound') return this.setSound(s.sound);
    store.set(key, s[key]);
    this.applySettings();
    if (key === 'units') {
      // Rebuild copy in the new units; keep what has already been passed.
      this.milestones = buildMilestones(this.trip, s.units);
      this.setTodayText();
    }
  }

  private applySettings() {
    const b = document.body.classList;
    b.toggle('reduce-motion', this.settings.reduceMotion);
    b.toggle('labels-off', !this.settings.labels);
  }

  private setSound(on: boolean) {
    this.settings.sound = on;
    this.audio.set(on);
    for (const id of ['btn-sound', 'btn-sound-landing']) $(id).setAttribute('aria-pressed', String(on));
    const label = $('btn-sound-landing').querySelector('span');
    if (label) label.textContent = on ? 'Sound on' : 'Sound off';
    this.sheets.sync(this.settings);
  }

  // ---------------------------------------------------------------- state

  private setState(s: State) {
    this.state = s;
    const b = document.body;
    b.className = b.className.replace(/\bstate-\w+/g, '').trim();
    b.classList.add(`state-${s}`);
    show($('loader'), s === 'loading');
    show($('landing'), s === 'landing');
    show($('end'), s === 'end');
    $('hud').toggleAttribute('inert', s !== 'journey');
    if (s !== 'journey') {
      this.hud.wake();
      this.race.toggle(false);
      this.minimap.hideTip();
    }
  }

  private setTodayText() {
    $('today-time').textContent = duration(this.trip.seconds);
    $('today-dist').textContent = `${distWords(this.trip.earthSunKm, this.settings.units)} away`;
  }

  private toLanding() {
    this.setState('landing');
    this.setTodayText();
    this.director?.cut(() => this.heroShot());
    if (this.xp) {
      this.xp.photon.intensity = 0;
      this.xp.sun.hot = 0;
    }
  }

  private resetJourney() {
    this.trip = makeTrip();
    this.milestones = buildMilestones(this.trip, this.settings.units);
    this.next = 0;
    this.clock.stop();
    this.clock.t = 0;
    this.clock.rate = 1;
    this.clock.paused = false;
    this.clock.override = null;
    this.clock.end = this.trip.seconds;
    this.zoom = this.zoomTarget = 0;
    this.finalLock = false;
    this.slowmo = false;
    this.arrived = false;
    this.lensId = null;
    this.cards.clear();
    this.minimap.build(this.trip, this.milestones);
    this.hud.rate(1, false);
    this.hud.pill(null);
    this.audio.reset();
    if (this.xp) {
      const R = this.xp.sun.radius;
      this.release.set(0.94, 0, 0.34).normalize().multiplyScalar(R);
      this.xp.sun.hotDir.copy(this.release).normalize();
      this.photonPos.copy(this.release);
      this.xp.planets.place(this.trip);
      this.xp.planets.atmoPulse = 0;
      this.xp.photon.intensity = 0;
      this.xp.photon.shockProgress = 1;
      this.xp.scatter.progress = 1;
    }
  }

  // ---------------------------------------------------------------- shots

  private heroShot = (): Pose => {
    const f = this.framing!;
    const v = f.view;
    const R = this.xp!.sun.radius;
    const sway = this.settings.reduceMotion ? 0 : Math.sin(this.elapsed * 0.09) * 0.02;
    if (v.portrait) {
      const ppu = (0.6 * v.w) / R;
      const p = f.pose((0.5 - 0.16) * f.along(ppu), ppu, 0.05 + sway, Math.sin(this.elapsed * 0.07) * 6);
      return p;
    }
    const ppu = (0.44 * v.h) / R;
    return f.pose((0.5 - 0.15) * f.along(ppu), ppu, 0.06 + sway, Math.sin(this.elapsed * 0.07) * 8);
  };

  private diveShot = (): Pose => {
    const f = this.framing!;
    const v = f.view;
    const ppu = (v.portrait ? v.h : v.w) / 150;
    const dist = f.distFor(ppu);
    const target = this.release.clone().add(new THREE.Vector3(16, 0, 0));
    const dir = new THREE.Vector3(0.12, 0.4, 1).normalize();
    const pos = target.clone().addScaledVector(dir, dist);
    return { pos, target, up: f.up };
  };

  private followShot = (): Pose => {
    const f = this.framing!;
    const v = f.view;
    const t = this.trip;
    const R = this.xp!.sun.radius;
    const ppuF = 1;
    const cxF = this.photonPos.x + f.along(ppuF) * 0.15;

    // Zoomed out: the whole Sun–Earth line on screen.
    const ez = ease(this.zoom);
    const ppuO = (v.portrait ? v.h : v.w) / ((t.endX + R) * 1.24);
    const cxO = (t.endX - R) / 2;
    let ppu = logLerp(ppuF, ppuO, ez);
    let cx = lerp(cxF, cxO, ez);

    // Arrival: push in on Earth.
    const a = this.arrivalMix();
    if (a > 0) {
      const earthR = this.xp!.planets.bodies.earth.radius;
      const ppuA = (Math.min(v.w, v.h) * (v.portrait ? 0.16 : 0.13)) / earthR;
      const cxA = t.earthX - f.along(ppuA) * 0.13;
      ppu = logLerp(ppu, ppuA, a);
      cx = lerp(cx, cxA, a);
    }
    const lift = 0.1 * (1 - ez) * (1 - a) + 0.04 * a;
    return f.pose(cx, ppu, lift);
  };

  private endShot = (): Pose => {
    const f = this.framing!;
    const v = f.view;
    const earth = this.xp!.planets.bodies.earth;
    // Keep Earth clear of the text column: smaller and further right on narrower screens.
    const narrow = !v.portrait && v.w / v.h < 1.5;
    const ppu = (v.portrait ? v.w * 0.26 : v.h * (narrow ? 0.2 : 0.25)) / earth.radius;
    const dist = f.distFor(ppu);
    const a = this.elapsed * 0.04;
    const dir = new THREE.Vector3(-0.42 + Math.sin(a) * 0.12, 0.14, 1).normalize();
    const target = earth.mesh.position.clone();
    if (v.portrait) target.y -= (v.h / ppu) * 0.31;
    else target.x -= (v.w / ppu) * (narrow ? 0.25 : 0.2);
    const pos = target.clone().addScaledVector(dir, dist);
    return { pos, target, up: new THREE.Vector3(0, 1, 0) };
  };

  private arrivalMix() {
    const T = this.trip.seconds;
    return ease(clamp01((this.clock.t - (T - 5.6)) / 5.25));
  }

  // ---------------------------------------------------------------- flow

  launch(fromPrologue = false) {
    this.resetJourney();
    this.setState('launch');
    const xp = this.xp;
    if (!xp || !this.director) {
      this.releasePhoton();
      return;
    }
    if (this.settings.reduceMotion) {
      this.veil(true);
      setTimeout(() => {
        this.releasePhoton();
        this.director!.cut(this.followShot);
        this.veil(false);
      }, 420);
      return;
    }
    if (fromPrologue) {
      this.director.cut(this.diveShot);
      xp.sun.hot = 0.9;
      gsap.delayedCall(0.7, () => this.releasePhoton());
    } else {
      this.director.to(this.diveShot, 2.0, 'power3.inOut');
      gsap.fromTo(xp.sun, { hot: 0 }, { hot: 1, duration: 1.9, ease: 'power2.in' });
      gsap.delayedCall(2.05, () => this.releasePhoton());
    }
  }

  private releasePhoton() {
    this.clock.start();
    this.clock.end = this.trip.seconds;
    this.audio.whoosh();
    const xp = this.xp;
    if (!xp || !this.director) {
      this.setState('journey');
      return;
    }
    gsap.to(xp.photon, { intensity: 1, duration: 0.18, ease: 'power2.out' });
    xp.photon.shockProgress = 0;
    gsap.to(xp.photon, { shockProgress: 1, duration: 1.6, ease: 'power2.out' });
    gsap.to(xp.sun, { hot: 0.15, duration: 2.4, ease: 'power2.out' });
    if (!this.settings.reduceMotion) {
      this.flash = 0.42;
      gsap.to(this, { flash: 0, duration: 1.1, ease: 'power2.out' });
      this.director.to(this.followShot, 2.8, 'expo.inOut');
      gsap.delayedCall(1.5, () => this.enterJourney());
    } else {
      this.enterJourney();
    }
  }

  private enterJourney() {
    if (this.state !== 'launch') return;
    this.setState('journey');
    this.hud.measure();
    this.hud.placeThumb();
  }

  prologue() {
    if (!this.xp) return this.launch();
    this.resetJourney();
    this.veil(true);
    setTimeout(() => {
      this.setState('prologue');
      this.xp!.mode = 'core';
      this.xp!.core.reset(this.xp!.view.portrait);
      this.prologueCaption = -1;
      this.clearCaptions();
      this.veil(false);
    }, 420);
  }

  private endPrologue() {
    if (this.state !== 'prologue' || !this.xp) return;
    this.state = 'launch';
    this.clearCaptions();
    const veil = $('veil');
    veil.classList.add('white');
    this.veil(true, this.settings.reduceMotion ? 300 : 160);
    setTimeout(() => {
      this.xp!.mode = 'space';
      this.launch(true);
      this.veil(false, 900);
      setTimeout(() => veil.classList.remove('white'), 950);
    }, 260);
  }

  private arrive() {
    if (this.arrived) return;
    this.arrived = true;
    this.setState('arrival');
    this.hud.pill(null);
    this.clock.override = null;
    this.clock.stop();
    this.clock.t = this.trip.seconds;
    this.audio.arrive();
    const xp = this.xp;
    if (xp) {
      gsap.to(xp.photon, { intensity: 0, duration: 0.35, ease: 'power2.in' });
      xp.scatter.progress = 0;
      gsap.to(xp.scatter, { progress: 1, duration: 3.2, ease: 'power1.out' });
      gsap.timeline()
        .to(xp.planets, { atmoPulse: 1, duration: 0.35, ease: 'power2.out' })
        .to(xp.planets, { atmoPulse: 0.12, duration: 3, ease: 'power2.inOut' });
      if (!this.settings.reduceMotion) {
        this.flash = 0.16;
        gsap.to(this, { flash: 0, duration: 0.8 });
      }
    }
    this.caption('Blue light scatters most in our air. <em>That’s why the sky is blue.</em>', 2600);
    setTimeout(() => this.toEnd(), 2900);
  }

  private toEnd() {
    const t = this.trip;
    const units = this.settings.units;
    const m = Math.floor(t.seconds / 60);
    const s = Math.round(t.seconds % 60);
    $('end-kicker').textContent = `Arrived · ${today(t.date)}`;
    $('end-title').innerHTML = `${m}<small>min</small>${s}<small>s</small>`;
    $('end-lede').innerHTML = `That photon just travelled <b>${int(conv(t.km, units))} ${units}</b> to reach Earth, covering ${int(conv(C, units))} ${units} every second.`;
    const list = $('end-racers');
    list.innerHTML = raceResults(t)
      .map((r) => `<li><span>${r.name}</span><span class="num">${r.time}</span></li>`)
      .join('');
    this.setState('end');
    this.director?.to(this.endShot, 4.5, 'power2.inOut');
  }

  private rideAgain() {
    this.veil(true);
    setTimeout(() => {
      this.toLanding();
      this.director?.cut(() => this.heroShot());
      this.veil(false);
      setTimeout(() => this.launch(), 350);
    }, 420);
  }

  private async share() {
    const text = `Light from the Sun takes ${duration(this.trip.seconds)} to reach Earth today. I rode along with a photon.`;
    const data = { title: '8 Minutes', text, url: location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(`${text} ${location.href}`);
      this.hud.toast('Link copied');
      this.caption('Link copied to your clipboard.', 2200);
    } catch {
      /* cancelled */
    }
  }

  // ---------------------------------------------------------------- controls

  setRate(r: number) {
    if (this.state !== 'journey') return;
    if (this.finalLock && r > 1) {
      this.hud.toast('The final approach plays in real time.');
      r = 1;
    }
    this.clock.rate = r;
    this.clock.paused = false;
    this.hud.rate(r, false);
    this.updatePill();
  }

  togglePause() {
    if (this.state !== 'journey') return;
    this.clock.paused = !this.clock.paused;
    this.hud.rate(this.clock.rate, this.clock.paused);
  }

  private updatePill() {
    if (this.slowmo) return this.hud.pill('slowmo', 'Slow motion 0.1×');
    if (this.clock.warping) return this.hud.pill('warp', this.warpLabel);
    if (this.clock.rate > 1) return this.hud.pill('warp', `Time warp ${this.clock.rate}×`);
    this.hud.pill(null);
  }

  private warpTo(m: Milestone) {
    if (this.state !== 'journey') return;
    const T = this.trip.seconds;
    const target = Math.min(m.t, T - 9);
    if (target <= this.clock.t + 0.2) return;
    const now = performance.now();
    const dur = 1100 + Math.min(2200, Math.log10(target - this.clock.t + 1) * 900);
    this.zoomTarget = 0;
    this.clock.paused = false;
    this.hud.rate(this.clock.rate, false);
    this.clock.warpTo(target, now, this.settings.reduceMotion ? 900 : dur);
    this.warpLabel = `Warping to ${m.label}`;
    this.updatePill();
  }

  nextMilestone() {
    const m = this.milestones.find((x) => x.t > this.clock.t + 0.4);
    if (!m || m.t > this.trip.seconds - 9) {
      this.hud.toast('No more stops before Earth. Enjoy the final approach.');
      return;
    }
    this.warpTo(m);
  }

  // ---------------------------------------------------------------- frame

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    let realDt = (now - this.last) / 1000;
    this.last = now;

    // Back from a hidden tab: the photon kept going. Catch up visibly.
    if (realDt > 2.5) {
      if (this.state === 'journey' && this.clock.running && !this.clock.paused) {
        const travelled = this.clock.catchUp(realDt, now);
        if (travelled > 3) this.hud.toast(`While you were away, the photon travelled ${distWords(kmAt(travelled), this.settings.units)}.`, 5000);
      }
      realDt = 1 / 60;
    }
    const dt = Math.min(realDt, 0.1);
    this.elapsed += dt;

    this.clock.tick(realDt, now);
    if (this.state === 'prologue') this.updatePrologue(Math.min(realDt, 0.5));
    if (this.clock.running) this.updateJourney();

    this.cards.tick(now, this.clock.paused || this.state !== 'journey' ? realDt * 1000 : 0);
    this.hud.tickIdle(now, this.state === 'journey' && !this.sheets.isOpen && !this.race.open && !this.clock.paused);
    if (this.state === 'journey' || this.state === 'arrival') {
      this.hud.telemetry(this.clock.t, this.trip, this.settings.units);
      this.minimap.update(this.clock.t, this.trip, this.next - 1);
      this.race.update(this.clock.t, this.settings.units, now);
      this.hud.back(this.zoom > 0.08 && this.state === 'journey');
    }

    if (this.xp && this.director) this.render(dt, realDt, now);
  };

  private updateJourney() {
    const T = this.trip.seconds;
    const t = this.clock.t;
    const xp = this.xp;

    if (xp) {
      const s = clamp01(kmAt(t) / this.trip.km);
      this.photonPos.set(lerp(this.release.x, this.trip.endX, s), 0, lerp(this.release.z, 0, s));
    }

    if (this.state === 'journey') {
      // Fire milestones; ones skipped by a warp go straight to the log.
      while (this.next < this.milestones.length && this.milestones[this.next].t <= t) {
        const m = this.milestones[this.next++];
        const target = this.clock.warpTarget;
        const quiet = target !== null && m.t < target - 0.05;
        this.cards.push(m, quiet);
        if (!quiet) {
          this.audio.chime();
          if ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(12);
        }
      }

      if (!this.finalLock && t >= T - 10) {
        this.finalLock = true;
        this.zoomTarget = 0;
        if (this.clock.rate > 1) {
          this.clock.rate = 1;
          this.hud.rate(1, this.clock.paused);
          this.hud.toast('Approaching Earth. Back to real time.');
        }
      }
      if (!this.slowmo && t >= T - 0.3 && !this.settings.reduceMotion) {
        this.slowmo = true;
        this.clock.override = 0.1;
      }
      this.updatePill();
      if (t >= T) this.arrive();
    }
  }

  private updatePrologue(dt: number) {
    const core = this.xp?.core;
    if (!core) return;
    core.update(dt);
    const i = CAPTIONS.findIndex((c) => core.time >= c.at && core.time < c.out);
    if (i !== this.prologueCaption) {
      this.prologueCaption = i;
      this.clearCaptions();
      if (i >= 0) this.caption(CAPTIONS[i].html);
    }
    if (core.done) this.endPrologue();
  }

  private render(dt: number, realDt: number, now: number) {
    const xp = this.xp!;
    const dir = this.director!;
    const time = this.elapsed;
    const v = xp.view;
    const reduce = this.settings.reduceMotion;

    // Smooth zoom
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(this.zoom - this.zoomTarget) < 1e-4) this.zoom = this.zoomTarget;

    xp.photon.position.copy(this.photonPos);
    const dist = dir.update(xp.camera);
    const ppu = v.h / (2 * dist * Math.tan(THREE.MathUtils.degToRad(v.fov / 2)));
    const unitsPerPx = 1 / ppu;
    const target = dir.target ?? new THREE.Vector3();
    const along = (v.portrait ? v.h : v.w) * unitsPerPx;

    // Camera speed along the beam, in screen pixels, drives streaks and star parallax.
    let dx = target.x - this.prevTargetX;
    this.prevTargetX = target.x;
    // A camera cut is not motion.
    if (Math.abs(dx) > along * 0.6) dx = 0;
    const instVel = realDt > 0 ? (dx / realDt) * ppu : 0;
    this.camVel += (instVel - this.camVel) * (1 - Math.exp(-dt * 8));
    this.starOffset += dx * ppu;
    const speedPx = Math.abs(this.camVel);
    const warpAmt = clamp01((Math.log10(Math.max(1, speedPx / 130)) - 0.6) / 2.2);

    const inSpace = xp.mode === 'space';
    xp.stars.update({
      w: v.w,
      h: v.h,
      dpr: xp.dpr,
      offsetPx: this.starOffset,
      portrait: v.portrait,
      streakPx: reduce ? 0 : Math.min(Math.max(0, speedPx - 380) / 60, 900),
      time,
      fade: 1,
    });

    const flying = this.state === 'journey' || this.state === 'arrival' || (this.state === 'launch' && this.clock.running);
    const dustTarget = flying ? (1 - this.zoom * 0.85) * (1 - this.arrivalMix() * 0.6) : 0;
    this.dustOpacity += (dustTarget - this.dustOpacity) * (1 - Math.exp(-dt * 1.5));
    xp.dust.update({
      center: target,
      unitsPerPx,
      extent: along,
      streak: reduce ? 0 : Math.min((Math.max(0, speedPx - 380) / 60) * 1.4, 900) * unitsPerPx,
      opacity: this.dustOpacity,
      camDist: dist,
      time,
    });

    const showRuler = flying && this.settings.labels;
    const rulerOpacity = showRuler ? (1 - this.arrivalMix()) * (1 - this.zoom * 0.4) : 0;
    xp.ruler.update({
      startX: this.trip.startX,
      endX: this.trip.endX,
      cx: target.x,
      extent: along,
      unitsPerPx,
      offsetPx: v.portrait ? 58 : 70,
      photonX: this.photonPos.x,
      opacity: rulerOpacity,
    });
    this.labels.rulers(
      xp.ruler.marks.map((m) => ({ x: m.x, y: m.y, text: distShort(m.km, this.settings.units) })),
      xp.camera,
      v.w,
      v.h,
      rulerOpacity,
    );

    xp.photon.update({
      camera: xp.camera,
      unitsPerPx,
      portrait: v.portrait,
      visualRate: this.clock.running ? Math.max(this.clock.visualRate, speedPx / 130) : 1,
      trailStartX: this.release.x,
      time,
      reduceMotion: reduce,
      shockAt: this.release,
    });
    xp.sun.update(time, xp.camera);
    xp.planets.update(time);
    xp.scatter.update(
      new THREE.Vector3(this.trip.endX, 0, 0),
      xp.planets.bodies.earth.radius * 1.1,
      xp.dpr,
    );

    this.updateLens(dt);
    this.updateBodyLabels(v.w, v.h, along);

    // Post: flash, streak toward the photon's screen position.
    const fin = xp.post.finish.uniforms;
    fin.uFlash.value = reduce ? 0 : Math.min(this.flash, 0.45);
    fin.uStreak.value = reduce || !inSpace ? 0 : warpAmt * 0.9;
    fin.uStreakDir.value.set(v.portrait ? 0 : 1, v.portrait ? -1 : 0);
    const sp = this.photonPos.clone().project(xp.camera);
    fin.uStreakOrigin.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    fin.uAspect.value = v.w / v.h;
    this.audio.warp(warpAmt);

    xp.render(time);
    xp.governor.tick(now);
  }

  private updateLens(dt: number) {
    const xp = this.xp!;
    const lensEl = $('lens');
    let want: 'mercury' | 'venus' | null = null;
    if (this.state === 'journey' && this.zoom < 0.2 && !this.clock.warping && this.clock.visualRate < 30) {
      for (const id of ['mercury', 'venus'] as const) {
        const dx = xp.planets.bodies[id].mesh.position.x - this.photonPos.x;
        if (dx > -170 && dx < 430) want = id;
      }
    }
    if (want && want !== this.lensId) {
      this.lensId = want;
      const b = xp.planets.bodies[want];
      xp.lens.body = b;
      $('lens-name').textContent = b.name;
      $('lens-info').textContent = `${int(conv(b.widthKm, this.settings.units))} ${this.settings.units} wide · just ${(b.widthKm / KM_PER_UNIT).toFixed(1)} px at this scale`;
      lensEl.hidden = false;
      requestAnimationFrame(() => lensEl.classList.add('on'));
    }
    if (!want && this.lensId) {
      this.lensId = null;
      lensEl.classList.remove('on');
    }
    const targetOpacity = want ? 1 : 0;
    this.lensOpacity += (targetOpacity - this.lensOpacity) * (1 - Math.exp(-dt * 4));
    if (!want && this.lensOpacity < 0.02 && !lensEl.hidden) {
      lensEl.hidden = true;
      xp.lens.body = null;
    }
    xp.lens.opacity = this.lensOpacity;
    if (this.lensOpacity > 0.01) {
      const r = lensEl.querySelector('.lens-view')!.getBoundingClientRect();
      xp.lens.rect = { x: r.left + 1, y: r.top + 1, size: r.width - 2 };
    }
  }

  private buildBodyLabels() {
    const xp = this.xp!;
    const px = (b: Body) => (b.widthKm / KM_PER_UNIT).toFixed(1);
    const B = xp.planets.bodies;
    this.bodyLabels = {
      sun: this.labels.body('Sun', '1.39 million km wide', 'sun'),
      mercury: this.labels.body('Mercury', `${int(B.mercury.widthKm)} km · ${px(B.mercury)} px`),
      venus: this.labels.body('Venus', `${int(B.venus.widthKm)} km · ${px(B.venus)} px`),
      earth: this.labels.body('Earth', `${int(B.earth.widthKm)} km · ${px(B.earth)} px`),
      moon: this.labels.body('Moon', `${int(B.moon.widthKm)} km · ${px(B.moon)} px`),
    };
  }

  private updateBodyLabels(w: number, h: number, along: number) {
    const xp = this.xp!;
    const flying = this.state === 'journey';
    const a = this.arrivalMix();
    const z = this.zoom;
    const entries: [BodyId | 'sun', THREE.Vector3, number][] = [
      ['sun', new THREE.Vector3(0, 0, 0), z > 0.4 ? 1 : 0],
      ['mercury', xp.planets.bodies.mercury.mesh.position, 1],
      ['venus', xp.planets.bodies.venus.mesh.position, 1],
      ['earth', xp.planets.bodies.earth.mesh.position, 1 - clamp01((a - 0.55) / 0.25)],
      ['moon', xp.planets.bodies.moon.mesh.position, z > 0.4 ? 0 : 1 - clamp01((a - 0.6) / 0.2)],
    ];
    for (const [id, pos, base] of entries) {
      const l = this.bodyLabels[id];
      if (!l) continue;
      let o = flying ? base : 0;
      if (o > 0) {
        const near = Math.abs(pos.x - this.photonPos.x) < along * 1.2 || z > 0.4;
        if (!near) o = 0;
      }
      const s = o > 0 ? this.labels.project(pos, xp.camera, w, h) : null;
      if (!s) {
        l.place(0, 0, 0);
        continue;
      }
      const edge = Math.min(s.x, w - s.x, s.y, h - s.y);
      l.place(s.x, s.y, o * clamp01((edge - 20) / 60));
    }
  }

  // ---------------------------------------------------------------- helpers

  private caption(html: string, ms = 0) {
    const root = $('captions');
    const c = document.createElement('p');
    c.className = 'caption';
    c.innerHTML = html;
    root.appendChild(c);
    this.captionEls.push(c);
    requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
    if (ms) setTimeout(() => this.dropCaption(c), ms);
  }

  private dropCaption(c: HTMLElement) {
    c.classList.remove('in');
    setTimeout(() => c.remove(), 1300);
    this.captionEls = this.captionEls.filter((x) => x !== c);
  }

  private clearCaptions() {
    for (const c of [...this.captionEls]) this.dropCaption(c);
  }

  private veil(on: boolean, ms = 380) {
    const v = $('veil');
    v.style.transitionDuration = `${ms}ms`;
    v.classList.toggle('on', on);
  }

  private syncOrientation() {
    const portrait = this.xp ? this.xp.view.portrait : innerHeight > innerWidth * 1.08;
    document.body.classList.toggle('portrait', portrait);
  }

  private onResize() {
    this.xp?.resize();
    this.syncOrientation();
    this.hud.measure();
    this.hud.placeThumb();
  }
}

// Exposed for debugging in the console.
const app = new App();
(window as unknown as { __8min: App }).__8min = app;
