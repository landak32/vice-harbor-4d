// Fixed-timestep accumulator. The simulation always advances in whole 1/60 s steps, no matter how
// the browser schedules frames, which is what makes `?shot=` reproducible: N seconds means N*60
// identical steps.

export const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

export class FixedStep {
  constructor(step = STEP) {
    this.step = step;
    this.accumulator = 0;
    this.elapsed = 0;
    this.steps = 0;
  }

  /** Feed real elapsed seconds; calls `tick(step)` for each whole step. */
  advance(dt, tick) {
    this.accumulator += Math.min(dt, 0.25);
    let n = 0;
    while (this.accumulator >= this.step && n < MAX_STEPS_PER_FRAME) {
      tick(this.step, this.elapsed);
      this.elapsed += this.step;
      this.accumulator -= this.step;
      this.steps++;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return n;
  }

  /** Advance exactly `seconds` of simulated time, ignoring the wall clock (shot recording). */
  runFixed(seconds, tick) {
    const n = Math.round(seconds / this.step);
    for (let i = 0; i < n; i++) {
      tick(this.step, this.elapsed);
      this.elapsed += this.step;
      this.steps++;
    }
    return n;
  }

  reset() {
    this.accumulator = 0;
    this.elapsed = 0;
    this.steps = 0;
  }
}

/** Deterministic 0..1 interpolation of a simulation clock, for animations that must repeat. */
export const pulse = (t, hz) => (t * hz) % 1;
