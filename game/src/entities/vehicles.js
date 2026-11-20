// Vehicles: eight procedural car types built from boxes, with spinning and steering wheels, lit
// headlights, brake lights and a damage pass. Traffic instances the same geometry; the player and
// the police drive full objects with their own wheels and light bars.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from '../world/merge.js';
import { glowTexture } from '../render/textures.js';

export const CAR_TYPES = {
  sedan: { name: 'Meridian 440', L: 4.5, W: 1.84, H: 1.42, cabinL: 2.15, cabinH: 0.6, cabinZ: -0.12, accel: 15, top: 40, grip: 6.5, mass: 1 },
  coupe: { name: 'Sable GT', L: 4.42, W: 1.9, H: 1.24, cabinL: 1.85, cabinH: 0.5, cabinZ: -0.2, accel: 17, top: 45, grip: 6.9, mass: 0.95 },
  van: { name: 'Harbor Hauler', L: 5.35, W: 2.02, H: 2.14, cabinL: 3.6, cabinH: 1.0, cabinZ: -0.35, accel: 11, top: 30, grip: 5.2, mass: 1.5 },
  pickup: { name: 'Dune Ranger', L: 5.1, W: 1.96, H: 1.66, cabinL: 1.9, cabinH: 0.62, cabinZ: 0.25, accel: 13, top: 36, grip: 5.8, mass: 1.25 },
  taxi: { name: 'Checker Cab', L: 4.62, W: 1.86, H: 1.5, cabinL: 2.3, cabinH: 0.66, cabinZ: -0.05, accel: 14, top: 38, grip: 6.4, mass: 1.05, taxi: true },
  bus: { name: 'Loop Line 7', L: 10.8, W: 2.5, H: 3.0, cabinL: 8.6, cabinH: 1.35, cabinZ: -0.3, accel: 8, top: 24, grip: 4.6, mass: 3 },
  police: { name: 'Patrol 12', L: 4.72, W: 1.92, H: 1.5, cabinL: 2.3, cabinH: 0.62, cabinZ: -0.1, accel: 19, top: 48, grip: 7.2, mass: 1.1, lightbar: true },
  sports: { name: 'Vice R9', L: 4.24, W: 1.98, H: 1.12, cabinL: 1.7, cabinH: 0.44, cabinZ: -0.28, accel: 21, top: 54, grip: 7.6, mass: 0.9 },
};

export const CAR_COLORS = [
  0xb8443c, 0x2f5f8a, 0xdedad0, 0x2b2f36, 0x8b8f96, 0x2f7f66, 0xc9a13a,
  0x6b3f78, 0x1f4b5e, 0xd08a4a, 0x93352f, 0xcfd3d8, 0x3c4a2f,
];

const GLASS = [0.09, 0.12, 0.16];
const DARK = [0.12, 0.13, 0.15];
const CHROME = [0.62, 0.64, 0.66];
const WHITE = [0.93, 0.93, 0.93];
const LAMP = [1.0, 0.95, 0.82];
const TAIL = [0.55, 0.07, 0.06];

// One body per type, built on first use and shared by traffic, player and police afterwards.
const geoCache = new Map();

