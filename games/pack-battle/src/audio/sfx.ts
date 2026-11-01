// 音效合成配方表（全部实时合成）
import { au, gate, voice } from './audio.ts';

type Dest = AudioNode;

export function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, t: number, dest: Dest, attack = 0.004, rev = 0): OscillatorNode {
  const ctx = au.ctx!;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, peak, attack, dur);
  o.connect(g);
  g.connect(dest);
  if (rev > 0) {
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s);
    s.connect(au.send);
  }
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return o;
}

export function noise(dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, t: number, dest: Dest, attack = 0.003, rev = 0): AudioBufferSourceNode {
  const ctx = au.ctx!;
  const src = ctx.createBufferSource();
  src.buffer = au.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  if (rev > 0) {
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s);
    s.connect(au.send);
  }
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
  return src;
}

/** 拨弦缓冲（Karplus-Strong），由 music.ts 生成后注册 */
export const plucks = new Map<number, AudioBuffer>();

export function pluck(midi: number, peak: number, t: number, dest: Dest, rate = 1, rev = 0.25): AudioBufferSourceNode | null {
  const b = plucks.get(midi);
  if (!b || !au.ctx) return null;
  const src = au.ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = au.ctx.createGain();
  g.gain.value = peak;
  src.connect(g);
  g.connect(dest);
  if (rev > 0) {
    const s = au.ctx.createGain();
    s.gain.value = rev;
    g.connect(s);
    s.connect(au.send);
  }
  src.start(t);
  return src;
}

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

type Recipe = (t: number, d: Dest, arg: number) => AudioScheduledSourceNode[];

