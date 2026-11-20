// Missions and the story: Rook, a driver new to Sunfall City, runs jobs for
// Marisol Vega, a fixer who moves "packages" for the harbour crowd. Four jobs,
// each with stages, a timer where the story needs one, and a cash reward.
import { S } from './state.js';
import { dist } from './utils.js';
import { ROADS_H } from './config.js';
import { CITY } from './city.js';
import { createCar, nearestCar } from './cars.js';
import { spawnThugs } from './combat.js';
import { addWanted } from './police.js';
import { sfx } from './audio.js';

export const MISSIONS = [
  {
    id: 'first-run',
    title: 'FIRST RUN',
    reward: 300,
    intro: 'Marisol: "Rook. A package is waiting at the Marina. Pick it up, bring it to the Sunset Motel. No questions, no shortcuts through the water."',
    objective0: 'Pick up the package at the Marina',
    objective1: 'Deliver the package to the Sunset Motel',
    timer: 90,
  },
  {
    id: 'borrowed-wheels',
    title: 'BORROWED WHEELS',
    reward: 500,
    intro: 'Marisol: "A client wants a Comet GT, cherry red, no questions asked. It is parked by the Downtown plaza. Take it. Bring it to Rico\'s Garage. Try not to get seen."',
    objective0: 'Steal the red Comet GT',
    objective1: "Deliver the Comet GT to Rico's Garage",
    timer: 0,
  },
  {
    id: 'shakedown',
    title: 'SHAKEDOWN AT THE PIER',
    reward: 700,
    intro: 'Marisol: "The Harlow boys are holding my cash at the Old Pier. Three of them, armed. Go remind them who the harbour belongs to — and bring the money home."',
    objective0: 'Reach the Old Pier',
    objective1: 'Deal with the Harlow crew (0/3)',
    objective2: 'Collect the stash cash',
    timer: 0,
  },
  {
    id: 'long-way-home',
    title: 'THE LONG WAY HOME',
    reward: 1200,
    intro: 'Marisol: "Last one, Rook. A briefcase at the Harbor Bank. The moment you touch it, every cruiser in the city will know your name. Lose them. Get to my place. Then we are square."',
    objective0: 'Grab the briefcase at the Harbor Bank',
    objective1: 'Lose the heat — reach the safehouse',
    timer: 90,
  },
];

export function missionAvailable() {
  return S.mission === null && S.missionIdx < MISSIONS.length;
}

export function showDialogue(who, text, seconds = 4.5) {
  S.dialogue.push({ who, text, until: S.time + seconds });
  if (S.dialogue.length > 3) S.dialogue.shift();
}

export function showBanner(text, sub, seconds = 3) {
  S.banner = { text, sub: sub || '', until: S.time + seconds };
}

export function startMission() {
  if (!missionAvailable()) return false;
  const def = MISSIONS[S.missionIdx];
  const m = { def, stage: 0, timer: def.timer, startedAt: S.time, targetCar: null, cashSpawned: false, thugsSpawned: false };
  S.mission = m;
  showDialogue('Marisol', def.intro, 6);
  if (S.missionIdx === 0) {
    m.marker = { x: CITY.landmarks.marina.x, y: CITY.landmarks.marina.y, label: 'PICKUP' };
    S.objective = def.objective0;
  } else if (S.missionIdx === 1) {
    // The marked car: a red Comet GT parallel-parked at the Downtown plaza's edge.
    const car = createCar('sports', 1742, 1010, Math.PI / 2, { ai: null, parked: true, color: '#c22a2a' });
    m.targetCar = car;
    m.marker = { x: car.x, y: car.y, label: 'COMET GT' };
    S.objective = def.objective0;
  } else if (S.missionIdx === 2) {
    m.marker = { x: CITY.landmarks.pier.x, y: CITY.landmarks.pier.y, label: 'PIER' };
    S.objective = def.objective0;
  } else if (S.missionIdx === 3) {
    m.marker = { x: CITY.landmarks.bank.x, y: CITY.landmarks.bank.y, label: 'BRIEFCASE' };
    S.objective = def.objective0;
    // The getaway car: a red Comet GT parked on the Harbor Road just south of
    // the bank, so the final job does not hinge on whatever random parked car
    // happens to be nearby — a slow sedan can never outrun three cruisers.
    // (The bank landmark is nudged out of its building by setupWorld, so the
    // car is placed off the first horizontal road below the nudged bank.)
    const roadY = ROADS_H.find((y) => y > CITY.landmarks.bank.y) ?? ROADS_H[1];
    m.getawayCar = createCar('sports', CITY.landmarks.bank.x, roadY - 42, 0, { ai: null, parked: true, color: '#c22a2a' });
  }
  sfx.click();
  return true;
}

export function completeMission() {
  const m = S.mission;
  if (!m) return;
  S.money += m.def.reward;
  S.stats.missionsDone += 1;
  S.missionIdx += 1;
  showBanner('JOB DONE — ' + m.def.title, `+$${m.def.reward}  •  Marisol is pleased.`, 4);
  showDialogue('Marisol', m.def.id === 'long-way-home'
    ? '"You drove like the city owed you money, Rook. We are square. Welcome to Sunfall."'
    : '"Clean. The money is yours. There will be more work when you are ready."', 5);
  sfx.jingle();
  sfx.cash();
  S.mission = null;
  if (S.missionIdx >= MISSIONS.length) {
    S.objective = 'Story complete — Sunfall City is yours. Free roam.';
    S.screen = 'story';
  } else {
    S.objective = '';
  }
}

