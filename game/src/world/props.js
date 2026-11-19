// Street furniture: palms, streetlights with their cones and ground pools, benches, hydrants,
// bus stops, traffic lights and billboards. Everything static is instanced — one draw call per
// prop type, whatever the count.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from './merge.js';
import { glowTexture, billboardTexture } from '../render/textures.js';
import { CITY_HALF, GRID, PITCH, ROAD_W, SIDEWALK_W, CURB_H, BLOCK_W } from './city.js';
import { Rng } from '../core/rng.js';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

function instanced(geo, mat, placements, name) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, placements.length));
  mesh.name = name;
  mesh.count = placements.length;
  placements.forEach((p, i) => {
    Q.setFromEuler(new THREE.Euler(0, p.yaw ?? 0, 0));
    V.set(p.x, p.y ?? 0, p.z);
    S.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
    M.compose(V, Q, S);
    mesh.setMatrixAt(i, M);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export class StreetProps {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(seed);
    this.group = new THREE.Group();
    this.group.name = 'streetProps';
    scene.add(this.group);
    this.lampGlowMaterials = [];
    this.trafficHeads = null;
    this.buildPalms();
    this.buildStreetlights();
    this.buildBenches();
    this.buildHydrants();
    this.buildBusStops();
    this.buildTrafficLights();
    this.buildBillboards();
  }

  edgePoints(spacing, inset) {
    const pts = [];
    for (const b of this.city.blocks) {
      const o = BLOCK_W / 2 + SIDEWALK_W / 2;
      for (let s = -o; s <= o; s += spacing) {
        pts.push({ x: b.cx + s, z: b.cz - o, yaw: this.rng.float() * 6.28, block: b });
        pts.push({ x: b.cx + s, z: b.cz + o, yaw: this.rng.float() * 6.28, block: b });
        pts.push({ x: b.cx - o, z: b.cz + s, yaw: this.rng.float() * 6.28, block: b });
        pts.push({ x: b.cx + o, z: b.cz + s, yaw: this.rng.float() * 6.28, block: b });
      }
      void inset;
    }
    return pts;
  }

  buildPalms() {
    const g = new GeoBuilder();
    const trunk = [0.34, 0.26, 0.18];
    const leaf = [0.16, 0.42, 0.24];
    const leaf2 = [0.22, 0.52, 0.28];
    // trunk: stacked tapered segments so it bends slightly
    for (let i = 0; i < 6; i++) {
      const y = i * 1.05 + 0.5;
      const w = 0.42 - i * 0.035;
      g.box(0.09 * i, y, 0, w, 1.1, w, { color: trunk, uvScale: 2, vScale: 2 });
    }
    // crown: fronds radiating out and drooping
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const droop = 0.35 + (i % 3) * 0.12;
      const len = 3.1;
      const cx = Math.cos(a) * len * 0.5;
      const cz = Math.sin(a) * len * 0.5;
      const m = new THREE.Matrix4()
        .makeRotationY(-a)
        .multiply(new THREE.Matrix4().makeRotationZ(-droop));
      const blade = new THREE.BoxGeometry(len, 0.07, 0.72);
      const mm = new THREE.Matrix4().makeTranslation(0, 6.4, 0)
        .multiply(new THREE.Matrix4().makeRotationY(a))
        .multiply(new THREE.Matrix4().makeTranslation(len * 0.5, 0, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(-droop));
      g.add(blade, mm, i % 2 ? leaf : leaf2);
      void cx; void cz; void m;
    }
    g.box(0.55, 6.3, 0, 1.1, 0.7, 1.1, { color: [0.28, 0.3, 0.16], uvScale: 2, vScale: 2 });
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const pts = [];
    for (const b of this.city.blocks) {
      const o = BLOCK_W / 2 + SIDEWALK_W / 2 + 0.7;
      const n = b.district.id === 'neon' ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const side = this.rng.int(0, 3);
        const t = this.rng.range(-BLOCK_W / 2 + 2, BLOCK_W / 2 - 2);
        const x = side === 0 ? b.cx + t : side === 1 ? b.cx + t : side === 2 ? b.cx - o : b.cx + o;
        const z = side === 0 ? b.cz - o : side === 1 ? b.cz + o : b.cz + t;
        pts.push({ x, z, yaw: this.rng.float() * 6.28, s: this.rng.range(0.82, 1.25) });
      }
    }
    this.palms = instanced(geo, mat, pts, 'palms');
    this.palms.castShadow = true;
    this.group.add(this.palms);
  }

  buildStreetlights() {
    const g = new GeoBuilder();
    const metal = [0.24, 0.26, 0.28];
    g.add(new THREE.CylinderGeometry(0.11, 0.16, 7.2, 6), new THREE.Matrix4().makeTranslation(0, 3.6, 0), metal);
    g.add(new THREE.BoxGeometry(1.9, 0.16, 0.16), new THREE.Matrix4().makeTranslation(0.9, 7.2, 0), metal);
    g.box(1.75, 7.05, 0, 0.8, 0.22, 0.42, { color: [0.32, 0.33, 0.35], uvScale: 1, vScale: 1 });
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const pts = [];
    for (const b of this.city.blocks) {
      const o = BLOCK_W / 2 + SIDEWALK_W / 2 + 0.5;
      for (let i = 0; i < 4; i++) {
        const t = -BLOCK_W / 2 + 10 + i * 10;
        const side = i % 2;
        pts.push({ x: side ? b.cx + o : b.cx - o, z: b.cz + t, yaw: side ? Math.PI : 0 });
        pts.push({ x: b.cx + t, z: side ? b.cz + o : b.cz - o, yaw: side ? -Math.PI / 2 : Math.PI / 2 });
      }
    }
    this.streetlights = instanced(geo, mat, pts, 'streetlights');
    this.streetlights.castShadow = true;
    this.group.add(this.streetlights);

    // light cones hanging under each lamp head
    // depthWrite stays false: the cone is a double-sided additive volume that can never sort
    // correctly against the road and the facades behind it, and writing depth let it stamp a flat
    // wedge over whatever it overlapped. Additive blending only needs the colour contribution, so
    // dropping the depth footprint is both cheaper and the only way this reads as air, not geometry.
    const coneGeo = new THREE.ConeGeometry(4.6, 7.4, 10, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      // no depth write: otherwise the cone stamps a flat wedge over whatever is behind it
      depthWrite: false, side: THREE.DoubleSide,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.coneMaterial = coneMat;
    this.lampGlowMaterials.push(coneMat);
    const conePts = pts.map((p) => ({
      x: p.x + Math.sin(p.yaw) * 1.75, y: 3.4, z: p.z + Math.cos(p.yaw) * 1.75, yaw: p.yaw,
    }));
    this.cones = instanced(coneGeo, coneMat, conePts, 'lightCones');
    this.group.add(this.cones);

    // pools of light on the pavement
    const poolGeo = new THREE.PlaneGeometry(9.5, 9.5);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture('255,240,210', '255,190,120'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    this.poolMaterial = poolMat;
    this.lampGlowMaterials.push(poolMat);
    const poolPts = pts.map((p) => ({
      x: p.x + Math.sin(p.yaw) * 1.75, y: 0.06, z: p.z + Math.cos(p.yaw) * 1.75, yaw: 0,
    }));
    this.pools = instanced(poolGeo, poolMat, poolPts, 'lampPools');
    this.pools.renderOrder = 2;
    this.group.add(this.pools);

    // lamp bulb glows
    const bulbMat = new THREE.MeshBasicMaterial({
      map: glowTexture('255,255,240', '255,214,150'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    this.lampGlowMaterials.push(bulbMat);
    const bulbGeo = new THREE.PlaneGeometry(2.6, 2.6);
    const bulbPts = conePts.map((p) => ({ x: p.x, y: 7.0, z: p.z, yaw: p.yaw }));
    this.bulbs = instanced(bulbGeo, bulbMat, bulbPts, 'lampBulbs');
    this.bulbs.renderOrder = 3;
    this.group.add(this.bulbs);
  }

  buildBenches() {
    const g = new GeoBuilder();
    const wood = [0.42, 0.29, 0.18];
    const iron = [0.2, 0.22, 0.24];
    g.box(0, 0.45, 0, 2.2, 0.12, 0.62, { color: wood, uvScale: 2, vScale: 2 });
    g.box(0, 0.78, -0.28, 2.2, 0.5, 0.1, { color: wood, uvScale: 2, vScale: 2 });
    for (const sx of [-0.9, 0.9]) g.box(sx, 0.22, 0, 0.12, 0.44, 0.55, { color: iron, uvScale: 1, vScale: 1 });
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const pts = [];
    for (const b of this.city.blocks) {
      const o = BLOCK_W / 2 + SIDEWALK_W / 2 + 0.2;
      for (let i = 0; i < 2; i++) {
        const t = this.rng.range(-BLOCK_W / 3, BLOCK_W / 3);
        const side = this.rng.int(0, 3);
        const x = side < 2 ? b.cx + t : side === 2 ? b.cx - o : b.cx + o;
        const z = side === 0 ? b.cz - o : side === 1 ? b.cz + o : b.cz + t;
        pts.push({ x, z, yaw: side < 2 ? 0 : Math.PI / 2 });
      }
    }
    this.benches = instanced(geo, mat, pts, 'benches');
    this.benches.castShadow = true;
    this.group.add(this.benches);
  }

  buildHydrants() {
    const g = new GeoBuilder();
    const red = [0.62, 0.14, 0.12];
    g.add(new THREE.CylinderGeometry(0.16, 0.19, 0.72, 8), new THREE.Matrix4().makeTranslation(0, 0.36, 0), red);
    g.add(new THREE.SphereGeometry(0.17, 8, 6), new THREE.Matrix4().makeTranslation(0, 0.76, 0), red);
    g.add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), new THREE.Matrix4().makeTranslation(0, 0.5, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), red);
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const pts = [];
    for (const b of this.city.blocks) {
      if (!this.rng.chance(0.6)) continue;
      const o = BLOCK_W / 2 + SIDEWALK_W / 2;
      pts.push({ x: b.cx + this.rng.range(-o, o), z: b.cz - o, yaw: 0 });
    }
    this.hydrants = instanced(geo, mat, pts, 'hydrants');
    this.group.add(this.hydrants);
  }

  buildBusStops() {
    const g = new GeoBuilder();
    const glass = [0.3, 0.42, 0.46];
    const frame = [0.18, 0.2, 0.22];
    g.box(0, 2.3, 0, 4.2, 0.14, 1.8, { color: frame, uvScale: 1, vScale: 1 });
    g.box(-2, 1.2, 0, 0.12, 2.3, 1.7, { color: glass, uvScale: 1, vScale: 1 });
    g.box(2, 1.2, 0, 0.12, 2.3, 1.7, { color: glass, uvScale: 1, vScale: 1 });
    g.box(0, 1.2, -0.85, 4.1, 2.3, 0.1, { color: glass, uvScale: 1, vScale: 1 });
    g.box(0, 0.5, 0.6, 3.4, 0.1, 0.5, { color: [0.35, 0.26, 0.2], uvScale: 1, vScale: 1 });
    g.box(0, 2.9, 0, 4.4, 0.9, 0.18, { color: [0.9, 0.55, 0.2], uvScale: 1, vScale: 1 });
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
    const pts = [];
    for (const b of this.city.blocks) {
      if (!this.rng.chance(0.45)) continue;
      const o = BLOCK_W / 2 + SIDEWALK_W / 2 - 0.4;
      pts.push({ x: b.cx + o, z: b.cz + this.rng.range(-10, 10), yaw: -Math.PI / 2 });
    }
    this.busStops = instanced(geo, mat, pts, 'busStops');
    this.busStops.castShadow = true;
    this.group.add(this.busStops);
  }

  buildTrafficLights() {
    const g = new GeoBuilder();
    const metal = [0.2, 0.22, 0.24];
    g.add(new THREE.CylinderGeometry(0.1, 0.13, 5.4, 6), new THREE.Matrix4().makeTranslation(0, 2.7, 0), metal);
    g.box(0, 5.1, 0.42, 0.5, 1.35, 0.5, { color: [0.12, 0.13, 0.14], uvScale: 1, vScale: 1 });
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const pts = [];
    for (const it of this.city.intersections) {
      if (it.i >= GRID || it.j >= GRID) continue;
      const d = ROAD_W / 2 + 1.2;
      pts.push({ x: it.x - d, z: it.z - d, yaw: Math.PI * 0.25 });
      pts.push({ x: it.x + d, z: it.z + d, yaw: Math.PI * 1.25 });
    }
    this.trafficLights = instanced(geo, mat, pts, 'trafficLights');
    this.group.add(this.trafficLights);

    const bulbGeo = new THREE.BoxGeometry(0.26, 0.26, 0.12);
    const bulbMat = new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xffffff });
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, pts.length * 3);
    bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pts.length * 3 * 3), 3);
    bulbs.count = pts.length * 3;
    this.trafficBulbData = { mesh: bulbs, pts };
    this.group.add(bulbs);
    this.trafficClock = 0;
    this.setTrafficPhase(0);
  }

  setTrafficPhase(phase) {
    const { mesh, pts } = this.trafficBulbData;
    const green = new THREE.Color(0x39d66a);
    const red = new THREE.Color(0xe8402c);
    const amber = new THREE.Color(0xf0b22a);
    let k = 0;
    for (const p of pts) {
      const nsGreen = phase % 2 === 0;
      for (let i = 0; i < 3; i++) {
        V.set(p.x + Math.sin(p.yaw) * 0.28, 5.55 - i * 0.42, p.z + Math.cos(p.yaw) * 0.42);
        Q.setFromEuler(new THREE.Euler(0, p.yaw, 0));
        S.set(1, 1, 1);
        M.compose(V, Q, S);
        mesh.setMatrixAt(k, M);
        const on = i === 0 ? (nsGreen ? false : true) : i === 1 ? false : nsGreen;
        const col = i === 0 ? red : i === 1 ? amber : green;
        mesh.setColorAt(k, on ? col : col.clone().multiplyScalar(0.14));
        k++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  buildBillboards() {
    const rng = this.rng;
    const words = [
      ['STARFISH COLA', 'Taste the undertow', '#123b52', '#ffd166'],
      ['VICE HARBOR', 'Visit Coral Heights', '#2a1030', '#ff7ab6'],
      ['MERIDIAN AIR', 'Fly the long way home', '#0e2a22', '#8ff0c0'],
      ['NIGHT OWL FM', '88.3 on your dial', '#241436', '#b9a6ff'],
      ['HARBOR FERRY', 'Cross the bay in ten', '#0d2436', '#7fd6ff'],
    ];
    this.billboards = [];
    for (let i = 0; i < words.length; i++) {
      const [t, s, bg, fg] = words[i];
      const tex = billboardTexture(t, s, bg, fg);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 9),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, fog: true }),
      );
      const block = this.city.blocks[(i * 11 + 5) % this.city.blocks.length];
      const side = rng.int(0, 3);
      const y = 16 + rng.range(0, 10);
      const off = BLOCK_W / 2 + 1;
      if (side === 0) { mesh.position.set(block.cx, y, block.cz - off); mesh.rotation.y = 0; }
      if (side === 1) { mesh.position.set(block.cx, y, block.cz + off); mesh.rotation.y = Math.PI; }
      if (side === 2) { mesh.position.set(block.cx + off, y, block.cz); mesh.rotation.y = Math.PI / 2; }
      if (side === 3) { mesh.position.set(block.cx - off, y, block.cz); mesh.rotation.y = -Math.PI / 2; }
      mesh.name = 'billboard';
      this.group.add(mesh);
      this.billboards.push(mesh);
    }
  }

  update(dt, glow) {
    // 0.035, not the 0.35 this started at: the cone is 7.4 units tall and covers a lot of pixels,
    // so at any visible opacity it reads as a solid slab of light at night. Scaled this low it only
    // lifts the air around the lamp head; the 0.5 pool below carries the light on the pavement.
    this.coneMaterial.opacity = glow * 0.035;
    this.poolMaterial.opacity = glow * 0.5;
    this.bulbs.material.opacity = glow * 0.85;
    this.trafficClock += dt;
    if (this.trafficClock > 4.5) {
      this.trafficClock = 0;
      this.phase = ((this.phase ?? 0) + 1) % 4;
      this.setTrafficPhase(this.phase);
    }
  }
}
