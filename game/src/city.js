// Solmara's layout: a road grid with blocks of buildings, a park, a plaza,
// a beach, a harbor with docks, and the shops and mission spots. Everything
// is generated from the seeded random, so the same seed builds the same city.
import { AVENUES, DISTRICTS, PALETTE, ROAD_WIDTH, SIDEWALK, WORLD } from './config.js';
import { pick, range, rangeInt } from './random.js';
import { STREETS } from './config.js';

export const WATER_EAST = 3260;
export const WATER_SOUTH = 2520;
export const SAND_Y = 2340;

// Fixed places the missions and shops use. All sit on roads.
export const PLACES = {
  safehouse: { x: 640, y: 220, name: "Rook's Safehouse" },
  garage: { x: 1900, y: 1920, name: "Vega's Garage" },
  harborPickup: { x: 3060, y: 1580, name: 'Harbor Pier 4' },
  oldTownDrop: { x: 640, y: 560, name: 'Old Town Drop' },
  harborLoot: { x: 3060, y: 1920, name: 'Harbor Warehouse' },
  bank: { x: 1480, y: 900, name: 'Solmara Mutual Bank' },
  respray: { x: 1060, y: 1240, name: "Vega's Respray" },
  ammo: { x: 2740, y: 1580, name: 'Harbor Arms' },
  clinic: { x: 1060, y: 1920, name: "Doc's Clinic" },
  plaza: { x: 1690, y: 1070, name: 'Plaza del Sol' },
  park: { x: 1690, y: 1410, name: 'Palmera Park' },
};

const PARK_BLOCK = { ax: 3, ay: 3 }; // avenues[3..4] x streets[3..4]
const PLAZA_BLOCK = { ax: 3, ay: 2 }; // avenues[3..4] x streets[2..3]

export function isRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
  const half = ROAD_WIDTH / 2;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= half) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= half) return true;
  return false;
}

export function isWater(x, y) {
  return x > WATER_EAST || y > WATER_SOUTH;
}

export function isSand(x, y) {
  return y >= SAND_Y && y <= WATER_SOUTH && x <= WATER_EAST;
}

export function nearestAvenue(x) {
  let best = AVENUES[0];
  for (const ax of AVENUES) if (Math.abs(ax - x) < Math.abs(best - x)) best = ax;
  return best;
}

export function nearestStreet(y) {
  let best = STREETS[0];
  for (const sy of STREETS) if (Math.abs(sy - y) < Math.abs(best - y)) best = sy;
  return best;
}

