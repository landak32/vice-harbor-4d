// Renderer, camera and resize plumbing. One WebGL context for the whole game.
import * as THREE from '../../vendor/three.module.min.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    // Headless Chrome reads the canvas back after the frame is submitted. Without a preserved
    // drawing buffer the buffer has already been cleared by then and every capture comes back
    // black, so this stays on: it is the difference between a screenshot and a black rectangle.
    preserveDrawingBuffer: true,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  // One 1024 map, PCF (not soft): soft shadows cost more per tap than they are worth here.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  return renderer;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.4, 1600);
  camera.position.set(0, 6, -12);
  return camera;
}

/** Fixed-size render for the shot recorder: exactly 1280x720, device pixel ratio 1. */
export function sizeForShot(renderer, camera, width = 1280, height = 720) {
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function handleResize(renderer, camera) {
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

/** Tiny pixel sampler used by the boot self-test (and by me, to prove a frame is not black). */
export function sampleCanvas(canvas) {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!gl) return null;
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0], px[1], px[2], px[3]];
}
