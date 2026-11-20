// The four recorded scenes. Each one builds a real game state, hands the controls to an autopilot,
// runs the actual simulation forward for a fixed number of seconds, and then re-dresses the world
// around the final camera position before a single frame is rendered. Nothing here fakes a sprite:
// the cars, crowds and police in the frame are the same systems the player uses.
import { Vehicle, CAR_TYPES } from '../entities/vehicles.js';
import { CITY_HALF } from '../world/city.js';

/**
 * Deterministic stand-in for a human at the keyboard. It answers the same interface as Input, so the
 * on-foot controller, the car physics and the weapon system cannot tell the difference.
 */
export class Autopilot {
  constructor() {
    this.held = new Set();
    this.prev = new Set();
    this.pressedSet = new Set();
    this.mouse = { x: 640, y: 360, dx: 0, dy: 0, down: false, clicked: false };
    this.yawDrift = 0;
  }

  set(actions) {
    this.prev = this.held;
    this.held = new Set(actions);
    this.pressedSet = new Set([...this.held].filter((a) => !this.prev.has(a)));
  }

  down(a) {
    return this.held.has(a);
  }

  pressed(a) {
    return this.pressedSet.has(a);
  }

  released(a) {
    return this.prev.has(a) && !this.held.has(a);
  }

  /** Digital stick in [-1,1]; diagonals are clamped to unit length, a single key stays at 1. */
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('forward')) y += 1;
    if (this.held.has('back')) y -= 1;
    const scale = Math.max(1, Math.hypot(x, y));
    return { x: x / scale, y: y / scale };
  }

  endStep() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.clicked = false;
  }
}

/* ------------------------------------------------------------------ shared helpers */

/**
 * The framing every shot shares: a wider lens than the gameplay default and a rig a little lower
 * than it. Wide-and-low puts more sky and road in the frame, and swinging the rig off the subject's
 * axis lands it on a third instead of dead centre — the difference between a still and a viewport.
 *
 * The yaw figures are tuned against the lens, not picked by eye: at 64 degrees vertical over 16:9
 * the horizontal half angle is 48 degrees, so the third line sits about 0.35 rad off axis.
 */
function frameShot(game, world, { fov = 64, distance = 0, height = -0.4, yaw = 0, lateral = 0, aim = 0, target = 0, exposure = 1, roll = 0 } = {}) {
  world.camera.fov = fov;
  world.camera.updateProjectionMatrix();
  world.post.exposureScale = exposure;
  const rig = game.rig;
  rig.distanceBias = distance;
  rig.heightBias = height;
  rig.yawOffset = yaw;
  rig.lateralBias = lateral;
  rig.aimBias = aim;
  rig.targetBias = target;
  rig.rollBias = roll;
}

/** Give the player a car at a spot, already seated, so the driving shots start in the driver's seat. */
function seatPlayer(game, typeKey, x, z, yaw) {
  const v = new Vehicle(game.scene, typeKey, typeKey === 'police' ? 0x1b2432 : 0xc8452f);
  v.setPose(x, z, yaw);
  game.enterVehicle(v, typeKey);
  game.carPhysics.vx = Math.sin(yaw) * 12;
  game.carPhysics.vz = Math.cos(yaw) * 12;
  game.carPhysics.speed = 12;
  game.walker.x = x;
  game.walker.z = z;
  game.walker.yaw = yaw;
  game.rig.snap({ x, z, y: 0, yaw, speed: 12, driving: true });
  return v;
}

/**
 * Put a job on the HUD without playing its dialogue: the mission panel should read as a live job in
 * every frame, not as "no job active".
 */
function quietMission(game, index, stage) {
  game.missions.index = index;
  game.missions.stage = stage;
  game.missions.active = true;
  game.missions.subtitle = null;
  game.missions.subtitleTimer = 0;
  game.missions.thugsDown = 0;
}

