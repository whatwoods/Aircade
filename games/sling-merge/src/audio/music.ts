/**
 * 程序化 BGM（docs §5.4）：96 BPM，F 大调，8 小节循环，Fmaj7 → Dm7 → B♭maj7 → C7sus4 → C7（两轮，第 2 轮末尾变化）。
 * 声部：电钢（双正弦失谐 3 cent + 5 Hz 颤）bossa 第 1、2.5 拍；贝斯根音/五音；音乐盒旋律（三角波 + 2 次回声，
 * 五声音阶两小节动机，40% 休止，每 8 小节重生成）；沙锤 8 分；第 2、4 拍边击。
 * 25 ms 定时器 + 100 ms lookahead。危险：低通 900 Hz + 心跳底鼓；连击 ≥ 3：接下来 2 小节加高八度闪烁；
 * 暂停：30% + 低通；结算：淡出，换慢速音乐盒琶音。
 */
import { prng } from '../render/util';
import type { AudioEngine } from './audio';

const BPM = 96;
const SIXTEENTH = 60 / BPM / 4;
const LOOK = 0.1;
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// 每小节和弦（两个半小节）：电钢 voicing、贝斯 根/五
const VOICE: number[][] = [
  [60, 64, 65, 69], // Fmaj7
  [60, 62, 65, 69], // Dm7
  [58, 62, 65, 69], // B♭maj7
  [58, 60, 65, 67], // C7sus4
  [58, 60, 64, 67], // C7
];
const BASS: number[][] = [
  [41, 48],
  [38, 45],
  [34, 41],
  [36, 43],
  [36, 43],
];
/** 小节 → [前半和弦, 后半和弦] */
function chordAt(bar: number, half: number): number {
  const b = bar % 4;
  if (b < 3) return b;
  return half === 0 ? 3 : 4;
}
const MELODY = [77, 79, 81, 84, 86, 89, 91]; // F 大调五声（F G A C D F' G'）
const TWINKLE = [89, 91, 93, 96, 98, 101];
const FREQ: number[] = [];
for (let m = 0; m < 128; m++) FREQ.push(mtof(m));

type Mode = 'off' | 'game' | 'results';

export class Music {
  private a: AudioEngine;
  private timer = 0;
  private mode: Mode = 'off';
  private nextT = 0;
  private step = 0;
  private motifA = new Int8Array(16);
  private motifB = new Int8Array(16);
  private twinkleSteps = 0;
  private danger = false;
  private rnd = prng(7);
  private out: GainNode | null = null;
  private running = false;

  constructor(a: AudioEngine) {
    this.a = a;
    this.genMotifs();
  }

  private genMotifs(): void {
    for (const m of [this.motifA, this.motifB]) {
      let last = 2;
      for (let i = 0; i < 16; i++) {
        if (this.rnd() < 0.4 || (i % 2 === 1 && this.rnd() < 0.5)) {
          m[i] = -1;
          continue;
        }
        last = Math.max(0, Math.min(MELODY.length - 1, last + Math.round((this.rnd() - 0.5) * 3.2)));
        m[i] = last;
      }
    }
  }

