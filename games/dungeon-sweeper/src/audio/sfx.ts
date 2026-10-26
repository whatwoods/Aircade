import type { AudioEngine } from './audio';

/** D 五声音阶（D E F# A B）半音偏移，用于连锁「嗒」上行 */
const PENTA = [0, 2, 4, 7, 9];
const semis = (n: number) => Math.pow(2, n / 12);
const rnd = (a: number, b: number) => a + (b - a) * Math.random();

/**
 * 音效配方（文档 §5.3 音效列）。全部实时合成。
 */
export class Sfx {
  private a: AudioEngine;
  private chainIdx = 0;
  private chainCount = 0;
  private chainT = 0;

  constructor(a: AudioEngine) {
    this.a = a;
  }

  private ok(name: string, gap = 0): boolean {
    return this.a.gate(name, gap);
  }

  /** #1 长按蓄力环 */
  charge(): void {
    if (!this.ok('charge', 200)) return;
    this.a.tone('sine', 300, 520, this.a.t, 0.26, 0.03, { attack: 0.05 });
  }

  /** #2 石「嗒」 */
  tick(pitch = 0): void {
    if (!this.ok('tick', 28)) return;
    const t = this.a.t;
    const k = semis(pitch) * rnd(0.92, 1.08);
    this.a.noiseBurst(t, 0.035, 0.22, 'bandpass', 2200 * k, 2200 * k, 2.5);
    this.a.tone('sine', 140 * k, 120 * k, t, 0.06, 0.18);
  }

  /** #3 连锁：每格一个「嗒」沿五声音阶上行（节流 ≥28ms，最多 14 声） */
  chainStart(n: number): void {
    this.chainIdx = 0;
    this.chainCount = 0;
    this.chainT = performance.now();
    if (n > 1 && this.ok('whoosh', 120)) this.a.noiseBurst(this.a.t, 0.25, 0.12, 'lowpass', 300, 1800, 0.7, { attack: 0.06 });
  }
  chainTick(): void {
    const now = performance.now();
    if (now - this.chainT > 900) {
      this.chainIdx = 0;
      this.chainCount = 0;
    }
    this.chainT = now;
    if (this.chainCount >= 14) return;
    if (!this.ok('tick', 28)) return;
    this.chainCount++;
    const i = this.chainIdx++;
    const p = PENTA[i % 5] + 12 * Math.floor(i / 5);
    const t = this.a.t;
    const k = semis(p);
    this.a.noiseBurst(t, 0.035, 0.18, 'bandpass', 2200 * k, 2200 * k, 2.5);
    this.a.tone('sine', 220 * k, 200 * k, t, 0.09, 0.12);
  }

  /** #4 数字减少「叮」 */
  numberDown(): void {
    if (!this.ok('num', 45)) return;
    this.a.tone('sine', 1600, 1600, this.a.t, 0.05, 0.05);
  }

  /** #5 归零「嘶」 */
  zero(): void {
    if (!this.ok('zero', 60)) return;
    this.a.noiseBurst(this.a.t, 0.08, 0.1, 'highpass', 4000, 6000, 0.7);
  }

  /** #6 怪物低吼：越高级越低越长 */
  growl(level: number): void {
    if (!this.ok('growl', 60)) return;
    const t = this.a.t;
    const dur = 0.12 + (level / 9) * 0.24;
    const f0 = 150 - level * 6;
    this.a.tone('sawtooth', f0, f0 * 0.62, t, dur, 0.16, { filter: ['bandpass', 600, 2.2], vibrato: [6, 8], attack: 0.02 });
  }

  /** #7 刀光 + 金属叮 */
  slash(level: number): void {
    if (!this.ok('slash', 40)) return;
    const t = this.a.t;
    this.a.noiseBurst(t, 0.08, 0.26 + level * 0.01, 'highpass', 3000, 8000, 0.8);
    this.a.tone('square', 1200, 1180, t + 0.01, 0.12, 0.05, { filter: ['lowpass', 5000] });
    this.a.tone('square', 1207, 1187, t + 0.01, 0.12, 0.05, { filter: ['lowpass', 5000] });
  }

