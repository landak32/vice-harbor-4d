// The city grid: 8x8 blocks, two-lane roads between them, sidewalks with curbs, lane paint,
// crosswalks, and the four districts that give the place its palette. Geometry is merged into a
// couple of static meshes; the blocks themselves are handed to the building generator.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from './merge.js';
import { asphaltTexture, pavementTexture } from '../render/textures.js';
import { Rng } from '../core/rng.js';

export const GRID = 8;
export const PITCH = 60;
export const ROAD_W = 14;
export const SIDEWALK_W = 3;
export const BLOCK_W = PITCH - ROAD_W - SIDEWALK_W * 2; // 40
export const CITY_HALF = (GRID * PITCH) / 2; // 240
export const LANE_OFFSET = 3.4;
export const CURB_H = 0.19;

export const DISTRICTS = {
  harbor: {
    id: 'harbor', name: 'Harbor Row', motto: 'Cannery lights, cheap beer',
    wall: [186, 138, 108], trim: [222, 206, 182], glass: [92, 112, 124],
    sign: [180, 62, 48], signText: [255, 226, 176], awning: [46, 96, 104],
    styles: ['brick', 'shops', 'stucco'], floors: [2, 5], tower: 0.0,
  },
  neon: {
    id: 'neon', name: 'Neon Quarter', motto: 'Nothing closes',
    wall: [104, 118, 146], trim: [176, 194, 212], glass: [86, 122, 160],
    sign: [120, 40, 120], signText: [120, 250, 240], awning: [150, 40, 90],
    styles: ['glass', 'deco', 'shops'], floors: [6, 14], tower: 1.0,
  },
  coral: {
    id: 'coral', name: 'Coral Heights', motto: 'Salt, sun, and bad decisions',
    wall: [242, 176, 154], trim: [252, 238, 214], glass: [118, 146, 160],
    sign: [36, 140, 140], signText: [255, 240, 210], awning: [222, 96, 96],
    styles: ['stucco', 'shops', 'deco'], floors: [2, 6], tower: 0.15,
  },
  verano: {
    id: 'verano', name: 'Verano Hills', motto: 'Old money, older grudges',
    wall: [242, 232, 210], trim: [255, 250, 236], glass: [112, 136, 146],
    sign: [72, 92, 140], signText: [255, 236, 190], awning: [58, 88, 74],
    styles: ['deco', 'stucco', 'glass'], floors: [4, 9], tower: 0.4,
  },
};

const VERTICAL_ROADS = ['Dock Row', 'Cannery Ave', 'Anchor Way', 'Vice Blvd', 'Neon Street', 'Palmetto Dr', 'Marina Way', 'Coral Ave', 'Tide Line'];
const HORIZONTAL_ROADS = ['Pier Road', 'Alameda St', 'Foundry Lane', 'Sunset Blvd', 'Verano Drive', 'Cypress Row', 'Bayfront St', 'Ocean Drive', 'Saltmarsh Rd'];

const STORE_SIGNS = ['LIQUOR', 'PAWN', 'CAFE', 'MOTEL', 'SUSHI', 'TATTOO', 'BAIT', 'DINER', 'ARCADE', 'GARAGE', 'MARKET', 'BAR'];