const R: Record<string, Recipe> = {
  click: (t, d) => [tone('square', 900, 700, 0.015, 0.12, t, d), noise(0.02, 'lowpass', 2500, 1200, 0.7, 0.12, t, d)],
  pickup: (t, d) => [noise(0.04, 'highpass', 3000, 3000, 0.7, 0.16, t, d), noise(0.05, 'bandpass', 5000, 2500, 1, 0.08, t + 0.02, d)],
  tick: (t, d) => [tone('triangle', 1400, 1200, 0.02, 0.05, t, d)],
  mergeHover: (t, d) => [tone('sine', 1320, 1760, 0.18, 0.08, t, d, 0.01, 0.4)],
  sellHover: (t, d) => [tone('sine', 1900, 1900, 0.08, 0.06, t, d, 0.002, 0.2)],
  drop: (t, d) => [noise(0.06, 'lowpass', 600, 200, 0.8, 0.35, t, d), tone('sine', 120, 80, 0.06, 0.3, t, d)],
  cancel: (t, d) => [tone('sine', 180, 90, 0.08, 0.22, t, d), noise(0.05, 'lowpass', 500, 300, 0.5, 0.08, t, d)],
  rotate: (t, d) => [tone('square', 1100, 800, 0.012, 0.07, t, d), noise(0.03, 'bandpass', 1800, 1800, 3, 0.12, t, d), noise(0.04, 'highpass', 3500, 3500, 0.7, 0.07, t + 0.015, d)],
  rotateFail: (t, d) => {
    const ctx = au.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    f.connect(d);
    return [tone('square', 140, 130, 0.12, 0.12, t, f), tone('square', 140, 120, 0.1, 0.1, t + 0.13, f)];
  },
  buy: (t, d) => [tone('sine', 1320, 1320, 0.12, 0.13, t, d, 0.002, 0.25), tone('sine', 1760, 1760, 0.16, 0.12, t + 0.06, d, 0.002, 0.25), noise(0.04, 'highpass', 3000, 3000, 0.7, 0.05, t, d)],
  noGold: (t, d) => [noise(0.12, 'lowpass', 400, 200, 0.6, 0.18, t, d), tone('triangle', 330, 300, 0.1, 0.12, t + 0.02, d), tone('triangle', 247, 220, 0.14, 0.12, t + 0.13, d)],
  sell: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    for (let i = 0; i < 5; i++) out.push(tone('sine', 1500 + i * 120, 1500 + i * 120, 0.08, 0.08, t + i * 0.04, d, 0.002, 0.2));
    return out;
  },
  undo: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    for (let i = 0; i < 4; i++) out.push(tone('sine', 1980 - i * 140, 1980 - i * 140, 0.07, 0.07, t + i * 0.04, d, 0.002, 0.2));
    return out;
  },
  merge2: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    [72, 76, 79, 84].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.22, 0.12, t + i * 0.06, d, 0.004, 0.35)));
    out.push(noise(0.15, 'highpass', 6000, 9000, 0.7, 0.06, t + 0.24, d));
    return out;
  },
  merge3: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    [84, 88, 91, 96].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.26, 0.11, t + i * 0.06, d, 0.004, 0.4)));
    for (const r of [1, 2.76, 5.4]) out.push(tone('sine', 523 * r, 523 * r, 1.0, 0.07 / r, t + 0.25, d, 0.002, 0.5));
    return out;
  },
  link: (t, d) => [tone('sine', 1568, 1568, 0.22, 0.09, t, d, 0.002, 0.5), tone('sine', 2352, 2352, 0.18, 0.05, t, d, 0.002, 0.5)],
  unlink: (t, d) => [tone('sine', 1200, 800, 0.12, 0.04, t, d)],
  shuffle: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    for (let i = 0; i < 4; i++) out.push(noise(0.03, 'bandpass', 2500 + i * 300, 2000, 1.2, 0.12, t + i * 0.03, d));
    return out;
  },
  lock: (t, d) => [tone('square', 1800, 1200, 0.02, 0.07, t, d), noise(0.04, 'bandpass', 4000, 3000, 3, 0.14, t, d), tone('square', 900, 700, 0.02, 0.05, t + 0.05, d)],
  page: (t, d) => [noise(0.09, 'bandpass', 3000, 1500, 0.8, 0.14, t, d), noise(0.05, 'highpass', 5000, 5000, 0.7, 0.05, t + 0.05, d)],
  coinUp: (t, d, a) => [tone('sine', mtof(84 + a), mtof(84 + a), 0.09, 0.09, t, d, 0.002, 0.25)],
  fight: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    for (let i = 0; i < 2; i++) {
      out.push(tone('sine', 80, 45, 0.25, 0.5, t + i * 0.18, d));
      out.push(noise(0.08, 'lowpass', 900, 300, 0.7, 0.3, t + i * 0.18, d));
    }
    const ctx = au.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t + 0.36);
    f.frequency.linearRampToValueAtTime(1800, t + 0.5);
    f.connect(d);
    out.push(tone('sawtooth', 220, 220, 0.38, 0.16, t + 0.36, f, 0.04, 0.4));
    out.push(tone('sawtooth', 330, 330, 0.38, 0.1, t + 0.36, f, 0.04, 0.4));
    return out;
  },
  swish: (t, d) => [noise(0.09, 'bandpass', 1200, 4200, 2.5, 0.16, t, d)],
  twang: (t, d) => {
    const p = pluck(57, 0.5, t, d, 1, 0.15);
    return p ? [p, noise(0.03, 'highpass', 4000, 4000, 0.7, 0.05, t, d)] : [noise(0.05, 'bandpass', 300, 200, 4, 0.2, t, d)];
  },
  whoosh: (t, d) => [noise(0.16, 'lowpass', 300, 900, 1, 0.22, t, d), tone('sine', 90, 60, 0.15, 0.15, t, d)],
  zap: (t, d) => {
    const ctx = au.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 55;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const g = ctx.createGain();
    env(g, t, 0.1, 0.005, 0.18);
    o.connect(g);
    g.connect(d);
    o.start(t);
    o.stop(t + 0.25);
    lfo.start(t);
    lfo.stop(t + 0.25);
    return [o, lfo, noise(0.12, 'highpass', 3000, 6000, 0.7, 0.08, t, d)];
  },
  hit: (t, d) => [noise(0.03, 'bandpass', 2000, 1500, 1.2, 0.3, t, d), tone('sine', 400, 120, 0.07, 0.25, t, d)],
  bigHit: (t, d) => [noise(0.04, 'bandpass', 2000, 1200, 1.2, 0.36, t, d), tone('sine', 400, 110, 0.08, 0.3, t, d), tone('sine', 90, 45, 0.22, 0.45, t, d)],
  playerHit: (t, d) => [tone('sine', 160, 60, 0.16, 0.4, t, d), noise(0.06, 'lowpass', 900, 300, 0.7, 0.2, t, d)],
  shield: (t, d) => {
    const ctx = au.ctx!;
    const o = tone('triangle', 880, 880, 0.25, 0.12, t, d, 0.002, 0.35);
    const m = ctx.createOscillator();
    m.frequency.value = 2210;
    const mg = ctx.createGain();
    mg.gain.value = 300;
    m.connect(mg);
    mg.connect(o.frequency);
    m.start(t);
    m.stop(t + 0.3);
    return [o, m];
  },
  shieldBreak: (t, d) => [noise(0.18, 'highpass', 3000, 6000, 0.7, 0.24, t, d), tone('sine', 2600, 2200, 0.12, 0.06, t, d), tone('sine', 3400, 3000, 0.1, 0.05, t + 0.02, d), tone('sine', 1900, 1700, 0.14, 0.05, t + 0.04, d)],
  heal: (t, d) => [tone('sine', 880, 880, 0.3, 0.07, t, d, 0.01, 0.5), tone('sine', 1108, 1108, 0.3, 0.06, t + 0.07, d, 0.01, 0.5), tone('sine', 1318, 1318, 0.35, 0.06, t + 0.14, d, 0.01, 0.5)],
  bubble: (t, d) => {
    const ctx = au.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(400, t + 0.12);
    const g = ctx.createGain();
    env(g, t, 0.1, 0.005, 0.12);
    o.connect(g);
    g.connect(d);
    o.start(t);
    o.stop(t + 0.16);
    return [o];
  },
  gulp: (t, d) => [tone('sine', 220, 120, 0.12, 0.16, t, d), noise(0.06, 'lowpass', 500, 300, 2, 0.06, t, d)],
  stun: (t, d) => [tone('sine', 300, 900, 0.12, 0.12, t, d), tone('sine', 900, 400, 0.18, 0.1, t + 0.12, d), tone('sine', 2800, 3400, 0.05, 0.05, t + 0.32, d), tone('sine', 3000, 3600, 0.05, 0.05, t + 0.42, d)],
  potion: (t, d) => [tone('sine', 600, 1400, 0.05, 0.2, t, d), noise(0.3, 'bandpass', 800, 400, 1.5, 0.12, t + 0.05, d), tone('sine', 1318, 1318, 0.4, 0.08, t + 0.2, d, 0.01, 0.5), tone('sine', 1760, 1760, 0.4, 0.06, t + 0.28, d, 0.01, 0.5)],
  revive: (t, d) => {
    const out: AudioScheduledSourceNode[] = [noise(0.6, 'bandpass', 300, 3000, 1, 0.22, t, d, 0.2)];
    [62, 66, 69, 74].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.9, 0.1, t + 0.25 + i * 0.05, d, 0.02, 0.5)));
    out.push(tone('sine', 2600, 3200, 0.08, 0.05, t + 0.7, d));
    out.push(tone('sine', 2800, 3500, 0.08, 0.05, t + 0.82, d));
    return out;
  },
  roar: (t, d) => {
    const ctx = au.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1400, t + 0.25);
    f.frequency.linearRampToValueAtTime(400, t + 0.7);
    f.connect(d);
    const out: AudioScheduledSourceNode[] = [tone('sawtooth', 90, 70, 0.7, 0.28, t, f, 0.05), tone('sawtooth', 93, 72, 0.7, 0.22, t, f, 0.05), noise(0.6, 'bandpass', 600, 300, 0.8, 0.2, t, f, 0.05)];
    for (const r of [1, 1.47, 2.09, 2.76]) out.push(tone('sine', 110 * r, 105 * r, 1.4, 0.12 / r, t + 0.2, d, 0.005, 0.5));
    return out;
  },
  fire: (t, d) => [noise(0.7, 'lowpass', 400, 1600, 0.8, 0.34, t, d, 0.08), tone('sine', 70, 50, 0.6, 0.25, t, d)],
  storm: (t, d) => [noise(1.6, 'bandpass', 300, 900, 1.5, 0.18, t, d, 0.4, 0.4)],
  kill: (t, d) => {
    const out: AudioScheduledSourceNode[] = [noise(0.06, 'bandpass', 1500, 800, 1, 0.4, t, d), tone('sine', 100, 40, 0.3, 0.5, t, d)];
    out.push(noise(0.08, 'lowpass', 1200, 400, 0.7, 0.3, t + 0.35, d));
    out.push(tone('sine', 160, 80, 0.1, 0.3, t + 0.35, d));
    [74, 78, 81].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.25, 0.1, t + 0.55 + i * 0.09, d, 0.005, 0.4)));
    out.push(tone('triangle', mtof(86), mtof(86), 0.5, 0.11, t + 0.82, d, 0.005, 0.5));
    return out;
  },
  playerDown: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    [69, 65, 62].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.32, 0.12, t + i * 0.18, d, 0.01, 0.4)));
    out.push(tone('sine', 70, 40, 0.4, 0.35, t + 0.5, d));
    return out;
  },
  heartBreak: (t, d) => [noise(0.1, 'highpass', 2500, 4000, 1, 0.24, t, d), tone('sine', 2400, 1800, 0.08, 0.07, t, d), tone('sine', 3100, 2600, 0.06, 0.05, t + 0.03, d)],
  score: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    [79, 83, 86, 91].forEach((m, i) => out.push(tone('sine', mtof(m), mtof(m), 0.12, 0.07, t + i * 0.05, d, 0.002, 0.3)));
    return out;
  },
  victory: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    [62, 66, 69, 74, 78].forEach((m, i) => out.push(tone('sawtooth', mtof(m), mtof(m), 0.6, 0.04, t + i * 0.08, d, 0.02, 0.5)));
    [62, 66, 69, 74].forEach((m) => out.push(tone('triangle', mtof(m), mtof(m), 1.4, 0.08, t + 0.5, d, 0.03, 0.6)));
    for (let i = 0; i < 10; i++) out.push(noise(0.05, 'lowpass', 700, 400, 0.7, 0.12 + i * 0.01, t + i * 0.05, d));
    return out;
  },
  defeat: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    [74, 72, 69, 65, 62].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.4, 0.1, t + i * 0.22, d, 0.01, 0.5)));
    return out;
  },
  stamp: (t, d) => [tone('sine', 120, 50, 0.18, 0.5, t, d), noise(0.05, 'lowpass', 800, 300, 0.7, 0.3, t, d)],
  record: (t, d) => {
    const out = R.stamp(t, d, 0);
    [79, 83, 86, 91, 95].forEach((m, i) => out.push(tone('triangle', mtof(m), mtof(m), 0.25, 0.09, t + 0.15 + i * 0.06, d, 0.004, 0.4)));
    for (const r of [1, 2.76, 5.4]) out.push(tone('sine', 660 * r, 660 * r, 1.2, 0.07 / r, t + 0.5, d, 0.002, 0.5));
    return out;
  },
  brush: (t, d) => [noise(0.4, 'bandpass', 500, 2400, 0.9, 0.16, t, d, 0.08)],
  heartbeat: (t, d) => [tone('sine', 60, 45, 0.12, 0.35, t, d), tone('sine', 58, 42, 0.14, 0.28, t + 0.2, d)],
  speed: (t, d, a) => [tone('square', 700 + a * 200, 600 + a * 200, 0.02, 0.08, t, d), noise(0.02, 'lowpass', 2000, 1000, 0.7, 0.08, t, d)],
  drum: (t, d) => [tone('sine', 80, 45, 0.25, 0.5, t, d), noise(0.08, 'lowpass', 900, 300, 0.7, 0.3, t, d)],
  gong: (t, d) => {
    const out: AudioScheduledSourceNode[] = [];
    for (const r of [1, 1.47, 2.09, 2.76, 3.9]) out.push(tone('sine', 98 * r, 96 * r, 2.2, 0.12 / r, t, d, 0.005, 0.6));
    out.push(tone('sine', 55, 45, 1.2, 0.3, t, d, 0.01));
    return out;
  },
  hum: (t, d) => [tone('sawtooth', 55, 55, 1.2, 0.06, t, d, 0.3), tone('sawtooth', 55.6, 55.6, 1.2, 0.06, t, d, 0.3)],
  cloth: (t, d) => [noise(0.08, 'bandpass', 1500, 1200, 0.7, 0.05, t, d, 0.03)],
};

const MINOR = new Set(['hit', 'shield', 'swish', 'tick', 'cloth', 'bubble', 'gulp', 'coinUp']);

export type SfxName = keyof typeof R;

/** 播放音效；arg 为音高偏移等参数 */
export function sfx(name: string, arg = 0, delay = 0): void {
  const r = R[name];
  if (!r || !gate(name, MINOR.has(name))) return;
  try {
    const ctx = au.ctx!;
    const t = ctx.currentTime + 0.005 + delay;
    const nodes = r(t, au.sfx, arg);
    voice(nodes, t + 1.5);
  } catch {
    /* ignore */
  }
}