/** Park a cruiser at an exact pose — used by the re-dress passes. */
function stageCruiser(game, x, z, yaw) {
  const v = new Vehicle(game.scene, 'police', 0x1b2432, { police: true });
  v.setPose(x, z, yaw);
  // the light bar, the ground pool and the paint only come alive through update(), so run one step
  // of it here; a cruiser that never updates is a black box with a dark roof
  v.update(0.016, 0, 0, true, game.nightGlow ?? 0.8, game.effects);
  const unit = { vehicle: v, x, z, yaw, speed: 0, steer: 0, state: 'chase', ramTimer: 0, shootTimer: 9, boxSide: 1 };
  game.police.units.push(unit);
  return unit;
}

/** Put a traffic car at an exact pose and freeze it there for the frame. */
function parkTrafficCar(world, car, x, z, yaw) {
  if (!car) return null;
  car.x = x;
  car.z = z;
  car.yaw = yaw;
  car.speed = 0;
  car.cruise = 0;
  return car;
}

/** The i-th traffic car, or a freshly spawned one when the pool is smaller than the shot needs. */
function trafficAt(world, index) {
  const traffic = world.traffic;
  if (traffic.cars[index]) return traffic.cars[index];
  const spawned = traffic.spawnCar('sedan', traffic.rng.pick([0xb8443c, 0x2f5f8a, 0xdedad0]), traffic.cars.length);
  if (!spawned) return null;
  traffic.cars.push(spawned);
  traffic.rebuildForNewCar(spawned);
  return spawned;
}

/** The i-th pedestrian, spawned if the crowd is somehow smaller than the shot expects. */
function pedAt(world, index) {
  const peds = world.pedestrians;
  if (peds.people[index]) return peds.people[index];
  const p = peds.makePerson(peds.people.length);
  peds.people.push(p);
  peds.rebuildForNewPerson(p);
  return p;
}

/* ------------------------------------------------------------------ chase: night downtown */

export function setupChase(game, world) {
  world.day.setHour(16.6);
  game.money = 18650;
  game.rep = 4230;
  game.weapon.select('smg');
  game.health = 78;
  game.armour = 45;
  // lane centre of the northbound side of Vice Blvd, well back so the run has road to cover
  const x = 3.4;
  const z = -186;
  seatPlayer(game, 'sports', x, z, 0);
  game.setWanted(4);
  game.police.wanted = 4;
  game.police.coolTimer = -30;
  // straight down the boulevard with the throttle pinned: about 120 m of road, which is exactly the
  // distance the brief warns about, so the re-dress pass is what puts the chase back in frame
  return {
    seconds: 4.2,
    script: (t, ap) => {
      ap.set(t > 0.3 ? ['forward', 'sprint'] : ['forward']);
    },
  };
}

/**
 * The driving shots cover roughly ninety metres before they hold, so everything staged at the spawn
 * is behind the camera by then. This re-dresses the block around the *final* camera position: a
 * cruiser alongside, one behind, traffic ahead in frame, a crowd on the visible sidewalk and the air
 * unit parked overhead with its searchlight on.
 */
