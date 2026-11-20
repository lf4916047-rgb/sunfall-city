// Pedestrians: they stroll the sidewalks, cross at intersections, and flee danger.
// A ped is { id, x, y, angle, speed, color, state, tx, ty, fleeTimer, down, downTimer }.
import { S } from './state.js';
import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_HALF } from './config.js';
import { clamp, dist, angleTo, turnToward, pick } from './utils.js';
import { collideBuildings, clampToWorld, isOnRoad, onSidewalk } from './city.js';

const SHIRTS = ['#d8a03a', '#3a8a5a', '#8a3a6a', '#3a6a8a', '#c25a2a', '#5a4a8a', '#7a7a7a', '#a03a3a'];
const PANTS = ['#2a2f3a', '#3a3f4a', '#5a4a3a', '#2f3a2f'];

let pedRng = 13579;
function prand() {
  pedRng = (pedRng * 1103515245 + 12345) & 0x7fffffff;
  return pedRng / 0x7fffffff;
}

export function createPed(x, y) {
  const ped = {
    id: S.nextPedId,
    x, y,
    angle: prand() * Math.PI * 2,
    speed: 40 + prand() * 35,
    color: pick(prand, SHIRTS),
    pants: pick(prand, PANTS),
    state: 'walk', // walk | flee | down
    tx: x, ty: y,
    fleeTimer: 0,
    downTimer: 0,
    bob: prand() * 10,
  };
  S.nextPedId += 1;
  S.peds.push(ped);
  return ped;
}

export function spawnPeds(count) {
  for (let i = 0; i < count; i += 1) {
    // Prefer sidewalks: pick a road, stand just off it.
    let x, y;
    if (prand() < 0.5) {
      const vx = pick(prand, ROADS_V);
      x = vx + (prand() < 0.5 ? ROAD_HALF + 14 : -(ROAD_HALF + 14));
      y = 100 + prand() * (WORLD_H - 200);
    } else {
      const hy = pick(prand, ROADS_H);
      y = hy + (prand() < 0.5 ? ROAD_HALF + 14 : -(ROAD_HALF + 14));
      x = 400 + prand() * (WORLD_W - 500);
    }
    x = clamp(x, 330, WORLD_W - 30);
    y = clamp(y, 30, WORLD_H - 30);
    createPed(x, y);
  }
}

// Danger scares every ped nearby: gunshots, explosions, a speeding car.
export function scarePeds(x, y, radius) {
  for (const p of S.peds) {
    if (p.state === 'down') continue;
    if (dist(x, y, p.x, p.y) < radius) {
      p.state = 'flee';
      p.fleeTimer = 2.5 + prand() * 2;
      const a = angleTo(x, y, p.x, p.y);
      p.tx = p.x + Math.cos(a) * 320;
      p.ty = p.y + Math.sin(a) * 320;
    }
  }
}

export function knockDownPed(ped, byCar) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downTimer = 6 + prand() * 4;
  for (let i = 0; i < 8; i += 1) {
    S.particles.push({
      x: ped.x, y: ped.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120,
      life: 0.4, maxLife: 0.4, size: 3, color: '#ff5a4a', kind: 'spark',
    });
  }
}

export function updatePeds(dt) {
  for (const p of S.peds) {
    p.bob += dt * 8;
    if (p.state === 'down') {
      p.downTimer -= dt;
      if (p.downTimer <= 0) { p.state = 'walk'; p.tx = p.x; p.ty = p.y; }
      continue;
    }
    if (p.state === 'flee') {
      p.fleeTimer -= dt;
      if (p.fleeTimer <= 0) p.state = 'walk';
    }
    const d = dist(p.x, p.y, p.tx, p.ty);
    if (d < 12) {
      // Pick a new stroll target: along the sidewalk of a random road.
      if (prand() < 0.5) {
        const vx = pick(prand, ROADS_V);
        p.tx = vx + (prand() < 0.5 ? ROAD_HALF + 14 : -(ROAD_HALF + 14));
        p.ty = clamp(p.y + (prand() - 0.5) * 500, 60, WORLD_H - 60);
      } else {
        const hy = pick(prand, ROADS_H);
        p.ty = hy + (prand() < 0.5 ? ROAD_HALF + 14 : -(ROAD_HALF + 14));
        p.tx = clamp(p.x + (prand() - 0.5) * 500, 340, WORLD_W - 60);
      }
    }
    const speed = p.state === 'flee' ? p.speed * 2.6 : p.speed;
    const want = angleTo(p.x, p.y, p.tx, p.ty);
    p.angle = turnToward(p.angle, want, 5 * dt);
    const ox = p.x, oy = p.y;
    p.x += Math.cos(p.angle) * speed * dt;
    p.y += Math.sin(p.angle) * speed * dt;
    const hitWall = collideBuildings(p, 10);
    clampToWorld(p, 16);
    if (hitWall) { p.tx = ox; p.ty = oy; }
    // A fast car hitting a ped knocks them down (handled in main via car-ped check too).
  }
  // Keep the crowd topped up near the player.
  const p = S.player;
  if (p && S.peds.length < 22) {
    let tries = 0;
    while (S.peds.length < 22 && tries < 6) {
      tries += 1;
      const a = prand() * Math.PI * 2;
      const r = 500 + prand() * 300;
      const x = clamp(p.x + Math.cos(a) * r, 340, WORLD_W - 40);
      const y = clamp(p.y + Math.sin(a) * r, 40, WORLD_H - 40);
      if (dist(x, y, p.x, p.y) > 420) createPed(x, y);
    }
  }
}

export function drawPed(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.state === 'down') {
    // Lying flat.
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(-11, -4, 22, 8);
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(13, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(p.bob) * 1.5;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 7, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle + Math.PI / 2);
  // Legs.
  ctx.fillStyle = p.pants;
  ctx.fillRect(-4, -2 + bob, 3, 10);
  ctx.fillRect(1, -2 - bob, 3, 10);
  // Body.
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(0, -9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
