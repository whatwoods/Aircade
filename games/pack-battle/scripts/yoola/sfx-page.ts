// 在无头 Chrome 里跑：用网页版的音效配方（src/audio/sfx.ts 的 RECIPES）经 OfflineAudioContext 渲染成 wav。
// 总线（压缩器、混响、总音量）也是网页版同一份 initGraph，所以渲染出的声音就是网页里实时合成的声音。
import { au, initGraph } from '../../src/audio/audio.ts';
import { RECIPES, makePluckBuffer, plucks } from '../../src/audio/sfx.ts';
import { SFX_ARGS, sfxFileName } from '../../src/audio/sfxFiles.ts';

const SR = 32000;
const MAX_SEC = 5;

function wav(samples: Float32Array): Uint8Array {
  const n = samples.length;
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return out;
}

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

async function render(name: string, arg: number): Promise<Uint8Array> {
  const ctx = new OfflineAudioContext(2, SR * MAX_SEC, SR);
  initGraph(ctx);
  au.ready = true;
  plucks.set(57, makePluckBuffer(ctx, 57));
  RECIPES[name](0.005, au.sfx, arg);
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  const mono = new Float32Array(l.length);
  let end = 0;
  for (let i = 0; i < l.length; i++) {
    mono[i] = (l[i] + r[i]) / 2;
    if (Math.abs(mono[i]) > 0.0006) end = i;
  }
  // 裁掉尾部静音，留 40ms 并淡出
  const len = Math.min(l.length, end + Math.round(SR * 0.04));
  const out = mono.slice(0, len);
  const fade = Math.min(len, Math.round(SR * 0.03));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return wav(out);
}

async function main(): Promise<void> {
  const result: Record<string, string> = {};
  for (const name of Object.keys(RECIPES)) {
    const args = SFX_ARGS[name] ?? [0];
    for (const a of args) result[sfxFileName(name, a)] = b64(await render(name, a));
  }
  const pre = document.getElementById('out')!;
  pre.textContent = JSON.stringify(result);
  document.title = 'done';
}

main().catch((e) => {
  document.getElementById('out')!.textContent = 'ERROR ' + String(e && (e as Error).stack ? (e as Error).stack : e);
});