export function redressChase(game, world) {
  const car = game.car.group.position;
  const yaw = game.car.group.rotation.y;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  // The chase is a hero-car shot: pull the rig in, drop it low and slide it off the car's axis so
  // the coupe reads as a three-quarter from its rear left flank on the right third, instead of a
  // flat slab up the middle of the road.
  frameShot(game, world, { distance: -1.5, height: -0.8, yaw: 0.26, lateral: -1.4, aim: 4.4, target: -0.45, exposure: 1.16 });
  // cruisers: one alongside on the right, one behind on the left, plus a third closing in
  game.police.units.length = 0;
  stageCruiser(game, car.x + rx * 4.2 + fx * 6.5, car.z + rz * 4.2 + fz * 6.5, yaw + 0.05);
  stageCruiser(game, car.x - rx * 5.2 - fx * 1.5, car.z - rz * 5.2 - fz * 1.5, yaw + 0.03);
  stageCruiser(game, car.x + fx * 21 + rx * 3.2, car.z + fz * 21 + rz * 3.2, yaw + 0.16);
  game.police.wanted = 4;

  // the air unit is parked for the frame: orbiting would slide it out of shot
  game.police.heli.activate({ x: car.x + fx * 10, z: car.z + fz * 10 });
  game.police.heli.parked = true;
  game.police.heli.group.position.set(car.x + fx * 26 + rx * 5.5, 14.5, car.z + fz * 26 + rz * 5.5);
  game.police.heli.angle = Math.atan2(-rx, -rz);
  // the cone is a hard-edged, double-sided additive volume with depthWrite off, and from this rig
  // (14.5 up, 26 behind) its near silhouette slices through the facade on the left, which reads as
  // a stray translucent triangle hanging over the street. Hiding it leaves the searchlight pool on
  // the road to carry the effect; the parked rotor still sells the air unit.
  game.police.heli.cone.visible = false;

  // traffic ahead in the player's lane and in the oncoming lane
  const lanes = [
    { ahead: 16, side: -1 }, { ahead: 27, side: -1 }, { ahead: 41, side: -1 },
    { ahead: 19, side: 1 }, { ahead: 33, side: 1 }, { ahead: 52, side: 1 },
    { ahead: -13, side: 1 }, { ahead: -26, side: 1 },
  ];
  lanes.forEach((l, i) => {
    const c = trafficAt(world, i);
    if (!c) return;
    const side = l.side * 3.4;
    parkTrafficCar(world, c, car.x + fx * l.ahead + rx * side, car.z + fz * l.ahead + rz * side, yaw + (l.side > 0 ? Math.PI : 0));
  });

  // a crowd on the right-hand sidewalk, looking at the chase
  const pedCount = 12;
  for (let i = 0; i < pedCount; i++) {
    const p = pedAt(world, i);
    if (!p) continue;
    const along = -4 + i * 2.1;
    p.pinned = {
      x: car.x + fx * along + rx * 11.5,
      z: car.z + fz * along + rz * 11.5,
      yaw: yaw - Math.PI / 2,
    };
    p.dead = false;
    p.panic = 1.4;
  }

  // the chase frame stays clean: the pursuit is told by the stars, the sirens and the searchlight
  quietMission(game, 4, 2);
  game.hud.toast('WANTED · EVADE THE AIR UNIT', 30);
  world.pedestrians.update(0.0001, 0);
  world.traffic.syncInstances(0.0001, world.day.lampGlow);
}

/* ------------------------------------------------------------------ foot: daytime sidewalk */

export function setupFoot(game, world) {
  world.day.setHour(18.4);
  game.money = 7420;
  game.rep = 2975;
  game.health = 92;
  game.armour = 20;
  game.weapon.select('pistol');
  game.wanted = 0;
  game.police.wanted = 0;
  // Coral Heights sidewalk: block centre (210,150), so the kerb is at z = 127 and the road at z = 120
  // 125.4 is 1.6 m inside that kerb — far enough that the walker's capsule never straddles the curb
  // mesh — and 196 is 14 m west of the block centre, which puts the corner spawn and its wall out of
  // frame. The rig is then snapped to the same x/z instead of damped in: it starts at its default
  // (0,6,-14), and letting it lerp would leave the first captured frames mid-flight and off-comp.
  game.walker.x = 196;
  game.walker.z = 125.4;
  game.walker.yaw = Math.PI / 2;
  // wide and low, walker on the left third: the subtitle box sits dead centre at the bottom of the
  // frame, so the camera stays far enough back to keep the whole body above it while the extra
  // lens width carries the street either side. Dusk now, so the exposure comes down off the
  // midday key: the shot is graded to sit with the other three, not to be the bright one.
  frameShot(game, world, { distance: 2.4, height: -0.5, yaw: 0.18, lateral: 1.2, aim: -2.6, target: -0.45, exposure: 0.55 });
  game.rig.snap({ x: 196, z: 125.4, y: 0.19, yaw: Math.PI / 2, speed: 0, driving: false });
  quietMission(game, 1, 0);
  return {
    seconds: 3.0,
    script: (t, ap) => {
      ap.set(t < 2.2 ? ['forward'] : []);
    },
  };
}

/**
 * Same trap as the chase: after three seconds of walking the spawn corner is behind the camera.
 * The walker's position is read back rather than re-stating 196/125.4, so the redress always agrees
 * with the snap in setupFoot — hard-coding it twice would let the two drift apart silently and the
 * redress would then stage the crowd at a spot the camera is not pointing at.
 */
