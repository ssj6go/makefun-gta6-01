// Everything the player sees: the city, the cars, the people, the HUD with
// its minimap, and the title, pause and game-over screens. Canvas 2D,
// top-down, sun-soaked. No images are loaded — every sprite is drawn.
import { AVENUES, GAME_SUBTITLE, GAME_TITLE, PALETTE, PLAYER, ROAD_WIDTH, STREETS, WORLD, districtAt } from './config.js';
import { PLACES, SAND_Y, WATER_EAST, WATER_SOUTH } from './city.js';
import { currentMission, missionObjective } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 720;
  let minimapBase = null;

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildMinimapBase(city) {
    const c = document.createElement('canvas');
    c.width = 176;
    c.height = 132;
    const m = c.getContext('2d');
    const sx = 176 / WORLD.width;
    const sy = 132 / WORLD.height;
    m.fillStyle = PALETTE.grass;
    m.fillRect(0, 0, 176, 132);
    m.fillStyle = PALETTE.water;
    m.fillRect(WATER_EAST * sx, 0, 176 - WATER_EAST * sx, 132);
    m.fillRect(0, WATER_SOUTH * sy, 176, 132 - WATER_SOUTH * sy);
    m.fillStyle = PALETTE.sand;
    m.fillRect(0, SAND_Y * sy, WATER_EAST * sx, (WATER_SOUTH - SAND_Y) * sy);
    m.fillStyle = PALETTE.park;
    m.fillRect(1542 * sx, 1302 * sy, 296 * sx, 216 * sy);
    m.fillStyle = PALETTE.plaza;
    m.fillRect(1542 * sx, 962 * sy, 296 * sx, 216 * sy);
    m.strokeStyle = PALETTE.road;
    m.lineWidth = 4;
    for (const ax of AVENUES) {
      m.beginPath();
      m.moveTo(ax * sx, 0);
      m.lineTo(ax * sx, 132);
      m.stroke();
    }
    for (const sy2 of STREETS) {
      m.beginPath();
      m.moveTo(0, sy2 * sy);
      m.lineTo(176, sy2 * sy);
      m.stroke();
    }
    m.fillStyle = '#00000044';
    for (const b of city.buildings) {
      m.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    }
    minimapBase = c;
  }

  function drawGround(state) {
    const { world } = state;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Park and plaza.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(1542, 1302, 296, 216);
    ctx.fillStyle = PALETTE.plaza;
    ctx.fillRect(1542, 962, 296, 216);
    // Plaza fountain.
    ctx.strokeStyle = '#e8e4d8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(1690, 1070, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.water;
    ctx.beginPath();
    ctx.arc(1690, 1070, 34, 0, Math.PI * 2);
    ctx.fill();
    // Beach sand and the sea.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, SAND_Y, WATER_EAST, WATER_SOUTH - SAND_Y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(WATER_EAST, 0, WORLD.width - WATER_EAST, WORLD.height);
    ctx.fillRect(0, WATER_SOUTH, WORLD.width, WORLD.height - WATER_SOUTH);
    // Boardwalk along the beach.
    ctx.fillStyle = '#b08d5a';
    ctx.fillRect(0, SAND_Y - 14, WATER_EAST, 14);
    // Animated wave lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    const t = world.time;
    for (let i = 0; i < 8; i += 1) {
      const y = WATER_SOUTH + 14 + i * 10;
      ctx.beginPath();
      for (let x = 0; x <= WORLD.width; x += 60) {
        const yy = y + Math.sin(x * 0.01 + t * 1.4 + i) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 6; i += 1) {
      const x = WATER_EAST + 14 + i * 10;
      ctx.beginPath();
      for (let y = 0; y <= WORLD.height; y += 60) {
        const xx = x + Math.sin(y * 0.01 + t * 1.2 + i) * 3;
        if (y === 0) ctx.moveTo(xx, y);
        else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
  }

  function drawRoads() {
    // Sidewalks first (wider, lighter), then asphalt, then lane markings.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_WIDTH / 2 - 16, 0, ROAD_WIDTH + 32, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_WIDTH / 2 - 16, WORLD.width, ROAD_WIDTH + 32);
    ctx.fillStyle = PALETTE.road;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_WIDTH / 2, WORLD.width, ROAD_WIDTH);
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    for (const ax of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, WORLD.height);
      ctx.stroke();
    }
    for (const sy of STREETS) {
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(WORLD.width, sy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const ax of AVENUES) {
      for (const sy of STREETS) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(ax - ROAD_WIDTH / 2 + 8 + i * 16, sy - ROAD_WIDTH / 2 - 4, 8, 8);
          ctx.fillRect(ax - ROAD_WIDTH / 2 + 8 + i * 16, sy + ROAD_WIDTH / 2 - 4, 8, 8);
        }
      }
    }
  }

  function drawDocks(city) {
    for (const d of city.docks) {
      ctx.fillStyle = PALETTE.dock;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = '#00000022';
      for (let x = d.x + 10; x < d.x + d.w; x += 24) ctx.fillRect(x, d.y, 3, d.h);
    }
  }

  function drawBuildings(city) {
    for (const b of city.buildings) {
      const lift = b.stories * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + lift, b.y + lift, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Roof detail: a lighter inner panel and vent boxes.
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          ctx.fillRect(b.x + 14 + i * 46, b.y + 14 + j * 46, 18, 12);
        }
      }
    }
  }

  function drawTrees(city) {
    for (const t of city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? '#4da34d' : '#3e7d32';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? '#6fbf5a' : '#5da347';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const l of city.lamps) {
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSkids(world) {
    ctx.strokeStyle = 'rgba(20,20,20,0.35)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of world.skids) {
      const a = Math.min(1, s.life);
      ctx.globalAlpha = a * 0.7;
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 10, s.y - Math.sin(s.angle) * 10);
      ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(world) {
    for (const pk of world.pickups) {
      const bob = Math.sin(pk.bob * 4) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#2f9e44';
        roundRect(ctx, -9, -6, 18, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#e8f5e9';
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#fff';
        roundRect(ctx, -9, -9, 18, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#e03131';
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      } else {
        ctx.fillStyle = '#f2c94c';
        roundRect(ctx, -8, -8, 16, 16, 3);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('A', 0, 0);
      }
      ctx.restore();
    }
  }

  function drawCarShape(car, time) {
    const m = car.model;
    const len = m.length;
    const wid = m.width;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.dead ? '#22262b' : car.color;
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 8);
    ctx.stroke();
    // Police livery: white doors.
    if (m.kind === 'police') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-6, -wid / 2 + 1, 16, wid - 2);
      // Flashing light bar.
      const flash = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
      ctx.fillRect(-4, -wid / 2 - 1, 5, 5);
      ctx.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
      ctx.fillRect(-4, wid / 2 - 4, 5, 5);
    }
    // Taxi checker band.
    if (m.kind === 'taxi') {
      ctx.fillStyle = '#222';
      for (let i = 0; i < 6; i += 1) ctx.fillRect(-len / 2 + 6 + i * 6, -2, 3, 4);
    }
    // Windshield, roof, rear window.
    ctx.fillStyle = 'rgba(180,220,240,0.85)';
    ctx.fillRect(len / 2 - 16, -wid / 2 + 4, 8, wid - 8);
    ctx.fillRect(-len / 2 + 8, -wid / 2 + 4, 7, wid - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-8, -wid / 2 + 4, 16, wid - 8);
    // Headlights and brake lights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-len / 2 - 1, -wid / 2 + 2, 3, 5);
    ctx.fillRect(-len / 2 - 1, wid / 2 - 7, 3, 5);
    ctx.restore();
  }

  function drawFigure(x, y, angle, bodyColor, opts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    if (opts && opts.gun) {
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 14, 4);
    }
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(2, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (opts && opts.cap) {
      ctx.fillStyle = '#1c2430';
      ctx.beginPath();
      ctx.arc(2, 0, 6, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMissionMarker(state) {
    const obj = missionObjective(state.missions);
    if (!obj.target) return;
    const t = state.world.time;
    const { x, y } = obj.target;
    // Ground ring and beacon column.
    ctx.strokeStyle = 'rgba(255,214,64,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26 + Math.sin(t * 3) * 4, 0, Math.PI * 2);
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, y - 220, 0, y);
    grad.addColorStop(0, 'rgba(255,214,64,0)');
    grad.addColorStop(1, 'rgba(255,214,64,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 10, y - 220, 20, 220);
    // Diamond above the spot.
    ctx.save();
    ctx.translate(x, y - 34 - Math.sin(t * 2) * 5);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd640';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
  }

  function drawShopMarkers() {
    const shops = [
      { p: PLACES.respray, label: 'R', color: '#7a5cff' },
      { p: PLACES.ammo, label: 'A', color: '#e07b39' },
      { p: PLACES.clinic, label: '+', color: '#e03131' },
      { p: PLACES.safehouse, label: 'H', color: '#2f9e44' },
    ];
    for (const s of shops) {
      ctx.fillStyle = s.color;
      roundRect(ctx, s.p.x - 13, s.p.y - 13, 26, 26, 6);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      roundRect(ctx, s.p.x - 13, s.p.y - 13, 26, 26, 6);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, s.p.x, s.p.y + 1);
    }
  }

  function drawWorldView(state) {
    const { world, camera } = state;
    ctx.save();
    ctx.translate(Math.round(viewW / 2 - camera.x), Math.round(viewH / 2 - camera.y));
    drawGround(state);
    drawRoads();
    drawDocks(world.city);
    drawSkids(world);
    drawBuildings(world.city);
    drawTrees(world.city);
    drawShopMarkers();
    drawMissionMarker(state);
    drawPickups(world);
    for (const car of world.cars) drawCarShape(car, world.time);
    for (const ped of world.peds) {
      if (ped.down > 0) {
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawFigure(ped.x, ped.y, ped.angle, ped.color, null);
      }
    }
    for (const r of world.rivals) drawFigure(r.x, r.y, r.angle, '#c92a2a', { gun: true });
    for (const c of world.cops) drawFigure(c.x, c.y, c.angle, '#2b3a55', { gun: true, cap: true });
    const p = world.player;
    if (!p.inCar && !p.dead) drawFigure(p.x, p.y, p.angle, '#2f9e44', { gun: true });
    // Bullets as tracers.
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawMinimap(state) {
    if (!minimapBase) buildMinimapBase(state.world.city);
    const x0 = viewW - 196;
    const y0 = 16;
    const w = 176;
    const h = 132;
    ctx.fillStyle = 'rgba(10,14,20,0.85)';
    roundRect(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 8);
    ctx.fill();
    ctx.drawImage(minimapBase, x0, y0, w, h);
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, w, h);
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const obj = missionObjective(state.missions);
    if (obj.target) {
      const pulse = 5 + Math.sin(state.world.time * 4) * 1.5;
      dot(obj.target.x, obj.target.y, pulse, '#ffd640');
      ctx.strokeStyle = '#7a5b00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x0 + obj.target.x * sx, y0 + obj.target.y * sy, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    dot(PLACES.respray.x, PLACES.respray.y, 3, '#7a5cff');
    dot(PLACES.safehouse.x, PLACES.safehouse.y, 3, '#2f9e44');
    for (const r of state.world.rivals) dot(r.x, r.y, 3, '#ff2a2a');
    const flash = Math.floor(state.world.time * 4) % 2 === 0;
    for (const car of state.world.cars) {
      if (car.driver === 'police' && !car.dead) dot(car.x, car.y, 3.5, flash ? '#2a6bff' : '#ff2a2a');
    }
    for (const c of state.world.cops) dot(c.x, c.y, 3, '#2a6bff');
    // Player arrow.
    const p = state.world.player;
    ctx.save();
    ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#fff';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('N', x0 + w / 2, y0 + 11);
  }

  function drawWantedStars(stars) {
    const x0 = viewW - 196;
    const y0 = 172;
    for (let i = 0; i < 5; i += 1) {
      starPath(ctx, x0 + 14 + i * 28, y0, 11);
      ctx.fillStyle = i < stars ? '#ffd640' : 'rgba(255,255,255,0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawHud(state) {
    const p = state.world.player;
    const pad = 16;
    // Top-left: health, cash, ammo.
    ctx.fillStyle = 'rgba(10,14,20,0.7)';
    roundRect(ctx, pad, pad, 210, 86, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$ ${p.cash.toLocaleString('en-US')}`, pad + 12, pad + 16);
    // Health bar.
    ctx.fillStyle = '#333';
    roundRect(ctx, pad + 12, pad + 32, 186, 12, 6);
    ctx.fill();
    const hp = Math.max(0, p.health / PLAYER.maxHealth);
    ctx.fillStyle = hp > 0.5 ? '#51cf66' : hp > 0.25 ? '#fcc419' : '#ff6b6b';
    if (hp > 0) {
      roundRect(ctx, pad + 12, pad + 32, 186 * hp, 12, 6);
      ctx.fill();
    }
    ctx.fillStyle = '#ddd';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(p.inCar ? `AMMO ${p.ammo}  •  CAR ${Math.max(0, Math.round(p.inCar.health))}%` : `AMMO ${p.ammo}`, pad + 12, pad + 62);
    // Speed when driving.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.36);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${kmh}`, viewW - 24, viewH - 56);
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = '#ccc';
      ctx.fillText('km/h', viewW - 24, viewH - 32);
    }
    drawMinimap(state);
    drawWantedStars(state.police.stars);
    // Objective panel, top centre.
    const obj = missionObjective(state.missions);
    const m = currentMission(state.missions);
    ctx.textAlign = 'center';
    const panelW = Math.min(560, viewW - 480);
    const px = (viewW - panelW) / 2;
    ctx.fillStyle = 'rgba(10,14,20,0.7)';
    roundRect(ctx, px, pad, panelW, 54, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd640';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(m && state.missions.phase !== 'done' ? `MISSION ${state.missions.index + 1}/5 — ${m.title.toUpperCase()}` : 'FREE ROAM', viewW / 2, pad + 16);
    ctx.fillStyle = '#fff';
    ctx.font = `14px ${FONT}`;
    ctx.fillText(obj.text, viewW / 2, pad + 38);
    // Hold progress for the bank job.
    const s = state.missions.phase === 'active' ? (m && m.steps[state.missions.step]) : null;
    if (s && s.type === 'hold') {
      const frac = Math.min(1, state.missions.holdTime / s.duration);
      ctx.fillStyle = '#333';
      roundRect(ctx, px + 20, pad + 62, panelW - 40, 10, 5);
      ctx.fill();
      ctx.fillStyle = '#ffd640';
      if (frac > 0) {
        roundRect(ctx, px + 20, pad + 62, (panelW - 40) * frac, 10, 5);
        ctx.fill();
      }
    }
    // District + clock, bottom-left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,14,20,0.7)';
    roundRect(ctx, pad, viewH - 64, 210, 48, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(districtAt(p.x, p.y), pad + 12, viewH - 44);
    ctx.fillStyle = '#ccc';
    ctx.font = `12px ${FONT}`;
    const hh = String(Math.floor(state.clockMin / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(state.clockMin % 60)).padStart(2, '0');
    ctx.fillText(`${hh}:${mm}  •  ${state.muted ? 'MUTED (M)' : 'M sound'}`, pad + 12, viewH - 26);
    // Context prompt.
    if (state.prompt) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(state.prompt, viewW / 2, viewH - 96);
    }
    // Centre messages.
    let my = viewH * 0.3;
    ctx.textAlign = 'center';
    for (const msg of state.messages) {
      const a = Math.min(1, msg.t / 0.5);
      ctx.globalAlpha = a;
      ctx.font = `bold ${msg.big ? 34 : 20}px ${FONT}`;
      ctx.fillStyle = msg.color || '#fff';
      ctx.fillText(msg.text, viewW / 2, my);
      ctx.globalAlpha = 1;
      my += msg.big ? 46 : 30;
    }
    // Phone brief card.
    if (state.missions.phase === 'brief' && m) {
      const bw = Math.min(520, viewW - 40);
      const bx = (viewW - bw) / 2;
      const by = viewH - 190;
      ctx.fillStyle = 'rgba(16,20,28,0.92)';
      roundRect(ctx, bx, by, bw, 104, 12);
      ctx.fill();
      ctx.strokeStyle = '#ffd640';
      ctx.lineWidth = 2;
      roundRect(ctx, bx, by, bw, 104, 12);
      ctx.stroke();
      // Portrait.
      ctx.fillStyle = '#b56576';
      ctx.beginPath();
      ctx.arc(bx + 40, by + 40, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath();
      ctx.arc(bx + 40, by + 36, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('MARISOL VEGA  •  incoming call', bx + 74, by + 24);
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = '#e8e8e8';
      wrapText(m.brief, bx + 74, by + 46, bw - 94, 19);
    }
  }

  function wrapText(text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function drawTitle(state) {
    // Slow pan over downtown as the backdrop.
    const t = state.world.time;
    const cam = { x: 1690 + Math.sin(t * 0.05) * 500, y: 1070 + Math.cos(t * 0.04) * 300 };
    const backdrop = { ...state, camera: cam };
    drawWorldView(backdrop);
    ctx.fillStyle = 'rgba(10,12,20,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd640';
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText(GAME_TITLE, viewW / 2, viewH * 0.3);
    ctx.fillStyle = '#fff';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(GAME_SUBTITLE, viewW / 2, viewH * 0.3 + 40);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = '#ddd';
    ctx.fillText('An open-world crime story in a sun-soaked coastal city. Steal cars, lose the cops, run the jobs.', viewW / 2, viewH * 0.3 + 72);
    const items = ['New Game', 'Continue', 'How to play'];
    if (!state.hasSave) items.splice(1, 1);
    const y0 = viewH * 0.52;
    items.forEach((item, i) => {
      const sel = i === state.menuIndex;
      ctx.font = `bold ${sel ? 26 : 22}px ${FONT}`;
      ctx.fillStyle = sel ? '#ffd640' : '#fff';
      ctx.fillText(`${sel ? '› ' : ''}${item}${sel ? ' ‹' : ''}`, viewW / 2, y0 + i * 46);
    });
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#aaa';
    ctx.fillText('WASD move / drive  •  Mouse aim  •  Click shoot  •  E enter car  •  Q use shop  •  F punch  •  Shift run  •  Esc pause', viewW / 2, viewH - 40);
    ctx.fillText('An original game: its city, characters, vehicles, names and story are all its own.', viewW / 2, viewH - 20);
  }

  function drawHelp() {
    ctx.fillStyle = 'rgba(10,12,20,0.88)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd640';
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText('HOW TO PLAY', viewW / 2, 90);
    const lines = [
      ['Move / drive', 'WASD or arrow keys'],
      ['Run', 'Hold Shift (on foot)'],
      ['Aim', 'Mouse — your character faces the cursor'],
      ['Shoot', 'Left mouse button (hold to keep firing)'],
      ['Punch', 'F'],
      ['Enter / exit a car', 'E near a car (stealing one raises the heat)'],
      ['Use a shop', 'Q near a shop marker (respray, ammo, clinic, safehouse)'],
      ['Horn', 'H'],
      ['Pause', 'Esc or P'],
      ['Mute', 'M'],
      ['', ''],
      ['Wanted stars', 'Crimes raise them. Stay out of sight and they fade.'],
      ['Respray garage', 'Purple R on the map: $150 clears your wanted level.'],
      ['Safehouse', 'Green H: press Q there to save your game.'],
      ['Missions', 'Follow the yellow marker. Finish all five to win.'],
    ];
    ctx.font = `16px ${FONT}`;
    let y = 150;
    for (const [a, b] of lines) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd640';
      ctx.fillText(a, viewW / 2 - 20, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(b, viewW / 2 + 20, y);
      y += 30;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = `14px ${FONT}`;
    ctx.fillText('Press Esc or Enter to go back', viewW / 2, viewH - 40);
  }

  function drawPause(state) {
    drawWorldView(state);
    drawHud(state);
    ctx.fillStyle = 'rgba(10,12,20,0.7)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText('PAUSED', viewW / 2, viewH * 0.34);
    const items = ['Resume', 'Save game', 'How to play', 'Quit to title'];
    items.forEach((item, i) => {
      const sel = i === state.menuIndex;
      ctx.font = `bold ${sel ? 26 : 22}px ${FONT}`;
      ctx.fillStyle = sel ? '#ffd640' : '#fff';
      ctx.fillText(`${sel ? '› ' : ''}${item}${sel ? ' ‹' : ''}`, viewW / 2, viewH * 0.46 + i * 44);
    });
  }

  function drawEndScreen(state, title, sub, color) {
    drawWorldView(state);
    ctx.fillStyle = 'rgba(10,12,20,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `900 72px ${FONT}`;
    ctx.fillText(title, viewW / 2, viewH * 0.4);
    ctx.fillStyle = '#fff';
    ctx.font = `20px ${FONT}`;
    ctx.fillText(sub, viewW / 2, viewH * 0.4 + 44);
    ctx.fillStyle = '#aaa';
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Press Enter to retry the mission  •  Esc for the title screen', viewW / 2, viewH * 0.4 + 90);
  }

  function drawWon(state) {
    drawWorldView(state);
    ctx.fillStyle = 'rgba(10,12,20,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd640';
    ctx.font = `900 56px ${FONT}`;
    ctx.fillText('THE BIG SCORE', viewW / 2, viewH * 0.34);
    ctx.fillStyle = '#fff';
    ctx.font = `22px ${FONT}`;
    ctx.fillText('All five jobs done. Solmara is yours, Rook.', viewW / 2, viewH * 0.34 + 44);
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = '#ddd';
    ctx.fillText(`Cash in hand: $ ${state.world.player.cash.toLocaleString('en-US')}`, viewW / 2, viewH * 0.34 + 84);
    ctx.fillStyle = '#aaa';
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Press Enter to keep roaming free  •  Esc for the title screen', viewW / 2, viewH * 0.34 + 130);
  }

  function draw(state) {
    ctx.clearRect(0, 0, viewW, viewH);
    if (state.screen === 'title') {
      drawTitle(state);
    } else if (state.screen === 'help') {
      drawWorldView(state);
      drawHelp();
    } else if (state.screen === 'pause') {
      drawPause(state);
    } else if (state.screen === 'wasted') {
      drawEndScreen(state, 'WASTED', 'Rook went down. The city keeps moving without you.', '#ff6b6b');
    } else if (state.screen === 'busted') {
      drawEndScreen(state, 'BUSTED', 'The Solmara PD caught up with you.', '#6ea8ff');
    } else if (state.screen === 'won') {
      drawWon(state);
    } else {
      drawWorldView(state);
      drawHud(state);
    }
  }

  return { resize, draw, viewSize: () => ({ w: viewW, h: viewH }) };
}
