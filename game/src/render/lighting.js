// Day/night cycle and the scene's whole light rig. Three lights do all the work: one shadow-casting
// sun, one moon fill that never switches off, and a hemisphere/ambient pair that carries the colour.
import * as THREE from '../../vendor/three.module.min.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

const PALETTES = {
  day: {
    top: 0x2c74b8, horizon: 0xcfe2ee, ground: 0x2a3140, sun: 0xfff3dc,
    hemiSky: 0xa8c8e6, hemiGround: 0x6d6455, ambient: 0x8fa6bd,
    sunI: 3.15, hemiI: 0.95, ambI: 0.46, fog: 0xc6d8e4, fogNear: 90, fogFar: 620, exposure: 1.22,
  },
  dusk: {
    top: 0x2c4c86, horizon: 0xffb877, ground: 0x2b2534, sun: 0xffb268,
    hemiSky: 0xffb98a, hemiGround: 0x5a4256, ambient: 0x6b5a72,
    sunI: 2.35, hemiI: 0.78, ambI: 0.46, fog: 0xe0a878, fogNear: 80, fogFar: 560, exposure: 1.3,
  },
  night: {
    top: 0x050b18, horizon: 0x16263f, ground: 0x0a1220, sun: 0x9db4e0,
    hemiSky: 0x2d4370, hemiGround: 0x141c2c, ambient: 0x33456b,
    sunI: 0.0, hemiI: 1.15, ambI: 1.05, fog: 0x1b2c46, fogNear: 65, fogFar: 500, exposure: 1.72,
  },
};

const tmpColor = new THREE.Color();

function mixPalette(a, b, t, key) {
  if (typeof a[key] === 'number') return lerp(a[key], b[key], t);
  return tmpColor.set(a[key]).lerp(new THREE.Color(b[key]), t).getHex();
}