export function redressFoot(game, world) {
  const x = game.walker.x;
  const z = game.walker.z;
  const yaw = game.walker.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  // a dense row of pedestrians on both sides of the walk, some coming toward the camera
  for (let i = 0; i < 16; i++) {
    const p = pedAt(world, i);
    if (!p) continue;
    const along = -7 + i * 1.55;
    const side = i % 3 === 0 ? 2.4 : i % 3 === 1 ? -1.5 : 0.4;
    p.pinned = { x: x + fx * along + rx * side, z: z + fz * along + rz * side, yaw: i % 2 ? yaw + Math.PI : yaw };
    p.dead = false;
    p.panic = 0;
  }

  // cars in the two lanes beside the sidewalk: the near lane runs with the camera, the far lane
  // comes toward it, which is what makes a street read as alive
  const cars = [
    { along: 5, lateral: 6.2, flip: 0 },
    { along: 18, lateral: 6.2, flip: 0 },
    { along: 34, lateral: 6.2, flip: 0 },
    { along: 10, lateral: 12.8, flip: Math.PI },
    { along: 27, lateral: 12.8, flip: Math.PI },
    { along: 44, lateral: 12.8, flip: Math.PI },
  ];
  cars.forEach((c, i) => {
    const car = trafficAt(world, i + 2);
    if (!car) return;
    parkTrafficCar(world, car, x + fx * c.along + rx * c.lateral, z + fz * c.along + rz * c.lateral, yaw + c.flip);
  });

  // no subtitle here: the dialogue panel sits dead centre and would crop the walker at the waist.
  // The mission framing is carried by the top-left panel and the objective diamond on the minimap.
  game.missions.subtitle = null;
  game.missions.subtitleTimer = 0;
  game.hud.toast('CORAL HEIGHTS · OCEAN DRIVE', 30);
  // pinned bodies only move into the instance buffers on the next update, so run one
  world.pedestrians.update(0.0001, 0);
  world.traffic.syncInstances(0.0001, world.day.lampGlow);
}

/* ------------------------------------------------------------------ drive: sunset coast */

export function setupDrive(game, world) {
  world.day.setHour(17.42);
  game.money = 12980;
  game.rep = 4285;
  game.health = 100;
  game.armour = 60;
  game.weapon.select('pistol');
  // southbound in the coast lane: the sea and the setting sun are both on the right-hand side
  const x = CITY_HALF - 3.4;
  const z = 150;
  seatPlayer(game, 'coupe', x, z, Math.PI);
  // the coast lane puts the water and the setting sun on the right, so the camera is swung off the
  // rear bumper toward the seaward quarter: the car reads from its right rear on the left third,
  // the ocean fills the right half of the frame and the pier and the palms close the left
  frameShot(game, world, { distance: 0.4, height: -0.55, yaw: -0.42, lateral: 1.8, aim: 3.4, target: -0.2, exposure: 0.94 });
  game.carPhysics.vx = 0;
  game.carPhysics.vz = -33;
  game.carPhysics.speed = 33;
  quietMission(game, 2, 2);
  game.wanted = 0;
  return {
    seconds: 5.0,
    script: (t, ap) => {
      ap.set(t > 0.4 ? ['forward', 'sprint'] : ['forward']);
    },
  };
}

export function redressDrive(game, world) {
  const car = game.car.group.position;
  const yaw = game.car.group.rotation.y;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  // traffic ahead on the coast road, plus oncoming traffic in the far lane
  const layout = [
    { ahead: 18, side: 0, flip: 0 },
    { ahead: 34, side: 0, flip: 0 },
    { ahead: 52, side: 0, flip: 0 },
    { ahead: 26, side: 6.8, flip: Math.PI },
    { ahead: 44, side: 6.8, flip: Math.PI },
    { ahead: 64, side: 6.8, flip: Math.PI },
    { ahead: 9, side: 6.8, flip: Math.PI },
  ];
  layout.forEach((l, i) => {
    const c = trafficAt(world, i);
    if (!c) return;
    parkTrafficCar(world, c, car.x + fx * l.ahead + rx * l.side, car.z + fz * l.ahead + rz * l.side, yaw + l.flip);
  });

  // a few people on the beach and the promenade, so the sand is not empty
  for (let i = 0; i < 10; i++) {
    const p = pedAt(world, i);
    if (!p) continue;
    const along = -6 + i * 3.4;
    const out = 9 + (i % 3) * 4;
    p.pinned = { x: car.x + fx * along + rx * out, z: car.z + fz * along + rz * out, yaw: yaw + Math.PI / 2 };
    p.dead = false;
    p.panic = 0;
  }

  game.hud.toast('CORAL HEIGHTS · OCEAN DRIVE', 30);
  world.pedestrians.update(0.0001, 0);
  world.traffic.syncInstances(0.0001, world.day.lampGlow);
}

