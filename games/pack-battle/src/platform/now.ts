// 统一时间源（毫秒）：网页 / TapTap 直接用 performance.now；快手端必须走 AIGCUtils._now
import { kw } from './yoola/kwai.ts';

let unit = 1;
let n0 = 0;
let d0 = 0;
let calibrated = false;

/**
 * 快手真机上 performance.now 可能返回微秒（kshelper 里有注释），而 _now 直接转发它。
 * 开头 200ms 拿 Date.now 对一下：增长快过 100 倍就按微秒折算。
 */
function yoolaNow(): number {
  const n = kw().AIGCUtils._now();
  if (!calibrated) {
    const d = Date.now();
    if (n0 === 0) {
      n0 = n;
      d0 = d;
    } else if (d - d0 >= 200) {
      unit = (n - n0) / (d - d0) > 100 ? 0.001 : 1;
      calibrated = true;
    }
  }
  return n * unit;
}

/** 拍摄模式（仅调试）：时间由逐帧时钟给出 */
export const filmClock = { on: false, ms: 0 };

export function now(): number {
  if (filmClock.on) return filmClock.ms;
  return __YOOLA__ ? yoolaNow() : performance.now();
}
