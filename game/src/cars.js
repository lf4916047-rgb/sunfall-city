// Cars: creation, player driving physics, traffic AI, parked cars, collisions.
// A car is { id, type, x, y, angle, speed, hp, maxHp, color, ai, parked, ... }.
// ai: null (player-driven or parked), 'traffic', 'police'.
import { S } from './state.js';
import { CAR_TYPES, WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_HALF, LANE } from './config.js';
import { clamp, dist, angleDiff, turnToward, pick } from './utils.js';
import { collideBuildings, clampToWorld, CITY } from './city.js';
import { sfx } from './audio.js';

let carRngState = 987654321;
function carRand() {
  carRngState = (carRngState * 1103515245 + 12345) & 0x7fffffff;
  return carRngState / 0x7fffffff;
}

export function createCar(type, x, y, angle, opts = {}) {
  const t = CAR_TYPES[type];
  const car = {
    id: S.nextCarId,
    type,
    name: t.name,
    x, y, angle,
    speed: 0,
    hp: t.hp, maxHp: t.hp,
    color: opts.color || pick(carRand, t.colors),
    ai: opts.ai || null,
    parked: !!opts.parked,
    driver: opts.driver || null, // 'player' | 'ped' | null
    // traffic AI state
    roadAxis: opts.roadAxis || 'v',
    roadLine: opts.roadLine || ROADS_V[0],
    dir: opts.dir || 1,
    laneOffset: 0,
    cruise: 130 + carRand() * 60,
    stuckTimer: 0,
    // police AI state
    targetX: 0, targetY: 0,
    damaged: 0,
    smoke: 0,
  };
  S.nextCarId += 1;
  S.cars.push(car);
  return car;
}

export function carLength(car) {
  return car.type === 'truck' ? 62 : car.type === 'van' ? 52 : 46;
}
export function carWidth(car) { return car.type === 'truck' ? 26 : 24; }

