// The story: five missions from the fixer Marisol Vega, from stealing a
// first car to the big score at Solmara Mutual Bank. Each mission is a
// chain of steps — reach a place, steal a car, survive the heat, clear a
// crew, hold a position — with a phone-call brief, a cash reward and a
// retry when the player is wasted or busted.
import { MONEY } from './config.js';
import { PLACES } from './city.js';
import { spawnRival } from './entities.js';
import { addWanted, clearWanted } from './police.js';

export const EVENT_MISSION_PASS = 'missionPass';
export const EVENT_MISSION_FAIL = 'missionFail';
export const EVENT_MISSION_START = 'missionStart';
export const EVENT_GAME_WON = 'gameWon';

export const MISSIONS = [
  {
    title: 'Wheels Up',
    brief: 'Rook. Marisol here. I need wheels — any car, fast. Bring it to my garage and we will talk business.',
    reward: MONEY.missionRewards[0],
    steps: [
      { type: 'stealCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'reach', text: "Drive it to Vega's Garage", target: PLACES.garage, radius: 80, needsCar: true },
    ],
  },
  {
    title: 'The Pickup',
    brief: 'A package is waiting at Harbor Pier 4. Collect it and bring it to the Old Town drop. The harbor crew will not wave you through.',
    reward: MONEY.missionRewards[1],
    steps: [
      { type: 'reach', text: 'Pick up the package at Harbor Pier 4', target: PLACES.harborPickup, radius: 60 },
      { type: 'reach', text: 'Deliver the package to the Old Town drop', target: PLACES.oldTownDrop, radius: 60, wanted: 2 },
    ],
  },
  {
    title: 'Lose the Tail',
    brief: 'The heat is on you, Rook. Three stars and climbing. Get out of sight and stay there until it blows over.',
    reward: MONEY.missionRewards[2],
    steps: [
      { type: 'survive', text: 'Lose the cops — stay out of sight until the heat dies down', wanted: 3 },
    ],
  },
  {
    title: 'Harbor Lights',
    brief: 'The Dusk Crew moved into my warehouse. Clear them out, take the loot, and bring it to the safehouse. Watch your back.',
    reward: MONEY.missionRewards[3],
    steps: [
      { type: 'reach', text: 'Reach the Harbor Warehouse', target: PLACES.harborLoot, radius: 90 },
      { type: 'eliminate', text: 'Clear the rival crew at the warehouse', spawn: 4, at: PLACES.harborLoot },
      { type: 'reach', text: 'Take the loot to the Safehouse', target: PLACES.safehouse, radius: 70 },
    ],
  },
  {
    title: 'The Big Score',
    brief: 'This is it. Solmara Mutual Bank, midday. Hold the lobby while I crack the vault, then run for the safehouse. Do not get caught.',
    reward: MONEY.missionRewards[4],
    steps: [
      { type: 'reach', text: 'Get to Solmara Mutual Bank', target: PLACES.bank, radius: 80 },
      { type: 'hold', text: 'Hold the bank while the vault opens', target: PLACES.bank, radius: 110, duration: 12, wanted: 4 },
      { type: 'reach', text: 'Escape to the Safehouse with the score', target: PLACES.safehouse, radius: 70 },
    ],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    phase: 'brief', // brief | active | passed | failed | done
    briefTimer: 6,
    passedTimer: 0,
    holdTime: 0,
    stepEntered: false,
    allDone: false,
  };
}

export function currentMission(missions) {
  return MISSIONS[missions.index] || null;
}

export function currentStep(missions) {
  const m = currentMission(missions);
  return m ? m.steps[missions.step] : null;
}

/** The objective line and map target the HUD shows. */
export function missionObjective(missions) {
  const m = currentMission(missions);
  if (!m || missions.phase === 'done') return { text: 'Free roam — Solmara is yours. Earn cash, dodge the law.', target: null };
  if (missions.phase === 'brief') return { text: 'Incoming call from Marisol Vega…', target: null };
  if (missions.phase === 'passed') return { text: 'Mission passed!', target: null };
  if (missions.phase === 'failed') return { text: 'Mission failed — press Enter to retry', target: null };
  const s = currentStep(missions);
  if (!s) return { text: '', target: null };
  return { text: s.text, target: s.target || null };
}

function enterStep(world, missions, police) {
  const s = currentStep(missions);
  if (!s) return;
  missions.stepEntered = true;
  missions.holdTime = 0;
  if (s.wanted) addWanted(world, police, s.wanted);
  if (s.type === 'eliminate' && s.spawn) {
    for (let i = 0; i < s.spawn; i += 1) {
      const a = (i / s.spawn) * Math.PI * 2;
      spawnRival(world, s.at.x + Math.cos(a) * 90, s.at.y + Math.sin(a) * 90);
    }
  }
}

function advanceStep(world, missions, police) {
  const m = currentMission(missions);
  missions.step += 1;
  missions.stepEntered = false;
  if (missions.step >= m.steps.length) {
    // Mission passed.
    world.player.cash += m.reward;
    missions.phase = 'passed';
    missions.passedTimer = 4.5;
    world.events.push(EVENT_MISSION_PASS);
    return;
  }
  enterStep(world, missions, police);
}

export function startMissionAt(world, missions, police, index) {
  missions.index = index;
  missions.step = 0;
  missions.phase = 'active';
  missions.stepEntered = false;
  missions.briefTimer = 0;
  enterStep(world, missions, police);
}

export function failMission(world, missions) {
  if (missions.phase !== 'active' && missions.phase !== 'brief') return;
  missions.phase = 'failed';
  world.events.push(EVENT_MISSION_FAIL);
}

export function retryMission(world, missions, police) {
  const p = world.player;
  p.health = 100;
  p.dead = false;
  p.inCar = null;
  p.x = PLACES.safehouse.x;
  p.y = PLACES.safehouse.y;
  clearWanted(world, police);
  world.rivals = [];
  world.bullets = [];
  missions.step = 0;
  missions.phase = 'brief';
  missions.briefTimer = 5;
  missions.stepEntered = false;
  world.events.push(EVENT_MISSION_START);
}

export function stepMissions(world, missions, police, dt) {
  if (missions.phase === 'brief') {
    missions.briefTimer -= dt;
    if (missions.briefTimer <= 0) {
      missions.phase = 'active';
      enterStep(world, missions, police);
    }
    return;
  }
  if (missions.phase === 'passed') {
    missions.passedTimer -= dt;
    if (missions.passedTimer <= 0) {
      missions.index += 1;
      if (missions.index >= MISSIONS.length) {
        missions.phase = 'done';
        missions.allDone = true;
        world.events.push(EVENT_GAME_WON);
        return;
      }
      missions.step = 0;
      missions.phase = 'brief';
      missions.briefTimer = 6;
      missions.stepEntered = false;
      world.events.push(EVENT_MISSION_START);
    }
    return;
  }
  if (missions.phase !== 'active') return;
  if (!missions.stepEntered) enterStep(world, missions, police);

  const s = currentStep(missions);
  const p = world.player;
  if (!s || p.dead) return;

  if (s.type === 'stealCar') {
    if (p.inCar) advanceStep(world, missions, police);
  } else if (s.type === 'reach') {
    const d = Math.hypot(p.x - s.target.x, p.y - s.target.y);
    if (d < s.radius && (!s.needsCar || p.inCar)) advanceStep(world, missions, police);
  } else if (s.type === 'survive') {
    if (police.stars === 0) advanceStep(world, missions, police);
  } else if (s.type === 'eliminate') {
    if (world.rivals.length === 0) advanceStep(world, missions, police);
  } else if (s.type === 'hold') {
    const d = Math.hypot(p.x - s.target.x, p.y - s.target.y);
    if (d < s.radius) {
      missions.holdTime += dt;
      if (missions.holdTime >= s.duration) advanceStep(world, missions, police);
    } else {
      missions.holdTime = Math.max(0, missions.holdTime - dt * 2);
    }
  }
}
