/** 音效配方（docs §5.3）。所有音都是程序合成。 */
import { audio } from './audio';

/** 每个神殿的调（五声音阶根音，MIDI） */
const KEYS = [62, 65, 69, 60];
const PENTA = [0, 2, 4, 7, 9];
let temple = 0;
let lastChime = 0;

export function setTemple(t: number): void {
  temple = Math.max(0, Math.min(3, t));
}

export function scaleNote(degree: number, base = 72): number {
  const root = KEYS[temple]! - 62 + base;
  const oct = Math.floor(degree / 5);
  return root + oct * 12 + PENTA[((degree % 5) + 5) % 5]!;
}

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

function ok(): AudioContext | null {
  return audio.ready ? audio.ctx : null;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, a = 0.002): OscillatorNode {
  const c = audio.ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  const g = c.createGain();
  env(g, t, a, peak, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}

function noise(t: number, dur: number, peak: number, type: BiquadFilterType, f: number, q: number, dest: AudioNode, f2?: number): void {
  const c = audio.ctx!;
  const s = c.createBufferSource();
  s.buffer = audio.noise;
  s.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.003, peak, dur);
  s.connect(fl).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

/** FM 钟片：合成第 step 步 */
export function chime(step: number, level: number, vol = 0.28): void {
  const c = ok();
  if (!c) return;
  const t = Math.max(c.currentTime, lastChime + 0.012);
  lastChime = t;
  const f = mtof(scaleNote(Math.min(14, step - 1)));
  const car = c.createOscillator();
  car.frequency.value = f;
  const mod = c.createOscillator();
  mod.frequency.value = f * 3.01;
  const mg = c.createGain();
  mg.gain.setValueAtTime(f * 1.2, t);
  mg.gain.exponentialRampToValueAtTime(1, t + 0.26);
  mod.connect(mg).connect(car.frequency);
  const g = c.createGain();
  env(g, t, 0.002, vol, 0.42);
  car.connect(g);
  g.connect(audio.sfx);
  g.connect(audio.reverbSend);
  car.start(t);
  mod.start(t);
  car.stop(t + 0.5);
  mod.stop(t + 0.5);
  if (level >= 7) osc('sine', f / 2, t, 0.4, vol * 0.5, audio.sfx);
  if (step >= 3) osc('triangle', f * 1.5, t + 0.01, 0.3, vol * 0.25, audio.reverbSend);
  if (step >= 5) thud(0.25);
}

export function stoneTap(vol = 0.3): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  noise(t, 0.03, vol, 'bandpass', 1800, 4, audio.sfx);
  osc('sine', 220, t, 0.05, vol * 0.8, audio.sfx);
}

export function thud(vol = 0.35): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  const g = c.createGain();
  env(g, t, 0.003, vol, 0.22);
  o.connect(g).connect(audio.sfx);
  o.start(t);
  o.stop(t + 0.3);
}

export function gong(big = false): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  const base = big ? 82 : 110;
  for (const [k, v] of [[1, 0.32], [1.47, 0.18], [2.13, 0.12]] as const) {
    const o = osc('sine', base * k, t, big ? 2.4 : 1.6, v, audio.sfx, 0.005);
    o.frequency.exponentialRampToValueAtTime(base * k * 0.985, t + 1.5);
    osc('sine', base * k, t, big ? 2.4 : 1.6, v * 0.8, audio.reverbSend, 0.005);
  }
  noise(t, 0.08, 0.3, 'lowpass', 2500, 0.7, audio.sfx);
  // 上行琶音
  for (let i = 0; i < 4; i++) {
    const f = mtof(scaleNote(5 + i * 2));
    osc('sine', f, t + 0.12 + i * 0.07, 0.5, 0.12, audio.sfx);
    osc('sine', f, t + 0.12 + i * 0.07, 0.5, 0.1, audio.reverbSend);
  }
}

export function freezeHum(dur: number): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = 1760;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.025, t + 0.1);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function whoosh(far = false): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  noise(t, far ? 0.25 : 0.12, far ? 0.1 : 0.22, 'bandpass', far ? 2000 : 3000, 2, audio.sfx, far ? 400 : 800);
  if (!far) osc('sine', 660, t, 0.04, 0.12, audio.sfx);
}

