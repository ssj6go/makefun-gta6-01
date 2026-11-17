// The screenshot scenes behind ?shot=cover|chase|foot|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (road-aware driving, walking,
// aiming), so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { AVENUES, STREETS } from './config.js';
import { buildCity, nearestAvenue, nearestStreet, PLACES, roadWaypoint } from './city.js';
import { createEntities, nearestCar, stepEntities } from './entities.js';
import { createPolice, stepPolice } from './police.js';
import { createMissions, startMissionAt, stepMissions } from './missions.js';
import { createRandom } from './random.js';

const STEP = 1 / 60;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function idleCtl() {
  return {
    moveX: 0, moveY: 0, running: false, aimAngle: 0, shooting: false,
    punchPressed: false, interactPressed: false, throttle: 0, steer: 0,
  };
}

/** A driver that steers the player's car along the roads toward a target. */
function createRoadDriver(world, getTarget) {
  let stuckTimer = 0;
  let reverseTimer = 0;
  let lastX = 0;
  let lastY = 0;
  let checkTimer = 0;
  return {
    control(dt) {
      const ctl = idleCtl();
      const p = world.player;
      const car = p.inCar;
      if (!car || car.dead) return ctl;
      const target = getTarget();
      const wp = roadWaypoint(car.x, car.y, target.x, target.y);
      const want = Math.atan2(wp.y - car.y, wp.x - car.x);
      const diff = angleDiff(want, car.angle);
      ctl.steer = clamp(diff * 2.4, -1, 1);
      ctl.aimAngle = car.angle;
      // Ease off at city speed, and brake into sharp turns.
      ctl.throttle = car.speed > 360 ? 0 : 1;
      if (Math.abs(diff) > 0.7 && Math.abs(car.speed) > 200) ctl.throttle = -0.3;
      if (Math.abs(diff) > 1.1 && Math.abs(car.speed) > 120) ctl.throttle = -0.6;
      // Slow down approaching a waypoint: the route turns there, and a
      // 90-degree turn at full speed overshoots into the building corner.
      const distToWp = Math.hypot(wp.x - car.x, wp.y - car.y);
      if (distToWp < 150) ctl.throttle = Math.min(ctl.throttle, car.speed > 180 ? -0.4 : 0.4);
      // Brake for a car ahead in the same lane.
      const hx = Math.cos(car.angle);
      const hy = Math.sin(car.angle);
      for (const other of world.cars) {
        if (other === car || other.dead) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const along = dx * hx + dy * hy;
        const across = Math.abs(-dx * hy + dy * hx);
        if (along > 0 && along < 95 && across < 30) {
          ctl.throttle = -0.5;
          break;
        }
      }
      // Stuck detection: barely moved for a while, so back up and retry.
      // No speed condition: a car grinding against a wall oscillates
      // between stopped and fast, and police nudges move it a few px.
      checkTimer -= dt;
      if (checkTimer <= 0) {
        checkTimer = 1.2;
        const moved = Math.hypot(car.x - lastX, car.y - lastY);
        lastX = car.x;
        lastY = car.y;
        if (moved < 25) stuckTimer += 1.2;
        else stuckTimer = 0;
        if (stuckTimer > 1.2) {
          reverseTimer = 1.5;
          stuckTimer = 0;
        }
      }
      if (reverseTimer > 0) {
        reverseTimer -= dt;
        ctl.throttle = -0.9;
        ctl.steer = -ctl.steer;
      }
      return ctl;
    },
  };
}

function createWalkDriver(world, getTarget) {
  return {
    control() {
      const ctl = idleCtl();
      const p = world.player;
      const target = getTarget();
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 24) {
        ctl.moveX = dx / d;
        ctl.moveY = dy / d;
        ctl.running = true;
        ctl.aimAngle = Math.atan2(dy, dx);
      } else {
        ctl.aimAngle = p.angle;
      }
      return ctl;
    },
  };
}

