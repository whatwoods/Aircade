// 背景音乐：优先播 src/assets/music/<mode>.m4a（Lyria 生成、剪成无缝循环）；
// 文件没有或还没解码完时，用程序化音乐顶上（Karplus-Strong 拨弦 + 手鼓 / 铃鼓 / 太鼓 + 低音持续音，lookahead 调度）。
// 两种来源都走同一套 600ms 交叉淡化。
import { AUDIO } from '../config.ts';
import { au, whenReady } from './audio.ts';
import { plucks } from './sfx.ts';

export type MusicMode = 'arrange' | 'battle' | 'boss' | null;

interface Chord {
  root: number;
  tones: number[];
}

// D 大调：D–A–Bm–G | D–G–A–D
const MAJOR: Chord[] = [
  { root: 38, tones: [50, 54, 57] },
  { root: 45, tones: [52, 57, 61] },
  { root: 47, tones: [54, 59, 62] },
  { root: 43, tones: [50, 55, 59] },
  { root: 38, tones: [50, 54, 57] },
  { root: 43, tones: [50, 55, 59] },
  { root: 45, tones: [52, 57, 61] },
  { root: 38, tones: [50, 54, 57] },
];
// D 小调：Dm–B♭–C–A
const MINOR: Chord[] = [
  { root: 38, tones: [50, 53, 57] },
  { root: 46, tones: [50, 53, 58] },
  { root: 48, tones: [52, 55, 60] },
  { root: 45, tones: [52, 57, 61] },
];

// 旅店小调的旋律（每小节 8 个八分音符位，0 = 休止）
const MELODY: number[][] = [
  [74, 0, 0, 73, 71, 0, 69, 0],
  [69, 0, 0, 0, 71, 0, 73, 0],
  [74, 0, 73, 0, 71, 0, 0, 0],
  [67, 0, 69, 0, 71, 0, 0, 0],
  [69, 0, 0, 66, 69, 0, 74, 0],
  [71, 0, 0, 0, 67, 0, 71, 0],
  [73, 0, 71, 0, 69, 0, 73, 0],
  [74, 0, 0, 0, 0, 0, 0, 0],
];

const ARP = [0, 2, 1, 2, 0, 2, 1, 2];

interface Track {
  mode: Exclude<MusicMode, null>;
  gain: GainNode;
  bpm: number;
  step: number;
  next: number;
  bar: number;
  /** 开始淡出的时间（−1 = 正在播放） */
  fadeAt: number;
  drone: AudioScheduledSourceNode[];
  /** 播的是音乐文件（不走拨弦调度） */
  file: boolean;
}

const FILE_URLS = import.meta.glob('../assets/music/*.m4a', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const fileBufs = new Map<string, AudioBuffer>();

/** 解锁音频后按 整理 → 战斗 → 首领 的顺序逐个下载解码；解完的若正在播程序化版本就换掉 */
async function loadFiles(): Promise<void> {
  const ctx = au.ctx;
  if (!ctx) return;
  for (const mode of ['arrange', 'battle', 'boss'] as const) {
    const url = Object.entries(FILE_URLS).find(([p]) => p.endsWith('/' + mode + '.m4a'))?.[1];
    if (!url) continue;
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const buf = await ctx.decodeAudioData(data);
      fileBufs.set(mode, buf);
      if (want === mode && tracks.some((t) => t.mode === mode && t.fadeAt < 0 && !t.file)) setMusic(mode, true);
    } catch {
      /* 解码失败就一直用程序化音乐 */
    }
  }
}

const tracks: Track[] = [];
let want: MusicMode = null;
let built = false;

