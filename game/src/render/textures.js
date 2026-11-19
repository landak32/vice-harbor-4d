// Every texture in Vice Harbor is painted here, at runtime, into a 2D canvas: facades, storefronts,
// neon signs, pavement, sand, awnings and the soft sprites used for glow and smoke. No image files.
import * as THREE from '../../vendor/three.module.min.js';
import { css } from '../core/math.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Grainy wash that keeps large flat walls from looking like plastic. */
function grain(g, w, h, rng, count, alpha, light = true) {
  for (let i = 0; i < count; i++) {
    const x = rng.float() * w;
    const y = rng.float() * h;
    const s = 1 + rng.float() * 3;
    g.fillStyle = light ? `rgba(255,255,255,${alpha * rng.float()})` : `rgba(0,0,0,${alpha * rng.float()})`;
    g.fillRect(x, y, s, s);
  }
}

function grime(g, w, h, rng, color) {
  for (let i = 0; i < 8; i++) {
    const x = rng.float() * w;
    const ww = 4 + rng.float() * 18;
    const grad = g.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, css(color[0], color[1], color[2], 0.1));
    grad.addColorStop(1, css(color[0], color[1], color[2], 0));
    g.fillStyle = grad;
    g.fillRect(x, rng.float() * h * 0.4, ww, h);
  }
}

/**
 * One facade tile: 8 m wide by 12.8 m tall (4 floors, 4 window bays), tileable in both directions
 * so a merged wall can just repeat it. Returns the colour map plus a matching emissive map in which
 * only the lit windows are painted, which is what turns the city on after dark.
 */