export function failMission(reason) {
  const m = S.mission;
  if (!m) return;
  showBanner('JOB FAILED', reason, 4);
  showDialogue('Marisol', '"It happens. The job is still there when you want it back."', 4);
  sfx.fail();
  if (m.targetCar && m.targetCar.hp > 0 && S.missionIdx === 1) {
    // Leave the marked car where it is; the retry reuses it if it still exists.
    m.targetCar.parked = true;
  }
  S.mission = null;
  S.objective = '';
}

function reach(p, x, y, r) { return dist(p.x, p.y, x, y) < r; }

export function updateMissions(dt) {
  const m = S.mission;
  const p = S.player;
  if (!m) return;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission('Out of time.');
      return;
    }
  }
  const def = m.def;
  if (S.missionIdx === 0) {
    if (m.stage === 0) {
      if (p.onFoot && reach(p, CITY.landmarks.marina.x, CITY.landmarks.marina.y, 46)) {
        m.stage = 1;
        m.marker = { x: CITY.landmarks.motel.x, y: CITY.landmarks.motel.y, label: 'DELIVER' };
        S.objective = def.objective1;
        showDialogue('Rook', '"Package secured. Motel, south side. Easy."', 3);
        sfx.pickup();
      }
    } else if (reach(p, CITY.landmarks.motel.x, CITY.landmarks.motel.y, 56)) {
      completeMission();
    }
  } else if (S.missionIdx === 1) {
    if (m.stage === 0) {
      if (p.inCar === m.targetCar) {
        m.stage = 1;
        m.marker = { x: CITY.landmarks.garage.x, y: CITY.landmarks.garage.y, label: 'GARAGE' };
        S.objective = def.objective1;
        addWanted(1, 'Grand theft auto');
        showDialogue('Rook', '"She is mine. Now, Rico\'s — and quietly."', 3);
      }
    } else {
      if (!m.targetCar || m.targetCar.hp <= 0) {
        failMission('The Comet GT was destroyed.');
        return;
      }
      if (reach(p, CITY.landmarks.garage.x, CITY.landmarks.garage.y, 70) && p.inCar === m.targetCar) {
        // Hand the car over: step out and finish.
        completeMission();
      }
    }
  } else if (S.missionIdx === 2) {
    if (m.stage === 0) {
      if (reach(p, CITY.landmarks.pier.x, CITY.landmarks.pier.y, 90)) {
        m.stage = 1;
        m.thugsSpawned = true;
        spawnThugs(CITY.landmarks.pier.x, CITY.landmarks.pier.y, 3);
        S.objective = def.objective1;
        showDialogue('Harlow', '"That is Marisol\'s boy. Take him down!"', 3);
        sfx.fail();
      }
    } else if (m.stage === 1) {
      const left = S.thugs.filter((t) => t.hp > 0).length;
      S.objective = `Deal with the Harlow crew (${3 - left}/3)`;
      if (left === 0) {
        m.stage = 2;
        S.pickups.push({ kind: 'cash', x: CITY.landmarks.pier.x, y: CITY.landmarks.pier.y, amount: 150, bob: 0 });
        S.objective = def.objective2;
        showDialogue('Rook', '"Crew is down. Where is the stash?"', 3);
      }
    } else if (m.stage === 2) {
      // The stash is collected by the generic pickup logic; watch for it.
      if (m.cashSpawned && !S.pickups.some((pk) => pk.kind === 'cash' && dist(pk.x, pk.y, CITY.landmarks.pier.x, CITY.landmarks.pier.y) < 40)) {
        completeMission();
      } else if (!m.cashSpawned) {
        m.cashSpawned = true;
      }
    }
  } else if (S.missionIdx === 3) {
    if (m.stage === 0) {
      if (p.onFoot && reach(p, CITY.landmarks.bank.x, CITY.landmarks.bank.y, 46)) {
        m.stage = 1;
        m.timer = def.timer;
        m.marker = { x: CITY.landmarks.safehouse.x, y: CITY.landmarks.safehouse.y, label: 'SAFEHOUSE' };
        S.objective = def.objective1;
        S.wanted = Math.max(S.wanted, 3);
        S.wantedHeat = 1;
        S.lastCrimeAt = S.time;
        showDialogue('Marisol', '"Briefcase is hot. Every cruiser in Sunfall is coming. The red Comet on Harbor Road is yours — drive!"', 4);
        sfx.pickup();
      }
    } else if (reach(p, CITY.landmarks.safehouse.x, CITY.landmarks.safehouse.y, 60)) {
      S.wanted = 0;
      S.wantedHeat = 0;
      completeMission();
    }
  }
}

// The world marker for the active mission (drawn by render.js).
export function activeMarker() {
  return S.mission ? S.mission.marker : null;
}
