// SOLMARA — Streets of the Sun. Tuning, palette and world constants.
export const GAME_TITLE = 'SOLMARA';
export const GAME_SUBTITLE = 'Streets of the Sun';

// World size in pixels. The city is a road grid with a beach on the south
// edge and the sea along the east edge.
export const WORLD = { width: 3400, height: 2600 };

// Road centrelines. Avenues run north-south, streets east-west.
export const AVENUES = [220, 640, 1060, 1480, 1900, 2320, 2740, 3060];
export const STREETS = [220, 560, 900, 1240, 1580, 1920, 2260];
export const ROAD_WIDTH = 92;
export const SIDEWALK = 16;

// Districts, each with its own building style and palette.
export const DISTRICTS = [
  { name: 'Downtown', x0: 1060, y0: 560, x1: 2320, y1: 1580, tall: true },
  { name: 'Old Town', x0: 0, y0: 0, x1: 1060, y1: 1240, tall: false },
  { name: 'Uptown', x0: 1060, y0: 0, x1: 3400, y1: 560, tall: false },
  { name: 'Harbor', x0: 2740, y0: 1240, x1: 3400, y1: 2260, tall: false },
  { name: 'Beachfront', x0: 0, y0: 1920, x1: 3400, y1: 2600, tall: false },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmara';
}

// Sun-soaked palette.
export const PALETTE = {
  grass: '#7fae5a',
  park: '#6da34e',
  sand: '#ecd9a0',
  water: '#3f8fb5',
  waterDeep: '#2f7396',
  road: '#3a3f47',
  roadLine: '#e8d44d',
  sidewalk: '#b9b3a4',
  curb: '#8f897c',
  buildingRoof: ['#c96f4a', '#d9a05b', '#7d9bb5', '#b56576', '#e0c184', '#6a8f7b', '#a8a29e'],
  buildingEdge: '#00000033',
  plaza: '#c9bfa8',
  dock: '#8a6f4d',
};

// Player tuning.
export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 265,
  radius: 13,
  maxHealth: 100,
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
  punchDamage: 18,
  punchRange: 42,
  startAmmo: 36,
  maxAmmo: 120,
};

// Car tuning (arcade).
export const CAR = {
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 160,
  steerRate: 2.6,
  grip: 6.5,
  drag: 0.55,
  radius: 20,
  maxHealth: 100,
  colors: ['#c94f3d', '#3d7ac9', '#e8c33c', '#7ab648', '#e8e8e8', '#2b2f36', '#c95fa8', '#3db8a6', '#e07b39', '#8a5fc9'],
};

// Wanted system.
export const WANTED = {
  maxStars: 5,
  decayDelay: 9, // seconds unseen before a star drops
  decayEvery: 7,
  resprayCost: 150,
  bustDistance: 26,
  bustTime: 1.4,
};

export const MONEY = {
  startCash: 120,
  missionRewards: [400, 650, 900, 1400, 2500],
  resprayCost: 150,
  ammoCost: 60,
  healthCost: 80,
};

// Traffic and crowd density.
export const TRAFFIC_CARS = 15;
export const PARKED_CARS = 16;
export const PEDESTRIANS = 20;
export const MAX_POLICE_CARS = 5;

// Save key.
export const SAVE_KEY = 'solmara-save-v1';
