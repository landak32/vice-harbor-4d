// Character portraits, painted into a canvas at runtime: a head-and-shoulders bust built from
// shapes with a rim light and a district-tinted backdrop, one look per story character.
const CAST = {
  mira: { skin: '#c98d63', hair: '#241a14', coat: '#2f6f8a', accent: '#ffd166', bg: '#12222c', hairStyle: 'bob', brow: 0.7 },
  deacon: { skin: '#8a5a3b', hair: '#12100e', coat: '#6b2f3a', accent: '#3ee0d0', bg: '#1c1418', hairStyle: 'shaved', brow: 1.0 },
  tio: { skin: '#d7a67c', hair: '#4a4038', coat: '#3f5c3a', accent: '#f0b22a', bg: '#14201a', hairStyle: 'cap', brow: 0.6 },
  rico: { skin: '#b0784f', hair: '#1a1512', coat: '#3b4a58', accent: '#ff8a5c', bg: '#101a24', hairStyle: 'spike', brow: 0.9 },
  vera: { skin: '#e8c19a', hair: '#8a2f2f', coat: '#4a2f5c', accent: '#ff7ab6', bg: '#1a1424', hairStyle: 'long', brow: 0.55 },
  sergeant: { skin: '#c98d63', hair: '#5a5048', coat: '#1f2b3a', accent: '#5aa0ff', bg: '#0e1620', hairStyle: 'buzz', brow: 1.0 },
  player: { skin: '#c98d63', hair: '#1b1512', coat: '#e8563f', accent: '#f1e6d2', bg: '#1a1210', hairStyle: 'swept', brow: 0.8 },
};

export function portraitFor(id) {
  return CAST[id] ?? CAST.player;
}

/**
 * Draw a portrait into a canvas context at size S. Deterministic: no randomness, so the same
 * character looks the same in every frame and every shot.
 */
