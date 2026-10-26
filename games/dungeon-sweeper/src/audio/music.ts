import type { AudioEngine } from './audio';

const DRIP = [587.33, 698.46, 880, 1046.5];
/** D F G A C（竖琴动机音池，两个八度） */
const HARP = [293.66, 349.23, 392, 440, 523.25, 587.33, 698.46, 783.99, 880];

/**
 * 程序化氛围音乐（文档 §5.6）：持续音、洞穴风、水滴、竖琴动机、紧张层、苏醒合唱层。
 * 持续层是常驻节点；随机层在 update() 中提前 0.1s 调度（基于 ctx.currentTime）。
 */
export class Music {
  private a: AudioEngine;
  private started = false;
  private nextDrip = 0;
  private nextHarp = 0;
  private nextDrum = 0;
  private tensionGain: GainNode | null = null;
  private choirGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private dripSend: GainNode | null = null;
  danger = 0;
  awake = false;
  /** 标题页更安静（无紧张层） */
  title = true;

  constructor(a: AudioEngine) {
    this.a = a;
  }

  start(): void {
    const c = this.a.ctx;
    if (!c || this.started) return;
    this.started = true;
    const t = c.currentTime;
    const bus = this.a.musicBus;
    // 1. 持续音 D2 + A2
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 0.7;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = c.createGain();
    lfoG.gain.value = 80;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    lfo.start(t);
    this.droneGain = c.createGain();
    this.droneGain.gain.setValueAtTime(0.0001, t);
    this.droneGain.gain.linearRampToValueAtTime(0.05, t + 3);
    for (const [f, dt] of [
      [73.42, -6],
      [73.42, 6],
      [110, -5],
      [110, 6],
    ] as [number, number][]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = dt;
      o.connect(lp);
      o.start(t);
    }
    lp.connect(this.droneGain);
    this.droneGain.connect(bus);
    // 2. 洞穴风
    const src = c.createBufferSource();
    src.buffer = this.a.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.5;
    bp.frequency.value = 600;
    const wl = c.createOscillator();
    wl.frequency.value = 0.03;
    const wlg = c.createGain();
    wlg.gain.value = 300;
    wl.connect(wlg);
    wlg.connect(bp.frequency);
    wl.start(t);
    this.windGain = c.createGain();
    this.windGain.gain.setValueAtTime(0.0001, t);
    this.windGain.gain.linearRampToValueAtTime(0.015, t + 4);
    src.connect(bp);
    bp.connect(this.windGain);
    this.windGain.connect(bus);
    src.start(t);
    // 水滴：额外混响湿度
    this.dripSend = c.createGain();
    this.dripSend.gain.value = 0.6;
    this.dripSend.connect(this.a.reverb);
    // 5. 紧张层：震音弦
    this.tensionGain = c.createGain();
    this.tensionGain.gain.value = 0;
    const so = c.createOscillator();
    so.type = 'sawtooth';
    so.frequency.value = 587.33;
    const vib = c.createOscillator();
    vib.frequency.value = 6;
    const vg = c.createGain();
    vg.gain.value = 5;
    vib.connect(vg);
    vg.connect(so.frequency);
    const trem = c.createOscillator();
    trem.frequency.value = 6;
    const tg = c.createGain();
    tg.gain.value = 0.5;
    const tremAmp = c.createGain();
    tremAmp.gain.value = 0.5;
    trem.connect(tg);
    tg.connect(tremAmp.gain);
    const slp = c.createBiquadFilter();
    slp.type = 'lowpass';
    slp.frequency.value = 1200;
    so.connect(slp);
    slp.connect(tremAmp);
    tremAmp.connect(this.tensionGain);
    this.tensionGain.connect(bus);
    so.start(t);
    vib.start(t);
    trem.start(t);
    // 6. 苏醒合唱垫 D3 F3 A3
    this.choirGain = c.createGain();
    this.choirGain.gain.value = 0;
    const clp = c.createBiquadFilter();
    clp.type = 'lowpass';
    clp.frequency.value = 900;
    const cl = c.createOscillator();
    cl.frequency.value = 0.05;
    const clg = c.createGain();
    clg.gain.value = 500;
    cl.connect(clg);
    clg.connect(clp.frequency);
    cl.start(t);
    for (const f of [146.83, 174.61, 220]) {
      for (const d of [-9, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = d;
        o.connect(clp);
        o.start(t);
      }
    }
    clp.connect(this.choirGain);
    this.choirGain.connect(bus);
    this.nextDrip = t + 1.5;
    this.nextHarp = t + 4;
    this.nextDrum = t + 1;
  }

  /** 死亡：风声升起 */
  windSwell(): void {
    const c = this.a.ctx;
    if (!c || !this.windGain) return;
    const g = this.windGain.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setTargetAtTime(0.05, c.currentTime, 0.6);
    g.setTargetAtTime(0.015, c.currentTime + 4, 1.5);
  }

  /** 屠龙开战：静音 200ms 后由序列接管 */
  silence(ms: number): void {
    const c = this.a.ctx;
    if (!c) return;
    const g = this.a.musicDuck.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setTargetAtTime(0.0001, c.currentTime, 0.04);
    g.setTargetAtTime(1, c.currentTime + ms / 1000, 0.4);
  }

  update(): void {
    const c = this.a.ctx;
    if (!c || !this.started || c.state !== 'running') return;
    const t = c.currentTime;
    const on = this.a.musicOn && !this.a.muted;
    // 层级增益
    const dz = this.title ? 0 : this.danger;
    if (this.tensionGain) this.tensionGain.gain.setTargetAtTime(0.01 * dz, t, 0.8);
    if (this.choirGain) this.choirGain.gain.setTargetAtTime(this.awake && !this.title ? 0.012 : 0, t, 1.5);
    if (!on) {
      // 关闭时只推进计时，不调度
      if (this.nextDrip < t) this.nextDrip = t + 2;
      if (this.nextHarp < t) this.nextHarp = t + 4;
      if (this.nextDrum < t) this.nextDrum = t + 1.2;
      return;
    }
    const bus = this.a.musicBus;
    const ahead = t + 0.1;
    // 3. 水滴
    if (this.nextDrip < ahead) {
      const f = DRIP[Math.floor(Math.random() * DRIP.length)];
      const st = Math.max(t, this.nextDrip);
      this.a.tone('sine', f, f * 0.995, st, 0.18, 0.05, { attack: 0.004, dest: bus });
      if (this.dripSend) this.a.tone('sine', f, f * 0.995, st, 0.18, 0.03, { attack: 0.004, dest: this.dripSend });
      this.nextDrip = st + 2.5 + Math.random() * 3.5;
    }
    // 4. 竖琴动机
    if (this.nextHarp < ahead) {
      const st = Math.max(t, this.nextHarp);
      const n = 3 + Math.floor(Math.random() * 3);
      let idx = Math.floor(Math.random() * 5);
      let o = 0;
      for (let k = 0; k < n; k++) {
        const f = HARP[Math.max(0, Math.min(HARP.length - 1, idx))];
        this.a.tone('triangle', f, f, st + o, 1.1, 0.035, { attack: 0.003, dest: bus, filter: ['lowpass', 2200] });
        idx += Math.random() < 0.5 ? 1 : Math.random() < 0.5 ? 2 : -1;
        o += 0.22 + Math.random() * 0.2;
      }
      this.nextHarp = st + 8 + Math.random() * 6;
    }
    // 5. 紧张层低鼓
    if (this.nextDrum < ahead) {
      const st = Math.max(t, this.nextDrum);
      if (dz > 0.05) this.a.tone('sine', 55, 38, st, 0.5, 0.14 * dz, { attack: 0.005, dest: bus });
      this.nextDrum = st + 1.2;
    }
  }
}
