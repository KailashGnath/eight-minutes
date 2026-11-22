export type Units = 'km' | 'mi';

const MI = 0.621371;
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const conv = (km: number, units: Units) => (units === 'mi' ? km * MI : km);
export const int = (n: number) => nf.format(Math.round(n));
export const one = (n: number) => nf1.format(n);

/** "384,400 km" */
export function dist(km: number, units: Units): string {
  return `${int(conv(km, units))} ${units}`;
}

/** "147.7 million km" / "6.1 million km" / "384,400 km" */
export function distWords(km: number, units: Units): string {
  const v = conv(km, units);
  if (v >= 1e9) return `${one(v / 1e9)} billion ${units}`;
  if (v >= 1e6) return `${one(v / 1e6)} million ${units}`;
  return `${int(v)} ${units}`;
}

/** "12M km" style for ruler labels. */
export function distShort(km: number, units: Units): string {
  const v = conv(km, units);
  if (v >= 1e6) return `${+(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M ${units}`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k ${units}`;
  return `${Math.round(v)} ${units}`;
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');

/** "03:11.42" (or "1:02:03" past an hour) */
export function clock(t: number): string {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  if (h) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** "3:11" */
export function clockShort(t: number): string {
  t = Math.max(0, Math.round(t));
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
}

/** "8 min 10 s" / "1.3 s" / "45 s" */
export function duration(t: number): string {
  if (t < 10) return `${+t.toFixed(t < 2 ? 2 : 1)} s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  if (!m) return `${s} s`;
  if (s === 60) return `${m + 1} min`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** Long spans for the race: "8.9 days", "4.7 years", "168 years". */
export function span(seconds: number): string {
  const min = seconds / 60;
  const hr = min / 60;
  const day = hr / 24;
  const yr = day / 365.25;
  if (yr >= 100) return `${int(yr)} years`;
  if (yr >= 1.5) return `${one(yr)} years`;
  if (day >= 2) return `${day >= 20 ? int(day) : one(day)} days`;
  if (hr >= 2) return `${one(hr)} hours`;
  return `${int(min)} minutes`;
}

export const today = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
