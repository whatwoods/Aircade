// 快手端背景音乐（顶替 src/audio/music.ts）：KwaiMedia.Audio 的 BGM 单例播 res/Audio 里的 mp3。
// 封装层没有淡入淡出，这里自己用 setBgmVolume 做：切曲先淡出再换歌再淡入，首领入场的压低也乘在同一个音量上。
import { musicFileName } from '../../audio/sfxFiles.ts';
import { settings } from '../../core/storage.ts';
import { now } from '../now.ts';
import { MUSIC_GAIN, duckLevel, setMusicWanted } from './audio.ts';
import { inKwai, kw } from './kwai.ts';
import { gestureSeen } from './touch.ts';

export type MusicMode = 'arrange' | 'battle' | 'boss' | null;

const OUT_SEC = 0.25;
const IN_SEC = 0.4;

let want: MusicMode = null;
/** 正在播的曲式 */
let playing: MusicMode = null;
/** 0 = 静音，1 = 满；fade 方向由 want 与 playing 是否一致决定 */
let fade = 0;
let lastT = 0;
let lastVol = -1;

function setVol(v: number): void {
  if (Math.abs(v - lastVol) < 0.004) return;
  lastVol = v;
  try {
    kw().KwaiMedia.Audio.setBgmVolume(v);
  } catch {
    /* ignore */
  }
}

/** 切换曲式；force = 重新应用（设置里开关音乐后） */
export function setMusic(mode: MusicMode, force = false): void {
  if (mode === want && !force) return;
  want = mode;
  setMusicWanted(!!mode && settings.music);
  const A = kw().KwaiMedia.Audio;
  try {
    if (!mode || !settings.music) {
      if (!settings.music) A.pauseBgm();
      return;
    }
    if (playing === mode) {
      A.resumeBgm();
      return;
    }
    // 没有在播（首次 / 之前被关了）由 updateMusic 从 0 淡入
  } catch {
    /* ignore */
  }
}

function startTrack(mode: Exclude<MusicMode, null>): void {
  playing = mode;
  fade = 0;
  setVol(0);
  kw().KwaiMedia.Audio.playBgm('res/Audio/' + musicFileName(mode));
}

/** 与网页版同名，给调试接口类型用（快手包不含调试接口） */
export function musicInfo(): { mode: MusicMode; source: 'file' | 'procedural' | null; loaded: string[] } {
  return { mode: want, source: playing ? 'file' : null, loaded: [] };
}

/** 当前曲式 */
export function musicMode(): MusicMode {
  return want;
}

/** 每帧调用：推进淡入淡出、更新音量 */
export function updateMusic(): void {
  const t = now() / 1000;
  const dt = lastT === 0 ? 0 : Math.min(0.1, t - lastT);
  lastT = t;
  if (playing === null) {
    // H5 预览的浏览器要等第一次触摸才让播；快手没这个限制
    if (want && settings.music && (inKwai() || gestureSeen())) startTrack(want);
    return;
  }
  try {
    if (want !== playing) {
      // 要换歌（或关掉）：淡出完再处理
      fade = Math.max(0, fade - dt / OUT_SEC);
      if (fade === 0) {
        if (want && settings.music) startTrack(want);
        else {
          playing = null;
          kw().KwaiMedia.Audio.stopBgm();
          return;
        }
      }
    } else if (fade < 1) {
      fade = Math.min(1, fade + dt / IN_SEC);
    }
    setVol(MUSIC_GAIN * fade * duckLevel());
  } catch {
    /* ignore */
  }
}