/* ------------------------------------------------------------------ cover: hero key art */

/**
 * The cover. Same coast road, same coupe, same hour as the drive still, but framed as key art
 * rather than as a viewport: a longer 52 degree lens, the rig dropped below the boot line and swung
 * 28 degrees off the rear axle onto the car's left rear quarter, so the coupe lands on the left
 * third and the boulevard, the palms and the setting sun open across the right two thirds. A degree
 * and a half of roll keeps the horizon off the pixel grid.
 *
 * The car is still rolling, slowly, for two reasons that show up in the pixels: the wheels turn and
 * the headlights and tail lamps are live rather than parked geometry.
 */
export function setupCover(game, world) {
  world.day.setHour(17.9);
  game.money = 12980;
  game.rep = 4285;
  game.health = 100;
  game.armour = 60;
  game.weapon.select('pistol');
  game.wanted = 0;
  game.police.wanted = 0;
  const x = CITY_HALF - 3.4;
  const z = 150;
  seatPlayer(game, 'coupe', x, z, Math.PI);
  frameShot(game, world, {
    fov: 52,
    distance: -3.4,
    height: -1.9,
    yaw: 0.49,
    lateral: 0,
    aim: -3.2,
    target: -0.9,
    exposure: 0.40,
    roll: 0.0262,
  });
  // slow roll: a second and a bit of throttle, then coasting, so the car ends the run at roughly
  // 35 km/h — the wheels are turning and the lamps are live, but nothing is a blur
  game.carPhysics.vx = 0;
  game.carPhysics.vz = -7;
  game.carPhysics.speed = 7;
  quietMission(game, 2, 2);
  return {
    seconds: 2.4,
    script: (t, ap) => {
      ap.set(t < 1.3 ? ['forward'] : []);
    },
  };
}

/**
 * The cover re-dress: almost nothing in frame. A cover wants one subject and clean road, so the
 * traffic that fills the drive still is pulled back to two distant cars and the beach keeps a
 * couple of silhouettes. No police, no toast — the HUD is hidden for this shot anyway.
 */
export function redressCover(game, world) {
  const car = game.car.group.position;
  const yaw = game.car.group.rotation.y;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  const layout = [
    { ahead: 44, side: 0, flip: 0 },
    { ahead: 68, side: 0, flip: 0 },
    { ahead: 38, side: 6.8, flip: Math.PI },
  ];
  layout.forEach((l, i) => {
    const c = trafficAt(world, i);
    if (!c) return;
    parkTrafficCar(world, c, car.x + fx * l.ahead + rx * l.side, car.z + fz * l.ahead + rz * l.side, yaw + l.flip);
  });
  // everything else in the pool goes home, so no car is parked on the cover's sightline
  for (let i = layout.length; i < world.traffic.cars.length; i++) {
    const c = world.traffic.cars[i];
    if (c) parkTrafficCar(world, c, car.x + fx * -220, car.z + fz * -220, yaw);
  }

  for (let i = 0; i < 6; i++) {
    const p = pedAt(world, i);
    if (!p) continue;
    const along = 4 + i * 5.5;
    const out = 16 + (i % 3) * 5;
    p.pinned = { x: car.x + fx * along + rx * out, z: car.z + fz * along + rz * out, yaw: yaw + Math.PI / 2 };
    p.dead = false;
    p.panic = 0;
  }

  world.pedestrians.update(0.0001, 0);
  world.traffic.syncInstances(0.0001, world.day.lampGlow);
}

/* ------------------------------------------------------------------ mission: firefight */

