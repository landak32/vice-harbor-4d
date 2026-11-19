// Police response: patrol units that spawn off-screen, chase, ram and box the player in, officers who
// dismount and shoot from 4 stars, and an air unit that orbits with a searchlight from 3 stars.
import * as THREE from '../../vendor/three.module.min.js';
import { Vehicle, CAR_TYPES } from './vehicles.js';
import { Character } from './character.js';
import { glowTexture } from '../render/textures.js';
import { clamp, damp, wrapAngle } from '../core/math.js';
import { Rng } from '../core/rng.js';

const OFFICER_JACKET = 0x2a3d63;

export class Helicopter {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'policeHelicopter';
    scene.add(this.group);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.5, 3.6),
      new THREE.MeshLambertMaterial({ color: 0x1f2b3a }),
    );
    body.position.y = 0;
    this.group.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.4), new THREE.MeshLambertMaterial({ color: 0x2c3d50 }));
    nose.position.set(0, -0.1, 2.2);
    this.group.add(nose);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x0d1620 }));
    glass.position.set(0, 0.15, 2.6);
    this.group.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 3.2), new THREE.MeshLambertMaterial({ color: 0x24334a }));
    tail.position.set(0, 0.2, -3.0);
    this.group.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x1f2b3a }));
    fin.position.set(0, 0.6, -4.3);
    this.group.add(fin);
    for (const sx of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), new THREE.MeshLambertMaterial({ color: 0x14191f }));
      skid.position.set(sx * 0.75, -1.0, 0);
      this.group.add(skid);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), new THREE.MeshLambertMaterial({ color: 0x14191f }));
      strut.position.set(sx * 0.7, -0.7, 0.4);
      this.group.add(strut);
    }

    this.rotor = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.07, 0.34), new THREE.MeshLambertMaterial({ color: 0x1b2028 }));
    const blade2 = blade.clone();
    blade2.rotation.y = Math.PI / 2;
    this.rotor.add(blade, blade2);
    this.rotor.position.y = 1.0;
    this.group.add(this.rotor);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.16), new THREE.MeshLambertMaterial({ color: 0x1b2028 }));
    this.tailRotor.position.set(0.16, 0.6, -4.4);
    this.group.add(this.tailRotor);

    // nav lights + the searchlight cone
    this.navMaterial = new THREE.MeshBasicMaterial({ color: 0xff3322 });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), this.navMaterial);
    nav.position.set(0, 0.9, -4.4);
    this.group.add(nav);
    this.navMaterialB = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
    const nav2 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), this.navMaterialB);
    nav2.position.set(0.9, 0.1, 1.6);
    this.group.add(nav2);

    const coneGeo = new THREE.ConeGeometry(4.2, 22, 14, 1, true);
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfe8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.cone = new THREE.Mesh(coneGeo, this.coneMaterial);
    this.cone.position.set(0, -13.2, 0.4);
    this.cone.name = 'heliCone';
    this.group.add(this.cone);

    this.lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: glowTexture('255,255,255', '200,220,255'), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
    );
    this.lamp.position.set(0, -25.8, 0.6);
    this.lamp.name = 'heliLamp';
    this.lamp.scale.setScalar(1.9);
    this.group.add(this.lamp);

    this.beacon = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: glowTexture('255,120,120', '255,60,60'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.beacon.position.set(0, 1.4, 0);
    this.beacon.name = 'heliBeacon';
    this.group.add(this.beacon);

    this.angle = 0;
    this.active = false;
    this.parked = false;
    this.group.visible = false;
    this.position = this.group.position;
  }

  activate(target) {
    this.active = true;
    this.group.visible = true;
    this.angle = Math.atan2(this.group.position.x - target.x, this.group.position.z - target.z);
    this.group.position.set(target.x + 40, 46, target.z + 40);
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
  }

  /** Orbit the target at radius r; `parked` holds it still in the shot for a stable frame. */
  update(dt, target, opts = {}) {
    if (!this.active) return;
    const radius = opts.radius ?? 30;
    const height = opts.height ?? 34;
    if (!this.parked) this.angle += dt * 0.34;
    const tx = target.x + Math.cos(this.angle) * radius;
    const tz = target.z + Math.sin(this.angle) * radius;
    const lambda = opts.parked ? 100 : 1.4;
    this.group.position.x = damp(this.group.position.x, tx, lambda, dt);
    this.group.position.y = damp(this.group.position.y, height + Math.sin(this.angle * 2) * 1.2, 1.6, dt);
    this.group.position.z = damp(this.group.position.z, tz, lambda, dt);
    const look = Math.atan2(target.x - this.group.position.x, target.z - this.group.position.z);
    this.group.rotation.y = look;
    this.group.rotation.z = Math.sin(this.angle) * 0.06;
    this.rotor.rotation.y += dt * (opts.parked ? 26 : 30);
    this.tailRotor.rotation.x += dt * 44;
    const blink = Math.sin(performance.now() * 0.005) > 0;
    this.navMaterial.color.setRGB(blink ? 1 : 0.15, blink ? 0.15 : 0.02, blink ? 0.1 : 0.02);
    this.navMaterialB.color.setRGB(blink ? 0.1 : 0.2, blink ? 0.3 : 1, blink ? 0.1 : 0.2);
    this.beacon.material.opacity = 0.35 + (blink ? 0.5 : 0);
    // the cone is aimed down the look axis, tilted to land ahead of the helicopter
    this.cone.position.set(Math.sin(0) * 0, -13.2, 4.2);
    this.lamp.position.set(0, -25.8, 8.4);
    this.coneMaterial.opacity = 0.045 + (opts.nightGlow ?? 0.5) * 0.055;
    this.lamp.material.opacity = 0.35 + (opts.nightGlow ?? 0.5) * 0.35;
  }
}

