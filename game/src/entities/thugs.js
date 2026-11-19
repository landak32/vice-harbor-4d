// Hostile crew for the story jobs: a few armed bodies that walk toward the player and fire. Built on
// the same Character rig as the player so they animate identically.
import { Character } from './character.js';
import { Rng } from '../core/rng.js';
import { wrapAngle } from '../core/math.js';

const JACKETS = [0x3a2f4a, 0x4a3a2a, 0x2a3a3a, 0x5a2a2a];

export class ThugCrew {
  constructor(scene, collision, effects, seed) {
    this.scene = scene;
    this.collision = collision;
    this.effects = effects;
    this.rng = new Rng(seed);
    this.members = [];
    this.onShoot = null;
  }

  spawn(x, z, count) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(3, 7);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const c = new Character(this.scene, {
        jacket: this.rng.pick(JACKETS),
        pants: 0x1e2229,
        skin: this.rng.pick([0xc98d63, 0x8a5a3b, 0xd7a67c]),
        simple: true,
      });
      c.setPosition(px, 0.19, pz, this.rng.range(0, 6.28));
      this.members.push({
        character: c, x: px, z: pz, yaw: 0, hp: 2, dead: false, deathT: 0,
        fireTimer: this.rng.range(0.6, 2.2), hitFlash: 0,
      });
    }
  }

  update(dt, player) {
    for (const m of this.members) {
      if (m.dead) {
        m.deathT += dt;
        m.character.animate(dt, 'dead', 0, 0);
        continue;
      }
      const dx = player.x - m.x;
      const dz = player.z - m.z;
      const d = Math.hypot(dx, dz);
      m.yaw = Math.atan2(dx, dz);
      if (d > 8) {
        const nx = m.x + (dx / d) * 2.6 * dt;
        const nz = m.z + (dz / d) * 2.6 * dt;
        const res = this.collision.resolve(nx, nz, 0.42);
        m.x = res.x;
        m.z = res.z;
        m.character.animate(dt, 'walk', 2.6, 0);
      } else {
        m.character.animate(dt, 'idle', 0, 1);
      }
      m.character.setPosition(m.x, 0.19, m.z, m.yaw);
      m.fireTimer -= dt;
      if (m.fireTimer <= 0 && d < 22) {
        m.fireTimer = this.rng.range(0.9, 2.0);
        if (this.onShoot) this.onShoot(m);
      }
      m.hitFlash = Math.max(0, m.hitFlash - dt * 3);
    }
  }

  /** Player fires: hit the closest standing member in the aim cone. */
  shootAt(x, z, dirX, dirZ, range = 34) {
    let best = null;
    let bestDot = 0.93;
    for (const m of this.members) {
      if (m.dead) continue;
      const dx = m.x - x;
      const dz = m.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.4) continue;
      const dot = (dx / d) * dirX + (dz / d) * dirZ;
      if (dot > bestDot) {
        bestDot = dot;
        best = m;
      }
    }
    if (best) {
      best.hp -= 1;
      best.hitFlash = 0.4;
      if (best.hp <= 0) best.dead = true;
      return best;
    }
    return null;
  }

  get alive() {
    return this.members.filter((m) => !m.dead).length;
  }

  get downCount() {
    return this.members.filter((m) => m.dead).length;
  }

  clear() {
    for (const m of this.members) this.scene.remove(m.character.group);
    this.members.length = 0;
  }

  /** Target list for the weapon raycaster. */
  targets() {
    return this.members
      .filter((m) => !m.dead)
      .map((m) => ({ x: m.x, z: m.z, y: 1.15, radius: 0.5, ref: m, kind: 'thug' }));
  }
}
