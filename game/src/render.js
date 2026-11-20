// Drawing only: the city, the entities and the screens. Golden-hour light,
// long shadows to the east, a sun-bleached coast on the west edge.
import { S } from './state.js';
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_HALF, PAL, FONT } from './config.js';
import { clamp, dist } from './utils.js';
import { CITY, districtAt } from './city.js';
import { drawCar } from './cars.js';
import { drawPed } from './peds.js';
import { drawCop } from './police.js';
import { drawThug } from './combat.js';
import { drawHUD } from './hud.js';
import { activeMarker } from './missions.js';

export function drawWorld(ctx) {
  const cam = S.camera;
  const left = cam.x - VIEW_W / 2;
  const top = cam.y - VIEW_H / 2;
  ctx.save();
  // Sky beyond the world edge (sunset gradient).
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#ff9a5a');
  sky.addColorStop(0.55, '#ff7a6a');
  sky.addColorStop(1, '#7a4a8a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.translate(-left, -top);
  if (S.shake > 0) {
    ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  }
  drawGround(ctx, left, top);
  drawRoads(ctx);
  drawBuildings(ctx);
  drawProps(ctx);
  drawPickups(ctx);
  drawMissionBeacon(ctx);
  for (const car of S.cars) drawCar(ctx, car);
  for (const p of S.peds) drawPed(ctx, p);
  for (const c of S.cops) drawCop(ctx, c);
  for (const t of S.thugs) drawThug(ctx, t);
  drawPlayer(ctx);
  drawBullets(ctx);
  drawParticles(ctx);
  drawFloaters(ctx);
  ctx.restore();
  // Day phase: the light drifts slowly between golden hour and dusk on a
  // four-minute cycle — warm while the sun is up, a cool violet as it sets.
  // Kept faint (<=5%) so it never fights readability; the HUD is drawn after
  // this and stays untinted.
  const ph = Math.sin(S.time * Math.PI * 2 / 240);
  ctx.fillStyle = ph >= 0
    ? `rgba(255,150,60,${(ph * 0.05).toFixed(3)})`
    : `rgba(70,50,140,${(-ph * 0.04).toFixed(3)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // District name flash when the camera crosses into a new district is drawn by the HUD.
}

function drawGround(ctx, left, top) {
  // Base ground.
  ctx.fillStyle = PAL.ground;
  ctx.fillRect(-40, -40, WORLD_W + 80, WORLD_H + 80);
  // Sea (west) and sand strip.
  ctx.fillStyle = PAL.seaDeep;
  ctx.fillRect(-40, -40, 220, WORLD_H + 80);
  ctx.fillStyle = PAL.sea;
  ctx.fillRect(0, -40, 220, WORLD_H + 80);
  // Shoreline waves.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let y = 0; y < WORLD_H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(214, y + Math.sin(S.time * 1.2 + y * 0.01) * 4);
    ctx.quadraticCurveTo(226, y + 20, 214, y + 44);
    ctx.stroke();
  }
  ctx.fillStyle = PAL.sand;
  ctx.fillRect(220, -40, 100, WORLD_H + 80);
  // Water shimmer: light streaks drifting on the sea, each pulsing on its
  // own phase so the surface never looks frozen.
  ctx.lineWidth = 2;
  for (const s of CITY.seaSparkles) {
    const a = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(S.time * s.speed + s.phase));
    ctx.strokeStyle = `rgba(255,240,200,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + Math.sin(S.time * 0.7 + s.phase) * 3);
    ctx.lineTo(s.x + s.len, s.y + Math.sin(S.time * 0.7 + s.phase) * 3);
    ctx.stroke();
  }
  // Block ground: grass tufts and speckles so the lots are not flat paper.
  for (const t of CITY.grassTufts) {
    ctx.fillStyle = 'rgba(90,120,70,0.5)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, t.r, t.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const d of CITY.groundDots) {
    ctx.fillStyle = d.shade;
    ctx.fillRect(d.x, d.y, d.s, d.s);
  }
}

