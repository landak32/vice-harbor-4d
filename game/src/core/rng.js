// Seeded pseudo-randomness. Every random decision in Vice Harbor — building heights, window
// lights, traffic colours, pedestrian outfits, muzzle spread — draws from one of these streams, so
// a seed always rebuilds the same city and the same shot frame.

/** mulberry32: 32-bit state, good enough distribution for scenery and cheap enough per call. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named stream: one rng instance per subsystem keeps one system's draws from shifting another's. */
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  float() {
    return this.next();
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  /** Weighted pick from [[value, weight], ...]. */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= e[1];
      if (roll <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /** Small deterministic jitter, used for poses and idle motion. */
  jitter(amount) {
    return (this.next() * 2 - 1) * amount;
  }
}

/** Derive a sub-stream so adding a system does not disturb the others' sequences. */
export function deriveRng(seed, salt) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return new Rng(h >>> 0);
}
