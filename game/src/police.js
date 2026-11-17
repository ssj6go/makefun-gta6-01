// The wanted system: stars, police pursuit cars, cops on foot, busts and
// the slow cool-down when the player stays out of sight.
import { AVENUES, MAX_POLICE_CARS, ROAD_WIDTH, STREETS, WANTED, WORLD } from './config.js';
import { roadWaypoint } from './city.js';
import { fireBullet, hurtPlayer } from './entities.js';
import { pick, range } from './random.js';

export const EVENT_BUSTED = 'busted';
export const EVENT_WANTED_UP = 'wantedUp';
export const EVENT_WANTED_DOWN = 'wantedDown';

export function createPolice() {
  return {
    stars: 0,
    unseenTimer: 0,
    decayTimer: 0,
    bustTimer: 0,
    spawnTimer: 0,
  };
}

export function addWanted(world, police, amount) {
  if (amount <= 0) return;
  const before = police.stars;
  police.stars = Math.min(WANTED.maxStars, police.stars + amount);
  police.unseenTimer = 0;
  police.decayTimer = 0;
  if (police.stars > before) world.events.push(EVENT_WANTED_UP);
}

export function clearWanted(world, police) {
  police.stars = 0;
  police.unseenTimer = 0;
  police.bustTimer = 0;
  world.cars = world.cars.filter((c) => c.driver !== 'police');
  world.cops = [];
}

function policeCarCount(world) {
  return world.cars.filter((c) => c.driver === 'police' && !c.dead).length;
}

function spawnPoliceCar(world, police) {
  const p = world.player;
  // A road point 450-700 px from the player.
  for (let tries = 0; tries < 12; tries += 1) {
    const vertical = world.random() < 0.5;
    let x;
    let y;
    if (vertical) {
      x = pick(world.random, AVENUES);
      y = p.y + range(world.random, -650, 650);
    } else {
      x = p.x + range(world.random, -650, 650);
      y = pick(world.random, STREETS);
    }
    x = Math.max(60, Math.min(WORLD.width - 60, x));
    y = Math.max(60, Math.min(WORLD.height - 60, y));
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 420 || d > 800) continue;
    const car = {
      x, y, angle: Math.atan2(p.y - y, p.x - x), speed: 200, vx: 0, vy: 0,
      color: '#1c2430', model: { kind: 'police', length: 48, width: 23 },
      driver: 'police', health: 100, dead: false, smokeTimer: 0, explodeTimer: 0,
      aiThrottle: 1, aiSteer: 0, horn: 0, axis: 'x', line: 0, dir: 1, lane: 0,
      targetSpeed: 480, stuckTimer: 0, reverseTimer: 0,
    };
    world.cars.push(car);
    return;
  }
}

function spawnCop(world) {
  const p = world.player;
  const a = world.random() * Math.PI * 2;
  const d = range(world.random, 200, 320);
  const x = Math.max(30, Math.min(WORLD.width - 30, p.x + Math.cos(a) * d));
  const y = Math.max(30, Math.min(WORLD.height - 30, p.y + Math.sin(a) * d));
  world.cops.push({ x, y, angle: 0, health: 50, shootCd: range(world.random, 0.5, 1.2) });
}

