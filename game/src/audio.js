// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, police siren, gunshots, hits, pickups, mission jingle, UI clicks.
import { S } from './state.js';

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenLfo = null;
let started = false;

export function initAudio() {
  if (started) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = S.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // Engine: a sawtooth through a low-pass, pitch follows car speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // Siren: a sine whose pitch wobbles between two tones.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 780;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
    started = true;
  } catch {
    // Audio is a nice-to-have; the game plays fine silent.
    ctx = null;
  }
}

export function setMuted(m) {
  S.muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || !started) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx || !started) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

export const sfx = {
  shoot() { noiseBurst(0.09, 0.5, 2600); blip(220, 0.07, 'square', 0.18, 60); },
  enemyShoot() { noiseBurst(0.08, 0.28, 1800); },
  hit() { noiseBurst(0.06, 0.3, 900); },
  thud() { blip(90, 0.14, 'sine', 0.4, 45); },
  pickup() { blip(660, 0.09, 'sine', 0.3, 990); blip(990, 0.12, 'sine', 0.25, 1320); },
  cash() { blip(880, 0.08, 'triangle', 0.3); setTimeout(() => blip(1174, 0.12, 'triangle', 0.3), 70); },
  click() { blip(520, 0.05, 'square', 0.15); },
  fail() { blip(220, 0.25, 'sawtooth', 0.25, 110); },
  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.16, 'triangle', 0.3), i * 95));
  },
  crash() { noiseBurst(0.22, 0.5, 500); },
  door() { blip(180, 0.08, 'square', 0.2, 120); },
};

// Called every frame: engine pitch from the player's car speed, siren from police heat.
export function updateAudioLoops() {
  if (!ctx || !started) return;
  const p = S.player;
  const inCar = p && p.inCar;
  const speed = inCar ? Math.abs(inCar.speed) : 0;
  const targetEngine = inCar ? 0.05 + Math.min(0.14, speed / 520 * 0.14) : 0;
  engineGain.gain.setTargetAtTime(targetEngine, ctx.currentTime, 0.1);
  engineOsc.frequency.setTargetAtTime(48 + speed * 0.22, ctx.currentTime, 0.08);
  const nearest = nearestPoliceDist();
  const sirenOn = S.wanted > 0 && nearest < 900;
  sirenGain.gain.setTargetAtTime(sirenOn ? 0.045 : 0, ctx.currentTime, 0.3);
}

function nearestPoliceDist() {
  const p = S.player;
  if (!p) return Infinity;
  let best = Infinity;
  for (const c of S.cars) {
    if (c.ai !== 'police') continue;
    const dx = c.x - p.x, dy = c.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}
