// Renderer, camera and resize plumbing, plus the cinematic grade that sits over the scene.
// One WebGL context for the whole game.
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

/**
 * Fixed-size render for the shot recorder: canvas laid out at `width` x `height` (1280x720 by
 * default) and drawn at pixel ratio 1.5, so the capture reads back 1920x1080 and downscales clean.
 */
export function sizeForShot(renderer, camera, width = 1280, height = 720) {
  renderer.setPixelRatio(1.5);
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

/* ------------------------------------------------------------------ the grade */

/**
 * Every knob the grade has, in one place. `exposure` multiplies the day palette's exposure (so the
 * day/night cycle keeps its own contrast range and the grade only sets the overall key), the bloom
 * figures are in scene-linear units before tone mapping, and the tints are plain RGB multipliers on
 * the cool shadows and the warm highlights.
 */
export const GRADE = {
  exposure: 2.25,
  bloomThreshold: 0.85,
  bloomKnee: 0.55,
  bloomStrength: 0.55,
  bloomRadius: 1.6,
  vignette: 0.45,
  grain: 0.031,
  saturation: 1.07,
  shadowTint: [0.88, 0.99, 1.14],
  highlightTint: [1.08, 1.01, 0.90],
};

// A single oversized triangle would save the diagonal, but a 2x2 plane keeps uv math obvious and
// the quad is drawn three times at half res, so the difference does not show up in a capture.
const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Downsample to half res and keep only what is brighter than the threshold. Sampling the full-res
// scene target at half-res uv with linear filtering averages a 2x2 block for free, which is the
// whole point of doing the bloom at half resolution: four scene pixels per bloom pixel.
const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + uKnee, l), 1.0);
  }
`;

// Three taps: centre plus one texel each side, at half res. Run once horizontally and once
// vertically and the result is a 3x3 gaussian approximation — enough to turn a bright pixel into a
// halo, and three taps is what keeps a software rasteriser inside its frame budget.
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb * 0.5;
    c += texture2D(tDiffuse, vUv + uStep).rgb * 0.25;
    c += texture2D(tDiffuse, vUv - uStep).rgb * 0.25;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uExposure;
  uniform float uBloom;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uSaturation;
  uniform float uTime;
  uniform vec3 uShadowTint;
  uniform vec3 uHighlightTint;
  varying vec2 vUv;

  // Narkowicz's ACES fit: the same curve family the renderer used when it tone mapped the scene
  // directly, so the grade changes the contrast without changing what the frame is made of.
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  vec3 toSrgb(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 col = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
    col = aces(col * uExposure);

    // Warm-cool split tone: cool the shadows, warm the highlights, leave the midtones alone.
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col *= mix(uShadowTint, uHighlightTint, smoothstep(0.0, 0.9, l));
    // Saturation after the curve, so the grade never pumps a clipped highlight.
    col = mix(vec3(l), col, uSaturation);

    // Elliptical vignette, strongest in the corners where the bloom never reaches.
    vec2 d = (vUv - 0.5) * vec2(1.0, 0.82);
    col *= 1.0 - uVignette * smoothstep(0.09, 0.42, dot(d, d));

    col = toSrgb(col);
    // Grain last and in display space: it is a film artefact, not a light. Hashed on the fragment
    // coordinate so it stays put between frames instead of boiling.
    col += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Scene -> half-res bloom -> grade -> canvas.
 *
 * The scene is rendered into a half-float target, which is what makes this work at all: three
 * skips tone mapping when the render target is not the canvas, so the target holds linear HDR
 * values and the composite owns exposure, the ACES curve and the colour grade in one pass.
 */
export class PostPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    const gl = renderer.getContext();
    const canFloat = !!(
      (renderer.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) ||
      gl.getExtension('OES_texture_half_float')
    );
    this.hdrType = canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.width = 0;
    this.height = 0;
    this.time = 0;
    // Per-shot key, on top of the day palette and the grade's own exposure: a street in shadow
    // needs a stop more than a beach at noon, and the four stored stills are lit one at a time.
    this.exposureScale = 1;
    this.sizeVec = new THREE.Vector2();

    const target = (depth) => new THREE.WebGLRenderTarget(1, 1, {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: depth,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.sceneRT = target(true);
    this.bloomA = target(false);
    this.bloomB = target(false);
    this.bloomTexel = new THREE.Vector2(1, 1);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uThreshold: { value: GRADE.bloomThreshold },
        uKnee: { value: GRADE.bloomKnee },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uExposure: { value: GRADE.exposure },
        uBloom: { value: GRADE.bloomStrength },
        uVignette: { value: GRADE.vignette },
        uGrain: { value: GRADE.grain },
        uSaturation: { value: GRADE.saturation },
        uTime: { value: 0 },
        uShadowTint: { value: new THREE.Vector3(...GRADE.shadowTint) },
        uHighlightTint: { value: new THREE.Vector3(...GRADE.highlightTint) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    // One quad, three materials: the mesh is re-pointed rather than kept three times over.
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    // The quad shader writes clip space directly; the camera only exists because render() wants one.
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Keep the targets in step with the drawing buffer, which changes with pixel ratio and window. */
  setSize(width, height) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.sceneRT.setSize(width, height);
    const bw = Math.max(1, Math.floor(width / 2));
    const bh = Math.max(1, Math.floor(height / 2));
    this.bloomA.setSize(bw, bh);
    this.bloomB.setSize(bw, bh);
    this.bloomTexel.set(1 / bw, 1 / bh);
  }

  pass(material, targetRT) {
    this.quad.material = material;
    this.renderer.setRenderTarget(targetRT);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(scene, camera, dt = 0) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.sizeVec);
    this.setSize(this.sizeVec.x, this.sizeVec.y);
    this.time = (this.time + dt) % 100;

    // 1. the scene, untouched and in linear HDR
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    // 2. bright pass into half res, then a 3-tap blur out and back
    this.brightMat.uniforms.tScene.value = this.sceneRT.texture;
    this.pass(this.brightMat, this.bloomA);

    const u = this.blurMat.uniforms;
    u.tDiffuse.value = this.bloomA.texture;
    u.uStep.value.set(this.bloomTexel.x * GRADE.bloomRadius, 0);
    this.pass(this.blurMat, this.bloomB);

    u.tDiffuse.value = this.bloomB.texture;
    u.uStep.value.set(0, this.bloomTexel.y * GRADE.bloomRadius);
    this.pass(this.blurMat, this.bloomA);

    // 3. composite to the canvas
    const c = this.compositeMat.uniforms;
    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = this.bloomA.texture;
    // The day cycle owns its own exposure range; the grade sets the overall key on top of it.
    c.uExposure.value = r.toneMappingExposure * GRADE.exposure * this.exposureScale;
    c.uTime.value = this.time * 60;
    this.pass(this.compositeMat, null);
  }
}
