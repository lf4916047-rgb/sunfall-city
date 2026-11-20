// Sunfall City — boot, the one loop, the screen machine, and the player.
// Fixed 1/60 s steps; the renderer paints the world at 1280x720 and scales.
//
// ?shot=title|drive|chase|mission|coast stages a scene instead of the title
// screen, paints it twice and sets window.__shotReady for screenshots.
// window.__sunfall exposes the live state for playtesting.
import { S, resetRun, newPlayer } from './state.js';
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, WEAPONS } from './config.js';
import { clamp, dist, angleTo, angleDiff } from './utils.js';
import { generateCity, CITY, collideBuildings, clampToWorld, inBuilding } from './city.js';
import { createInput, ACT_CONFIRM, ACT_PAUSE, ACT_ENTER, ACT_MISSION, ACT_RELOAD, ACT_MUTE, ACT_MELEE } from './input.js';
import { initAudio, setMuted, updateAudioLoops, sfx } from './audio.js';
import { createCar, updatePlayerCar, updateTrafficCar, resolveCarCollisions, spawnTraffic, spawnParked, nearestCar, damageCar } from './cars.js';
import { spawnPeds, updatePeds, scarePeds, knockDownPed } from './peds.js';
import { addWanted, updateWanted, updatePoliceCar, updateCops } from './police.js';
import { firePistol, meleeSwing, spawnThugs, updateThugs, updateBullets, updateParticles, hurtPlayer } from './combat.js';
import { startMission, updateMissions, missionAvailable, showDialogue, showBanner, failMission, MISSIONS } from './missions.js';
import { drawWorld, drawTitle, drawPaused, drawBusted, drawWasted, drawStory } from './render.js';
import { drawHUD } from './hud.js';
import { saveGame, loadSave, hasSave, applySave } from './save.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const input = createInput(canvas);
let autosaveTimer = 0;
let titlePan = 0;

function announce(msg) { statusEl.textContent = msg; }

// ---- world setup ------------------------------------------------------------
function setupWorld() {
  generateCity();
  // Nudge every landmark out of any building the generator dropped on it,
  // so every mission marker is actually reachable.
  for (const lm of Object.values(CITY.landmarks)) {
    let tries = 0;
    while (inBuilding(lm.x, lm.y) && tries < 12) {
      lm.x += 30;
      tries += 1;
    }
  }
  resetRun();
  spawnTraffic(16);
  spawnParked(10);
  spawnPeds(24);
  // A few pickups around the city to find.
  S.pickups.push({ kind: 'health', x: 1150, y: 1000, amount: 40, bob: 0 });
  S.pickups.push({ kind: 'ammo', x: 2350, y: 1500, amount: 48, bob: 1 });
  S.pickups.push({ kind: 'cash', x: 700, y: 500, amount: 120, bob: 2 });
  S.pickups.push({ kind: 'health', x: 2800, y: 2000, amount: 40, bob: 3 });
}

// ---- player: on foot ----------------------------------------------------------
function updatePlayerOnFoot(dt) {
  const p = S.player;
  const mv = input.move();
  const speed = input.running() ? p.runSpeed : p.walkSpeed;
  const mx = mv.x, my = -mv.y; // W is up (north) on screen.
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    collideBuildings(p, 12);
    clampToWorld(p, 16);
  }
  // Aim at the mouse.
  const mw = screenToWorld(S.mouse.x, S.mouse.y);
  p.angle = angleTo(p.x, p.y, mw.x, mw.y);
  // Timers.
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.meleeCooldown > 0) p.meleeCooldown -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const need = WEAPONS.pistol.mag - p.ammo;
      const take = Math.min(need, p.reserve);
      p.ammo += take;
      p.reserve -= take;
    }
  }
  if (p.invuln > 0) p.invuln -= dt;
  // Shooting.
  if (S.mouse.down && p.fireCooldown <= 0 && p.reloading <= 0) {
    if (p.ammo > 0) {
      p.ammo -= 1;
      p.fireCooldown = WEAPONS.pistol.fireRate;
      firePistol(p.x, p.y, p.angle, 'player');
      S.shake = Math.max(S.shake, 1.5);
    } else if (p.reserve > 0) {
      startReload();
    }
  }
}

function startReload() {
  const p = S.player;
  if (p.reserve <= 0 || p.ammo >= WEAPONS.pistol.mag || p.reloading > 0) return;
  p.reloading = 1.2;
  sfx.click();
}

