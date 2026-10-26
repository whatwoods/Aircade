// Synthesised sound effects (docs §5.2 / §5.4) with per-category rate limits and a 32-voice cap.
import { audio } from './audio';

const PENTA = [0, 3, 5, 7, 10];
const C4 = 261.63;

function semi(n: number): number {
  return C4 * Math.pow(2, n / 12);
}
/** pentatonic C-minor note index → frequency */
export function penta(i: number, octave = 0): number {
  const o = Math.floor(i / 5);
  const k = ((i % 5) + 5) % 5;
  return semi(PENTA[k]! + 12 * (o + octave));
}

type Wave = OscillatorType;

interface ToneOpts {
  at?: number;
  attack?: number;
  filter?: BiquadFilterType;
  ff?: number;
  ff1?: number;
  q?: number;
  detune?: number;
  rev?: number;
  shape?: boolean;
  lin?: boolean;
  dest?: AudioNode;
}

export class Sfx {
  private voices = 0;
  private last = new Map<string, number>();
  private wind: { src: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode } | null = null;
  pickupStep = 0;
  pickupT = 0;

  private ok(cat: string, gap: number): boolean {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running') return false;
    if (this.voices >= 32) return false;
    const now = ctx.currentTime;
    const l = this.last.get(cat) ?? -1;
    if (now - l < gap) return false;
    this.last.set(cat, now);
    return true;
  }

  private track(node: AudioScheduledSourceNode): void {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
  }

