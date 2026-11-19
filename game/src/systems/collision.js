// Collision and ground queries. Blocks are solid boxes (buildings sit inside them), so a block is
// the collision proxy — cheap, stable, and good enough for arcade traffic and a walking player.
import { BLOCK_W, CITY_HALF, CURB_H, GRID, PITCH } from '../world/city.js';

export class CollisionWorld {
  constructor(city) {
    this.city = city;
    this.solids = city.blocks.map((b) => ({
      x0: b.cx - b.half + 0.4, x1: b.cx + b.half - 0.4,
      z0: b.cz - b.half + 0.4, z1: b.cz + b.half - 0.4,
      cx: b.cx, cz: b.cz, half: b.half,
    }));
    this.beachEdge = CITY_HALF;
  }

  /** True when a circle of `radius` at (x,z) overlaps a solid block. */
  blocked(x, z, radius = 0.4) {
    if (Math.abs(x) > CITY_HALF + 200 || Math.abs(z) > CITY_HALF + 60) return false;
    for (const s of this.solids) {
      if (x > s.x0 - radius && x < s.x1 + radius && z > s.z0 - radius && z < s.z1 + radius) return true;
    }
    return false;
  }

  /** Push a circle out of the nearest solid, returning the corrected position and hit flag. */
  resolve(x, z, radius = 0.4) {
    for (const s of this.solids) {
      if (x > s.x0 - radius && x < s.x1 + radius && z > s.z0 - radius && z < s.z1 + radius) {
        const dl = Math.abs(x - (s.x0 - radius));
        const dr = Math.abs(s.x1 + radius - x);
        const dt = Math.abs(z - (s.z0 - radius));
        const db = Math.abs(s.z1 + radius - z);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) x = s.x0 - radius;
        else if (m === dr) x = s.x1 + radius;
        else if (m === dt) z = s.z0 - radius;
        else z = s.z1 + radius;
        return { x, z, hit: true };
      }
    }
    return { x, z, hit: false };
  }

  /** Pavement height: sidewalks and block pads are raised, roads are not. */
  groundHeight(x, z) {
    if (this.city.isOnRoad(x, z)) return 0;
    if (Math.abs(x) > CITY_HALF + 20) return 0.06;
    return CURB_H;
  }

  /** Keep actors inside the map and off the far ocean. */
  clampToMap(x, z, margin = 4) {
    return {
      x: Math.max(-CITY_HALF + margin, Math.min(CITY_HALF + 76, x)),
      z: Math.max(-CITY_HALF + margin, Math.min(CITY_HALF - margin, z)),
    };
  }

  /** Nearest lane point plus heading, for traffic respawns. */
  laneNear(x, z) {
    return this.city.nearestLane(x, z);
  }

  /** A sidewalk point around a block, used to place pedestrians and props. */
  sidewalkPoint(block, t, side) {
    const o = BLOCK_W / 2 + 1.5;
    if (side === 0) return { x: block.cx + t, z: block.cz - o };
    if (side === 1) return { x: block.cx + t, z: block.cz + o };
    if (side === 2) return { x: block.cx - o, z: block.cz + t };
    return { x: block.cx + o, z: block.cz + t };
  }

  blockAt(x, z) {
    const i = Math.floor((x + CITY_HALF) / PITCH);
    const j = Math.floor((z + CITY_HALF) / PITCH);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return null;
    return this.city.blocks.find((b) => b.i === i && b.j === j) ?? null;
  }
}
