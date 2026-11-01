/**
 * 程序化背景音乐（§7.4）：
 *   层 1 底：D2 与 A2 两个微失谐的正弦 + 极轻的风
 *   层 2 古琴：每 2.5–5 秒一个 2–4 音的五声乐句（偏重宫、徵），偶有泛音
 *   层 3 箫：第四卷起 / 书斋第 4 章起加入，长音慢起慢收
 * 墨 ≤ 3 时乐句更密、音域下移；帖成时整体淡出。
 */
import { AudioEngine, pentaFreq } from './audio.ts';

export class Music {
  private a: AudioEngine;
  private drone: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private timer = 1.5;
  private xiaoTimer = 6;
  playing = false;
  /** 0..1 紧张度（墨见底） */
  tension = 0;
  xiao = false;
  private duck: GainNode | null = null;

  constructor(a: AudioEngine) {
    this.a = a;
  }

  start(): void {
    const ctx = this.a.ctx;
    if (!ctx || this.playing) return;
    this.playing = true;
    this.duck = ctx.createGain();
    this.duck.gain.value = 0.0001;
    this.duck.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    this.duck.connect(this.a.musicBus!);
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.035;
    this.droneGain.connect(this.duck);
    for (const [f, det] of [[73.42, -3], [110, 4]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(this.droneGain);
      o.start();
      this.drone.push(o);
    }
    this.timer = 1.2;
  }

  stop(fade = 1): void {
    const ctx = this.a.ctx;
    if (!ctx || !this.playing) return;
    this.playing = false;
    const t = ctx.currentTime;
    const d = this.duck!;
    d.gain.cancelScheduledValues(t);
    d.gain.setTargetAtTime(0.0001, t, fade / 3);
    for (const o of this.drone) o.stop(t + fade + 0.2);
    this.drone = [];
    setTimeout(() => d.disconnect(), (fade + 0.4) * 1000);
  }

  update(dt: number): void {
    if (!this.playing || !this.a.ctx || !this.a.musicOn) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.phrase();
      const lo = 2.5 - this.tension * 1.0;
      const hi = 5 - this.tension * 2.2;
      this.timer = lo + Math.random() * (hi - lo);
    }
    if (this.xiao) {
      this.xiaoTimer -= dt;
      if (this.xiaoTimer <= 0) {
        this.xiaoNote();
        this.xiaoTimer = 7 + Math.random() * 6;
      }
    }
  }

  private phrase(): void {
    const n = 2 + Math.floor(Math.random() * 3);
    const base = this.tension > 0.5 ? -3 : 0;
    // 宫(0)、徵(3) 权重高
    const pool = [0, 0, 3, 3, 1, 2, 4, 5, 8];
    let when = 0;
    for (let i = 0; i < n; i++) {
      const step = pool[Math.floor(Math.random() * pool.length)] + base;
      this.a.pluck(pentaFreq(step, 146.83), 0.22, false, this.duck, when);
      if (Math.random() < 0.15) this.a.bell(pentaFreq(step + 10, 146.83), 0.025, when + 0.05, this.duck);
      when += 0.32 + Math.random() * 0.4;
    }
  }

  private xiaoNote(): void {
    const ctx = this.a.ctx!;
    const t = ctx.currentTime;
    const f = pentaFreq([0, 3, 2, 4][Math.floor(Math.random() * 4)] + 5, 293.66);
    const dur = 3 + Math.random() * 2;
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 3;
    vib.connect(vg).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.duck!);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }
}
