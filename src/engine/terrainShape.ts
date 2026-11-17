import { createNoise2D } from 'simplex-noise';

/** Deterministic PRNG (mulberry32) so the reef is the same on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise = createNoise2D(rng(1337));
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const FLOOR_MIN = -5;
export const FLOOR_MAX = -1.5;
export const TERRAIN_SIZE = 80;

/** Distance (m) from (x, z) to the nearest sand channel centre line. */
export function channelDistance(x: number, z: number): number {
  // Channel A winds from the start position forward (−Z): it leads the eye.
  const ax = 1.6 * Math.sin(z * 0.16) + 0.6 * Math.sin(z * 0.41 + 1.3) + 1.2;
  const dA = z < 16 && z > -28 ? Math.abs(x - ax) : 99;
  // Channel B crosses the reef diagonally.
  const bz = -7 + 3 * Math.sin(x * 0.18) + 0.25 * x;
  const dB = x > -28 && x < 26 ? Math.abs(z - bz) : 99;
  return Math.min(dA, dB);
}

/** Analytic height used to bake the heightmap. */
export function baseHeight(x: number, z: number): number {
  const r2 = x * x + (z + 2) * (z + 2);
  let h = -3.4;
  h += 1.75 * Math.exp(-r2 / (2 * 15 * 15)); // raised reef zone around the start
  h += 0.35 * noise(x * 0.06, z * 0.06) + 0.15 * noise(x * 0.18, z * 0.18) + 0.05 * noise(x * 0.7, z * 0.7);
  h -= 0.65 * (1 - smooth(1.0, 2.6, channelDistance(x, z))); // sand channels
  h -= 2.2 * smooth(15, 26, x + 2 * noise(z * 0.08, 3)); // reef edge drop-off into the blue (east)
  return Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, h));
}