  /** #8 碎石 */
  shatter(level: number): void {
    if (!this.ok('shatter', 40)) return;
    const t = this.a.t;
    const n = 6 + Math.min(4, Math.floor(level / 2));
    for (let k = 0; k < n; k++) this.a.noiseBurst(t + Math.random() * 0.2, rnd(0.02, 0.05), rnd(0.08, 0.16), 'bandpass', rnd(2000, 5000), rnd(1800, 4500), 3);
    this.a.tone('sine', 80, 60, t, 0.16, 0.3);
  }

  /** #9 扣血闷击 + 音乐闪避 */
  hurt(): void {
    if (!this.ok('hurt', 60)) return;
    this.a.tone('sine', 90, 50, this.a.t, 0.15, 0.4);
    this.a.dipFilter(600, 400);
  }

  /** #10 经验光点「叮」逐颗升高 */
  xp(i: number): void {
    if (!this.ok('xp', 30)) return;
    this.a.tone('sine', 1200 * semis(i * 1.5), 1200 * semis(i * 1.5), this.a.t, 0.09, 0.06);
  }

  /** #11 升级：琶音 D–F#–A–D′ + 闪烁尾音 + 合唱垫 */
  levelUp(times = 1): void {
    if (!this.ok('levelup', 200)) return;
    const t = this.a.t;
    const base = 293.66;
    const arp = [0, 4, 7, 12];
    for (let r = 0; r < Math.min(2, times); r++)
      arp.forEach((s, i) => this.a.tone('triangle', base * semis(s + r * 12), base * semis(s + r * 12), t + (r * 4 + i) * 0.07, 0.4, 0.14));
    this.a.noiseBurst(t + 0.2, 1.2, 0.04, 'highpass', 6000, 9000, 0.5, { attack: 0.05 });
    for (const f of [146.83, 220, 293.66]) {
      this.a.tone('sawtooth', f, f, t, 1.4, 0.035, { detune: rnd(-8, 8), attack: 0.3, filter: ['lowpass', 1600] });
    }
    this.a.duck(-6, 900);
  }

  /** #13 低血心跳（由循环调用） */
  heartbeat(): void {
    if (!this.ok('heart', 400)) return;
    const t = this.a.t;
    this.a.tone('sine', 60, 50, t, 0.12, 0.18);
    this.a.tone('sine', 60, 48, t + 0.22, 0.12, 0.13);
  }

  /** #14 死亡 */
  death(): void {
    const t = this.a.t;
    this.a.tone('sawtooth', 220, 55, t, 1.4, 0.2, { filter: ['lowpass', 900], attack: 0.02 });
    this.a.tone('sine', 110, 40, t, 1.6, 0.25);
    this.a.noiseBurst(t + 0.3, 2.5, 0.05, 'bandpass', 500, 300, 0.6, { attack: 0.8 });
    this.a.duck(-10, 2000);
  }

  /** #15 宝箱翻出 */
  chestReveal(): void {
    if (!this.ok('chestrev', 80)) return;
    const t = this.a.t;
    this.a.tone('sine', 180, 160, t, 0.06, 0.25);
    this.a.noiseBurst(t, 0.05, 0.08, 'bandpass', 800, 800, 1.5);
  }

  /** #16 开宝箱：吱呀 + 金币叮当 */
  chestOpen(): void {
    if (!this.ok('chest', 100)) return;
    const t = this.a.t;
    this.a.tone('sawtooth', 200, 170, t, 0.2, 0.08, { filter: ['bandpass', 900, 3], vibrato: [24, 6] });
    for (let k = 0; k < 8; k++) this.a.tone('sine', rnd(2000, 4000), rnd(2000, 4000), t + 0.12 + k * 0.03, 0.08, 0.05);
  }

  /** 金币到达分数 */
  coin(): void {
    if (!this.ok('coin', 35)) return;
    this.a.tone('sine', rnd(2600, 3600), rnd(2600, 3600), this.a.t, 0.06, 0.035);
  }

  /** #17 玻璃「叮」 */
  potionReveal(): void {
    if (!this.ok('glass', 80)) return;
    this.a.tone('sine', 2600, 2600, this.a.t, 0.04 + 0.2, 0.06);
  }

