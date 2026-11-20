// The city itself: a road grid, named districts, buildings, beach and props.
// Generated once from a fixed seed, so the layout is identical every visit.
import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_HALF, PAL } from './config.js';
import { mulberry32, pick, range, randi, circleVsRect, pointInRect } from './utils.js';

export const CITY = {
  buildings: [],
  props: [], // { kind: 'palm'|'lamp'|'crate'|'bench'|'hydrant'|'tree', x, y, ... }
  landmarks: {}, // named places by key
  parkingSpots: [], // { x, y, angle, type }
  groundDots: [], // precomputed ground texture speckles { x, y, s, shade }
  grassTufts: [], // { x, y, r }
};

const rng = mulberry32(20261120);

function blockRects() {
  // Blocks are the rectangles between adjacent roads (and the world edge).
  const xs = [320, ...ROADS_V, WORLD_W];
  const ys = [0, ...ROADS_H, WORLD_H];
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + ROAD_HALF + 26;
      const x1 = xs[i + 1] - ROAD_HALF - 26;
      const y0 = ys[j] + ROAD_HALF + 26;
      const y1 = ys[j + 1] - ROAD_HALF - 26;
      if (x1 - x0 > 60 && y1 - y0 > 60) blocks.push({ x0, y0, x1, y1 });
    }
  }
  return blocks;
}

export function generateCity() {
  const blocks = blockRects();
  let bi = 0;
  for (const b of blocks) {
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    // Split large blocks into 2-4 buildings; small blocks get one.
    const cols = bw > 420 ? 2 : 1;
    const rows = bh > 380 ? 2 : 1;
    const cw = bw / cols, ch = bh / rows;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (rng() < 0.14) { // occasional plaza / empty lot with props
          const px = b.x0 + cx * cw + cw / 2, py = b.y0 + cy * ch + ch / 2;
          CITY.props.push({ kind: 'tree', x: px - 30, y: py - 20 });
          CITY.props.push({ kind: 'tree', x: px + 34, y: py + 26 });
          CITY.props.push({ kind: 'bench', x: px, y: py });
          continue;
        }
        const w = cw * range(rng, 0.55, 0.8);
        const h = ch * range(rng, 0.55, 0.8);
        const x = b.x0 + cx * cw + (cw - w) / 2;
        const y = b.y0 + cy * ch + (ch - h) / 2;
        const colorIdx = Math.floor(rng() * PAL.buildingRoof.length);
        // Roof clutter: vents and AC boxes, placed once so they never flicker.
        const vents = [];
        const nv = 1 + Math.floor(rng() * 3);
        for (let v = 0; v < nv; v += 1) {
          vents.push({
            x: x + 12 + rng() * Math.max(10, w - 40),
            y: y + 12 + rng() * Math.max(10, h - 40),
            w: 10 + rng() * 14, h: 8 + rng() * 10,
          });
        }
        CITY.buildings.push({
          x, y, w, h, cellY0: b.y0, roof: PAL.buildingRoof[colorIdx], wall: PAL.buildingWall[colorIdx],
          tall: rng() < 0.3, // tall towers get a drawn height
          lit: rng() < 0.6,
          // Striped awning over the door on the south face.
          awning: rng() < 0.35,
          awnX: 0.1 + rng() * 0.4, awnW: 0.3 + rng() * 0.25,
          vents,
          id: bi,
        });
        bi += 1;
      }
    }
  }

  // Landmark towers: the three largest buildings with room to grow north get
  // a three-tier setback + beacon, so Downtown reads at a glance.
  const cands = CITY.buildings.filter((b) => b.y - (b.cellY0 ?? 0) > 40)
    .sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 3);
  for (const b of cands) b.landmark = true;

  // Landmarks (named places used by missions and the HUD).
  CITY.landmarks = {
    marina: { name: 'Marina', x: 250, y: 450 },
    motel: { name: 'Sunset Motel', x: 2650, y: 2100 },
    garage: { name: "Rico's Garage", x: 1850, y: 1650 },
    pier: { name: 'Old Pier', x: 300, y: 1950 },
    bank: { name: 'Harbor Bank', x: 2650, y: 700 },
    safehouse: { name: "Marisol's", x: 800, y: 2200 },
    hospital: { name: 'St. Aurelia Hospital', x: 1400, y: 700 },
    police: { name: 'Central Precinct', x: 2000, y: 1200 },
  };

  // Palms along the beach and the Sunset Strip.
  for (let y = 120; y < WORLD_H; y += 170) {
    CITY.props.push({ kind: 'palm', x: 300 + range(rng, -8, 8), y });
  }
  for (let x = 600; x < WORLD_W; x += 260) {
    CITY.props.push({ kind: 'palm', x, y: 2080 + range(rng, -10, 10) });
  }
  // Street lamps at intersections.
  for (const vx of ROADS_V) {
    for (const hy of ROADS_H) {
      CITY.props.push({ kind: 'lamp', x: vx + ROAD_HALF + 14, y: hy + ROAD_HALF + 14 });
    }
  }
  // Crates and hydrants scattered in alleys.
  for (let i = 0; i < 40; i += 1) {
    const b = blocks[Math.floor(rng() * blocks.length)];
    CITY.props.push({
      kind: rng() < 0.6 ? 'crate' : 'hydrant',
      x: range(rng, b.x0 + 10, b.x1 - 10),
      y: range(rng, b.y0 + 10, b.y1 - 10),
    });
  }

  // Sea shimmer: precomputed sparkle streaks on the west coast, animated by
  // the render loop so the water reads as moving.
  CITY.seaSparkles = [];
  for (let i = 0; i < 48; i += 1) {
    CITY.seaSparkles.push({
      x: 8 + rng() * 200, y: rng() * WORLD_H,
      len: 8 + rng() * 22, phase: rng() * Math.PI * 2, speed: 0.5 + rng() * 1.6,
    });
  }

  // Ground texture: speckles and grass tufts scattered over the lots, kept off
  // the roads so the asphalt stays clean.
  for (let i = 0; i < 700; i += 1) {
    const x = 330 + rng() * (WORLD_W - 360);
    const y = rng() * WORLD_H;
    let onRoad = false;
    for (const vx of ROADS_V) if (Math.abs(x - vx) < ROAD_HALF + 28) onRoad = true;
    for (const hy of ROADS_H) if (Math.abs(y - hy) < ROAD_HALF + 28) onRoad = true;
    if (onRoad) continue;
    CITY.groundDots.push({ x, y, s: 1 + rng() * 2.5, shade: rng() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)' });
  }
  for (let i = 0; i < 130; i += 1) {
    const x = 340 + rng() * (WORLD_W - 380);
    const y = rng() * WORLD_H;
    let onRoad = false;
    for (const vx of ROADS_V) if (Math.abs(x - vx) < ROAD_HALF + 30) onRoad = true;
    for (const hy of ROADS_H) if (Math.abs(y - hy) < ROAD_HALF + 30) onRoad = true;
    if (!onRoad) CITY.grassTufts.push({ x, y, r: 8 + rng() * 14 });
  }

  // Parking spots: parallel-parked at the road's outer edge (42px off centre),
  // far enough from the traffic lane (20px) that traffic can pass, and clear of
  // buildings (the block margin starts at 71px). Each spot is checked clear.
  function spotClear(x, y) {
    for (const b of CITY.buildings) {
      if (x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 40 && y < b.y + b.h + 40) return false;
    }
    return true;
  }
  for (const vx of ROADS_V) {
    for (const hy of ROADS_H) {
      if (rng() < 0.55) {
        const y = hy + 130 + rng() * 120;
        const x = vx + 42;
        if (spotClear(x, y)) CITY.parkingSpots.push({ x, y, angle: Math.PI / 2, type: pick(rng, ['sedan', 'van', 'taxi']) });
      }
      if (rng() < 0.45) {
        const y = hy + 260 + rng() * 120;
        const x = vx - 42;
        if (spotClear(x, y)) CITY.parkingSpots.push({ x, y, angle: -Math.PI / 2, type: pick(rng, ['sedan', 'sports', 'sedan']) });
      }
    }
  }
  return CITY;
}

