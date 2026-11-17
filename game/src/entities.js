// The living city: the player, cars (traffic, parked, police), pedestrians,
// bullets, particles and pickups. No drawing here — render.js draws the
// state this file owns. stepEntities advances one fixed step and reports
// what happened as event strings the main loop turns into sound and wanted.
import { AVENUES, CAR, PEDESTRIANS, PARKED_CARS, PLAYER, ROAD_WIDTH, STREETS, TRAFFIC_CARS, WORLD } from './config.js';
import { hitsBuilding, isRoad, resolveBounds, resolveBuildings } from './city.js';
import { pick, range, rangeInt } from './random.js';

export const EVENT_SHOT = 'shot';
export const EVENT_CRASH = 'crash';
export const EVENT_PED_HIT = 'pedHit';
export const EVENT_CAR_STOLEN = 'carStolen';
export const EVENT_PICKUP = 'pickup';
export const EVENT_CAR_DEAD = 'carDead';
export const EVENT_PUNCH = 'punch';
export const EVENT_EXPLOSION = 'explosion';

const CAR_MODELS = [
  { kind: 'sedan', length: 46, width: 22 },
  { kind: 'coupe', length: 42, width: 21 },
  { kind: 'van', length: 54, width: 24 },
  { kind: 'taxi', length: 46, width: 22 },
];

function makeCar(x, y, angle, color, model, driver) {
  return {
    x, y, angle, speed: 0, vx: 0, vy: 0,
    color, model, driver, health: CAR.maxHealth,
    dead: false, smokeTimer: 0, explodeTimer: 0,
    aiThrottle: 0, aiSteer: 0, horn: 0,
    // Traffic route: which road it follows and which way.
    axis: 'x', line: 0, dir: 1, lane: 16, targetSpeed: 150,
  };
}

export function createEntities(city, random) {
  const world = {
    city, random, time: 0,
    player: {
      x: 640, y: 260, angle: 0, health: PLAYER.maxHealth,
      ammo: PLAYER.startAmmo, cash: 120, inCar: null,
      shootCd: 0, punchCd: 0, hurtCd: 0, knockX: 0, knockY: 0, dead: false,
    },
    cars: [], peds: [], bullets: [], particles: [], skids: [],
    pickups: [], rivals: [], cops: [], events: [],
  };
  spawnParkedCars(world);
  spawnTraffic(world);
  spawnPedestrians(world);
  return world;
}

function spawnParkedCars(world) {
  const { city, random } = world;
  const spots = [...city.parkingSpots];
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (let i = 0; i < Math.min(PARKED_CARS, spots.length); i += 1) {
    const s = spots[i];
    const model = pick(random, CAR_MODELS);
    world.cars.push(makeCar(s.x, s.y, s.angle, pick(random, CAR.colors), model, null));
  }
}

function randomRoadStart(random) {
  // A point on a random road, with a random direction along it.
  if (random() < 0.5) {
    return { axis: 'x', line: pick(random, STREETS), pos: range(random, 100, WORLD.width - 100), dir: random() < 0.5 ? 1 : -1 };
  }
  return { axis: 'y', line: pick(random, AVENUES), pos: range(random, 100, WORLD.height - 100), dir: random() < 0.5 ? 1 : -1 };
}

function laneOffset(axis, dir) {
  // Right-hand traffic: the lane sits on the right of the direction of travel.
  if (axis === 'x') return dir > 0 ? 18 : -18;
  return dir > 0 ? -18 : 18;
}

