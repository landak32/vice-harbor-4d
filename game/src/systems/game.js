// The game state machine: owns the player, the car they are driving, the wanted level, the mission
// runner and the HUD feed. Everything in here advances one fixed step at a time.
import * as THREE from '../../vendor/three.module.min.js';
import { Character } from '../entities/character.js';
import { Vehicle, CAR_TYPES } from '../entities/vehicles.js';
import { OnFootController } from './onfoot.js';
import { CarPhysics, readDrivingControls } from './driving.js';
import { CameraRig } from './camera.js';
import { PoliceForce } from '../entities/police.js';
import { ThugCrew } from '../entities/thugs.js';
import { WeaponSystem, WeaponModel, WEAPONS } from '../entities/weapons.js';
import { MissionRunner } from './missions.js';
import { Hud } from '../ui/hud.js';
import { Minimap } from './minimap.js';
import { Menus, SaveSystem } from '../ui/menus.js';
import { dist2 } from '../core/math.js';

export class Game {
  constructor(world) {
    this.world = world;
    const { scene, city, collision, day, effects, audio, camera } = world;

    this.scene = scene;
    this.city = city;
    this.collision = collision;
    this.day = day;
    this.effects = effects;
    this.audio = audio;

    this.money = 450;
    this.health = 100;
    this.armour = 0;
    this.wanted = 0;
    this.driving = false;
    this.car = null;
    this.carPhysics = null;
    this.thugsDown = 0;
    this.carIsCourier = false;
    this.courierMarked = false;
    this.radioStation = 'WAVE 88.3';
    this.time = 0;
    this.paused = false;
    this.dead = false;
    this.deathTimer = 0;
    this.respawnPoint = { x: -6, z: 4, yaw: 0 };
    this.hospital = { x: 180, z: 210 };

    this.player = new Character(scene, { jacket: 0xe8563f });
    this.walker = new OnFootController(-6, 4, 0);
    this.rig = new CameraRig(camera);
    this.weapon = new WeaponSystem(effects, audio);
    this.weaponModel = new WeaponModel(this.player.group);
    this.weaponModel.setWeapon('pistol');
    this.weapon.select('pistol');

    this.police = new PoliceForce(scene, city, collision, effects, world.seed + 11);
    this.thugs = new ThugCrew(scene, collision, effects, world.seed + 12);
    this.thugs.onShoot = (m) => this.onEnemyShot(m);
    this.police.onOfficerShot = (o) => this.onEnemyShot(o);
    this.police.onRam = () => {
      this.rig.addShake(0.5);
      this.audio.play('crash');
    };

    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'), city);
    this.menus = new Menus(audio);
    this.missions = new MissionRunner(this.hud, audio);

    this.aimYaw = 0;
    this.aiming = false;
    this.hornTimer = 0;
    this.nightGlow = 0;
    this.pendingInput = null;
    this.stats = { shots: 0, kills: 0 };
  }

  /* ---------- car handling ---------- */

  /** Nearest parked traffic car: player steals it. */
  tryEnterCar() {
    if (this.driving) {
      this.exitCar();
      return;
    }
    const near = this.world.traffic.nearest(this.walker.x, this.walker.z, 7);
    if (!near) {
      this.hud.toast('No car close enough');
      return;
    }
    this.enterCarFromTraffic(near);
  }

  enterCarFromTraffic(trafficCar) {
    this.world.traffic.remove(trafficCar);
    const v = new Vehicle(this.scene, trafficCar.type, trafficCar.color.getHex());
    v.setPose(trafficCar.x, trafficCar.z, trafficCar.yaw);
    this.enterVehicle(v, trafficCar.type);
    this.hud.toast(`${CAR_TYPES[trafficCar.type].name} acquired`);
    if (trafficCar.type === 'coupe' && this.courierMarked) this.carIsCourier = true;
  }

  enterVehicle(vehicle, typeKey) {
    this.car = vehicle;
    this.carType = typeKey;
    this.driving = true;
    this.carPhysics = new CarPhysics(typeKey, vehicle.group.position.x, vehicle.group.position.z, vehicle.group.rotation.y);
    this.player.group.visible = true;
    this.player.animate(0, 'drive', 0, 0);
    this.audio.play('click');
  }

  exitCar() {
    if (!this.car) return;
    const p = this.car.group.position;
    const yaw = this.car.group.rotation.y;
    const sideX = p.x + Math.cos(yaw) * 2.1;
    const sideZ = p.z - Math.sin(yaw) * 2.1;
    const res = this.collision.resolve(sideX, sideZ, 0.45);
    this.walker.x = res.x;
    this.walker.z = res.z;
    this.walker.yaw = yaw;
    this.walker.vx = 0;
    this.walker.vz = 0;
    this.driving = false;
    this.player.group.visible = true;
    this.audio.play('click');
    this.car = null;
    this.carPhysics = null;
    this.carIsCourier = false;
  }