// ---- entering / exiting cars ---------------------------------------------------
function tryEnterCar() {
  const p = S.player;
  if (!p.onFoot) return;
  const car = nearestCar(p.x, p.y, 70, (c) => c.hp > 0 && c.ai !== 'police');
  if (!car) return;
  // Witnesses: a nearby ped or a police unit sees the theft.
  let witnessed = false;
  for (const ped of S.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, p.x, p.y) < 260) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const c of S.cars) {
      if (c.ai === 'police' && dist(c.x, c.y, p.x, p.y) < 500) { witnessed = true; break; }
    }
  }
  const wasParked = car.parked;
  car.ai = null;
  car.parked = false;
  car.driver = 'player';
  p.inCar = car;
  p.onFoot = false;
  car.speed = 0;
  sfx.door();
  if (!wasParked) {
    S.stats.carsStolen += 1;
    if (witnessed) addWanted(1, 'Grand theft auto');
    else {
      S.message = 'Car taken — nobody saw';
      S.messageUntil = S.time + 2;
    }
    scarePeds(p.x, p.y, 200);
  }
}

function exitCar() {
  const p = S.player;
  const car = p.inCar;
  if (!car) return;
  // Step out to the side of the car.
  const side = Math.PI / 2;
  p.x = car.x + Math.cos(car.angle + side) * 34;
  p.y = car.y + Math.sin(car.angle + side) * 34;
  collideBuildings(p, 12);
  clampToWorld(p, 16);
  car.speed = 0;
  car.parked = true;
  car.driver = null;
  p.inCar = null;
  p.onFoot = true;
  sfx.door();
}

// ---- one fixed step -------------------------------------------------------------
function step(dt) {
  S.time += dt;
  S.elapsed += dt;
  const actions = input.takeActions();
  if (actions & ACT_MUTE) setMuted(!S.muted);
  if (actions & ACT_PAUSE) {
    S.screen = 'paused';
    saveGame();
    return;
  }
  if (actions & ACT_MISSION) {
    if (missionAvailable()) {
      startMission();
    } else if (S.mission) {
      S.message = 'Job already running — follow the yellow marker';
      S.messageUntil = S.time + 2;
    }
  }
  const p = S.player;

  // Player.
  if (p.onFoot) {
    if (actions & ACT_ENTER) tryEnterCar();
    if (actions & ACT_RELOAD) startReload();
    if (actions & ACT_MELEE && p.meleeCooldown <= 0) {
      p.meleeCooldown = WEAPONS.fists.fireRate;
      meleeSwing(p.x, p.y, p.angle);
    }
    updatePlayerOnFoot(dt);
  } else if (p.inCar) {
    if (actions & ACT_ENTER) exitCar();
    else {
      updatePlayerCar(p.inCar, input.drive(), dt);
      // The player's position IS the car's while driving: the camera, the
      // minimap arrow, the district label and police targeting all read it.
      p.x = p.inCar.x;
      p.y = p.inCar.y;
      p.angle = p.inCar.angle;
    }
    // Running over pedestrians in a car.
    if (p.inCar) {
      for (const ped of S.peds) {
        if (ped.state === 'down') continue;
        if (dist(ped.x, ped.y, p.inCar.x, p.inCar.y) < 26 && Math.abs(p.inCar.speed) > 130) {
          knockDownPed(ped, true);
          addWanted(1, 'Hit and run');
          sfx.thud();
          S.shake = Math.max(S.shake, 3);
        }
      }
    }
  }

  // Systems.
  for (const car of S.cars) {
    if (car.hp <= 0) continue;
    if (car.ai === 'traffic') updateTrafficCar(car, dt);
    else if (car.ai === 'police') updatePoliceCar(car, dt);
  }
  resolveCarCollisions();
  updateCops(dt);
  updatePeds(dt);
  updateThugs(dt);
  updateBullets(dt);
  updateParticles(dt);
  updateWanted(dt);
  updateMissions(dt);

  // Pickups.
  for (let i = S.pickups.length - 1; i >= 0; i -= 1) {
    const pk = S.pickups[i];
    if (dist(pk.x, pk.y, p.x, p.y) < 30) {
      if (pk.kind === 'cash') {
        S.money += pk.amount;
        S.floaters.push({ x: pk.x, y: pk.y - 12, text: '+$' + pk.amount, life: 1, maxLife: 1, color: '#ffd21e' });
        sfx.cash();
      } else if (pk.kind === 'health') {
        p.hp = Math.min(p.maxHp, p.hp + pk.amount);
        sfx.pickup();
      } else if (pk.kind === 'ammo') {
        p.reserve += pk.amount;
        sfx.pickup();
      }
      S.pickups.splice(i, 1);
    }
  }

  // Camera follows the player, clamped to the world.
  const tx = clamp(p.x, VIEW_W / 2, WORLD_W - VIEW_W / 2);
  const ty = clamp(p.y, VIEW_H / 2, WORLD_H - VIEW_H / 2);
  S.camera.x += (tx - S.camera.x) * Math.min(1, dt * 6);
  S.camera.y += (ty - S.camera.y) * Math.min(1, dt * 6);
  S.shake = Math.max(0, S.shake - dt * 14);
  S.flash = Math.max(0, S.flash - dt * 1.6);
  updateAudioLoops();

  // Autosave.
  autosaveTimer += dt;
  if (autosaveTimer > 15) {
    autosaveTimer = 0;
    saveGame();
  }
}

