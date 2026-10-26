// WebAudio engine: buses (sfx, music) → master → compressor (−14 dB, 4:1) → low-pass (muffle) → out.
// Unlocks on the first gesture, follows page visibility and iOS "interrupted" state (docs §2.6).
import { settings, onSettings } from '../core/settings';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  musicDuck!: GainNode;
  lowpass!: BiquadFilterNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  private shaperCurve: Float32Array<ArrayBuffer> | null = null;
  private hidden = false;
  private muffled = 0;
  unlocked = false;
  private listeners: (() => void)[] = [];

  constructor() {
    onSettings((_s, k) => {
      if (k === 'sfx' || k === 'music') this.applyToggles();
    });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!this.ctx) return;
      if (this.hidden) void this.ctx.suspend().catch(() => undefined);
      else void this.ctx.resume().catch(() => undefined);
    });
  }

  onUnlock(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** call from a user gesture; creates or resumes the context */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      const st = this.ctx.state as string;
      if ((st === 'suspended' || st === 'interrupted') && !this.hidden) void this.ctx.resume().catch(() => undefined);
      if (!this.unlocked) {
        this.unlocked = true;
        for (const f of this.listeners) f();
      }
    } catch {
      this.ctx = null;
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.lowpass.Q.value = 0.7;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    comp.connect(this.lowpass);
    this.lowpass.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.musicDuck);
    this.musicDuck.connect(this.master);
    // noise buffer (1 s)
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < n; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    // reverb impulse: 1.2 s exponentially decaying stereo noise
    const len = Math.floor(ctx.sampleRate * 1.2);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        data[i] = ((s / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = imp;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.applyToggles();
  }

  private applyToggles(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(settings.sfx ? 0.8 : 0, t, 0.03);
    this.musicBus.gain.setTargetAtTime(settings.music ? 0.42 : 0, t, 0.05);
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** muffle 0..1: bus low-pass sweeps toward 600 Hz (pause, slow-motion), music ducks 6 dB at full */
  setMuffle(m: number, timeConst = 0.08): void {
    if (!this.ctx || Math.abs(m - this.muffled) < 0.001) return;
    this.muffled = m;
    const t = this.ctx.currentTime;
    const f = 20000 * Math.pow(600 / 20000, m);
    this.lowpass.frequency.setTargetAtTime(f, t, timeConst);
    this.musicDuck.gain.setTargetAtTime(1 - 0.5 * m, t, timeConst);
  }

  /** soft-clip waveshaper curve (shared) */
  curve(): Float32Array<ArrayBuffer> {
    if (!this.shaperCurve) {
      const n = 1024;
      const c = new Float32Array(new ArrayBuffer(n * 4));
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(x * 3.5);
      }
      this.shaperCurve = c;
    }
    return this.shaperCurve;
  }
}

export const audio = new AudioEngine();
