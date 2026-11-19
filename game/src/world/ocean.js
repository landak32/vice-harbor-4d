// The coast: sand strip, a wooden pier and an animated ocean. The water is a small vertex-displaced
// shader with a sun-glitter term — cheap enough for software rendering, alive enough to read as sea.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder } from './merge.js';
import { sandTexture, pavementTexture } from '../render/textures.js';
import { Rng } from '../core/rng.js';
import { CITY_HALF } from './city.js';

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec3 p = position;
    vec4 world = modelMatrix * vec4(p, 1.0);
    float w = sin(world.x * 0.055 + uTime * 1.15) * 0.34
            + sin(world.z * 0.082 - uTime * 0.92) * 0.26
            + sin((world.x + world.z) * 0.031 + uTime * 0.55) * 0.2;
    world.y += w;
    vWave = w;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uGlow;
  varying vec3 vWorld;
  varying float vWave;

  void main() {
    float depth = smoothstep(0.0, 80.0, vWorld.x - 300.0);
    vec3 col = mix(uShallow, uDeep, depth);
    float bands = sin(vWorld.z * 0.42 + uTime * 1.7 + sin(vWorld.x * 0.21 + uTime)) * 0.5 + 0.5;
    float sparkle = pow(bands, 9.0) * (0.35 + 0.65 * max(dot(normalize(uSunDir), vec3(0.0, 0.2, 1.0)), 0.0));
    col += uSunColor * sparkle * 0.55;
    col += uSky * (0.18 + vWave * 0.12);
    // surf line against the sand
    float surf = smoothstep(14.0, 0.0, vWorld.x - 294.0) * (0.55 + 0.45 * sin(uTime * 1.6 + vWorld.z * 0.12));
    col = mix(col, vec3(0.93, 0.95, 0.94) * (0.55 + uGlow * 0.45), surf * 0.55);
    float dist = length(vWorld - cameraPosition);
    float f = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, f);
    gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(0.4545)), 1.0);
  }
