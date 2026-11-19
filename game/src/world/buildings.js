// Buildings: lots, facades, storefronts, balconies, parapets, water tanks and rooftop clutter.
// Each district's stock is merged into a few meshes (one per facade material), so a whole skyline
// costs a handful of draw calls. Facades are lit from their emissive map after dark.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from './merge.js';
import { facadeTextures, storefrontTextures, signAtlas } from '../render/textures.js';
import { DISTRICTS, BLOCK_W } from './city.js';
import { Rng } from '../core/rng.js';

const NEON_WORDS = ['MOTEL', 'LIQUOR', 'VICE', 'TIKI', 'SUSHI', 'PAWN', 'LIVE', 'RADIO', 'TATTOO', 'DINER', 'HOTEL', 'ARCADE'];

export class Buildings {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(seed);
    this.group = new THREE.Group();
    this.group.name = 'buildings';
    scene.add(this.group);
    this.buckets = new Map();
    this.trim = new GeoBuilder();
    this.roofs = new GeoBuilder();
    this.facadeMaterials = [];
    this.storeMaterials = [];
    // every neon sign in the city shares one atlas, so a district's signs are one merged mesh
    this.atlas = signAtlas(NEON_WORDS.slice(0, 12).map((text, i) => ({
      text,
      vertical: i % 3 === 0,
      color: ['#8ff6ff', '#ff7ab6', '#ffd166', '#9dff9d'][i % 4],
      glow: ['#3ee0d0', '#ff5f6d', '#ffb347', '#5fd97a'][i % 4],
    })));
    this.signBuilders = new Map();
    this.signMeshes = [];

