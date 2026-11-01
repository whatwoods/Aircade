import { makeImpulse } from './reverb';

type OscType = OscillatorType;

/**
 * WebAudio 引擎（文档 §5.6）：sfxBus(1.0)、musicBus(0.6) → master(0.8) → 压缩器 → destination；
 * 混响 Convolver 作为两条总线的 send。首次手势时创建 / 恢复。
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  comp!: DynamicsCompressorNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  musicLP!: BiquadFilterNode;
  musicDuck!: GainNode;
  reverb!: ConvolverNode;
  sfxRev!: GainNode;
  musicRev!: GainNode;
  noise!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  muted = false;
  private voices = 0;
  private last = new Map<string, number>();
  onReady: (() => void) | null = null;

  /** 在用户手势中调用 */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
        if (this.onReady) this.onReady();
      }
      const st = this.ctx.state as string;
      if (st === 'suspended' || st === 'interrupted') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }
  resume(): void {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => undefined);
  }

  private build(): void {
    const c = this.ctx!;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.comp.knee.value = 8;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.comp);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.6 : 0;
    this.musicLP = c.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = 18000;
    this.musicDuck = c.createGain();
    this.musicBus.connect(this.musicLP);
    this.musicLP.connect(this.musicDuck);
    this.musicDuck.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = makeImpulse(c, 2.8);
    const revOut = c.createGain();
    revOut.gain.value = 0.55;
    this.reverb.connect(revOut);
    revOut.connect(this.master);
    this.sfxRev = c.createGain();
    this.sfxRev.gain.value = 0.22;
    this.sfxBus.connect(this.sfxRev);
    this.sfxRev.connect(this.reverb);
    this.musicRev = c.createGain();
    this.musicRev.gain.value = 0.45;
    this.musicBus.connect(this.musicRev);
    this.musicRev.connect(this.reverb);
    // 1 秒白噪声缓冲（复用）
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 987654321;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }
  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.1);
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  /** 音乐低通（暂停 500Hz / 受击 600Hz 闪避） */
  musicFilter(freq: number, timeConst = 0.08): void {
    if (!this.ctx) return;
    this.musicLP.frequency.setTargetAtTime(freq, this.ctx.currentTime, timeConst);
  }
  /** 大事件：音乐压低 6dB 一段时间 */
  duck(db: number, ms: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.pow(10, db / 20), t, 0.03);
    g.setTargetAtTime(1, t + ms / 1000, 0.25);
  }
  dipFilter(freq: number, ms: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.musicLP.frequency;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(freq, t, 0.02);
    f.setTargetAtTime(18000, t + ms / 1000, 0.15);
  }

  /** 节流：同名音效最短间隔 */
  gate(name: string, ms: number): boolean {
    if (!this.ctx || !this.sfxOn || this.muted) return false;
    const now = performance.now();
    const l = this.last.get(name) ?? -1e9;
    if (now - l < ms) return false;
    if (this.voices >= 24) return false;
    this.last.set(name, now);
    return true;
  }

  get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private track(node: AudioScheduledSourceNode): void {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
  }

  /** 振荡器音：频率 f0→f1 指数滑动，包络 attack/decay */
  tone(
    type: OscType,
    f0: number,
    f1: number,
    start: number,
    dur: number,
    gain: number,
    opts: { attack?: number; dest?: AudioNode; detune?: number; filter?: [BiquadFilterType, number, number?]; vibrato?: [number, number]; rev?: number; linear?: boolean } = {},
  ): void {
    const c = this.ctx;
    if (!c) return;
    const t0 = Math.max(c.currentTime, start);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 !== f0) {
      if (opts.linear) o.frequency.linearRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    if (opts.detune) o.detune.value = opts.detune;
    const g = c.createGain();
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = o;
    if (opts.vibrato) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = opts.vibrato[0];
      lg.gain.value = opts.vibrato[1];
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t0);
      l.stop(t0 + dur + 0.05);
    }
    if (opts.filter) {
      const f = c.createBiquadFilter();
      f.type = opts.filter[0];
      f.frequency.value = opts.filter[1];
      if (opts.filter[2] !== undefined) f.Q.value = opts.filter[2];
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.dest ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    this.track(o);
  }

  /** 噪声：滤波器类型与频率扫动 */
  noiseBurst(
    start: number,
    dur: number,
    gain: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    q = 1,
    opts: { attack?: number; dest?: AudioNode; offset?: number } = {},
  ): void {
    const c = this.ctx;
    if (!c) return;
    const t0 = Math.max(c.currentTime, start);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    const a = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(opts.dest ?? this.sfxBus);
    src.start(t0, opts.offset ?? Math.random() * 0.8);
    src.stop(t0 + dur + 0.05);
    this.track(src);
  }
}