  /** #18 咕嘟 + 治愈上行 */
  drink(): void {
    if (!this.ok('drink', 100)) return;
    const t = this.a.t;
    let o = 0;
    for (let k = 0; k < 6; k++) {
      this.a.tone('sine', 300, 900, t + o, 0.05, 0.08);
      o += rnd(0.03, 0.05);
    }
    this.a.tone('sine', 400, 800, t + 0.25, 0.4, 0.1, { attack: 0.05 });
  }

  /** #19 低「嘟」 */
  boop(): void {
    if (!this.ok('boop', 120)) return;
    this.a.tone('sine', 160, 150, this.a.t, 0.08, 0.2);
  }

  /** #20 轮盘「咔」 */
  radialOpen(): void {
    if (!this.ok('radial', 60)) return;
    const t = this.a.t;
    this.a.noiseBurst(t, 0.025, 0.14, 'bandpass', 1200, 1200, 2);
    this.a.tone('sine', 420, 400, t, 0.04, 0.12);
  }

  /** #21 轮盘悬停「嘀」 */
  radialHover(slot: number): void {
    if (!this.ok('rhover', 20)) return;
    this.a.tone('sine', 900 + slot * 40, 900 + slot * 40, this.a.t, 0.015 + 0.02, 0.03);
  }

  /** #22 粉笔刮擦 */
  chalk(): void {
    if (!this.ok('chalk', 50)) return;
    const t = this.a.t;
    for (let k = 0; k < 3; k++) this.a.noiseBurst(t + k * 0.022, 0.03, rnd(0.06, 0.12), 'bandpass', 3000, 3200, 3);
  }

  /** #23 刷子 */
  erase(): void {
    if (!this.ok('erase', 50)) return;
    this.a.noiseBurst(this.a.t, 0.09, 0.1, 'lowpass', 900, 700, 0.7);
  }

  /** #24 警示方波双响 */
  warn(): void {
    if (!this.ok('warn', 150)) return;
    const t = this.a.t;
    this.a.tone('square', 220, 220, t, 0.08, 0.06, { filter: ['lowpass', 1500] });
    this.a.tone('square', 220, 220, t + 0.12, 0.08, 0.06, { filter: ['lowpass', 1500] });
  }

  /** #25 猜中 E6→A6 */
  markHit(): void {
    if (!this.ok('markhit', 60)) return;
    const t = this.a.t;
    this.a.tone('sine', 1318.5, 1318.5, t, 0.12, 0.07);
    this.a.tone('sine', 1760, 1760, t + 0.08, 0.18, 0.07);
  }

  /** #26 巨龙呼吸隆隆 */
  dragonBreath(): void {
    if (!this.ok('dbreath', 3000)) return;
    this.a.noiseBurst(this.a.t, 1.8, 0.035, 'lowpass', 120, 90, 0.7, { attack: 0.9 });
  }

  /** #27 惊扰：低吼 */
  disturb(): void {
    if (!this.ok('disturb', 300)) return;
    const t = this.a.t;
    this.a.tone('sawtooth', 60, 52, t, 0.4, 0.2, { filter: ['lowpass', 400], attack: 0.04 });
    this.a.noiseBurst(t, 0.4, 0.08, 'lowpass', 300, 200, 0.7, { attack: 0.05 });
  }

  /** #28 苏醒：远处长吼 */
  awaken(): void {
    const t = this.a.t;
    this.a.tone('sawtooth', 90, 60, t, 1.6, 0.1, { filter: ['lowpass', 500], attack: 0.3, vibrato: [5, 4] });
    this.a.tone('sawtooth', 91, 61, t, 1.6, 0.08, { filter: ['lowpass', 500], attack: 0.3 });
  }

  /** §5.4 巨吼：3 路失谐锯齿 110→55Hz */
  roar(): void {
    const t = this.a.t;
    for (const d of [-12, 0, 13]) this.a.tone('sawtooth', 110, 55, t, 1.2, 0.12, { detune: d, filter: ['lowpass', 1200], attack: 0.05, vibrato: [7, 6] });
    this.a.noiseBurst(t, 1.2, 0.12, 'lowpass', 900, 300, 0.8, { attack: 0.05 });
  }

