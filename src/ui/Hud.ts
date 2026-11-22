import { $ } from './dom';
import { C, kmAt, type Trip } from '../core/Scale';
import { clock, clockShort, conv, int, type Units } from '../core/format';

export const RATES = [1, 10, 100, 1000];

/**
 * Telemetry, speed control, status pills and the idle fade. Writes to the DOM
 * only when a value actually changes, so 60 fps updates stay cheap.
 */
export class Hud {
  private time = $('tm-time');
  private dist = $('tm-dist');
  private tail = $('tm-dist-tail');
  private unit = $('tm-unit');
  private pct = $('tm-pct');
  private eta = $('tm-eta');
  private speed = $('tm-speed');
  private warpPill = $('warp-pill');
  private warpText = $('warp-text');
  private toastEl = $('toast');
  private pausedEl = $('paused');
  private backEl = $('btn-back');
  private pauseBtn = $('btn-pause');
  private thumb = $('speed-thumb');
  private segs = [...document.querySelectorAll<HTMLButtonElement>('.speed [data-rate]')];
  private cache = new Map<HTMLElement, string>();
  private toastTimer = 0;
  private lastInput = performance.now();
  idle = false;

  constructor(h: { onRate: (r: number) => void; onPause: () => void; onWarpPill: () => void; onBack: () => void }) {
    this.segs.forEach((b) => b.addEventListener('click', () => h.onRate(Number(b.dataset.rate))));
    this.pauseBtn.addEventListener('click', h.onPause);
    this.warpPill.addEventListener('click', h.onWarpPill);
    this.backEl.addEventListener('click', h.onBack);
    const wake = () => this.wake();
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, wake, { passive: true });
    addEventListener('resize', () => this.placeThumb());
  }

  private set(e: HTMLElement, v: string, html = false) {
    if (this.cache.get(e) === v) return;
    this.cache.set(e, v);
    if (html) e.innerHTML = v;
    else e.textContent = v;
  }

  telemetry(t: number, trip: Trip, units: Units) {
    this.set(this.time, clock(t));
    const km = Math.min(kmAt(t), trip.km);
    const full = int(conv(km, units));
    // Show the last three digits dimmed: they spin too fast to read.
    const cut = full.length > 4 ? full.length - 3 : full.length;
    this.set(this.dist, full.slice(0, cut));
    this.set(this.tail, full.slice(cut));
    this.set(this.unit, units);
    const p = Math.min(100, (t / trip.seconds) * 100);
    this.set(this.pct, `${p.toFixed(1)}<small>%</small>`, true);
    this.set(this.eta, clockShort(Math.max(0, trip.seconds - t)));
    this.set(this.speed, `${int(conv(C, units))} <small>${units}/s</small>`, true);
  }

  rate(r: number, paused: boolean) {
    this.segs.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === r)));
    this.pauseBtn.setAttribute('aria-pressed', String(paused));
    this.pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    this.pausedEl.hidden = !paused;
    this.placeThumb();
  }

  placeThumb() {
    const active = this.segs.find((b) => b.getAttribute('aria-pressed') === 'true');
    if (!active) return;
    this.thumb.style.setProperty('--x', `${active.offsetLeft}px`);
    this.thumb.style.setProperty('--w', `${active.offsetWidth}px`);
  }

  pill(kind: 'warp' | 'slowmo' | null, text = '') {
    this.warpPill.hidden = !kind;
    if (!kind) return;
    this.warpPill.classList.toggle('slowmo', kind === 'slowmo');
    this.set(this.warpText, text);
  }

  toast(msg: string, ms = 3600) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  back(on: boolean) {
    if (this.backEl.hidden === !on) return;
    this.backEl.hidden = !on;
  }

  wake() {
    this.lastInput = performance.now();
    if (this.idle) {
      this.idle = false;
      document.body.classList.remove('hud-idle');
    }
  }

  sleep() {
    this.idle = true;
    document.body.classList.add('hud-idle');
  }

  tickIdle(now: number, allowed: boolean) {
    const should = allowed && now - this.lastInput > 4000;
    if (should !== this.idle) {
      this.idle = should;
      document.body.classList.toggle('hud-idle', should);
    }
  }

  /** Space the cards and pills above the bottom bar, whatever its height. */
  measure() {
    const bottom = document.querySelector<HTMLElement>('.hud-bottom');
    if (!bottom || document.body.classList.contains('portrait')) return;
    const r = bottom.getBoundingClientRect();
    document.documentElement.style.setProperty('--bottom-h', `${Math.round(innerHeight - r.top)}px`);
  }
}
