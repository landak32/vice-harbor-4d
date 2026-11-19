// Weapons and gunplay: fists, pistol, SMG and shotgun, each with its own rate, spread, damage and
// reload. Firing spawns tracers, muzzle flash, impact sparks and a hit reaction on whatever it hits.
import * as THREE from '../../vendor/three.module.min.js';
import { clamp } from '../core/math.js';

export const WEAPONS = {
  fists: { name: 'Fists', rate: 0.42, spread: 0.0, damage: 1, ammo: Infinity, mag: Infinity, range: 2.2, melee: true, sound: 'punch' },
  pistol: { name: 'Pistol', rate: 0.22, spread: 0.022, damage: 1, ammo: 12, mag: 12, range: 55, reload: 1.35, sound: 'pistol' },
  smg: { name: 'SMG', rate: 0.075, spread: 0.045, damage: 1, ammo: 30, mag: 30, range: 48, reload: 1.8, sound: 'smg' },
  shotgun: { name: 'Shotgun', rate: 0.78, spread: 0.11, damage: 3, ammo: 6, mag: 6, range: 26, reload: 2.2, sound: 'shotgun', pellets: 7 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export class WeaponSystem {
  constructor(effects, audio) {
    this.effects = effects;
    this.audio = audio;
    this.current = 'fists';
    this.ammo = { pistol: 12, smg: 30, shotgun: 6 };
    this.reserve = { pistol: 84, smg: 120, shotgun: 24 };
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.shotsFired = 0;
    this.tracers = 0;
  }

  get spec() {
    return WEAPONS[this.current];
  }

  cycle() {
    const i = WEAPON_ORDER.indexOf(this.current);
    this.current = WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length];
    this.reloadTimer = 0;
    return this.current;
  }

  select(name) {
    if (WEAPON_ORDER.includes(name)) this.current = name;
  }

  canFire() {
    return this.cooldown <= 0 && this.reloadTimer <= 0;
  }

  startReload() {
    const w = this.spec;
    if (w.melee || this.reloadTimer > 0) return;
    if (this.ammo[this.current] >= w.mag) return;
    if ((this.reserve[this.current] ?? 0) <= 0) return;
    this.reloadTimer = w.reload ?? 1.4;
    if (this.audio) this.audio.play('reload');
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.spec;
        const need = w.mag - this.ammo[this.current];
        const take = Math.min(need, this.reserve[this.current] ?? 0);
        this.ammo[this.current] += take;
        this.reserve[this.current] -= take;
      }
    }
  }

  /**
   * Fire once. Returns a list of hit descriptors the game applies to its NPCs, or null when the
   * trigger click did nothing (cooling down, reloading or empty).
   */
  fire(origin, yaw, targets) {
    if (!this.canFire()) return null;
    const w = this.spec;
    if (!w.melee) {
      if (this.ammo[this.current] <= 0) {
        this.startReload();
        return null;
      }
      this.ammo[this.current] -= 1;
    }
    this.cooldown = w.rate;
    this.shotsFired++;
    this.recoil = 1;
    if (this.audio) this.audio.play(w.sound);

    const pellets = w.pellets ?? 1;
    const hits = [];
    for (let p = 0; p < pellets; p++) {
      const spreadX = (Math.random() - 0.5) * w.spread * 2;
      const spreadY = (Math.random() - 0.5) * w.spread;
      const dirX = Math.sin(yaw + spreadX);
      const dirZ = Math.cos(yaw + spreadX);
      const end = {
        x: origin.x + dirX * w.range,
        y: origin.y + spreadY * w.range,
        z: origin.z + dirZ * w.range,
      };
      const hit = pickTarget(origin, dirX, dirZ, w.range, targets);
      if (hit) {
        end.x = hit.x;
        end.y = hit.y;
        end.z = hit.z;
        hits.push(hit);
        this.effects.sparks({ x: hit.x, y: hit.y, z: hit.z }, { x: -dirX, y: 0.3, z: -dirZ }, 5);
      }
      if (!w.melee) {
        this.effects.tracer(origin, end, w.name === 'Shotgun' ? [1, 0.7, 0.35] : [1, 0.9, 0.6]);
        this.tracers++;
      }
      this.effects.muzzleFlash(origin, { x: dirX, z: dirZ });
    }
    return hits;
  }
}

/** Ray-vs-capsule-ish test against a list of {x, z, y, radius, ref}. */
export function pickTarget(origin, dirX, dirZ, range, targets) {
  let best = null;
  let bestDist = range;
  for (const t of targets) {
    const dx = t.x - origin.x;
    const dz = t.z - origin.z;
    const along = dx * dirX + dz * dirZ;
    if (along < 0.2 || along > bestDist) continue;
    const perp = Math.abs(dx * dirZ - dz * dirX);
    const radius = t.radius ?? 0.55;
    if (perp > radius) continue;
    bestDist = along;
    best = { x: t.x, y: t.y ?? 1.1, z: t.z, dist: along, ref: t.ref, kind: t.kind };
  }
  return best;
}

/** A visible gun in the character's right hand: small boxes, swapped per weapon. */
export class WeaponModel {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.position.set(0.3, 1.06, 0.24);
    parent.add(this.group);
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
    const steel = new THREE.MeshLambertMaterial({ color: 0x4b5158 });

    this.pistol = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), steel);
    slide.position.set(0, 0.02, 0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), dark);
    grip.position.set(0, -0.11, -0.02);
    grip.rotation.x = 0.25;
    this.pistol.add(slide, grip);

    this.smg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), dark);
    body.position.set(0, 0, 0.12);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.09), steel);
    mag.position.set(0, -0.16, 0.06);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), dark);
    stock.position.set(0, 0.02, -0.18);
    this.smg.add(body, mag, stock);

    this.shotgun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.86), steel);
    barrel.position.set(0, 0.03, 0.3);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.22), dark);
    pump.position.set(0, -0.03, 0.24);
    const stockG = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0x5a3c22 }));
    stockG.position.set(0, -0.03, -0.2);
    this.shotgun.add(barrel, pump, stockG);

    this.models = { pistol: this.pistol, smg: this.smg, shotgun: this.shotgun };
    for (const m of Object.values(this.models)) {
      m.visible = false;
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(m);
    }
    this.current = 'fists';
  }

  setWeapon(name) {
    this.current = name;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === name;
    this.group.visible = name !== 'fists';
  }

  /** Recoil kick, applied by the character's animation each frame. */
  applyRecoil(amount) {
    this.group.position.z = 0.24 - amount * 0.12;
    this.group.rotation.x = -amount * 0.28;
  }
}

/** Spread the damage of a hit over an NPC's health and return whether it died. */
export function applyDamage(entity, amount) {
  entity.hp = (entity.hp ?? 3) - amount;
  entity.hitFlash = 0.35;
  return entity.hp <= 0;
}

export const clampDamage = (v) => clamp(v, 0, 100);