/** Body shell (no wheels) in vertex colours; body panels are near-white so a paint tint shows. */
export function carGeometry(typeKey) {
  if (geoCache.has(typeKey)) return geoCache.get(typeKey);
  const t = CAR_TYPES[typeKey];
  const g = new GeoBuilder();
  const L = t.L, W = t.W, H = t.H;
  const bodyH = H * 0.4;
  const bodyY = 0.34 + bodyH / 2;
  // main body
  g.box(0, bodyY, 0, W, bodyH, L, { color: WHITE, uvScale: 2, vScale: 2 });
  // hood and boot shoulders
  g.box(0, bodyY + bodyH * 0.42, L * 0.34, W * 0.96, bodyH * 0.3, L * 0.3, { color: WHITE, uvScale: 2, vScale: 2 });
  g.box(0, bodyY + bodyH * 0.42, -L * 0.36, W * 0.96, bodyH * 0.26, L * 0.26, { color: WHITE, uvScale: 2, vScale: 2 });
  // cabin
  const cabinY = bodyY + bodyH / 2 + t.cabinH / 2;
  const cabW = W * 0.86;
  g.box(0, cabinY, t.cabinZ, cabW, t.cabinH, t.cabinL, { color: WHITE, uvScale: 2, vScale: 2 });
  // glass band slightly proud of the cabin so it reads as windows
  g.box(0, cabinY + t.cabinH * 0.06, t.cabinZ, cabW + 0.02, t.cabinH * 0.62, t.cabinL * 0.96, { color: GLASS, uvScale: 2, vScale: 2 });
  if (typeKey === 'bus') {
    // window strip down the sides and a door
    for (const sx of [-1, 1]) {
      g.box(sx * (W / 2 - 0.02), cabinY + 0.1, t.cabinZ, 0.06, 1.0, t.cabinL * 0.94, { color: GLASS, uvScale: 2, vScale: 2 });
    }
    g.box(W / 2 - 0.02, 1.1, L * 0.32, 0.06, 1.9, 1.1, { color: DARK, uvScale: 1, vScale: 1 });
  }
  if (typeKey === 'pickup') {
    // open bed: walls around a dark floor
    g.box(0, bodyY + bodyH * 0.5, -L * 0.3, W * 0.92, 0.1, L * 0.34, { color: DARK, uvScale: 1, vScale: 1 });
    for (const sx of [-1, 1]) g.box(sx * (W * 0.45), bodyY + bodyH * 0.62, -L * 0.3, 0.1, 0.34, L * 0.34, { color: WHITE, uvScale: 1, vScale: 1 });
    g.box(0, bodyY + bodyH * 0.62, -L * 0.47, W * 0.92, 0.34, 0.1, { color: WHITE, uvScale: 1, vScale: 1 });
  }
  // bumpers and grille
  g.box(0, bodyY - 0.06, L / 2 - 0.04, W * 0.98, 0.2, 0.14, { color: DARK, uvScale: 1, vScale: 1 });
  g.box(0, bodyY - 0.06, -L / 2 + 0.04, W * 0.98, 0.2, 0.14, { color: DARK, uvScale: 1, vScale: 1 });
  g.box(0, bodyY + 0.06, L / 2 - 0.02, W * 0.55, 0.16, 0.1, { color: DARK, uvScale: 1, vScale: 1 });
  // lights
  for (const sx of [-1, 1]) {
    g.box(sx * W * 0.33, bodyY + 0.1, L / 2 - 0.01, W * 0.22, 0.13, 0.08, { color: LAMP, uvScale: 1, vScale: 1 });
    g.box(sx * W * 0.33, bodyY + 0.1, -L / 2 + 0.01, W * 0.22, 0.13, 0.08, { color: TAIL, uvScale: 1, vScale: 1 });
    // mirrors
    g.box(sx * (W / 2 + 0.09), cabinY - t.cabinH * 0.1, t.cabinZ + t.cabinL * 0.42, 0.16, 0.1, 0.1, { color: DARK, uvScale: 1, vScale: 1 });
  }
  // side trim line
  g.box(0, bodyY - 0.02, 0, W + 0.02, 0.05, L * 0.92, { color: CHROME, uvScale: 1, vScale: 1 });
  if (t.taxi) {
    g.box(0, cabinY + t.cabinH / 2 + 0.13, t.cabinZ, 0.7, 0.26, 0.36, { color: [1.0, 0.86, 0.4], uvScale: 1, vScale: 1 });
  }
  if (t.lightbar) {
    // white doors and a roof bar: an unmarked black car does not read as a cruiser at 20 m
    for (const sx of [-1, 1]) {
      g.box(sx * (W / 2 + 0.01), bodyY + 0.06, -0.1, 0.04, bodyH * 0.62, L * 0.34, { color: WHITE, uvScale: 1, vScale: 1 });
    }
    g.box(0, cabinY + t.cabinH / 2 + 0.1, t.cabinZ - 0.2, 1.1, 0.16, 0.3, { color: DARK, uvScale: 1, vScale: 1 });
    g.box(-0.26, cabinY + t.cabinH / 2 + 0.2, t.cabinZ - 0.2, 0.42, 0.12, 0.26, { color: [0.15, 0.3, 1.0], uvScale: 1, vScale: 1 });
    g.box(0.26, cabinY + t.cabinH / 2 + 0.2, t.cabinZ - 0.2, 0.42, 0.12, 0.26, { color: [1.0, 0.15, 0.12], uvScale: 1, vScale: 1 });
  }
  // exhaust
  g.box(W * 0.3, 0.24, -L / 2 - 0.02, 0.12, 0.1, 0.12, { color: CHROME, uvScale: 1, vScale: 1 });

  const geo = g.build();
  geoCache.set(typeKey, geo);
  return geo;
}