export function spawnTrafficCar(world, nearX, nearY) {
  const { random } = world;
  let start = randomRoadStart(random);
  // Prefer a road near the given point when one is asked for.
  if (nearX !== undefined) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < 8; i += 1) {
      const s = randomRoadStart(random);
      const x = s.axis === 'x' ? s.pos : s.line;
      const y = s.axis === 'x' ? s.line : s.pos;
      const d = Math.hypot(x - nearX, y - nearY);
      if (d < bestD) { bestD = d; best = s; }
    }
    start = best;
  }
  const model = pick(random, CAR_MODELS);
  const color = model.kind === 'taxi' ? '#e8c33c' : pick(random, CAR.colors);
  const lane = laneOffset(start.axis, start.dir);
  const x = start.axis === 'x' ? start.pos : start.line + lane;
  const y = start.axis === 'x' ? start.line + lane : start.pos;
  const angle = start.axis === 'x' ? (start.dir > 0 ? 0 : Math.PI) : (start.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const car = makeCar(x, y, angle, color, model, 'traffic');
  car.axis = start.axis;
  car.line = start.line;
  car.dir = start.dir;
  car.lane = lane;
  car.targetSpeed = range(random, 130, 200);
  car.speed = car.targetSpeed;
  world.cars.push(car);
  return car;
}

function spawnTraffic(world) {
  for (let i = 0; i < TRAFFIC_CARS; i += 1) spawnTrafficCar(world);
}

function spawnPedestrians(world) {
  const { random } = world;
  for (let i = 0; i < PEDESTRIANS; i += 1) {
    spawnPed(world, range(random, 80, WORLD.width - 80), range(random, 80, WORLD.height - 80));
  }
}

export function spawnPed(world, x, y) {
  const { random } = world;
  const colors = ['#d96c4a', '#4a7ad9', '#7ad94a', '#d9c44a', '#9a4ad9', '#4ad9c4', '#e8e8e8', '#d94a8a'];
  const ped = {
    x, y, angle: random() * Math.PI * 2, speed: range(random, 45, 75),
    color: pick(random, colors), state: 'walk', stateTimer: range(random, 2, 6),
    tx: x, ty: y, down: 0, fleeX: 0, fleeY: 0,
  };
  world.peds.push(ped);
  return ped;
}

/** A parked or traffic car the player can steal, nearest to a point. */
export function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function fireBullet(world, x, y, angle, from, damage) {
  const speed = 900;
  world.bullets.push({
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life: 0.55, damage: damage || PLAYER.pistolDamage, from,
  });
  world.events.push(EVENT_SHOT);
  addParticles(world, x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, 3, '#ffd76a', 60, 0.12);
}

export function addParticles(world, x, y, count, color, speed, life) {
  for (let i = 0; i < count; i += 1) {
    const a = world.random() * Math.PI * 2;
    const s = speed * (0.3 + world.random() * 0.7);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.6 + world.random() * 0.8), maxLife: life,
      color, size: 2 + world.random() * 3,
    });
  }
}

export function addSmoke(world, x, y) {
  world.particles.push({
    x: x + range(world.random, -6, 6), y: y + range(world.random, -6, 6),
    vx: range(world.random, -12, 12), vy: range(world.random, -30, -14),
    life: range(world.random, 0.5, 1), maxLife: 1, color: '#555', size: 4 + world.random() * 4,
  });
}

function damageCar(world, car, amount) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.explodeTimer = 1.4;
    world.events.push(EVENT_CAR_DEAD);
  }
}

function driveCar(world, car, throttle, steer, dt) {
  // Arcade handling: speed along the heading, velocity eased toward it.
  const maxF = car.model.kind === 'van' ? CAR.maxSpeed * 0.82 : CAR.maxSpeed;
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.maxReverse, car.speed + CAR.reverseAccel * throttle * dt);
  } else {
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(maxF, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 160);
  car.angle += steer * CAR.steerRate * speedFactor * dt * (car.speed < 0 ? -1 : 1);
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const grip = 1 - Math.exp(-CAR.grip * dt);
  car.vx += (hx * car.speed - car.vx) * grip;
  car.vy += (hy * car.speed - car.vy) * grip;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // Skid marks when turning hard at speed.
  if (Math.abs(car.speed) > 260 && Math.abs(steer) > 0.5) {
    world.skids.push({ x: car.x - hx * 16, y: car.y - hy * 16, angle: car.angle, life: 4 });
    if (world.skids.length > 220) world.skids.splice(0, world.skids.length - 220);
  }
}