export function drawPortrait(canvas, id) {
  const look = portraitFor(id);
  const S = canvas.width;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, S, S);

  // backdrop: a soft district glow behind the head
  const bg = g.createRadialGradient(S * 0.5, S * 0.38, S * 0.05, S * 0.5, S * 0.5, S * 0.8);
  bg.addColorStop(0, look.accent + '55');
  bg.addColorStop(1, look.bg);
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);

  // diagonal light streaks
  g.save();
  g.globalAlpha = 0.12;
  g.strokeStyle = look.accent;
  g.lineWidth = S * 0.02;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(-S * 0.2 + i * S * 0.3, S);
    g.lineTo(S * 0.4 + i * S * 0.3, 0);
    g.stroke();
  }
  g.restore();

  // shoulders / coat
  g.fillStyle = look.coat;
  g.beginPath();
  g.moveTo(S * 0.06, S);
  g.quadraticCurveTo(S * 0.16, S * 0.66, S * 0.5, S * 0.62);
  g.quadraticCurveTo(S * 0.84, S * 0.66, S * 0.94, S);
  g.closePath();
  g.fill();
  // collar
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.moveTo(S * 0.38, S * 0.66);
  g.lineTo(S * 0.5, S * 0.86);
  g.lineTo(S * 0.62, S * 0.66);
  g.closePath();
  g.fill();
  // coat highlight
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath();
  g.moveTo(S * 0.2, S);
  g.quadraticCurveTo(S * 0.3, S * 0.74, S * 0.44, S * 0.68);
  g.lineTo(S * 0.4, S);
  g.closePath();
  g.fill();

  // neck
  g.fillStyle = look.skin;
  g.fillRect(S * 0.43, S * 0.55, S * 0.14, S * 0.14);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(S * 0.43, S * 0.55, S * 0.14, S * 0.05);

  // head
  const cx = S * 0.5;
  const cy = S * 0.4;
  const rx = S * 0.16;
  const ry = S * 0.19;
  g.fillStyle = look.skin;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  // jaw shadow
  g.fillStyle = 'rgba(0,0,0,0.13)';
  g.beginPath();
  g.ellipse(cx, cy + ry * 0.55, rx * 0.72, ry * 0.4, 0, 0, Math.PI);
  g.fill();
  // rim light along one cheek
  g.strokeStyle = look.accent + 'aa';
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.72, Math.PI * 1.42);
  g.stroke();

  // hair
  g.fillStyle = look.hair;
  if (look.hairStyle === 'long') {
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.35, rx * 1.12, ry * 0.85, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - rx * 1.12, cy - ry * 0.3, rx * 0.28, ry * 1.7);
    g.fillRect(cx + rx * 0.84, cy - ry * 0.3, rx * 0.28, ry * 1.7);
  } else if (look.hairStyle === 'bob') {
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.3, rx * 1.1, ry * 0.8, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - rx * 1.1, cy - ry * 0.35, rx * 0.26, ry * 1.1);
    g.fillRect(cx + rx * 0.84, cy - ry * 0.35, rx * 0.26, ry * 1.1);
  } else if (look.hairStyle === 'cap') {
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.42, rx * 1.06, ry * 0.62, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = look.coat;
    g.fillRect(cx - rx * 1.15, cy - ry * 0.5, rx * 2.3, ry * 0.24);
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.62, rx * 1.0, ry * 0.4, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - rx * 0.9, cy - ry * 0.2, rx * 1.8, ry * 0.12);
  } else if (look.hairStyle === 'spike') {
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.34, rx * 1.05, ry * 0.7, 0, Math.PI, Math.PI * 2);
    g.fill();
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(cx + i * rx * 0.34, cy - ry * 0.85);
      g.lineTo(cx + i * rx * 0.34 - rx * 0.12, cy - ry * 1.24);
      g.lineTo(cx + i * rx * 0.34 + rx * 0.14, cy - ry * 0.9);
      g.closePath();
      g.fill();
    }
  } else if (look.hairStyle === 'shaved') {
    g.globalAlpha = 0.55;
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.34, rx * 1.02, ry * 0.62, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  } else if (look.hairStyle === 'buzz') {
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.36, rx * 1.0, ry * 0.6, 0, Math.PI, Math.PI * 2);
    g.fill();
  } else {
    // swept
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.4, rx * 1.08, ry * 0.72, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - rx * 1.0, cy - ry * 0.5);
    g.quadraticCurveTo(cx + rx * 0.2, cy - ry * 1.3, cx + rx * 1.05, cy - ry * 0.3);
    g.quadraticCurveTo(cx + rx * 0.3, cy - ry * 0.75, cx - rx * 1.0, cy - ry * 0.2);
    g.closePath();
    g.fill();
  }

  // brows
  g.strokeStyle = look.hair;
  g.lineWidth = S * 0.014;
  g.lineCap = 'round';
  const browY = cy - ry * 0.12;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + sx * rx * 0.18, browY + (sx < 0 ? 0 : 0));
    g.lineTo(cx + sx * rx * 0.62, browY - ry * 0.06 * look.brow);
    g.stroke();
  }
  // eyes
  for (const sx of [-1, 1]) {
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.ellipse(cx + sx * rx * 0.38, cy - ry * 0.02, rx * 0.2, ry * 0.11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#20140f';
    g.beginPath();
    g.arc(cx + sx * rx * 0.4, cy - ry * 0.01, rx * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  // nose + mouth
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = S * 0.01;
  g.beginPath();
  g.moveTo(cx, cy + ry * 0.08);
  g.lineTo(cx + rx * 0.07, cy + ry * 0.32);
  g.lineTo(cx - rx * 0.03, cy + ry * 0.34);
  g.stroke();
  g.strokeStyle = 'rgba(90,30,30,0.55)';
  g.lineWidth = S * 0.016;
  g.beginPath();
  g.moveTo(cx - rx * 0.24, cy + ry * 0.6);
  g.quadraticCurveTo(cx, cy + ry * 0.7, cx + rx * 0.24, cy + ry * 0.6);
  g.stroke();

  // frame
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = S * 0.014;
  g.strokeRect(0, 0, S, S);
}