export function facadeTextures(rng, style, pal) {
  const S = 256;
  const map = makeCanvas(S, S);
  const emi = makeCanvas(S, S);
  const g = map.getContext('2d');
  const e = emi.getContext('2d');
  const floors = 4;
  const bays = 4;
  const fh = S / floors;
  const bw = S / bays;

  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, css(pal.wall[0] * 1.06, pal.wall[1] * 1.06, pal.wall[2] * 1.06));
  grad.addColorStop(0.55, css(pal.wall[0], pal.wall[1], pal.wall[2]));
  grad.addColorStop(1, css(pal.wall[0] * 0.86, pal.wall[1] * 0.86, pal.wall[2] * 0.86));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);

  if (style === 'brick') {
    for (let y = 0; y < S; y += 8) {
      g.fillStyle = css(pal.wall[0] * 0.9, pal.wall[1] * 0.9, pal.wall[2] * 0.9, 0.55);
      g.fillRect(0, y, S, 1.4);
      const off = (y / 8) % 2 ? 10 : 0;
      for (let x = off; x < S; x += 20) {
        g.fillRect(x, y, 1.2, 8);
      }
    }
  }
  if (style === 'deco') {
    for (let i = 0; i < bays; i++) {
      g.fillStyle = css(pal.trim[0], pal.trim[1], pal.trim[2], 0.85);
      g.fillRect(i * bw + 2, 0, 6, S);
    }
    for (let i = 0; i < floors; i++) {
      g.fillStyle = css(pal.trim[0] * 0.8, pal.trim[1] * 0.8, pal.trim[2] * 0.8, 0.7);
      g.fillRect(0, i * fh, S, 3);
    }
  }
  if (style === 'glass') {
    g.fillStyle = css(12, 22, 34, 0.55);
    g.fillRect(0, 0, S, S);
    for (let i = 0; i <= bays; i++) {
      g.fillStyle = css(pal.trim[0], pal.trim[1], pal.trim[2], 0.55);
      g.fillRect(i * bw - 1.5, 0, 3, S);
    }
  }

  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    g.fillStyle = css(pal.trim[0] * 0.72, pal.trim[1] * 0.72, pal.trim[2] * 0.72, 0.9);
    g.fillRect(0, y0 + fh - 3, S, 3);
    for (let b = 0; b < bays; b++) {
      const x0 = b * bw;
      const wx = x0 + bw * 0.18;
      const wy = y0 + fh * 0.16;
      const ww = bw * 0.64;
      const wh = fh * 0.56;
      // reveal / frame
      g.fillStyle = css(pal.trim[0] * 0.55, pal.trim[1] * 0.55, pal.trim[2] * 0.55);
      g.fillRect(wx - 2.5, wy - 2.5, ww + 5, wh + 5);
      const lit = rng.chance(style === 'glass' ? 0.42 : 0.3);
      const glassTop = lit ? [255, 208, 138] : [pal.glass[0] * 1.5, pal.glass[1] * 1.6, pal.glass[2] * 1.75];
      const glassBot = lit ? [206, 138, 74] : [pal.glass[0] * 0.8, pal.glass[1] * 0.9, pal.glass[2]];
      const gg = g.createLinearGradient(wx, wy, wx + ww * 0.3, wy + wh);
      gg.addColorStop(0, css(glassTop[0], glassTop[1], glassTop[2]));
      gg.addColorStop(1, css(glassBot[0], glassBot[1], glassBot[2]));
      g.fillStyle = gg;
      g.fillRect(wx, wy, ww, wh);
      // mullion
      g.fillStyle = css(pal.trim[0] * 0.45, pal.trim[1] * 0.45, pal.trim[2] * 0.45, 0.9);
      g.fillRect(wx + ww * 0.48, wy, 1.6, wh);
      if (rng.chance(0.3)) {
        g.fillStyle = 'rgba(255,255,255,0.09)';
        g.fillRect(wx, wy + wh * rng.float(), ww, 1.4);
      }
      if (rng.chance(0.22)) {
        g.fillStyle = css(pal.trim[0] * 0.8, pal.trim[1] * 0.8, pal.trim[2] * 0.8, 0.6);
        g.fillRect(wx - 3, wy + wh + 1.5, ww + 6, 2.6);
      }
      if (lit) {
        e.fillStyle = css(255, 196, 122, 0.95);
        e.fillRect(wx, wy, ww, wh);
        const rg = e.createRadialGradient(wx + ww / 2, wy + wh / 2, 2, wx + ww / 2, wy + wh / 2, ww * 1.1);
        rg.addColorStop(0, css(255, 206, 140, 0.55));
        rg.addColorStop(1, 'rgba(255,190,120,0)');
        e.fillStyle = rg;
        e.fillRect(wx - ww * 0.5, wy - wh * 0.5, ww * 2, wh * 2);
      }
    }
  }

  grain(g, S, S, rng, 900, 0.05, true);
  grain(g, S, S, rng, 700, 0.06, false);
  grime(g, S, S, rng, [40, 34, 30]);
  if (style === 'glass') {
    g.fillStyle = 'rgba(120,180,220,0.05)';
    g.fillRect(0, 0, S, S);
  }
  return { map: canvasTexture(map), emissive: canvasTexture(emi) };
}