export class PoliceForce {
  constructor(scene, city, collision, effects, seed) {
    this.scene = scene;
    this.city = city;
    this.collision = collision;
    this.effects = effects;
    this.rng = new Rng(seed);
    this.units = [];
    this.officers = [];
    this.heli = new Helicopter(scene);
    this.wanted = 0;
    this.wantedHeat = 0;
    this.coolTimer = 0;
    this.spawnTimer = 0;
    this.maxUnits = 6;
    this.onShot = null;
    this.searchPhase = 0;
  }

  addStars(n) {
    if (n <= 0) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.coolTimer = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this.wantedHeat = 0;
  }

  spawnUnit(near, offsetAngle = 0, dist = 70) {
    const v = new Vehicle(this.scene, 'police', 0x1b2432, { police: true });
    const x = near.x + Math.cos(offsetAngle) * dist;
    const z = near.z + Math.sin(offsetAngle) * dist;
    const lane = this.city.nearestLane(x, z);
    v.setPose(lane.x, lane.z, lane.yaw);
    const unit = {
      vehicle: v,
      x: lane.x, z: lane.z, yaw: lane.yaw,
      speed: 0, steer: 0,
      state: 'chase',
      ramTimer: 0,
      shootTimer: this.rng.range(0.5, 1.5),
      boxSide: this.rng.sign(),
    };
    this.units.push(unit);
    return unit;
  }

  spawnOfficer(x, z) {
    const c = new Character(this.scene, { jacket: OFFICER_JACKET, pants: 0x1c2534, skin: 0xc98d63, simple: true });
    c.setPosition(x, 0.19, z, this.rng.range(0, 6.28));
    const officer = {
      character: c,
      x, z,
      yaw: 0,
      hp: 3,
      shootTimer: this.rng.range(0.8, 2),
      state: 'engage',
      dead: false,
      deathT: 0,
    };
    this.officers.push(officer);
    return officer;
  }

  /** Called by the game loop; `player` carries x, z, inCar, drivingSpeed. */
  update(dt, player, opts = {}) {
    const nightGlow = opts.nightGlow ?? 0;
    const wanted = this.wanted;

    // decay when the player has been out of sight for a while
    if (wanted > 0) {
      this.coolTimer += dt;
      const outOfSight = this.units.every((u) => Math.hypot(u.x - player.x, u.z - player.z) > 48);
      if (outOfSight && this.coolTimer > 6) {
        this.wantedHeat += dt;
        if (this.wantedHeat > 3.2) {
          this.wantedHeat = 0;
          this.wanted = Math.max(0, this.wanted - 1);
          if (this.wanted === 0) this.dismiss();
        }
      } else {
        this.wantedHeat = Math.max(0, this.wantedHeat - dt * 0.5);
      }
    }

    // keep the right number of cruisers on the road
    const targetUnits = wanted === 0 ? 0 : Math.min(this.maxUnits, 1 + wanted);
    this.spawnTimer -= dt;
    if (this.units.length < targetUnits && this.spawnTimer <= 0) {
      const a = this.rng.range(0, Math.PI * 2);
      this.spawnUnit(player, a, 62 + this.rng.range(0, 26));
      this.spawnTimer = 1.6;
    }
    if (this.units.length > targetUnits) {
      const u = this.units.pop();
      this.scene.remove(u.vehicle.group);
    }

    for (const unit of this.units) this.driveUnit(dt, unit, player, nightGlow);

    // air support from 3 stars
    if (wanted >= 3 && !this.heli.active) this.heli.activate(player);
    if (wanted < 3 && this.heli.active) this.heli.deactivate();
    this.heli.update(dt, player, { nightGlow, parked: opts.parkHeli });

    // officers on foot from 4 stars
    if (wanted >= 4 && this.officers.filter((o) => !o.dead).length < Math.min(5, wanted - 2)) {
      if (this.rng.chance(dt * 0.9)) {
        const a = this.rng.range(0, Math.PI * 2);
        this.spawnOfficer(player.x + Math.cos(a) * 22, player.z + Math.sin(a) * 22);
      }
    }
    if (wanted < 4) {
      for (const o of this.officers) this.scene.remove(o.character.group);
      this.officers.length = 0;
    }
    for (const o of this.officers) this.updateOfficer(dt, o, player);
  }

