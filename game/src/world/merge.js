// Geometry accumulation. Static city geometry is built into these buffers and merged into one mesh
// per material, which is what keeps a whole district inside a handful of draw calls.
import * as THREE from '../../vendor/three.module.min.js';

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.vertCount = 0;
  }

  get empty() {
    return this.vertCount === 0;
  }

  /** One quad from four corners (counter-clockwise seen from the front) with per-corner UVs. */
  quad(a, b, c, d, uvA, uvB, uvC, uvD, color) {
    const i = this.vertCount;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const pts = [a, b, c, d];
    const uvs = [uvA, uvB, uvC, uvD];
    for (let k = 0; k < 4; k++) {
      this.pos.push(pts[k][0], pts[k][1], pts[k][2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(uvs[k][0], uvs[k][1]);
      if (color) this.col.push(color[0], color[1], color[2]);
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.vertCount += 4;
  }

  /**
   * Axis-aligned box. `uvScale` is metres per texture tile (u along x/z, v along y) so walls can
   * repeat a facade texture at real-world size instead of stretching it.
   */
  box(cx, cy, cz, sx, sy, sz, opts = {}) {
    const { uvScale = 8, vScale = 12.8, skipBottom = true, skipTop = false, color = null, uvOffset = 0 } = opts;
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const us = 1 / uvScale;
    const vs = 1 / vScale;
    const ru = sx * us, rv = sy * vs, rw = sz * us;
    const o = uvOffset;
    // +z, -z, +x, -x walls
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [o, 0], [o + ru, 0], [o + ru, rv], [o, rv], color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [o, 0], [o + ru, 0], [o + ru, rv], [o, rv], color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [o, 0], [o + rw, 0], [o + rw, rv], [o, rv], color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [o, 0], [o + rw, 0], [o + rw, rv], [o, rv], color);
    if (!skipTop) {
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 0], [1, 0], [1, 1], [0, 1], color);
    }
    if (!skipBottom) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0], [1, 0], [1, 1], [0, 1], color);
    }
  }

  /** Flat quad lying on the ground (y up), used for road paint and pavements. */
  flat(x0, z0, x1, z1, y, uvTile = 4, color = null) {
    const u0 = x0 / uvTile, u1 = x1 / uvTile, v0 = z0 / uvTile, v1 = z1 / uvTile;
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [u0, v0], [u1, v0], [u1, v1], [u0, v1], color);
  }

  /** Copy an existing geometry (already transformed) into the buffer. */
  add(geo, matrix, color = null) {
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const t = geo.attributes.uv;
    const index = geo.index;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3();
    const base = this.vertCount;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      if (color) this.col.push(color[0], color[1], color[2]);
    }
    if (index) {
      for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
    this.vertCount += p.count;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Merge a list of geometries (position/normal/uv only), each with an optional matrix. */
export function mergeGeometries(list) {
  const b = new GeoBuilder();
  const m = new THREE.Matrix4();
  for (const item of list) {
    b.add(item.geo ?? item, item.matrix ?? m);
  }
  return b.build();
}