function createCombatDriver(world) {
  return {
    control() {
      const ctl = idleCtl();
      const p = world.player;
      // Aim at the nearest rival and fire.
      let best = null;
      let bestD = Infinity;
      for (const r of world.rivals) {
        const d = Math.hypot(r.x - p.x, r.y - p.y);
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best) {
        ctl.aimAngle = Math.atan2(best.y - p.y, best.x - p.x);
        ctl.shooting = bestD < 430;
        // Strafe to keep some distance and stay a moving target.
        const strafe = Math.sin(world.time * 0.9) > 0 ? 1 : -1;
        const px = -Math.sin(ctl.aimAngle) * strafe;
        const py = Math.cos(ctl.aimAngle) * strafe;
        const approach = bestD > 320 ? 0.7 : bestD < 180 ? -0.7 : 0;
        ctl.moveX = px + Math.cos(ctl.aimAngle) * approach;
        ctl.moveY = py + Math.sin(ctl.aimAngle) * approach;
        const len = Math.hypot(ctl.moveX, ctl.moveY) || 1;
        ctl.moveX /= len;
        ctl.moveY /= len;
      }
      return ctl;
    },
  };
}

/** Put the player in the nearest car to a point (for driving scenes). */
function putPlayerInCar(world, x, y) {
  const car = nearestCar(world, x, y, 900);
  if (!car) return false;
  const p = world.player;
  p.x = car.x;
  p.y = car.y;
  p.inCar = car;
  car.driver = 'player';
  car.speed = 0;
  return true;
}

const SCENES = {
  // Cover: mid-mission drive through downtown toward the harbor pickup.
  cover: {
    seconds: 13,
    setup(world, police, missions) {
      startMissionAt(world, missions, police, 1);
      putPlayerInCar(world, 1480, 1240);
    },
    driver(world) {
      return createRoadDriver(world, () => PLACES.harborPickup);
    },
  },
  // Chase: three stars, police cars in pursuit through the city.
  chase: {
    seconds: 11,
    setup(world, police, missions) {
      startMissionAt(world, missions, police, 2);
      putPlayerInCar(world, 1900, 900);
    },
    driver(world) {
      let target = { x: 640, y: 1920 };
      let timer = 0;
      const road = createRoadDriver(world, () => target);
      return {
        control(dt) {
          timer -= dt;
          const p = world.player;
          if (timer <= 0 || Math.hypot(p.x - target.x, p.y - target.y) < 160) {
            timer = 8;
            target = {
              x: AVENUES[Math.floor(world.random() * AVENUES.length)],
              y: STREETS[Math.floor(world.random() * STREETS.length)],
            };
          }
          return road.control(dt);
        },
      };
    },
  },
  // On foot: a stroll across Plaza del Sol with pedestrians around.
  foot: {
    seconds: 9,
    setup(world, police, missions) {
      const p = world.player;
      p.x = PLACES.plaza.x - 120;
      p.y = PLACES.plaza.y + 60;
    },
    driver(world) {
      return createWalkDriver(world, () => ({ x: PLACES.plaza.x + 60, y: PLACES.plaza.y - 40 }));
    },
  },
  // Mission: the harbor shootout — rivals closing in, gunfire, loot nearby.
  mission: {
    seconds: 6,
    setup(world, police, missions) {
      startMissionAt(world, missions, police, 3);
      // Jump straight to the shootout step.
      missions.step = 1;
      missions.stepEntered = false;
      const p = world.player;
      p.x = 2920;
      p.y = 1800;
      p.ammo = 120;
    },
    driver(world) {
      return createCombatDriver(world);
    },
  },
};

/**
 * Build a fresh world for the named scene, play it forward with the
 * autopilot, and return the live state plus the driver that keeps it going.
 */
export function stageShot(name, seed) {
  const scene = SCENES[name] || SCENES.cover;
  const random = createRandom(seed);
  const city = buildCity(random);
  const world = createEntities(city, random);
  const police = createPolice();
  const missions = createMissions();
  scene.setup(world, police, missions);
  const driver = scene.driver(world);
  const steps = Math.floor(scene.seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const ctl = driver.control(STEP);
    stepEntities(world, STEP, ctl);
    stepPolice(world, police, STEP);
    stepMissions(world, missions, police, STEP);
    world.events.length = 0;
  }
  return { world, police, missions, driver, scene: name };
}
