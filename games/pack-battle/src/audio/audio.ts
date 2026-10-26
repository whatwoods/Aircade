// AudioContext、解锁、总线、混响、限流
import { settings } from '../core/storage.ts';

interface Voice {
  nodes: AudioScheduledSourceNode[];
  end: number;
}

export const au = {
  ctx: null as AudioContext | null,
  master: null as unknown as GainNode,
  sfx: null as unknown as GainNode,
  music: null as unknown as GainNode,
  reverb: null as unknown as ConvolverNode,
  send: null as unknown as GainNode,
  noise: null as unknown as AudioBuffer,
  voices: [] as Voice[],
  last: new Map<string, number>(),
  /** 4× 速度：次要音效 50% 跳过 */
  fast: false,
  ready: false,
  duck: 0,
};

export const SFX_GAIN = 0.8;
export const MUSIC_GAIN = 0.35;

let onReady: (() => void)[] = [];
export function whenReady(fn: () => void): void {
  if (au.ready) fn();
  else onReady.push(fn);
}

function impulse(ctx: AudioContext, sec: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * (0.35 + 0.5 * (1 - t));
      d[i] = lp * (1 - t) ** 2.6 * (i < 60 ? i / 60 : 1);
    }
  }
  return b;
}

export function unlockAudio(): void {
  try {
    if (!au.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      au.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.connect(ctx.destination);
      au.master = ctx.createGain();
      au.master.gain.value = 0.9;
      au.master.connect(comp);
      au.sfx = ctx.createGain();
      au.sfx.gain.value = settings.sfx ? SFX_GAIN : 0;
      au.sfx.connect(au.master);
      au.music = ctx.createGain();
      au.music.gain.value = settings.music ? MUSIC_GAIN : 0;
      au.music.connect(au.master);
      au.reverb = ctx.createConvolver();
      au.reverb.buffer = impulse(ctx, 1.2);
      au.send = ctx.createGain();
      au.send.gain.value = 0.32;
      au.send.connect(au.reverb);
      au.reverb.connect(au.master);
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      au.noise = nb;
      au.ready = true;
      const l = onReady;
      onReady = [];
      for (const f of l) f();
    }
    if (au.ctx.state === 'suspended' && !document.hidden) void au.ctx.resume().catch(() => undefined);
  } catch {
    /* 音频不可用时静默 */
  }
}

export function suspendAudio(): void {
  if (au.ctx && au.ctx.state === 'running') void au.ctx.suspend().catch(() => undefined);
}

export function resumeAudio(): void {
  if (au.ctx && au.ctx.state === 'suspended') void au.ctx.resume().catch(() => undefined);
}

export function applyVolumes(): void {
  if (!au.ctx) return;
  const t = au.ctx.currentTime;
  au.sfx.gain.setTargetAtTime(settings.sfx ? SFX_GAIN : 0, t, 0.05);
  au.music.gain.setTargetAtTime(settings.music ? MUSIC_GAIN : 0, t, 0.08);
}

/** 音乐压低（首领入场、凤凰复活） */
export function duckMusic(db = 4, sec = 0.2): void {
  if (!au.ctx || !settings.music) return;
  const t = au.ctx.currentTime;
  const g = au.music.gain;
  const low = MUSIC_GAIN * 10 ** (-db / 20);
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(low, t + 0.05);
  g.setValueAtTime(low, t + 0.05 + sec);
  g.linearRampToValueAtTime(MUSIC_GAIN, t + 0.45 + sec);
}

/** 限流检查：同名最短 30ms；返回是否允许播放 */
export function gate(name: string, minor = false, minGap = 0.03): boolean {
  const ctx = au.ctx;
  if (!ctx || !au.ready || ctx.state !== 'running') return false;
  if (!settings.sfx) return false;
  if (minor && au.fast && Math.random() < 0.5) return false;
  const now = ctx.currentTime;
  const l = au.last.get(name) ?? -1;
  if (now - l < minGap) return false;
  au.last.set(name, now);
  return true;
}

/** 登记声部；超过 24 个时停掉最老的 */
export function voice(nodes: AudioScheduledSourceNode[], end: number): void {
  const ctx = au.ctx!;
  const now = ctx.currentTime;
  const vs = au.voices;
  for (let i = vs.length - 1; i >= 0; i--) if (vs[i].end < now) vs.splice(i, 1);
  if (vs.length >= 24) {
    const old = vs.shift()!;
    for (const n of old.nodes) {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    }
  }
  vs.push({ nodes, end });
}
