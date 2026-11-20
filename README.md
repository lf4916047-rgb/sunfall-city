# sunfall-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/lf4916047-rgb/sunfall-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/lf4916047-rgb/sunfall-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Sunfall City** is an original top-down open-world crime game that runs entirely in a desktop browser — vanilla JavaScript and Canvas, no dependencies, no build step, no network requests. You play Rook, a driver newly arrived in a golden-hour coastal city of 3400×2600 pixels: five districts (Marina Bay, Old Town, Downtown, Harbor East and the Sunset Strip), a beach and sea along the west edge, and around sixty buildings with collision. Walk the sidewalks among two dozen pedestrians, steal and drive six vehicle types — Sedan, Taxi, Box Truck, Comet GT sports car, police Cruiser and Van, each with its own speed, acceleration, grip and toughness — while AI traffic follows the road grid and yields at junctions. Crime is witnessed and answered: a wanted level of one to five stars brings cruisers that pursue and ram and officers who chase on foot, with busted and wasted outcomes if they catch you. A four-mission story arc for the fixer Marisol Vega — *First Run*, *Borrowed Wheels*, *Shakedown at the Pier* and *The Long Way Home* — carries you from a timed delivery to a three-star getaway, with dialogue, cash rewards and fail-and-retry states. Combat is mouse-aimed: a 12-round pistol with reloads and reserve ammo, plus fists. The HUD shows health, cash, district, wanted stars, the current objective and a live minimap with traffic, police and mission markers. Progress (money, mission, position) saves to localStorage, and every sound — engine, siren, gunshots, tyre skid, the low hum of the city — is synthesized live with WebAudio. All names, places, art and story are original; nothing here comes from any commercial game.

## Run it

```sh
node serve.ts   # serves the game locally — then open http://localhost:8080 in a desktop browser
```

`serve.ts` is a tiny Node 22 standard-library static server for the `game/` folder (add `--port <n>` to change the port). The game itself is plain static files, so any static file server pointed at `game/` works too.

To build the make.fun handover output (copies `game/` and `screenshots/` to the output directory and writes `dossier.json` there):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

- **WASD / arrow keys** — walk, and drive when in a car
- **Shift** — run on foot
- **E** — enter / exit a car (any car can be stolen)
- **Mouse** — aim; **click** — shoot
- **F** — melee
- **Space** — handbrake while driving; confirm on the title screens
- **P / Esc** — pause
- **N** — mute

## What's in the game

- A 3400×2600 coastal city in five named districts, generated from a fixed seed — the same streets every visit
- Traffic AI that follows lanes, turns at junctions, yields at crossings and unsticks itself when queued
- Pedestrians who stroll the sidewalks, flee gunfire and dive out of the way of fast cars
- Six drivable vehicle types with distinct handling; parked cars are immovable and traffic will not chew up your getaway car
- A 1–5 star wanted system: cruisers pursue and ram (tuned so a fast car can escape and a slow one cannot), foot officers chase, and heat cools when you stay clean and unseen
- Four story missions with objective markers on the world and the minimap, dialogue, timers, rewards and retry
- Mouse-aim pistol combat with tracers, hit sparks and damage floaters; enemy thugs and officers fight back
- A HUD with health, cash, wanted stars, objective line and a live minimap; title, pause, busted, wasted and story-complete screens
- localStorage save with Continue on the title screen
- Fully synthesized WebAudio sound: engine pitch follows speed, the siren swells with proximity, plus skid, reload, pickup and mission-complete sounds

---
<sub>Entered on [make.fun](https://make.fun/?ref=bh0ya4f5&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
