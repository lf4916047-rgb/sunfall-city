// HUD: health, cash, wanted stars, objective, minimap, speed, weapon,
// dialogue box and banners — all drawn in screen space over the world.
import { S } from './state.js';
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROADS_V, ROADS_H, PAL, FONT } from './config.js';
import { fmtMoney, fmtTime, clamp } from './utils.js';
import { districtAt } from './city.js';

const MM_W = 210, MM_H = 160;
const MM_X = 14, MM_Y = VIEW_H - MM_H - 14;

export function drawHUD(ctx) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  drawTopLeft(ctx);
  drawTopRight(ctx);
  drawObjective(ctx);
  drawMinimap(ctx);
  drawBottomRight(ctx);
  drawDialogue(ctx);
  drawBanner(ctx);
  if (S.flash > 0) {
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
    g.addColorStop(0, 'rgba(255,30,20,0)');
    g.addColorStop(1, `rgba(255,30,20,${0.45 * S.flash})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}

function drawTopLeft(ctx) {
  const p = S.player;
  const x = 14, y = 14;
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, y - 2, 224, 26);
  ctx.fillStyle = '#20242c';
  ctx.fillRect(x, y, 200, 12);
  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = hpFrac > 0.5 ? '#4ac25a' : hpFrac > 0.25 ? '#e8a13a' : '#e83a2a';
  ctx.fillRect(x, y, 200 * hpFrac, 12);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(Math.ceil(p.hp) + '', x + 206, y + 11);
  // Cash + district.
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillStyle = '#ffd21e';
  ctx.fillText(fmtMoney(S.money), x, y + 40);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = 'rgba(242,234,216,0.85)';
  ctx.fillText(districtAt(p.x, p.y) + '  •  ' + fmtTime(S.elapsed), x, y + 58);
}

function drawTopRight(ctx) {
  const x = VIEW_W - 14;
  // Wanted stars.
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'right';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < S.wanted ? '★' : '☆';
  ctx.fillStyle = S.wanted > 0 ? '#ffd21e' : 'rgba(242,234,216,0.4)';
  ctx.fillText(stars, x, 36);
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = 'rgba(242,234,216,0.7)';
  ctx.fillText(S.wanted > 0 ? 'WANTED' : 'CLEAN', x, 54);
  if (S.muted) ctx.fillText('MUTED (N)', x, 70);
}

function drawObjective(ctx) {
  const obj = S.mission ? S.objective : (S.missionIdx < 4 ? 'Press M — a job from Marisol is waiting' : 'Free roam — Sunfall City is yours');
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'center';
  const w = ctx.measureText(obj).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(VIEW_W / 2 - w / 2, 12, w, 26);
  ctx.fillStyle = S.mission ? '#ffd21e' : '#f2ead8';
  ctx.fillText(obj, VIEW_W / 2, 30);
  // Mission timer.
  if (S.mission && S.mission.timer > 0) {
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = S.mission.timer < 15 ? '#ff5a4a' : '#f2ead8';
    ctx.fillText(fmtTime(S.mission.timer), VIEW_W / 2, 58);
  }
}

function drawMinimap(ctx) {
  const sx = MM_W / WORLD_W, sy = MM_H / WORLD_H;
  ctx.fillStyle = 'rgba(10,12,18,0.78)';
  ctx.fillRect(MM_X - 4, MM_Y - 4, MM_W + 8, MM_H + 8);
  ctx.strokeStyle = 'rgba(242,234,216,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(MM_X - 4, MM_Y - 4, MM_W + 8, MM_H + 8);
  // Sea + sand (west edge).
  ctx.fillStyle = '#1f5f7d';
  ctx.fillRect(MM_X, MM_Y, 220 * sx, MM_H);
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(MM_X + 220 * sx, MM_Y, 100 * sx, MM_H);
  // Roads.
  ctx.strokeStyle = '#5a5a66';
  ctx.lineWidth = 2;
  for (const vx of ROADS_V) {
    ctx.beginPath();
    ctx.moveTo(MM_X + vx * sx, MM_Y);
    ctx.lineTo(MM_X + vx * sx, MM_Y + MM_H);
    ctx.stroke();
  }
  for (const hy of ROADS_H) {
    ctx.beginPath();
    ctx.moveTo(MM_X, MM_Y + hy * sy);
    ctx.lineTo(MM_X + MM_W, MM_Y + hy * sy);
    ctx.stroke();
  }
  // Mission marker.
  if (S.mission && S.mission.marker) {
    const mx = MM_X + S.mission.marker.x * sx;
    const my = MM_Y + S.mission.marker.y * sy;
    const pulse = 5 + Math.sin(S.time * 5) * 2;
    ctx.fillStyle = '#ffd21e';
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.restore();
  }
  // Thugs.
  for (const t of S.thugs) {
    if (t.hp <= 0) continue;
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(MM_X + t.x * sx - 2, MM_Y + t.y * sy - 2, 4, 4);
  }
  // Traffic.
  for (const c of S.cars) {
    if (c.hp <= 0) continue;
    if (c.ai === 'police') continue;
    ctx.fillStyle = 'rgba(255,220,120,0.85)';
    ctx.fillRect(MM_X + c.x * sx - 1.5, MM_Y + c.y * sy - 1.5, 3, 3);
  }
  // Police.
  for (const c of S.cars) {
    if (c.ai !== 'police' || c.hp <= 0) continue;
    ctx.fillStyle = '#4a8aff';
    ctx.beginPath();
    ctx.arc(MM_X + c.x * sx, MM_Y + c.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of S.cops) {
    ctx.fillStyle = '#4a8aff';
    ctx.fillRect(MM_X + cop.x * sx - 2, MM_Y + cop.y * sy - 2, 4, 4);
  }
  // Player arrow.
  const p = S.player;
  const px = MM_X + p.x * sx, py = MM_Y + p.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // View rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(MM_X + (S.camera.x - VIEW_W / 2) * sx, MM_Y + (S.camera.y - VIEW_H / 2) * sy, VIEW_W * sx, VIEW_H * sy);
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillStyle = 'rgba(242,234,216,0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('SUNFALL CITY', MM_X, MM_Y - 6);
}

function drawBottomRight(ctx) {
  const p = S.player;
  const x = VIEW_W - 14;
  ctx.textAlign = 'right';
  if (p.inCar) {
    const car = p.inCar;
    const mph = Math.round(Math.abs(car.speed) * 0.14);
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = '#f2ead8';
    ctx.fillText(mph + '', x, VIEW_H - 44);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(242,234,216,0.75)';
    ctx.fillText('MPH  •  ' + car.name.toUpperCase(), x, VIEW_H - 24);
    // Car health.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 122, VIEW_H - 18, 122, 6);
    ctx.fillStyle = '#4ac25a';
    ctx.fillRect(x - 122, VIEW_H - 18, 122 * clamp(car.hp / car.maxHp, 0, 1), 6);
  } else {
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = '#f2ead8';
    const ammoText = p.ammo === Infinity ? '∞' : `${p.ammo} / ${p.reserve}`;
    ctx.fillText('PISTOL  ' + ammoText, x, VIEW_H - 44);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(242,234,216,0.75)';
    ctx.fillText(p.reloading > 0 ? 'RELOADING…' : 'LMB shoot  •  F melee  •  E enter car', x, VIEW_H - 24);
  }
}

function drawDialogue(ctx) {
  const now = S.time;
  const lines = S.dialogue.filter((d) => d.until > now);
  if (lines.length === 0) return;
  const boxW = 640, boxH = 26 * lines.length + 14;
  const x = (VIEW_W - boxW) / 2, y = VIEW_H - MM_H - 14 - boxH - 12;
  ctx.fillStyle = 'rgba(8,10,16,0.78)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = 'rgba(255,210,30,0.5)';
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.textAlign = 'left';
  lines.forEach((d, i) => {
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = '#ffd21e';
    ctx.fillText(d.who + ': ', x + 12, y + 22 + i * 26);
    const w = ctx.measureText(d.who + ': ').width;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#f2ead8';
    ctx.fillText(d.text, x + 12 + w, y + 22 + i * 26);
  });
}

function drawBanner(ctx) {
  if (!S.banner || S.banner.until < S.time) return;
  ctx.textAlign = 'center';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = ctx.measureText(S.banner.text).width + 40;
  ctx.fillRect(VIEW_W / 2 - w / 2, VIEW_H / 2 - 92, w, 46);
  ctx.fillStyle = '#ffd21e';
  ctx.fillText(S.banner.text, VIEW_W / 2, VIEW_H / 2 - 58);
  if (S.banner.sub) {
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = '#f2ead8';
    ctx.fillText(S.banner.sub, VIEW_W / 2, VIEW_H / 2 - 30);
  }
  // Centre message line (transient, e.g. WANTED).
  if (S.message && S.messageUntil > S.time) {
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = '#ff6a4a';
    ctx.fillText(S.message, VIEW_W / 2, VIEW_H / 2 + 10);
  }
}