export class DayCycle {
  constructor(scene) {
    this.scene = scene;
    this.hour = 15.5;
    this.speed = 0.9; // game minutes per real second
    this.night = 0;
    this.sunUp = 1;
    this.sunDir = new THREE.Vector3(0.4, 0.7, 0.6).normalize();
    this.moonDir = new THREE.Vector3(-0.4, -0.7, -0.6).normalize();
    this.sunColor = new THREE.Color(0xfff3dc);
    this.horizon = new THREE.Color(0xcfe2ee);

    this.sun = new THREE.DirectionalLight(0xfff3dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 1; sc.far = 300;
    // Without this the ortho bounds above are never applied: the shadow camera keeps its default
    // +/-5 box, every fragment outside it samples a clamped edge texel and the whole city is
    // shadowed by the nearest wall.
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // The moon is the reason night frames are readable instead of black: the sun's intensity can
    // fall to zero at dusk, so this dim blue-grey directional plus the fill below always stays on.
    this.moon = new THREE.DirectionalLight(0x9db6e8, 0.55);
    this.moon.castShadow = false;
    scene.add(this.moon);
    scene.add(this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xa8c8e6, 0x6d6455, 0.6);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x8fa6bd, 0.3);
    scene.add(this.ambient);

    this.fog = new THREE.Fog(0xc6d8e4, 90, 620);
    scene.fog = this.fog;
    this.palette = PALETTES.day;
    this.apply(0);
  }

  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
    this.apply(0);
  }

  /** Advance the clock; `focus` keeps the shadow frustum around the player. */
  update(dt, focus) {
    this.hour = (this.hour + (dt * this.speed) / 60) % 24;
    this.apply(dt, focus);
  }

  apply(dt, focus) {
    const ang = ((this.hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(ang);
    // The sun rides across the southern sky so it sets over the water at the end of the coast
    // boulevard: a sunset shot looks down the road straight into it.
    this.sunDir.set(-Math.cos(ang) * 0.34, elevation, -0.94).normalize();
    this.moonDir.set(-this.sunDir.x, Math.max(0.22, -this.sunDir.y), -this.sunDir.z).normalize();

    const daylight = smoothstep(-0.10, 0.24, elevation);
    const dusk = Math.exp(-Math.pow((elevation - 0.02) / 0.17, 2));
    this.night = 1 - daylight;
    this.sunUp = clamp(elevation * 3 + 0.4, 0, 1);

    const base = this.night > 0.55 ? PALETTES.night : PALETTES.day;
    const p = {};
    for (const k of Object.keys(PALETTES.day)) p[k] = mixPalette(PALETTES.day, PALETTES.night, this.night, k);
    if (dusk > 0.02) {
      for (const k of Object.keys(PALETTES.dusk)) {
        if (typeof p[k] === 'number') p[k] = lerp(p[k], PALETTES.dusk[k], dusk * 0.85);
      }
    }
    this.palette = p;
    this.horizon.set(p.horizon);
    this.sunColor.set(p.sun);

    this.sun.color.copy(this.sunColor);
    this.sun.intensity = p.sunI * (0.35 + this.sunUp * 0.65) * (1 - this.night * 0.55);
    const sunDist = 110;
    const sx = focus ? focus.x : 0;
    const sz = focus ? focus.z : 0;
    this.sun.position.set(sx + this.sunDir.x * sunDist, this.sunDir.y * sunDist + 12, sz + this.sunDir.z * sunDist);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();

    this.moon.color.set(0x9db2e0);
    this.moon.intensity = 0.24 + this.night * 0.72;
    this.moon.position.set(sx + this.moonDir.x * 90, 70, sz + this.moonDir.z * 90);
    this.moon.target.position.set(sx, 0, sz);
    this.moon.target.updateMatrixWorld();

    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    this.ambient.color.set(p.ambient);
    this.ambient.intensity = p.ambI;

    this.fog.color.set(p.fog);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
  }

  /** How "on" the streetlights and neon are, 0 by day, 1 after dark. */
  get lampGlow() {
    return smoothstep(0.12, 0.62, this.night);
  }
}

/**
 * Two lights that exist only for the cover frame: a warm key raking in from camera-left at 45
 * degrees and a cool rim from behind the car. Neither casts a shadow — the sun already owns the
 * shadow map, and the point of these is separation, not a second set of contact shadows.
 *
 * They are built switched off and only the cover shot turns them on, so every other still keeps the
 * exact lighting it was graded with.
 */
export class HeroLights {
  constructor(scene) {
    this.scene = scene;
    // warm, from the sunset side but off the sun's own axis so it reads as a second source
    this.key = new THREE.DirectionalLight(0xffc48a, 0);
    this.key.castShadow = false;
    scene.add(this.key);
    scene.add(this.key.target);
    // cool, from the opposite quarter: this is what draws a bright edge down the car's flank
    this.rim = new THREE.DirectionalLight(0x9ec8ff, 0);
    this.rim.castShadow = false;
    scene.add(this.rim);
    scene.add(this.rim.target);
    this.on = false;
    this.left = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.focus = new THREE.Vector3();
  }

  /** Switch the rig on or off for the frame; `focus` is the car the lights are aimed at. */
  set(enabled) {
    this.on = enabled;
    this.key.visible = enabled;
    this.rim.visible = enabled;
  }

  /**
   * Place both lights relative to the final camera and the car, so the key is always camera-left at
   * 45 degrees and the rim is always behind the car regardless of where the rig ended up.
   */
  update(camera, focus) {
    if (!this.on || !focus) return;
    this.focus.copy(focus);
    // camera-left in world space: the camera's local -X axis
    this.left.set(-1, 0, 0).applyQuaternion(camera.quaternion);
    this.left.y = 0;
    if (this.left.lengthSq() < 1e-6) this.left.set(0, 0, 1);
    this.left.normalize();

    // 45 degrees to the camera axis, on the camera's left, then 45 degrees up. The base vector has
    // to point from the car back toward the camera: keying from the far side of the subject puts the
    // light beyond it and lights nothing the lens can see.
    const c45 = Math.cos(Math.PI / 4);
    const s45 = Math.sin(Math.PI / 4);
    this.dir.copy(camera.position).sub(this.focus);
    this.dir.y = 0;
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, 1);
    this.dir.normalize();
    const hx = this.dir.x * c45 + this.left.x * s45;
    const hz = this.dir.z * c45 + this.left.z * s45;
    this.dir.set(hx, 0, hz).normalize();
    this.dir.multiplyScalar(c45);
    this.dir.y = s45;
    this.dir.normalize();
    this.key.position.copy(this.focus).addScaledVector(this.dir, 34);
    this.key.target.position.copy(this.focus);
    this.key.target.updateMatrixWorld();
    this.key.intensity = 3.4;

    // rim: from the far side of the car as seen from the camera, lifted a little
    this.dir.copy(this.focus).sub(camera.position);
    this.dir.y = 0;
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, 1);
    this.dir.normalize();
    this.dir.y = 0.42;
    this.dir.normalize();
    this.rim.position.copy(this.focus).addScaledVector(this.dir, 30);
    this.rim.target.position.copy(this.focus);
    this.rim.target.updateMatrixWorld();
    this.rim.intensity = 1.6;
  }
}

/**
 * A soft fill light riding on the camera. Night streets are lit by lamps that rarely point at the
 * hero, so a low-intensity, shadowless key from over the camera's shoulder is what keeps the player
 * character and their car readable in a night frame without flattening the whole scene.
 */
export class CameraFillLight {
  constructor(scene) {
    this.light = new THREE.DirectionalLight(0xbcd2f0, 0.55);
    this.light.castShadow = false;
    scene.add(this.light);
    scene.add(this.light.target);
    this.temp = new THREE.Vector3();
  }

  update(camera, night) {
    this.temp.set(0, 0.35, -1).applyQuaternion(camera.quaternion);
    this.light.position.copy(camera.position).addScaledVector(this.temp, 12);
    this.light.position.y += 6;
    this.light.target.position.copy(camera.position).addScaledVector(this.temp, 26);
    this.light.target.position.y = 1.2;
    this.light.target.updateMatrixWorld();
    this.light.intensity = 0.3 + night * 0.85;
  }
}