function screenToWorld(sx, sy) {
  return {
    x: S.camera.x - VIEW_W / 2 + sx,
    y: S.camera.y - VIEW_H / 2 + sy,
  };
}

// ---- screens ---------------------------------------------------------------------
function startNewGame() {
  setupWorld();
  input.takeActions(); // drop any presses queued on the title screen
  S.screen = 'playing';
  initAudio();
  showBanner('SUNFALL CITY', 'Rook. New in town. Marisol has work — press M.', 4);
  showDialogue('Marisol', '"You need money, I need a driver. Press M when you are ready for the first job."', 6);
  announce('Playing Sunfall City.');
}

function continueGame() {
  const data = loadSave();
  if (!data) return false;
  setupWorld();
  applySave(data);
  input.takeActions();
  S.screen = 'playing';
  initAudio();
  showBanner('WELCOME BACK', 'Your save is loaded. The city kept your money.', 3);
  announce('Continued saved game.');
  return true;
}

function respawnAfterIncident(hospital) {
  const p = S.player;
  p.inCar = null;
  p.onFoot = true;
  p.hp = p.maxHp;
  p.x = hospital.x;
  p.y = hospital.y;
  p.invuln = 2;
  S.camera.x = p.x;
  S.camera.y = p.y;
  S.wanted = 0;
  S.wantedHeat = 0;
  S.cops.length = 0;
  for (const c of S.cars) if (c.ai === 'police') c.hp = 0;
  if (S.mission) failMission(hospital === CITY.landmarks.hospital ? 'You were wasted.' : 'Busted by the police.');
  S.screen = 'playing';
  saveGame();
}

function handleActions() {
  // While playing, one-shot presses belong to step(), which reads them itself.
  // Consuming them here would eat every E / M / R / F press before it acts.
  if (S.screen === 'playing') return;
  const actions = input.takeActions();
  if (S.screen === 'title') {
    if (actions & ACT_CONFIRM) {
      initAudio();
      startNewGame();
    } else if (S.keys.KeyC && hasSave()) {
      initAudio();
      continueGame();
    }
    return;
  }
  if (S.screen === 'paused') {
    if (actions & (ACT_PAUSE | ACT_CONFIRM)) S.screen = 'playing';
    return;
  }
  if (S.screen === 'busted') {
    if (actions & ACT_CONFIRM) {
      const fine = Math.min(300, Math.floor(S.money * 0.25));
      S.money -= fine;
      respawnAfterIncident(CITY.landmarks.police);
    }
    return;
  }
  if (S.screen === 'wasted') {
    if (actions & ACT_CONFIRM) {
      const bill = Math.min(200, Math.floor(S.money * 0.15));
      S.money -= bill;
      respawnAfterIncident(CITY.landmarks.hospital);
    }
    return;
  }
  if (S.screen === 'story') {
    if (actions & ACT_CONFIRM) S.screen = 'playing';
  }
}

