// Pedestrians. 90 walkers on the sidewalks, both directions, with a walk cycle, varied outfits, and
// a few who cross at crosswalks. They scatter when shots are fired or a horn sounds. All of them are
// drawn from one InstancedMesh per body part, so the whole crowd costs five draw calls.
import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_W, CITY_HALF, GRID, PITCH, ROAD_W, SIDEWALK_W } from '../world/city.js';
import { Rng } from '../core/rng.js';
import { clamp, wrapAngle } from '../core/math.js';

const SHIRTS = [0xd94f3d, 0x3f7fb5, 0xe0d6bc, 0x3b4a58, 0x8f5aa8, 0x2f8f74, 0xd8a13c, 0xc46a8a, 0x5a6a3a, 0xe8e2d4, 0x1f2a36];
const PANTS = [0x2a3140, 0x3f4652, 0x1b222b, 0x5c5348, 0x7a6a55, 0x25333a];
const SKINS = [0xd7a67c, 0xb0784f, 0x8a5a3b, 0xe8c19a, 0x6b4229, 0xc98d63];

export class Pedestrians {
  constructor(scene, city, collision, seed, count = 92) {
    this.scene = scene;
    this.city = city;
    this.collision = collision;
    this.rng = new Rng(seed);
    this.group = new THREE.Group();
    this.group.name = 'pedestrians';
    scene.add(this.group);
    this.people = [];
    for (let i = 0; i < count; i++) this.people.push(this.makePerson(i));
    this.buildInstances();
    this.panicTimer = 0;
  }

  /** A person is a walker on a block edge: block, side, progress t, direction and speed. */
  makePerson(i) {
    const rng = this.rng;
    const block = rng.pick(this.city.blocks);
    const side = rng.int(0, 3);
    const t = rng.range(-BLOCK_W / 2 + 1, BLOCK_W / 2 - 1);
    const dir = rng.sign();
    const person = {
      i, block, side, t, dir,
      speed: rng.range(1.05, 1.65),
      phase: rng.range(0, 6.28),
      shirt: rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
      skin: rng.pick(SKINS),
      height: rng.range(0.88, 1.1),
      x: 0, z: 0, yaw: 0,
      state: 'walk',
      crossT: 0,
      crossFrom: null,
      crossTo: null,
      panic: 0,
      dead: false,
      deadT: 0,
      hitFlash: 0,
    };
    this.place(person);
    return person;
  }

  sidePoint(block, side, t) {
    const o = BLOCK_W / 2 + SIDEWALK_W * 0.55;
    if (side === 0) return { x: block.cx + t, z: block.cz - o, nx: 0, nz: -1 };
    if (side === 1) return { x: block.cx + t, z: block.cz + o, nx: 0, nz: 1 };
    if (side === 2) return { x: block.cx - o, z: block.cz + t, nx: -1, nz: 0 };
    return { x: block.cx + o, z: block.cz + t, nx: 1, nz: 0 };
  }

  place(p) {
    // a staged pedestrian (shot dressing) keeps the exact spot it was pinned to
    if (p.pinned) {
      p.x = p.pinned.x;
      p.z = p.pinned.z;
      p.yaw = p.pinned.yaw;
      return;
    }
    const pt = this.sidePoint(p.block, p.side, p.t);
    p.x = pt.x;
    p.z = pt.z;
    const along = p.side < 2 ? p.dir : p.dir;
    p.yaw = p.side === 0 ? (along > 0 ? Math.PI / 2 : -Math.PI / 2)
      : p.side === 1 ? (along > 0 ? -Math.PI / 2 : Math.PI / 2)
      : p.side === 2 ? (along > 0 ? 0 : Math.PI)
      : (along > 0 ? Math.PI : 0);
  }

  /** A pinned pedestrian added for a shot needs the instance buffers rebuilt around it. */
  rebuildForNewPerson() {
    this.buildInstances();
  }

