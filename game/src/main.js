// Vice Harbor — entry point. Builds the world from the seed, wires the game systems together and
// runs the fixed-timestep loop. `?shot=<name>&seed=<n>` boots straight into a scene, drives it with
// an autopilot, re-dresses it around the final camera and renders exactly one frame.
import * as THREE from '../vendor/three.module.min.js';
import { createRenderer, createCamera, handleResize, sizeForShot, PostPipeline } from './render/renderer.js';
import { SkyDome } from './render/sky.js';
import { DayCycle, CameraFillLight, HeroLights } from './render/lighting.js';
import { Effects } from './render/effects.js';
import { City } from './world/city.js';
import { Buildings } from './world/buildings.js';
import { StreetProps } from './world/props.js';
import { Coast } from './world/ocean.js';
import { Skyline } from './world/skyline.js';
import { CollisionWorld } from './systems/collision.js';
import { Pedestrians } from './entities/pedestrians.js';
import { TrafficSystem } from './entities/traffic.js';
import { AudioEngine } from './systems/audio.js';
import { Game } from './systems/game.js';
import { Autopilot, SHOTS } from './systems/shots.js';
import { Input } from './core/input.js';
import { FixedStep } from './core/timestep.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shotName = params.get('shot');
const isShot = !!shotName && !!SHOTS[shotName];

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const post = new PostPipeline(renderer);
const camera = createCamera();
const scene = new THREE.Scene();
scene.userData.camera = camera;

const sky = new SkyDome(scene);
const day = new DayCycle(scene);
const effects = new Effects(scene);
const fill = new CameraFillLight(scene);
// cover-only key + rim rig; built switched off, so no other shot is lit by it
const hero = new HeroLights(scene);
const audio = new AudioEngine();

const city = new City(scene, seed);
const buildings = new Buildings(scene, city, seed + 1);
const props = new StreetProps(scene, city, seed + 2);
const coast = new Coast(scene, seed + 3);
const skyline = new Skyline(scene, seed + 4);
const collision = new CollisionWorld(city);
const pedestrians = new Pedestrians(scene, city, collision, seed + 5, 96);
const traffic = new TrafficSystem(scene, city, seed + 6, 38);

const world = { scene, city, buildings, props, coast, skyline, collision, day, effects, audio, camera, pedestrians, traffic, seed, sky, post, hero };
const game = new Game(world);

// Development aid: ?hide=nameA,nameB switches named objects off, used to bisect a bad frame.
const hideList = (params.get('hide') ?? '').split(',').filter(Boolean);
if (hideList.length) {
  scene.traverse((o) => {
    if (o.name && hideList.some((n) => o.name.includes(n))) o.visible = false;
  });
}

let time = 0;
let frames = 0;

/** One simulation step: the world's ambient systems plus the game's own. */
function worldStep(dt, input) {
  time += dt;
  const focus = game.driving ? game.car.group.position : game.walker;
  day.update(dt, focus);
  buildings.setNight(day.lampGlow);
  props.update(dt, day.lampGlow);
  city.updateWetness(day);
  coast.update(dt, time, day);
  skyline.update(day);
  sky.update(day.night, day.sunDir, day.moonDir, day.sunColor);
  sky.setPalette(day.palette.top, day.palette.horizon, day.palette.ground);
  game.step(dt, input);
  fill.update(camera, day.night);
  sky.follow(camera);
}

function render(dt = 0) {
  renderer.info.reset();
  // Scene into a linear HDR target, then bloom + grade back onto the canvas. Exposure follows the
  // day palette (it has carried a per-palette `exposure` since the start; the grade is what reads it).
  renderer.toneMappingExposure = day.palette.exposure;
  post.render(scene, camera, dt);
  frames++;
}

function updateHud() {
  game.hud.update(game.hudSnapshot());
  game.drawMinimap();
}

/* ------------------------------------------------------------------ shot recording */

function runShot(name) {
  const shot = SHOTS[name];
  const autopilot = new Autopilot();
  const setup = shot.setup(game, world);
  game.hud.show(true);
  // the cover is key art, not a capture: every HUD panel goes away and the title block takes over
  document.body.classList.toggle('cover-shot', name === 'cover');
  document.getElementById('title')?.classList.remove('on');
  sizeForShot(renderer, camera, 1280, 720);

  const step = new FixedStep();
  step.runFixed(setup.seconds, (dt) => {
    setup.script(step.elapsed, autopilot);
    worldStep(dt, autopilot);
    autopilot.endStep();
  });

  // the frame is dressed around where the camera ended up, not where it started
  shot.redress(game, world);

  // settle the camera onto its final pose and refresh the presentation systems once
  game.rig.snap(game.driving
    ? { x: game.car.group.position.x, z: game.car.group.position.z, y: 0, yaw: game.car.group.rotation.y, speed: Math.abs(game.carPhysics.speed), driving: true }
    : { x: game.walker.x, z: game.walker.z, y: game.walker.y, yaw: game.walker.yaw, speed: 0, driving: false });
  fill.update(camera, day.night);
  // hero key + rim: cover only, placed from the pose the camera actually settled on
  world.hero.set(name === 'cover');
  world.hero.update(camera, game.driving ? game.car.group.position : game.walker);
  sky.follow(camera);
  updateHud();
  game.hud.tick(0.016);

  render();
  window.__vh = {
    frames,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    shot: name,
    ready: true,
  };
  window.__dbg = { game, world, camera, renderer, scene, day };
  document.getElementById('loading')?.remove();
  document.body.classList.add('playing');
}

/* ------------------------------------------------------------------ normal play */

function startPlay() {
  document.getElementById('title')?.classList.remove('on');
  game.hud.show(true);
  game.menus.hideTitle();
  audio.start();
  audio.startRadio();
  audio.play('click');
  canvas.requestPointerLock?.();
}

function bindMenuKeys(input) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && game.menus.state === 'title') {
      startPlay();
    } else if (e.code === 'Escape') {
      if (game.menus.state === 'playing') {
        game.paused = true;
        game.menus.showPause();
        input.releaseLock();
      } else if (game.menus.state === 'paused') {
        game.paused = false;
        game.menus.hidePause();
      }
    } else if (e.code === 'Enter' && game.menus.state === 'dead') {
      game.respawn();
    } else if (e.code === 'KeyR' && (game.menus.state === 'paused' || game.menus.state === 'dead')) {
      game.respawn();
      game.paused = false;
      game.menus.hidePause();
    }
  });
  canvas.addEventListener('click', () => {
    if (game.menus.state === 'playing') input.requestLock();
    audio.resume();
  });
}

function boot() {
  if (isShot) {
    runShot(shotName);
    return;
  }
  document.getElementById('loading')?.remove();
  game.menus.showTitle();
  const input = new Input(canvas);
  bindMenuKeys(input);
  const step = new FixedStep();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game.menus.state === 'playing' && !game.paused) {
      step.advance(dt, (fixed) => {
        if (input.mouse.dx || input.mouse.dy) game.rig.look(input.mouse.dx, input.mouse.dy);
        worldStep(fixed, input);
      });
    } else {
      // the world still breathes behind the menus
      step.advance(dt * 0.35, (fixed) => worldStep(fixed, null));
    }
    updateHud();
    render(dt);
    window.__vh = { frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

handleResize(renderer, camera);
boot();
