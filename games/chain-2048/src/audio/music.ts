/** 程序化背景音乐（docs §5.4）：拇指琴 + 手鼓 + 通鼓 + 环境，按危险程度分层；由主循环每帧调度（前瞻 0.15 s）。 */
import { Rng } from '../core/rng';
import { audio } from './audio';
import { scaleNote } from './sfx';

const BPM = 92;
const EIGHTH = 60 / BPM / 2;
/** 8 个动机（五声音阶级数，-1 = 休止），每个 8 个八分音符 */
const MOTIFS = [
  [0, -1, 2, 4, -1, 2, 1, -1],
  [4, 3, 2, -1, 0, -1, 2, -1],
  [0, 2, 4, 5, -1, 4, 2, -1],
  [5, -1, 4, 2, 4, -1, 0, -1],
  [2, -1, 2, 4, 7, -1, 5, 4],
  [0, -1, -1, 4, 2, -1, 1, 0],
  [7, 5, 4, -1, 2, 4, -1, -1],
  [1, 2, -1, 0, -1, 2, 4, -1],
];

class Music {
  private on = false;
  private nextT = 0;
  private stepN = 0;
  private phrase: number[] = [0, 1, 2, 3];
  private rng = new Rng(5);
  /** 链头进度 → 层 */
  danger = 0;
  /** 0 = 安静（标题）  1 = 游戏 */
  intensity = 0;
  private layer = { hand: 0, tom: 0 };
  private lpTarget = 16000;
  private chirpT = 3;

  start(seed: number): void {
    this.rng = new Rng(seed);
    this.phrase = [0, 1, 2, 3].map(() => this.rng.int(0, MOTIFS.length - 1));
    this.on = true;
    this.nextT = audio.now + 0.1;
  }

  stop(): void {
    this.on = false;
  }

  update(dt: number): void {
    if (!this.on || !audio.ready) return;
    const c = audio.ctx!;
    const d = this.danger * this.intensity;
    // 层淡入淡出（约 1 小节）
    const rate = dt / (EIGHTH * 8);
    this.layer.hand += ((d >= 0.5 ? 1 : 0) - this.layer.hand) * Math.min(1, rate * 3);
    this.layer.tom += ((d >= 0.75 ? 1 : 0) - this.layer.tom) * Math.min(1, rate * 3);
    const lp = d >= 0.9 ? 1200 : 16000;
    if (lp !== this.lpTarget) {
      this.lpTarget = lp;
      audio.musicLP.frequency.setTargetAtTime(lp, c.currentTime, 0.4);
    }
    // 后台/挂起后时钟跳跃：不补播，直接对齐（也避免长循环）
    if (!(this.nextT > c.currentTime - 0.5)) this.nextT = c.currentTime + 0.05;
    let guard = 0;
    while (this.nextT < c.currentTime + 0.15 && guard++ < 16) {
      this.schedule(this.nextT, this.stepN, d);
      this.nextT += EIGHTH;
      this.stepN++;
      if (this.stepN % 32 === 0) this.phrase[this.rng.int(0, 3)] = this.rng.int(0, MOTIFS.length - 1);
    }
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = 2.5 + this.rng.next() * 5;
      this.chirp(c.currentTime + 0.05);
    }
  }

  private schedule(t: number, n: number, d: number): void {
    const bar = Math.floor(n / 8) % 4;
    const i = n % 8;
    const motif = MOTIFS[this.phrase[bar]!]!;
    const deg = motif[i]!;
    const kal = d >= 0.9 ? 0.3 : 1;
    if (deg >= 0) {
      // 危险时转小调变体：降低第 3 级
      const minor = d >= 0.75 ? -1 : 0;
      this.kalimba(t, scaleNote(deg + (deg % 5 === 2 ? minor : 0), 64), 0.09 * kal * (0.6 + 0.4 * this.intensity));
    }
    if (i === 0 && bar % 2 === 0) this.kalimba(t, scaleNote(0, 52), 0.07 * kal);
    // 手鼓
    if (this.layer.hand > 0.02 && (i === 0 || i === 3 || i === 6)) this.handDrum(t, 0.12 * this.layer.hand, i !== 0);
    // 低音通鼓
    if (this.layer.tom > 0.02 && (i === 0 || i === 4)) this.tom(t, 0.22 * this.layer.tom);
  }

  private kalimba(t: number, midi: number, vol: number): void {
    const c = audio.ctx!;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const m = c.createOscillator();
    m.frequency.value = f * 2;
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 0.4, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 0.15);
    m.connect(mg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(audio.musicLP);
    o.start(t);
    m.start(t);
    o.stop(t + 0.65);
    m.stop(t + 0.65);
  }

  private handDrum(t: number, vol: number, light: boolean): void {
    const c = audio.ctx!;
    const s = c.createBufferSource();
    s.buffer = audio.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = light ? 900 : 400;
    f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f).connect(g).connect(audio.musicLP);
    s.start(t, (this.stepN * 0.13) % 0.8);
    s.stop(t + 0.15);
  }

  private tom(t: number, vol: number): void {
    const c = audio.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(audio.music);
    o.start(t);
    o.stop(t + 0.35);
  }

  private chirp(t: number): void {
    const c = audio.ctx!;
    const o = c.createOscillator();
    const base = 2600 + this.rng.next() * 1600;
    o.frequency.setValueAtTime(base, t);
    const n = 2 + this.rng.int(0, 3);
    for (let k = 0; k < n; k++) {
      o.frequency.linearRampToValueAtTime(base * 1.3, t + k * 0.09 + 0.04);
      o.frequency.linearRampToValueAtTime(base, t + k * 0.09 + 0.08);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.018, t + 0.02);
    g.gain.linearRampToValueAtTime(0.0001, t + n * 0.09 + 0.05);
    o.connect(g).connect(audio.musicLP);
    o.start(t);
    o.stop(t + n * 0.09 + 0.1);
  }
}

export const music = new Music();