  tone(type: Wave, f0: number, f1: number, dur: number, vol: number, o: ToneOpts = {}): void {
    const ctx = audio.ctx!;
    const t = (o.at ?? ctx.currentTime) + 0.002;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (o.lin) osc.frequency.linearRampToValueAtTime(f1, t + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    }
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const atk = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.ff ?? 2000, t);
      if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + dur);
      f.Q.value = o.q ?? 0.8;
      node.connect(f);
      node = f;
    }
    if (o.shape) {
      const ws = ctx.createWaveShaper();
      ws.curve = audio.curve();
      node.connect(ws);
      node = ws;
    }
    node.connect(g);
    g.connect(o.dest ?? audio.sfxBus);
    if (o.rev) {
      const s = ctx.createGain();
      s.gain.value = o.rev;
      g.connect(s);
      s.connect(audio.reverbSend);
    }
    osc.start(t);
    osc.stop(t + dur + 0.02);
    this.track(osc);
  }

  noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, o: ToneOpts = {}): void {
    const ctx = audio.ctx!;
    const t = (o.at ?? ctx.currentTime) + 0.002;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    const atk = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    if (o.lin) g.gain.linearRampToValueAtTime(vol, t + atk);
    else g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest ?? audio.sfxBus);
    if (o.rev) {
      const s = ctx.createGain();
      s.gain.value = o.rev;
      g.connect(s);
      s.connect(audio.reverbSend);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.track(src);
  }

  // ------------------------------------------------------------------------------ recipes
  fire(elem: number): void {
    if (!this.ok('fire', 0.03)) return;
    if (elem === 1) this.tone('square', 640, 320, 0.05, 0.05, { filter: 'lowpass', ff: 1800 });
    else if (elem === 2) this.tone('triangle', 1500, 950, 0.045, 0.07, { filter: 'highpass', ff: 600 });
    else if (elem === 3 || elem === 4) {
      this.tone('square', 760, 380, 0.05, 0.045, { filter: 'lowpass', ff: 2200 });
      this.tone('square', 770, 384, 0.05, 0.035, { filter: 'lowpass', ff: 1500, detune: 14 });
    } else this.tone('square', 880, 440, 0.04, 0.05, { filter: 'lowpass', ff: 2600 });
  }

  catchBall(charges: number): void {
    if (!this.ok('catch', 0.04)) return;
    const f = 220 * Math.pow(2, (charges * 3) / 12);
    this.tone('sine', f, f * 0.96, 0.07, 0.22);
    this.noise(0.02, 0.08, 'bandpass', 3000, 3000, 1.5);
  }

  perfect(): void {
    if (!this.ok('perfect', 0.08)) return;
    this.tone('sine', 880, 880, 0.32, 0.14, { rev: 0.4 });
    this.tone('sine', 1320, 1320, 0.32, 0.1, { rev: 0.4 });
    this.tone('triangle', 2640, 2640, 0.12, 0.04, { attack: 0.002 });
  }

  miss(): void {
    if (!this.ok('miss', 0.08)) return;
    this.tone('sine', 160, 90, 0.12, 0.14);
  }

  wall(): void {
    if (!this.ok('wall', 0.06)) return;
    this.tone('sine', 1200, 1150, 0.015, 0.05);
  }

  brickHit(col: number, tier: number): void {
    if (!this.ok('hit', 0.035)) return;
    const oct = tier >= 4 ? 2 : tier >= 2 ? 1 : 0;
    const f = penta(col, oct);
    this.tone('triangle', f, f, 0.09, 0.07, { filter: 'lowpass', ff: 5000 });
  }

  brickBreak(kind: number): void {
    if (!this.ok('break', 0.03)) return;
    if (kind === 2) {
      // elite
      this.noise(0.18, 0.2, 'bandpass', 1400, 600, 0.8);
      this.tone('sine', 90, 40, 0.4, 0.3);
      this.tone('sine', 523, 523, 0.5, 0.06, { rev: 0.5 });
      this.tone('sine', 659, 659, 0.5, 0.05, { rev: 0.5 });
      this.tone('sine', 784, 784, 0.5, 0.05, { rev: 0.5 });
      return;
    }
    const low = kind === 1 ? 0.5 : 1;
    this.noise(0.08, 0.13, 'bandpass', 2000 * low, 1500 * low, 1.2);
    this.tone('sine', 900 * low, 300 * low, 0.06, 0.08);
    this.tone('sine', 3400 * low, 3300 * low, 0.05, 0.025);
    this.tone('sine', 4700 * low, 4600 * low, 0.04, 0.018);
    if (kind === 1) this.noise(0.06, 0.06, 'highpass', 5000, 5000, 3);
  }

  prismChime(): void {
    if (!this.ok('prism', 0.1)) return;
    const ctx = audio.ctx!;
    for (let i = 0; i < 3; i++) this.tone('sine', penta(5 + i * 2), penta(5 + i * 2), 0.18, 0.06, { at: ctx.currentTime + i * 0.05, rev: 0.3 });
  }

  crackle(): void {
    if (!this.ok('burn', 0.12)) return;
    this.noise(0.03, 0.05, 'highpass', 4000, 6000, 1);
  }

  chill(): void {
    if (!this.ok('chill', 0.08)) return;
    this.tone('sine', 3200, 3200, 0.05, 0.03, { filter: 'lowpass', ff: 8000 });
  }

  freeze(): void {
    if (!this.ok('freeze', 0.06)) return;
    this.tone('sine', 1800, 1800, 0.08, 0.06);
    this.tone('sine', 2700, 2400, 0.08, 0.04);
  }

  thermal(): void {
    if (!this.ok('thermal', 0.08)) return;
    this.noise(0.25, 0.12, 'highpass', 2000, 7000, 0.7);
    this.noise(0.06, 0.08, 'bandpass', 3500, 2500, 2);
  }

  boom(size: number): void {
    if (!this.ok(size > 1 ? 'boomL' : 'boom', size > 1 ? 0.06 : 0.05)) return;
    const d = 0.2 + 0.1 * size;
    this.tone('sine', 120, 45, d, 0.22 + 0.08 * size);
    this.noise(d, 0.1 + 0.05 * size, 'lowpass', 1200, 200, 0.7, { shape: size > 1 });
  }

  split(): void {
    if (!this.ok('split', 0.04)) return;
    this.tone('sine', 2400, 2400, 0.02, 0.04);
  }

  pierce(): void {
    if (!this.ok('pierce', 0.06)) return;
    this.noise(0.05, 0.06, 'bandpass', 1500, 6000, 3);
  }

  pickup(): void {
    if (!this.ok('pickup', 0.03)) return;
    const ctx = audio.ctx!;
    if (ctx.currentTime - this.pickupT > 0.3) this.pickupStep = 0;
    this.pickupT = ctx.currentTime;
    const f = penta(5 + Math.min(this.pickupStep, 14));
    this.pickupStep++;
    this.tone('sine', f, f * 1.02, 0.06, 0.06);
  }

  levelUp(): void {
    if (!this.ok('lvl', 0.2)) return;
    const ctx = audio.ctx!;
    const notes = [0, 3, 7, 12];
    for (let i = 0; i < 4; i++) {
      const f = semi(notes[i]! + 12);
      const at = ctx.currentTime + i * 0.07;
      this.tone('sawtooth', f, f, 0.35, 0.05, { at, filter: 'lowpass', ff: 3000, detune: -8, rev: 0.3 });
      this.tone('sawtooth', f, f, 0.35, 0.05, { at, filter: 'lowpass', ff: 3000, detune: 8 });
    }
  }

  cardPick(): void {
    if (!this.ok('card', 0.1)) return;
    this.noise(0.25, 0.07, 'bandpass', 600, 3000, 1);
    for (const n of [0, 7, 12]) this.tone('triangle', semi(n + 12), semi(n + 12), 0.3, 0.05, { rev: 0.3 });
  }

  reroll(): void {
    if (!this.ok('reroll', 0.1)) return;
    const ctx = audio.ctx!;
    for (let i = 0; i < 3; i++) this.noise(0.03, 0.08, 'bandpass', 2500 + i * 600, 2500, 2, { at: ctx.currentTime + i * 0.06 });
  }

  evolve(): void {
    if (!this.ok('evolve', 0.5)) return;
    for (const n of [0, 7, 12, 15, 19]) {
      this.tone('sawtooth', semi(n), semi(n), 1.4, 0.04, { attack: 0.1, filter: 'lowpass', ff: 2500, detune: -10, rev: 0.6 });
      this.tone('sawtooth', semi(n), semi(n), 1.4, 0.04, { attack: 0.1, filter: 'lowpass', ff: 2500, detune: 10 });
    }
    this.tone('sine', 70, 40, 1.0, 0.25);
    this.tone('triangle', 3136, 3136, 0.5, 0.03, { rev: 0.5 });
  }

  advance(): void {
    if (!this.ok('advance', 0.2)) return;
    this.tone('sine', 55, 50, 0.12, 0.3);
    this.noise(0.02, 0.06, 'highpass', 2500, 2500, 2);
  }

  alarm(): void {
    if (!this.ok('alarm', 0.4)) return;
    const ctx = audio.ctx!;
    this.tone('square', 880, 880, 0.09, 0.05, { filter: 'lowpass', ff: 3000 });
    this.tone('square', 660, 660, 0.09, 0.05, { filter: 'lowpass', ff: 3000, at: ctx.currentTime + 0.1 });
  }

  breach(): void {
    if (!this.ok('breach', 0.12)) return;
    this.alarmForce();
    this.tone('sawtooth', 600, 80, 0.35, 0.12, { shape: true, filter: 'lowpass', ff: 3000 });
    this.tone('sine', 70, 35, 0.35, 0.35);
  }
  private alarmForce(): void {
    const ctx = audio.ctx!;
    this.tone('square', 880, 880, 0.08, 0.05, { filter: 'lowpass', ff: 3000 });
    this.tone('square', 660, 660, 0.08, 0.05, { filter: 'lowpass', ff: 3000, at: ctx.currentTime + 0.09 });
  }

  barrier(): void {
    if (!this.ok('barrier', 0.15)) return;
    this.tone('sawtooth', 220, 180, 0.3, 0.08, { filter: 'bandpass', ff: 1800, q: 6 });
    this.tone('sine', 2600, 2400, 0.25, 0.05, { rev: 0.4 });
  }

  playerHit(): void {
    if (!this.ok('phit', 0.1)) return;
    this.tone('square', 330, 110, 0.22, 0.12, { filter: 'lowpass', ff: 2500 });
    this.noise(0.15, 0.1, 'lowpass', 2000, 400, 0.7);
  }

  pop(): void {
    if (!this.ok('pop', 0.04)) return;
    this.tone('sine', 900, 500, 0.05, 0.08);
  }

  comboTier(tier: number): void {
    if (!this.ok('ctier', 0.1)) return;
    const f = penta(5 + tier * 2);
    this.tone('sine', f, f, 0.4, 0.09, { rev: 0.4 });
    this.tone('sine', f * 2, f * 2, 0.25, 0.04);
  }

  milestone(): void {
    if (!this.ok('mile', 0.3)) return;
    const ctx = audio.ctx!;
    for (let i = 0; i < 5; i++) this.tone('triangle', penta(5 + i * 2), penta(5 + i * 2), 0.2, 0.06, { at: ctx.currentTime + i * 0.05, rev: 0.3 });
    this.noise(0.6, 0.06, 'highpass', 6000, 9000, 0.7, { at: ctx.currentTime + 0.2 });
  }

  comboBreak(): void {
    if (!this.ok('cbreak', 0.2)) return;
    this.tone('sawtooth', 600, 90, 0.4, 0.06, { filter: 'lowpass', ff: 2000, ff1: 300 });
  }

  whoosh(vol = 0.08): void {
    if (!this.ok('whoosh', 0.15)) return;
    this.noise(0.4, vol, 'bandpass', 300, 2400, 1.2, { attack: 0.15, lin: true });
  }

  waveStart(): void {
    if (!this.ok('wave', 0.5)) return;
    this.noise(0.45, 0.07, 'bandpass', 400, 2600, 1, { attack: 0.18, lin: true });
    for (const n of [0, 7, 10]) this.tone('sawtooth', semi(n), semi(n), 0.3, 0.035, { filter: 'lowpass', ff: 2200, at: audio.ctx!.currentTime + 0.25 });
  }

  bossWarning(): void {
    if (!this.ok('bwarn', 1)) return;
    const ctx = audio.ctx!;
    for (let i = 0; i < 6; i++) {
      const f = i % 2 ? 440 : 587;
      this.tone('sawtooth', f, f, 0.22, 0.06, { at: ctx.currentTime + i * 0.26, filter: 'lowpass', ff: 2400 });
    }
  }

  bossArrive(): void {
    if (!this.ok('barrive', 0.3)) return;
    this.tone('sawtooth', 70, 40, 0.8, 0.14, { shape: true, filter: 'lowpass', ff: 600 });
    this.tone('sine', 55, 30, 0.6, 0.35);
    this.noise(0.5, 0.15, 'lowpass', 1500, 100, 0.7, { rev: 0.4 });
  }

  bossHit(): void {
    if (!this.ok('bhit', 0.05)) return;
    const f = 520 + Math.random() * 180;
    this.tone('square', f, f * 0.9, 0.05, 0.04, { filter: 'bandpass', ff: 1800, q: 4 });
  }

  glass(): void {
    if (!this.ok('glass', 0.06)) return;
    this.noise(0.18, 0.12, 'highpass', 3000, 6000, 1);
    this.tone('sine', 2800, 2600, 0.2, 0.04);
    this.tone('sine', 4100, 3900, 0.15, 0.03);
  }

  telegraph(): void {
    if (!this.ok('tele', 0.2)) return;
    this.tone('sine', 300, 1400, 0.45, 0.05, { attack: 0.2 });
  }

  bossPhase(): void {
    if (!this.ok('bphase', 0.5)) return;
    this.bossArrive();
    this.tone('sawtooth', 110, 55, 0.7, 0.1, { shape: true, filter: 'lowpass', ff: 900 });
  }

  bossDefeat(final: boolean): void {
    if (!final) {
      if (!this.ok('bexpl', 0.025)) return;
      this.tone('sine', 140, 50, 0.25, 0.15);
      this.noise(0.25, 0.1, 'lowpass', 2000, 300, 0.7);
      return;
    }
    if (!this.ok('bfinal', 0.5)) return;
    for (const f of [90, 60, 45]) this.tone('sine', f * 2, f, 1.4, 0.25, { rev: 0.7 });
    this.noise(1.6, 0.25, 'lowpass', 4000, 120, 0.6, { rev: 0.8, shape: true });
  }

  swell(): void {
    if (!this.ok('swell', 0.5)) return;
    this.noise(0.45, 0.16, 'bandpass', 300, 3500, 0.8, { attack: 0.42, lin: true });
  }

  heal(): void {
    if (!this.ok('heal', 0.15)) return;
    for (const n of [0, 4, 7]) this.tone('sine', semi(n + 12), semi(n + 12), 0.45, 0.06, { rev: 0.4 });
  }

  death(): void {
    if (!this.ok('death', 1)) return;
    this.noise(0.4, 0.25, 'lowpass', 3000, 200, 0.7);
    this.tone('sawtooth', 880, 40, 1.2, 0.12, { filter: 'lowpass', ff: 3000, ff1: 200 });
    this.tone('sine', 60, 30, 0.6, 0.35);
  }

  fanfare(): void {
    if (!this.ok('fanfare', 1)) return;
    const ctx = audio.ctx!;
    const chords = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]];
    chords.forEach((ch, i) => {
      for (const n of ch) {
        for (const dt of [-12, 0, 12]) this.tone('sawtooth', semi(n), semi(n), 0.5, 0.025, { at: ctx.currentTime + i * 0.22, detune: dt, filter: 'lowpass', ff: 3000, rev: 0.4 });
      }
      this.tone('sine', 120, 45, 0.18, 0.25, { at: ctx.currentTime + i * 0.22 });
    });
  }

  ui(): void {
    if (!this.ok('ui', 0.03)) return;
    this.tone('sine', 1400, 1400, 0.012, 0.06);
  }

  tick(): void {
    if (!this.ok('tick', 0.035)) return;
    this.tone('square', 2200, 2200, 0.008, 0.02, { filter: 'highpass', ff: 1000 });
  }

  enemyShot(): void {
    if (!this.ok('eshot', 0.08)) return;
    this.tone('square', 520, 260, 0.08, 0.035, { filter: 'lowpass', ff: 1800 });
  }

  laser(): void {
    if (!this.ok('laser', 0.1)) return;
    this.tone('sawtooth', 160, 120, 0.6, 0.1, { filter: 'lowpass', ff: 2400, shape: true });
    this.noise(0.6, 0.08, 'bandpass', 900, 900, 1);
  }

  slam(): void {
    if (!this.ok('slam', 0.2)) return;
    this.tone('sine', 80, 30, 0.5, 0.4);
    this.noise(0.4, 0.2, 'lowpass', 900, 100, 0.7, { shape: true });
  }

  zap(): void {
    if (!this.ok('zap', 0.08)) return;
    this.tone('sawtooth', 1800, 600, 0.06, 0.035, { filter: 'bandpass', ff: 2000, q: 3 });
  }

  shimmer(): void {
    if (!this.ok('shimmer', 0.3)) return;
    for (let i = 0; i < 3; i++) this.tone('sine', penta(10 + i), penta(10 + i), 0.3, 0.025, { at: audio.ctx!.currentTime + i * 0.04, rev: 0.4 });
  }

  /** continuous wind layer while the core moves fast (> 800 u/s) */
  windLevel(speed: number): void {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.wind) {
      const src = ctx.createBufferSource();
      src.buffer = audio.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(audio.sfxBus);
      src.start();
      this.wind = { src, g, f };
    }
    const v = speed > 800 ? Math.min(1, (speed - 800) / 1200) * 0.05 : 0;
    this.wind.g.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
    this.wind.f.frequency.setTargetAtTime(700 + speed * 0.4, ctx.currentTime, 0.1);
  }
}

export const sfx = new Sfx();
