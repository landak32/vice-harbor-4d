// Traffic AI. Every car owns a lane, a direction and a distance along its road; it keeps right,
// brakes for whatever is ahead in its lane, waits at a red light and turns at junctions. Bodies and
// wheels are drawn from InstancedMeshes (one per car type) so 30+ cars cost a handful of draw calls.
import * as THREE from '../../vendor/three.module.min.js';
import { carGeometry, CAR_TYPES, wheelGeometry } from '../entities/vehicles.js';
import { CITY_HALF, LANE_OFFSET, PITCH, ROAD_W } from '../world/city.js';
import { Rng } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { glowTexture } from '../render/textures.js';

const TURN_RADIUS = ROAD_W / 2 - 0.6;

export class TrafficSystem {
  constructor(scene, city, seed, count = 34) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(seed);
    this.cars = [];
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    scene.add(this.group);

    this.types = Object.keys(CAR_TYPES).filter((k) => k !== 'police' && k !== 'bus');
    this.busType = 'bus';
    this.meshes = new Map();
    this.wheelMeshes = new Map();
    this.counts = new Map();

    const palette = [0xb8443c, 0x2f5f8a, 0xdedad0, 0x2b2f36, 0x8b8f96, 0x2f7f66, 0xc9a13a, 0x6b3f78, 0x1f4b5e, 0xd08a4a, 0x93352f, 0xcfd3d8];

