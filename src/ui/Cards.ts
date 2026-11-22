import { $, el } from './dom';
import type { Milestone } from '../content/milestones';
import { clock } from '../core/format';

const HOLD = 7000;
const MIN_HOLD = 3600;

/**
 * Milestone cards: one at a time, each with a hairline countdown. If several
 * arrive close together they queue, each getting at least a few seconds.
 * Swipe or click to dismiss early. Everything shown is kept for the log.
 */
export class Cards {
  private root = $('cards');
  private queue: Milestone[] = [];
  private current: { m: Milestone; el: HTMLElement; shownAt: number; hold: number } | null = null;
  readonly log: Milestone[] = [];

  push(m: Milestone, quiet = false) {
    this.log.push(m);
    if (quiet) return;
    this.queue.push(m);
    // Never let a backlog build up: keep only the two newest.
    if (this.queue.length > 2) this.queue.splice(0, this.queue.length - 2);
  }

  clear() {
    this.queue.length = 0;
    this.log.length = 0;
    if (this.current) this.dismiss();
    this.root.innerHTML = '';
  }

  /** `frozenMs` is time to add back while paused, so cards wait for you. */
  tick(now: number, frozenMs: number) {
    const c = this.current;
    if (c) {
      c.shownAt += frozenMs;
      const elapsed = now - c.shownAt;
      const hold = this.queue.length ? MIN_HOLD : c.hold;
      const timer = c.el.querySelector<HTMLElement>('.card-timer');
      if (timer) timer.style.transform = `scaleX(${Math.max(0, 1 - elapsed / hold).toFixed(3)})`;
      if (elapsed >= hold) this.dismiss();
    }
    if (!this.current && this.queue.length) this.show(this.queue.shift()!, now);
  }

  private show(m: Milestone, now: number) {
    const kindLabel: Record<string, string> = {
      fact: 'Milestone',
      planet: 'Flyby',
      halfway: 'Halfway',
      moon: 'Flyby',
      earth: 'Arrival',
    };
    const card = el(
      'article',
      `card glass ${m.kind}`,
      `<div class="card-meta"><span class="num">${clock(m.t)}</span><span>${kindLabel[m.kind] ?? 'Milestone'}</span></div>
       <p class="card-big">${m.big}</p>
       <p class="card-text">${m.text}</p>
       <span class="card-timer" aria-hidden="true"></span>`,
    );
    this.root.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
    this.current = { m, el: card, shownAt: now, hold: HOLD };

    // Click or swipe sideways to dismiss.
    let sx = 0;
    let dx = 0;
    let dragging = false;
    card.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      dx = 0;
      dragging = true;
      card.setPointerCapture(e.pointerId);
    });
    card.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - sx;
      card.style.transition = 'none';
      card.style.transform = `translateX(${dx}px)`;
      card.style.opacity = String(1 - Math.min(1, Math.abs(dx) / 220));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = '';
      if (Math.abs(dx) > 70 || Math.abs(dx) < 4) {
        if (this.current?.el === card) this.dismiss(dx);
      } else {
        card.style.transform = '';
        card.style.opacity = '';
      }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  private dismiss(dx = 0) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    const card = c.el;
    if (dx) {
      card.style.transform = `translateX(${Math.sign(dx) * 260}px)`;
      card.style.opacity = '0';
    } else {
      card.classList.remove('in');
      card.classList.add('out');
    }
    setTimeout(() => card.remove(), 700);
  }
}
