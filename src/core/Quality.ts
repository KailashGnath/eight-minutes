// Adapted from kailash-lab/src/core/Quality.ts
export type Tier = 'high' | 'medium' | 'phone' | 'low';

export interface QualitySettings {
  tier: Tier;
  dust: number;
  stars: number;
  maxDpr: number;
  bloom: boolean;
  chromatic: boolean;
  lensRes: number;
  sunDetail: number;
}

const PRESETS: Record<Tier, Omit<QualitySettings, 'tier'>> = {
  high: { dust: 2600, stars: 2400, maxDpr: 1.75, bloom: true, chromatic: true, lensRes: 512, sunDetail: 1 },
  medium: { dust: 1800, stars: 1800, maxDpr: 1.5, bloom: true, chromatic: true, lensRes: 384, sunDetail: 1 },
  phone: { dust: 1300, stars: 1400, maxDpr: 2, bloom: true, chromatic: false, lensRes: 320, sunDetail: 0.75 },
  low: { dust: 800, stars: 1000, maxDpr: 1.25, bloom: true, chromatic: false, lensRes: 256, sunDetail: 0.5 },
};

export function detectTier(): Tier {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || small) {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    return devicePixelRatio >= 2.5 && (cores >= 6 || mem >= 4) ? 'phone' : 'low';
  }
  return cores <= 4 ? 'medium' : 'high';
}

export function getQuality(tier = detectTier()): QualitySettings {
  return { tier, ...PRESETS[tier] };
}

/**
 * Watches real frame rate and asks the renderer to step down when it can't
 * keep up. Never steps back up, to avoid oscillating.
 */
export class FpsGovernor {
  private windowStart = 0;
  private frames = 0;
  private slowWindows = 0;
  private cooldownUntil = 0;
  private done = false;
  private lastTick = 0;

  constructor(private onDowngrade: () => boolean) {}

  tick(now = performance.now()) {
    if (this.done) return;
    // A gap this long means the page was throttled (hidden tab, background pane), not slow.
    const gap = now - this.lastTick;
    this.lastTick = now;
    if (gap > 250) {
      this.windowStart = now;
      this.frames = 0;
      this.slowWindows = 0;
      return;
    }
    if (!this.cooldownUntil) this.cooldownUntil = now + 2500;
    if (now < this.cooldownUntil) {
      this.windowStart = now;
      this.frames = 0;
      return;
    }
    this.frames++;
    const span = now - this.windowStart;
    if (span >= 1000) {
      const fps = (this.frames * 1000) / span;
      this.slowWindows = fps < 42 ? this.slowWindows + (fps < 20 ? 2 : 1) : 0;
      this.windowStart = now;
      this.frames = 0;
      if (this.slowWindows >= 2) {
        this.slowWindows = 0;
        if (this.onDowngrade()) this.cooldownUntil = now + 1500;
        else this.done = true;
      }
    }
  }

  /** Ignore a stall we caused ourselves (tab hidden, shader compile). */
  pause(ms = 2000) {
    this.cooldownUntil = performance.now() + ms;
  }
}

export function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