export function districtAt(i, j) {
  if (i <= 2) return DISTRICTS.harbor;
  if (i >= 6) return DISTRICTS.coral;
  if (j >= 6) return DISTRICTS.verano;
  return DISTRICTS.neon;
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = new Rng(seed);
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.blocks = [];
    this.intersections = [];
    this.roadX = [];
    this.roadZ = [];
    for (let i = 0; i <= GRID; i++) {
      this.roadX.push(-CITY_HALF + i * PITCH);
      this.roadZ.push(-CITY_HALF + i * PITCH);
    }
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const cx = -CITY_HALF + i * PITCH + PITCH / 2;
        const cz = -CITY_HALF + j * PITCH + PITCH / 2;
        const d = districtAt(i, j);
        this.blocks.push({
          i, j, cx, cz, district: d,
          half: BLOCK_W / 2,
          beachfront: i === GRID - 1,
          central: Math.hypot(cx, cz) < 120,
        });
      }
    }
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        this.intersections.push({ i, j, x: this.roadX[i], z: this.roadZ[j] });
      }
    }
    this.buildGround();
    this.buildSidewalks();
    this.buildMarkings();
  }

  blockCenter(i, j) {
    const b = this.blocks.find((k) => k.i === i && k.j === j);
    return b ? { x: b.cx, z: b.cz } : { x: 0, z: 0 };
  }

  buildGround() {
    const asphalt = asphaltTexture(this.rng);
    asphalt.repeat.set(70, 70);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120),
      new THREE.MeshLambertMaterial({ map: asphalt, color: 0xc2c6cc }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.name = 'asphalt';
    this.group.add(ground);
    this.groundMesh = ground;

    // A concrete apron under the whole grid so block interiors never show asphalt through.
    const pad = new GeoBuilder();
    const pave = pavementTexture(this.rng);
    pave.repeat.set(1, 1);
    for (const b of this.blocks) {
      pad.flat(b.cx - b.half - SIDEWALK_W, b.cz - b.half - SIDEWALK_W, b.cx + b.half + SIDEWALK_W, b.cz + b.half + SIDEWALK_W, 0.02, 8);
    }
    const padMesh = new THREE.Mesh(pad.build(), new THREE.MeshLambertMaterial({ map: pave, color: 0xd6d6ce }));
    padMesh.receiveShadow = true;
    padMesh.name = 'blockPads';
    this.group.add(padMesh);
  }

  buildSidewalks() {
    const b = new GeoBuilder();
    const pave = pavementTexture(this.rng);
    pave.repeat.set(1, 1);
    for (const blk of this.blocks) {
      const o = blk.half;
      const w = o + SIDEWALK_W;
      // four slabs around the block: north, south, east, west (corners overlap, invisible)
      b.box(blk.cx, CURB_H / 2, blk.cz - (o + SIDEWALK_W / 2), o * 2 + SIDEWALK_W * 2, CURB_H, SIDEWALK_W, { uvScale: 4, vScale: 4, skipTop: false });
      b.box(blk.cx, CURB_H / 2, blk.cz + (o + SIDEWALK_W / 2), o * 2 + SIDEWALK_W * 2, CURB_H, SIDEWALK_W, { uvScale: 4, vScale: 4, skipTop: false });
      b.box(blk.cx - (o + SIDEWALK_W / 2), CURB_H / 2, blk.cz, SIDEWALK_W, CURB_H, o * 2, { uvScale: 4, vScale: 4, skipTop: false });
      b.box(blk.cx + (o + SIDEWALK_W / 2), CURB_H / 2, blk.cz, SIDEWALK_W, CURB_H, o * 2, { uvScale: 4, vScale: 4, skipTop: false });
      void w;
    }
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ map: pave, color: 0xe2e2da }));
    mesh.receiveShadow = true;
    mesh.name = 'sidewalks';
    this.group.add(mesh);
  }

  buildMarkings() {
    const b = new GeoBuilder();
    const y = 0.035;
    // dashed centre line down each road
    for (const x of this.roadX) {
      for (let z = -CITY_HALF + 12; z < CITY_HALF - 12; z += 6.4) {
        b.flat(x - 0.09, z, x + 0.09, z + 3.2, y);
      }
    }
    for (const z of this.roadZ) {
      for (let x = -CITY_HALF + 12; x < CITY_HALF - 12; x += 6.4) {
        b.flat(x, z - 0.09, x + 3.2, z + 0.09, y);
      }
    }
    // crosswalk zebra stripes on every approach to every intersection
    const stripe = 0.62;
    const gap = 1.05;
    for (const it of this.intersections) {
      const d = ROAD_W / 2 + 2.2;
      for (let s = -ROAD_W / 2 + 0.5; s < ROAD_W / 2 - 0.4; s += stripe + gap) {
        // north and south approaches
        b.flat(it.x + s, it.z - d - 1.7, it.x + s + stripe, it.z - d + 1.7, y);
        b.flat(it.x + s, it.z + d - 1.7, it.x + s + stripe, it.z + d + 1.7, y);
        // east and west approaches
        b.flat(it.x - d - 1.7, it.z + s, it.x - d + 1.7, it.z + s + stripe, y);
        b.flat(it.x + d - 1.7, it.z + s, it.x + d + 1.7, it.z + s + stripe, y);
      }
    }
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ color: 0xe6e2d4 }));
    mesh.name = 'laneMarkings';
    mesh.receiveShadow = false;
    this.group.add(mesh);
  }

  /** Nearest point on a lane centre, plus the direction the right-hand lane travels. */
  nearestLane(x, z) {
    let best = { x, z, yaw: 0, dist: Infinity };
    for (const rx of this.roadX) {
      for (const dir of [1, -1]) {
        const lx = rx + dir * LANE_OFFSET;
        const d = Math.abs(x - lx);
        if (d < best.dist) best = { x: lx, z, yaw: dir > 0 ? 0 : Math.PI, dist: d, axis: 'z', road: rx };
      }
    }
    for (const rz of this.roadZ) {
      for (const dir of [1, -1]) {
        const lz = rz + dir * LANE_OFFSET;
        const d = Math.abs(z - lz);
        if (d < best.dist) best = { x, z: lz, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, dist: d, axis: 'x', road: rz };
      }
    }
    return best;
  }

  isOnRoad(x, z, margin = 0) {
    const nearX = this.roadX.some((rx) => Math.abs(x - rx) < ROAD_W / 2 + margin);
    const nearZ = this.roadZ.some((rz) => Math.abs(z - rz) < ROAD_W / 2 + margin);
    return nearX || nearZ;
  }

  isOnSidewalk(x, z) {
    const inGrid = Math.abs(x) < CITY_HALF && Math.abs(z) < CITY_HALF;
    return inGrid && !this.isOnRoad(x, z) && !this.insideBlock(x, z);
  }

  /** Inside a block's buildable interior (buildings live here). */
  insideBlock(x, z, margin = 0) {
    for (const b of this.blocks) {
      if (Math.abs(x - b.cx) < b.half + margin && Math.abs(z - b.cz) < b.half + margin) return b;
    }
    return null;
  }

  districtAtPoint(x, z) {
    const i = Math.max(0, Math.min(GRID - 1, Math.floor((x + CITY_HALF) / PITCH)));
    const j = Math.max(0, Math.min(GRID - 1, Math.floor((z + CITY_HALF) / PITCH)));
    return districtAt(i, j);
  }

  /** District and street label for the HUD. */
  addressAt(x, z) {
    const d = this.districtAtPoint(x, z);
    let bestName = 'Vice Blvd';
    let bestDist = Infinity;
    for (let i = 0; i < this.roadX.length; i++) {
      const dd = Math.abs(x - this.roadX[i]);
      if (dd < bestDist) { bestDist = dd; bestName = VERTICAL_ROADS[i]; }
    }
    for (let i = 0; i < this.roadZ.length; i++) {
      const dd = Math.abs(z - this.roadZ[i]);
      if (dd < bestDist) { bestDist = dd; bestName = HORIZONTAL_ROADS[i]; }
    }
    return { district: d.name, street: bestName };
  }

  /** A road-side spawn point: on the lane, facing along the road, near a given block. */
  lanePointNear(x, z, rng, minDist = 30) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const vertical = rng.chance(0.5);
      const line = vertical ? rng.pick(this.roadX) : rng.pick(this.roadZ);
      const along = rng.range(-CITY_HALF + 20, CITY_HALF - 20);
      const side = rng.sign();
      const px = vertical ? line + side * LANE_OFFSET : along;
      const pz = vertical ? along : line + side * LANE_OFFSET;
      if (Math.hypot(px - x, pz - z) < minDist) continue;
      return { x: px, z: pz, yaw: vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2) };
    }
    return { x: x + 40, z, yaw: 0 };
  }

  static get storeSigns() {
    return STORE_SIGNS;
  }
}