export function nearestCar(x, y, maxDist, filter) {
  let best = null, bestD = maxDist;
  for (const c of S.cars) {
    if (filter && !filter(c)) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// ---- player driving -------------------------------------------------------
export function updatePlayerCar(car, input, dt) {
  const t = CAR_TYPES[car.type];
  const { throttle, steer, handbrake } = input;
  const forward = throttle > 0;
  if (throttle !== 0) {
    const accel = forward ? t.accel : t.brake * 0.8;
    car.speed += accel * throttle * dt;
  } else {
    // Engine braking / rolling resistance.
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 120 * dt);
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 700 * dt);
  }
  car.speed = clamp(car.speed, -t.topSpeed * 0.4, t.topSpeed);
  // Steering only bites while moving; sharper at low speed, looser at high speed.
  const speedFactor = clamp(Math.abs(car.speed) / t.topSpeed, 0, 1);
  const steerRate = t.grip * (1.25 - 0.75 * speedFactor) * (handbrake ? 1.5 : 1);
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += steer * steerRate * dt * dir * clamp(Math.abs(car.speed) / 60, 0, 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const ox = car.x, oy = car.y;
  car.x = nx; car.y = ny;
  const hitWall = collideBuildings(car, 20);
  clampToWorld(car, 24);
  if (hitWall || car.x !== nx || car.y !== ny) {
    // Scrape: lose speed, take a little damage, spark.
    if (Math.abs(car.speed) > 120) {
      damageCar(car, Math.abs(car.speed) * 0.02, null);
      S.shake = Math.max(S.shake, 3);
      sfx.crash();
    }
    car.speed *= 0.55;
    car.x = ox + (car.x - ox) * 0.2;
    car.y = oy + (car.y - oy) * 0.2;
  }
  S.stats.distance += Math.abs(car.speed) * dt;
  if (car.hp < car.maxHp * 0.4) car.smoke = 1;
  else car.smoke = 0;
}

export function damageCar(car, amount, source) {
  if (car.hp <= 0) return;
  car.hp -= amount;
  car.damaged = 1;
  if (car.hp <= 0) {
    car.hp = 0;
    car.speed = 0;
    explodeCar(car);
  }
}

export function explodeCar(car) {
  const p = S.player;
  for (let i = 0; i < 26; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 220;
    S.particles.push({
      x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.5, maxLife: 1,
      size: 3 + Math.random() * 5, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd21e',
      kind: 'spark',
    });
  }
  S.shake = Math.max(S.shake, 8);
  sfx.crash();
  if (p && p.inCar === car) {
    p.hp -= 25;
    S.flash = Math.max(S.flash, 0.5);
  }
}

// ---- traffic AI -----------------------------------------------------------
// A traffic car drives down a road in its lane; at intersections it may turn.
export function updateTrafficCar(car, dt) {
  const t = CAR_TYPES[car.type];
  const ahead = carAheadBlocked(car);
  const targetSpeed = ahead ? 0 : car.cruise;
  car.speed += clamp(targetSpeed - car.speed, -t.brake * dt, t.accel * 0.6 * dt);
  // Desired heading: along the road in `dir`, in the right-hand lane.
  let wantAngle;
  let laneX = car.x, laneY = car.y;
  if (car.roadAxis === 'v') {
    wantAngle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    laneX = car.roadLine + (car.dir > 0 ? LANE : -LANE);
  } else {
    wantAngle = car.dir > 0 ? 0 : Math.PI;
    laneY = car.roadLine + (car.dir > 0 ? LANE : -LANE);
  }
  car.angle = turnToward(car.angle, wantAngle, 2.2 * dt);
  // Steer back toward the lane line. (Sign: on a vertical road the correction
  // runs opposite to the lane error; on a horizontal road it follows it.)
  const laneErr = car.roadAxis === 'v' ? laneX - car.x : laneY - car.y;
  const sign = car.roadAxis === 'v' ? -car.dir : car.dir;
  car.angle += clamp(laneErr * 0.004, -0.02, 0.02) * sign;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  clampToWorld(car, 30);
  // At the city edge or a junction, pick a new road.
  if (atJunction(car) || atEdge(car)) chooseNewRoad(car);
}

function atEdge(car) {
  return car.x < 340 || car.x > WORLD_W - 40 || car.y < 60 || car.y > WORLD_H - 40;
}

function atJunction(car) {
  if (car.roadAxis === 'v') {
    for (const hy of ROADS_H) {
      if (Math.abs(car.y - hy) < 6 && Math.abs(angleDiff(car.angle, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)) < 0.2) return true;
    }
  } else {
    for (const vx of ROADS_V) {
      if (Math.abs(car.x - vx) < 6 && Math.abs(angleDiff(car.angle, car.dir > 0 ? 0 : Math.PI)) < 0.2) return true;
    }
  }
  return false;
}

function chooseNewRoad(car) {
  const r = carRand();
  if (r < 0.55) return; // keep going straight most of the time
  if (car.roadAxis === 'v') {
    // Turn onto the nearest horizontal road.
    let best = ROADS_H[0], bd = Infinity;
    for (const hy of ROADS_H) {
      const d = Math.abs(car.y - hy);
      if (d < bd) { bd = d; best = hy; }
    }
    car.roadAxis = 'h';
    car.roadLine = best;
    car.y = best + (carRand() < 0.5 ? LANE : -LANE);
    car.dir = carRand() < 0.5 ? 1 : -1;
    car.angle = car.dir > 0 ? 0 : Math.PI;
  } else {
    let best = ROADS_V[0], bd = Infinity;
    for (const vx of ROADS_V) {
      const d = Math.abs(car.x - vx);
      if (d < bd) { bd = d; best = vx; }
    }
    car.roadAxis = 'v';
    car.roadLine = best;
    car.x = best + (carRand() < 0.5 ? LANE : -LANE);
    car.dir = carRand() < 0.5 ? 1 : -1;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

function carAheadBlocked(car) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const o of S.cars) {
    if (o === car || o.hp <= 0) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    const along = dx * fx + dy * fy;
    const across = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < 70 && across < 20) return true;
  }
  return false;
}

// ---- car-vs-car collisions (simple circle push + damage) --------------------
export function resolveCarCollisions() {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minD = (carLength(a) + carLength(b)) / 2 * 0.85;
      if (d > 0 && d < minD) {
        const push = (minD - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 140) {
          damageCar(a, rel * 0.03, null);
          damageCar(b, rel * 0.03, null);
          const av = (a.speed + b.speed) / 2;
          a.speed = av; b.speed = av;
          S.shake = Math.max(S.shake, 2);
        }
      }
    }
  }
}

