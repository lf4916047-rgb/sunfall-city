// Sunfall City — shared constants, palette and vehicle definitions.
// All names, places and story are original; nothing from any commercial game.
export const WORLD_W = 3400;
export const WORLD_H = 2600;

// Golden-hour palette: warm asphalt, sun-bleached concrete, teal sea.
export const PAL = {
  grass: '#7a8f5a',
  ground: '#8a7a5e',
  sand: '#e8c98f',
  sea: '#2e7f9e',
  seaDeep: '#1f5f7d',
  road: '#3a3a44',
  roadEdge: '#2c2c34',
  lane: '#e8d27a',
  sidewalk: '#9a938a',
  crosswalk: '#d8d2c4',
  buildingRoof: ['#b0563a', '#4a6b8a', '#7a5a8a', '#3f7a5a', '#a87a3a', '#5a4a7a', '#8a3a4a', '#2f5a6b'],
  buildingWall: ['#8a4a30', '#3a556e', '#62486e', '#32604a', '#8a6430', '#483a60', '#6e2f3c', '#264654'],
  windowLit: '#ffd98a',
  windowDark: '#2a2f3a',
  palm: '#3f7a4a',
  palmTrunk: '#6b4a2a',
  player: '#e8e8e8',
  playerJacket: '#d84a3a',
  police: '#2a4a8a',
  taxi: '#f0b81e',
  mission: '#ffd21e',
  danger: '#ff4a3a',
  hud: '#f2ead8',
};

export const DISTRICTS = [
  { name: 'MARINA BAY', x: 0, y: 0, w: 420, h: 2600 },
  { name: 'OLD TOWN', x: 420, y: 0, w: 680, h: 950 },
  { name: 'DOWNTOWN', x: 1100, y: 0, w: 1200, h: 1450 },
  { name: 'HARBOR EAST', x: 2300, y: 0, w: 1100, h: 1450 },
  { name: 'SUNSET STRIP', x: 420, y: 1450, w: 2980, h: 1150 },
];

// Road centre lines (the city grid). Roads are 90px wide, sidewalks 24px each side.
export const ROADS_V = [500, 1100, 1700, 2300, 2900];
export const ROADS_H = [450, 950, 1450, 1950];
export const ROAD_HALF = 45;
export const LANE = 20; // lane offset from road centre

// Vehicle types. speed in px/s, accel px/s^2. The chase balance hangs on the
// cruiser's 470: it sits between the sedan's 380 and the Comet GT's 520, so a
// getaway in a fast car can outrun the law and a getaway in a slow one cannot.
export const CAR_TYPES = {
  sedan:   { name: 'Sedan',    topSpeed: 380, accel: 260, brake: 420, grip: 2.6, hp: 100, colors: ['#7a8a9a', '#5a6b7a', '#9a7a5a', '#4a7a5a'] },
  taxi:    { name: 'Taxi',     topSpeed: 400, accel: 280, brake: 440, grip: 2.7, hp: 100, colors: ['#f0b81e'] },
  truck:   { name: 'Box Truck',topSpeed: 300, accel: 180, brake: 360, grip: 2.2, hp: 160, colors: ['#8a8a7a', '#5a7a8a'] },
  sports:  { name: 'Comet GT', topSpeed: 520, accel: 380, brake: 520, grip: 3.4, hp: 90,  colors: ['#c22a2a', '#2a2ac2', '#e8e8e8'] },
  police:  { name: 'Cruiser',  topSpeed: 470, accel: 340, brake: 500, grip: 3.1, hp: 140, colors: ['#1a2a4a'] },
  van:     { name: 'Van',      topSpeed: 330, accel: 210, brake: 380, grip: 2.3, hp: 130, colors: ['#6b5a8a', '#7a7a7a'] },
};

export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 34, mag: 12, reserve: 96, fireRate: 0.16, range: 520, spread: 0.03, bulletSpeed: 950 },
  fists:  { name: 'Fists',  damage: 22, mag: Infinity, reserve: Infinity, fireRate: 0.45, range: 46, spread: 0, bulletSpeed: 0 },
};

export const SAVE_KEY = 'sunfall-city-save-v1';
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