function updatePoliceCar(world, car, dt) {
  const p = world.player;
  // Pursuit steering toward the player's predicted position, along the
  // roads — only the final stretch cuts straight in for the ram.
  const lead = 0.45;
  const tx = p.x + (p.inCar ? p.inCar.vx * lead : 0);
  const ty = p.y + (p.inCar ? p.inCar.vy * lead : 0);
  const d = Math.hypot(tx - car.x, ty - car.y);
  const wp = d < 130 ? { x: tx, y: ty } : roadWaypoint(car.x, car.y, tx, ty);
  const want = Math.atan2(wp.y - car.y, wp.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.aiSteer = Math.max(-1, Math.min(1, diff * 2.2));
  car.aiThrottle = 1;
  // Brake into sharp turns so the car makes the corner instead of
  // overshooting it into a building.
  if (Math.abs(diff) > 0.9 && Math.abs(car.speed) > 200) car.aiThrottle = -0.3;
  // Ease off when closing in: the pursuit boxes the player in instead of
  // kamikaze-ramming a slow car at full speed, hit after hit.
  if (d < 170 && Math.abs(car.speed) > 230) car.aiThrottle = 0;
  // Stuck? Back up for a second, then try again.
  if (Math.abs(car.speed) < 25 && car.aiThrottle > 0) {
    car.stuckTimer += dt;
  } else {
    car.stuckTimer = 0;
  }
  if (car.stuckTimer > 1.6) {
    car.reverseTimer = 1.1;
    car.stuckTimer = 0;
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    car.aiThrottle = -0.8;
    car.aiSteer = -car.aiSteer;
  }
}

function updateCops(world, police, dt) {
  const p = world.player;
  let touching = false;
  for (let i = world.cops.length - 1; i >= 0; i -= 1) {
    const c = world.cops[i];
    if (c.health <= 0) {
      world.cops.splice(i, 1);
      addWanted(world, police, 1);
      continue;
    }
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    c.angle = Math.atan2(dy, dx);
    if (d > 24) {
      const speed = 235;
      c.x += Math.cos(c.angle) * speed * dt;
      c.y += Math.sin(c.angle) * speed * dt;
    } else if (!p.inCar) {
      touching = true;
    }
    c.shootCd -= dt;
    if (police.stars >= 3 && d < 340 && d > 60 && c.shootCd <= 0 && !p.dead) {
      c.shootCd = range(world.random, 0.9, 1.6);
      fireBullet(world, c.x + Math.cos(c.angle) * 16, c.y + Math.sin(c.angle) * 16, c.angle + range(world.random, -0.14, 0.14), 'cop', 9);
    }
  }
  // Busted: a cop holds the player on foot.
  if (touching && !p.inCar && !p.dead) {
    police.bustTimer += dt;
    if (police.bustTimer >= WANTED.bustTime) {
      police.bustTimer = 0;
      world.events.push(EVENT_BUSTED);
    }
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
  }
}

function policeCanSee(world) {
  const p = world.player;
  for (const car of world.cars) {
    if (car.driver === 'police' && !car.dead && Math.hypot(car.x - p.x, car.y - p.y) < 560) return true;
  }
  for (const c of world.cops) {
    if (Math.hypot(c.x - p.x, c.y - p.y) < 360) return true;
  }
  return false;
}

export function stepPolice(world, police, dt) {
  // Wanted decay when unseen.
  if (police.stars > 0) {
    if (policeCanSee(world)) {
      police.unseenTimer = 0;
      police.decayTimer = 0;
    } else {
      police.unseenTimer += dt;
      if (police.unseenTimer > WANTED.decayDelay) {
        police.decayTimer += dt;
        if (police.decayTimer >= WANTED.decayEvery) {
          police.decayTimer = 0;
          police.stars -= 1;
          world.events.push(EVENT_WANTED_DOWN);
          if (police.stars === 0) {
            world.cars = world.cars.filter((c) => c.driver !== 'police');
            world.cops = [];
          }
        }
      }
    }
  }

  // Keep the pursuit sized to the wanted level.
  police.spawnTimer -= dt;
  if (police.stars > 0 && police.spawnTimer <= 0) {
    police.spawnTimer = 1.2;
    const wantCars = Math.min(police.stars, MAX_POLICE_CARS);
    if (policeCarCount(world) < wantCars) spawnPoliceCar(world, police);
    if (!world.player.inCar && police.stars >= 2 && world.cops.length < police.stars) spawnCop(world);
  }

  for (const car of world.cars) {
    if (car.driver === 'police' && !car.dead) updatePoliceCar(world, car, dt);
  }
  updateCops(world, police, dt);
}

/** Any siren wailing nearby (for the audio layer). */
export function sirensAudible(world) {
  const p = world.player;
  for (const car of world.cars) {
    if (car.driver === 'police' && !car.dead && Math.hypot(car.x - p.x, car.y - p.y) < 700) return true;
  }
  return false;
}