function collideCarWithWorld(world, car) {
  // Circle checks at the centre and both ends of the car.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const points = [
    { x: car.x, y: car.y, r: 17 },
    { x: car.x + hx * 15, y: car.y + hy * 15, r: 13 },
    { x: car.x - hx * 15, y: car.y - hy * 15, r: 13 },
  ];
  let hit = false;
  for (const p of points) {
    if (!hitsBuilding(world.city, p.x, p.y, p.r)) continue;
    hit = true;
    const fixed = resolveBuildings(world.city, p.x, p.y, p.r);
    car.x += fixed.x - p.x;
    car.y += fixed.y - p.y;
  }
  const b = resolveBounds(car.x, car.y, 18);
  if (b.x !== car.x || b.y !== car.y) {
    hit = true;
    car.x = b.x;
    car.y = b.y;
  }
  if (hit) {
    const impact = Math.abs(car.speed);
    car.speed *= -0.25;
    car.vx *= -0.25;
    car.vy *= -0.25;
    if (impact > 120) {
      damageCar(world, car, impact * 0.06);
      addParticles(world, car.x, car.y, 8, '#ffd76a', 160, 0.3);
      world.events.push(EVENT_CRASH);
    }
  }
}

function carAhead(world, car, dist) {
  // The nearest car ahead of `car` on its road, within dist.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  let best = null;
  let bestD = dist;
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * hx + dy * hy;
    if (along < 0 || along > bestD) continue;
    const across = Math.abs(-dx * hy + dy * hx);
    if (across < 26) { bestD = along; best = other; }
  }
  return best;
}

function updateTrafficCar(world, car, dt) {
  // Follow the road grid: drive along the current road, turn at crossings.
  const lines = car.axis === 'x' ? AVENUES : STREETS;
  const pos = car.axis === 'x' ? car.x : car.y;
  let next = null;
  for (const l of lines) {
    const d = (l - pos) * car.dir;
    if (d > 0 && (next === null || d < (next - pos) * car.dir)) next = l;
  }
  const atEdge = next === null;
  const distToNext = atEdge ? Infinity : Math.abs(next - pos);
  if (!atEdge && distToNext < 30 && world.random() < 0.5) {
    // Turn onto the crossing road.
    const newAxis = car.axis === 'x' ? 'y' : 'x';
    const newDir = world.random() < 0.5 ? 1 : -1;
    const newLine = next;
    const lane = laneOffset(newAxis, newDir);
    car.axis = newAxis;
    car.line = newLine;
    car.dir = newDir;
    car.lane = lane;
    if (newAxis === 'x') car.y = newLine + lane;
    else car.x = newLine + lane;
    car.angle = newAxis === 'x' ? (newDir > 0 ? 0 : Math.PI) : (newDir > 0 ? Math.PI / 2 : -Math.PI / 2);
  } else if (atEdge || distToNext < 6) {
    // End of the road: turn around at the map edge or keep going straight.
    if (atEdge) {
      car.dir *= -1;
      car.angle += Math.PI;
    }
  }
  // Steer back onto the lane centre.
  const lanePos = car.axis === 'x' ? car.y : car.x;
  const want = car.line + car.lane;
  const err = want - lanePos;
  const wantAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  let angleErr = wantAngle - car.angle;
  while (angleErr > Math.PI) angleErr -= Math.PI * 2;
  while (angleErr < -Math.PI) angleErr += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, angleErr * 2 + err * 0.01 * car.dir * (car.axis === 'x' ? 1 : -1)));
  const ahead = carAhead(world, car, 78);
  const throttle = ahead ? (car.speed > 20 ? -0.6 : 0) : (car.speed < car.targetSpeed ? 0.7 : 0);
  driveCar(world, car, throttle, steer, dt);
  // Snap the car back to its lane gently so traffic never drifts off-road.
  if (car.axis === 'x') car.y += (want - car.y) * Math.min(1, 2 * dt);
  else car.x += (want - car.x) * Math.min(1, 2 * dt);
}