/** Ground floor of a shop: glass, awning stripes, a sign band and a door. 12 m x 5.5 m. */
export function storefrontTextures(rng, pal, label) {
  const W = 384;
  const H = 176;
  const map = makeCanvas(W, H);
  const emi = makeCanvas(W, H);
  const g = map.getContext('2d');
  const e = emi.getContext('2d');
  g.fillStyle = css(pal.wall[0] * 0.8, pal.wall[1] * 0.8, pal.wall[2] * 0.8);
  g.fillRect(0, 0, W, H);
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  // sign band
  const bandH = 42;
  g.fillStyle = css(pal.sign[0], pal.sign[1], pal.sign[2]);
  g.fillRect(0, 6, W, bandH);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 6, W, 4);
  g.font = 'bold 27px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = css(pal.signText[0], pal.signText[1], pal.signText[2]);
  g.fillText(label, W / 2, 28);
  e.fillStyle = css(pal.signText[0] * 1.4, pal.signText[1] * 1.4, pal.signText[2] * 1.4, 0.9);
  e.font = 'bold 27px "Trebuchet MS", sans-serif';
  e.textAlign = 'center';
  e.textBaseline = 'middle';
  e.fillText(label, W / 2, 28);
  e.fillStyle = css(pal.sign[0] * 0.55, pal.sign[1] * 0.55, pal.sign[2] * 0.55, 0.85);
  e.fillRect(0, 6, W, bandH);

  // glass front
  const gy = 56;
  const gh = H - gy - 12;
  const warm = rng.chance(0.72);
  const inner = warm ? [255, 205, 150] : [120, 160, 180];
  const gg = g.createLinearGradient(0, gy, 0, gy + gh);
  gg.addColorStop(0, css(inner[0] * 0.82, inner[1] * 0.82, inner[2] * 0.82));
  gg.addColorStop(1, css(inner[0] * 0.44, inner[1] * 0.44, inner[2] * 0.48));
  g.fillStyle = gg;
  g.fillRect(10, gy, W - 20, gh);
  if (warm) {
    const rg = e.createLinearGradient(0, gy, 0, gy + gh);
    rg.addColorStop(0, css(255, 200, 140, 0.85));
    rg.addColorStop(1, css(190, 120, 70, 0.5));
    e.fillStyle = rg;
    e.fillRect(10, gy, W - 20, gh);
  }
  // shelves and a counter inside the glass
  g.fillStyle = css(inner[0] * 0.5, inner[1] * 0.5, inner[2] * 0.5, 0.9);
  for (let i = 0; i < 3; i++) g.fillRect(24 + i * 118, gy + 14, 84, 8);
  g.fillRect(20, gy + gh - 26, W - 40, 10);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = css(255, 255, 255, 0.12);
    g.fillRect(24 + i * 90, gy + 8, 3, gh - 16);
  }
  // door
  g.fillStyle = css(20, 26, 30, 0.85);
  g.fillRect(W - 92, gy + 8, 62, gh - 8);
  g.fillStyle = css(150, 190, 200, 0.25);
  g.fillRect(W - 86, gy + 14, 50, gh - 34);
  // awning
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? css(pal.awning[0], pal.awning[1], pal.awning[2]) : css(244, 238, 226);
    g.fillRect((i * W) / stripes, gy - 8, W / stripes + 1, 16);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, gy + 7, W, 4);
  grain(g, W, H, rng, 300, 0.05, false);
  return { map: canvasTexture(map), emissive: canvasTexture(emi) };
}

/**
 * One atlas for every neon sign in the city. Signs are static, so drawing them all into a single
 * texture lets a whole district's signs merge into one mesh — one draw call instead of sixty.
 * Cells are 256x128 (wide words) and 128x256 (vertical words) in a 1024x1024 sheet.
 */
