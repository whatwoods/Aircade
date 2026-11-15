// 快手版音效文件命名：运行时（platform/yoola/sfx.ts）和离线渲染脚本（scripts/yoola/）共用，纯函数不碰 WebAudio

/** 带参数的音效：渲染哪几个参数值（运行时把 arg 夹到最近的一档） */
export const SFX_ARGS: Record<string, number[]> = {
  /** 结算金币音阶，半音数 */
  coinUp: [0, 1, 2, 3, 4, 5, 6, 7],
  /** 倍速切换音高，参数 = 倍速 */
  speed: [1, 2, 4],
};

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** 取该参数值对应的档位（最近的一档） */
export function sfxArg(name: string, arg: number): number | null {
  const list = SFX_ARGS[name];
  if (!list) return null;
  let best = list[0];
  for (const v of list) if (Math.abs(v - arg) < Math.abs(best - arg)) best = v;
  return best;
}

/** 文件名（不含目录）：sfx-<kebab 名>[-<两位参数>].wav，符合平台「小写-连字符」规范 */
export function sfxFileName(name: string, arg = 0): string {
  const a = sfxArg(name, arg);
  return 'sfx-' + kebab(name) + (a === null ? '' : '-' + (a < 10 ? '0' : '') + a) + '.wav';
}

export const MUSIC_MODES = ['arrange', 'battle', 'boss'] as const;
export const musicFileName = (mode: string): string => 'music-' + mode + '.mp3';