  /** §5.4 龙息 */
  fireBreath(): void {
    this.a.noiseBurst(this.a.t, 0.7, 0.3, 'bandpass', 300, 1200, 0.9, { attack: 0.04 });
    this.a.tone('sawtooth', 70, 50, this.a.t, 0.7, 0.08, { filter: ['lowpass', 300] });
  }

  /** §5.4 三连斩中的一刀（递升） */
  bigSlash(i: number): void {
    const t = this.a.t;
    const k = semis(i * 3);
    this.a.noiseBurst(t, 0.09, 0.32, 'highpass', 3000 * k, 8000 * k, 0.8);
    this.a.tone('square', 1200 * k, 1180 * k, t + 0.01, 0.16, 0.06, { filter: ['lowpass', 6000] });
  }

  /** §5.4 重击 */
  impact(): void {
    const t = this.a.t;
    this.a.tone('sine', 50, 35, t, 0.6, 0.6);
    this.a.noiseBurst(t, 0.35, 0.4, 'lowpass', 6000, 400, 0.5);
  }

  /** §5.4 大型碎裂 */
  bigShatter(): void {
    const t = this.a.t;
    for (let k = 0; k < 18; k++) this.a.noiseBurst(t + Math.random() * 0.5, rnd(0.03, 0.08), rnd(0.08, 0.16), 'bandpass', rnd(1500, 5000), rnd(1200, 4500), 3);
    this.a.tone('sine', 70, 40, t, 0.8, 0.4);
  }

  /** #30 凯旋号角 I–IV–V–I + 定音鼓 */
  fanfare(): void {
    const t = this.a.t;
    const chords = [
      [146.83, 220, 293.66, 369.99],
      [196, 246.94, 293.66, 392],
      [220, 277.18, 329.63, 440],
      [146.83, 220, 293.66, 369.99, 587.33],
    ];
    chords.forEach((ch, i) => {
      for (const f of ch) this.a.tone('sawtooth', f, f, t + i * 0.42, i === 3 ? 1.8 : 0.55, 0.035, { filter: ['lowpass', 1800], attack: 0.04 });
      this.a.tone('sine', 70, 45, t + i * 0.42, 0.4, 0.3);
      this.a.noiseBurst(t + i * 0.42, 0.12, 0.08, 'lowpass', 1200, 300, 0.6);
    });
  }

  /** #31 肃清钟声 */
  bell(): void {
    const t = this.a.t;
    for (const f of [523.25, 1046.5, 1569.75]) this.a.tone('sine', f, f, t, 2, 0.08, { attack: 0.005 });
  }

  /** #32 新纪录 */
  record(): void {
    const t = this.a.t;
    [0, 4, 7, 12, 16].forEach((s, i) => this.a.tone('triangle', 440 * semis(s), 440 * semis(s), t + i * 0.08, 0.5, 0.1));
    this.a.noiseBurst(t + 0.3, 1.2, 0.04, 'highpass', 6000, 9000, 0.5, { attack: 0.05 });
  }

  /** #33 计数滴答 */
  scoreTick(): void {
    if (!this.ok('stick', 50)) return;
    this.a.tone('sine', 2400, 2400, this.a.t, 0.025, 0.03);
  }

  /** 结算行滴答 */
  rowTick(i: number): void {
    this.a.tone('triangle', 880 * semis(i), 880 * semis(i), this.a.t, 0.08, 0.06);
  }

  /** #34 按钮 */
  button(): void {
    if (!this.ok('btn', 40)) return;
    const t = this.a.t;
    this.a.noiseBurst(t, 0.02, 0.12, 'bandpass', 1500, 1500, 2);
    this.a.tone('sine', 300, 280, t, 0.03, 0.12);
  }

  /** #35 暂停闷音 */
  pause(): void {
    if (!this.ok('pause', 100)) return;
    this.a.tone('sine', 180, 120, this.a.t, 0.15, 0.15);
  }

  /** #39 点火 */
  ignite(): void {
    const t = this.a.t;
    this.a.noiseBurst(t, 0.6, 0.22, 'bandpass', 400, 2000, 0.8, { attack: 0.03 });
    this.a.tone('sine', 60, 45, t, 0.6, 0.25);
  }
}
