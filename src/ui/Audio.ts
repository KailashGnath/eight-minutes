// Adapted from kailash-lab/src/ui/Audio.ts: a generated ambience, plus a few cues.
export class SpaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  enabled = false;

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 5;
    const drone = ctx.createGain();
    drone.gain.value = 1;
    filter.connect(drone).connect(master);

    // A low open fifth with slow beating; the filter breathes.
    [
      [55, 'sine', 0.24, -4],
      [82.41, 'triangle', 0.16, 5],
      [110, 'sine', 0.08, 2],
      [164.81, 'sine', 0.03, -6],
    ].forEach(([f, type, g, det]) => {
      const o = ctx.createOscillator();
      o.type = type as OscillatorType;
      o.frequency.value = f as number;
      o.detune.value = det as number;
      const gain = ctx.createGain();
      gain.gain.value = g as number;
      o.connect(gain).connect(filter);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    this.ctx = ctx;
    this.master = master;
    this.drone = drone;
    this.filter = filter;
    return ctx;
  }

  set(on: boolean) {
    this.enabled = on;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (on) void ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.11 : 0, now, on ? 1.4 : 0.3);
  }

  /** Brighten the drone while time is warped. */
  warp(amount: number) {
    if (!this.ctx || !this.filter) return;
    this.filter.frequency.setTargetAtTime(380 + amount * 900, this.ctx.currentTime, 0.4);
  }

  private tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g).connect(this.master);
    const t = ctx.currentTime + at;
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  chime() {
    if (!this.enabled) return;
    this.tone(1318.5, 0, 1.6, 0.05);
    this.tone(1975.5, 0.06, 1.4, 0.025);
  }

  /** Filtered noise sweep for the launch. */
  whoosh() {
    if (!this.enabled || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    const t = ctx.currentTime;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
    bp.frequency.exponentialRampToValueAtTime(300, t + 2.1);
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    this.tone(55, 0, 2.5, 0.25);
  }

  arrive() {
    if (!this.enabled) return;
    [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => this.tone(f, i * 0.09, 4.5, 0.05));
    if (this.drone && this.ctx) this.drone.gain.setTargetAtTime(0.6, this.ctx.currentTime, 2);
  }

  reset() {
    if (this.drone && this.ctx) this.drone.gain.setTargetAtTime(1, this.ctx.currentTime, 1);
  }
}