  /* ---------- combat ---------- */

  get aimDirection() {
    if (this.driving) return { x: Math.sin(this.car.group.rotation.y), z: Math.cos(this.car.group.rotation.y) };
    return { x: Math.sin(this.aimYaw), z: Math.cos(this.aimYaw) };
  }

  fireWeapon() {
    const dir = this.aimDirection;
    const origin = this.driving
      ? { x: this.car.group.position.x + dir.x * 1.6, y: 1.0, z: this.car.group.position.z + dir.z * 1.6 }
      : { x: this.walker.x + dir.x * 0.5, y: 1.25, z: this.walker.z + dir.z * 0.5 };
    const targets = [
      ...this.thugs.targets(),
      ...this.police.officers.filter((o) => !o.dead).map((o) => ({ x: o.x, z: o.z, y: 1.1, radius: 0.5, ref: o, kind: 'officer' })),
      ...this.world.pedestrians.people.filter((p) => !p.dead).map((p) => ({ x: p.x, z: p.z, y: 1.1, radius: 0.42, ref: p, kind: 'ped' })),
    ];
    const hits = this.weapon.fire(origin, Math.atan2(dir.x, dir.z), targets);
    if (hits === null) return;
    this.stats.shots += 1;
    this.rig.addShake(0.12);
    this.world.pedestrians.scare(this.walker.x, this.walker.z, 40);
    this.addWanted(1);
    for (const h of hits) {
      if (h.kind === 'ped') {
        h.ref.dead = true;
        this.stats.kills += 1;
        this.addWanted(1);
      } else if (h.kind === 'thug') {
        if (h.ref.dead) {
          this.thugsDown = this.thugs.downCount;
          this.stats.kills += 1;
        }
      } else if (h.kind === 'officer') {
        if (h.ref.dead) {
          this.stats.kills += 1;
          this.addWanted(1);
        }
      }
      this.audio.play('hit');
    }
  }

  onEnemyShot(shooter) {
    const px = this.driving ? this.car.group.position.x : this.walker.x;
    const pz = this.driving ? this.car.group.position.z : this.walker.z;
    const d = Math.hypot(shooter.x - px, shooter.z - pz);
    const dirX = (px - shooter.x) / (d || 1);
    const dirZ = (pz - shooter.z) / (d || 1);
    this.effects.tracer(
      { x: shooter.x, y: 1.3, z: shooter.z },
      { x: px + dirX * 0.4, y: 1.1, z: pz + dirZ * 0.4 },
      [1, 0.45, 0.3],
    );
    this.effects.muzzleFlash({ x: shooter.x, y: 1.3, z: shooter.z }, { x: dirX, z: dirZ });
    this.audio.play('pistol');
    if (Math.random() < 0.45) {
      this.damagePlayer(this.armour > 0 ? 4 : 7);
      this.rig.addShake(0.3);
    }
  }

