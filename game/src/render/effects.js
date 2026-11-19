// Combat and motion effects: muzzle flashes, sparks, smoke, tracers, glass and dust. One pooled
// point cloud plus one line-segment buffer — no per-frame allocation, no extra draw calls per hit.
import * as THREE from '../../vendor/three.module.min.js';
import { glowTexture, smokeTexture } from './textures.js';

const MAX_PARTICLES = 420;
const MAX_TRACERS = 48;

const PART_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    // A dead particle is parked outside the clip volume in the vertex shader. Without this a pooled
    // slot still sitting at the origin blows up into a screen-filling point sprite whenever the
    // camera passes near (0,0,0) — the classic "why is my frame white" pool bug.
    if (aAlpha < 0.01) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(52.0, aSize * (260.0 / max(1.0, -mv.z)));
    gl_Position = projectionMatrix * mv;
  }
`;

const PART_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(pow(max(vColor, vec3(0.0)), vec3(0.4545)) * t.rgb, t.a * vAlpha);
  }
`;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    // start the pool parked underground rather than at the origin
    for (let i = 0; i < MAX_PARTICLES; i++) this.pos[i * 3 + 1] = -500;
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.size = new Float32Array(MAX_PARTICLES);
    this.alpha = new Float32Array(MAX_PARTICLES);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.drag = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, MAX_PARTICLES);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture('255,255,255', '255,200,120') } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
    this.points.renderOrder = 4;
    scene.add(this.points);

    // smoke uses its own cloud so it can be normal-blended and grey rather than additive
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: smokeTexture() } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const smokeGeo = geo.clone();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    smokeGeo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    smokeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.smoke = new THREE.Points(smokeGeo, this.smokeMat);
    this.smoke.name = 'smokeParticles';
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 3;
    scene.add(this.smoke);

    const tGeo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerCol = new Float32Array(MAX_TRACERS * 6);
    tGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    tGeo.setDrawRange(0, 0);
    this.tracers = new THREE.LineSegments(
      tGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 4;
    scene.add(this.tracers);
    this.tracerCount = 0;
    this.tracerLife = new Float32Array(MAX_TRACERS);
    this.time = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, gravity = -6, drag = 1.6) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  muzzleFlash(pos, dir) {
    for (let i = 0; i < 5; i++) {
      this.spawn(
        pos.x + dir.x * 0.4, pos.y, pos.z + dir.z * 0.4,
        dir.x * 6 + (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, dir.z * 6 + (Math.random() - 0.5) * 3,
        1.0, 0.82, 0.42, 6.5 + Math.random() * 4.5, 0.07, 0, 6,
      );
    }
  }

  sparks(pos, normal, count = 6) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        pos.x, pos.y, pos.z,
        normal.x * 3 + (Math.random() - 0.5) * 6, Math.random() * 4, normal.z * 3 + (Math.random() - 0.5) * 6,
        1.0, 0.72, 0.3, 7 + Math.random() * 8, 0.24 + Math.random() * 0.2, -14, 1.2,
      );
    }
  }

  smokePuff(pos, strength = 1) {
    for (let i = 0; i < 3; i++) {
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.6, pos.y, pos.z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 1.2, 1.4 + Math.random(), (Math.random() - 0.5) * 1.2,
        0.62, 0.62, 0.66, (18 + Math.random() * 16) * strength, 1.2 + Math.random() * 0.8, 0.4, 0.8,
      );
    }
  }

  dust(pos, strength = 1) {
    for (let i = 0; i < 2; i++) {
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.8, pos.y + 0.1, pos.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2,
        0.55, 0.5, 0.42, 10 * strength, 0.5, -1, 2,
      );
    }
  }

  tracer(from, to, color = [1, 0.85, 0.5]) {
    if (this.tracerCount >= MAX_TRACERS) return;
    const i = this.tracerCount++;
    this.tracerPos[i * 6] = from.x; this.tracerPos[i * 6 + 1] = from.y; this.tracerPos[i * 6 + 2] = from.z;
    this.tracerPos[i * 6 + 3] = to.x; this.tracerPos[i * 6 + 4] = to.y; this.tracerPos[i * 6 + 5] = to.z;
    for (let k = 0; k < 2; k++) {
      this.tracerCol[i * 6 + k * 3] = color[0];
      this.tracerCol[i * 6 + k * 3 + 1] = color[1];
      this.tracerCol[i * 6 + k * 3 + 2] = color[2];
    }
    this.tracerLife[i] = 0.075;
  }

  update(dt) {
    this.time += dt;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.06) {
        this.pos[i * 3 + 1] = 0.06;
        this.vel[i * 3 + 1] *= -0.25;
      }
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.aColor.needsUpdate = true;
    this.smoke.geometry.attributes.aSize.needsUpdate = true;
    this.smoke.geometry.attributes.aAlpha.needsUpdate = true;

    let n = 0;
    for (let i = 0; i < this.tracerCount; i++) {
      this.tracerLife[i] -= dt;
      if (this.tracerLife[i] <= 0) continue;
      if (n !== i) {
        for (let k = 0; k < 6; k++) {
          this.tracerPos[n * 6 + k] = this.tracerPos[i * 6 + k];
          this.tracerCol[n * 6 + k] = this.tracerCol[i * 6 + k];
        }
        this.tracerLife[n] = this.tracerLife[i];
      }
      n++;
    }
    this.tracerCount = n;
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
  }
}
