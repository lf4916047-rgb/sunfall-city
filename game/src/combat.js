// Combat: the player's pistol and fists, enemy bullets, mission thugs,
// muzzle flashes, tracers, hit sparks and damage floaters.
import { S } from './state.js';
import { WEAPONS } from './config.js';
import { clamp, dist, angleTo, turnToward, pick } from './utils.js';
import { collideBuildings, clampToWorld, inBuilding } from './city.js';
import { scarePeds } from './peds.js';
import { addWanted } from './police.js';
import { sfx } from './audio.js';

let combatRng = 777;
function crand() {
  combatRng = (combatRng * 1103515245 + 12345) & 0x7fffffff;
  return combatRng / 0x7fffffff;
}

export function firePistol(fromX, fromY, angle, from) {
  const w = WEAPONS.pistol;
  const spread = (crand() - 0.5) * 2 * w.spread;
  S.bullets.push({
    x: fromX + Math.cos(angle) * 18,
    y: fromY + Math.sin(angle) * 18,
    angle: angle + spread,
    speed: w.bulletSpeed,
    damage: w.damage,
    range: w.range,
    from,
    life: w.range / w.bulletSpeed,
  });
  // Muzzle flash.
  S.particles.push({
    x: fromX + Math.cos(angle) * 22, y: fromY + Math.sin(angle) * 22,
    vx: 0, vy: 0, life: 0.06, maxLife: 0.06, size: 10, color: '#ffd21e', kind: 'flash',
  });
  if (from === 'player') {
    S.stats.shotsFired += 1;
    sfx.shoot();
    scarePeds(fromX, fromY, 320);
    if (S.wanted === 0) addWanted(1, 'Shots fired');
    else { S.lastCrimeAt = S.time; S.wantedHeat = 1; }
  } else {
    sfx.enemyShoot();
  }
}

export function meleeSwing(fromX, fromY, angle) {
  const w = WEAPONS.fists;
  let hitAny = false;
  for (const t of S.thugs) {
    if (t.hp > 0 && dist(fromX, fromY, t.x, t.y) < w.range + 10) {
      damageThug(t, w.damage);
      hitAny = true;
    }
  }
  for (const c of S.cops) {
    if (c.hp > 0 && dist(fromX, fromY, c.x, c.y) < w.range + 10) {
      c.hp -= w.damage;
      hitAny = true;
      addWanted(1, 'Assaulted an officer');
    }
  }
  for (const p of S.peds) {
    if (p.state !== 'down' && dist(fromX, fromY, p.x, p.y) < w.range + 8) {
      // Punching a civilian is a crime — they go down and the heat rises.
      p.state = 'down';
      p.downTimer = 8;
      hitAny = true;
      addWanted(1, 'Assault');
      scarePeds(fromX, fromY, 300);
    }
  }
  if (hitAny) sfx.thud();
  // Swing arc particle.
  S.particles.push({
    x: fromX + Math.cos(angle) * 24, y: fromY + Math.sin(angle) * 24,
    vx: 0, vy: 0, life: 0.12, maxLife: 0.12, size: 16, color: 'rgba(255,255,255,0.7)', kind: 'flash',
  });
}

export function spawnThugs(x, y, count) {
  const thugs = [];
  for (let i = 0; i < count; i += 1) {
    const t = {
      x: x + (crand() - 0.5) * 120,
      y: y + (crand() - 0.5) * 120,
      angle: crand() * Math.PI * 2,
      hp: 60, maxHp: 60,
      speed: 150,
      fireCooldown: 0.5 + crand(),
      state: 'guard',
      color: pick(crand, ['#3a2a4a', '#4a2a2a', '#2a3a4a']),
    };
    S.thugs.push(t);
    thugs.push(t);
  }
  return thugs;
}

export function damageThug(t, amount) {
  if (t.hp <= 0) return;
  t.hp -= amount;
  S.floaters.push({ x: t.x, y: t.y - 14, text: String(Math.round(amount)), life: 0.7, maxLife: 0.7, color: '#ffd21e' });
  if (t.hp <= 0) {
    t.hp = 0;
    t.deadAt = S.time;
    S.stats.kills += 1;
    // Drop cash.
    S.pickups.push({ kind: 'cash', x: t.x, y: t.y, amount: 40 + Math.floor(crand() * 60), bob: 0 });
    for (let i = 0; i < 10; i += 1) {
      S.particles.push({
        x: t.x, y: t.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
        life: 0.5, maxLife: 0.5, size: 3, color: '#ff5a4a', kind: 'spark',
      });
    }
  }
}

export function updateThugs(dt) {
  const p = S.player;
  for (const t of S.thugs) {
    if (t.hp <= 0) continue;
    const d = dist(t.x, t.y, p.x, p.y);
    const wantAngle = angleTo(t.x, t.y, p.x, p.y);
    t.angle = turnToward(t.angle, wantAngle, 5 * dt);
    // Keep a shooting distance; close in if too far, back off if too close.
    let move = 0;
    if (d > 320) move = 1;
    else if (d < 160) move = -0.6;
    if (move !== 0) {
      t.x += Math.cos(t.angle) * t.speed * move * dt;
      t.y += Math.sin(t.angle) * t.speed * move * dt;
      collideBuildings(t, 10);
      clampToWorld(t, 16);
    }
    t.fireCooldown -= dt;
    if (d < 460 && t.fireCooldown <= 0 && p.hp > 0) {
      t.fireCooldown = 1.1 + crand() * 0.9;
      firePistol(t.x, t.y, wantAngle + (crand() - 0.5) * 0.16, 'thug');
    }
  }
  S.thugs = S.thugs.filter((t) => t.hp > 0 || S.time - (t.deadAt || 0) < 3);
}

