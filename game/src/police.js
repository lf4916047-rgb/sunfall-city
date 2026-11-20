// Wanted level and the police response: cruisers that pursue, foot officers
// that chase and bust the player, and the cool-down that clears the heat.
import { S } from './state.js';
import { WORLD_W, WORLD_H, ROADS_V, ROADS_H } from './config.js';
import { clamp, dist, angleTo, turnToward, pick } from './utils.js';
import { createCar, carLength, damageCar } from './cars.js';
import { collideBuildings, clampToWorld, nearestRoadCenter } from './city.js';
import { sfx } from './audio.js';

const WANTED_DECAY_CLEAN = 14; // seconds without a crime before a star drops
const WANTED_DECAY_HIDDEN = 8; // seconds unseen before a star drops (faster)

let policeRng = 424242;
function prand() {
  policeRng = (policeRng * 1103515245 + 12345) & 0x7fffffff;
  return policeRng / 0x7fffffff;
}

export function addWanted(stars, reason) {
  if (S.wanted >= 5) return;
  const before = S.wanted;
  S.wanted = Math.min(5, S.wanted + stars);
  S.wantedHeat = 1;
  S.lastCrimeAt = S.time;
  if (S.wanted > before) {
    S.message = reason ? `WANTED — ${reason}` : 'WANTED LEVEL UP';
    S.messageUntil = S.time + 2.2;
    if (S.wanted >= 3) sfx.fail();
  }
}

// How many cruisers the current heat fields.
export function cruisersWanted() {
  return [0, 1, 2, 3, 4, 5][S.wanted];
}
export function copsWanted() {
  return [0, 0, 1, 2, 3, 4][S.wanted];
}

export function spawnPoliceCar() {
  const p = S.player;
  // Spawn on a road just off-screen from the player.
  const a = prand() * Math.PI * 2;
  const r = 620 + prand() * 220;
  let x = clamp(p.x + Math.cos(a) * r, 360, WORLD_W - 60);
  let y = clamp(p.y + Math.sin(a) * r, 60, WORLD_H - 60);
  const road = nearestRoadCenter(x, y);
  if (road.axis === 'v') x = road.line;
  else y = road.line;
  const car = createCar('police', x, y, angleTo(x, y, p.x, p.y), { ai: 'police' });
  car.speed = 200;
  return car;
}

export function spawnCop(x, y) {
  const cop = {
    x, y, angle: 0, hp: 60, maxHp: 60,
    speed: 205, state: 'chase', fireCooldown: 0, hitTimer: 0,
  };
  S.cops.push(cop);
  return cop;
}

function countPoliceCars() {
  let n = 0;
  for (const c of S.cars) if (c.ai === 'police' && c.hp > 0) n += 1;
  return n;
}

export function updateWanted(dt) {
  const p = S.player;
  if (!p) return;
  // Decay: no crime recently and police have lost sight.
  const sinceCrime = S.time - S.lastCrimeAt;
  const sinceSeen = S.time - S.lastSeenAt;
  if (S.wanted > 0) {
    const cleanTime = sinceSeen > 4 ? WANTED_DECAY_HIDDEN : WANTED_DECAY_CLEAN;
    if (sinceCrime > cleanTime) {
      S.wanted -= 1;
      S.lastCrimeAt = S.time;
      S.message = S.wanted > 0 ? `Heat cooling… ${S.wanted} star${S.wanted > 1 ? 's' : ''} left` : 'You lost them. Heat is off.';
      S.messageUntil = S.time + 2;
    }
  }
  // Field the right number of cruisers and officers.
  const wantCars = cruisersWanted();
  const haveCars = countPoliceCars();
  if (haveCars < wantCars && Math.random() < dt * 0.7) spawnPoliceCar();
  const wantCops = copsWanted();
  if (S.cops.length < wantCops && p.onFoot && Math.random() < dt * 0.5) {
    const a = prand() * Math.PI * 2;
    spawnCop(clamp(p.x + Math.cos(a) * 500, 340, WORLD_W - 40), clamp(p.y + Math.sin(a) * 500, 40, WORLD_H - 40));
  }
  // Clear the heat fully when the player is clean and the level hit zero.
  if (S.wanted === 0) {
    // Despawn distant cruisers so the city calms down.
    for (const c of S.cars) {
      if (c.ai === 'police' && dist(c.x, c.y, p.x, p.y) > 1000) c.hp = 0;
    }
    S.cops.length = 0;
  }
}