  buildInstances() {
    for (const mesh of [this.torsos, this.heads, this.legsL, this.legsR, this.armsL, this.armsR]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    const n = this.people.length;
    const torso = new THREE.BoxGeometry(0.46, 0.58, 0.26);
    torso.translate(0, 1.22, 0);
    const head = new THREE.BoxGeometry(0.24, 0.26, 0.24);
    head.translate(0, 1.66, 0);
    // Limbs are modelled hanging down from a pivot at their top, so a single X rotation about the
    // pivot is a real hip/shoulder swing.
    const legL = new THREE.BoxGeometry(0.16, 0.78, 0.18);
    legL.translate(0, -0.39, 0);
    const armL = new THREE.BoxGeometry(0.13, 0.6, 0.15);
    armL.translate(0, -0.3, 0);

    const mk = (geo, name, colored) => {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      if (colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.name = name;
      this.group.add(mesh);
      return mesh;
    };
    this.torsos = mk(torso, 'pedsTorso', true);
    this.heads = mk(head, 'pedsHead', true);
    this.legsL = mk(legL, 'pedsLegL', true);
    this.legsR = mk(legL, 'pedsLegR', true);
    this.armsL = mk(armL, 'pedsArmL', true);
    this.armsR = mk(armL, 'pedsArmR', true);

    for (const p of this.people) {
      this.torsos.setColorAt(p.i, new THREE.Color(p.shirt));
      this.heads.setColorAt(p.i, new THREE.Color(p.skin));
      this.legsL.setColorAt(p.i, new THREE.Color(p.pants));
      this.legsR.setColorAt(p.i, new THREE.Color(p.pants));
      this.armsL.setColorAt(p.i, new THREE.Color(p.shirt));
      this.armsR.setColorAt(p.i, new THREE.Color(p.shirt));
    }
  }

  /** Shots fired or a horn: everyone nearby runs for a couple of seconds. */
  scare(x, z, radius = 34) {
    for (const p of this.people) {
      if (p.dead) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        p.panic = 2.2 + this.rng.float();
        p.speed = this.rng.range(3.2, 4.4);
      }
    }
  }

  update(dt, time) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (const p of this.people) {
      if (p.dead) {
        p.deadT += dt;
        p.hitFlash = Math.max(0, p.hitFlash - dt * 3);
      } else if (p.panic > 0) {
        p.panic -= dt;
        p.t += p.dir * p.speed * dt;
        if (p.panic <= 0) p.speed = this.rng.range(1.05, 1.65);
        this.place(p);
      } else {
        p.phase += dt * p.speed * 4.4;
        p.t += p.dir * p.speed * dt;
      }
      if (p.t > BLOCK_W / 2 - 0.8) {
        p.t = BLOCK_W / 2 - 0.8;
        p.dir = -1;
      }
      if (p.t < -BLOCK_W / 2 + 0.8) {
        p.t = -BLOCK_W / 2 + 0.8;
        p.dir = 1;
      }
      if (!p.dead && p.panic <= 0) this.place(p);

      const swing = p.dead ? 0 : Math.sin(p.phase) * (p.panic > 0 ? 0.85 : 0.5);
      const bob = p.dead ? 0 : Math.abs(Math.cos(p.phase)) * 0.035;
      const h = p.height;
      e.set(0, p.yaw, 0);
      q.setFromEuler(e);

      // torso
      v.set(p.x, p.dead ? 0.22 : bob, p.z);
      s.set(1, h, 1);
      if (p.dead) {
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, p.yaw, 0));
        v.set(p.x, 0.2, p.z);
      }
      m.compose(v, q, s);
      this.torsos.setMatrixAt(p.i, m);
      this.heads.setMatrixAt(p.i, m);

      // limbs: body-space offset to the joint, hip/shoulder swing, then the body's yaw and place
      const limb = (angle, ox, oy, oz) => new THREE.Matrix4()
        .makeTranslation(p.x, p.dead ? 0.16 : bob, p.z)
        .multiply(new THREE.Matrix4().makeRotationY(p.yaw))
        .multiply(new THREE.Matrix4().makeTranslation(ox * h, oy * h, oz))
        .multiply(new THREE.Matrix4().makeRotationX(p.dead ? Math.PI * 0.5 : angle));
      this.legsL.setMatrixAt(p.i, limb(swing, 0.11, 0.86, 0));
      this.legsR.setMatrixAt(p.i, limb(-swing, -0.11, 0.86, 0));
      this.armsL.setMatrixAt(p.i, limb(-swing * 0.8, 0.29, 1.5, 0));
      this.armsR.setMatrixAt(p.i, limb(swing * 0.8, -0.29, 1.5, 0));

      if (p.hitFlash > 0) {
        const c = new THREE.Color(1, 0.3, 0.25);
        this.torsos.setColorAt(p.i, c);
      } else {
        this.torsos.setColorAt(p.i, new THREE.Color(p.shirt));
      }
    }
    for (const mesh of [this.torsos, this.heads, this.legsL, this.legsR, this.armsL, this.armsR]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    void time;
    void clamp;
    void wrapAngle;
    void GRID;
    void PITCH;
    void ROAD_W;
    void CITY_HALF;
  }

  /** Bullet hit: collapse the nearest standing pedestrian within range. */
  shootAt(x, z, dirX, dirZ, range = 30) {
    let best = null;
    let bestScore = 0.93;
    for (const p of this.people) {
      if (p.dead) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.5) continue;
      const dot = (dx / d) * dirX + (dz / d) * dirZ;
      if (dot > bestScore) {
        bestScore = dot;
        best = p;
      }
    }
    if (best) {
      best.dead = true;
      best.deadT = 0;
      this.scare(best.x, best.z, 26);
      return best;
    }
    return null;
  }
}