function buildPlucks(): void {
  if (built || !au.ctx) return;
  built = true;
  const ctx = au.ctx;
  const sr = ctx.sampleRate;
  const notes: number[] = [];
  for (let m = 38; m <= 76; m++) notes.push(m);
  // 分三批生成，避免一帧内卡顿
  const batch = (from: number): void => {
    for (let i = from; i < Math.min(notes.length, from + 13); i++) {
      const m = notes[i];
      const f = 440 * 2 ** ((m - 69) / 12);
      const dur = m < 50 ? 1.1 : 0.8;
      const len = Math.floor(sr * dur);
      const b = ctx.createBuffer(1, len, sr);
      const d = b.getChannelData(0);
      const N = Math.max(2, Math.round(sr / f));
      const ring = new Float32Array(N);
      let lp = 0;
      for (let k = 0; k < N; k++) {
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (m < 50 ? 0.35 : 0.6);
        ring[k] = lp;
      }
      const decay = m < 50 ? 0.9985 : 0.996 - (m - 50) * 0.00004;
      let idx = 0;
      let prev = 0;
      for (let k = 0; k < len; k++) {
        const cur = ring[idx];
        const nv = (cur + prev) * 0.5 * decay;
        prev = cur;
        ring[idx] = nv;
        d[k] = cur * (k < len - 2000 ? 1 : (len - k) / 2000);
        idx++;
        if (idx >= N) idx = 0;
      }
      plucks.set(m, b);
    }
    if (from + 13 < notes.length) setTimeout(() => batch(from + 13), 0);
  };
  setTimeout(() => batch(0), 0);
}

whenReady(() => {
  buildPlucks();
  void loadFiles();
  if (want) setMusic(want, true);
});

function makeTrack(mode: Exclude<MusicMode, null>): Track {
  const ctx = au.ctx!;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(au.music);
  const bpm = mode === 'arrange' ? 84 : mode === 'battle' ? 112 : 100;
  const buf = fileBufs.get(mode);
  const t: Track = { mode, gain: g, bpm, step: 0, next: ctx.currentTime + 0.08, bar: 0, fadeAt: -1, drone: [], file: !!buf };
  if (buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lv = ctx.createGain();
    lv.gain.value = AUDIO.musicFileLevel;
    src.connect(lv);
    lv.connect(g);
    src.start(ctx.currentTime + 0.02);
    t.drone.push(src);
  } else if (mode === 'boss') startDrone(t);
  return t;
}

function startDrone(t: Track): void {
  const ctx = au.ctx!;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  lp.Q.value = 0.8;
  const dg = ctx.createGain();
  dg.gain.value = 0.11;
  lp.connect(dg);
  dg.connect(t.gain);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lg = ctx.createGain();
  lg.gain.value = 120;
  lfo.connect(lg);
  lg.connect(lp.frequency);
  for (const det of [-7, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 73.42;
    o.detune.value = det;
    o.connect(lp);
    o.start();
    t.drone.push(o);
  }
  lfo.start();
  t.drone.push(lfo);
}

function pl(t: Track, midi: number, when: number, vel: number, rev = 0.25): void {
  const b = plucks.get(midi);
  if (!b) return;
  const ctx = au.ctx!;
  const s = ctx.createBufferSource();
  s.buffer = b;
  const g = ctx.createGain();
  g.gain.value = vel;
  s.connect(g);
  g.connect(t.gain);
  if (rev > 0) {
    const r = ctx.createGain();
    r.gain.value = rev;
    g.connect(r);
    r.connect(au.send);
  }
  s.start(when);
}

function nz(t: Track, when: number, dur: number, type: BiquadFilterType, f: number, q: number, vel: number): void {
  const ctx = au.ctx!;
  const s = ctx.createBufferSource();
  s.buffer = au.noise;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  s.connect(fl);
  fl.connect(g);
  g.connect(t.gain);
  s.start(when, Math.random() * 0.6);
  s.stop(when + dur + 0.02);
}

function drum(t: Track, when: number, f0: number, f1: number, dur: number, vel: number, noiseVel: number): void {
  const ctx = au.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, when);
  o.frequency.exponentialRampToValueAtTime(f1, when + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g);
  g.connect(t.gain);
  o.start(when);
  o.stop(when + dur + 0.02);
  if (noiseVel > 0) nz(t, when, 0.06, 'lowpass', 900, 0.7, noiseVel);
}

