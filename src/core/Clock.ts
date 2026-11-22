const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * Simulated journey time. Advances with the wall clock times the chosen rate,
 * can warp smoothly to a target, and reports how fast it is really moving so
 * visuals (trail length, streaks) can react to warps and catch-ups alike.
 */
export class Clock {
  t = 0;
  rate = 1;
  paused = false;
  running = false;
  end = Infinity;
  /** Temporary rate that overrides `rate` (slow motion at arrival). */
  override: number | null = null;
  /** Smoothed sim-seconds per real second, for visuals. */
  visualRate = 1;

  private warp: { from: number; to: number; start: number; dur: number } | null = null;
  private prev = 0;

  start() {
    this.t = 0;
    this.prev = 0;
    this.running = true;
    this.paused = false;
    this.warp = null;
    this.override = null;
    this.visualRate = 1;
  }

  stop() {
    this.running = false;
    this.warp = null;
  }

  get warping() {
    return this.warp !== null;
  }

  get warpTarget() {
    return this.warp?.to ?? null;
  }

  tick(realDt: number, now: number) {
    if (!this.running) return;
    if (this.warp) {
      const k = Math.min(1, (now - this.warp.start) / this.warp.dur);
      this.t = this.warp.from + (this.warp.to - this.warp.from) * easeInOut(k);
      if (k >= 1) this.warp = null;
    } else if (!this.paused) {
      this.t += realDt * (this.override ?? this.rate);
    }
    this.t = Math.min(this.t, this.end);

    const inst = realDt > 0 ? (this.t - this.prev) / realDt : 0;
    const k = 1 - Math.exp(-realDt * 6);
    this.visualRate += (inst - this.visualRate) * k;
    this.prev = this.t;
  }

  /** Glide to a later time over `dur` ms. */
  warpTo(target: number, now: number, dur = 2200) {
    target = Math.min(target, this.end);
    if (target <= this.t) return;
    this.warp = { from: this.t, to: target, start: now, dur };
  }

  /**
   * After the tab was hidden: the photon kept going, so jump ahead — but show
   * it as a fast catch-up rather than a cut.
   */
  catchUp(awaySeconds: number, now: number, dur = 1400) {
    const rate = this.paused ? 0 : (this.override ?? this.rate);
    const ahead = awaySeconds * rate + (dur / 1000) * rate;
    if (ahead <= 0) return 0;
    const to = Math.min(this.t + ahead, this.end);
    const travelled = to - this.t - (dur / 1000) * rate;
    this.warp = { from: this.t, to, start: now, dur };
    return Math.max(0, travelled);
  }
}