export function signAtlas(words) {
  const S = 1024;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cells = [];
  const cols = 4;
  const rows = 4;
  const cw = S / cols;
  const ch = S / rows;
  words.forEach((word, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x0 = col * cw;
    const y0 = row * ch;
    const vertical = word.vertical === true;
    const text = vertical ? word.text : word.text;
    const size = vertical ? 74 : Math.min(86, (cw - 24) / Math.max(3, text.length) * 1.7);
    g.font = `bold ${size}px "Trebuchet MS", sans-serif`;
    const lines = vertical ? text.split('') : [text];
    lines.forEach((chunk, k) => {
      const x = x0 + cw / 2;
      const y = vertical ? y0 + (ch / (lines.length + 1)) * (k + 1) : y0 + ch / 2;
      g.shadowColor = word.glow;
      g.shadowBlur = 22;
      g.fillStyle = word.color;
      g.fillText(chunk, x, y);
      g.shadowBlur = 8;
      g.globalAlpha = 0.8;
      g.fillStyle = '#ffffff';
      g.fillText(chunk, x, y);
      g.globalAlpha = 1;
    });
    // UV rect, with a small inset so neighbouring cells never bleed
    cells.push({
      u0: (x0 + 6) / S, v0: 1 - (y0 + ch - 6) / S,
      u1: (x0 + cw - 6) / S, v1: 1 - (y0 + 6) / S,
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, cells };
}

/** Neon sign: transparent canvas with a glowing word, used on additive planes. */
export function signTexture(text, colorA, colorB, vertical = false) {
  const W = vertical ? 128 : 384;
  const H = vertical ? 384 : 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = vertical ? text.split('') : [text];
  const size = vertical ? 62 : Math.min(74, (W - 26) / Math.max(3, text.length) * 1.5);
  g.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  lines.forEach((ch, i) => {
    const x = vertical ? W / 2 : W / 2;
    const y = vertical ? (H / (lines.length + 1)) * (i + 1) : H / 2;
    g.shadowColor = colorA;
    g.shadowBlur = 26;
    g.fillStyle = colorB;
    g.fillText(ch, x, y);
    g.shadowBlur = 10;
    g.fillStyle = '#fff';
    g.globalAlpha = 0.75;
    g.fillText(ch, x, y);
    g.globalAlpha = 1;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Radial falloff sprite: streetlight cones, headlight bloom, muzzle flash, helicopter lamp. */
export function glowTexture(inner = '255,255,255', outer = '255,210,150') {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, `rgba(${inner},1)`);
  rg.addColorStop(0.28, `rgba(${outer},0.55)`);
  rg.addColorStop(1, `rgba(${outer},0)`);
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = S / 2 + (Math.random() - 0.5) * 52;
    const y = S / 2 + (Math.random() - 0.5) * 52;
    const r = 18 + Math.random() * 30;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(210,210,214,0.30)');
    rg.addColorStop(1, 'rgba(180,180,190,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pavement slabs, tileable; one tile is 4 m. */
export function pavementTexture(rng) {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#b0b0a8';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 32) {
      const v = 0.9 + rng.float() * 0.16;
      g.fillStyle = css(176 * v, 174 * v, 166 * v);
      g.fillRect(x + 1, y + 1, 30, 30);
    }
  }
  g.strokeStyle = 'rgba(60,58,54,0.5)';
  g.lineWidth = 1.5;
  for (let i = 0; i <= S; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, S);
    g.moveTo(0, i);
    g.lineTo(S, i);
    g.stroke();
  }
  grain(g, S, S, rng, 400, 0.08, false);
  return canvasTexture(c);
}

export function asphaltTexture(rng) {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#4d525a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2400; i++) {
    const v = 0.7 + rng.float() * 0.8;
    g.fillStyle = css(80 * v, 84 * v, 90 * v, 0.5);
    g.fillRect(rng.float() * S, rng.float() * S, 1.6, 1.6);
  }
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(20,20,22,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(rng.float() * S, rng.float() * S);
    g.lineTo(rng.float() * S, rng.float() * S);
    g.stroke();
  }
  return canvasTexture(c);
}

export function sandTexture(rng) {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#d8c39a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    const v = 0.82 + rng.float() * 0.3;
    g.fillStyle = css(214 * v, 194 * v, 152 * v, 0.6);
    g.fillRect(rng.float() * S, rng.float() * S, 2, 2);
  }
  for (let i = 0; i < 8; i++) {
    g.strokeStyle = 'rgba(180,158,118,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    const y = rng.float() * S;
    g.moveTo(0, y);
    g.bezierCurveTo(S * 0.3, y + 6, S * 0.6, y - 6, S, y + 2);
    g.stroke();
  }
  return canvasTexture(c);
}

/** Simple two-tone billboard art, invented brands only. */
export function billboardTexture(title, sub, bg, fg) {
  const W = 512;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#101820');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.strokeRect(12, 12, W - 24, H - 24);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = 'bold 62px "Trebuchet MS", sans-serif';
  g.fillText(title, W / 2, H / 2 + 6);
  g.font = '600 26px "Trebuchet MS", sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(sub, W / 2, H / 2 + 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
