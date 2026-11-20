// The single mutable game state, shared by every system.
// state.js imports nothing, so no system can create a cycle through it.
import { WORLD_W, WORLD_H } from './config.js';

export const S = {
  screen: 'title', // title | playing | paused | busted | wasted | story
  time: 0,
  elapsed: 0, // play time this run, seconds
  money: 0,
  wanted: 0, // 0..5 stars
  wantedHeat: 0, // 0..1, builds with crimes, decays when clean
  lastCrimeAt: -999,
  lastSeenAt: -999, // last time police had line of sight
  player: null,
  cars: [],
  peds: [],
  cops: [], // foot officers
  thugs: [], // mission enemies
  bullets: [],
  particles: [],
  floaters: [], // damage / pickup text
  pickups: [], // cash, health, ammo on the ground
  camera: { x: WORLD_W / 2, y: WORLD_H / 2 },
  mouse: { x: 640, y: 360, down: false },
  keys: {},
  shake: 0,
  flash: 0, // red damage vignette 0..1
  muted: false,
  missionIdx: 0, // next mission to offer (0..4; 4 = all done)
  mission: null, // active mission runtime state
  banner: null, // { text, sub, until }
  dialogue: [], // { who, text, until }
  objective: '',
  stats: { kills: 0, carsStolen: 0, distance: 0, shotsFired: 0, missionsDone: 0 },
  nextCarId: 1,
  nextPedId: 1,
  fps: 60,
  frameCount: 0,
  fpsTime: 0,
  message: '', // centre-screen transient message
  messageUntil: 0,
};

export function newPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, hp: 100, maxHp: 100,
    speed: 0, inCar: null, onFoot: true,
    ammo: 12, reserve: 96, reloading: 0, fireCooldown: 0,
    meleeCooldown: 0, runStamina: 1, walkSpeed: 230, runSpeed: 330,
    bustedTimer: 0, invuln: 0, moving: false,
  };
}

export function resetRun() {
  S.time = 0;
  S.elapsed = 0;
  S.money = 0;
  S.wanted = 0;
  S.wantedHeat = 0;
  S.lastCrimeAt = -999;
  S.lastSeenAt = -999;
  S.cars = [];
  S.peds = [];
  S.cops = [];
  S.thugs = [];
  S.bullets = [];
  S.particles = [];
  S.floaters = [];
  S.pickups = [];
  S.missionIdx = 0;
  S.mission = null;
  S.banner = null;
  S.dialogue = [];
  S.objective = '';
  S.stats = { kills: 0, carsStolen: 0, distance: 0, shotsFired: 0, missionsDone: 0 };
  S.nextCarId = 1;
  S.nextPedId = 1;
  S.shake = 0;
  S.flash = 0;
  S.message = '';
  S.messageUntil = 0;
  S.player = newPlayer(1700, 1450);
  S.camera.x = S.player.x;
  S.camera.y = S.player.y;
}
