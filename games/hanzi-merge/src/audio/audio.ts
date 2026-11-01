/**
 * 音频（§7.3）：上下文在第一次用户手势时创建 / 解锁；音效与音乐分开开关，主音量经 DynamicsCompressor。
 * 音色全部程序化：古琴拨弦（Karplus-Strong，按音高缓存 AudioBuffer）、磬 / 编钟、印章、木鱼、纸、墨晕、水、风。
 */

/** 五声音阶 D 宫：D E F# A B（相对 D4 的半音） */
const PENTA = [0, 2, 4, 7, 9];
const D4 = 293.66;

export function pentaFreq(step: number, base = D4): number {
  const oct = Math.floor(step / 5);
  const i = ((step % 5) + 5) % 5;
  return base * 2 ** ((PENTA[i] + 12 * oct) / 12);
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxOn = true;
  musicOn = true;
  volume = 0.8;
  forcedMute = false;
  private noise: AudioBuffer | null = null;
  private pink: AudioBuffer | null = null;
  private plucks = new Map<number, AudioBuffer>();
  private lastHover = 0;

  /** 第一次用户手势时调用 */
  unlock(): void {
    try {
      // 只在真实手势里创建 / 恢复上下文（否则浏览器会警告「AudioContext was not allowed to start」）
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (ua && !ua.isActive) return;
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 10;
        comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        this.makeNoise();
        this.apply();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  apply(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.forcedMute ? 0 : this.volume, t, 0.02);
    this.sfxBus!.gain.setTargetAtTime(this.sfxOn ? 1 : 0, t, 0.02);
    this.musicBus!.gain.setTargetAtTime(this.musicOn ? 0.55 : 0, t, 0.05);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  private makeNoise(): void {
    const ctx = this.ctx!;
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    this.pink = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = this.noise.getChannelData(0);
    const p = this.pink.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99765 * b0 + x * 0.099046;
      b1 = 0.963 * b1 + x * 0.2965164;
      b2 = 0.57 * b2 + x * 1.0526913;
      p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2;
    }
  }

  private pluckBuffer(freq: number, muted: boolean): AudioBuffer {
    const key = Math.round(freq * 10) * 2 + (muted ? 1 : 0);
    const hit = this.plucks.get(key);
    if (hit) return hit;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * (muted ? 0.5 : 1.2));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const P = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(P);
    for (let i = 0; i < P; i++) line[i] = Math.random() * 2 - 1;
    const decay = muted ? 0.982 : 0.996;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const j = i % P;
      const v = line[j];
      const nv = decay * 0.5 * (v + prev);
      prev = v;
      line[j] = nv;
      d[i] = v * (i < sr * 0.02 ? 1 : 1);
    }
    this.plucks.set(key, buf);
    return buf;
  }

  private out(): AudioNode | null {
    return this.ctx && this.sfxOn && !this.forcedMute ? this.sfxBus : null;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  /** 古琴拨弦 */
  pluck(freq: number, vol = 0.5, muted = false, bus: AudioNode | null = this.out(), when = 0): void {
    if (!bus || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(freq, muted);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muted ? 1200 : 4000;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
    // 泛音：2f 正弦
    const o = ctx.createOscillator();
    o.frequency.value = freq * 2;
    const og = ctx.createGain();
    this.env(og, t, 0.003, vol * 0.15, muted ? 0.3 : 0.9);
    o.connect(og).connect(bus);
    o.start(t);
    o.stop(t + 1.3);
  }

  /** 磬 / 编钟：频率比 1 : 2.76 : 5.40 */
  bell(freq: number, vol = 0.3, when = 0, bus: AudioNode | null = this.out()): void {
    if (!bus || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const parts: [number, number, number][] = [
      [1, 1, 1.8], [2.76, 0.5, 1.0], [5.4, 0.25, 0.5],
    ];
    for (const [r, a, d] of parts) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * r;
      const g = ctx.createGain();
      this.env(g, t, 0.003, vol * a, d);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  private noiseHit(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, pink = false, a = 0.005): void {
    const ctx = this.ctx!;
    const bus = this.out();
    if (!bus) return;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, a, vol, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + a + dur + 0.05);
  }

  /** 印章「咚」 */
  stamp(vol = 0.6): void {
    if (!this.out() || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.02);
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, 0.18);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + 0.25);
    this.noiseHit(t, 0.03, 'lowpass', 1200, 1200, 0.7, vol * 0.5);
  }

  /** 木鱼「笃」 */
  wood(vol = 0.35, dull = false): void {
    if (!this.out() || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = dull ? 380 : 520;
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, dull ? 0.1 : 0.07);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + 0.15);
    this.noiseHit(t, 0.01, 'bandpass', dull ? 1800 : 3000, dull ? 1800 : 3000, 1.5, vol * 0.5);
  }

  /** 纸张摩擦 */
  paper(vol = 0.18): void {
    if (!this.out() || !this.ctx) return;
    this.noiseHit(this.ctx.currentTime, 0.05, 'bandpass', 2500, 2500, 0.8, vol, false, 0.01);
  }

  /** 墨晕「嘶」 */
  hiss(vol = 0.12): void {
    if (!this.out() || !this.ctx) return;
    this.noiseHit(this.ctx.currentTime, 0.4, 'bandpass', 3000, 600, 1.2, vol, true, 0.03);
  }

  /** 卷轴「刷」 */
  swish(vol = 0.12): void {
    if (!this.out() || !this.ctx) return;
    this.noiseHit(this.ctx.currentTime, 0.3, 'lowpass', 2400, 500, 0.7, vol, true, 0.04);
  }

  /** 水滴 + 涟漪 */
  water(vol = 0.3): void {
    if (!this.out() || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, 0.1);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + 0.15);
    const o2 = ctx.createOscillator();
    o2.frequency.value = 80;
    const g2 = ctx.createGain();
    this.env(g2, t + 0.03, 0.02, vol * 0.6, 0.3);
    o2.connect(g2).connect(this.sfxBus!);
    o2.start(t);
    o2.stop(t + 0.4);
  }

  /** 风（墨尽） */
  wind(vol = 0.18): void {
    if (!this.out() || !this.ctx) return;
    this.noiseHit(this.ctx.currentTime, 1.4, 'lowpass', 400, 300, 0.5, vol, true, 0.4);
  }

  /** 悬停可合成：极轻的「叮」 */
  ding(): void {
    if (!this.out() || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastHover < 90) return;
    this.lastHover = now;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 2350;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.15 * 0.4, 0.03);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + 0.06);
  }
}
