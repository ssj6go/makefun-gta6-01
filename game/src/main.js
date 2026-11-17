// SOLMARA boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title, play, pause, help, wasted, busted, won.
//
// ?seed=N fixes the city's layout. ?shot=cover|chase|foot|mission (with
// &seed=N) stages that scene instead of running the menu, paints it and
// sets window.__shotReady for a screenshot.
import { AVENUES, MONEY, STREETS, WORLD } from './config.js';
import { buildCity, PLACES } from './city.js';
import { createRandom } from './random.js';
import {
  createEntities, EVENT_CAR_DEAD, EVENT_CAR_STOLEN, EVENT_CRASH, EVENT_EXPLOSION,
  EVENT_PED_HIT, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, nearestCar, scarePeds,
  stepEntities,
} from './entities.js';
import {
  addWanted, clearWanted, createPolice, EVENT_BUSTED, EVENT_WANTED_DOWN,
  EVENT_WANTED_UP, sirensAudible, stepPolice,
} from './police.js';
import {
  createMissions, currentMission, EVENT_GAME_WON, EVENT_MISSION_FAIL,
  EVENT_MISSION_PASS, EVENT_MISSION_START, failMission, missionObjective,
  retryMission, stepMissions,
} from './missions.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SHOP, createInput } from './input.js';
import { createRenderer } from './render.js';
import { applySave, clearSave, hasSave, loadSave, nearSafehouse, saveGame } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

let random = createRandom(seed);
let city = buildCity(random);
let world = createEntities(city, random);
let police = createPolice();
let missions = createMissions();
const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas);

let screen = 'title';
let menuIndex = 0;
let helpReturn = 'title';
let clockMin = 16 * 60 + 40;
let messages = [];
let camera = { x: world.player.x, y: world.player.y };
let muted = false;
let prompt = '';
let lastShotWanted = 0;
let prevMoveY = 0;

function announce(message) {
  status.textContent = message;
}

function say(text, color, big, seconds) {
  messages.push({ text, color: color || '#fff', big: !!big, t: seconds || 2.6 });
}

function freshWorld() {
  random = createRandom(seed);
  city = buildCity(random);
  world = createEntities(city, random);
  police = createPolice();
  missions = createMissions();
  camera = { x: world.player.x, y: world.player.y };
  messages = [];
  clockMin = 16 * 60 + 40;
}

function startGame(useSave) {
  freshWorld();
  if (useSave) {
    const data = loadSave();
    if (data) applySave(world, missions, police, data);
  }
  screen = 'play';
  audio.init();
  announce('Playing Solmara. Follow the yellow marker.');
}

function titleMenuItems() {
  return hasSave() ? ['New Game', 'Continue', 'How to play'] : ['New Game', 'How to play'];
}

function handleTitleKeys() {
  const mv = input.moveVector();
  if (mv.y < 0 && prevMoveY >= 0) menuIndex = Math.max(0, menuIndex - 1);
  if (mv.y > 0 && prevMoveY <= 0) {
    menuIndex = Math.min(titleMenuItems().length - 1, menuIndex + 1);
  }
  prevMoveY = mv.y;
  const actions = input.takeActions();
  if (actions & ACTION_CONFIRM) {
    const item = titleMenuItems()[menuIndex];
    audio.init();
    audio.click();
    if (item === 'New Game') {
      clearSave();
      startGame(false);
    } else if (item === 'Continue') {
      startGame(true);
    } else {
      helpReturn = 'title';
      screen = 'help';
    }
  }
}

function handlePauseKeys() {
  const items = ['Resume', 'Save game', 'How to play', 'Quit to title'];
  const mv = input.moveVector();
  if (mv.y < 0 && prevMoveY >= 0) menuIndex = Math.max(0, menuIndex - 1);
  if (mv.y > 0 && prevMoveY <= 0) menuIndex = Math.min(items.length - 1, menuIndex + 1);
  prevMoveY = mv.y;
  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    screen = 'play';
    return;
  }
  if (actions & ACTION_CONFIRM) {
    const item = items[menuIndex];
    audio.click();
    if (item === 'Resume') screen = 'play';
    else if (item === 'Save game') {
      saveGame(world, missions, police);
      say('Game saved', '#51cf66', false, 2);
      screen = 'play';
    } else if (item === 'How to play') {
      helpReturn = 'pause';
      screen = 'help';
    } else {
      screen = 'title';
      menuIndex = 0;
    }
  }
}

