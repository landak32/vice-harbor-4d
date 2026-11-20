// Third-person camera rig. A spring follows the player from behind and above, sits over the
// shoulder on foot so the character is always in frame, pulls back and up for driving, and leads
// the target slightly in the direction of travel.
import * as THREE from '../../vendor/three.module.min.js';
import { clamp, damp, wrapAngle } from '../core/math.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, 6, -14);
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.yawOffset = 0;
    this.pitchOffset = 0;
    this.distance = 6;
    this.height = 3;
    // shot-only framing nudge: the four store screenshots need the walker clear of the subtitle box
    this.distanceBias = 0;
    this.heightBias = 0;
    this.targetBias = 0;
    // Shot-only lateral slide, on top of the on-foot shoulder offset: it swings the camera off the
    // subject's axis for a three-quarter angle instead of a flat straight-on view.
    this.lateralBias = 0;
    // Shot-only aim offset. Sliding the camera does almost nothing to where the subject sits in
    // frame, because the rig re-aims at a point ahead of the subject and the two cancel out. Aiming
    // past the subject is what puts it on a third.
    this.aimBias = 0;
    this.shake = 0;
    this.desired = new THREE.Vector3();
    this.targetDesired = new THREE.Vector3();
    this.initialised = false;
  }

  look(dx, dy) {
    this.yawOffset -= dx * 0.0022;
    this.pitchOffset = clamp(this.pitchOffset - dy * 0.0016, -0.42, 0.55);
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  /**
   * state: {x, z, yaw, speed, driving, aim, orbit}
   * On foot the camera trails the character's facing but the player can swing it with the mouse;
   * driving keeps it behind the car so the road ahead reads.
   */
  update(dt, state) {
    const driving = state.driving;
    const speed = Math.abs(state.speed ?? 0);
    const baseYaw = state.yaw + this.yawOffset;
    this.yaw = this.initialised ? this.yaw + wrapAngle(baseYaw - this.yaw) * (1 - Math.exp(-9 * dt)) : baseYaw;

    // 9.0 is the closest chase distance that keeps the car's own roof and boot out of the bottom
    // of the frame at this height; the 0.10 per unit of speed buys look-room ahead as the road
    // rushes in. The 3.0 clamp (~30 u/s) stops the rig trailing far enough back to sink into the
    // facades behind the car and, since distance is damped at lambda 4, stops it drifting on
    // after a crash instead of snapping home.
    const dist = (driving ? 9.0 + Math.min(3.0, speed * 0.10) : 5.6) + this.distanceBias;
    const height = (driving ? 4.35 + Math.min(0.9, speed * 0.02) : 2.55) + this.heightBias;
    this.distance = damp(this.distance, dist, 4, dt);
    this.height = damp(this.height, height, 4, dt);

    const pitch = this.pitchOffset * (driving ? 0.6 : 1);
    const shoulder = driving ? 0 : 0.95;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const back = this.distance;
    const lateral = shoulder + this.lateralBias;
    const desiredX = state.x - sinY * back + cosY * lateral;
    const desiredZ = state.z - cosY * back - sinY * lateral;
    const desiredY = this.height + (state.y ?? 0) + pitch * 2.2;

    const lambda = driving ? 4.2 : 6.5;
    this.desired.set(desiredX, desiredY, desiredZ);
    if (this.initialised) {
      this.position.x = damp(this.position.x, desiredX, lambda, dt);
      this.position.y = damp(this.position.y, desiredY, lambda * 0.8, dt);
      this.position.z = damp(this.position.z, desiredZ, lambda, dt);
    } else {
      this.position.copy(this.desired);
    }

    // look-ahead: lead the target toward where the player is going
    const lead = driving ? 2.8 + speed * 0.09 : 2.6;
    const aimBlend = state.aim ?? 0;
    const leadYaw = this.yaw + aimBlend * this.yawOffset * 0.4;
    const tx = state.x + Math.sin(leadYaw) * lead + Math.cos(leadYaw) * this.aimBias;
    const tz = state.z + Math.cos(leadYaw) * lead - Math.sin(leadYaw) * this.aimBias;
    const ty = (state.y ?? 0) + (driving ? 1.5 : 1.55) + pitch * 0.6 + this.targetBias;

    const tLambda = 7.5;
    this.targetDesired.set(tx, ty, tz);
    if (this.initialised) {
      this.target.x = damp(this.target.x, tx, tLambda, dt);
      this.target.y = damp(this.target.y, ty, tLambda, dt);
      this.target.z = damp(this.target.z, tz, tLambda, dt);
    } else {
      this.target.copy(this.targetDesired);
    }

    if (this.shake > 0.001) {
      this.shake *= Math.exp(-4.5 * dt);
      this.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.position.y += (Math.random() - 0.5) * this.shake * 0.35;
    }

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.target);
    this.initialised = true;
  }

  /**
   * Snap straight to the ideal pose — used before the first rendered frame of a shot. The first
   * update with `initialised === false` copies the desired pose instead of damping toward it, which
   * is what makes a one-frame capture land exactly where the shot intends.
   */
  snap(state) {
    this.initialised = false;
    this.yaw = state.yaw + this.yawOffset;
    this.distance = (state.driving ? 9.0 + Math.min(3.0, Math.abs(state.speed ?? 0) * 0.1) : 5.6) + this.distanceBias;
    this.height = (state.driving ? 4.1 : 2.55) + this.heightBias;
    this.update(1 / 60, state);
  }
}