const detailCache = new Map();

/**
 * Bolt-on trim that is too fine for the shell geometry: a spoiler on the fast cars, a plate and a
 * light bar on the boot, skirts down the sills. Kept in its own mesh so the paint tint on the shell
 * does not wash the trim out.
 */
export function carDetailGeometry(typeKey) {
  if (detailCache.has(typeKey)) return detailCache.get(typeKey);
  const t = CAR_TYPES[typeKey];
  const g = new GeoBuilder();
  const L = t.L, W = t.W, H = t.H;
  const bodyH = H * 0.4;
  const bodyY = 0.34 + bodyH / 2;
  const bootY = bodyY + bodyH * 0.42;
  const fast = typeKey === 'sports' || typeKey === 'coupe' || typeKey === 'police';
  const cabinY = bodyY + bodyH / 2 + t.cabinH / 2;

  // plate and its lamp, low on the boot
  g.box(0, bodyY - 0.02, -L / 2 - 0.015, W * 0.3, 0.17, 0.03, { color: [0.86, 0.88, 0.82], uvScale: 1, vScale: 1 });
  g.box(0, bodyY + 0.09, -L / 2 - 0.01, W * 0.16, 0.05, 0.03, { color: [0.55, 0.58, 0.6], uvScale: 1, vScale: 1 });

  // a light bar across the boot ties the two tail lamps together and gives the rear a horizon
  g.box(0, bodyY + 0.1, -L / 2 - 0.005, W * 0.78, 0.055, 0.03, { color: [0.42, 0.05, 0.05], uvScale: 1, vScale: 1 });

  // sills
  for (const sx of [-1, 1]) {
    g.box(sx * (W / 2 + 0.01), bodyY - 0.13, 0, 0.05, 0.1, L * 0.62, { color: [0.1, 0.11, 0.13], uvScale: 1, vScale: 1 });
  }

  if (fast) {
    // boot spoiler on two stalks
    const sy = bootY + bodyH * 0.16 + 0.2;
    g.box(0, sy, -L * 0.44, W * 0.86, 0.05, 0.28, { color: [0.1, 0.11, 0.13], uvScale: 1, vScale: 1 });
    for (const sx of [-1, 1]) {
      g.box(sx * W * 0.3, sy - 0.1, -L * 0.44, 0.07, 0.2, 0.2, { color: [0.1, 0.11, 0.13], uvScale: 1, vScale: 1 });
    }
    // twin exhausts
    for (const sx of [-1, 1]) {
      g.box(sx * W * 0.22, 0.24, -L / 2 - 0.04, 0.13, 0.1, 0.1, { color: [0.62, 0.64, 0.66], uvScale: 1, vScale: 1 });
    }
  }

  // a shark fin aerial: it reads at any distance and costs one box
  g.box(0, cabinY + t.cabinH * 0.62, t.cabinZ - t.cabinL * 0.34, 0.05, 0.14, 0.3, { color: [0.1, 0.11, 0.13], uvScale: 1, vScale: 1 });

  const geo = g.build();
  detailCache.set(typeKey, geo);
  return geo;
}

let detailMatCache = null;
export function carDetailMaterial() {
  if (!detailMatCache) detailMatCache = new THREE.MeshLambertMaterial({ vertexColors: true });
  return detailMatCache;
}