export function districtAtPoint(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

/**
 * The next road point for a car at (x, y) driving toward (tx, ty): stay on
 * the grid — along the current road to the target's nearest crossing, then
 * along that road. Used by police pursuit and the screenshot drivers.
 */
export function roadWaypoint(x, y, tx, ty) {
  const ax = nearestAvenue(x);
  const st = nearestStreet(y);
  const onAve = Math.abs(x - ax) < ROAD_WIDTH / 2;
  const onSt = Math.abs(y - st) < ROAD_WIDTH / 2;
  const tax = nearestAvenue(tx);
  const tst = nearestStreet(ty);
  if (onAve && ax === tax) return { x: ax, y: ty };
  if (onSt && st === tst) return { x: tx, y: st };
  if (onAve) return { x: ax, y: tst };
  if (onSt) return { x: tax, y: st };
  if (Math.abs(x - ax) < Math.abs(y - st)) return { x: ax, y };
  return { x, y: st };
}

function blockBounds(ax, ay) {
  const x0 = ax < 0 ? 40 : AVENUES[ax] + ROAD_WIDTH / 2 + SIDEWALK;
  const x1 = ax + 1 >= AVENUES.length ? WORLD.width - 40 : AVENUES[ax + 1] - ROAD_WIDTH / 2 - SIDEWALK;
  const y0 = ay < 0 ? 40 : STREETS[ay] + ROAD_WIDTH / 2 + SIDEWALK;
  const y1 = ay + 1 >= STREETS.length ? SAND_Y - 30 : STREETS[ay + 1] - ROAD_WIDTH / 2 - SIDEWALK;
  return { x0, y0, x1, y1 };
}

export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const docks = [];

  // Blocks: columns between avenues (including the edge strips), rows
  // between streets. Each block gets buildings unless it is the park, the
  // plaza, the beach strip or the harbor yards.
  for (let ax = -1; ax < AVENUES.length; ax += 1) {
    for (let ay = -1; ay < STREETS.length; ay += 1) {
      const b = blockBounds(ax, ay);
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      if (w < 60 || h < 60) continue;
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const district = districtAtPoint(cx, cy);

      // Park block: lawn, paths and trees, no buildings.
      if (ax === PARK_BLOCK.ax && ay === PARK_BLOCK.ay) {
        for (let i = 0; i < 26; i += 1) {
          trees.push({ x: range(random, b.x0 + 10, b.x1 - 10), y: range(random, b.y0 + 10, b.y1 - 10), r: range(random, 9, 14), palm: false });
        }
        continue;
      }
      // Plaza block: paving, a fountain and ring trees.
      if (ax === PLAZA_BLOCK.ax && ay === PLAZA_BLOCK.ay) {
        for (let i = 0; i < 14; i += 1) {
          const a = (i / 14) * Math.PI * 2;
          trees.push({ x: cx + Math.cos(a) * 120, y: cy + Math.sin(a) * 80, r: range(random, 9, 13), palm: false });
        }
        continue;
      }
      // Harbor yards: wide flat warehouses east of the last avenue.
      if (ax === AVENUES.length - 1 && ay >= 3 && ay <= 5) {
        buildings.push({
          x: b.x0 + 8, y: b.y0 + 8, w: w - 16, h: h - 16,
          color: pick(random, ['#9aa0a6', '#8a7f74', '#7d94a6']),
          stories: 1, district: district.name, warehouse: true,
        });
        continue;
      }
      // Beach strip: palms, no buildings.
      if (ay === STREETS.length - 1) {
        for (let i = 0; i < 8; i += 1) {
          trees.push({ x: range(random, b.x0 + 10, b.x1 - 10), y: range(random, b.y0 + 6, b.y1 - 6), r: range(random, 10, 14), palm: true });
        }
        continue;
      }
      // Ordinary block: split along the longer side into 1-3 buildings.
      const tall = district.tall;
      const split = w > h ? Math.max(1, Math.round(w / 190)) : Math.max(1, Math.round(h / 190));
      for (let i = 0; i < split; i += 1) {
        const gap = 14;
        let bx;
        let by;
        let bw;
        let bh;
        if (w > h) {
          bw = (w - gap * (split - 1)) / split;
          bh = h - range(random, 8, 26);
          bx = b.x0 + i * (bw + gap);
          by = b.y0 + (h - bh) / 2;
        } else {
          bh = (h - gap * (split - 1)) / split;
          bw = w - range(random, 8, 26);
          bx = b.x0 + (w - bw) / 2;
          by = b.y0 + i * (bh + gap);
        }
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          color: pick(random, PALETTE.buildingRoof),
          stories: tall ? rangeInt(random, 3, 6) : rangeInt(random, 1, 3),
          district: district.name, warehouse: false,
        });
      }
      // A few street trees around the block.
      const treeCount = rangeInt(random, 0, 3);
      for (let i = 0; i < treeCount; i += 1) {
        trees.push({ x: range(random, b.x0 - 20, b.x1 + 20), y: range(random, b.y0 - 20, b.y1 + 20), r: range(random, 8, 12), palm: false });
      }
    }
  }

  // Docks: wooden piers reaching into the eastern sea.
  for (let i = 0; i < 4; i += 1) {
    const y = 1330 + i * 210;
    docks.push({ x: 3120, y, w: 220, h: 34 });
  }

  // Lamps at every intersection corner.
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      lamps.push({ x: ax + ROAD_WIDTH / 2 + 8, y: sy + ROAD_WIDTH / 2 + 8 });
      lamps.push({ x: ax - ROAD_WIDTH / 2 - 8, y: sy - ROAD_WIDTH / 2 - 8 });
    }
  }

  // Parking spots along road edges for parked cars.
  const parkingSpots = [];
  for (let i = 0; i < 60; i += 1) {
    const vertical = random() < 0.5;
    if (vertical) {
      const ax = pick(random, AVENUES);
      const y = range(random, 120, WORLD.height - 320);
      const side = random() < 0.5 ? -1 : 1;
      parkingSpots.push({ x: ax + side * (ROAD_WIDTH / 2 - 16), y, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    } else {
      const sy = pick(random, STREETS);
      const x = range(random, 120, WORLD.width - 320);
      const side = random() < 0.5 ? -1 : 1;
      parkingSpots.push({ x, y: sy + side * (ROAD_WIDTH / 2 - 16), angle: side > 0 ? 0 : Math.PI });
    }
  }

  return { buildings, trees, lamps, docks, parkingSpots };
}

/** Push a circle out of every building it overlaps; returns corrected x/y. */
export function resolveBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 === 0) {
      // Centre inside the rect: push out along the smallest penetration.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
      continue;
    }
    const d = Math.sqrt(d2);
    x = cx + (dx / d) * r;
    y = cy + (dy / d) * r;
  }
  return { x, y };
}

/** Keep a circle inside the drivable land: out of the water, inside the map. */
export function resolveBounds(x, y, r) {
  x = Math.max(r, Math.min(WATER_EAST - r, x));
  y = Math.max(r, Math.min(WATER_SOUTH - r, y));
  return { x, y };
}

/** True when a circle overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
