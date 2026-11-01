// Procedural BGM: 120 BPM C minor, 25 ms look-ahead scheduler (0.12 s ahead). Normal: Cm–A♭–E♭–B♭ (2 bars each);
// boss: Cm–D♭–Cm–B° with distorted 16th bass + snare; title: pad + slow arpeggio. Exposes a beat clock (docs §5.4).
import { audio } from './audio';

const STEP = 60 / 120 / 4; // 16th
const LOOK = 0.12;

type Mode = 'off' | 'title' | 'game' | 'boss';

const NORMAL = [
  { root: 0, tones: [0, 3, 7] },
  { root: -4, tones: [-4, 0, 3] },
  { root: 3, tones: [3, 7, 10] },
  { root: -2, tones: [-2, 2, 5] },
];
const BOSS = [
  { root: 0, tones: [0, 3, 7] },
  { root: 1, tones: [1, 5, 8] },
  { root: 0, tones: [0, 3, 7] },
  { root: -1, tones: [-1, 2, 5] },
];

function hz(semi: number, octave: number): number {
  return 261.63 * Math.pow(2, semi / 12 + octave);
}

export class Music {
  mode: Mode = 'off';
  intensity = 0.3;
  targetIntensity = 0.3;
  lead = false;
  heartbeat = false;
  glitch = false;
  private anchor = 0;
  private step = 0;
  private nextT = 0;
  private timer = 0;
  private padNodes: { o: OscillatorNode; g: GainNode }[] = [];

  /** fractional beat position of the music clock (0..1), or -1 when not running */
  beatPhase(): number {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running' || this.mode === 'off' || this.mode === 'title') return -1;
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const b = (ctx.currentTime - lat - this.anchor) / (STEP * 4);
    return b - Math.floor(b);
  }

  setMode(m: Mode): void {
    if (m === this.mode) return;
    const prev = this.mode;
    this.mode = m;
    const ctx = audio.ctx;
    if (!ctx) return;
    if (m === 'off') {
      this.stopPad(0.6);
      return;
    }
    if (prev === 'off' || !this.timer) this.start();
    else if ((prev === 'title') !== (m === 'title')) {
      // re-anchor on mode family change so bars restart cleanly
      this.stopPad(0.4);
    }
  }

  private start(): void {
    const ctx = audio.ctx;
    if (!ctx) return;
    this.anchor = ctx.currentTime + 0.1;
    this.nextT = this.anchor;
    this.step = 0;
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** hard re-sync of the bar grid (new run) */
  restart(): void {
    if (!audio.ctx) return;
    this.stopPad(0.3);
    this.start();
  }

  private tick(): void {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running' || this.mode === 'off') return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.05;
    // if the context stalled (tab hidden), skip ahead instead of bursting notes
    if (this.nextT < ctx.currentTime - 0.2) {
      const skip = Math.ceil((ctx.currentTime - this.nextT) / STEP);
      this.nextT += skip * STEP;
      this.step += skip;
    }
    while (this.nextT < ctx.currentTime + LOOK) {
      this.schedule(this.step, this.nextT);
      this.step++;
      this.nextT += STEP;
    }
  }

  private schedule(step: number, t: number): void {
    const boss = this.mode === 'boss';
    const title = this.mode === 'title';
    const prog = boss ? BOSS : NORMAL;
    const chordIdx = Math.floor(step / 32) % 4;
    const ch = prog[chordIdx]!;
    const s16 = step % 16;
    const I = this.intensity;
    if (step % 32 === 0) this.pad(ch.tones, t, title ? 0.06 : 0.045 + 0.02 * I, STEP * 32);
    if (title) {
      if (step % 2 === 0) {
        const n = ch.tones[(step / 2) % 3]!;
        this.note('triangle', hz(n, step % 8 < 4 ? 0 : 1), t, STEP * 3, 0.05, 1800);
      }
      return;
    }
    // kick: four on the floor
    if (s16 % 4 === 0) this.kick(t, 0.5 + 0.35 * I);
    // snare on 2 and 4 (boss)
    if (boss && (s16 === 4 || s16 === 12)) this.snare(t, 0.18 + 0.1 * I);
    // hats
    const hatV = (s16 % 4 === 2 ? 0.05 : 0.025) * (0.4 + I);
    this.hat(t, hatV);
    if (this.glitch && Math.random() < 0.12) this.hat(t + STEP / 2, hatV * 1.4);
    // bass
    if (boss) {
      const n = s16 % 4 === 3 ? ch.root + 12 : ch.root;
      this.bass(hz(n, -2), t, STEP * 0.9, 0.11 + 0.05 * I, true);
    } else if (step % 2 === 0) {
      const arp = [0, 12, 7, 12];
      const n = ch.root + arp[(step / 2) % 4]!;
      this.bass(hz(n, -2), t, STEP * 1.8, 0.12 + 0.05 * I, false);
    }
    // lead arpeggio (from wave 6 / high intensity)
    if (this.lead && I > 0.35) {
      const n = ch.tones[step % 3]! + (step % 6 < 3 ? 12 : 24);
      this.note('square', hz(n, 0), t, STEP * 0.8, 0.018 * I, 2600);
    }
    if (this.heartbeat && (step % 8 === 0 || step % 8 === 2)) {
      this.kick(t, step % 8 === 0 ? 0.35 : 0.22, 60);
    }
  }

  private out(): AudioNode {
    return audio.musicBus;
  }

  private kick(t: number, v: number, f0 = 150): void {
    const ctx = audio.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g);
    g.connect(this.out());
    o.start(t);
    o.stop(t + 0.27);
  }

  private snare(t: number, v: number): void {
    const ctx = audio.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(f);
    f.connect(g);
    g.connect(this.out());
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.18);
    this.note('triangle', 180, t, 0.08, v * 0.5, 2000);
  }

  private hat(t: number, v: number): void {
    const ctx = audio.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(this.out());
    src.start(t, Math.random() * 0.8);
    src.stop(t + 0.05);
  }

  private bass(f0: number, t: number, dur: number, v: number, dist: boolean): void {
    const ctx = audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(200 + 1400 * this.intensity, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    let node: AudioNode = f;
    if (dist) {
      const ws = ctx.createWaveShaper();
      ws.curve = audio.curve();
      f.connect(ws);
      node = ws;
    }
    node.connect(g);
    g.connect(this.out());
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private note(type: OscillatorType, f0: number, t: number, dur: number, v: number, cutoff: number): void {
    const ctx = audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.out());
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private pad(tones: number[], t: number, v: number, dur: number): void {
    const ctx = audio.ctx!;
    this.stopPad(0.5, t);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    f.connect(this.out());
    for (const n of tones) {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n, -1);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v / tones.length, t + 0.6);
        g.gain.setValueAtTime(v / tones.length, t + dur - 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
        o.connect(g);
        g.connect(f);
        o.start(t);
        o.stop(t + dur + 0.45);
        this.padNodes.push({ o, g });
      }
    }
    if (this.padNodes.length > 24) this.padNodes.splice(0, this.padNodes.length - 24);
  }

  private stopPad(fade: number, at?: number): void {
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    for (const p of this.padNodes) {
      try {
        p.g.gain.cancelScheduledValues(t);
        p.g.gain.setTargetAtTime(0.0001, t, fade / 4);
        p.o.stop(t + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.padNodes.length = 0;
  }
}

export const music = new Music();
