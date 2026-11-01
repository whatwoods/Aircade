/**
 * 音色配方（docs §5.2 音效列 / §5.3）。全部 WebAudio 程序化合成，所有增益走包络（无爆音）。
 * 合成音阶：C5 起五声大调 14 音；索引 = (L − 2) + min(连击 − 1, 5)，封顶 13。
 */
import type { AudioEngine } from './audio';

const PENTA_MIDI = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100, 103];
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = PENTA_MIDI.map(mtof);

// 优先级
const P_LOW = 0;
const P_MID = 1;
const P_HIGH = 2;
const P_TOP = 3;

export class Sfx {
  private a: AudioEngine;
  private tension: { osc: OscillatorNode; gain: GainNode } | null = null;
  private lastRoll = 0;

  constructor(a: AudioEngine) {
    this.a = a;
  }

  static noteIndex(level: number, combo: number): number {
    return Math.max(0, Math.min(13, level - 2 + Math.min(Math.max(combo, 1) - 1, 5)));
  }

  // ───────────── 基础积木 ─────────────

  /** 振荡器 + 指数包络：f0 → f1（slide 秒内） */
  private tone(
    out: AudioNode, type: OscillatorType | 'square12', f0: number, f1: number, t: number, dur: number, peak: number,
    attack = 0.003, slide = -1,
  ): OscillatorNode {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    if (type === 'square12') {
      if (this.a.square) o.setPeriodicWave(this.a.square);
      else o.type = 'square';
    } else {
      o.type = type;
    }
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (slide > 0 ? slide : dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  /** 滤波噪声：中心频率 f0 → f1 */
  private noise(
    out: AudioNode, type: BiquadFilterType, f0: number, f1: number, q: number, t: number, dur: number, peak: number,
    attack = 0.003, offset = 0,
  ): void {
    const a = this.a;
    const ctx = a.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, offset % 0.9);
    src.stop(t + dur + 0.02);
  }

  private v(prio: number, dur: number): GainNode | null {
    return this.a.voice(prio, dur);
  }

  private get t(): number {
    return this.a.now + 0.005;
  }

  // ───────────── 瞄准 ─────────────

  aimStart(): void {
    const out = this.v(P_LOW, 0.1);
    if (!out) return;
    const t = this.t;
    this.tone(out, 'triangle', 220, 300, t, 0.06, 0.063);
    this.noise(out, 'bandpass', 1800, 2600, 4, t, 0.06, 0.04);
    this.startTension();
  }

  private startTension(): void {
    this.stopTension();
    const a = this.a;
    if (!a.ready || !a.sfxOn || !a.sfxBus) return;
    const ctx = a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.03, ctx.currentTime, 0.05);
    o.connect(g);
    g.connect(a.sfxBus);
    o.start();
    this.tension = { osc: o, gain: g };
  }

  /** 持续绷紧音：260 → 520 Hz 跟随力度 */
  aimPower(power: number): void {
    const tn = this.tension;
    if (!tn || !this.a.ctx) return;
    tn.osc.frequency.setTargetAtTime(260 + 260 * power, this.a.ctx.currentTime, 0.03);
  }

  stopTension(): void {
    const tn = this.tension;
    if (!tn) return;
    this.tension = null;
    const ctx = this.a.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    tn.gain.gain.cancelScheduledValues(t);
    tn.gain.gain.setTargetAtTime(0, t, 0.02);
    tn.osc.stop(t + 0.12);
  }

  aimStep(): void {
    const out = this.v(P_LOW, 0.04);
    if (!out) return;
    this.tone(out, 'sine', 1200, 1200, this.t, 0.015, 0.05, 0.002);
  }

  aimMax(): void {
    const out = this.v(P_MID, 0.06);
    if (!out) return;
    this.tone(out, 'sine', 1600, 1600, this.t, 0.04, 0.12, 0.002);
  }

  cancel(): void {
    this.stopTension();
    const out = this.v(P_LOW, 0.12);
    if (!out) return;
    this.tone(out, 'sine', 320, 140, this.t, 0.09, 0.1);
  }

  launch(power: number): void {
    this.stopTension();
    const out = this.v(P_HIGH, 0.25);
    if (!out) return;
    const t = this.t;
    const vol = 0.5 + 0.5 * power;
    this.tone(out, 'triangle', 180, 90, t, 0.08, 0.32 * vol);
    this.noise(out, 'bandpass', 2000, 600, 1.5, t, 0.12, 0.22 * vol);
    if (power > 0.7) this.noise(out, 'bandpass', 900, 500, 1.2, t + 0.04, 0.18, 0.05 * power);
  }

  reload(): void {
    const out = this.v(P_LOW, 0.06);
    if (!out) return;
    this.tone(out, 'sine', 900, 700, this.t, 0.03, 0.09, 0.002);
  }

  // ───────────── 碰撞 ─────────────

