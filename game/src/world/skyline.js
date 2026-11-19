// The horizon. A ring of distant blocks and towers well past the fog line so the skyline never
// ends in empty sky, plus a couple of taller landmarks to read at thumbnail size.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from './merge.js';
import { Rng } from '../core/rng.js';

export class Skyline {
  constructor(scene, seed) {
    this.rng = new Rng(seed);
    this.group = new THREE.Group();
    this.group.name = 'skyline';
    scene.add(this.group);
    const g = new GeoBuilder();
    const rng = this.rng;
    const rings = [
      { r: 470, count: 120, h: [14, 42], col: [0.09, 0.12, 0.18] },
      { r: 620, count: 90, h: [24, 78], col: [0.07, 0.1, 0.15] },
      { r: 780, count: 60, h: [30, 110], col: [0.05, 0.08, 0.13] },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        const a = (i / ring.count) * Math.PI * 2 + rng.jitter(0.02);
        // leave the ocean side open: the beach looks out to sea
        if (Math.cos(a) > 0.55) continue;
        const r = ring.r + rng.range(-40, 40);
        const w = rng.range(16, 46);
        const d = rng.range(16, 46);
        const h = rng.range(ring.h[0], ring.h[1]) * (rng.chance(0.12) ? 1.7 : 1);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        g.box(x, h / 2, z, w, h, d, { color: ring.col, uvScale: 8, vScale: 8, skipBottom: true });
        if (rng.chance(0.3)) {
          g.box(x, h + 6, z, w * 0.35, 12, d * 0.35, { color: ring.col, uvScale: 8, vScale: 8, skipBottom: true });
        }
      }
    }
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.mesh = new THREE.Mesh(g.build(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'skylineSilhouette';
    this.group.add(this.mesh);

    // window lights: a faint point cloud that only shows at night
    const count = 1400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rng.range(-Math.PI, Math.PI);
      if (Math.cos(a) > 0.55) {
        pos[i * 3] = 0;
        pos[i * 3 + 1] = -50;
        pos[i * 3 + 2] = 0;
        continue;
      }
      const r = rng.range(460, 800);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rng.range(4, 70);
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lights = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffd9a0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    this.lights.frustumCulled = false;
    this.group.add(this.lights);
  }

  update(dayCycle) {
    const night = dayCycle.night;
    const p = dayCycle.palette;
    this.mesh.material.color.setRGB(0.55 + night * 0.35, 0.6 + night * 0.3, 0.72 + night * 0.2);
    this.lights.material.opacity = Math.max(0, night - 0.25) * 0.85;
    void p;
  }
}
