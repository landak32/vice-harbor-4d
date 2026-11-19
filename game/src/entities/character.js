// The player character: a low-poly humanoid built from boxes with a rig of joint groups, so the
// walk cycle, idle breathing, aim pose and driving pose are all rotations of real pivots.
import * as THREE from '../../vendor/three.module.min.js';

import { GeoBuilder } from '../world/merge.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color });

/** One vertex-coloured material for the whole character: fewer draw calls per body. */
let bodyMaterialCache = null;
function bodyMaterial() {
  if (!bodyMaterialCache) bodyMaterialCache = new THREE.MeshLambertMaterial({ vertexColors: true });
  return bodyMaterialCache;
}

const hexRgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** A box mesh whose colour comes from vertex colours, so several parts merge into one mesh. */
function mergedBoxes(parts) {
  const b = new GeoBuilder();
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d);
    const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
    b.add(g, m, hexRgb(p.color));
  }
  const mesh = new THREE.Mesh(b.build(), bodyMaterial());
  mesh.castShadow = true;
  return mesh;
}

export class Character {
  constructor(scene, opts = {}) {
    const jacket = opts.jacket ?? 0xe8563f;
    const pants = opts.pants ?? 0x27303d;
    const skin = opts.skin ?? 0xc98d63;
    const hair = opts.hair ?? 0x1b1512;
    this.colors = { jacket, pants, skin, hair };

    this.group = new THREE.Group();
    this.group.name = 'playerCharacter';
    scene.add(this.group);

    this.materials = {
      jacket: mat(jacket), pants: mat(pants), skin: mat(skin), hair: mat(hair),
      shoe: mat(0x14161a), shirt: mat(0xf1e6d2), eye: mat(0x101418),
    };

    this.root = new THREE.Group();
    this.root.position.y = 0;
    this.group.add(this.root);

    // hips + torso
    this.hips = new THREE.Group();
    this.hips.position.y = 0.9;
    this.root.add(this.hips);
    this.hips.add(mergedBoxes([
      { w: 0.4, h: 0.24, d: 0.26, x: 0, y: 0, z: 0, color: pants },
      ...(opts.simple ? [] : [{ w: 0.1, h: 0.2, d: 0.14, x: 0.22, y: -0.02, z: 0.06, color: 0x2b2320 }]),
    ]));

    this.torso = new THREE.Group();
    this.torso.position.y = 0.14;
    this.hips.add(this.torso);
    this.torso.add(mergedBoxes([
      { w: 0.5, h: 0.56, d: 0.3, x: 0, y: 0.3, z: 0, color: jacket },
      { w: 0.22, h: 0.5, d: 0.31, x: 0, y: 0.3, z: 0.005, color: 0xf1e6d2 },
      { w: 0.34, h: 0.1, d: 0.32, x: 0, y: 0.6, z: 0, color: jacket },
      ...(opts.simple ? [] : [{ w: 0.26, h: 0.2, d: 0.12, x: 0.2, y: 0.16, z: -0.16, color: 0x8a6a3e }]),
    ]));

    // head
    this.neck = new THREE.Group();
    this.neck.position.y = 0.62;
    this.torso.add(this.neck);
    this.neck.add(mergedBoxes([
      { w: 0.25, h: 0.28, d: 0.25, x: 0, y: 0.16, z: 0, color: skin },
      { w: 0.27, h: 0.1, d: 0.27, x: 0, y: 0.3, z: 0, color: hair },
      { w: 0.27, h: 0.16, d: 0.08, x: 0, y: 0.22, z: -0.12, color: hair },
      { w: 0.06, h: 0.07, d: 0.06, x: 0, y: 0.16, z: 0.14, color: skin },
      { w: 0.045, h: 0.035, d: 0.02, x: -0.06, y: 0.19, z: 0.126, color: 0x101418 },
      { w: 0.045, h: 0.035, d: 0.02, x: 0.06, y: 0.19, z: 0.126, color: 0x101418 },
    ]));

    // arms: shoulder pivot -> upper arm -> forearm -> hand
    const buildArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.33, 0.5, 0);
      this.torso.add(shoulder);
      shoulder.add(mergedBoxes([{ w: 0.15, h: 0.34, d: 0.17, x: 0, y: -0.17, z: 0, color: jacket }]));
      const elbow = new THREE.Group();
      elbow.position.y = -0.34;
      shoulder.add(elbow);
      elbow.add(mergedBoxes([
        { w: 0.13, h: 0.32, d: 0.14, x: 0, y: -0.16, z: 0, color: jacket },
        { w: 0.12, h: 0.13, d: 0.13, x: 0, y: -0.36, z: 0, color: skin },
      ]));
      return { shoulder, elbow };
    };
    this.armL = buildArm(-1);
    this.armR = buildArm(1);

    // legs: hip pivot -> thigh -> shin -> shoe
    const buildLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.13, -0.05, 0);
      this.hips.add(hip);
      hip.add(mergedBoxes([{ w: 0.18, h: 0.44, d: 0.2, x: 0, y: -0.22, z: 0, color: pants }]));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      knee.add(mergedBoxes([
        { w: 0.16, h: 0.4, d: 0.18, x: 0, y: -0.2, z: 0, color: pants },
        { w: 0.18, h: 0.1, d: 0.28, x: 0, y: -0.42, z: 0.04, color: 0x14161a },
      ]));
      return { hip, knee };
    };
    this.legL = buildLeg(-1);
    this.legR = buildLeg(1);

    // a holstered pistol and a shoulder bag (skipped on crowd NPCs) give the silhouette character

    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    this.mode = 'idle';
    this.phase = 0;
    this.time = 0;
    this.aim = 0;
    this.dead = false;
  }

  setPosition(x, y, z, yaw) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
  }

  setJacket(color) {
    this.materials.jacket.color.set(color);
  }

  /** mode: idle | walk | run | drive | aim | dead */
  animate(dt, mode, speed = 0, aim = 0) {
    this.time += dt;
    this.mode = mode;
    this.aim = aim;
    const t = this.time;
    const swing = Math.min(1, speed / 4.2);
    this.phase += dt * (mode === 'run' ? 9.5 : 6.4) * (0.35 + swing);

    // reset the pose each frame so modes never blend into garbage
    this.root.position.y = 0;
    this.root.rotation.set(0, 0, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.armL.shoulder.rotation.set(0, 0, 0.06);
    this.armR.shoulder.rotation.set(0, 0, -0.06);
    this.armL.elbow.rotation.set(0.15, 0, 0);
    this.armR.elbow.rotation.set(0.15, 0, 0);
    this.legL.hip.rotation.set(0, 0, 0);
    this.legR.hip.rotation.set(0, 0, 0);
    this.legL.knee.rotation.set(0, 0, 0);
    this.legR.knee.rotation.set(0, 0, 0);

    if (mode === 'walk' || mode === 'run') {
      const amp = mode === 'run' ? 0.95 : 0.55;
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      this.legL.hip.rotation.x = s * amp;
      this.legR.hip.rotation.x = -s * amp;
      this.legL.knee.rotation.x = Math.max(0, -s) * amp * 1.25;
      this.legR.knee.rotation.x = Math.max(0, s) * amp * 1.25;
      this.armL.shoulder.rotation.x = -s * amp * 0.85;
      this.armR.shoulder.rotation.x = s * amp * 0.85;
      this.armL.elbow.rotation.x = 0.2 + Math.max(0, -s) * 0.5;
      this.armR.elbow.rotation.x = 0.2 + Math.max(0, s) * 0.5;
      this.root.position.y = Math.abs(c) * (mode === 'run' ? 0.075 : 0.035);
      this.hips.rotation.y = s * 0.09;
      this.torso.rotation.y = -s * 0.12;
      this.torso.rotation.x = mode === 'run' ? 0.16 : 0.04;
      this.neck.rotation.x = -this.torso.rotation.x * 0.6;
    } else if (mode === 'idle') {
      const breath = Math.sin(t * 1.7);
      this.torso.position.y = 0.14 + breath * 0.008;
      this.torso.rotation.x = breath * 0.012;
      this.armL.shoulder.rotation.z = 0.08 + breath * 0.01;
      this.armR.shoulder.rotation.z = -0.08 - breath * 0.01;
      this.armL.shoulder.rotation.x = -0.04;
      this.armR.shoulder.rotation.x = -0.04;
      this.neck.rotation.y = Math.sin(t * 0.5) * 0.12;
    } else if (mode === 'drive') {
      this.root.position.y = -0.42;
      this.hips.rotation.x = 0.06;
      this.legL.hip.rotation.x = -1.32;
      this.legR.hip.rotation.x = -1.24;
      this.legL.knee.rotation.x = 1.05;
      this.legR.knee.rotation.x = 0.95;
      this.legL.hip.rotation.z = -0.1;
      this.legR.hip.rotation.z = 0.1;
      this.armL.shoulder.rotation.x = -1.16;
      this.armR.shoulder.rotation.x = -1.16;
      this.armL.shoulder.rotation.z = 0.18;
      this.armR.shoulder.rotation.z = -0.18;
      this.armL.elbow.rotation.x = 0.55;
      this.armR.elbow.rotation.x = 0.55;
      this.torso.rotation.x = 0.06;
    } else if (mode === 'dead') {
      this.root.rotation.x = -Math.PI / 2;
      this.root.position.y = 0.24;
      this.armL.shoulder.rotation.x = -0.5;
      this.armR.shoulder.rotation.x = 0.5;
      this.legL.hip.rotation.x = 0.2;
      this.legR.hip.rotation.x = -0.2;
    }

    if (aim > 0.01 && mode !== 'drive') {
      // right arm points where the weapon points, torso twists slightly into the shot
      this.armR.shoulder.rotation.x = -1.5 * aim;
      this.armR.shoulder.rotation.z = -0.12 * aim;
      this.armR.elbow.rotation.x = 0.1;
      this.armL.shoulder.rotation.x = -0.85 * aim;
      this.armL.elbow.rotation.x = 0.9 * aim;
      this.torso.rotation.y = -0.25 * aim;
      this.neck.rotation.y = 0.12 * aim;
    }
  }

  /** World-space muzzle point in front of the right hand. */
  muzzlePoint(out) {
    out.set(0.28, 1.25, 0.5);
    this.group.localToWorld(out);
    return out;
  }
}