    for (const block of city.blocks) this.buildBlock(block);
    this.finish();
    this.finishSigns();
  }

  bucket(key, makeMaterial) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { builder: new GeoBuilder(), material: makeMaterial() };
      this.buckets.set(key, b);
    }
    return b;
  }

  facadeMaterial(district, style, variant) {
    const key = `${district.id}:${style}:${variant}`;
    return this.bucket(key, () => {
      const pal = this.paletteFor(district, variant);
      const t = facadeTextures(this.rng, style, pal);
      const mat = new THREE.MeshLambertMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new THREE.Color(0xffb877),
        emissiveIntensity: 0,
      });
      mat.name = `facade_${key}`;
      this.facadeMaterials.push(mat);
      return mat;
    });
  }

  storeMaterial(district) {
    return this.bucket(`shop:${district.id}`, () => {
      const pal = this.paletteFor(district, 0);
      const t = storefrontTextures(this.rng, pal, this.rng.pick(NEON_WORDS));
      const mat = new THREE.MeshLambertMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new THREE.Color(0xffd9a0),
        emissiveIntensity: 0,
      });
      this.storeMaterials.push(mat);
      return mat;
    });
  }

  paletteFor(district, variant) {
    const v = variant === 0 ? 1 : variant === 1 ? 1.12 : 0.88;
    const tint = variant === 2 ? [1.02, 0.96, 0.9] : [1, 1, 1];
    const base = {
      wall: [district.wall[0] * v * tint[0], district.wall[1] * v * tint[1], district.wall[2] * v * tint[2]],
      trim: [district.trim[0] * v, district.trim[1] * v, district.trim[2] * v],
      glass: district.glass,
      sign: district.sign,
      signText: district.signText,
      awning: district.awning,
    };
    return base;
  }

  buildBlock(block) {
    const rng = this.rng;
    const d = block.district;
    const inner = BLOCK_W / 2 - 0.6;
    // One tower per block in the core, otherwise 2-4 narrower buildings.
    const central = Math.hypot(block.cx, block.cz);
    const towerChance = d.tower * (1 - Math.min(1, central / 260));
    const split = rng.chance(0.55 + towerChance * -0.4) ? 2 : rng.chance(0.5) ? 1 : 4;
    const lots = [];
    if (split === 1) {
      lots.push({ x: 0, z: 0, w: inner * 2, d: inner * 2 });
    } else if (split === 2) {
      const along = rng.chance(0.5);
      const w = inner * 2;
      const half = w / 2;
      if (along) {
        lots.push({ x: 0, z: -half / 2 - 0.4, w, d: half - 0.4 });
        lots.push({ x: 0, z: half / 2 + 0.4, w, d: half - 0.4 });
      } else {
        lots.push({ x: -half / 2 - 0.4, z: 0, w: half - 0.4, d: w });
        lots.push({ x: half / 2 + 0.4, z: 0, w: half - 0.4, d: w });
      }
    } else {
      const h = inner;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        lots.push({ x: sx * (h / 2 + 0.4), z: sz * (h / 2 + 0.4), w: h - 0.8, d: h - 0.8 });
      }
    }
    for (const lot of lots) {
      if (rng.chance(0.06)) continue; // the odd empty lot becomes a plaza
      this.buildTower(block.cx + lot.x, block.cz + lot.z, lot.w, lot.d, d, towerChance);
    }
  }

  buildTower(cx, cz, w, d, district, towerChance) {
    const rng = this.rng;
    const style = rng.pick(district.styles);
    const variant = rng.int(0, 1);
    const [minF, maxF] = district.floors;
    const tall = rng.chance(0.25 + towerChance * 0.7);
    let floors = tall ? Math.round(rng.range(maxF * 0.7, maxF)) : Math.round(rng.range(minF, Math.max(minF + 1, maxF * 0.6)));
    floors = Math.max(2, Math.min(14, floors));
    const floorH = 3.25;
    const shopH = floors <= 3 ? 3.4 : 4.1;
    const h = shopH + (floors - 1) * floorH;
    const inset = rng.range(0.2, 1.1);
    const bw = Math.max(8, w - inset * 2);
    const bd = Math.max(8, d - inset * 2);
    const bucket = this.facadeMaterial(district, style, variant);
    const b = bucket.builder;

    // ground floor: storefront band, pushed out 0.15 m so it reads as a separate volume
    const sb = this.storeMaterial(district).builder;
    // one full copy of the shopfront texture per face, so the sign band and the door stay legible
    sb.box(cx, shopH / 2, cz, bw + 0.3, shopH, bd + 0.3, { uvScale: bw + 0.3, vScale: shopH, skipTop: true, skipBottom: true });
    // upper facade
    b.box(cx, shopH + (h - shopH) / 2, cz, bw, h - shopH, bd, { uvScale: 8, vScale: 13, skipTop: true, skipBottom: true });

    const roofY = h;
    const trimColor = [district.trim[0] / 255, district.trim[1] / 255, district.trim[2] / 255];
    // parapet
    const pt = 0.42;
    const ph = 0.75;
    this.trim.box(cx, roofY + ph / 2, cz - bd / 2 + pt / 2, bw, ph, pt, { color: trimColor });
    this.trim.box(cx, roofY + ph / 2, cz + bd / 2 - pt / 2, bw, ph, pt, { color: trimColor });
    this.trim.box(cx - bw / 2 + pt / 2, roofY + ph / 2, cz, pt, ph, bd - pt * 2, { color: trimColor });
    this.trim.box(cx + bw / 2 - pt / 2, roofY + ph / 2, cz, pt, ph, bd - pt * 2, { color: trimColor });
    // roof slab
    this.roofs.box(cx, roofY - 0.1, cz, bw - 0.1, 0.22, bd - 0.1, { uvScale: 6, vScale: 6, skipBottom: true });

    // awnings over the shopfront
    if (rng.chance(0.8)) {
      const aw = Math.min(bw - 2, rng.range(5, 11));
      const ax = cx + rng.range(-(bw - aw) / 2, (bw - aw) / 2);
      const side = rng.chance(0.5) ? 1 : -1;
      const az = cz + side * (bd / 2 + 0.55);
      const ac = [district.awning[0] / 255, district.awning[1] / 255, district.awning[2] / 255];
      this.trim.box(ax, shopH - 0.55, az, aw, 0.16, 1.5, { color: ac });
      this.trim.box(ax, shopH - 0.95, az + side * 0.62, aw, 0.5, 0.1, { color: ac });
    }

    // balconies on the street-facing faces of mid-rise buildings
    if (floors >= 4 && style !== 'glass' && rng.chance(0.75)) {
      const face = rng.int(0, 3);
      const floorsToDo = Math.min(floors - 2, 6);
      for (let f = 1; f <= floorsToDo; f++) {
        if (!rng.chance(0.62)) continue;
        const y = shopH + (f - 0.5) * floorH - 0.35;
        const bwid = Math.min(bw * 0.42, 4.6);
        const off = rng.range(-(bw - bwid) / 2, (bw - bwid) / 2);
        const cc = [0.72, 0.68, 0.6];
        if (face === 0) {
          this.trim.box(cx + off, y, cz + bd / 2 + 0.7, bwid, 0.18, 1.4, { color: cc });
          this.trim.box(cx + off, y + 0.45, cz + bd / 2 + 1.35, bwid, 0.75, 0.1, { color: [0.5, 0.52, 0.55] });
        } else if (face === 1) {
          this.trim.box(cx + off, y, cz - bd / 2 - 0.7, bwid, 0.18, 1.4, { color: cc });
          this.trim.box(cx + off, y + 0.45, cz - bd / 2 - 1.35, bwid, 0.75, 0.1, { color: [0.5, 0.52, 0.55] });
        } else if (face === 2) {
          this.trim.box(cx + bw / 2 + 0.7, y, cz + off, 1.4, 0.18, bwid, { color: cc });
          this.trim.box(cx + bw / 2 + 1.35, y + 0.45, cz + off, 0.1, 0.75, bwid, { color: [0.5, 0.52, 0.55] });
        } else {
          this.trim.box(cx - bw / 2 - 0.7, y, cz + off, 1.4, 0.18, bwid, { color: cc });
          this.trim.box(cx - bw / 2 - 1.35, y + 0.45, cz + off, 0.1, 0.75, bwid, { color: [0.5, 0.52, 0.55] });
        }
      }
    }

    // rooftop clutter: AC units, stair head, water tank, antenna
    const units = rng.int(1, 4);
    for (let i = 0; i < units; i++) {
      const ux = cx + rng.range(-bw / 2 + 2, bw / 2 - 2);
      const uz = cz + rng.range(-bd / 2 + 2, bd / 2 - 2);
      const s = rng.range(0.9, 2.1);
      this.trim.box(ux, roofY + s / 2, uz, s, s * 0.8, s * 0.8, { color: [0.42, 0.44, 0.46] });
    }
    if (floors >= 3 && rng.chance(0.5)) {
      const tx = cx + rng.range(-bw / 4, bw / 4);
      const tz = cz + rng.range(-bd / 4, bd / 4);
      this.trim.box(tx, roofY + 1.1, tz, 2.6, 2.2, 2.6, { color: [0.55, 0.42, 0.32] });
      this.trim.box(tx, roofY + 2.35, tz, 2.8, 0.3, 2.8, { color: [0.35, 0.28, 0.22] });
    }
    if (floors >= 5 && rng.chance(0.4)) {
      this.trim.box(cx, roofY + 3.2, cz, 0.14, 6.4, 0.14, { color: [0.3, 0.3, 0.32] });
    }

    // neon sign on a street face
    if (rng.chance(0.55)) this.addNeon(cx, cz, bw, bd, shopH, district);
  }

  /** A neon sign quad, merged into the district's single sign mesh. */
  addNeon(cx, cz, bw, bd, shopH, district) {
    const rng = this.rng;
    const cellIndex = rng.int(0, 11);
    const vertical = cellIndex % 3 === 0;
    const cell = this.atlas.cells[cellIndex];
    const h = vertical ? 5.2 : 1.7;
    const w = vertical ? 1.7 : 6.4;
    const face = rng.int(0, 3);
    const y = shopH + (vertical ? 2.6 : 0.9) + rng.range(0, 1.2);
    let b = this.signBuilders.get(district.id);
    if (!b) {
      b = new GeoBuilder();
      this.signBuilders.set(district.id, b);
    }
    let ax;
    let az;
    let nx = 0;
    let nz = 0;
    if (face === 0) { ax = cx + rng.range(-bw / 3, bw / 3); az = cz + bd / 2 + 0.35; nz = 1; }
    else if (face === 1) { ax = cx + rng.range(-bw / 3, bw / 3); az = cz - bd / 2 - 0.35; nz = -1; }
    else if (face === 2) { ax = cx + bw / 2 + 0.35; az = cz + rng.range(-bd / 3, bd / 3); nx = 1; }
    else { ax = cx - bw / 2 - 0.35; az = cz + rng.range(-bd / 3, bd / 3); nx = -1; }
    const tx = nz !== 0 ? 1 : 0;
    const tz = nx !== 0 ? 1 : 0;
    const hw = w / 2;
    const hh = h / 2;
    const p0 = [ax - tx * hw, y - hh, az - tz * hw];
    const p1 = [ax + tx * hw, y - hh, az + tz * hw];
    const p2 = [ax + tx * hw, y + hh, az + tz * hw];
    const p3 = [ax - tx * hw, y + hh, az - tz * hw];
    b.quad(p0, p1, p2, p3, [cell.u0, cell.v0], [cell.u1, cell.v0], [cell.u1, cell.v1], [cell.u0, cell.v1]);
  }

  /** One additive mesh per district for all of its neon. */
  finishSigns() {
    for (const [, builder] of this.signBuilders) {
      if (builder.empty) continue;
      const mesh = new THREE.Mesh(builder.build(), new THREE.MeshBasicMaterial({
        map: this.atlas.texture, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: true,
      }));
      mesh.name = 'neonSigns';
      this.signMeshes.push(mesh);
      this.group.add(mesh);
    }
    this.signBuilders.clear();
  }

  finish() {
    for (const [, b] of this.buckets) {
      if (b.builder.empty) continue;
      const mesh = new THREE.Mesh(b.builder.build(), b.material);
      mesh.castShadow = b.material.name?.startsWith('facade') ?? false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    const roofMesh = new THREE.Mesh(this.roofs.build(), new THREE.MeshLambertMaterial({ color: 0x4c4a48 }));
    roofMesh.receiveShadow = true;
    this.group.add(roofMesh);
    const trimMesh = new THREE.Mesh(this.trim.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    trimMesh.castShadow = true;
    trimMesh.receiveShadow = true;
    this.group.add(trimMesh);
    this.buckets.clear();
  }

  /** Called every frame with the day cycle's lamp glow so windows and shopfronts light up. */
  setNight(glow) {
    for (const m of this.facadeMaterials) m.emissiveIntensity = glow * 0.95;
    for (const m of this.storeMaterials) m.emissiveIntensity = glow * 0.85;
    for (const s of this.signMeshes) s.material.opacity = 0.35 + glow * 0.65;
  }
}
