/** Seeded random numbers (mulberry32): the same seed gives the same sequence, so a scene or a battle replays exactly. */
export function seededRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));

/** Hermite smoothstep of v between a and b. */
export function smooth(a: number, b: number, v: number): number {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
}