export function setupMission(game, world) {
  world.day.setHour(20.1);
  game.money = 24600;
  game.rep = 5100;
  game.health = 64;
  game.armour = 30;
  game.weapon.select('smg');
  game.weapon.ammo.smg = 24;
  // Cannon St, in the road, facing north: buildings either side, a crew ahead and cruisers closing in
  game.walker.x = -180;
  game.walker.z = -46;
  game.walker.yaw = 0;
  // low and off-axis: the player reads on the left third with the crew and the lit cruisers
  // stacked across the rest of the street
  frameShot(game, world, { distance: 0.5, height: -0.45, yaw: 0.16, lateral: 1.4, aim: -3.6, target: 0.1, exposure: 0.9, exposure: 0.9 });
  game.rig.snap({ x: -180, z: -46, y: 0, yaw: 0, speed: 0, driving: false });
  quietMission(game, 3, 1);
  game.spawnThugs(-180, -30, 4);
  game.setWanted(3);
  game.police.wanted = 3;
  game.police.coolTimer = -30;
  game.missions.say({ who: 'Deacon Ruhl', portrait: 'deacon', line: 'Four of them, and they know you are coming. Make it loud.' }, 40);
  return {
    seconds: 2.4,
    script: (t, ap) => {
      ap.set(t < 1.0 ? ['forward'] : []);
      ap.mouse.down = t > 1.2;
    },
  };
}

export function redressMission(game, world) {
  const x = game.walker.x;
  const z = game.walker.z;

  // the crew the player is shooting at, spread across the road ahead
  game.thugs.members.length = 0;
  game.thugs.spawn(x - 1.6, z + 13, 3);
  const spots = [
    { x: x - 2.4, z: z + 11.5 },
    { x: x + 2.2, z: z + 14.5 },
    { x: x - 0.4, z: z + 19.0 },
  ];
  game.thugs.members.forEach((m, i) => {
    const sp = spots[i % spots.length];
    m.x = sp.x;
    m.z = sp.z;
    m.yaw = Math.PI;
    m.dead = false;
    m.character.animate(0.016, 'idle', 0, 1);
    m.character.setPosition(m.x, 0.19, m.z, m.yaw);
  });
  game.thugsDown = 2;

  // two cruisers slewed across the street with their bars lit, plus the air unit above
  game.police.units.length = 0;
  // one cruiser close and angled so its bar is unmistakable, one further back across the street
  stageCruiser(game, x - 4.6, z + 7.5, Math.PI * 0.72);
  stageCruiser(game, x + 6.2, z + 17, -Math.PI * 0.55);
  game.police.wanted = 3;
  game.police.heli.activate({ x, z: z + 10 });
  game.police.heli.parked = true;
  game.police.heli.group.position.set(x - 7, 17, z + 30);
  game.police.heli.angle = Math.PI;

  // traffic stopped behind the cruisers, and a crowd watching from the sidewalks
  for (let i = 0; i < 4; i++) {
    const c = trafficAt(world, i);
    if (!c) continue;
    const side = i % 2 === 0 ? -3.4 : 3.4;
    parkTrafficCar(world, c, x + side, z + 36 + i * 9, Math.PI);
  }
  for (let i = 0; i < 10; i++) {
    const p = pedAt(world, i);
    if (!p) continue;
    const side = i % 2 === 0 ? -1 : 1;
    p.pinned = { x: x + side * 10.5, z: z + 4 + i * 2.6, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
    p.dead = false;
    p.panic = 2.4;
  }

  // one round in the air at the instant of the frame: real muzzle flash, real tracer
  game.weapon.cooldown = 0;
  game.aiming = true;
  game.fireWeapon();
  game.weapon.cooldown = 0.2;
  game.hud.toast('DOCK WITNESS · STAGE 2', 30);
  world.pedestrians.update(0.0001, 0);
  world.traffic.syncInstances(0.0001, world.day.lampGlow);
}

export const SHOTS = {
  cover: { setup: setupCover, redress: redressCover },
  chase: { setup: setupChase, redress: redressChase },
  foot: { setup: setupFoot, redress: redressFoot },
  drive: { setup: setupDrive, redress: redressDrive },
  mission: { setup: setupMission, redress: redressMission },
};

export { CAR_TYPES };
