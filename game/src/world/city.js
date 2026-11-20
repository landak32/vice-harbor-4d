// The city grid: 8x8 blocks, two-lane roads between them, sidewalks with curbs, lane paint,
// crosswalks, and the four districts that give the place its palette. Geometry is merged into a
// couple of static meshes; the blocks themselves are handed to the building generator.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from './merge.js';
import { asphaltTexture, pavementTexture, wetAsphaltRoughness } from '../render/textures.js';
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

/** Neutral grey the wet sheen is pulled toward, so it reflects light without inheriting the sky's hue. */
const NEUTRAL_SHEEN = new THREE.Color(0x9aa2ad);
/** After dark the road reflects sodium lamps and shopfronts, not a sunset: warm, and a touch stronger. */
const LAMP_SHEEN = new THREE.Color(0xffc48a);

/* The wet-road sheen. World-space, so the mask follows the grid the roads are laid out on. */
const SHEEN_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SHEEN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uPitch;
  uniform float uHalf;
  uniform float uRoadHalf;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // value noise: cheap, smooth, and enough to break the sheen into streaks
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  // distance to the nearest road centre line on one axis
  float laneDist(float v) {
    float m = mod(v + uHalf, uPitch);
    return min(m, uPitch - m);
  }

  void main() {
    vec2 p = vWorld.xz;
    float road = smoothstep(uRoadHalf + 0.4, uRoadHalf - 0.4, min(laneDist(p.x), laneDist(p.y)));
    if (road < 0.002) discard;

    vec3 view = normalize(cameraPosition - vWorld);
    // grazing angles only: looking straight down at a puddle shows you the asphalt, not the sky
    float fres = pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
    float wet = 0.55 + 0.45 * vnoise(p * 0.33) * (0.6 + 0.4 * vnoise(p * 1.1));
    // fade out before the road meets the horizon, where one pixel covers metres of surface
    float near = 1.0 - smoothstep(110.0, 250.0, length(p - cameraPosition.xz));
    gl_FragColor = vec4(uColor * (road * fres * wet * near * uStrength), 1.0);
  }
`;

/**
 * Which district owns block (i, j): ordered checks, so the far columns are coral whatever row they
 * sit on, the top rows are verano, and neon fills the middle.
 */
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
    this.buildWetSheen();
  }

  blockCenter(i, j) {
    const b = this.blocks.find((k) => k.i === i && k.j === j);
    return b ? { x: b.cx, z: b.cz } : { x: 0, z: 0 };
  }

  buildGround() {
    const asphalt = asphaltTexture(this.rng);
    asphalt.repeat.set(70, 70);
    // Wet asphalt: a dark albedo plus a roughness map that swings from mirror-smooth in the puddles
    // to dry-and-matte on the crown of the road. The roughness contrast is what does the work — a
    // uniform low roughness would just look like polished plastic.
    const wetness = wetAsphaltRoughness(this.rng);
    wetness.repeat.set(70, 70);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120),
      new THREE.MeshPhysicalMaterial({
        map: asphalt,
        color: 0x6b7178,
        roughness: 1.0,
        roughnessMap: wetness,
        metalness: 0.0,
        // A dielectric road has F0 = 0.04 and a Fresnel term that climbs to 1.0 at grazing angles.
        // Over a plane this size that turns the whole far road into a mirror of the dusk sky, which
        // reads as pink paint rather than wet tarmac. specularIntensity scales F0 *and* F90, so the
        // road keeps the glint where the sun actually hits it and stays dark everywhere else.
        specularIntensity: 0.3,
      }),
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

  /**
   * The road's wet sheen. One additive plane a hair above the asphalt, masked to the road strips in
   * the shader from the same grid the roads are built on, so it follows every street and every
   * intersection without adding geometry per road. The brightness is a fresnel term: a wet road only
   * throws the sky back at a grazing angle, which is what makes the long smear down the street.
   */
  buildWetSheen() {
    this.sheenUniforms = {
      uColor: { value: new THREE.Color(0xc6d8e4) },
      uStrength: { value: 0.42 },
      uPitch: { value: PITCH },
      uHalf: { value: CITY_HALF },
      uRoadHalf: { value: ROAD_W / 2 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.sheenUniforms,
      vertexShader: SHEEN_VERT,
      fragmentShader: SHEEN_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012; // under the lane paint at 0.035, over the asphalt at 0
    mesh.name = 'wetSheen';
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.sheen = mesh;
  }

  /**
   * Tie the sheen to the sky it is reflecting: it takes the horizon colour, and gets stronger after
   * dark, when the street is lit by lamps and neon rather than by a broad sun.
   */
  updateWetness(day) {
    if (!this.sheenUniforms) return;
    // Reflect the sky, but pull it toward neutral: a straight copy of a magenta dusk horizon turns
    // the whole street into a pink mirror, which reads as a paint error rather than as wet tarmac.
    const glow = day.lampGlow;
    this.sheenUniforms.uColor.value
      .copy(day.horizon)
      .lerp(NEUTRAL_SHEEN, 0.6 - glow * 0.25)
      .lerp(LAMP_SHEEN, glow * 0.5);
    this.sheenUniforms.uStrength.value = 0.09 + glow * 0.28;
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