// ---- shot staging (screenshots) -----------------------------------------------------
function stageShot(name) {
  setupWorld();
  S.screen = 'playing';
  const p = S.player;
  if (name === 'drive') {
    const car = createCar('sports', 1700, 1450, 0, { ai: null, color: '#c22a2a' });
    p.inCar = car; p.onFoot = false; car.driver = 'player'; car.speed = 300;
    p.x = car.x; p.y = car.y;
    S.camera.x = p.x; S.camera.y = p.y;
    S.money = 1250;
    showBanner('FIRST RUN', 'Deliver the package to the Sunset Motel', 999);
    S.objective = 'Deliver the package to the Sunset Motel';
    S.mission = { def: MISSIONS[0], stage: 1, timer: 0, marker: { x: CITY.landmarks.motel.x, y: CITY.landmarks.motel.y, label: 'DELIVER' } };
    showDialogue('Marisol', '"Package is in the car. Motel, south side. No questions."', 999);
  } else if (name === 'chase') {
    const car = createCar('sports', 1700, 950, 0, { ai: null, color: '#2a2ac2' });
    p.inCar = car; p.onFoot = false; car.driver = 'player'; car.speed = 380;
    p.x = car.x; p.y = car.y;
    S.wanted = 3; S.wantedHeat = 1;
    for (let i = 0; i < 3; i += 1) {
      const pc = createCar('police', 1700 - 180 - i * 90, 950 + (i - 1) * 70, 0, { ai: 'police' });
      pc.speed = 320;
    }
    S.camera.x = p.x; S.camera.y = p.y;
    S.money = 3400;
    S.objective = 'Lose the heat — reach the safehouse';
    S.mission = { def: MISSIONS[3], stage: 1, timer: 58, marker: { x: CITY.landmarks.safehouse.x, y: CITY.landmarks.safehouse.y, label: 'SAFEHOUSE' } };
    showDialogue('Marisol', '"Every cruiser in Sunfall is coming. Drive!"', 999);
  } else if (name === 'mission') {
    p.x = 420; p.y = 1950; p.angle = -Math.PI / 2;
    S.camera.x = p.x; S.camera.y = p.y;
    S.money = 2100;
    S.mission = { def: MISSIONS[2], stage: 1, timer: 0, marker: { x: CITY.landmarks.pier.x, y: CITY.landmarks.pier.y, label: 'PIER' }, thugsSpawned: true };
    S.objective = 'Deal with the Harlow crew (0/3)';
    spawnThugs(CITY.landmarks.pier.x, CITY.landmarks.pier.y, 3);
    showDialogue('Harlow', '"That is Marisol\'s boy. Take him down!"', 999);
  } else if (name === 'coast') {
    const car = createCar('sports', 420, 1500, Math.PI / 2, { ai: null, color: '#e8e8e8' });
    p.inCar = car; p.onFoot = false; car.driver = 'player'; car.speed = 340;
    p.x = car.x; p.y = car.y;
    S.camera.x = p.x; S.camera.y = p.y;
    S.money = 800;
    S.objective = 'Free roam — Sunfall City is yours';
    showDialogue('Rook', '"Not a bad office, this coast."', 999);
  }
  // Let the world settle for a few frames, then paint twice and signal ready.
  let settled = 0;
  function settle() {
    step(STEP);
    settled += 1;
    drawFrame();
    if (settled < 12) requestAnimationFrame(settle);
    else window.__shotReady = true;
  }
  requestAnimationFrame(settle);
}

// ---- frame -------------------------------------------------------------------------
function drawFrame() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a0e1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
  const ox = (canvas.width - VIEW_W * scale) / 2;
  const oy = (canvas.height - VIEW_H * scale) / 2;
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  if (S.screen === 'title') {
    // Slow pan over Downtown behind the title.
    titlePan += 0.008;
    S.camera.x = 1700 + Math.sin(titlePan) * 500;
    S.camera.y = 1000 + Math.cos(titlePan * 0.7) * 300;
    drawWorld(ctx);
    drawTitle(ctx, hasSave());
    return;
  }
  drawWorld(ctx);
  if (S.screen === 'playing' || S.screen === 'paused') drawHUD(ctx);
  if (S.screen === 'paused') drawPaused(ctx);
  else if (S.screen === 'busted') drawBusted(ctx);
  else if (S.screen === 'wasted') drawWasted(ctx);
  else if (S.screen === 'story') drawStory(ctx);
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
}

function runGame() {
  setupWorld();
  S.screen = 'title';
  resize();
  window.addEventListener('resize', resize);
  let accumulator = 0;
  let last = performance.now();
  let fpsFrames = 0;
  let fpsLast = performance.now();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.screen === 'playing') {
      S.screen = 'paused';
      saveGame();
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (S.screen === 'playing') {
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      if (S.screen === 'title') titlePan += 0.004;
    }
    drawFrame();
    fpsFrames += 1;
    if (now - fpsLast >= 1000) {
      S.fps = Math.round(fpsFrames * 1000 / (now - fpsLast));
      fpsFrames = 0;
      fpsLast = now;
    }
  }
  announce('Sunfall City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

window.__sunfall = { S, CITY, version: '1.0.0', startNewGame, continueGame };

// The recording witnesses this session building the game; the game itself starts here.
if (shot) stageShot(shot);
else runGame();