let wheelGeoCache = null;
/** Tyre plus a lighter hub disc, merged into one geometry with vertex colours. */
export function wheelGeometry(radius = 0.34, width = 0.24) {
  if (!wheelGeoCache) {
    const b = new GeoBuilder();
    const tyre = new THREE.CylinderGeometry(radius, radius, width, 10, 1).rotateZ(Math.PI / 2);
    b.add(tyre, new THREE.Matrix4(), [0.09, 0.1, 0.11]);
    const hub = new THREE.CylinderGeometry(radius * 0.46, radius * 0.46, width * 1.06, 8).rotateZ(Math.PI / 2);
    b.add(hub, new THREE.Matrix4(), [0.62, 0.65, 0.68]);
    wheelGeoCache = b.build();
  }
  return wheelGeoCache;
}

let wheelMatCache = null;
export function wheelMaterial() {
  if (!wheelMatCache) wheelMatCache = new THREE.MeshLambertMaterial({ vertexColors: true });
  return wheelMatCache;
}

/** Wheel positions for a type, in body space. */
export function wheelOffsets(typeKey) {
  const t = CAR_TYPES[typeKey];
  const track = t.W / 2 - 0.08;
  const front = t.L * 0.31;
  const rear = -t.L * 0.32;
  return [
    { x: -track, z: front, front: true }, { x: track, z: front, front: true },
    { x: -track, z: rear, front: false }, { x: track, z: rear, front: false },
  ];
}

