// 带种子的 value noise / fbm / worley（只在启动生成纹理时使用）

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** 平铺 value noise：period 为格数（可平铺），0 表示不平铺 */
export function vnoise(x: number, y: number, seed = 0, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  let x0 = ix;
  let y0 = iy;
  let x1 = ix + 1;
  let y1 = iy + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period;
    y0 = ((y0 % period) + period) % period;
    x1 = ((x1 % period) + period) % period;
    y1 = ((y1 % period) + period) % period;
  }
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const u = fade(fx);
  const v = fade(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed = 0, oct = 4, period = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 17, period > 0 ? period * f : 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** worley F2−F1（可平铺），返回 0..~1 */
export function worley(x: number, y: number, seed = 0, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      let cx = ix + i;
      let cy = iy + j;
      const px = cx;
      const py = cy;
      if (period > 0) {
        cx = ((cx % period) + period) % period;
        cy = ((cy % period) + period) % period;
      }
      const fx = px + hash2(cx, cy, seed);
      const fy = py + hash2(cx, cy, seed + 99);
      const d = Math.hypot(fx - x, fy - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  }
  return f2 - f1;
}

/** 一维平滑噪声（用于墨线抖动、震屏） */
export function noise1(t: number, seed = 0): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash2(i, 0, seed);
  const b = hash2(i + 1, 0, seed);
  return (a + (b - a) * fade(f)) * 2 - 1;
}

export function hashf(i: number, seed = 0): number {
  return hash2(i, 7, seed);
}