  driveUnit(dt, unit, player, nightGlow) {
    const dx = player.x - unit.x;
    const dz = player.z - unit.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(dx, dz);
    const yawErr = wrapAngle(desiredYaw - unit.yaw);
    const spec = CAR_TYPES.police;

    // box the player in: offset the target to one side when close
    let tx = player.x;
    let tz = player.z;
    if (dist < 16) {
      const side = unit.boxSide;
      tx += Math.cos(desiredYaw) * side * 6.5;
      tz += -Math.sin(desiredYaw) * side * 6.5;
    }
    const toTargetYaw = Math.atan2(tx - unit.x, tz - unit.z);
    const err = wrapAngle(toTargetYaw - unit.yaw);

    unit.steer = damp(unit.steer, clamp(err * 1.4, -0.6, 0.6), 8, dt);
    const wantSpeed = dist > 22 ? spec.top * 0.82 : dist > 9 ? 16 : 6;
    unit.speed = damp(unit.speed, wantSpeed, 2.4, dt);
    unit.yaw = wrapAngle(unit.yaw + (unit.speed / 2.7) * Math.tan(unit.steer) * dt);

    const nx = unit.x + Math.sin(unit.yaw) * unit.speed * dt;
    const nz = unit.z + Math.cos(unit.yaw) * unit.speed * dt;
    const res = this.collision.resolve(nx, nz, 1.4);
    if (res.hit) {
      unit.speed *= 0.3;
      unit.vehicle.applyDamage(0.02);
    }
    unit.x = res.x;
    unit.z = res.z;

    // ram: a fast contact with the player's car costs them speed and shakes the camera
    if (dist < 4.4 && unit.speed > 8 && !unit.ramTimer) {
      unit.ramTimer = 2.2;
      if (this.onRam) this.onRam(unit, dist);
    }
    unit.ramTimer = Math.max(0, unit.ramTimer - dt);

    unit.vehicle.setPose(unit.x, unit.z, unit.yaw);
    unit.vehicle.update(dt, unit.speed, unit.steer, unit.speed < 1, nightGlow, this.effects);
    void yawErr;
  }

  updateOfficer(dt, officer, player) {
    if (officer.dead) {
      officer.deathT += dt;
      officer.character.animate(dt, 'dead', 0, 0);
      return;
    }
    const dx = player.x - officer.x;
    const dz = player.z - officer.z;
    const dist = Math.hypot(dx, dz);
    officer.yaw = Math.atan2(dx, dz);
    if (dist > 13) {
      const sp = 3.4;
      const nx = officer.x + (dx / (dist || 1)) * sp * dt;
      const nz = officer.z + (dz / (dist || 1)) * sp * dt;
      const res = this.collision.resolve(nx, nz, 0.45);
      officer.x = res.x;
      officer.z = res.z;
      officer.character.animate(dt, 'walk', sp, 0);
    } else {
      officer.character.animate(dt, 'idle', 0, 1);
    }
    officer.character.setPosition(officer.x, 0.19, officer.z, officer.yaw);

    officer.shootTimer -= dt;
    if (officer.shootTimer <= 0 && dist < 26) {
      officer.shootTimer = this.rng.range(1.1, 2.4);
      if (this.onOfficerShot) this.onOfficerShot(officer);
    }
  }

  /** Kill the nearest officer within range along the aim direction. */
  shootAt(x, z, dirX, dirZ, range = 40) {
    let best = null;
    let bestDot = 0.94;
    for (const o of this.officers) {
      if (o.dead) continue;
      const dx = o.x - x;
      const dz = o.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.5) continue;
      const dot = (dx / d) * dirX + (dz / d) * dirZ;
      if (dot > bestDot) {
        bestDot = dot;
        best = o;
      }
    }
    if (best) {
      best.hp -= 1;
      if (best.hp <= 0) best.dead = true;
      return best;
    }
    return null;
  }

  dismiss() {
    for (const u of this.units) this.scene.remove(u.vehicle.group);
    this.units.length = 0;
    for (const o of this.officers) this.scene.remove(o.character.group);
    this.officers.length = 0;
    this.heli.deactivate();
  }

  get starPositions() {
    return this.units.map((u) => ({ x: u.x, z: u.z, kind: 'police' }));
  }
}
