/**
 * 音频引擎（docs §2.7）：
 * 音效 → sfxBus → master → compressor(−14 dB, 4:1) → destination；
 * 音乐 → musicFilter(lowpass) → musicBus → master。
 * 首次手势解锁（resume + 1 帧静音 buffer）；复音上限 14、低优先级先让位；碰撞节流 100 ms 内 ≤ 6；
 * 1 s 白噪声 buffer 复用；音效/音乐开关记忆；?mute=1 强制静音。
 */
import { CONFIG } from '../config';

const MAX_VOICES = CONFIG.audio.maxVoices;

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  musicFilter: BiquadFilterNode | null = null;
  musicDuck: GainNode | null = null;
  noise: AudioBuffer | null = null;
  square: PeriodicWave | null = null;
  sfxOn = true;
  musicOn = true;
  forcedMute = false;
  unlocked = false;
  private vEnd = new Float64Array(MAX_VOICES);
  private vPrio = new Int8Array(MAX_VOICES);
  private vGain: (GainNode | null)[] = new Array<GainNode | null>(MAX_VOICES).fill(null);
  private bumpTimes = new Float64Array(CONFIG.audio.bumpLimitPer100ms);
  private bumpHead = 0;
  private dangerOn = false;
  private pausedDuck = false;
  private onUnlock: (() => void)[] = [];

  /** 首次用户手势调用 */
  unlock(): void {
    if (this.forcedMute) return;
    if (this.unlocked && this.ctx && this.ctx.state === 'running') return;
    // 只在真正的用户激活（pointerup / click / keydown…）里创建或恢复，避免浏览器的自动播放警告
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && !ua.isActive) return;
    try {
      if (!this.ctx) this.create();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      if (!this.unlocked) {
        this.unlocked = true;
        const b = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
        for (const f of this.onUnlock) f();
        this.onUnlock.length = 0;
      }
    } catch {
      /* 音频不可用时静默 */
    }
  }

  whenUnlocked(f: () => void): void {
    if (this.unlocked) f();
    else this.onUnlock.push(f);
  }

  private create(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.knee.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = CONFIG.audio.master;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? CONFIG.audio.sfx : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? CONFIG.audio.music : 0;
    this.musicBus.connect(this.master);
    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicDuck.connect(this.musicBus);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.7;
    this.musicFilter.connect(this.musicDuck);
    // 1 s 白噪声
    const len = ctx.sampleRate;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
    this.noise = nb;
    // 12.5% 占空比方波（傅里叶级数）
    const N = 32;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    const duty = 0.125;
    for (let n = 1; n < N; n++) imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    this.square = ctx.createPeriodicWave(real, imag);
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !this.forcedMute;
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx && this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? CONFIG.audio.sfx : 0, this.ctx.currentTime, 0.03);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(on ? CONFIG.audio.music : 0, this.ctx.currentTime, 0.08);
  }

  /**
   * 申请一个复音槽：返回槽内的输出 GainNode（已接到 sfxBus），dur 秒后释放。
   * 满了则抢占优先级更低（或同级最旧）的；都更高则丢弃（返回 null）。
   */
  voice(prio: number, dur: number): GainNode | null {
    if (!this.ready || !this.sfxOn || !this.sfxBus) return null;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    let slot = -1;
    let worst = -1;
    for (let i = 0; i < MAX_VOICES; i++) {
      if (this.vEnd[i]! <= now) {
        slot = i;
        break;
      }
      if (worst < 0 || this.vPrio[i]! < this.vPrio[worst]! || (this.vPrio[i] === this.vPrio[worst] && this.vEnd[i]! < this.vEnd[worst]!)) worst = i;
    }
    if (slot < 0) {
      if (this.vPrio[worst]! > prio) return null;
      slot = worst;
      const old = this.vGain[slot];
      if (old) {
        old.gain.cancelScheduledValues(now);
        old.gain.setTargetAtTime(0, now, 0.01);
      }
    }
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(this.sfxBus);
    this.vEnd[slot] = now + dur;
    this.vPrio[slot] = prio;
    this.vGain[slot] = g;
    return g;
  }

  /** 碰撞类节流：100 ms 内最多 N 个 */
  bumpAllowed(): boolean {
    const now = performance.now();
    const n = this.bumpTimes.length;
    const oldest = this.bumpTimes[this.bumpHead]!;
    if (now - oldest < 100) return false;
    this.bumpTimes[this.bumpHead] = now;
    this.bumpHead = (this.bumpHead + 1) % n;
    return true;
  }

  /** 危险：音乐低通到 900 Hz（0.5 s） */
  setDanger(on: boolean): void {
    this.dangerOn = on;
    this.applyFilter();
  }

  /** 暂停：降到 30% + 低通 */
  setPausedDuck(on: boolean): void {
    this.pausedDuck = on;
    if (this.ctx && this.musicDuck) this.musicDuck.gain.setTargetAtTime(on ? 0.3 : 1, this.ctx.currentTime, 0.12);
    this.applyFilter();
  }

  private applyFilter(): void {
    if (!this.ctx || !this.musicFilter) return;
    const f = this.pausedDuck ? 700 : this.dangerOn ? 900 : 18000;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.5 / 3);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.unlocked && this.ctx.state !== 'running' && !this.forcedMute) void this.ctx.resume().catch(() => undefined);
  }
}
