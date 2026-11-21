// 按剪辑表出片：node scripts/trailer/edit.ts [--nocap]
// 每段 = 素材 [in, out] 塞进 [beats] 拍（自动算变速）+ 冲击推镜 + 白闪 / 倒带；音效跟着变速变调；
// 叠背景音乐（按拍对齐）和字幕 PNG（scripts/trailer/captions.ts 预先渲染）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Seg {
  src: string;
  beats: [number, number];
  in: number;
  out: number;
  zoom?: number;
  focus?: [number, number];
  /** 切入时的冲击推镜幅度（默认 0.1 = 从 1.1 倍弹回） */
  kick?: number;
  flash?: number;
  rewind?: boolean;
  /** 这一段音效的增益 */
  gain?: number;
}
interface Edit {
  out: string;
  size: [number, number];
  fps: number;
  bpm: number;
  music: { file: string; from: number; gain: number };
  sfxGain: number;
  segments: Seg[];
  captions: { text: string; size: number; beats: [number, number]; y: number }[];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NOCAP = process.argv.includes('--nocap');
const E = JSON.parse(readFileSync(join(ROOT, 'scripts/trailer/edit.json'), 'utf8')) as Edit;
// --nocap：无字幕版（平台自带字幕时用）
if (NOCAP) {
  E.captions = [];
  E.out = E.out.replace(/\.mp4$/, '-nocap.mp4');
}
const B = 60 / E.bpm;
const [W, H] = E.size;
const FPS = E.fps;
const SR = 48000;
const f = (n: number): string => n.toFixed(4);
const frames = (beats: number): number => Math.round(beats * B * FPS);

const inputs: string[] = [];
let nIn = 0;
const addInput = (...a: string[]): number => {
  inputs.push(...a);
  return nIn++;
};
const graph: string[] = [];
const srcIdx = new Map<string, number>();
for (const s of E.segments) {
  if (srcIdx.has(s.src)) continue;
  srcIdx.set(s.src, addInput('-i', join(ROOT, 'marketing/trailer/raw', s.src + '.mov')));
}
// 同一素材被多段引用：先 split
const uses = new Map<string, number>();
for (const s of E.segments) uses.set(s.src, (uses.get(s.src) ?? 0) + 1);
const take = new Map<string, number>();
for (const [src, n] of uses) {
  const i = srcIdx.get(src)!;
  graph.push(`[${i}:v]split=${n}${Array.from({ length: n }, (_, k) => `[v_${src}_${k}]`).join('')}`);
  graph.push(`[${i}:a]asplit=${n}${Array.from({ length: n }, (_, k) => `[a_${src}_${k}]`).join('')}`);
}

// 帧数按拍累计取整，保证切点落在拍上且总长精确
let pos = 0;
E.segments.forEach((s, k) => {
  const end = frames(s.beats[1]);
  const nf = end - pos;
  pos = end;
  const dur = nf / FPS;
  const u = take.get(s.src) ?? 0;
  take.set(s.src, u + 1);
  const vin = `[v_${s.src}_${u}]`;
  const ain = `[a_${s.src}_${u}]`;
  const speed = (s.out - s.in) / dur;
  const z = s.zoom ?? 1;
  const kick = s.rewind ? 0 : (s.kick ?? 0.1);
  const [fx, fy] = s.focus ?? [0.5, 0.5];
  // 推镜：逐帧缩放（t = 段内时间）再按焦点裁回成片尺寸
  const zexpr = `${z}*(1+${kick}*pow(max(0,1-t/0.12),2))`;
  const xexpr = `max(0,min(in_w-${W},${fx}*in_w-${W / 2}))`;
  const yexpr = `max(0,min(in_h-${H},${fy}*in_h-${H / 2}))`;
  const v: string[] = [`trim=start=${f(s.in)}:end=${f(s.out)}`, 'setpts=PTS-STARTPTS'];
  if (s.rewind) v.push(`select='not(mod(n\\,5))'`, 'scale=1080:-2', 'reverse', 'setpts=N/(12*TB)', 'hue=s=0.45', 'noise=alls=18:allf=t');
  else v.push(`setpts=PTS/${f(speed)}`);
  v.push(`fps=${FPS}`, `trim=end_frame=${nf}`, `tpad=stop_mode=clone:stop=${nf}`, `trim=end_frame=${nf}`, 'setpts=PTS-STARTPTS');
  v.push(
    `scale=w='trunc(${W}*${zexpr}/2)*2':h='trunc(${H}*${zexpr}/2)*2':eval=frame:flags=lanczos`,
    `crop=${W}:${H}:x='${xexpr}':y='${yexpr}'`,
  );
  if (s.flash) v.push(`eq=brightness='${s.flash}*max(0\\,1-t/0.12)':eval=frame`);
  v.push('setsar=1', 'format=yuv420p');
  graph.push(`${vin}${v.join(',')}[sv${k}]`);
  const a: string[] = [`atrim=start=${f(s.in)}:end=${f(s.out)}`, 'asetpts=PTS-STARTPTS'];
  if (s.rewind) a.push('areverse', `asetrate=${Math.round(SR * speed)}`, `aresample=${SR}`, 'volume=0.35');
  else if (Math.abs(speed - 1) > 0.02) a.push(`asetrate=${Math.round(SR * speed)}`, `aresample=${SR}`);
  if (s.gain) a.push(`volume=${s.gain}`);
  a.push(`apad=whole_dur=${f(dur)}`, `atrim=duration=${f(dur)}`, 'asetpts=PTS-STARTPTS');
  graph.push(`${ain}${a.join(',')}[sa${k}]`);
});
const N = E.segments.length;
const total = pos / FPS;
graph.push(`${E.segments.map((_, k) => `[sv${k}][sa${k}]`).join('')}concat=n=${N}:v=1:a=1[cv][ca]`);

// 字幕：弹入（1.6 倍 → 1 倍，0.12 秒）+ 结尾 0.1 秒淡出
let last = '[cv]';
E.captions.forEach((c, k) => {
  const t0 = c.beats[0] * B;
  const d = (c.beats[1] - c.beats[0]) * B;
  const idx = addInput('-loop', '1', '-framerate', String(FPS), '-t', f(d), '-i', join(ROOT, 'marketing/trailer/caps', k + '.png'));
  graph.push(
    `[${idx}:v]format=rgba,scale=w='trunc(iw*(1+0.6*pow(max(0,1-t/0.12),2))/2)*2':h=-2:eval=frame,fade=out:st=${f(d - 0.1)}:d=0.1:alpha=1,setpts=PTS+${f(t0)}/TB[cap${k}]`,
  );
  graph.push(`${last}[cap${k}]overlay=x='(W-w)/2':y='${c.y}*H-h/2':eof_action=pass:format=auto[ov${k}]`);
  last = `[ov${k}]`;
});

const musicIdx = addInput('-ss', f(E.music.from), '-t', f(total), '-i', join(ROOT, E.music.file));
graph.push(`[${musicIdx}:a]aresample=${SR},volume=${E.music.gain},afade=t=out:st=${f(total - 0.35)}:d=0.35[mus]`);
graph.push(`[ca]volume=${E.sfxGain}[sfx]`);
graph.push(`[sfx][mus]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=${SR}[aout]`);

const args = [
  '-y', '-loglevel', 'error', ...inputs,
  '-filter_complex', graph.join(';\n'),
  '-map', last, '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), '-movflags', '+faststart', '-t', f(total),
  join(ROOT, E.out),
];
console.log(`${N} 段 · ${total.toFixed(2)} 秒 · ${E.captions.length} 条字幕`);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('→', E.out);