export function heartbeat(fast: boolean): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  for (const dt of [0, fast ? 0.16 : 0.2]) {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(90, t + dt);
    o.frequency.exponentialRampToValueAtTime(50, t + dt + 0.12);
    const g = c.createGain();
    env(g, t + dt, 0.004, dt ? 0.22 : 0.3, 0.16);
    o.connect(g).connect(audio.sfx);
    o.start(t + dt);
    o.stop(t + dt + 0.25);
  }
}

export function jadeClink(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  osc('sine', 2400, t, 0.06, 0.12, audio.sfx);
  osc('sine', 3600, t + 0.06, 0.06, 0.1, audio.sfx);
}

export function tick(): void {
  const c = ok();
  if (!c) return;
  osc('sine', 1900, c.currentTime, 0.04, 0.06, audio.sfx);
}

export function flip(): void {
  const c = ok();
  if (!c) return;
  noise(c.currentTime, 0.12, 0.08, 'highpass', 2500, 0.8, audio.sfx);
}

export function crumble(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < 4; i++) noise(t + i * 0.025, 0.05, 0.16, 'bandpass', 900 + i * 400, 3, audio.sfx);
}

export function swallow(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 1.2);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const g = c.createGain();
  env(g, t, 0.05, 0.2, 1.2);
  o.connect(lp).connect(g).connect(audio.sfx);
  o.start(t);
  o.stop(t + 1.4);
}

export function shatter(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  noise(t, 0.35, 0.3, 'highpass', 3000, 1, audio.sfx);
  for (const f of [1870, 2630, 3410]) osc('sine', f, t, 0.5, 0.06, audio.reverbSend);
}

export function drum(vol = 0.3): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
  const g = c.createGain();
  env(g, t, 0.003, vol, 0.35);
  o.connect(g).connect(audio.sfx);
  o.start(t);
  o.stop(t + 0.4);
  noise(t, 0.06, vol * 0.4, 'lowpass', 900, 0.7, audio.sfx);
}

export function arpeggio(up = true, n = 5, gap = 0.06, vol = 0.12): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < n; i++) {
    const d = up ? i : n - 1 - i;
    const f = mtof(scaleNote(3 + d * 2));
    osc('triangle', f, t + i * gap, 0.45, vol, audio.sfx);
    osc('sine', f, t + i * gap, 0.45, vol * 0.7, audio.reverbSend);
  }
}

export function chordDown(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  [0, 3, 7].forEach((st, i) => {
    const o = osc('triangle', mtof(57 + st), t + i * 0.12, 1.4, 0.1, audio.sfx, 0.05);
    o.frequency.exponentialRampToValueAtTime(mtof(55 + st), t + 1.4);
  });
}

export function suck(): void {
  const c = ok();
  if (!c) return;
  noise(c.currentTime, 0.18, 0.1, 'bandpass', 500, 3, audio.sfx, 2500);
}

export function hum(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  const o = osc('sine', 110, t, 0.3, 0.16, audio.sfx, 0.03);
  o.frequency.exponentialRampToValueAtTime(220, t + 0.25);
}

export function click(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  noise(t, 0.015, 0.12, 'bandpass', 3200, 3, audio.sfx);
}

export function grind(): void {
  const c = ok();
  if (!c) return;
  noise(c.currentTime, 0.5, 0.12, 'lowpass', 300, 1, audio.sfx, 120);
}

export function rustle(): void {
  const c = ok();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < 3; i++) noise(t + i * 0.08, 0.14, 0.06, 'highpass', 4000, 0.7, audio.sfx);
}

export function scrape(): void {
  const c = ok();
  if (!c) return;
  noise(c.currentTime, 0.06, 0.04, 'bandpass', 1200, 1.5, audio.sfx);
}

/** 退潮：每颗珠子一个「叮」，音高循环上行 */
export function cashTick(i: number): void {
  const c = ok();
  if (!c) return;
  const f = mtof(scaleNote(5 + (i % 10)));
  osc('sine', f, c.currentTime, 0.12, 0.07, audio.sfx);
}
