import { $, el } from './dom';
import type { Milestone } from '../content/milestones';
import { clock, type Units } from '../core/format';

export interface Settings {
  units: Units;
  sound: boolean;
  labels: boolean;
  reduceMotion: boolean;
}

type Id = 'settings' | 'about' | 'log';

/** Settings, About and the milestone log, as native dialogs. */
export class Sheets {
  private dialogs: Record<Id, HTMLDialogElement> = {
    settings: $('sheet-settings') as HTMLDialogElement,
    about: $('sheet-about') as HTMLDialogElement,
    log: $('sheet-log') as HTMLDialogElement,
  };
  private sound = $('set-sound') as HTMLInputElement;
  private labels = $('set-labels') as HTMLInputElement;
  private motion = $('set-motion') as HTMLInputElement;
  private unitBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-units]')];

  constructor(
    private s: Settings,
    private onChange: (s: Settings, key: keyof Settings) => void,
    private getLog: () => Milestone[],
    private onOpenChange: (open: boolean) => void,
  ) {
    $('btn-settings').addEventListener('click', () => this.open('settings'));
    $('btn-about').addEventListener('click', () => this.open('about'));
    $('btn-log').addEventListener('click', () => this.open('log'));

    for (const d of Object.values(this.dialogs)) {
      d.querySelector('.sheet-close')?.addEventListener('click', () => d.close());
      // Click on the backdrop closes.
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
      d.addEventListener('close', () => this.onOpenChange(this.isOpen));
    }

    this.sound.addEventListener('change', () => this.update('sound', this.sound.checked));
    this.labels.addEventListener('change', () => this.update('labels', this.labels.checked));
    this.motion.addEventListener('change', () => this.update('reduceMotion', this.motion.checked));
    this.unitBtns.forEach((b) => b.addEventListener('click', () => this.update('units', b.dataset.units as Units)));
    this.sync(s);
  }

  get isOpen() {
    return Object.values(this.dialogs).some((d) => d.open);
  }

  open(id: Id) {
    for (const d of Object.values(this.dialogs)) if (d.open) d.close();
    if (id === 'log') this.renderLog();
    this.dialogs[id].showModal();
    this.onOpenChange(true);
  }

  closeAll() {
    let any = false;
    for (const d of Object.values(this.dialogs))
      if (d.open) {
        d.close();
        any = true;
      }
    return any;
  }

  private update<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.s[key] = value;
    this.sync(this.s);
    this.onChange(this.s, key);
  }

  sync(s: Settings) {
    this.s = s;
    this.sound.checked = s.sound;
    this.labels.checked = s.labels;
    this.motion.checked = s.reduceMotion;
    this.unitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.units === s.units)));
  }

  private renderLog() {
    const list = $('log-list');
    list.innerHTML = '';
    const items = this.getLog();
    if (!items.length) {
      list.appendChild(el('li', 'log-empty', 'Nothing yet. Milestones appear here as the photon passes them.'));
      return;
    }
    for (const m of [...items].reverse()) {
      list.appendChild(el('li', '', `<span class="num">${clock(m.t)}</span><div><b>${m.big}</b><p>${m.text}</p></div>`));
    }
  }
}
