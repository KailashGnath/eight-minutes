import { $, el } from './dom';
import { RACERS } from '../content/milestones';
import { C, type Trip } from '../core/Scale';
import { conv, int, span, type Units } from '../core/format';

/** Everything that left the Sun with the photon — and how far it has got. */
export class Race {
  private root = $('race');
  private btn = $('btn-race');
  private list = $('race-lanes');
  private rows: { dist: HTMLElement; v: number }[] = [];
  private lastUpdate = 0;
  open = false;

  constructor() {
    this.btn.addEventListener('click', () => this.toggle());
    this.build();
  }

  private build() {
    this.list.innerHTML = '';
    this.rows = [];
    const light = el(
      'li',
      'light',
      `<span class="who">Photon<small>Light, 299,792 km/s</small></span><span class="num" data-v="${C}"></span>`,
    );
    this.list.appendChild(light);
    this.rows.push({ dist: light.querySelector('.num')!, v: C });
    for (const r of RACERS) {
      const li = el(
        'li',
        '',
        `<span class="who">${r.name}<small>${r.note}</small></span><span class="num"></span>
         <span class="ratio">Light is <b>${int(C / r.v)}×</b> faster</span>`,
      );
      this.list.appendChild(li);
      this.rows.push({ dist: li.querySelector('.num')!, v: r.v });
    }
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    this.btn.setAttribute('aria-expanded', String(this.open));
  }

  update(t: number, units: Units, now: number, force = false) {
    if (!this.open || (!force && now - this.lastUpdate < 90)) return;
    this.lastUpdate = now;
    for (const r of this.rows) {
      const km = r.v * t;
      r.dist.textContent = `${int(conv(km, units))} ${units}`;
    }
  }
}

/** Finish times for the end screen. */
export function raceResults(trip: Trip) {
  return RACERS.map((r) => ({ name: r.name, time: span(trip.km / r.v) }));
}