export function isOnRoad(x, y) {
  for (const vx of ROADS_V) if (Math.abs(x - vx) <= ROAD_HALF + 2) return true;
  for (const hy of ROADS_H) if (Math.abs(y - hy) <= ROAD_HALF + 2) return true;
  return false;
}

export function onSidewalk(x, y) {
  // The band just outside a road is sidewalk.
  for (const vx of ROADS_V) {
    const d = Math.abs(x - vx);
    if (d > ROAD_HALF && d <= ROAD_HALF + 26) return true;
  }
  for (const hy of ROADS_H) {
    const d = Math.abs(y - hy);
    if (d > ROAD_HALF && d <= ROAD_HALF + 26) return true;
  }
  return false;
}

export function inBuilding(x, y) {
  for (const b of CITY.buildings) if (pointInRect(x, y, b)) return b;
  return null;
}

// Push a circle (entity) out of every building it overlaps. Returns true if it hit.
export function collideBuildings(e, r) {
  let hit = false;
  for (const b of CITY.buildings) {
    const fix = circleVsRect(e.x, e.y, r, b);
    if (fix) { e.x = fix.x; e.y = fix.y; hit = true; }
  }
  return hit;
}

export function clampToWorld(e, margin = 20) {
  e.x = Math.max(margin, Math.min(WORLD_W - margin, e.x));
  e.y = Math.max(margin, Math.min(WORLD_H - margin, e.y));
}

export function nearestRoadCenter(x, y) {
  // Returns the closest road (axis, line, distance) for lane-following.
  let best = null;
  for (const vx of ROADS_V) {
    const d = Math.abs(x - vx);
    if (!best || d < best.d) best = { axis: 'v', line: vx, d };
  }
  for (const hy of ROADS_H) {
    const d = Math.abs(y - hy);
    if (!best || d < best.d) best = { axis: 'h', line: hy, d };
  }
  return best;
}

export function districtAt(x, y) {
  if (x < 420) return 'MARINA BAY';
  if (y >= 1950) return 'SUNSET STRIP';
  if (x < 1100 && y < 950) return 'OLD TOWN';
  if (x < 2300) return 'DOWNTOWN';
  return 'HARBOR EAST';
}