function nearestShop(player) {
  if (player.inCar) return null;
  const spots = [
    { place: PLACES.respray, kind: 'respray' },
    { place: PLACES.ammo, kind: 'ammo' },
    { place: PLACES.clinic, kind: 'clinic' },
    { place: PLACES.safehouse, kind: 'safehouse' },
  ];
  let best = null;
  for (const s of spots) {
    const d = Math.hypot(player.x - s.place.x, player.y - s.place.y);
    if (d < 64 && (!best || d < best.d)) best = { kind: s.kind, d };
  }
  return best;
}

function useShop(kind) {
  const p = world.player;
  if (kind === 'respray') {
    if (police.stars === 0) {
      say('No heat to clear', '#ccc', false, 1.6);
      return;
    }
    if (p.cash < MONEY.resprayCost) {
      say(`Respray costs $${MONEY.resprayCost}`, '#ff6b6b', false, 2);
      return;
    }
    p.cash -= MONEY.resprayCost;
    clearWanted(world, police);
    say('Resprayed — the heat is off', '#51cf66', false, 2.4);
    audio.pickup();
  } else if (kind === 'ammo') {
    if (p.cash < MONEY.ammoCost) {
      say(`Ammo costs $${MONEY.ammoCost}`, '#ff6b6b', false, 2);
      return;
    }
    p.cash -= MONEY.ammoCost;
    p.ammo = Math.min(120, p.ammo + 48);
    say('Ammo restocked +48', '#51cf66', false, 2);
    audio.pickup();
  } else if (kind === 'clinic') {
    if (p.cash < MONEY.healthCost) {
      say(`Treatment costs $${MONEY.healthCost}`, '#ff6b6b', false, 2);
      return;
    }
    p.cash -= MONEY.healthCost;
    p.health = 100;
    say('Patched up — full health', '#51cf66', false, 2);
    audio.pickup();
  } else if (kind === 'safehouse') {
    saveGame(world, missions, police);
    say('Game saved at the Safehouse', '#51cf66', false, 2.4);
    audio.pickup();
  }
}

function updatePrompt() {
  const p = world.player;
  if (screen !== 'play') {
    prompt = '';
    return;
  }
  const shop = nearestShop(p);
  const car = p.inCar ? null : nearestCar(world, p.x, p.y, 52);
  // E is always the car; Q is always the shop. Both prompts can show.
  const parts = [];
  if (car) parts.push('Press E to enter the car');
  if (shop) {
    if (shop.kind === 'respray') parts.push(`Q — Respray $${MONEY.resprayCost} (clears wanted level)`);
    else if (shop.kind === 'ammo') parts.push(`Q — Buy ammo $${MONEY.ammoCost}`);
    else if (shop.kind === 'clinic') parts.push(`Q — Treatment $${MONEY.healthCost}`);
    else parts.push('Q — Save game');
  }
  if (p.inCar) parts.push('E exit car  •  H horn');
  prompt = parts.join('   •   ');
}

function handleEvents() {
  const p = world.player;
  for (const event of world.events) {
    if (event === EVENT_SHOT) {
      audio.shot();
      scarePeds(world, p.x, p.y, 300);
    } else if (event === EVENT_CRASH) {
      audio.crash(0.6);
    } else if (event === EVENT_PED_HIT) {
      addWanted(world, police, 1);
      say('Pedestrian down!', '#ff6b6b', false, 2);
    } else if (event === EVENT_CAR_STOLEN) {
      addWanted(world, police, 1);
      say('Car stolen — the heat is on', '#ffd640', false, 2.4);
    } else if (event === EVENT_PICKUP) {
      audio.pickup();
    } else if (event === EVENT_CAR_DEAD) {
      audio.crash(1);
    } else if (event === EVENT_EXPLOSION) {
      audio.crash(1);
      scarePeds(world, p.x, p.y, 500);
    } else if (event === EVENT_PUNCH) {
      audio.punch();
    } else if (event === EVENT_BUSTED) {
      audio.busted();
      failMission(world, missions);
      screen = 'busted';
      announce('Busted by the Solmara police.');
    } else if (event === EVENT_WANTED_UP) {
      say(`WANTED LEVEL ${police.stars}`, '#ffd640', true, 2);
    } else if (event === EVENT_WANTED_DOWN) {
      say('The heat is dying down…', '#ccc', false, 2);
    } else if (event === EVENT_MISSION_PASS) {
      const m = currentMission(missions);
      audio.missionPass();
      say(`MISSION PASSED  +$${m ? m.reward : 0}`, '#51cf66', true, 3.2);
      saveGame(world, missions, police);
    } else if (event === EVENT_MISSION_FAIL) {
      audio.missionFail();
    } else if (event === EVENT_MISSION_START) {
      audio.phone();
    } else if (event === EVENT_GAME_WON) {
      saveGame(world, missions, police);
      screen = 'won';
      announce('All five jobs done. Solmara is yours.');
    }
  }
  world.events.length = 0;
}