// Police cruiser pursuit: steer at the player, ram, and keep line of sight.
export function updatePoliceCar(car, dt) {
  const p = S.player;
  const t = { topSpeed: 470, accel: 340, brake: 500, grip: 3.1 };
  const d = dist(car.x, car.y, p.x, p.y);
  const wantAngle = angleTo(car.x, car.y, p.x, p.y);
  const targetSpeed = d > 260 ? t.topSpeed : t.topSpeed * 0.75;
  car.speed += clamp(targetSpeed - car.speed, -t.brake * dt, t.accel * dt);
  // Steer toward the player, but slide along buildings instead of ramming them.
  const before = { x: car.x, y: car.y };
  car.angle = turnToward(car.angle, wantAngle, t.grip * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const hitWall = collideBuildings(car, 20);
  clampToWorld(car, 24);
  if (hitWall) {
    // Unstick: slide along the wall by trying the perpendicular.
    car.x = before.x; car.y = before.y;
    car.angle += 0.6 * dt * 8;
    car.speed *= 0.7;
    car.stuckTimer += dt;
    if (car.stuckTimer > 2.5) {
      // Teleport back onto a road near the player (a fresh unit joins the chase).
      const road = nearestRoadCenter(p.x, p.y);
      if (road.axis === 'v') { car.x = road.line; car.y = clamp(p.y + (prand() < 0.5 ? 500 : -500), 60, WORLD_H - 60); }
      else { car.y = road.line; car.x = clamp(p.x + (prand() < 0.5 ? 500 : -500), 360, WORLD_W - 60); }
      car.speed = 200;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
  // Line of sight: police within 700px and roughly facing the player see them.
  if (d < 700) S.lastSeenAt = S.time;
  // Ram the player: a discrete hit with a cooldown, not a continuous grind —
  // cruisers piling on at full rate destroyed a car in under two seconds,
  // which made a 3-star getaway unwinnable in anything but the fastest car.
  if (car.ramCd > 0) car.ramCd -= dt;
  if (d < 40) {
    if (p.inCar) {
      if (car.ramCd <= 0) {
        damageCar(p.inCar, 8, car);
        car.ramCd = 1.5;
        S.shake = Math.max(S.shake, 2);
        car.speed *= 0.85;
      }
    } else if (p.invuln <= 0) {
      p.hp -= 40 * dt;
      p.invuln = 0.4;
      S.flash = Math.max(S.flash, 0.4);
    }
  }
}

export function updateCops(dt) {
  const p = S.player;
  for (const cop of S.cops) {
    if (cop.hp <= 0) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const wantAngle = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = turnToward(cop.angle, wantAngle, 6 * dt);
    const speed = d > 300 ? cop.speed : cop.speed * 0.85;
    cop.x += Math.cos(cop.angle) * speed * dt;
    cop.y += Math.sin(cop.angle) * speed * dt;
    collideBuildings(cop, 10);
    clampToWorld(cop, 16);
    if (d < 700) S.lastSeenAt = S.time;
    // On foot, an officer that catches the player busts them.
    if (p.onFoot && d < 26) {
      p.bustedTimer += dt;
      if (p.bustedTimer > 0.6) {
        S.screen = 'busted';
      }
    } else {
      p.bustedTimer = Math.max(0, p.bustedTimer - dt);
    }
    // Officers shoot when the player is armed and at range.
    cop.fireCooldown -= dt;
    if (d > 120 && d < 420 && cop.fireCooldown <= 0 && S.wanted >= 2) {
      cop.fireCooldown = 1.4 + prand() * 0.8;
      S.bullets.push({
        x: cop.x, y: cop.y, angle: wantAngle + (prand() - 0.5) * 0.14,
        speed: 700, damage: 9, range: 420, from: 'cop', life: 0.6,
      });
      sfx.enemyShoot();
    }
  }
  S.cops = S.cops.filter((c) => c.hp > 0);
}

export function drawCop(ctx, cop) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.rotate(cop.angle + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 7, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Navy uniform, cap, badge.
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(-4, -2, 3, 10);
  ctx.fillRect(1, -2, 3, 10);
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(0, -9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(-5, -12, 10, 3);
  ctx.fillStyle = '#ffd21e';
  ctx.fillRect(-1, -2, 2, 2);
  ctx.restore();
  // Health bar when hurt.
  if (cop.hp < cop.maxHp) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cop.x - 14, cop.y - 22, 28, 4);
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(cop.x - 14, cop.y - 22, 28 * (cop.hp / cop.maxHp), 4);
  }
}