  wall(speed: number): void {
    if (!this.a.bumpAllowed()) return;
    const out = this.v(P_LOW, 0.18);
    if (!out) return;
    const t = this.t;
    const f = 1240 * (1 + (Math.random() * 2 - 1) * 0.03);
    const vol = Math.min(1, 0.35 + speed / 1500);
    this.tone(out, 'sine', f, f, t, 0.15, 0.13 * vol, 0.002);
    this.tone(out, 'sine', f * 2, f * 2, t, 0.12, 0.052 * vol, 0.002);
  }

  impactSoft(): void {
    const out = this.v(P_MID, 0.08);
    if (!out) return;
    this.tone(out, 'sine', 300, 120, this.t, 0.06, 0.25);
  }

  impactHard(): void {
    const out = this.v(P_HIGH, 0.12);
    if (!out) return;
    const t = this.t;
    this.noise(out, 'lowpass', 3000, 800, 0.7, t, 0.06, 0.35, 0.001);
    this.tone(out, 'sine', 180, 60, t, 0.09, 0.45);
  }

  bump(speed: number): void {
    if (!this.a.bumpAllowed()) return;
    const out = this.v(P_LOW, 0.16);
    if (!out) return;
    const ctx = this.a.ctx!;
    const t = this.t;
    const vol = Math.min(1, speed / 900) * 0.16;
    if (vol < 0.01) return;
    const o = this.tone(out, 'sine', 220, 140, t, 0.14, vol);
    // 8 Hz 颤音
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 8;
    const lg = ctx.createGain();
    lg.gain.value = 12;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.16);
  }

  // ───────────── 合成 ─────────────

  /** 「啵」+ 果汁「滋」+（L≥5）低频「咚」+（L≥8）高频闪烁琶音 */
  merge(level: number, combo: number): void {
    const out = this.v(P_HIGH, 0.45);
    if (!out) return;
    const t = this.t;
    const f = PENTA[Sfx.noteIndex(level, combo)]!;
    this.pop(out, f, t, 0.3);
    this.noise(out, 'bandpass', 1500, 600, 2, t + 0.01, 0.12, 0.15);
    if (level >= 5) {
      const lo = this.v(P_MID, 0.25);
      if (lo) this.tone(lo, 'sine', 120, 60, t, 0.2, 0.32 + Math.max(0, level - 8) * 0.06);
    }
    if (level >= 8) {
      const hi = this.v(P_MID, 0.4);
      if (hi) for (let i = 0; i < 3; i++) this.tone(hi, 'triangle', f * 2 * [1, 1.25, 1.5][i]!, f * 2 * [1, 1.25, 1.5][i]!, t + 0.06 + i * 0.05, 0.14, 0.05);
    }
  }

  private pop(out: AudioNode, f: number, t: number, vol: number): void {
    this.tone(out, 'sine', f * 1.5, f, t, 0.25, vol, 0.003, 0.1);
    this.tone(out, 'triangle', f * 2, f * 2, t, 0.15, vol * 0.25);
    this.noise(out, 'highpass', 3000, 3000, 0.7, t, 0.02, vol * 0.35, 0.001);
  }

  /** 连击 ×N 额外一声更高的「叮」；×5+ 加闪烁琶音 */
  combo(n: number, level: number): void {
    const out = this.v(P_MID, 0.4);
    if (!out) return;
    const t = this.t + 0.07;
    const f = PENTA[Math.min(13, Sfx.noteIndex(level, n) + 2)]!;
    this.tone(out, 'sine', f, f, t, 0.12, 0.09);
    if (n >= 5) for (let i = 0; i < 4; i++) this.tone(out, 'triangle', f * (1 + i * 0.25), f * (1 + i * 0.25), t + 0.05 + i * 0.045, 0.1, 0.04);
  }

  /** 号角和弦琶音 C–E–G–C'（三角 + 12.5% 方波经 2 kHz 低通）+ 镲片上扬 + 低音 */
  fanfare(short: boolean): void {
    const out = this.v(P_TOP, short ? 1.0 : 1.8);
    if (!out) return;
    const ctx = this.a.ctx!;
    const t = this.t;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    lp.connect(out);
    const notes = [72, 76, 79, 84];
    for (let i = 0; i < notes.length; i++) {
      const f = mtof(notes[i]!);
      const last = i === notes.length - 1;
      const dur = last ? (short ? 0.4 : 0.8) : 0.22;
      const st = t + i * 0.06;
      this.tone(out, 'triangle', f, f, st, dur, 0.16, 0.006);
      this.tone(lp, 'square12', f, f, st, dur, 0.06, 0.006);
    }
    if (!short) this.noise(out, 'highpass', 6000, 9000, 0.7, t, 1.0, 0.06, 0.9);
    this.tone(out, 'sine', 65, 55, t, short ? 0.4 : 0.7, 0.35, 0.01);
  }

  superMerge(): void {
    this.fanfare(false);
    const out = this.v(P_TOP, 1.6);
    if (!out) return;
    const t = this.t;
    this.tone(out, 'triangle', 300, 1200, t + 0.05, 0.6, 0.1, 0.02, 0.55);
    // 颗粒噪声（掌声感）
    for (let i = 0; i < 14; i++) this.noise(out, 'bandpass', 2500 + Math.random() * 2500, 2000, 3, t + 0.2 + Math.random() * 1.1, 0.03, 0.08, 0.002, Math.random());
  }

  crownDing(): void {
    const out = this.v(P_HIGH, 0.5);
    if (!out) return;
    const t = this.t;
    this.tone(out, 'sine', 2093, 2093, t, 0.4, 0.12, 0.002);
    this.tone(out, 'sine', 3136, 3136, t, 0.3, 0.05, 0.002);
  }

  /** 两音/三音上行 */
  private rise(notes: number[], gap: number, vol: number, prio = P_MID, type: OscillatorType = 'sine'): void {
    const out = this.v(prio, notes.length * gap + 0.25);
    if (!out) return;
    const t = this.t;
    for (let i = 0; i < notes.length; i++) {
      const f = mtof(notes[i]!);
      this.tone(out, type, f, f, t + i * gap, 0.18, vol);
      this.tone(out, 'triangle', f * 2, f * 2, t + i * gap, 0.1, vol * 0.2);
    }
  }

  trick(): void {
    this.rise([96, 100], 0.07, 0.11);
  }

  discovery(): void {
    this.rise([84, 88, 91], 0.08, 0.11);
  }

  clutch(): void {
    this.rise([88, 91, 96], 0.07, 0.12, P_HIGH);
  }

  newBest(): void {
    this.rise([91, 96], 0.1, 0.12, P_HIGH, 'triangle');
  }

  recordBell(): void {
    this.rise([84, 88, 91, 96, 100], 0.07, 0.11, P_TOP, 'triangle');
  }

  // ───────────── 危险 ─────────────

  warn(): void {
    const out = this.v(P_MID, 0.25);
    if (!out) return;
    this.tone(out, 'sine', 300, 280, this.t, 0.2, 0.12, 0.01);
  }

  dangerTick(left: number): void {
    const out = this.v(P_HIGH, 0.3);
    if (!out) return;
    const t = this.t;
    const f = left >= 3 ? 660 : left === 2 ? 740 : 880;
    this.tone(out, 'sine', f, f, t, 0.12, 0.16, 0.003);
    // 心跳低频
    this.tone(out, 'sine', 70, 45, t, 0.14, 0.32, 0.004);
    this.tone(out, 'sine', 70, 45, t + 0.2, 0.12, 0.22, 0.004);
  }

  dangerClear(): void {
    const out = this.v(P_MID, 0.4);
    if (!out) return;
    const t = this.t;
    this.tone(out, 'sine', mtof(88), mtof(88), t, 0.16, 0.11);
    this.tone(out, 'sine', mtof(84), mtof(84), t + 0.12, 0.22, 0.11);
  }

  // ───────────── 结束 / 结算 ─────────────

  gameOver(): void {
    const out = this.v(P_TOP, 1.2);
    if (!out) return;
    const ctx = this.a.ctx!;
    const t = this.t;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 1.2;
    lp.connect(out);
    const notes = [67, 64, 60];
    for (let i = 0; i < 3; i++) {
      const f = mtof(notes[i]!);
      const st = t + i * 0.22;
      this.tone(lp, 'sawtooth', f * 1.02, f * 0.97, st, i === 2 ? 0.55 : 0.24, 0.12, 0.01);
    }
  }

  popIndex(i: number): void {
    const out = this.v(P_LOW, 0.15);
    if (!out) return;
    const f = PENTA[Math.min(13, i % 14)]!;
    this.tone(out, 'sine', f * 1.4, f, this.t, 0.1, 0.08, 0.002, 0.05);
  }

  roll(): void {
    const now = performance.now();
    if (now - this.lastRoll < 30) return;
    this.lastRoll = now;
    const out = this.v(P_LOW, 0.03);
    if (!out) return;
    this.tone(out, 'sine', 1400, 1400, this.t, 0.018, 0.04, 0.001);
  }

  button(): void {
    const out = this.v(P_MID, 0.06);
    if (!out) return;
    const t = this.t;
    this.tone(out, 'sine', 520, 520, t, 0.04, 0.12, 0.002);
    this.noise(out, 'highpass', 4000, 4000, 0.7, t, 0.01, 0.06, 0.001);
  }

  toggle(on: boolean): void {
    const out = this.v(P_MID, 0.08);
    if (!out) return;
    this.tone(out, 'sine', on ? 660 : 440, on ? 880 : 330, this.t, 0.07, 0.1, 0.002);
  }

  transition(): void {
    const out = this.v(P_MID, 0.7);
    if (!out) return;
    const t = this.t;
    this.noise(out, 'bandpass', 300, 2400, 1.2, t, 0.55, 0.12, 0.2);
    for (let i = 0; i < 4; i++) {
      const f = 500 + Math.random() * 600;
      this.tone(out, 'sine', f, f * 1.8, t + 0.08 + i * 0.1, 0.06, 0.06, 0.002);
    }
  }
}
