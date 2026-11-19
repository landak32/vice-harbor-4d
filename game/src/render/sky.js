// Sky dome, sun, moon and stars. A single inward-facing sphere with a gradient shader; the sun and
// moon are painted into the same shader from a direction vector, so they stay cheap and always sit
// where the lighting says they are.
import * as THREE from '../../vendor/three.module.min.js';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 moonDir;
  uniform float sunDisc;
  uniform float moonDisc;
  uniform float haze;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.72));
    col = mix(col, groundColor, smoothstep(0.52, 0.42, h));
    float sd = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * pow(sd, 6.0) * 0.42 * haze;
    col += sunColor * smoothstep(0.9975, 0.9995, sd) * 2.6 * sunDisc;
    float md = max(dot(d, normalize(moonDir)), 0.0);
    col += vec3(0.72, 0.80, 1.0) * smoothstep(0.9988, 0.9997, md) * 1.7 * moonDisc;
    col += vec3(0.42, 0.52, 0.82) * pow(md, 30.0) * 0.16 * moonDisc;
    // A raw ShaderMaterial bypasses the renderer's output encode, so the linear colour is
    // converted to sRGB here or the whole sky renders near-black.
    gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(0.4545)), 1.0);
  }
`;

export class SkyDome {
  constructor(scene) {
    this.uniforms = {
      topColor: { value: new THREE.Color(0x2b6ea8) },
      horizonColor: { value: new THREE.Color(0xf2c48a) },
      groundColor: { value: new THREE.Color(0x1a2230) },
      sunDir: { value: new THREE.Vector3(0.3, 0.5, 0.8) },
      sunColor: { value: new THREE.Color(0xffd9a0) },
      moonDir: { value: new THREE.Vector3(-0.3, 0.6, -0.7) },
      sunDisc: { value: 1 },
      moonDisc: { value: 0 },
      haze: { value: 1 },
    };
    const geo = new THREE.SphereGeometry(1200, 32, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'skyDome';
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
    this.stars = this.buildStars(scene);
    this.clouds = this.buildClouds(scene);
  }

  /** A thin shell of points, fading in with the night factor. */
  buildStars(scene) {
    const count = 700;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random() * 0.62 + 0.16;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v);
      const r = 1100;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      size[i] = 1 + Math.random() * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xdfe9ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.name = 'stars';
    points.renderOrder = -9;
    scene.add(points);
    return points;
  }

  /** Two soft cloud bands: large additive planes high up, drifting with the wind. */
  buildClouds(scene) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    for (let i = 0; i < 34; i++) {
      const x = Math.random() * 256;
      const y = 18 + Math.random() * 28;
      const r = 10 + Math.random() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 7; i++) {
      const w = 420 + Math.random() * 380;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.22), this.cloudMaterial);
      const a = (i / 7) * Math.PI * 2 + Math.random();
      plane.position.set(Math.cos(a) * 620, 150 + Math.random() * 120, Math.sin(a) * 620);
      plane.lookAt(0, plane.position.y * 0.4, 0);
      plane.renderOrder = -8;
      plane.name = 'cloudPlane';
      group.add(plane);
    }
    group.name = 'clouds';
    scene.add(group);
    return group;
  }

  update(night, sunDir, moonDir, sunColor) {
    const u = this.uniforms;
    u.sunDir.value.copy(sunDir);
    u.moonDir.value.copy(moonDir);
    u.sunColor.value.copy(sunColor);
    u.sunDisc.value = 1 - night * 0.96;
    u.moonDisc.value = night;
    this.stars.material.opacity = Math.max(0, night * 1.15 - 0.15);
    this.cloudMaterial.opacity = 0.16 + (1 - night) * 0.34;
    this.clouds.rotation.y += 0.00004;
  }

  /** The sky follows the camera so the horizon never runs out. */
  follow(camera) {
    this.mesh.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.clouds.position.set(camera.position.x * 0.9, 0, camera.position.z * 0.9);
  }

  setPalette(top, horizon, ground) {
    this.uniforms.topColor.value.set(top);
    this.uniforms.horizonColor.value.set(horizon);
    this.uniforms.groundColor.value.set(ground);
  }
}
