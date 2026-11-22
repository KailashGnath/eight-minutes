import {
  C,
  EARTH_CIRC,
  EARTH_ORBIT_V,
  EARTH_R,
  MERCURY,
  MOON_DIST,
  PARKER_KM_FROM_SURFACE,
  SUN_R,
  VENUS,
  kmAt,
  tAt,
  type Trip,
} from '../core/Scale';
import { distWords, dist, duration, int, one, span, type Units } from '../core/format';

export type MilestoneKind = 'fact' | 'planet' | 'halfway' | 'moon' | 'earth';

export interface Milestone {
  id: string;
  /** Seconds after release. */
  t: number;
  kind: MilestoneKind;
  /** Short name for the minimap and log. */
  label: string;
  big: string;
  text: string;
  lens?: 'mercury' | 'venus';
}

const CAR_KM_S = 100 / 3600;
const JET_KM_S = 900 / 3600;

/**
 * Every figure is computed from today's trip, so the copy stays true whether
 * the trip is 8:07 in January or 8:24 in July.
 */
export function buildMilestones(trip: Trip, units: Units): Milestone[] {
  const T = trip.seconds;
  const list: Milestone[] = [];
  const add = (m: Milestone) => list.push(m);

  add({
    id: 'one-second',
    t: 1,
    kind: 'fact',
    label: 'One second',
    big: `${one(C / EARTH_CIRC)}× around Earth`,
    text: `In its first second, the photon covered ${dist(C, units)}. That’s enough to circle Earth seven and a half times.`,
  });

  add({
    id: 'moon-distance',
    t: tAt(MOON_DIST),
    kind: 'fact',
    label: 'Moon distance',
    big: dist(MOON_DIST, units),
    text: 'As far as the Moon is from Earth. Moonlight takes just 1.3 seconds to reach your eyes.',
  });

  add({
    id: 'sun-width',
    t: tAt(SUN_R * 2),
    kind: 'fact',
    label: 'One Sun wide',
    big: 'One Sun wide',
    text: `It has crossed ${distWords(SUN_R * 2, units)}, the full width of the Sun. You could line up 109 Earths across it.`,
  });

  add({
    id: 'parker',
    t: tAt(PARKER_KM_FROM_SURFACE),
    kind: 'fact',
    label: 'Parker Solar Probe',
    big: `${int(C / 191.7)}× faster`,
    text: 'Parker Solar Probe flew this close to the Sun at 690,000 km/h, the fastest thing humans have ever built. Light is still over 1,500 times faster.',
  });

  const tCar = 45;
  add({
    id: 'car',
    t: tCar,
    kind: 'fact',
    label: 'By car',
    big: distWords(kmAt(tCar), units),
    text: `Forty-five seconds in. Driving this far at highway speed would take <b>${span(kmAt(tCar) / CAR_KM_S)}</b>.`,
  });

  add({
    id: 'basketball',
    t: 80,
    kind: 'fact',
    label: 'A sense of scale',
    big: 'Basketball & peppercorn',
    text: 'If the Sun were a basketball, Earth would be a peppercorn about 26 metres away. We’re less than a fifth of the way.',
  });

  add({
    id: 'suns',
    t: 120,
    kind: 'fact',
    label: 'Two minutes',
    big: `${Math.round(kmAt(120) / (SUN_R * 2))} Suns`,
    text: `Two minutes in, it has crossed ${Math.round(kmAt(120) / (SUN_R * 2))} Suns laid side by side, and there’s still nothing out here.`,
  });

  add({
    id: 'vacuum',
    t: 155,
    kind: 'fact',
    label: 'Empty space',
    big: 'A few dozen atoms per cm³',
    text: 'A thimble of air holds about 25 billion billion molecules. Out here there are only a few dozen. The photon has almost nothing to hit.',
  });

  add({
    id: 'mercury',
    t: tAt(MERCURY.a - SUN_R),
    kind: 'planet',
    label: 'Mercury',
    big: 'Mercury',
    text: `The innermost planet orbits here, ${distWords(MERCURY.a, units)} from the Sun. It’s ${int(MERCURY.r * 2)} km wide, just 2 pixels at this scale.`,
    lens: 'mercury',
  });

  add({
    id: 'jet',
    t: 220,
    kind: 'fact',
    label: 'By jet',
    big: `${distWords(kmAt(220), units)} vs ${dist(220 * JET_KM_S, units)}`,
    text: `If you’d left on a passenger jet when the photon left the Sun, you’d have flown about <b>${dist(220 * JET_KM_S, units)}</b> by now.`,
  });

  add({
    id: 'halfway',
    t: T / 2,
    kind: 'halfway',
    label: 'Halfway',
    big: 'Halfway',
    text: `${distWords(trip.km / 2, units)} behind. The same distance still ahead.`,
  });

  add({
    id: 'radio',
    t: 290,
    kind: 'fact',
    label: 'All light',
    big: 'Same speed, every signal',
    text: 'Radio, Wi-Fi, phone calls, X-rays: they’re all light, and they all travel at exactly this speed.',
  });

  const tOrbit = 325;
  const orbitKm = tOrbit * EARTH_ORBIT_V;
  add({
    id: 'orbit',
    t: tOrbit,
    kind: 'fact',
    label: 'Earth moves too',
    big: `${dist(orbitKm, units)}`,
    text: `Earth isn’t waiting still. It races around the Sun at 30 km every second, so it has moved ${dist(orbitKm, units)} since the photon set off.`,
  });

  add({
    id: 'venus',
    t: tAt(VENUS.a - SUN_R),
    kind: 'planet',
    label: 'Venus',
    big: 'Venus',
    text: `Earth’s twin in size, wrapped in clouds of sulphuric acid. It orbits ${distWords(VENUS.a, units)} from the Sun.`,
    lens: 'venus',
  });

  const tVanish = 400;
  add({
    id: 'vanish',
    t: tVanish,
    kind: 'fact',
    label: 'If the Sun vanished',
    big: `${duration(T - tVanish)} left`,
    text: `If the Sun vanished right now, Earth would keep seeing it, and orbiting nothing, for another ${duration(T - tVanish)}.`,
  });

  const tFinal = T - 50;
  add({
    id: 'final',
    t: tFinal,
    kind: 'fact',
    label: 'Final approach',
    big: `${distWords(trip.km - kmAt(tFinal), units)} to go`,
    text: `Earth is ${int(EARTH_R * 2)} km wide. At this scale that’s five and a half pixels, a speck in a lot of nothing.`,
  });

  add({
    id: 'earth-ahead',
    t: T - 8,
    kind: 'earth',
    label: 'Earth ahead',
    big: 'Earth, dead ahead',
    text: 'Eight seconds out. Watch the tiny blue dot.',
  });

  add({
    id: 'moon',
    t: T - tAt(MOON_DIST),
    kind: 'moon',
    label: 'The Moon',
    big: 'Passing the Moon',
    text: '1.3 seconds to go.',
  });

  return list.sort((a, b) => a.t - b.t);
}

export interface Racer {
  id: string;
  name: string;
  note: string;
  v: number; // km/s
}

export const RACERS: Racer[] = [
  { id: 'parker', name: 'Parker Solar Probe', note: 'Fastest spacecraft ever', v: 191.7 },
  { id: 'voyager', name: 'Voyager 1', note: 'Leaving the solar system', v: 16.99 },
  { id: 'bullet', name: 'Rifle bullet', note: '≈ 3,400 km/h', v: 0.95 },
  { id: 'jet', name: 'Passenger jet', note: '900 km/h', v: JET_KM_S },
  { id: 'car', name: 'Car on a highway', note: '100 km/h', v: CAR_KM_S },
];