  damagePlayer(amount) {
    if (this.dead) return;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, amount * 0.7);
      this.armour -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.deathTimer = 2.6;
    this.menus.showGameOver('You woke up in Coral Heights General with a lighter wallet.');
    this.audio.play('crash');
  }

  respawn() {
    const loss = Math.min(this.money, 250);
    this.money -= loss;
    this.health = 100;
    this.armour = 0;
    this.dead = false;
    this.wanted = 0;
    this.police.dismiss();
    this.thugs.clear();
    this.thugsDown = 0;
    this.menus.hideGameOver();
    if (this.driving) this.exitCar();
    this.walker.x = this.hospital.x + 6;
    this.walker.z = this.hospital.z;
    this.walker.yaw = Math.PI;
    this.missions.active = false;
    this.missions.index = -1;
    this.hud.toast(`Hospital bill · -$${loss}`);
  }

  addWanted(n) {
    this.wanted = Math.min(5, this.wanted + n);
    this.police.addStars(0);
    this.police.wanted = this.wanted;
    if (this.wanted >= 3) this.audio.startSiren();
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.police.wanted = this.wanted;
    this.police.coolTimer = 0;
    if (this.wanted >= 3) this.audio.startSiren();
    else this.audio.stopSiren();
  }

  spawnThugs(x, z, n) {
    this.thugs.clear();
    this.thugs.spawn(x, z, n);
    this.thugsDown = 0;
  }

  markCourierCar() {
    this.courierMarked = true;
  }

  /* ---------- save / load ---------- */

  toSave() {
    return {
      money: this.money,
      health: this.health,
      armour: this.armour,
      wanted: this.wanted,
      x: this.walker.x,
      z: this.walker.z,
      yaw: this.walker.yaw,
      hour: this.day.hour,
      mission: this.missions.toJSON(),
      weapon: this.weapon.current,
      ammo: this.weapon.ammo,
      reserve: this.weapon.reserve,
    };
  }

  save() {
    const ok = SaveSystem.save(this.toSave());
    this.hud.toast(ok ? 'Game saved' : 'Could not write the save');
  }

  load() {
    const data = SaveSystem.load();
    if (!data) {
      this.hud.toast('No save found');
      return;
    }
    this.money = data.money ?? this.money;
    this.health = data.health ?? 100;
    this.armour = data.armour ?? 0;
    this.wanted = data.wanted ?? 0;
    if (this.driving) this.exitCar();
    this.walker.x = data.x ?? this.walker.x;
    this.walker.z = data.z ?? this.walker.z;
    this.walker.yaw = data.yaw ?? 0;
    if (typeof data.hour === 'number') this.day.setHour(data.hour);
    this.missions.fromJSON(data.mission);
    this.weapon.select(data.weapon ?? 'pistol');
    if (data.ammo) this.weapon.ammo = { ...this.weapon.ammo, ...data.ammo };
    if (data.reserve) this.weapon.reserve = { ...this.weapon.reserve, ...data.reserve };
    this.police.wanted = this.wanted;
    this.rig.snap({ x: this.walker.x, z: this.walker.z, y: this.walker.y, yaw: this.walker.yaw, speed: 0, driving: false });
    this.hud.toast('Game loaded');
  }

  /* ---------- the fixed step ---------- */

  step(dt, input) {
    this.time += dt;
    if (this.paused || this.dead) {
      if (this.dead) {
        this.deathTimer -= dt;
        this.player.animate(dt, 'dead', 0, 0);
      }
      this.hud.tick(dt);
      return;
    }

    const camYaw = this.rig.yaw;
    this.nightGlow = this.day.lampGlow;

    if (this.driving) this.stepDriving(dt, input);
    else this.stepOnFoot(dt, input, camYaw);

    // camera
    const focus = this.driving
      ? { x: this.car.group.position.x, z: this.car.group.position.z, y: 0, yaw: this.car.group.rotation.y, speed: Math.abs(this.carPhysics.speed), driving: true }
      : { x: this.walker.x, z: this.walker.z, y: this.walker.y, yaw: this.walker.yaw, speed: this.walker.speed, driving: false, aim: this.aiming ? 1 : 0 };
    this.rig.update(dt, focus);

    // weapons, police, pedestrians, traffic, effects
    this.weapon.update(dt);
    this.weaponModel.setWeapon(this.weapon.current);
    this.weaponModel.applyRecoil(this.weapon.recoil);
    this.police.update(dt, { x: focus.x, z: focus.z }, { nightGlow: this.nightGlow });
    this.police.wanted = this.wanted;
    if (this.wanted >= 3 && this.police.wanted >= 3) this.audio.startSiren();
    if (this.wanted < 3) this.audio.stopSiren();
    this.audio.updateSiren(dt);
    this.audio.updateEngine(this.driving, this.carPhysics?.speed ?? 0, this.driving ? this.carPhysics.throttle : 0);
    this.world.pedestrians.update(dt, this.time);
    this.thugs.update(dt, { x: focus.x, z: focus.z });
    this.world.traffic.update(dt, this.time, { nightGlow: this.nightGlow });
    this.effects.update(dt);

    // wanted decay mirrors the police force
    this.wanted = this.police.wanted;

    this.missions.update(dt, this);
    this.thugsDown = this.thugs.downCount;

    this.hud.tick(dt);
    if (input) input.endStep();
  }

  stepOnFoot(dt, input, camYaw) {
    const axis = input.moveAxis();
    this.aiming = axis.x === 0 && axis.y === 0 ? this.aiming : this.aiming;
    // The mouse aims; holding the fire button raises the weapon.
    this.aimYaw = this.rig.yaw + (input.mouse.dx ? 0 : 0);
    if (input.mouse.dx) this.rig.look(input.mouse.dx, input.mouse.dy);
    this.aimYaw = camYaw + this.rig.yawOffset;
    if (input.mouse.down || input.down('fire')) {
      this.aiming = true;
      this.aimYaw = camYaw + this.rig.yawOffset;
      this.fireWeapon();
    } else {
      this.aiming = false;
    }

    const res = this.walker.update(dt, input, camYaw, this.collision, { aiming: this.aiming });
    if (res.stepped) this.audio.play('footstep');
    this.player.setPosition(this.walker.x, this.walker.y, this.walker.z, this.walker.yaw);
    this.player.animate(dt, this.walker.mode, this.walker.speed, this.aiming ? 1 : 0);

    if (input.pressed('enter')) this.tryEnterCar();
    if (input.pressed('weapon')) {
      this.weapon.cycle();
      this.audio.play('click');
    }
    if (input.pressed('reload')) this.weapon.startReload();
    if (input.pressed('horn')) this.blowHorn();
    if (input.pressed('mission')) this.missions.startNext(this);
    if (input.pressed('save')) this.save();
    if (input.pressed('load')) this.load();
  }

  stepDriving(dt, input) {
    const controls = readDrivingControls(input);
    const before = this.carPhysics.speed;
    this.carPhysics.update(dt, controls, this.collision);
    const p = this.carPhysics;
    this.car.group.position.set(p.x, 0, p.z);
    this.car.group.rotation.y = p.yaw;
    this.car.applyDamage(Math.max(0, p.lastImpact) * 0.0006);
    this.car.damage = Math.max(this.car.damage, p.damage);
    this.car.update(dt, p.speed, p.steer, p.brake > 0 || p.handbrake, this.nightGlow, this.effects);
    // the player's own car never shows headlight billboards into its own camera
    this.car.lightMaterial.opacity = Math.min(0.5, this.car.lightMaterial.opacity);
    this.player.setPosition(p.x, 0.02, p.z, p.yaw);
    this.player.animate(dt, 'drive', 0, 0);

    if (p.lastImpact > 8) {
      this.audio.play('crash');
      this.rig.addShake(0.35);
      this.effects.sparks({ x: p.x, y: 0.8, z: p.z }, { x: 0, y: 0.4, z: 0 }, 8);
      this.damagePlayer(p.lastImpact * 0.5);
    }
    if (p.damage > 0.85) {
      this.damagePlayer(dt * 4);
    }
    if (input.pressed('enter')) this.exitCar();
    if (input.pressed('horn')) this.blowHorn();
    if (input.pressed('weapon')) {
      this.weapon.cycle();
      this.audio.play('click');
    }
    if (input.down('fire') || input.mouse.down) {
      this.fireWeapon();
    }
    if (input.pressed('mission')) this.missions.startNext(this);
    if (input.pressed('save')) this.save();
    if (input.pressed('load')) this.load();
    if (Math.abs(before) > 6 && Math.abs(p.speed) < 1.5) this.rig.addShake(0.2);
  }

  blowHorn() {
    this.audio.play('horn');
    this.world.pedestrians.scare(this.walker.x, this.walker.z, 26);
  }

  /* ---------- HUD snapshot ---------- */

  hudSnapshot() {
    const addr = this.city.addressAt(this.driving ? this.car.group.position.x : this.walker.x, this.driving ? this.car.group.position.z : this.walker.z);
    const w = WEAPONS[this.weapon.current];
    const ammo = w.melee ? '—' : `${this.weapon.ammo[this.weapon.current]} / ${this.weapon.reserve[this.weapon.current]}`;
    return {
      money: this.money,
      wanted: this.wanted,
      district: addr.district,
      street: addr.street,
      health: this.health,
      armour: this.armour,
      weapon: w.name,
      ammo,
      driving: this.driving,
      kmh: this.carPhysics?.kmh ?? 0,
      carName: this.car ? CAR_TYPES[this.carType].name : '—',
      carDamage: this.car?.damage ?? 0,
      missionName: this.missions.mission?.name,
      missionStage: this.missions.stageLabel,
      objective: this.missions.objective,
      missionProgress: this.missions.progress,
      subtitle: this.missions.subtitle,
      radio: this.radioStation,
    };
  }

  drawMinimap() {
    const px = this.driving ? this.car.group.position.x : this.walker.x;
    const pz = this.driving ? this.car.group.position.z : this.walker.z;
    const yaw = this.driving ? this.car.group.rotation.y : this.walker.yaw;
    const blips = this.police.units.map((u) => ({ x: u.x, z: u.z, kind: 'police' }));
    if (this.police.heli.active) blips.push({ x: this.police.heli.group.position.x, z: this.police.heli.group.position.z, kind: 'air' });
    const marker = this.missions.marker;
    this.minimap.draw({ x: px, z: pz, yaw }, blips, marker, this.world.pedestrians.people);
  }

  /** Nearest pedestrian distance, used by the shot code to prove a busy sidewalk. */
  nearestPedDistance() {
    let best = Infinity;
    for (const p of this.world.pedestrians.people) {
      best = Math.min(best, dist2(p.x, p.z, this.walker.x, this.walker.z));
    }
    return best;
  }
}

export { THREE };
