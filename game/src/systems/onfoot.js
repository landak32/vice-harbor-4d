// On-foot movement: camera-relative walking and sprinting, a body that turns toward travel, and an
// aim mode where the character faces the camera's heading instead.
import { clamp, damp, wrapAngle } from '../core/math.js';

export class OnFootController {
  constructor(x = 0, z = 0, yaw = 0) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.yaw = yaw;
    this.speed = 0;
    this.targetSpeed = 0;
    this.aim = 0;
    this.mode = 'idle';
    this.stamina = 1;
    this.footPhase = 0;
    this.stepTimer = 0;
  }

  update(dt, input, cameraYaw, collision, opts = {}) {
    const axis = input.moveAxis();
    const sprint = input.down('sprint') && this.stamina > 0.05;
    const aiming = !!opts.aiming;
    const maxSpeed = sprint ? 6.4 : 2.9;
    this.stamina = clamp(this.stamina + (sprint && (axis.x || axis.y) ? -dt * 0.18 : dt * 0.14), 0, 1);

    let desiredVX = 0;
    let desiredVZ = 0;
    if (axis.x !== 0 || axis.y !== 0) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      // forward is (sin, cos) in world XZ for the camera's yaw
      const wx = sin * axis.y + cos * axis.x;
      const wz = cos * axis.y - sin * axis.x;
      const len = Math.hypot(wx, wz) || 1;
      desiredVX = (wx / len) * maxSpeed;
      desiredVZ = (wz / len) * maxSpeed;
    }

    const accel = this.speed > 0.1 ? 14 : 22;
    const vx = damp(this.vx ?? 0, desiredVX, accel * 0.55, dt);
    const vz = damp(this.vz ?? 0, desiredVZ, accel * 0.55, dt);
    this.vx = vx;
    this.vz = vz;
    this.speed = Math.hypot(vx, vz);
    this.targetSpeed = maxSpeed;

    const moving = this.speed > 0.15;
    const faceYaw = moving ? Math.atan2(vx, vz) : this.yaw;
    const targetYaw = aiming ? cameraYaw : faceYaw;
    this.yaw = this.yaw + wrapAngle(targetYaw - this.yaw) * (1 - Math.exp(-12 * dt));
    this.aim = damp(this.aim, aiming ? 1 : 0, 10, dt);

    const nx = this.x + vx * dt;
    const nz = this.z + vz * dt;
    const res = collision.resolve(nx, nz, 0.42);
    this.x = res.x;
    this.z = res.z;
    const c = collision.clampToMap(this.x, this.z, 3);
    this.x = c.x;
    this.z = c.z;
    this.y = collision.groundHeight(this.x, this.z);

    if (moving) {
      this.footPhase += dt * (sprint ? 10.5 : 6.2);
      this.stepTimer -= dt;
    } else {
      this.stepTimer = 0;
    }
    this.mode = !moving ? 'idle' : sprint ? 'run' : 'walk';
    return { stepped: this.stepTimer <= 0 && moving };
  }

  get isMoving() {
    return this.speed > 0.15;
  }
}
