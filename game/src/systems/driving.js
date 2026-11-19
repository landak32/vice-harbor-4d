// Arcade car handling: forward acceleration with a speed cap, a bicycle-model steering rate, lateral
// grip that the handbrake cuts so the car slides, and a wall impact that costs speed and paint.
import { clamp, damp, wrapAngle } from '../core/math.js';
import { CAR_TYPES } from '../entities/vehicles.js';

const WHEELBASE = 2.7;

export class CarPhysics {
  constructor(typeKey, x = 0, z = 0, yaw = 0) {
    this.spec = CAR_TYPES[typeKey];
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.driftAmount = 0;
    this.damage = 0;
    this.lastImpact = 0;
  }

  get forwardX() {
    return Math.sin(this.yaw);
  }

  get forwardZ() {
    return Math.cos(this.yaw);
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  update(dt, controls, collision) {
    const spec = this.spec;
    const throttle = controls.throttle ?? 0;
    const brake = controls.brake ?? 0;
    const steerInput = controls.steer ?? 0;
    this.handbrake = !!controls.handbrake;

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;

    const top = spec.top * (1 - this.damage * 0.25);
    if (throttle > 0) {
      const headroom = clamp(1 - vF / top, 0, 1);
      vF += spec.accel * throttle * headroom * dt;
    }
    if (brake > 0) {
      if (vF > 0.4) vF -= 26 * brake * dt;
      else vF -= spec.accel * 0.45 * brake * dt;
    }
    if (!throttle && !brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3.4 * dt);
    vF -= vF * 0.012 * Math.abs(vF) * dt;
    vF = clamp(vF, -top * 0.35, top);

    const grip = this.handbrake ? spec.grip * 0.18 : spec.grip;
    vR *= Math.exp(-grip * dt);
    this.driftAmount = clamp(Math.abs(vR) / 6, 0, 1);

    const steerMax = 0.62 / (1 + Math.abs(vF) * 0.055);
    this.steer = damp(this.steer, steerInput * steerMax, 9, dt);
    const turnRate = (vF / WHEELBASE) * Math.tan(this.steer);
    this.yaw = wrapAngle(this.yaw + turnRate * dt);

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.speed = vF;
    this.throttle = throttle;
    this.brake = brake;

    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const res = collision.resolve(nx, nz, 1.3);
    if (res.hit) {
      const impact = Math.abs(vF) + Math.abs(vR) * 0.5;
      if (impact > 3) {
        this.damage = Math.min(1, this.damage + impact * 0.012);
        this.lastImpact = impact;
      }
      this.vx *= 0.25;
      this.vz *= 0.25;
      this.speed *= 0.2;
      this.x = res.x;
      this.z = res.z;
    } else {
      this.x = nx;
      this.z = nz;
      this.lastImpact *= 0.9;
    }
    const clamped = collision.clampToMap(this.x, this.z, 2);
    this.x = clamped.x;
    this.z = clamped.z;
    return this;
  }

  /** Used when entering a car that was standing still. */
  stop() {
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
  }
}

/** Convert keyboard intent into car controls. */
export function readDrivingControls(input) {
  const axis = input.moveAxis();
  return {
    throttle: axis.y > 0 ? axis.y : 0,
    brake: axis.y < 0 ? -axis.y : 0,
    steer: -axis.x,
    handbrake: input.down('handbrake'),
  };
}