function updateCars(world, dt) {
  for (const car of world.cars) {
    if (car.dead) {
      car.explodeTimer -= dt;
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        addSmoke(world, car.x, car.y);
      }
      if (car.explodeTimer <= 0) {
        car.explodeTimer = 9999;
        addParticles(world, car.x, car.y, 40, '#ff8c3a', 320, 0.7);
        addParticles(world, car.x, car.y, 24, '#555', 120, 1.2);
        world.events.push(EVENT_EXPLOSION);
        // The blast hurts whatever is close.
        for (const other of world.cars) {
          if (other !== car && Math.hypot(other.x - car.x, other.y - car.y) < 90) damageCar(world, other, 60);
        }
        const p = world.player;
        if (!p.inCar && Math.hypot(p.x - car.x, p.y - car.y) < 90) hurtPlayer(world, 40);
      }
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      continue;
    }
    if (car.driver === 'traffic') updateTrafficCar(world, car, dt);
    else if (car.driver === 'police') driveCar(world, car, car.aiThrottle, car.aiSteer, dt);
    else if (car.driver === 'player') { /* driven by updatePlayer */ }
    else {
      // Parked: ease to a stop.
      car.speed *= 1 - Math.min(1, 3 * dt);
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      car.vx *= 1 - Math.min(1, 3 * dt);
      car.vy *= 1 - Math.min(1, 3 * dt);
    }
    collideCarWithWorld(world, car);
  }
  // Car-to-car bumps.
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 34;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 140) {
        // One hit never takes more than 12: a head-on crash hurts, but a
        // single ram can't gut a healthy car.
        const dmg = Math.min(12, rel * 0.025);
        damageCar(world, a, dmg);
        damageCar(world, b, dmg);
        addParticles(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd76a', 140, 0.25);
        world.events.push(EVENT_CRASH);
      }
      const tmp = a.speed;
      a.speed = b.speed * 0.5;
      b.speed = tmp * 0.5;
    }
  }
  // Cars running over pedestrians.
  for (const car of world.cars) {
    if (car.dead || Math.abs(car.speed) < 60) continue;
    for (const ped of world.peds) {
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
        ped.down = 4;
        ped.state = 'down';
        // Only the player's own car counts as the player's crime.
        if (car === world.player.inCar) world.events.push(EVENT_PED_HIT);
        addParticles(world, ped.x, ped.y, 6, '#ffffff', 120, 0.4);
        world.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', amount: rangeInt(world.random, 10, 40), bob: 0 });
      }
    }
    // Cars running over the player on foot.
    const p = world.player;
    if (!p.inCar && !p.dead && p.hurtCd <= 0 && Math.hypot(p.x - car.x, p.y - car.y) < 26) {
      hurtPlayer(world, Math.abs(car.speed) * 0.06 + 5);
      p.hurtCd = 0.8;
      p.knockX = (p.x - car.x) * 2;
      p.knockY = (p.y - car.y) * 2;
      car.speed *= 0.6;
    }
  }
}

export function hurtPlayer(world, amount) {
  const p = world.player;
  if (p.dead) return;
  p.health -= amount;
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
  }
}