function buildControl(actions) {
  const p = world.player;
  const mv = input.moveVector();
  const mouse = input.mouse();
  const size = renderer.viewSize();
  const aimX = mouse.x + camera.x - size.w / 2;
  const aimY = mouse.y + camera.y - size.h / 2;
  const ctl = {
    moveX: mv.x,
    moveY: mv.y,
    running: input.running(),
    aimAngle: p.inCar ? p.angle : Math.atan2(aimY - p.y, aimX - p.x),
    shooting: mouse.down,
    punchPressed: !!(actions & ACTION_PUNCH),
    interactPressed: !!(actions & ACTION_INTERACT),
    throttle: input.throttle(),
    steer: input.steer(),
  };
  // Q uses a nearby shop; E is only ever the car, so a parked car can
  // never steal the shop press (or the other way round).
  if (actions & ACTION_SHOP) {
    const shop = nearestShop(p);
    if (shop) useShop(shop.kind);
  }
  return ctl;
}

function stepGame(dt) {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    muted = !muted;
    audio.setMuted(muted);
    say(muted ? 'Sound off' : 'Sound on', '#ccc', false, 1.4);
  }
  if (actions & ACTION_PAUSE) {
    screen = 'pause';
    menuIndex = 0;
    return;
  }
  const ammoBefore = world.player.ammo;
  const ctl = buildControl(actions);
  stepEntities(world, dt, ctl);
  stepPolice(world, police, dt);
  stepMissions(world, missions, police, dt);
  // Firing in sight of the law raises the heat (at most once per 5 s).
  if (world.player.ammo < ammoBefore && world.time - lastShotWanted > 5) {
    const nearLaw = world.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - world.player.x, c.y - world.player.y) < 450)
      || world.cops.some((c) => Math.hypot(c.x - world.player.x, c.y - world.player.y) < 350);
    if (nearLaw) {
      lastShotWanted = world.time;
      addWanted(world, police, 1);
    }
  }
  handleEvents();
  if (world.player.dead && screen === 'play') {
    failMission(world, missions);
    audio.missionFail();
    screen = 'wasted';
    announce('Wasted.');
  }
  clockMin += dt * 0.5;
  // Camera follows the player, leaning into the car's motion.
  const p = world.player;
  const size = renderer.viewSize();
  let tx = p.x;
  let ty = p.y;
  if (p.inCar) {
    tx += p.inCar.vx * 0.35;
    ty += p.inCar.vy * 0.35;
  }
  const ease = 1 - Math.exp(-5 * dt);
  camera.x += (tx - camera.x) * ease;
  camera.y += (ty - camera.y) * ease;
  camera.x = Math.max(size.w / 2, Math.min(WORLD.width - size.w / 2, camera.x));
  camera.y = Math.max(size.h / 2, Math.min(WORLD.height - size.h / 2, camera.y));
  // Engine and siren beds.
  audio.engine(p.inCar ? Math.min(1, Math.abs(p.inCar.speed) / 500) : 0);
  audio.siren(sirensAudible(world), dt);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    messages[i].t -= dt;
    if (messages[i].t <= 0) messages.splice(i, 1);
  }
  updatePrompt();
}

function stepTitle(dt) {
  // The backdrop city stays alive behind the title.
  const ctl = {
    moveX: 0, moveY: 0, running: false, aimAngle: 0, shooting: false,
    punchPressed: false, interactPressed: false, throttle: 0, steer: 0,
  };
  stepEntities(world, dt, ctl);
  world.events.length = 0;
}

function frame(now, lastRef, accRef) {
  requestAnimationFrame((t) => frame(t, lastRef, accRef));
  accRef.v += Math.min((now - lastRef.v) / 1000, MAX_FRAME);
  lastRef.v = now;
  if (screen === 'title') {
    handleTitleKeys();
    while (accRef.v >= STEP) {
      stepTitle(STEP);
      accRef.v -= STEP;
    }
  } else if (screen === 'play') {
    while (accRef.v >= STEP && screen === 'play') {
      stepGame(STEP);
      accRef.v -= STEP;
    }
    if (screen !== 'play') accRef.v = 0;
  } else if (screen === 'pause') {
    handlePauseKeys();
    accRef.v = 0;
  } else if (screen === 'help') {
    const actions = input.takeActions();
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) screen = helpReturn;
    accRef.v = 0;
  } else if (screen === 'wasted' || screen === 'busted') {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      retryMission(world, missions, police);
      screen = 'play';
      announce('Mission restarted.');
    } else if (actions & ACTION_PAUSE) {
      screen = 'title';
      menuIndex = 0;
    }
    accRef.v = 0;
  } else if (screen === 'won') {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) screen = 'play';
    else if (actions & ACTION_PAUSE) {
      screen = 'title';
      menuIndex = 0;
    }
    accRef.v = 0;
  }
  renderer.draw({
    world, police, missions, screen, camera, messages,
    menuIndex, muted, clockMin, prompt, hasSave: hasSave(),
  });
}