function drawRoads(ctx) {
  for (const vx of ROADS_V) {
    ctx.fillStyle = PAL.road;
    ctx.fillRect(vx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
    ctx.fillStyle = PAL.sidewalk;
    ctx.fillRect(vx - ROAD_HALF - 24, 0, 24, WORLD_H);
    ctx.fillRect(vx + ROAD_HALF, 0, 24, WORLD_H);
    // Centre dashes.
    ctx.fillStyle = PAL.lane;
    for (let y = 0; y < WORLD_H; y += 64) ctx.fillRect(vx - 2, y, 4, 32);
  }
  for (const hy of ROADS_H) {
    ctx.fillStyle = PAL.road;
    ctx.fillRect(320, hy - ROAD_HALF, WORLD_W - 320, ROAD_HALF * 2);
    ctx.fillStyle = PAL.sidewalk;
    ctx.fillRect(320, hy - ROAD_HALF - 24, WORLD_W - 320, 24);
    ctx.fillRect(320, hy + ROAD_HALF, WORLD_W - 320, 24);
    ctx.fillStyle = PAL.lane;
    for (let x = 320; x < WORLD_W; x += 64) ctx.fillRect(x, hy - 2, 32, 4);
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = PAL.crosswalk;
  for (const vx of ROADS_V) {
    for (const hy of ROADS_H) {
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(vx - 22 + i * 7, hy - ROAD_HALF - 22, 4, 20);
        ctx.fillRect(vx - 22 + i * 7, hy + ROAD_HALF + 2, 4, 20);
      }
    }
  }
  // District labels painted on the ground.
  ctx.save();
  ctx.font = `bold 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(242,234,216,0.16)';
  ctx.fillText('MARINA BAY', 210, 1300);
  ctx.fillText('DOWNTOWN', 1700, 700);
  ctx.fillText('HARBOR EAST', 2850, 700);
  ctx.fillText('SUNSET STRIP', 1700, 2300);
  ctx.restore();
}

function drawBuildings(ctx) {
  for (const b of CITY.buildings) {
    // Long golden-hour shadow to the east.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 18, b.y + 12, b.w, b.h);
    // Wall (side face) and roof.
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h - 6);
    // Sunlit west edge, shaded east edge: the low sun reads as depth.
    ctx.fillStyle = 'rgba(255,230,170,0.28)';
    ctx.fillRect(b.x, b.y, 4, b.h - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + b.w - 4, b.y, 4, b.h - 6);
    // Roof detail: parapet + vents + skylight.
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 14);
    for (const v of b.vents || []) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(v.x, v.y, v.w, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.2, b.h * 0.25);
    // Lit windows on the south face.
    if (b.lit) {
      ctx.fillStyle = PAL.windowLit;
      const cols = Math.floor(b.w / 26);
      for (let i = 0; i < cols; i += 1) {
        if ((i * 7 + b.id * 3) % 3 !== 0) continue;
        ctx.fillRect(b.x + 10 + i * 26, b.y + b.h - 5, 12, 4);
      }
    }
    // Tall towers get a second storey block.
    if (b.tall) {
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x + b.w * 0.25, b.y - 16, b.w * 0.5, 16);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + b.w * 0.25, b.y - 16, b.w * 0.5, 10);
    }
    // Landmark towers: three-tier setback with a blinking beacon.
    if (b.landmark) {
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x + b.w * 0.2, b.y - 28, b.w * 0.6, 28);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + b.w * 0.2, b.y - 28, b.w * 0.6, 22);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x + b.w * 0.35, b.y - 40, b.w * 0.3, 14);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + b.w * 0.35, b.y - 40, b.w * 0.3, 10);
      const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(S.time * 3));
      ctx.fillStyle = `rgba(255,60,60,${blink.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(b.x + b.w * 0.5, b.y - 42, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Striped awning over the door on the south face.
    if (b.awning) {
      const ax = b.x + b.w * b.awnX, aw = b.w * b.awnW, ay = b.y + b.h - 2;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ax + 2, ay + 2, aw, 9);
      for (let i = 0; i < 5; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(240,235,220,0.9)' : 'rgba(180,60,50,0.9)';
        ctx.fillRect(ax + (aw / 5) * i, ay, aw / 5, 8);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(ax, ay + 8, aw, 2);
    }
  }
}

function drawProps(ctx) {
  for (const pr of CITY.props) {
    if (pr.kind === 'palm') {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(pr.x + 12, pr.y + 4, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.palmTrunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.quadraticCurveTo(pr.x + 6, pr.y - 16, pr.x + 12, pr.y - 24);
      ctx.stroke();
      ctx.fillStyle = PAL.palm;
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        ctx.beginPath();
        ctx.ellipse(pr.x + 12 + Math.cos(a) * 12, pr.y - 24 + Math.sin(a) * 8, 12, 3.5, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pr.kind === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(pr.x + 6, pr.y + 6, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f6b3a';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y - 6, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a8a4a';
      ctx.beginPath();
      ctx.arc(pr.x - 4, pr.y - 10, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === 'lamp') {
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(pr.x - 1, pr.y - 14, 2, 14);
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y - 15, 3.5, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(pr.x, pr.y - 15, 2, pr.x, pr.y - 15, 26);
      g.addColorStop(0, 'rgba(255,220,140,0.25)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y - 15, 26, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === 'crate') {
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(pr.x - 8, pr.y - 8, 16, 16);
      ctx.strokeStyle = '#5a4426';
      ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - 8, pr.y - 8, 16, 16);
      ctx.beginPath();
      ctx.moveTo(pr.x - 8, pr.y - 8);
      ctx.lineTo(pr.x + 8, pr.y + 8);
      ctx.stroke();
    } else if (pr.kind === 'hydrant') {
      ctx.fillStyle = '#c22a2a';
      ctx.fillRect(pr.x - 4, pr.y - 6, 8, 12);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(pr.x - 4, pr.y - 8, 8, 3);
    } else if (pr.kind === 'bench') {
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(pr.x - 14, pr.y - 4, 28, 5);
      ctx.fillRect(pr.x - 12, pr.y + 2, 3, 6);
      ctx.fillRect(pr.x + 9, pr.y + 2, 3, 6);
    }
  }
}

function drawPickups(ctx) {
  for (const pk of S.pickups) {
    const bob = Math.sin(S.time * 4 + pk.bob) * 2;
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2a8a3a';
      ctx.fillRect(pk.x - 9, pk.y - 5 + bob, 18, 10);
      ctx.fillStyle = '#ffd21e';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', pk.x, pk.y + 3 + bob);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(pk.x - 9, pk.y - 9 + bob, 18, 18);
      ctx.fillStyle = '#e83a2a';
      ctx.fillRect(pk.x - 2, pk.y - 6 + bob, 4, 12);
      ctx.fillRect(pk.x - 6, pk.y - 2 + bob, 12, 4);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#c9a13a';
      ctx.fillRect(pk.x - 8, pk.y - 4 + bob, 16, 8);
      ctx.fillStyle = '#5a4a1a';
      ctx.fillRect(pk.x - 8, pk.y - 4 + bob, 4, 8);
    }
  }
}

function drawMissionBeacon(ctx) {
  const m = activeMarker();
  if (!m) return;
  const pulse = 1 + Math.sin(S.time * 4) * 0.15;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,30,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 30 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(m.x, m.y, 14 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  // Light beam.
  const g = ctx.createLinearGradient(m.x, m.y - 120, m.x, m.y);
  g.addColorStop(0, 'rgba(255,210,30,0)');
  g.addColorStop(1, 'rgba(255,210,30,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(m.x - 8, m.y - 120, 16, 120);
  ctx.fillStyle = '#ffd21e';
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(m.label, m.x, m.y - 40);
  ctx.restore();
}

function drawPlayer(ctx) {
  const p = S.player;
  if (!p || !p.onFoot) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.invuln > 0 && Math.floor(S.time * 12) % 2 === 0) ctx.globalAlpha = 0.4;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 8, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle + Math.PI / 2);
  // Legs (walk cycle).
  const step = p.moving ? Math.sin(S.time * 14) * 3 : 0;
  ctx.fillStyle = '#2a2f3a';
  ctx.fillRect(-5, -2 + step, 4, 11);
  ctx.fillRect(1, -2 - step, 4, 11);
  // Jacket.
  ctx.fillStyle = PAL.playerJacket;
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // Head + hair.
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(0, -10, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.arc(0, -11, 5, Math.PI, 0);
  ctx.fill();
  // Pistol in the aim direction (forward is up after rotation).
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(5, -16, 2.5, 12);
  ctx.restore();
}

function drawBullets(ctx) {
  for (const b of S.bullets) {
    ctx.strokeStyle = 'rgba(255,240,160,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(ctx) {
  for (const pt of S.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    if (pt.kind === 'flash') {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * a, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx) {
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  for (const f of S.floaters) {
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---- screens ---------------------------------------------------------------
function panel(ctx, title, lines, prompt, accent) {
  const w = 640;
  const h = 150 + lines.length * 30 + 60;
  const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  ctx.fillStyle = 'rgba(8,10,16,0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = accent || '#ffd21e';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#ffd21e';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(title, VIEW_W / 2, y + 62);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#f2ead8';
  lines.forEach((ln, i) => ctx.fillText(ln, VIEW_W / 2, y + 108 + i * 30));
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillStyle = '#ffd21e';
  ctx.fillText(prompt, VIEW_W / 2, y + h - 26);
}

export function drawTitle(ctx, hasSave) {
  // The world behind the title (a slow pan over the city) is drawn by the caller.
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(20,8,20,0.25)');
  grad.addColorStop(1, 'rgba(20,8,20,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd21e';
  ctx.font = `bold 74px ${FONT}`;
  ctx.fillText('SUNFALL CITY', VIEW_W / 2, 150);
  ctx.font = `italic 20px ${FONT}`;
  ctx.fillStyle = '#f2ead8';
  ctx.fillText('An open-world crime story at golden hour', VIEW_W / 2, 186);
  panel(ctx, '', [
    'Rook came to Sunfall City with nothing but a stolen jacket and a debt.',
    'Marisol Vega has work for a driver who asks no questions.',
    'Steal cars. Lose the heat. Get paid. Survive the sunset.',
    '',
    'WASD / Arrows — move & drive    •    Mouse — aim, click — shoot',
    'E — enter / exit car    •    F — melee    •    R — reload    •    M — take a job',
    'Shift — run    •    Space — handbrake    •    P — pause    •    N — mute',
  ], hasSave ? 'ENTER — New Game      •      C — Continue (saved game)' : 'Press ENTER or click to start', '#ffd21e');
}

export function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(8,10,16,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 'PAUSED', ['The city waits. The heat does not forget.'], 'Press P to resume', '#f2ead8');
}

export function drawBusted(ctx) {
  ctx.fillStyle = 'rgba(10,10,30,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const fine = Math.min(300, Math.floor(S.money * 0.25));
  panel(ctx, 'BUSTED', [
    'The Sunfall PD dragged you out of the car.',
    `Bail and "processing fees" cost you $${fine}. The heat is off — for now.`,
  ], 'Press ENTER to get back on the street', '#4a8aff');
}

export function drawWasted(ctx) {
  ctx.fillStyle = 'rgba(30,8,8,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const lost = Math.min(200, Math.floor(S.money * 0.15));
  panel(ctx, 'WASTED', [
    'You wake up in St. Aurelia Hospital, patched up and lighter.',
    `The hospital bill cost you $${lost}. Marisol is not impressed.`,
  ], 'Press ENTER to get back on the street', '#ff5a4a');
}

export function drawStory(ctx) {
  ctx.fillStyle = 'rgba(20,14,4,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 'SUNFALL IS YOURS', [
    'Four jobs. One clean getaway. Marisol paid in full.',
    `You earned $${S.money.toLocaleString('en-US')} across ${S.stats.missionsDone} jobs,`,
    `stole ${S.stats.carsStolen} cars and drove ${Math.round(S.stats.distance / 1000)} km of city.`,
    'The sun is down. The city is yours. Keep driving.',
  ], 'Press ENTER to keep playing — free roam', '#ffd21e');
}
