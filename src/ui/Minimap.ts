import { $, el } from './dom';
import type { Milestone } from '../content/milestones';
import type { Trip } from '../core/Scale';
import { clock } from '../core/format';

/**
 * The whole trip at true proportion: Sun, Mercury, Venus, Earth, every
 * milestone as a tick you can hover, and the photon creeping along.
 */
export class Minimap {
  private root = $('minimap');
  private ticks = $('mm-ticks');
  private bodies = $('mm-bodies');
  private tip = $('mm-tip');
  private tickEls: HTMLButtonElement[] = [];
  private items: Milestone[] = [];
  private passed = -1;
  private lastP = -1;
  private tipFor: number | null = null;
  t = 0;

  constructor(private onWarp: (m: Milestone) => void) {
    document.addEventListener('pointerdown', (e) => {
      if (this.tipFor !== null && !this.root.contains(e.target as Node)) this.hideTip();
    });
  }

  build(trip: Trip, items: Milestone[]) {
    this.items = items;
    this.ticks.innerHTML = '';
    this.bodies.innerHTML = '';
    this.tickEls = [];
    this.passed = -1;
    this.lastP = -1;
    this.hideTip();

    const at = (x: number) => (x - trip.startX) / (trip.endX - trip.startX);
    const body = (name: string, p: number, cls: string, size: number, color: string) => {
      const b = el('div', `mm-body ${cls}`, `<i></i><span>${name}</span>`);
      b.style.setProperty('--at', String(Math.max(0, Math.min(1, p))));
      b.style.setProperty('--s', `${size}px`);
      b.style.setProperty('--c', color);
      this.bodies.appendChild(b);
    };
    body('Sun', 0, 'sun first', 11, '#ffd27a');
    body('Mercury', at(trip.mercuryX), '', 6, '#b9b2a8');
    body('Venus', at(trip.venusX), '', 7, '#ecd9b0');
    body('Earth', 1, 'last', 8, '#8cc6ff');

    items.forEach((m, i) => {
      if (m.kind === 'planet') return;
      const b = el('button', 'mm-tick') as HTMLButtonElement;
      b.type = 'button';
      b.style.setProperty('--at', String(m.t / trip.seconds));
      b.setAttribute('aria-label', `${m.label} at ${clock(m.t)}`);
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.showTip(i);
      });
      b.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && this.tipFor === i && !this.tip.matches(':hover')) this.hideTip();
      });
      b.addEventListener('focus', () => this.showTip(i));
      b.addEventListener('click', () => (this.tipFor === i ? this.hideTip() : this.showTip(i)));
      this.ticks.appendChild(b);
      this.tickEls[i] = b;
    });
    this.tip.onpointerleave = () => this.hideTip();
  }

  private showTip(i: number) {
    const m = this.items[i];
    const total = this.items.length;
    this.tipFor = i;
    const future = m.t > this.t + 0.5;
    this.tip.hidden = false;
    this.tip.style.setProperty('--at', this.tickEls[i]?.style.getPropertyValue('--at') ?? '0');
    const at = Number(this.tickEls[i]?.style.getPropertyValue('--at') ?? 0);
    this.tip.classList.toggle('left', at < 0.12);
    this.tip.classList.toggle('right', at > 0.88);
    this.tip.innerHTML = `<span class="num">${clock(m.t)}</span><b>${m.label}</b>${
      future ? '<button type="button">Warp there</button>' : '<span>Already passed</span>'
    }`;
    this.tip.setAttribute('aria-label', `Milestone ${i + 1} of ${total}`);
    const btn = this.tip.querySelector('button');
    btn?.addEventListener('click', () => {
      this.hideTip();
      this.onWarp(m);
    });
  }

  hideTip() {
    this.tipFor = null;
    this.tip.hidden = true;
  }

  update(t: number, trip: Trip, passedIdx: number) {
    this.t = t;
    const p = Math.min(1, t / trip.seconds);
    if (Math.abs(p - this.lastP) > 0.0002) {
      this.root.style.setProperty('--p', p.toFixed(5));
      this.lastP = p;
    }
    if (passedIdx !== this.passed) {
      this.tickEls.forEach((b, i) => b?.classList.toggle('passed', i <= passedIdx));
      this.passed = passedIdx;
    }
  }
}