function runGame() {
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());
  // A small read-only probe for play-testing: position, vehicle, wanted
  // level and mission progress. It changes nothing about the game.
  window.__solmara = () => {
    const p = world.player;
    const obj = missionObjective(missions);
    let car = null;
    let carD = Infinity;
    for (const c of world.cars) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < carD) { carD = d; car = c; }
    }
    // Is another car blocking the road ahead of the player's car?
    let carAhead = false;
    if (p.inCar) {
      const hx = Math.cos(p.angle);
      const hy = Math.sin(p.angle);
      for (const other of world.cars) {
        if (other === p.inCar || other.dead) continue;
        const dx = other.x - p.x;
        const dy = other.y - p.y;
        const along = dx * hx + dy * hy;
        const across = Math.abs(-dx * hy + dy * hx);
        if (along > 0 && along < 95 && across < 30) { carAhead = true; break; }
      }
    }
    // Cars stranded off the road grid (traffic should never be here).
    const offRoad = [];
    for (const c of world.cars) {
      if (c.dead) continue;
      const onAve = AVENUES.some((ax) => Math.abs(c.x - ax) <= 46);
      const onStreet = STREETS.some((sy) => Math.abs(c.y - sy) <= 46);
      if (!onAve && !onStreet) offRoad.push({ x: Math.round(c.x), y: Math.round(c.y), driver: c.driver });
    }
    return {
      x: Math.round(p.x), y: Math.round(p.y), angle: p.angle,
      speed: p.inCar ? Math.round(p.inCar.speed) : 0,
      inCar: !!p.inCar,
      carHealth: p.inCar ? Math.round(p.inCar.health) : null,
      health: Math.round(p.health), ammo: p.ammo, cash: p.cash,
      stars: police.stars, mission: missions.index, step: missions.step,
      phase: missions.phase, screen,
      cars: world.cars.length, peds: world.peds.length,
      rivals: world.rivals.length, cops: world.cops.length,
      nearestCar: car ? { d: Math.round(carD), dx: Math.round(car.x - p.x), dy: Math.round(car.y - p.y) } : null,
      carAhead, offRoad,
      target: obj.target ? { x: obj.target.x, y: obj.target.y } : null,
    };
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      menuIndex = 0;
      announce('Paused.');
    }
  });
  announce('Solmara, streets of the sun. Press Space or click to start.');
  const lastRef = { v: performance.now() };
  const accRef = { v: 0 };
  requestAnimationFrame((t) => frame(t, lastRef, accRef));
}

function runShot(name) {
  const staged = stageShot(name, seed);
  world = staged.world;
  police = staged.police;
  missions = staged.missions;
  const driver = staged.driver;
  screen = 'play';
  camera = { x: world.player.x, y: world.player.y };
  renderer.resize();
  const lastRef = { v: performance.now() };
  const accRef = { v: 0 };
  let painted = 0;
  function shotFrame(now) {
    requestAnimationFrame(shotFrame);
    accRef.v += Math.min((now - lastRef.v) / 1000, MAX_FRAME);
    lastRef.v = now;
    while (accRef.v >= STEP) {
      const ctl = driver.control(STEP);
      stepEntities(world, STEP, ctl);
      stepPolice(world, police, STEP);
      stepMissions(world, missions, police, STEP);
      world.events.length = 0;
      accRef.v -= STEP;
    }
    const p = world.player;
    const size = renderer.viewSize();
    camera.x = Math.max(size.w / 2, Math.min(WORLD.width - size.w / 2, p.x));
    camera.y = Math.max(size.h / 2, Math.min(WORLD.height - size.h / 2, p.y));
    renderer.draw({
      world, police, missions, screen, camera, messages: [],
      menuIndex: 0, muted: true, clockMin: 16 * 60 + 40, prompt: '', hasSave: false,
    });
    painted += 1;
    if (painted >= 2) window.__shotReady = true;
  }
  requestAnimationFrame(shotFrame);
}

if (shot) runShot(shot);
else runGame();
