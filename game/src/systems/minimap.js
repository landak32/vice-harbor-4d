// The minimap: a second canvas, redrawn every frame from the live world — roads, blocks, the player
// arrow, police blips, the mission marker, pedestrians as faint dots, and a north indicator.
import { CITY_HALF, PITCH, ROAD_W, BLOCK_W } from '../world/city.js';

const VIEW_METRES = 150;

export class Minimap {
  constructor(canvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.size = canvas.width;
    this.scale = this.size / VIEW_METRES;
    this.compass = document.getElementById('compass');
    this.buildStatic();
  }

  /** Roads and blocks never change, so they are drawn once into an offscreen tile. */
  buildStatic() {
    const S = this.size;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const span = CITY_HALF * 2;
    const px = S / (span + 40);
    g.fillStyle = '#101a20';
    g.fillRect(0, 0, S, S);
    const toPx = (v) => (v + CITY_HALF + 20) * px;
    g.fillStyle = '#28343d';
    for (const b of this.city.blocks) {
      const x = toPx(b.cx - b.half);
      const y = toPx(b.cz - b.half);
      const w = b.half * 2 * px;
      g.fillRect(x, y, w, w);
    }
    g.strokeStyle = '#3a4b56';
    g.lineWidth = Math.max(1, ROAD_W * px * 0.32);
    for (const rx of this.city.roadX) {
      g.beginPath();
      g.moveTo(toPx(rx), 0);
      g.lineTo(toPx(rx), S);
      g.stroke();
    }
    for (const rz of this.city.roadZ) {
      g.beginPath();
      g.moveTo(0, toPx(rz));
      g.lineTo(S, toPx(rz));
      g.stroke();
    }
    // the beach edge
    g.fillStyle = '#3a3527';
    g.fillRect(toPx(CITY_HALF), 0, S - toPx(CITY_HALF), S);
    this.staticTile = c;
    this.pxPerMetre = px;
    void PITCH;
    void BLOCK_W;
  }

  /** player: {x, z, yaw}; blips: [{x, z, kind}]; marker: {x, z} or null. */
  draw(player, blips = [], marker = null, peds = []) {
    const g = this.ctx;
    const S = this.size;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.clip();
    // rotate the world under a fixed north-up player arrow
    g.fillStyle = '#0c141a';
    g.fillRect(0, 0, S, S);
    const zoom = (S / VIEW_METRES) / this.pxPerMetre;
    g.translate(S / 2, S / 2);
    g.rotate(-player.yaw);
    g.scale(zoom, zoom);
    g.translate(-(player.x + CITY_HALF + 20) * this.pxPerMetre, -(player.z + CITY_HALF + 20) * this.pxPerMetre);
    g.drawImage(this.staticTile, 0, 0);

    // pedestrians as faint warm dots
    g.fillStyle = 'rgba(220,200,170,0.35)';
    for (const p of peds) {
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      if (dx * dx + dz * dz > 90 * 90) continue;
      g.beginPath();
      g.arc((p.x + CITY_HALF + 20) * this.pxPerMetre, (p.z + CITY_HALF + 20) * this.pxPerMetre, 1.6, 0, Math.PI * 2);
      g.fill();
    }

    // mission marker
    if (marker) {
      const mx = (marker.x + CITY_HALF + 20) * this.pxPerMetre;
      const my = (marker.z + CITY_HALF + 20) * this.pxPerMetre;
      g.fillStyle = '#ffd166';
      g.strokeStyle = '#1a1206';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(mx, my - 9);
      g.lineTo(mx + 8, my);
      g.lineTo(mx, my + 9);
      g.lineTo(mx - 8, my);
      g.closePath();
      g.fill();
      g.stroke();
    }

    // blips
    for (const b of blips) {
      const bx = (b.x + CITY_HALF + 20) * this.pxPerMetre;
      const by = (b.z + CITY_HALF + 20) * this.pxPerMetre;
      if (b.kind === 'police') {
        g.fillStyle = '#5aa0ff';
        g.beginPath();
        g.arc(bx, by, 4.4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(120,180,255,0.55)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(bx, by, 9, 0, Math.PI * 2);
        g.stroke();
      } else if (b.kind === 'air') {
        g.fillStyle = '#ff5f6d';
        g.beginPath();
        g.arc(bx, by, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();

    // player arrow, always centre and pointing up
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = '#3ee0d0';
    g.strokeStyle = '#04181c';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(8, 9);
    g.lineTo(0, 5);
    g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // rim + north tick
    g.strokeStyle = 'rgba(120,226,236,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.stroke();

    if (this.compass) {
      const north = -player.yaw;
      const nx = S / 2 + Math.sin(north) * (S / 2 - 16);
      const ny = S / 2 - Math.cos(north) * (S / 2 - 16);
      g.fillStyle = '#3ee0d0';
      g.beginPath();
      g.arc(nx, ny, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
}