export function updateBullets(dt) {
  const p = S.player;
  for (const b of S.bullets) {
    b.life -= dt;
    const step = b.speed * dt;
    const nx = b.x + Math.cos(b.angle) * step;
    const ny = b.y + Math.sin(b.angle) * step;
    // Hit a building?
    if (inBuilding(nx, ny)) {
      b.life = 0;
      spark(nx, ny, '#d8c88a');
      continue;
    }
    b.x = nx; b.y = ny;
    // Hit the player (enemy bullets only).
    if (b.from !== 'player' && p && p.hp > 0 && p.onFoot && dist(b.x, b.y, p.x, p.y) < 12) {
      b.life = 0;
      hurtPlayer(b.damage);
      spark(b.x, b.y, '#ff5a4a');
      continue;
    }
    if (b.from !== 'player' && p && p.inCar && dist(b.x, b.y, p.inCar.x, p.inCar.y) < 24) {
      b.life = 0;
      p.inCar.hp -= b.damage * 0.4;
      spark(b.x, b.y, '#ffd21e');
      continue;
    }
    // Hit a thug / cop / ped (player bullets only).
    if (b.from === 'player') {
      let consumed = false;
      for (const t of S.thugs) {
        if (t.hp > 0 && dist(b.x, b.y, t.x, t.y) < 13) {
          damageThug(t, b.damage);
          b.life = 0; consumed = true; spark(b.x, b.y, '#ff5a4a');
          break;
        }
      }
      if (!consumed) {
        for (const c of S.cops) {
          if (c.hp > 0 && dist(b.x, b.y, c.x, c.y) < 13) {
            c.hp -= b.damage;
            if (c.hp <= 0) { S.stats.kills += 1; addWanted(1, 'Officer down'); }
            b.life = 0; consumed = true; spark(b.x, b.y, '#ff5a4a');
            break;
          }
        }
      }
      if (!consumed) {
        for (const pd of S.peds) {
          if (pd.state !== 'down' && dist(b.x, b.y, pd.x, pd.y) < 11) {
            pd.state = 'down';
            pd.downTimer = 9;
            b.life = 0; consumed = true;
            addWanted(1, 'Civilian hit');
            scarePeds(b.x, b.y, 320);
            spark(b.x, b.y, '#ff5a4a');
            break;
          }
        }
      }
      if (!consumed) {
        // Hit a car.
        for (const car of S.cars) {
          if (car.hp <= 0) continue;
          const dx = b.x - car.x, dy = b.y - car.y;
          const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
          const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
          if (along < 26 && across < 15) {
            car.hp -= b.damage * 0.5;
            b.life = 0; consumed = true;
            spark(b.x, b.y, '#ffd21e');
            if (car.hp <= 0) { /* explodeCar handled in damageCar path */ }
            break;
          }
        }
      }
    }
  }
  S.bullets = S.bullets.filter((b) => b.life > 0);
}

export function hurtPlayer(amount) {
  const p = S.player;
  if (!p || p.hp <= 0 || p.invuln > 0) return;
  p.hp -= amount;
  p.invuln = 0.25;
  S.flash = Math.max(S.flash, 0.45);
  sfx.hit();
  if (p.hp <= 0) {
    p.hp = 0;
    S.screen = 'wasted';
  }
}

export function spark(x, y, color) {
  for (let i = 0; i < 5; i += 1) {
    S.particles.push({
      x, y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180,
      life: 0.25, maxLife: 0.25, size: 2.5, color, kind: 'spark',
    });
  }
}

export function updateParticles(dt) {
  for (const pt of S.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
  }
  S.particles = S.particles.filter((pt) => pt.life > 0);
  for (const f of S.floaters) {
    f.life -= dt;
    f.y -= 30 * dt;
  }
  S.floaters = S.floaters.filter((f) => f.life > 0);
}

export function drawThug(ctx, t) {
  if (t.hp <= 0) {
    // Fallen: lying flat, fading out.
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, 1 - (S.time - (t.deadAt || S.time)) / 3);
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle + Math.PI / 2);
    ctx.fillStyle = t.color;
    ctx.fillRect(-11, -4, 22, 8);
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(13, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 7, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-4, -2, 3, 10);
  ctx.fillRect(1, -2, 3, 10);
  ctx.fillStyle = t.color;
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Gun in hand.
  ctx.fillStyle = '#222';
  ctx.fillRect(4, -12, 2, 10);
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(0, -9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // Bandana.
  ctx.fillStyle = '#c22a2a';
  ctx.fillRect(-4.5, -11, 9, 2.5);
  ctx.restore();
  if (t.hp < t.maxHp) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(t.x - 14, t.y - 22, 28, 4);
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(t.x - 14, t.y - 22, 28 * (t.hp / t.maxHp), 4);
  }
}
