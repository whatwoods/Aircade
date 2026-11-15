// 快手端音效（顶替 src/audio/sfx.ts）：播的是 pnpm audio:yoola 用网页版合成配方离线渲染出的 wav，
// 经 KwaiMedia.Audio.playSfx 播放（它按文件复用最多 10 个音频实例）
import { sfxFileName } from '../../audio/sfxFiles.ts';
import { gate } from './audio.ts';
import { kw } from './kwai.ts';

// 和网页版一致：4× 速度时这些次要音效随机跳过一半
const MINOR = new Set(['hit', 'shield', 'swish', 'tick', 'cloth', 'bubble', 'gulp', 'coinUp']);

function play(name: string, arg: number): void {
  try {
    kw().KwaiMedia.Audio.playSfx('res/Audio/' + sfxFileName(name, arg));
  } catch {
    /* ignore */
  }
}

/** 播放音效；arg 为音高偏移等参数，delay 秒后播 */
export function sfx(name: string, arg = 0, delay = 0): void {
  if (!gate(name, MINOR.has(name))) return;
  if (delay > 0) setTimeout(() => play(name, arg), delay * 1000);
  else play(name, arg);
}