  /** 切换模式（game / results / off）；未解锁时等首次手势 */
  play(mode: Mode): void {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'off') {
      this.fadeOut();
      return;
    }
    this.a.whenUnlocked(() => this.begin(prev !== 'off'));
  }

  private begin(crossfade: boolean): void {
    const a = this.a;
    if (!a.ctx || !a.musicFilter || this.mode === 'off') return;
    const ctx = a.ctx;
    if (this.out && crossfade) {
      const old = this.out;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => old.disconnect(), 1500);
      this.out = null;
    }
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0.0001;
      this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
      this.out.connect(a.musicFilter);
    }
    this.step = 0;
    this.nextT = ctx.currentTime + 0.12;
    this.startTimer();
  }

  private fadeOut(): void {
    const ctx = this.a.ctx;
    if (this.out && ctx) {
      const old = this.out;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => old.disconnect(), 1800);
      this.out = null;
    }
    this.stopTimer();
  }

  private startTimer(): void {
    if (this.running) return;
    this.running = true;
    this.timer = window.setInterval(this.tick, 25);
  }

  private stopTimer(): void {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
  }

  /** 页面隐藏时暂停调度 */
  setHidden(hidden: boolean): void {
    if (hidden) this.stopTimer();
    else if (this.mode !== 'off' && this.out && this.a.ctx) {
      this.nextT = Math.max(this.nextT, this.a.ctx.currentTime + 0.05);
      this.startTimer();
    }
  }

  setDanger(on: boolean): void {
    this.danger = on;
  }

  comboBoost(): void {
    this.twinkleSteps = 32;
  }

  private readonly tick = (): void => {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    if (this.nextT < ctx.currentTime - 0.2) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ctx.currentTime + LOOK) {
      if (this.mode === 'game') this.schedGame(this.step, this.nextT);
      else if (this.mode === 'results') this.schedResults(this.step, this.nextT);
      this.nextT += this.mode === 'results' ? SIXTEENTH * 1.6 : SIXTEENTH;
      this.step = (this.step + 1) % 128;
      if (this.step === 0) this.genMotifs();
    }
  };

  private schedGame(step: number, t: number): void {
    const bar = step >> 4;
    const s = step & 15;
    const half = s < 8 ? 0 : 1;
    const ch = chordAt(bar, half);
    // 电钢：第 1 拍、第 2.5 拍
    if (s === 0 || s === 6 || (bar === 7 && s === 12)) this.epiano(VOICE[ch]!, t, s === 0 ? 0.05 : 0.04);
    // 贝斯：根音 / 五音（第 2 轮末小节上行）
    if (bar === 7 && s >= 8) {
      if (s === 8 || s === 12 || s === 14) this.bass(s === 8 ? 36 : s === 12 ? 38 : 40, t, 0.18);
    } else if (s === 0) this.bass(BASS[ch]![0]!, t, 0.2);
    else if (s === 8) this.bass(BASS[ch]![1]!, t, 0.16);
    else if (s === 14 && bar % 2 === 1) this.bass(BASS[ch]![0]! + 12, t, 0.08);
    // 沙锤：8 分
    if ((s & 1) === 0) this.shaker(t, (s & 2) !== 0 ? 0.03 : 0.018);
    // 边击：第 2、4 拍
    if (s === 4 || s === 12) this.stick(t);
    // 音乐盒旋律（8 分音符）
    if ((s & 1) === 0) {
      const idx = ((bar & 1) << 3) | (s >> 1);
      const motif = (bar >> 1) % 2 === 0 ? this.motifA : this.motifB;
      const n = motif[idx]!;
      if (n >= 0) this.musicBox(MELODY[n]!, t, 0.05);
    }
    // 连击闪烁层
    if (this.twinkleSteps > 0) {
      this.twinkleSteps--;
      if ((s & 1) === 1 && this.rnd() < 0.7) this.musicBox(TWINKLE[Math.floor(this.rnd() * TWINKLE.length)]!, t, 0.025);
    }
    // 危险心跳底鼓
    if (this.danger && (s === 0 || s === 3 || s === 8 || s === 11)) this.kick(t, s === 0 || s === 8 ? 0.45 : 0.3);
  }

  private schedResults(step: number, t: number): void {
    const bar = (step >> 3) % 4;
    const s = step & 7;
    const v = VOICE[bar === 3 ? 4 : bar]!;
    const n = v[s % 4]! + (s >= 4 ? 12 : 0) + 12;
    this.musicBox(n, t, 0.045);
    if (s === 0) this.bass(BASS[bar === 3 ? 4 : bar]![0]! + 12, t, 0.08);
  }

  // ───────────── 乐器 ─────────────

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private epiano(notes: number[], t: number, vol: number): void {
    const ctx = this.a.ctx!;
    const out = this.out!;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.008, 1.3);
    // 5 Hz 轻颤（振幅）
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lg = ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg);
    lg.connect(trem.gain);
    g.connect(trem);
    trem.connect(out);
    lfo.start(t);
    lfo.stop(t + 1.35);
    for (let i = 0; i < notes.length; i++) {
      const f = FREQ[notes[i]!]!;
      for (let d = -1; d <= 1; d += 2) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = d * 3;
        o.connect(g);
        o.start(t);
        o.stop(t + 1.35);
      }
    }
  }

  private bass(m: number, t: number, vol: number): void {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = FREQ[m]!;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.01, 0.5);
    o.connect(g);
    g.connect(this.out!);
    o.start(t);
    o.stop(t + 0.55);
  }

  private shaker(t: number, vol: number): void {
    const a = this.a;
    const ctx = a.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, 0.06);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(t, (t * 7.31) % 0.9);
    src.stop(t + 0.08);
  }

  private stick(t: number): void {
    const a = this.a;
    const ctx = a.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 6;
    const g = ctx.createGain();
    this.env(g, t, 0.07, 0.002, 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(t, (t * 3.7) % 0.9);
    src.stop(t + 0.06);
  }

  private musicBox(m: number, t: number, vol: number): void {
    const ctx = this.a.ctx!;
    const f = FREQ[Math.min(127, m)]!;
    // 原音 + 2 次回声
    for (let e = 0; e < 3; e++) {
      const st = t + e * 0.19;
      const v = vol * (e === 0 ? 1 : e === 1 ? 0.35 : 0.15);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      this.env(g, st, v, 0.003, 0.45);
      o.connect(g);
      g.connect(this.out!);
      o.start(st);
      o.stop(st + 0.5);
    }
  }

  private kick(t: number, vol: number): void {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, 0.2);
    o.connect(g);
    g.connect(this.out!);
    o.start(t);
    o.stop(t + 0.22);
  }
}
