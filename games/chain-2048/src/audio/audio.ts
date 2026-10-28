/** WebAudio 上下文、总线、首个手势解锁、开关（docs §2.5） */
import { settings } from '../core/storage';

class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  /** 音乐低通（危险时压暗） */
  musicLP!: BiquadFilterNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  unlocked = false;

  /** 在用户手势里调用 */
  unlock(): void {
    // 没有过用户手势（如调试参数自动开局）时不创建，避免浏览器「AudioContext was not allowed to start」警告；
    // 第一次 pointerdown/keydown 时再创建（见 app.bindGlobal）
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!this.ctx && ua && !ua.hasBeenActive) return;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        this.ctx = null;
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = settings.sfx ? 1 : 0;
      this.sfx.connect(this.master);
      this.musicLP = c.createBiquadFilter();
      this.musicLP.type = 'lowpass';
      this.musicLP.frequency.value = 16000;
      this.music = c.createGain();
      this.music.gain.value = settings.music ? 0.55 : 0;
      this.musicLP.connect(this.music).connect(this.master);
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.impulse(2.4);
      this.reverbSend = c.createGain();
      this.reverbSend.gain.value = 0.35;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x7fffffff) * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    this.unlocked = true;
  }

  private impulse(sec: number): AudioBuffer {
    const c = this.ctx!;
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let seed = 777 + ch * 31;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / n, 2.6);
      }
    }
    return b;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setSfx(on: boolean): void {
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.now, 0.05);
  }

  setMusic(on: boolean): void {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.now, 0.15);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.unlocked && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }
}

export const audio = new AudioSys();