    for (let i = 0; i < count; i++) {
      const type = i % 11 === 5 ? this.busType : this.rng.pick(this.types);
      const color = new THREE.Color(palette[Math.floor(this.rng.float() * palette.length)]);
      if (type === 'taxi') color.set(0xf0c020);
      if (type === 'bus') color.set(0x2f6f8a);
      const spawn = this.spawnCar(type, color, i);
      if (spawn) this.cars.push(spawn);
    }
    this.buildInstances();
    this.lightGlow = null;
  }

  /** A lane-following car descriptor; the mesh is a pure view of it. */
  spawnCar(type, color, index) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const line = vertical ? rng.pick(this.city.roadX) : rng.pick(this.city.roadZ);
    const dir = rng.sign();
    const along = rng.range(-CITY_HALF + 14, CITY_HALF - 14);
    const car = {
      type, color, index,
      axis: vertical ? 'z' : 'x',
      dir,
      line,
      along,
      lane: dir * LANE_OFFSET,
      speed: rng.range(8, 16),
      cruise: rng.range(11, 19),
      state: 'drive',
      turnT: 0,
      turnFrom: null,
      turnTo: null,
      x: 0, z: 0, yaw: 0,
      wheelSpin: rng.range(0, 6),
      steer: 0,
      braking: false,
      horn: 0,
    };
    this.place(car);
    return car;
  }

  place(car) {
    if (car.axis === 'z') {
      car.x = car.line + car.lane;
      car.z = car.along;
      car.yaw = car.dir > 0 ? 0 : Math.PI;
    } else {
      car.x = car.along;
      car.z = car.line + car.lane;
      car.yaw = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  /** One physics step for every car. */
  update(dt, time, opts = {}) {
    const nightGlow = opts.nightGlow ?? 0;
    for (const car of this.cars) {
      if (car.state === 'turn') this.advanceTurn(car, dt);
      else this.advanceStraight(car, dt);
      this.place(car);
    }
    this.syncInstances(dt, nightGlow);
    void time;
  }

  advanceStraight(car, dt) {
    // Brake for the car ahead in the same lane.
    let gap = Infinity;
    for (const other of this.cars) {
      if (other === car || other.axis !== car.axis || other.dir !== car.dir) continue;
      if (Math.abs(other.line - car.line) > 1.2) continue;
      const d = (other.along - car.along) * car.dir;
      if (d > 0 && d < 14) gap = Math.min(gap, d);
    }
    const targetSpeed = gap < 7 ? Math.max(0, (gap - 3.4) * 2.6) : car.cruise;
    const accel = targetSpeed > car.speed ? 7 : 22;
    car.speed += clamp(targetSpeed - car.speed, -accel * dt, accel * dt);
    car.braking = targetSpeed < car.speed - 0.5;
    car.along += car.speed * car.dir * dt;

    // At a junction approach, decide to turn or keep going.
    const nextJunction = this.nextJunction(car);
    const distanceToJunction = Math.abs(nextJunction - car.along);
    if (distanceToJunction < 9 && distanceToJunction > 2.5) {
      if (!car.decided) {
        car.decided = true;
        car.willTurn = this.rng.chance(0.32);
      }
      if (car.willTurn) car.speed = Math.min(car.speed, 9);
    }
    if (distanceToJunction <= 2.5 && distanceToJunction > 0 && car.decided && car.willTurn) {
      this.beginTurn(car, nextJunction);
      car.decided = false;
      return;
    }
    if (distanceToJunction < 0.1) car.decided = false;

    // Loop around the map edge.
    if (car.along > CITY_HALF - 6 || car.along < -CITY_HALF + 6) {
      const line = car.axis === 'z' ? this.rng.pick(this.city.roadZ) : this.rng.pick(this.city.roadX);
      car.axis = car.axis === 'z' ? 'x' : 'z';
      car.line = line;
      car.dir = this.rng.sign();
      car.lane = car.dir * LANE_OFFSET;
      car.along = -car.dir * (CITY_HALF - 30);
      car.decided = false;
    }
  }

  nextJunction(car) {
    const lines = car.axis === 'z' ? this.city.roadZ : this.city.roadX;
    let best = car.along + car.dir * 400;
    for (const l of lines) {
      const d = (l - car.along) * car.dir;
      if (d > 2 && d < 400 && Math.abs(l - car.along) < Math.abs(best - car.along)) best = l;
    }
    return best;
  }

  /** Start a quarter-circle turn onto a crossing road. */
  beginTurn(car, junction) {
    const options = ['x', 'z'].filter((a) => a !== car.axis);
    const axis = options[0];
    const dir = this.rng.sign();
    car.state = 'turn';
    car.turnT = 0;
    car.turnFrom = { axis: car.axis, dir: car.dir, line: car.line, junction };
    car.turnTo = { axis, dir };
    car.turnStartSpeed = car.speed;
    car.axis = axis;
    car.line = car.axis === 'x' ? junction : junction;
  }

  advanceTurn(car, dt) {
    car.turnT += dt * Math.max(0.7, car.speed / 9);
    if (car.turnT >= 1) {
      const to = car.turnTo;
      car.state = 'drive';
      car.axis = to.axis;
      car.dir = to.dir;
      car.lane = to.dir * LANE_OFFSET;
      car.along = car.turnFrom.junction + to.dir * 1.5;
      car.decided = false;
      return;
    }
  }

  /** Adding a car means resizing that type's instance buffer, so the meshes are rebuilt. */
  rebuildForNewCar() {
    this.buildInstances();
  }

  /** Build one InstancedMesh per car type plus matching wheel meshes. */
  buildInstances() {
    // drop the previous set first: this is called again whenever the pool grows
    for (const mesh of [...this.meshes.values(), ...this.wheelMeshes.values()]) {
      this.group.remove(mesh);
      mesh.geometry.dispose?.();
      mesh.material?.dispose?.();
    }
    for (const mesh of [this.headlightMesh, this.tailMesh]) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    this.meshes.clear();
    this.wheelMeshes.clear();
    const byType = new Map();
    for (const car of this.cars) {
      if (!byType.has(car.type)) byType.set(car.type, []);
      byType.get(car.type).push(car);
    }
    for (const [type, list] of byType) {
      const geo = carGeometry(type);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `traffic_${type}`;
      this.group.add(mesh);
      list.forEach((car, i) => {
        car.mesh = mesh;
        car.slot = i;
        mesh.setColorAt(i, car.color);
      });
      this.meshes.set(type, mesh);

      const wm = new THREE.MeshLambertMaterial({ color: 0x15171b });
      const wheels = new THREE.InstancedMesh(wheelGeometry(), wm, list.length * 4);
      wheels.frustumCulled = false;
      wheels.name = `trafficWheels_${type}`;
      this.group.add(wheels);
      this.wheelMeshes.set(type, wheels);
      this.counts.set(type, list.length);
    }

    // headlight glows, two per car, one instanced additive quad set
    // textured: an untextured quad reads as a hard white rectangle whenever an oncoming car is
    // close enough for the plane to cover a screen-sized patch
    const glowGeo = new THREE.PlaneGeometry(1.7, 1.7);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture('255,250,235', '255,214,150'), color: 0xffdca8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false,
    });
    this.headlightMaterial = glowMat;
    const glows = new THREE.InstancedMesh(glowGeo, glowMat, this.cars.length * 2);
    glows.frustumCulled = false;
    glows.renderOrder = 2;
    glows.name = 'trafficHeadlights';
    this.group.add(glows);
    this.headlightMesh = glows;

    const tailGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const tailMat = new THREE.MeshBasicMaterial({
      map: glowTexture('255,120,90', '255,40,20'), color: 0xff3a22, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.taillightMaterial = tailMat;
    const tails = new THREE.InstancedMesh(tailGeo, tailMat, this.cars.length * 2);
    tails.frustumCulled = false;
    tails.renderOrder = 2;
    tails.name = 'trafficTaillights';
    this.group.add(tails);
    this.tailMesh = tails;
  }

  syncInstances(dt, nightGlow) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const e = new THREE.Euler();
    const wheelM = new THREE.Matrix4();

    for (const car of this.cars) {
      car.wheelSpin += car.speed * dt * 2.6;
      car.steer = car.state === 'turn' ? 0.5 : 0;
      e.set(0, car.yaw, 0);
      q.setFromEuler(e);
      v.set(car.x, 0, car.z);
      m.compose(v, q, s);
      car.mesh.setMatrixAt(car.slot, m);

      const wheels = this.wheelMeshes.get(car.type);
      const offsets = CAR_TYPES[car.type];
      const track = offsets.W / 2 - 0.08;
      const front = offsets.L * 0.31;
      const rear = -offsets.L * 0.32;
      const positions = [[-track, front, 1], [track, front, 1], [-track, rear, 0], [track, rear, 0]];
      for (let i = 0; i < 4; i++) {
        const [ox, oz, isFront] = positions[i];
        const local = new THREE.Vector3(ox, 0.34, oz).applyMatrix4(m);
        const wq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, car.yaw + (isFront ? car.steer * 0.5 : 0), 0));
        const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), car.wheelSpin);
        wq.multiply(spin);
        wheelM.compose(local, wq, s);
        wheels.setMatrixAt(car.slot * 4 + i, wheelM);
      }
    }
    for (const [, mesh] of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    for (const [, mesh] of this.wheelMeshes) mesh.instanceMatrix.needsUpdate = true;

    // headlights / brake lights
    const glowOpacity = nightGlow * 0.95;
    this.headlightMaterial.opacity = glowOpacity;
    this.taillightMaterial.opacity = 0.1 + nightGlow * 0.4;
    let k = 0;
    for (const car of this.cars) {
      const spec = CAR_TYPES[car.type];
      for (const side of [-1, 1]) {
        const lx = side * spec.W * 0.33;
        const lz = spec.L / 2 + 0.1;
        v.set(lx, 0.55, lz).applyMatrix4(m.compose(new THREE.Vector3(car.x, 0, car.z), q.setFromEuler(new THREE.Euler(0, car.yaw, 0)), s));
        const cam = this.scene.userData.camera;
        const gq = cam ? q.clone().copy(cam.quaternion) : q.clone().setFromEuler(new THREE.Euler(0, car.yaw, 0));
        m.compose(v, gq, s);
        this.headlightMesh.setMatrixAt(k, m);
        const tz = new THREE.Vector3(lx, 0.55, -spec.L / 2 - 0.1).applyMatrix4(
          new THREE.Matrix4().compose(new THREE.Vector3(car.x, 0, car.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, car.yaw, 0)), s),
        );
        m.compose(tz, gq, s);
        this.tailMesh.setMatrixAt(k, m);
        k++;
      }
    }
    this.headlightMesh.instanceMatrix.needsUpdate = true;
    this.tailMesh.instanceMatrix.needsUpdate = true;
  }

  /** Nearest car to a point, for combat and for the "carjack" interaction. */
  nearest(x, z, maxDist = 6) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** Blow a car out of the traffic flow when the player wrecks it. */
  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