function scheduleStep(t: Track, when: number): void {
  const st = t.step % 16;
  if (t.mode === 'boss') {
    const ch = MINOR[t.bar % 4];
    if (st === 0 || st === 8) pl(t, ch.root, when, 0.55, 0.1);
    if (st % 4 === 0) {
      const k = (st / 4 + t.bar) % 3;
      pl(t, ch.tones[k] + 12, when, 0.22);
    }
    if (st === 0 || st === 8 || st === 11) drum(t, when, 64, 36, 0.5, st === 11 ? 0.32 : 0.55, 0.22);
    if (st === 14 && t.bar % 2 === 1) drum(t, when, 64, 36, 0.4, 0.3, 0.15);
    return;
  }
  const ch = MAJOR[t.bar % 8];
  if (st % 2 === 0) {
    const i = st / 2;
    const tone = ch.tones[ARP[i]] + (i === 4 ? 12 : 0);
    pl(t, tone, when, t.mode === 'arrange' ? 0.24 : 0.2);
  }
  if (st === 0 || st === 8) pl(t, ch.root, when, 0.5, 0.08);
  if (t.mode === 'arrange') {
    nz(t, when, 0.03, 'highpass', 7000, 0.7, st % 4 === 2 ? 0.035 : 0.018);
    if (st % 2 === 0 && t.bar % 2 === 1) {
      const m = MELODY[t.bar % 8][st / 2];
      if (m) pl(t, m, when, 0.16, 0.4);
    }
  } else {
    if (st === 0 || st === 6 || st === 8 || st === 12) drum(t, when, 92, 50, 0.22, st === 0 ? 0.5 : 0.38, 0.16);
    if (st === 4 || st === 12) nz(t, when, 0.08, 'bandpass', 8000, 1.2, 0.08);
    else if (st % 2 === 0) nz(t, when, 0.03, 'bandpass', 8000, 1.2, 0.025);
    if (st % 2 === 0 && t.bar % 4 >= 2) {
      const m = MELODY[t.bar % 8][st / 2];
      if (m) pl(t, m, when, 0.13, 0.3);
    }
  }
}

/** 切换曲式（600ms 交叉淡化） */
export function setMusic(mode: MusicMode, force = false): void {
  if (mode === want && !force) return;
  want = mode;
  if (!au.ctx || !au.ready) return;
  const ctx = au.ctx;
  const now = ctx.currentTime;
  for (const tr of tracks) {
    if (tr.fadeAt < 0 && tr.mode !== mode) {
      tr.fadeAt = now;
      tr.gain.gain.cancelScheduledValues(now);
      tr.gain.gain.setValueAtTime(tr.gain.gain.value, now);
      tr.gain.gain.linearRampToValueAtTime(0, now + 0.6);
    }
  }
  if (!mode) return;
  const playing = tracks.find((t) => t.mode === mode && t.fadeAt < 0);
  // 同一曲式：已在播就不动；只有"程序化 → 文件"刚解码好时才换
  if (playing && (playing.file || !fileBufs.has(mode))) return;
  if (playing) {
    playing.fadeAt = now;
    playing.gain.gain.cancelScheduledValues(now);
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
    playing.gain.gain.linearRampToValueAtTime(0, now + 0.6);
  }
  const t = makeTrack(mode);
  t.gain.gain.setValueAtTime(0, now);
  t.gain.gain.linearRampToValueAtTime(1, now + 0.6);
  tracks.push(t);
}

/** 调试：正在播的曲式和来源，以及已解码的音乐文件 */
export function musicInfo(): { mode: MusicMode; source: 'file' | 'procedural' | null; loaded: string[] } {
  const t = tracks.find((x) => x.fadeAt < 0);
  return { mode: want, source: t ? (t.file ? 'file' : 'procedural') : null, loaded: [...fileBufs.keys()] };
}

export function musicMode(): MusicMode {
  return want;
}

/** 每帧调用：lookahead 100ms */
export function updateMusic(): void {
  const ctx = au.ctx;
  if (!ctx || !au.ready || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (let i = tracks.length - 1; i >= 0; i--) {
    const t = tracks[i];
    if (t.fadeAt >= 0 && now > t.fadeAt + 0.7) {
      for (const d of t.drone) {
        try {
          d.stop();
        } catch {
          /* ignore */
        }
      }
      t.gain.disconnect();
      tracks.splice(i, 1);
      continue;
    }
    if (t.next < now - 0.25) t.next = now + 0.02; // 从后台回来时跳过积压
    const stepDur = 60 / t.bpm / 4;
    if (t.file) continue;
    while (t.next < now + 0.1) {
      if (t.fadeAt < 0 || t.next < t.fadeAt + 0.6) scheduleStep(t, t.next);
      t.next += stepDur;
      t.step++;
      if (t.step % 16 === 0) t.bar++;
    }
  }
}
