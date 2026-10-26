/** 1D 值噪声（预计算 256 点表，余弦插值），用于闪烁、震屏 */
const SIZE = 256;
const TABLE = new Float32Array(SIZE);
{
  let s = 1234567;
  for (let i = 0; i < SIZE; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    TABLE[i] = (s / 4294967296) * 2 - 1;
  }
}

/** 返回 [-1, 1] */
export function noise1(x: number): number {
  const xi = Math.floor(x);
  const f = x - xi;
  const a = TABLE[xi & 255];
  const b = TABLE[(xi + 1) & 255];
  const t = (1 - Math.cos(f * Math.PI)) * 0.5;
  return a + (b - a) * t;
}

/** 闪烁：两层噪声合成，返回 [-1, 1] */
export function flicker(t: number, seed: number, f1 = 1.7, f2 = 5.3): number {
  return 0.6 * noise1(t * f1 + seed * 17.13) + 0.4 * noise1(t * f2 + seed * 31.7 + 100);
}