function updatePlayer(world, dt, ctl) {
  const p = world.player;
  if (p.dead) return;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  // Knockback eases out.
  p.x += p.knockX * dt;
  p.y += p.knockY * dt;
  p.knockX *= 1 - Math.min(1, 6 * dt);
  p.knockY *= 1 - Math.min(1, 6 * dt);

  const car = p.inCar;
  if (car) {
    if (car.dead) {
      // A dead car ejects its driver.
      p.inCar = null;
      p.x = car.x + 30;
      p.y = car.y;
      car.driver = null;
      return;
    }
    driveCar(world, car, ctl.throttle, ctl.steer, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Drive-by: the pistol fires straight ahead from a moving car.
    if (ctl.shooting && p.shootCd <= 0 && p.ammo > 0) {
      p.shootCd = PLAYER.pistolCooldown;
      p.ammo -= 1;
      fireBullet(world, car.x + Math.cos(car.angle) * 24, car.y + Math.sin(car.angle) * 24, car.angle, 'player');
    }
    if (ctl.interactPressed) {
      p.inCar = null;
      car.driver = null;
      car.speed *= 0.4;
      p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 30;
      p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 30;
      const fixed = resolveBuildings(world.city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
    }
    return;
  }

  // On foot.
  const speed = ctl.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.x += ctl.moveX * speed * dt;
  p.y += ctl.moveY * speed * dt;
  p.angle = ctl.aimAngle;
  const b = resolveBounds(p.x, p.y, PLAYER.radius);
  p.x = b.x;
  p.y = b.y;
  const fixed = resolveBuildings(world.city, p.x, p.y, PLAYER.radius);
  p.x = fixed.x;
  p.y = fixed.y;

  if (ctl.interactPressed) {
    const target = nearestCar(world, p.x, p.y, 52);
    if (target) {
      const wasParked = target.driver === null || target.driver === 'traffic';
      p.inCar = target;
      target.driver = 'player';
      target.speed = 0;
      if (wasParked) world.events.push(EVENT_CAR_STOLEN);
    }
  }
  if (ctl.punchPressed && p.punchCd <= 0) {
    p.punchCd = 0.4;
    world.events.push(EVENT_PUNCH);
    const px = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const py = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    for (const r of world.rivals) {
      if (r.health > 0 && Math.hypot(r.x - px, r.y - py) < 26) r.health -= PLAYER.punchDamage;
    }
    for (const c of world.cops) {
      if (c.health > 0 && Math.hypot(c.x - px, c.y - py) < 26) c.health -= PLAYER.punchDamage;
    }
    for (const ped of world.peds) {
      if (ped.down <= 0 && Math.hypot(ped.x - px, ped.y - py) < 26) {
        ped.down = 3;
        ped.state = 'down';
        world.events.push(EVENT_PED_HIT);
      }
    }
  }
  if (ctl.shooting && p.shootCd <= 0 && p.ammo > 0) {
    p.shootCd = PLAYER.pistolCooldown;
    p.ammo -= 1;
    fireBullet(world, p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18, p.angle, 'player');
  }
}

function updatePeds(world, dt) {
  for (const ped of world.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      if (ped.down <= 0) {
        ped.state = 'flee';
        ped.stateTimer = 3;
        ped.fleeX = ped.x + (world.random() - 0.5) * 400;
        ped.fleeY = ped.y + (world.random() - 0.5) * 400;
      }
      continue;
    }
    ped.stateTimer -= dt;
    if (ped.state === 'flee') {
      const dx = ped.fleeX - ped.x;
      const dy = ped.fleeY - ped.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += Math.cos(ped.angle) * ped.speed * 1.9 * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * 1.9 * dt;
      }
      if (ped.stateTimer <= 0) ped.state = 'walk';
    } else {
      if (ped.stateTimer <= 0) {
        // Pick a new stroll target on a nearby road.
        const onAve = world.random() < 0.5;
        if (onAve) {
          ped.tx = pick(world.random, AVENUES) + (world.random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + 10);
          ped.ty = ped.y + range(world.random, -300, 300);
        } else {
          ped.tx = ped.x + range(world.random, -300, 300);
          ped.ty = pick(world.random, STREETS) + (world.random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + 10);
        }
        ped.stateTimer = range(world.random, 4, 9);
      }
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d > 12) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    }
    const b = resolveBounds(ped.x, ped.y, 10);
    ped.x = b.x;
    ped.y = b.y;
    const fixed = resolveBuildings(world.city, ped.x, ped.y, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
  }
}

/** Pedestrians near a loud event run away from it. */
export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.down > 0) continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.stateTimer = 4;
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.fleeX = ped.x + Math.cos(a) * 300;
      ped.fleeY = ped.y + Math.sin(a) * 300;
    }
  }
}

function updateBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && hitsBuilding(world.city, b.x, b.y, 2)) {
      addParticles(world, b.x, b.y, 3, '#ffd76a', 100, 0.2);
      dead = true;
    }
    if (!dead && b.from !== 'player') {
      const p = world.player;
      if (!p.dead && Math.hypot(p.x - b.x, p.y - b.y) < 16) {
        hurtPlayer(world, b.damage);
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      for (const r of world.rivals) {
        if (r.health > 0 && Math.hypot(r.x - b.x, r.y - b.y) < 16) {
          r.health -= b.damage;
          addParticles(world, r.x, r.y, 4, '#ff5a5a', 120, 0.3);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const c of world.cops) {
          if (c.health > 0 && Math.hypot(c.x - b.x, c.y - b.y) < 16) {
            c.health -= b.damage;
            addParticles(world, c.x, c.y, 4, '#ff5a5a', 120, 0.3);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of world.cars) {
          if (car.dead) continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 22) {
            damageCar(world, car, b.damage);
            addParticles(world, b.x, b.y, 3, '#ffd76a', 100, 0.2);
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

function updateParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - Math.min(1, 2 * dt);
    p.vy *= 1 - Math.min(1, 2 * dt);
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.skids.length - 1; i >= 0; i -= 1) {
    world.skids[i].life -= dt;
    if (world.skids[i].life <= 0) world.skids.splice(i, 1);
  }
}

function updatePickups(world, dt) {
  const p = world.player;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const pk = world.pickups[i];
    pk.bob += dt;
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d < 90 && !p.inCar) {
      pk.x += ((p.x - pk.x) / Math.max(1, d)) * 140 * dt;
      pk.y += ((p.y - pk.y) / Math.max(1, d)) * 140 * dt;
    }
    if (d < 26) {
      if (pk.kind === 'cash') p.cash += pk.amount;
      else if (pk.kind === 'health') p.health = Math.min(PLAYER.maxHealth, p.health + pk.amount);
      else if (pk.kind === 'ammo') p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + pk.amount);
      world.events.push(EVENT_PICKUP);
      world.pickups.splice(i, 1);
    }
  }
}

/** Rival crew on foot: they close in and shoot at the player. */
function updateRivals(world, dt) {
  const p = world.player;
  for (let i = world.rivals.length - 1; i >= 0; i -= 1) {
    const r = world.rivals[i];
    if (r.health <= 0) {
      addParticles(world, r.x, r.y, 10, '#ff5a5a', 150, 0.4);
      world.pickups.push({ x: r.x, y: r.y, kind: 'cash', amount: rangeInt(world.random, 40, 90), bob: 0 });
      world.rivals.splice(i, 1);
      continue;
    }
    const dx = p.x - r.x;
    const dy = p.y - r.y;
    const d = Math.hypot(dx, dy);
    r.angle = Math.atan2(dy, dx);
    if (d > 260) {
      r.x += Math.cos(r.angle) * 130 * dt;
      r.y += Math.sin(r.angle) * 130 * dt;
    }
    r.shootCd -= dt;
    if (d < 380 && r.shootCd <= 0 && !p.dead) {
      r.shootCd = range(world.random, 0.7, 1.4);
      fireBullet(world, r.x + Math.cos(r.angle) * 18, r.y + Math.sin(r.angle) * 18, r.angle + range(world.random, -0.12, 0.12), 'rival', 9);
    }
    const fixed = resolveBuildings(world.city, r.x, r.y, 13);
    r.x = fixed.x;
    r.y = fixed.y;
  }
}

export function spawnRival(world, x, y) {
  world.rivals.push({ x, y, angle: 0, health: 120, shootCd: range(world.random, 0.3, 1) });
}

export function stepEntities(world, dt, ctl) {
  world.time += dt;
  updatePlayer(world, dt, ctl);
  updateCars(world, dt);
  updatePeds(world, dt);
  updateRivals(world, dt);
  updateBullets(world, dt);
  updateParticles(world, dt);
  updatePickups(world, dt);
  // Keep traffic topped up near the player.
  const traffic = world.cars.filter((c) => c.driver === 'traffic').length;
  if (traffic < TRAFFIC_CARS && world.random() < 0.5) {
    spawnTrafficCar(world, world.player.x, world.player.y);
  }
}