export class Vehicle {
  constructor(scene, typeKey, colorHex, opts = {}) {
    this.type = typeKey;
    this.spec = CAR_TYPES[typeKey];
    this.color = new THREE.Color(colorHex);
    this.group = new THREE.Group();
    this.group.name = `vehicle_${typeKey}`;
    scene.add(this.group);

    this.bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, color: this.color.clone() });
    this.body = new THREE.Mesh(carGeometry(typeKey), this.bodyMaterial);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);

    this.details = new THREE.Mesh(carDetailGeometry(typeKey), carDetailMaterial());
    this.details.castShadow = true;
    this.group.add(this.details);

    this.wheels = [];
    const wm = wheelMaterial();
    for (const o of wheelOffsets(typeKey)) {
      const pivot = new THREE.Group();
      pivot.position.set(o.x, 0.34, o.z);
      const spin = new THREE.Group();
      // tyre and rim share one mesh: they spin together, so a second draw call buys nothing
      const wheel = new THREE.Mesh(wheelGeometry(), wm);
      wheel.castShadow = true;
      spin.add(wheel);
      pivot.add(spin);
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, front: o.front, side: Math.sign(o.x) });
    }

    // headlight beams and glows
    const glow = glowTexture('255,255,240', '255,214,150');
    this.lightMaterial = new THREE.MeshBasicMaterial({
      map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      toneMapped: false,
    });
    this.headGlows = [];
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), this.lightMaterial);
      s.position.set(sx * this.spec.W * 0.33, 0.52, this.spec.L / 2 + 0.05);
      this.group.add(s);
      this.headGlows.push(s);
    }
    this.beamMaterial = new THREE.MeshBasicMaterial({
      map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.PlaneGeometry(3.4, 12);
    beamGeo.rotateX(-Math.PI / 2);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(beamGeo, this.beamMaterial);
      b.position.set(sx * this.spec.W * 0.3, 0.06, this.spec.L / 2 + 6.4);
      this.group.add(b);
    }
    this.tailMaterial = new THREE.MeshBasicMaterial({
      map: glow, transparent: true, opacity: 0.35, color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tailGlows = [];
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), this.tailMaterial);
      s.position.set(sx * this.spec.W * 0.33, 0.52, -this.spec.L / 2 - 0.05);
      this.group.add(s);
      this.tailGlows.push(s);
    }

    this.police = !!opts.police;
    if (this.police) {
      this.sirenMaterialA = new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 1 });
      this.sirenMaterialB = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 1 });
      const barY = 0.34 + this.spec.H * 0.4 + this.spec.cabinH + 0.1;
      this.sirenMaterialA.toneMapped = false;
      this.sirenMaterialB.toneMapped = false;
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.3, 0.44), this.sirenMaterialA);
      a.position.set(-0.6, barY + 0.2, this.spec.cabinZ - 0.2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.3, 0.44), this.sirenMaterialB);
      b.position.set(0.6, barY + 0.2, this.spec.cabinZ - 0.2);
      this.group.add(a, b);
      this.sirenA = a;
      this.sirenB = b;
      // A sprite, not a plane: the bar has to glow from every angle, and a flat quad is edge-on to
      // the camera half the time.
      this.sirenGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('200,215,255', '110,140,255'), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
      }));
      this.sirenGlow.scale.set(1.3, 1.3, 1);
      this.sirenGlow.position.set(-0.6, barY + 0.3, this.spec.cabinZ - 0.2);
      this.group.add(this.sirenGlow);
      // the second lamp gets its own sprite so the bar flashes red on one side and blue on the other
      this.sirenGlowB = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('255,220,220', '255,90,90'), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.sirenGlowB.scale.set(1.3, 1.3, 1);
      this.sirenGlowB.position.set(0.6, barY + 0.3, this.spec.cabinZ - 0.2);
      this.group.add(this.sirenGlowB);

      // Two pools of colour on the road, one blue and one red: at any distance this is what tells
      // the player a cruiser is behind them, and it costs two additive quads.
      const poolGeo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
      const poolMap = glowTexture('210,225,255', '110,140,255');
      this.lightPool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        map: poolMap, transparent: true, opacity: 0.7, color: 0x5a7bff,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }));
      this.lightPool.position.set(-1.1, 0.09, 0);
      this.lightPool.name = 'sirenPool';
      this.lightPoolB = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        map: poolMap, transparent: true, opacity: 0.7, color: 0xff4a55,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }));
      this.lightPoolB.position.set(1.1, 0.09, 0);
      this.lightPoolB.name = 'sirenPoolRed';
      this.group.add(this.lightPool, this.lightPoolB);
    }

    this.damage = 0;
    this.spinAngle = 0;
    this.smokeTimer = 0;
  }

  setPose(x, z, yaw, y = 0) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
  }

  /** Visual update: wheel spin, steering, brake lights, headlights, damage tint. */
  update(dt, speed, steer, brake, nightGlow, effects) {
    this.spinAngle += (speed / 0.34) * dt;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.spinAngle;
      w.pivot.rotation.y = w.front ? steer * 0.55 : 0;
    }
    this.lightMaterial.opacity = nightGlow * 0.95;
    this.beamMaterial.opacity = nightGlow * 0.1;
    this.tailMaterial.opacity = brake ? 0.95 : 0.22 + nightGlow * 0.2;
    if (this.police) {
      const t = performance.now() * 0.006;
      const on = Math.sin(t) > 0;
      this.sirenMaterialA.color.setRGB(on ? 0.18 : 0.03, on ? 0.42 : 0.04, on ? 1.0 : 0.1);
      this.sirenMaterialB.color.setRGB(on ? 0.1 : 1.0, on ? 0.02 : 0.05, on ? 0.04 : 0.04);
      this.sirenGlow.material.opacity = on ? 0.75 : 0.15;
      this.sirenGlowB.material.opacity = on ? 0.15 : 0.75;
      if (this.lightPool) {
        this.lightPool.material.opacity = on ? 0.9 : 0.25;
        this.lightPoolB.material.opacity = on ? 0.25 : 0.9;
      }
    }
    if (this.damage > 0.001) {
      const d = Math.min(1, this.damage);
      this.bodyMaterial.color.copy(this.color).multiplyScalar(1 - d * 0.55);
      if (d > 0.55 && effects) {
        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0) {
          this.smokeTimer = 0.09;
          effects.smokePuff({ x: this.group.position.x, y: 0.9, z: this.group.position.z }, 1 + d);
        }
      }
    }
  }

  applyDamage(amount) {
    this.damage = Math.min(1, this.damage + amount);
    return this.damage;
  }

  get position() {
    return this.group.position;
  }
}