`;

export class Coast {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = new Rng(seed);
    this.group = new THREE.Group();
    this.group.name = 'coast';
    scene.add(this.group);
    const rng = this.rng;

    const sand = sandTexture(rng);
    sand.repeat.set(24, 120);
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(48, CITY_HALF * 2 + 200, 8, 40),
      new THREE.MeshLambertMaterial({ map: sand, color: 0xd9c9a6 }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(CITY_HALF + 30, 0.06, 0);
    beach.receiveShadow = true;
    beach.name = 'beach';
    this.group.add(beach);

    // a wet-sand band where the water meets the beach
    const wet = new THREE.Mesh(
      new THREE.PlaneGeometry(10, CITY_HALF * 2 + 200),
      new THREE.MeshLambertMaterial({ color: 0x8f7f66 }),
    );
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(CITY_HALF + 51, 0.07, 0);
    this.group.add(wet);

    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x123c52) },
      uShallow: { value: new THREE.Color(0x2f8a92) },
      uSky: { value: new THREE.Color(0x9fc4d8) },
      uSunColor: { value: new THREE.Color(0xffd7a0) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.6) },
      uFogColor: { value: new THREE.Color(0xc6d8e4) },
      uFogNear: { value: 120 },
      uFogFar: { value: 900 },
      uGlow: { value: 1 },
    };
    const waterGeo = new THREE.PlaneGeometry(1100, CITY_HALF * 2 + 600, 44, 64);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeo,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG }),
    );
    this.water.position.set(CITY_HALF + 54 + 550, 0.0, 0);
    this.water.name = 'ocean';
    this.water.frustumCulled = false;
    this.group.add(this.water);

    this.buildPier();
    this.buildLifeguards();
    this.buildBeachPalms();
  }

  buildPier() {
    const g = new GeoBuilder();
    const wood = [0.36, 0.28, 0.2];
    const dark = [0.24, 0.19, 0.14];
    const z = -70;
    const len = 150;
    g.box(CITY_HALF + 70, 1.1, z, len, 0.35, 12, { color: wood, uvScale: 3, vScale: 3 });
    for (let i = 0; i < 13; i++) {
      const x = CITY_HALF + 6 + i * 11;
      g.box(x, 0.2, z - 5.4, 0.5, 2.2, 0.5, { color: dark, uvScale: 1, vScale: 1 });
      g.box(x, 0.2, z + 5.4, 0.5, 2.2, 0.5, { color: dark, uvScale: 1, vScale: 1 });
      if (i % 2 === 0) g.box(x, 1.9, z - 5.6, 0.16, 1.3, 0.16, { color: dark, uvScale: 1, vScale: 1 });
    }
    // a small pavilion at the end of the pier
    g.box(CITY_HALF + 138, 3.1, z, 12, 4.0, 12, { color: [0.2, 0.3, 0.34], uvScale: 4, vScale: 4 });
    g.box(CITY_HALF + 138, 5.4, z, 14, 0.5, 14, { color: [0.85, 0.6, 0.3], uvScale: 2, vScale: 2 });
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'pier';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildLifeguards() {
    const g = new GeoBuilder();
    for (let i = 0; i < 3; i++) {
      const z = -140 + i * 120;
      const x = CITY_HALF + 34;
      g.box(x, 1.6, z, 3.4, 3.2, 3.4, { color: [0.86, 0.52, 0.34], uvScale: 2, vScale: 2 });
      g.box(x, 3.5, z, 4.2, 0.3, 4.2, { color: [0.9, 0.9, 0.86], uvScale: 2, vScale: 2 });
      g.box(x, 4.6, z, 0.16, 2.0, 0.16, { color: [0.8, 0.8, 0.8], uvScale: 1, vScale: 1 });
    }
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  /** A row of palms between the promenade and the sand: the coast shot's silhouette. */
  buildBeachPalms() {
    const g = new GeoBuilder();
    const trunk = [0.34, 0.26, 0.18];
    const leaf = [0.2, 0.46, 0.26];
    for (let i = 0; i < 6; i++) {
      const y = i * 1.05 + 0.5;
      const w = 0.42 - i * 0.035;
      g.box(0.1 * i, y, 0, w, 1.1, w, { color: trunk, uvScale: 2, vScale: 2 });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const droop = 0.34 + (i % 3) * 0.13;
      const blade = new THREE.BoxGeometry(3.2, 0.07, 0.74);
      const m = new THREE.Matrix4().makeTranslation(0, 6.4, 0)
        .multiply(new THREE.Matrix4().makeRotationY(a))
        .multiply(new THREE.Matrix4().makeTranslation(1.6, 0, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(-droop));
      g.add(blade, m, leaf);
    }
    g.box(0.55, 6.3, 0, 1.1, 0.7, 1.1, { color: [0.3, 0.32, 0.18], uvScale: 2, vScale: 2 });
    const geo = g.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const placements = [];
    for (let i = 0; i < 26; i++) {
      const z = -220 + i * 17 + this.rng.range(-3, 3);
      placements.push({
        x: CITY_HALF + 11 + this.rng.range(-1.5, 2.5),
        z,
        yaw: this.rng.float() * 6.28,
        s: this.rng.range(0.9, 1.25),
      });
    }
    const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    placements.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(0, p.yaw, 0));
      v.set(p.x, 0, p.z);
      sc.setScalar(p.s);
      m.compose(v, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = 'beachPalms';
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  update(dt, time, dayCycle) {
    this.uniforms.uTime.value = time;
    const p = dayCycle.palette;
    this.uniforms.uFogColor.value.set(p.fog);
    this.uniforms.uSunDir.value.copy(dayCycle.sunDir);
    this.uniforms.uSunColor.value.set(p.sun);
    this.uniforms.uSky.value.set(p.horizon);
    this.uniforms.uDeep.value.set(dayCycle.night > 0.5 ? 0x081420 : 0x123c52);
    this.uniforms.uShallow.value.set(dayCycle.night > 0.5 ? 0x123a44 : 0x2f8a92);
    this.uniforms.uGlow.value = 1 - dayCycle.night * 0.6;
    this.uniforms.uFogNear.value = p.fogNear * 1.6;
    this.uniforms.uFogFar.value = p.fogFar * 1.9;
    void dt;
  }
}
