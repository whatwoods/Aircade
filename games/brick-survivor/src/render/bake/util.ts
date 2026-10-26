// Canvas2D helpers used only at bake time.

export type C2D = CanvasRenderingContext2D;

export function hexCss(hex: number, a = 1): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

export function roundRect(c: C2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

/** chamfered rect: top-right and bottom-left corners cut by k (UI shape language) */
export function chamfer(c: C2D, x: number, y: number, w: number, h: number, k: number): void {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w - k, y);
  c.lineTo(x + w, y + k);
  c.lineTo(x + w, y + h);
  c.lineTo(x + k, y + h);
  c.lineTo(x, y + h - k);
  c.closePath();
}

export function polygon(c: C2D, cx: number, cy: number, r: number, n: number, rot = 0): void {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

export function star(c: C2D, cx: number, cy: number, r0: number, r1: number, n: number, rot = -Math.PI / 2): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? r0 : r1;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** soft radial blob; profile is a smooth gaussian-ish falloff reaching 0 at radius r */
export function radialGlow(c: C2D, cx: number, cy: number, r: number, color = '255,255,255', peak = 1): void {
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  const stops = 10;
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const v = Math.exp(-t * t * 4.2) * (1 - t) * peak;
    g.addColorStop(t, `rgba(${color},${v.toFixed(4)})`);
  }
  c.fillStyle = g;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** deterministic tiny PRNG for bake-time decoration */
export function bakeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export const FONT_ORB = "'Orbitron', 'Rajdhani', 'Segoe UI', sans-serif";
export const FONT_RAJ = "'Rajdhani', 'Orbitron', 'Segoe UI', sans-serif";
export const FONT_CJK = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','WenQuanYi Micro Hei','Source Han Sans SC',sans-serif";
