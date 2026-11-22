/**
 * True-scale numbers. One world unit is 2,300 km, which makes the Sun about 600
 * units wide and lets light move about 130 units (≈ pixels) per second.
 */
export const C = 299_792.458; // km/s
export const KM_PER_UNIT = 2300;

export const AU = 149_597_870.7;
export const SUN_R = 695_700;
export const EARTH_R = 6_371;
export const EARTH_CIRC = 40_075;
export const EARTH_ORBIT_V = 29.78; // km/s
export const MOON_R = 1_737.4;
export const MOON_DIST = 384_400;
export const MERCURY = { a: 57_909_050, r: 2_439.7 };
export const VENUS = { a: 108_208_000, r: 6_051.8 };
export const PARKER_KM_FROM_SURFACE = 6_100_000;

export const u = (km: number) => km / KM_PER_UNIT;
export const LIGHT_UNITS_PER_S = u(C);

// Earth's orbit, good to a few thousand km — plenty for a timer.
const ECC = 0.0167086;
const ANOMALISTIC_YEAR = 365.259636; // days
const PERIHELION_REF = Date.UTC(2000, 0, 3, 5, 18); // a known perihelion

export function earthSunKm(date = new Date()): number {
  const days = (date.getTime() - PERIHELION_REF) / 86_400_000;
  const M = 2 * Math.PI * (((days / ANOMALISTIC_YEAR) % 1) + 1);
  let E = M;
  for (let i = 0; i < 8; i++) E = M + ECC * Math.sin(E);
  return AU * (1 - ECC * Math.cos(E));
}

export interface Trip {
  date: Date;
  earthSunKm: number;
  /** Photosphere to Earth's surface. */
  km: number;
  seconds: number;
  /** World x of the Sun's surface, where the photon is released. */
  startX: number;
  earthX: number;
  /** World x of Earth's sunlit surface, where the photon lands. */
  endX: number;
  mercuryX: number;
  venusX: number;
  moonX: number;
}

export function makeTrip(date = new Date()): Trip {
  const d = earthSunKm(date);
  const km = d - SUN_R - EARTH_R;
  return {
    date,
    earthSunKm: d,
    km,
    seconds: km / C,
    startX: u(SUN_R),
    earthX: u(d),
    endX: u(d - EARTH_R),
    mercuryX: u(MERCURY.a),
    venusX: u(VENUS.a),
    moonX: u(d - MOON_DIST),
  };
}

/** Kilometres travelled from the Sun's surface after t seconds. */
export const kmAt = (t: number) => t * C;
/** Seconds for light to cover km from the Sun's surface. */
export const tAt = (km: number) => km / C;
export const xAt = (trip: Trip, t: number) => trip.startX + u(t * C);
