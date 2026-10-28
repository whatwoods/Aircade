// WebAudio 实时合成：音效 + 程序化环境音乐（第 5.4 节）

// E 小调五声（E G A B D）
const PENTA = [0, 3, 5, 7, 10];
const E3 = 164.81;
function noteHz(semi: number): number { return E3 * Math.pow(2, semi / 12); }
function pentaHz(step: number): number {
  const o = Math.floor(step / 5), i = ((step % 5) + 5) % 5;
  return noteHz(PENTA[i] + 12 * o);
}

// 和弦：i – VI – III – VII（Em – C – G – D），半音相对 E3
const CHORDS = [[0, 7, 12, 15, 19], [-4, 3, 8, 12, 15], [3, 10, 15, 19, 22], [-2, 5, 10, 14, 17]];

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private reverb!: ConvolverNode;
  private revSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  private voices = 0;
  // 音乐状态
  private nextChordAt = 0;
  private chordIdx = 0;
  private nextNoteAt = 0;
  private nextTickAt = 0;
  private padNodes: { o: OscillatorNode; g: GainNode }[] = [];
  level = 1;
  danger = false;
  private nextBeatAt = 0;
  playing = false;
  private paused = false;
  private rnd = Math.random;

  unlock(): void {
    if (!this.ctx) {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxOn ? 0.8 : 0;
      this.sfxBus.connect(this.master);
      this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 2400;
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
      this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
      // 生成的混响脉冲
      const len = Math.floor(ctx.sampleRate * 1.8);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
      this.revSend = ctx.createGain(); this.revSend.gain.value = 0.35;
      this.revSend.connect(this.reverb); this.reverb.connect(this.master);
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfx(on: boolean): void { this.sfxOn = on; if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.03); }
  setMusic(on: boolean): void { this.musicOn = on; if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.2); }

  suspend(): void { if (this.ctx && this.ctx.state === 'running') { this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); setTimeout(() => { void this.ctx?.suspend(); }, 200); } }
  resume(): void { if (this.ctx) { void this.ctx.resume(); this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.1); } }
  setPaused(p: boolean): void {
    this.paused = p;
    if (this.ctx) this.musicFilter.frequency.setTargetAtTime(p ? 400 : this.danger ? 900 : 2400, this.ctx.currentTime, 0.15);
  }
  setDanger(d: boolean): void {
    this.danger = d;
    if (this.ctx && !this.paused) this.musicFilter.frequency.setTargetAtTime(d ? 900 : 2400, this.ctx.currentTime, 0.4);
  }

  get unlocked(): boolean { return !!this.ctx; }
  private get ok(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  // ---------- 基础合成 ----------
  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; at?: number; slide?: number; rev?: number; bus?: 'sfx' | 'music'; detune?: number } = {}): void {
    if (!this.ok) return;
    if (this.voices > 40) return;
    const ctx = this.ctx!;
    const t = (opts.at ?? ctx.currentTime) + 0.001;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(opts.bus === 'music' ? this.musicBus : this.sfxBus);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; g.connect(s); s.connect(this.revSend); }
    o.start(t); o.stop(t + dur + 0.05);
    this.voices++;
    o.onended = () => { this.voices--; o.disconnect(); g.disconnect(); };
  }

  private fm(freq: number, dur: number, gain: number, ratio = 3.5, index = 2.2, at?: number, rev = 0.5, bus: 'sfx' | 'music' = 'sfx'): void {
    if (!this.ok) return;
    if (this.voices > 40) return;
    const ctx = this.ctx!;
    const t = (at ?? ctx.currentTime) + 0.001;
    const car = ctx.createOscillator(); car.frequency.value = freq;
    const mod = ctx.createOscillator(); mod.frequency.value = freq * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * index, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g); g.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(this.revSend); }
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
    this.voices++;
    car.onended = () => { this.voices--; car.disconnect(); mod.disconnect(); g.disconnect(); mg.disconnect(); };
  }

  private noise(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; at?: number; sweepTo?: number; rev?: number; attack?: number } = {}): void {
    if (!this.ok) return;
    if (this.voices > 40) return;
    const ctx = this.ctx!;
    const t = (opts.at ?? ctx.currentTime) + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + this.rnd() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 2000, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, t + (opts.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; g.connect(s); s.connect(this.revSend); }
    src.start(t, this.rnd() * 0.5); src.stop(t + dur + 0.05);
    this.voices++;
    src.onended = () => { this.voices--; src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  // ---------- 音效 ----------
  tick(col: number): void { this.tone(2000 + col * 40, 0.02, { type: 'triangle', gain: 0.05 }); }
  bump(): void { this.tone(140, 0.07, { type: 'sine', gain: 0.12, slide: 0.7 }); }
  rotate(): void { this.tone(1500, 0.025, { type: 'triangle', gain: 0.06 }); this.tone(2300, 0.03, { type: 'triangle', gain: 0.05, at: (this.ctx?.currentTime ?? 0) + 0.035 }); }
  rotFail(): void { this.noise(0.05, { freq: 900, q: 4, gain: 0.12 }); }
  invert(): void { this.fm(1318, 0.22, 0.07, 2.01, 1.2, undefined, 0.4); this.noise(0.16, { freq: 6000, q: 1.5, gain: 0.05, sweepTo: 9000 }); }
  hold(): void { this.tone(420, 0.16, { type: 'sine', gain: 0.1, slide: 1.8, attack: 0.03 }); }
  holdFail(): void { this.bump(); }
  softTick(): void { this.tone(900, 0.012, { type: 'triangle', gain: 0.025 }); }
  hardDrop(rows: number): void {
    const k = Math.min(1, rows / 12);
    this.tone(120, 0.18 + 0.1 * k, { type: 'sine', gain: 0.25 + 0.15 * k, slide: 0.6 });
    this.noise(0.06, { freq: 1800, q: 0.8, gain: 0.15 + 0.1 * k });
  }
  land(): void { this.tone(600, 0.04, { type: 'triangle', gain: 0.04 }); }
  lock(black: boolean): void {
    if (black) { this.tone(520, 0.08, { type: 'sine', gain: 0.12 }); this.noise(0.03, { freq: 2500, q: 2, gain: 0.06 }); }
    else { this.tone(1760, 0.09, { type: 'sine', gain: 0.08 }); this.tone(2640, 0.06, { type: 'sine', gain: 0.04 }); }
  }
  previewDing(): void { this.fm(1975, 0.3, 0.025, 3.01, 0.6, undefined, 0.6); }
  five(k: number, lines: number, long: boolean): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    const base = 7 + (k - 1) * 2;
    this.fm(pentaHz(base), 1.2, 0.14, 3.5, 2.0, t, 0.7);
    if (lines >= 2) { this.fm(pentaHz(base + 3), 1.2, 0.09, 3.5, 2.0, t + 0.01, 0.7); this.fm(pentaHz(base + 5), 1.3, 0.08, 3.5, 2.0, t + 0.02, 0.7); }
    if (long) this.fm(pentaHz(base + 10), 0.9, 0.05, 2, 1.0, t + 0.03, 0.7);
    if (k >= 3) this.tone(55, 0.6, { type: 'sine', gain: 0.3, slide: 0.5, at: t });
  }
  shatter(n: number): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime + 0.12;
    this.noise(0.28, { freq: 3500, q: 0.9, gain: 0.16 + Math.min(0.1, n * 0.01), at: t, sweepTo: 1200 });
    for (let i = 0; i < 3; i++) this.tone(3000 + this.rnd() * 3000, 0.08 + this.rnd() * 0.08, { type: 'sine', gain: 0.04, at: t + i * 0.03 + this.rnd() * 0.02, rev: 0.3 });
  }
  crystal(): void { this.fm(3951, 0.5, 0.05, 1.5, 1, undefined, 0.8); }
  fall(i: number): void {
    if (i > 5) return;
    const t = (this.ctx?.currentTime ?? 0) + 0.06 * i;
    this.tone(900 - i * 90, 0.05, { type: 'triangle', gain: 0.05, at: t });
  }
  fullRow(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noise(0.4, { freq: 600, q: 0.7, gain: 0.12, sweepTo: 3000, attack: 0.08 });
    for (const s of [0, 7, 12]) this.tone(noteHz(s - 12), 0.6, { type: 'triangle', gain: 0.06, at: t + 0.05, rev: 0.4 });
  }
  combo(n: number): void { const t = this.ctx?.currentTime ?? 0; this.tone(pentaHz(10 + n), 0.07, { type: 'triangle', gain: 0.05, at: t }); this.tone(pentaHz(11 + n), 0.09, { type: 'triangle', gain: 0.05, at: t + 0.06 }); }
  perfect(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 8; i++) this.fm(pentaHz(5 + i * 2), 1.4, 0.07, 3.5, 1.5, t + i * 0.08, 0.9);
  }
  levelUp(): void { const t = this.ctx?.currentTime ?? 0; this.fm(noteHz(12), 0.5, 0.07, 2, 1, t, 0.5); this.fm(noteHz(16), 0.7, 0.07, 2, 1, t + 0.12, 0.5); }
  garbageWarn(): void { this.tone(70, 0.25, { type: 'sine', gain: 0.18, attack: 0.02 }); }
  garbagePush(): void { this.noise(0.18, { type: 'lowpass', freq: 220, q: 0.7, gain: 0.35 }); this.tone(60, 0.2, { type: 'sine', gain: 0.2, slide: 0.8 }); }
  heartbeat(): void { const t = this.ctx?.currentTime ?? 0; this.tone(60, 0.12, { type: 'sine', gain: 0.3, at: t }); this.tone(55, 0.14, { type: 'sine', gain: 0.22, at: t + 0.16 }); }
  gameOver(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    [12, 7, 3].forEach((s, i) => this.fm(noteHz(s), 1.2, 0.09, 2, 1.2, t + i * 0.22, 0.8));
    this.noise(1.2, { type: 'lowpass', freq: 3000, sweepTo: 120, gain: 0.08 });
  }
  record(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 10; i++) this.fm(pentaHz(10 + i), 0.6, 0.05, 3.01, 1.2, t + i * 0.06, 0.8);
  }
  button(): void { this.tone(1200, 0.03, { type: 'triangle', gain: 0.05 }); }
  panel(): void { this.noise(0.22, { freq: 1200, q: 0.5, gain: 0.04, sweepTo: 2400, attack: 0.08 }); }
  sweep(): void { this.noise(0.45, { freq: 400, q: 0.6, gain: 0.06, sweepTo: 4000, attack: 0.15 }); }

  // ---------- 音乐 ----------
  startMusic(): void { this.playing = true; if (this.ctx) { this.nextChordAt = this.ctx.currentTime + 0.1; this.nextNoteAt = this.nextChordAt + 1; this.nextTickAt = this.nextChordAt; this.nextBeatAt = this.nextChordAt; } }
  stopMusic(): void {
    this.playing = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const p of this.padNodes) { p.g.gain.cancelScheduledValues(t); p.g.gain.setTargetAtTime(0.0001, t, 0.4); p.o.stop(t + 2); }
    this.padNodes = [];
  }

  update(): void {
    if (!this.ok || !this.playing || this.paused) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const ahead = now + 0.25;
    while (this.nextChordAt < ahead) {
      const at = this.nextChordAt;
      // 旧铺底淡出
      for (const p of this.padNodes) { p.g.gain.setTargetAtTime(0.0001, at, 0.8); p.o.stop(at + 4); }
      this.padNodes = [];
      const ch = CHORDS[this.chordIdx % CHORDS.length];
      this.chordIdx++;
      const notes = this.danger ? [ch[0] - 12, ch[1] - 12] : ch.slice(0, 4);
      for (const s of notes) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = noteHz(s - 12);
          o.detune.value = det;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.linearRampToValueAtTime(0.035, at + 2.5);
          o.connect(f); f.connect(g); g.connect(this.musicBus);
          const s2 = ctx.createGain(); s2.gain.value = 0.3; g.connect(s2); s2.connect(this.revSend);
          o.start(at);
          this.padNodes.push({ o, g });
          o.onended = () => { o.disconnect(); f.disconnect(); g.disconnect(); s2.disconnect(); };
        }
      }
      this.nextChordAt += 8;
    }
    while (this.nextNoteAt < ahead) {
      if (!this.danger) {
        const step = 5 + Math.floor(this.rnd() * 8);
        this.fm(pentaHz(step), 1.6, 0.03, 2.0, 1.1, this.nextNoteAt, 0.7, 'music');
      }
      this.nextNoteAt += 1.2 + this.rnd() * 2.6;
    }
    const bpm = Math.min(108, 72 + (this.level - 1) * 3);
    const beat = 60 / bpm;
    while (this.nextTickAt < ahead) {
      if (this.level >= 7 && !this.danger) this.tone(5200, 0.015, { type: 'square', gain: 0.008, at: this.nextTickAt, bus: 'music' });
      this.nextTickAt += beat / 2;
    }
    while (this.nextBeatAt < ahead) {
      if (this.danger) { this.tone(58, 0.12, { type: 'sine', gain: 0.25, at: this.nextBeatAt, bus: 'music' }); this.tone(52, 0.14, { type: 'sine', gain: 0.18, at: this.nextBeatAt + 0.16, bus: 'music' }); }
      this.nextBeatAt += 0.9;
    }
  }
}

export const audio = new Audio();