// ---- traffic population -----------------------------------------------------
export function spawnTraffic(count) {
  const types = ['sedan', 'taxi', 'van', 'sedan', 'truck', 'sedan'];
  for (let i = 0; i < count; i += 1) {
    const vertical = carRand() < 0.5;
    if (vertical) {
      const vx = pick(carRand, ROADS_V);
      const dir = carRand() < 0.5 ? 1 : -1;
      const y = 100 + carRand() * (WORLD_H - 200);
      const car = createCar(pick(carRand, types), vx + (dir > 0 ? LANE : -LANE), y, dir > 0 ? Math.PI / 2 : -Math.PI / 2, { ai: 'traffic' });
      car.roadAxis = 'v'; car.roadLine = vx; car.dir = dir;
      car.speed = car.cruise;
    } else {
      const hy = pick(carRand, ROADS_H);
      const dir = carRand() < 0.5 ? 1 : -1;
      const x = 400 + carRand() * (WORLD_W - 500);
      const car = createCar(pick(carRand, types), x, hy + (dir > 0 ? LANE : -LANE), dir > 0 ? 0 : Math.PI, { ai: 'traffic' });
      car.roadAxis = 'h'; car.roadLine = hy; car.dir = dir;
      car.speed = car.cruise;
    }
  }
}

export function spawnParked(count) {
  const spots = [...CITY.parkingSpots];
  for (let i = 0; i < Math.min(count, spots.length); i += 1) {
    const s = spots[i];
    createCar(s.type, s.x, s.y, s.angle, { ai: null, parked: true });
  }
}

// ---- drawing ---------------------------------------------------------------
export function drawCar(ctx, car) {
  const len = carLength(car), wid = carWidth(car);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(3, 5, len / 2 + 2, wid / 2 + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.hp <= 0 ? '#22222a' : car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.fill();
  // Roof / cabin.
  ctx.fillStyle = car.hp <= 0 ? '#1a1a20' : shade(car.color, -18);
  roundRect(ctx, -len / 4, -wid / 2 + 3, len / 2, wid - 6, 5);
  ctx.fill();
  // Windshield.
  ctx.fillStyle = '#bfe8f2';
  ctx.fillRect(len / 4 - 2, -wid / 2 + 4, 4, wid - 8);
  ctx.fillRect(-len / 4 - 2, -wid / 2 + 4, 4, wid - 8);
  // Wheels.
  ctx.fillStyle = '#14141a';
  ctx.fillRect(-len / 2 + 4, -wid / 2 - 2, 10, 4);
  ctx.fillRect(-len / 2 + 4, wid / 2 - 2, 10, 4);
  ctx.fillRect(len / 2 - 14, -wid / 2 - 2, 10, 4);
  ctx.fillRect(len / 2 - 14, wid / 2 - 2, 10, 4);
  // Police livery.
  if (car.type === 'police') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-6, -wid / 2, 12, wid);
    ctx.fillStyle = '#c22a2a';
    ctx.fillRect(-len / 2 + 6, -wid / 2 + 3, 8, 4);
    ctx.fillStyle = '#2a6ac2';
    ctx.fillRect(-len / 2 + 6, wid / 2 - 7, 8, 4);
    // Light bar flash (alternates with time).
    const on = Math.floor(S.time * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff2a2a' : '#2a6aff';
    ctx.beginPath();
    ctx.arc(0, -wid / 2 + 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? '#2a6aff' : '#ff2a2a';
    ctx.beginPath();
    ctx.arc(0, wid / 2 - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Taxi sign.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#ffd21e';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('T', 0, 2);
  }
  // Damage smoke.
  if (car.smoke) {
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    ctx.beginPath();
    ctx.arc(-len / 4, -wid / 2, 6 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Headlight glow at dusk when moving fast.
  if (car.speed > 60 && car.hp > 0) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const grad = ctx.createRadialGradient(len / 2, 0, 2, len / 2, 0, 90);
    grad.addColorStop(0, 'rgba(255,240,180,0.28)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(len / 2, -8);
    ctx.lineTo(len / 2 + 90, -26);
    ctx.lineTo(len / 2 + 90, 26);
    ctx.lineTo(len / 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}
