/**
 * 11 级原创卡通水果的程序化画法（docs §4.4）。
 * 所有尺寸以半径 r 为单位，原点 = 果心。只画本体/花纹/配件/描边；
 * 高光（不随旋转）与表情（实时）另画。L9 叶冠、L11 王冠是独立精灵（会摆动/掉落）。
 */
import { fruitDef, type FruitColors } from '../config';
import { hexA, prng, starPath } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export function outlineWidth(r: number): number {
  return Math.max(2, 0.07 * r);
}

function circle(ctx: C, r: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
}

/** 本体：径向渐变 亮 → 主（55%）→ 暗（100%），光源左上 */
function bodyGradient(ctx: C, r: number, c: FruitColors): CanvasGradient {
  const g = ctx.createRadialGradient(-0.35 * r, -0.4 * r, 0.02 * r, -0.12 * r, -0.14 * r, 1.42 * r);
  g.addColorStop(0, c.light);
  g.addColorStop(0.16, c.light);
  g.addColorStop(0.55, c.base);
  g.addColorStop(1, c.shade);
  return g;
}

/** 果冻体积感：边缘暗内环 + 右下次表面亮月牙 + 左上细亮边 */
function jelly(ctx: C, r: number, c: FruitColors, strength = 1): void {
  const ring = ctx.createRadialGradient(0, 0, 0.7 * r, 0, 0, r);
  ring.addColorStop(0, hexA(c.shade, 0));
  ring.addColorStop(0.72, hexA(c.shade, 0.12 * strength));
  ring.addColorStop(1, hexA(c.shade, 0.42 * strength));
  ctx.fillStyle = ring;
  circle(ctx, r);
  ctx.fill();
  // 次表面反光（右下）
  ctx.lineCap = 'round';
  ctx.strokeStyle = hexA(c.light, 0.55 * strength);
  ctx.lineWidth = 0.1 * r;
  ctx.beginPath();
  ctx.arc(0, 0, 0.8 * r, 0.12 * Math.PI, 0.42 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.035 * r;
  ctx.beginPath();
  ctx.arc(0, 0, 0.8 * r, 0.16 * Math.PI, 0.36 * Math.PI);
  ctx.stroke();
}

function outline(ctx: C, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = outlineWidth(r);
  circle(ctx, r);
  ctx.stroke();
}

/** 叶片：基点 (x,y)，朝向 ang，长 len，宽 w */
function leaf(ctx: C, x: number, y: number, ang: number, len: number, w: number, fill: string, line: string, lw: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.25, -w, len * 0.75, -w * 0.9, len, 0);
  ctx.bezierCurveTo(len * 0.75, w * 0.9, len * 0.25, w, 0, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, fill);
  g.addColorStop(1, line);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = lw;
  ctx.stroke();
  // 叶脉
  ctx.beginPath();
  ctx.moveTo(len * 0.12, 0);
  ctx.quadraticCurveTo(len * 0.5, -w * 0.12, len * 0.82, 0);
  ctx.lineWidth = lw * 0.6;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  // 叶面高光
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = lw * 0.55;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(len * 0.25, -w * 0.45);
  ctx.quadraticCurveTo(len * 0.45, -w * 0.62, len * 0.62, -w * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 通用本体：渐变 + 果冻 + 花纹（裁剪在圆内） */
function body(ctx: C, r: number, c: FruitColors, pattern?: () => void, jellyK = 1): void {
  ctx.fillStyle = bodyGradient(ctx, r, c);
  circle(ctx, r);
  ctx.fill();
  if (pattern) {
    ctx.save();
    circle(ctx, r);
    ctx.clip();
    pattern();
    ctx.restore();
  }
  jelly(ctx, r, c, jellyK);
}

// ───────────────────────── 各级画法 ─────────────────────────

function blueberry(ctx: C, r: number, c: FruitColors): void {
  const rnd = prng(101);
  body(ctx, r, c, () => {
    // 果粉点
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU;
      const d = (0.35 + rnd() * 0.45) * r;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d + 0.1 * r, 0.075 * r, 0, TAU);
      ctx.fill();
    }
  });
  outline(ctx, r, c.outline);
  // 五角星萼片
  const sy = -0.6 * r;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  starPath(ctx, 0, sy, 0.4 * r, 0.19 * r, 5);
  ctx.fillStyle = c.accent[0]!;
  ctx.fill();
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = Math.max(1.2, 0.06 * r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, sy, 0.1 * r, 0, TAU);
  ctx.fillStyle = '#2C2D7A';
  ctx.fill();
}

function cherry(ctx: C, r: number, c: FruitColors): void {
  const ow = outlineWidth(r);
  // 柄（在本体后）
  ctx.lineCap = 'round';
  ctx.strokeStyle = c.accent[2]!;
  ctx.lineWidth = 0.17 * r + ow;
  ctx.beginPath();
  ctx.moveTo(0.02 * r, -0.72 * r);
  ctx.quadraticCurveTo(0.02 * r, -1.18 * r, 0.38 * r, -1.3 * r);
  ctx.stroke();
  ctx.strokeStyle = c.accent[0]!;
  ctx.lineWidth = 0.17 * r;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.05 * r;
  ctx.beginPath();
  ctx.moveTo(-0.02 * r, -0.86 * r);
  ctx.quadraticCurveTo(-0.01 * r, -1.12 * r, 0.18 * r, -1.22 * r);
  ctx.stroke();

  body(ctx, r, c, () => {
    // 顶部凹痕阴影
    const g = ctx.createRadialGradient(0, -1.02 * r, 0, 0, -1.02 * r, 0.5 * r);
    g.addColorStop(0, hexA(c.shade, 0.75));
    g.addColorStop(1, hexA(c.shade, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, r);
  });
  outline(ctx, r, c.outline);
  // 凹痕
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = Math.max(1.3, 0.06 * r);
  ctx.beginPath();
  ctx.moveTo(-0.2 * r, -0.86 * r);
  ctx.quadraticCurveTo(0, -0.72 * r, 0.2 * r, -0.86 * r);
  ctx.stroke();
  // 小叶
  leaf(ctx, 0.36 * r, -1.28 * r, -0.12, 0.62 * r, 0.24 * r, c.accent[1]!, c.accent[2]!, Math.max(1.2, 0.055 * r));
}

function grape(ctx: C, r: number, c: FruitColors): void {
  body(
    ctx,
    r,
    c,
    () => {
      // 透亮内核
      const g = ctx.createRadialGradient(-0.05 * r, 0.02 * r, 0, -0.05 * r, 0.02 * r, 0.62 * r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.5, 'rgba(240,255,220,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
      // 竖向浅缝线
      ctx.strokeStyle = hexA(c.light, 0.85);
      ctx.lineWidth = 0.055 * r;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0.04 * r, -0.86 * r);
      ctx.bezierCurveTo(0.22 * r, -0.3 * r, 0.24 * r, 0.3 * r, 0.1 * r, 0.86 * r);
      ctx.stroke();
      ctx.strokeStyle = hexA(c.shade, 0.35);
      ctx.lineWidth = 0.035 * r;
      ctx.beginPath();
      ctx.moveTo(0.1 * r, -0.86 * r);
      ctx.bezierCurveTo(0.29 * r, -0.3 * r, 0.31 * r, 0.3 * r, 0.17 * r, 0.86 * r);
      ctx.stroke();
    },
    0.8,
  );
  outline(ctx, r, c.outline);
  // 果蒂
  ctx.save();
  ctx.translate(0.02 * r, -0.98 * r);
  ctx.rotate(0.18);
  ctx.beginPath();
  ctx.moveTo(-0.09 * r, 0.06 * r);
  ctx.lineTo(-0.06 * r, -0.2 * r);
  ctx.quadraticCurveTo(0, -0.27 * r, 0.06 * r, -0.2 * r);
  ctx.lineTo(0.09 * r, 0.06 * r);
  ctx.closePath();
  ctx.fillStyle = c.accent[0]!;
  ctx.fill();
  ctx.strokeStyle = c.accent[1]!;
  ctx.lineWidth = Math.max(1.2, 0.05 * r);
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function kumquat(ctx: C, r: number, c: FruitColors): void {
  body(ctx, r, c, () => {
    // 14 个果皮凹点（黄金角分布）
    ctx.fillStyle = hexA(c.accent[2]!, 0.55);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 14; i++) {
      const d = Math.sqrt((i + 0.6) / 14) * 0.82 * r;
      const a = i * ga + 0.4;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.05 * r, 0.04 * r, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 14; i += 2) {
      const d = Math.sqrt((i + 0.6) / 14) * 0.82 * r;
      const a = i * ga + 0.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d - 0.02 * r, Math.sin(a) * d - 0.025 * r, 0.025 * r, 0, TAU);
      ctx.fill();
    }
  });
  outline(ctx, r, c.outline);
  // 脐点
  ctx.fillStyle = c.outline;
  ctx.beginPath();
  ctx.arc(0, -0.86 * r, 0.06 * r, 0, TAU);
  ctx.fill();
  // 绿叶
  leaf(ctx, 0.02 * r, -0.9 * r, -2.35, 0.62 * r, 0.22 * r, c.accent[0]!, c.accent[1]!, Math.max(1.2, 0.05 * r));
}

function lemon(ctx: C, r: number, c: FruitColors): void {
  const ow = outlineWidth(r);
  // 两端尖头（沿 -45° 对角线），先画描边层再填色，得到干净的并集轮廓
  const tips = [-Math.PI / 4, (3 * Math.PI) / 4];
  const tipPath = (a: number): void => {
    const s = 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - s) * r * 0.96, Math.sin(a - s) * r * 0.96);
    ctx.quadraticCurveTo(Math.cos(a - 0.08) * r * 1.08, Math.sin(a - 0.08) * r * 1.08, Math.cos(a) * r * 1.14, Math.sin(a) * r * 1.14);
    ctx.quadraticCurveTo(Math.cos(a + 0.08) * r * 1.08, Math.sin(a + 0.08) * r * 1.08, Math.cos(a + s) * r * 0.96, Math.sin(a + s) * r * 0.96);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  for (const a of tips) {
    tipPath(a);
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = ow * 2;
    ctx.stroke();
  }
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = ow * 2;
  circle(ctx, r - ow * 0.5);
  ctx.stroke();
  for (const a of tips) {
    tipPath(a);
    ctx.fillStyle = a < 0 ? c.light : c.shade;
    ctx.fill();
  }
  const rnd = prng(505);
  ctx.fillStyle = bodyGradient(ctx, r, c);
  circle(ctx, r - ow * 0.5);
  ctx.fill();
  ctx.save();
  circle(ctx, r);
  ctx.clip();
  // 细密油胞
  for (let i = 0; i < 38; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * 0.9 * r;
    ctx.fillStyle = rnd() < 0.5 ? hexA(c.accent[0]!, 0.42) : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, (0.022 + rnd() * 0.02) * r, 0, TAU);
    ctx.fill();
  }
  // 斜向光带
  ctx.rotate(-Math.PI / 4);
  const band = ctx.createLinearGradient(0, -0.62 * r, 0, -0.28 * r);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(-r, -0.62 * r, 2 * r, 0.34 * r);
  ctx.restore();
  jelly(ctx, r, c, 0.9);
  // 尖头与本体之间的描边补全（不画穿过尖头的那一段）
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = ow;
  for (let i = 0; i < 2; i++) {
    const a0 = tips[i]! + 0.3;
    const a1 = tips[(i + 1) % 2]! - 0.3 + (i === 1 ? TAU : 0);
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.stroke();
  }
  // 尖头上的小高光
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(Math.cos(tips[0]!) * r * 0.98, Math.sin(tips[0]!) * r * 0.98, 0.05 * r, 0.025 * r, tips[0]!, 0, TAU);
  ctx.fill();
}

function peach(ctx: C, r: number, c: FruitColors): void {
  // 绒毛柔光（外圈亮晕）
  const halo = ctx.createRadialGradient(0, 0, r * 0.96, 0, 0, r * 1.12);
  halo.addColorStop(0, 'rgba(255,240,236,0.55)');
  halo.addColorStop(1, 'rgba(255,240,236,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.12, 0, TAU);
  ctx.fill();

  body(ctx, r, c, () => {
    // 底 → 顶 的粉色渐变
    const v = ctx.createLinearGradient(0, -r, 0, r);
    v.addColorStop(0, hexA(c.accent[2]!, 0.75));
    v.addColorStop(0.55, hexA(c.accent[2]!, 0.12));
    v.addColorStop(1, hexA(c.accent[2]!, 0));
    ctx.fillStyle = v;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    // 中缝阴影 + 线
    ctx.lineCap = 'round';
    ctx.strokeStyle = hexA(c.shade, 0.25);
    ctx.lineWidth = 0.16 * r;
    ctx.beginPath();
    ctx.moveTo(0.02 * r, -1.0 * r);
    ctx.bezierCurveTo(0.22 * r, -0.6 * r, 0.24 * r, -0.1 * r, 0.12 * r, 0.2 * r);
    ctx.stroke();
    ctx.strokeStyle = hexA(c.shade, 0.9);
    ctx.lineWidth = 0.045 * r;
    ctx.stroke();
    // 绒毛内亮边
    ctx.strokeStyle = 'rgba(255,245,240,0.45)';
    ctx.lineWidth = 0.08 * r;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, TAU);
    ctx.stroke();
  });
  outline(ctx, r, c.outline);
  // 两片叶
  const lw = Math.max(1.2, 0.04 * r);
  leaf(ctx, 0.06 * r, -0.94 * r, -2.5, 0.56 * r, 0.2 * r, c.accent[0]!, c.accent[1]!, lw);
  leaf(ctx, 0.08 * r, -0.94 * r, -0.62, 0.5 * r, 0.19 * r, c.accent[0]!, c.accent[1]!, lw);
}

function dragonScale(ctx: C, x: number, y: number, ang: number, len: number, w: number, c: FruitColors, lw: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.bezierCurveTo(w * 0.35, -len * 0.62, w, -len * 0.18, w * 0.92, len * 0.08);
    ctx.arc(0, len * 0.08, w * 0.92, 0, Math.PI, false);
    ctx.bezierCurveTo(-w, -len * 0.18, -w * 0.35, -len * 0.62, 0, -len);
    ctx.closePath();
  };
  path();
  const g = ctx.createLinearGradient(0, -len, 0, len * 0.4);
  g.addColorStop(0, c.accent[0]!);
  g.addColorStop(0.32, c.accent[0]!);
  g.addColorStop(0.5, c.accent[2]!);
  g.addColorStop(1, c.base);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = lw * 0.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.35, -len * 0.05);
  ctx.quadraticCurveTo(-w * 0.4, -len * 0.4, -w * 0.1, -len * 0.62);
  ctx.stroke();
  ctx.restore();
}

function dragonfruit(ctx: C, r: number, c: FruitColors): void {
  const lw = Math.max(1.2, 0.035 * r);
  // 8 片鳞叶：上圈 3 + 下圈 5，其中 3 片伸出轮廓
  const inner: [number, number, number][] = [
    [-0.38, -0.32, -0.25],
    [0.4, -0.3, 0.25],
    [0.0, 0.42, 0.0],
    [-0.52, 0.38, -0.32],
    [0.54, 0.4, 0.34],
  ];
  const outer: [number, number, number][] = [
    [-0.86, -0.15, -0.75],
    [0.86, -0.2, 0.75],
    [0.02, -0.82, 0.05],
  ];
  body(ctx, r, c, () => {
    for (const [x, y, a] of inner) dragonScale(ctx, x * r, y * r, a, 0.32 * r, 0.17 * r, c, lw);
  });
  outline(ctx, r, c.outline);
  for (const [x, y, a] of outer) dragonScale(ctx, x * r, y * r, a, 0.36 * r, 0.17 * r, c, lw);
}

function plum(ctx: C, r: number, c: FruitColors): void {
  const rnd = prng(808);
  // 短柄 + 小叶
  ctx.lineCap = 'round';
  ctx.strokeStyle = c.accent[1]!;
  ctx.lineWidth = 0.1 * r;
  ctx.beginPath();
  ctx.moveTo(0.02 * r, -0.9 * r);
  ctx.quadraticCurveTo(0.04 * r, -1.08 * r, 0.14 * r, -1.18 * r);
  ctx.stroke();
  body(ctx, r, c, () => {
    // 斑驳果霜
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * 0.85 * r;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const s = (0.14 + rnd() * 0.18) * r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, 'rgba(255,255,255,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.7, rnd() * Math.PI, 0, TAU);
      ctx.fill();
    }
    // 侧弯缝线
    ctx.strokeStyle = hexA(c.shade, 0.75);
    ctx.lineWidth = 0.045 * r;
    ctx.beginPath();
    ctx.moveTo(0.02 * r, -0.98 * r);
    ctx.bezierCurveTo(0.62 * r, -0.5 * r, 0.6 * r, 0.25 * r, 0.32 * r, 0.75 * r);
    ctx.stroke();
    ctx.strokeStyle = hexA(c.light, 0.6);
    ctx.lineWidth = 0.03 * r;
    ctx.beginPath();
    ctx.moveTo(-0.04 * r, -0.94 * r);
    ctx.bezierCurveTo(0.52 * r, -0.5 * r, 0.5 * r, 0.22 * r, 0.24 * r, 0.7 * r);
    ctx.stroke();
  });
  outline(ctx, r, c.outline);
  leaf(ctx, 0.14 * r, -1.16 * r, -0.35, 0.42 * r, 0.15 * r, c.accent[2]!, '#4DB565', Math.max(1.2, 0.035 * r));
}

function pineapple(ctx: C, r: number, c: FruitColors): void {
  body(ctx, r, c, () => {
    // 菱形交叉格纹
    const step = 0.34 * r;
    ctx.strokeStyle = hexA(c.accent[2]!, 0.75);
    ctx.lineWidth = 0.045 * r;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.rotate(Math.PI / 4);
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath();
      ctx.moveTo(k * step, -1.5 * r);
      ctx.lineTo(k * step, 1.5 * r);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1.5 * r, k * step);
      ctx.lineTo(1.5 * r, k * step);
      ctx.stroke();
    }
    // 每格中心一点 + 小高光
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const x = (i + 0.5) * step;
        const y = (j + 0.5) * step;
        if (x * x + y * y > 1.1 * r * r) continue;
        ctx.fillStyle = hexA(c.outline, 0.55);
        ctx.beginPath();
        ctx.arc(x, y, 0.035 * r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.arc(x - step * 0.22, y - step * 0.22, 0.05 * r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  });
  outline(ctx, r, c.outline);
}

/** L9 叶冠（独立精灵，枢轴在 (0, -0.82r)） */
export function pineappleCrown(ctx: C, r: number): void {
  const c = fruitDef(9).colors;
  const lw = Math.max(1.4, 0.035 * r);
  const leaves: [number, number, number][] = [
    // 角度, 长度, 宽度
    [-1.05, 0.52, 0.16],
    [1.05, 0.52, 0.16],
    [-0.5, 0.62, 0.17],
    [0.5, 0.62, 0.17],
    [0, 0.72, 0.18],
  ];
  for (const [a, len, w] of leaves) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-w * r, 0.12 * r);
    ctx.quadraticCurveTo(-w * r * 0.9, -len * r * 0.55, 0, -len * r);
    ctx.quadraticCurveTo(w * r * 0.9, -len * r * 0.55, w * r, 0.12 * r);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -len * r, 0, 0.1 * r);
    g.addColorStop(0, '#7BE8B4');
    g.addColorStop(0.35, c.accent[0]!);
    g.addColorStop(1, c.accent[1]!);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1C7F55';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = lw * 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * r * 0.25, -0.02 * r);
    ctx.quadraticCurveTo(-w * r * 0.3, -len * r * 0.45, -w * r * 0.05, -len * r * 0.78);
    ctx.stroke();
    ctx.restore();
  }
}

function melon(ctx: C, r: number, c: FruitColors): void {
  const rnd = prng(1010);
  // 网纹点阵（抖动网格），先暗后亮做出浮雕感
  const pts: number[] = [];
  const n = 8;
  const step = (2.2 * r) / n;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      pts.push(-1.1 * r + i * step + (rnd() - 0.5) * step * 0.55, -1.1 * r + j * step + (rnd() - 0.5) * step * 0.55);
    }
  }
  const ctrl: number[] = [];
  for (let k = 0; k < pts.length * 2; k++) ctrl.push((rnd() - 0.5) * step * 0.35);
  const net = (dx: number, dy: number): void => {
    ctx.beginPath();
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const idx = (j * (n + 1) + i) * 2;
        const x = pts[idx]! + dx;
        const y = pts[idx + 1]! + dy;
        if (i < n) {
          const k = idx + 2;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo((x + pts[k]! + dx) / 2 + ctrl[idx]!, (y + pts[k + 1]! + dy) / 2 + ctrl[idx + 1]!, pts[k]! + dx, pts[k + 1]! + dy);
        }
        if (j < n) {
          const k = idx + (n + 1) * 2;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo((x + pts[k]! + dx) / 2 + ctrl[pts.length + idx]!, (y + pts[k + 1]! + dy) / 2 + ctrl[pts.length + idx + 1]!, pts[k]! + dx, pts[k + 1]! + dy);
        }
      }
    }
  };
  body(ctx, r, c, () => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    net(0.025 * r, 0.03 * r);
    ctx.strokeStyle = hexA(c.outline, 0.35);
    ctx.lineWidth = 0.05 * r;
    ctx.stroke();
    net(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.lineWidth = 0.04 * r;
    ctx.stroke();
  });
  outline(ctx, r, c.outline);
  // T 形瓜柄 + 卷须
  const sc = c.accent[1]!;
  const so = c.accent[2]!;
  const lw = Math.max(1.4, 0.03 * r);
  ctx.lineCap = 'round';
  ctx.strokeStyle = so;
  ctx.lineWidth = 0.085 * r + lw * 2;
  ctx.beginPath();
  ctx.moveTo(0, -0.92 * r);
  ctx.lineTo(0, -1.13 * r);
  ctx.moveTo(-0.16 * r, -1.15 * r);
  ctx.lineTo(0.16 * r, -1.15 * r);
  ctx.stroke();
  ctx.strokeStyle = sc;
  ctx.lineWidth = 0.085 * r;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.025 * r;
  ctx.beginPath();
  ctx.moveTo(-0.13 * r, -1.17 * r);
  ctx.lineTo(0.1 * r, -1.17 * r);
  ctx.stroke();
  // 卷须
  ctx.strokeStyle = sc;
  ctx.lineWidth = Math.max(1.4, 0.03 * r);
  ctx.beginPath();
  ctx.moveTo(0.16 * r, -1.15 * r);
  ctx.bezierCurveTo(0.3 * r, -1.18 * r, 0.34 * r, -1.02 * r, 0.26 * r, -1.0 * r);
  ctx.bezierCurveTo(0.2 * r, -0.98 * r, 0.2 * r, -1.08 * r, 0.27 * r, -1.08 * r);
  ctx.stroke();
}

function watermelon(ctx: C, r: number, c: FruitColors): void {
  body(ctx, r, c, () => {
    // 7 道锯齿竖条纹（沿经线弯曲）
    ctx.fillStyle = c.accent[0]!;
    const xs = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9];
    for (const x0 of xs) {
      const hw = 0.085 * (1 - Math.abs(x0) * 0.35);
      ctx.beginPath();
      const N = 16;
      for (let i = 0; i <= N; i++) {
        const t = -1 + (2 * i) / N;
        const k = Math.sqrt(Math.max(0, 1 - t * t));
        const zig = (i % 2 === 0 ? 1 : -1) * 0.045;
        const x = (x0 * k + (hw + zig) * k) * r;
        const y = t * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = N; i >= 0; i--) {
        const t = -1 + (2 * i) / N;
        const k = Math.sqrt(Math.max(0, 1 - t * t));
        const zig = (i % 2 === 0 ? -1 : 1) * 0.045;
        ctx.lineTo((x0 * k - (hw + zig) * k) * r, t * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    // 顶部亮区
    const g = ctx.createRadialGradient(-0.3 * r, -0.45 * r, 0, -0.3 * r, -0.45 * r, 0.8 * r);
    g.addColorStop(0, hexA(c.light, 0.55));
    g.addColorStop(1, hexA(c.light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
  });
  outline(ctx, r, c.outline);
}

/** L11 金王冠（独立精灵，原点在冠底中心，宽约 0.9r） */
export function kingCrown(ctx: C, r: number): void {
  const w = 0.46 * r;
  const h = 0.42 * r;
  const lw = Math.max(1.6, 0.03 * r);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(-w * 1.08, -h * 0.95);
  ctx.lineTo(-w * 0.45, -h * 0.45);
  ctx.lineTo(0, -h * 1.18);
  ctx.lineTo(w * 0.45, -h * 0.45);
  ctx.lineTo(w * 1.08, -h * 0.95);
  ctx.lineTo(w, 0);
  ctx.quadraticCurveTo(0, h * 0.18, -w, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -h * 1.2, 0, h * 0.2);
  g.addColorStop(0, '#FFF0A8');
  g.addColorStop(0.45, '#FFC93C');
  g.addColorStop(1, '#F2A100');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#C97F00';
  ctx.lineWidth = lw;
  ctx.stroke();
  // 冠带
  ctx.beginPath();
  ctx.moveTo(-w * 0.98, -h * 0.12);
  ctx.quadraticCurveTo(0, h * 0.02, w * 0.98, -h * 0.12);
  ctx.strokeStyle = 'rgba(255,240,168,0.9)';
  ctx.lineWidth = lw * 1.1;
  ctx.stroke();
  // 尖上的小珠
  ctx.fillStyle = '#FFF0A8';
  for (const [x, y] of [[-w * 1.08, -h * 0.95], [0, -h * 1.18], [w * 1.08, -h * 0.95]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 0.045 * r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#C97F00';
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  }
  // 粉宝石
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.68);
  ctx.lineTo(w * 0.2, -h * 0.4);
  ctx.lineTo(0, -h * 0.12);
  ctx.lineTo(-w * 0.2, -h * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#FF6F91';
  ctx.fill();
  ctx.strokeStyle = '#C93D63';
  ctx.lineWidth = lw * 0.8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.05, -h * 0.58);
  ctx.lineTo(w * 0.06, -h * 0.45);
  ctx.lineTo(-w * 0.08, -h * 0.4);
  ctx.closePath();
  ctx.fill();
  // 高光
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(-w * 0.8, -h * 0.25);
  ctx.lineTo(-w * 0.86, -h * 0.68);
  ctx.stroke();
}

const DRAW: ((ctx: C, r: number, c: FruitColors) => void)[] = [
  blueberry,
  cherry,
  grape,
  kumquat,
  lemon,
  peach,
  dragonfruit,
  plum,
  pineapple,
  melon,
  watermelon,
];

/** 画某级水果的本体（不含高光与表情） */
export function drawFruitBody(ctx: C, level: number, r: number): void {
  const def = fruitDef(level);
  ctx.save();
  DRAW[level - 1]!(ctx, r, def.colors);
  ctx.restore();
}

/** 本体精灵需要的半边长（含配件，单位 r 的倍数） */
export const SPRITE_EXTENT = [1.25, 1.45, 1.35, 1.35, 1.25, 1.2, 1.3, 1.35, 1.12, 1.3, 1.12];

/** 高光层（不随视觉旋转）：左上椭圆 + 小白点；樱桃多一个点 */
export function drawGloss(ctx: C, level: number, r: number): void {
  ctx.save();
  const lod = r < 16;
  ctx.translate(-0.36 * r, -0.47 * r);
  ctx.rotate(-Math.PI / 6);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.21 * r);
  g.addColorStop(0, 'rgba(255,255,255,0.86)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.78)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.scale(1, 0.24 / 0.42);
  ctx.beginPath();
  ctx.arc(0, 0, 0.21 * r * (lod ? 1.05 : 1), 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(-0.07 * r, -0.66 * r, Math.max(0.8, 0.07 * r), 0, TAU);
  ctx.fill();
  if (level === 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-0.62 * r, -0.12 * r, 0.06 * r, 0, TAU);
    ctx.fill();
  }
  // 右下微弱反光点（玻璃糖质感）
  if (!lod) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(0.5 * r, 0.52 * r, 0.07 * r, 0.04 * r, -0.8, 0, TAU);
    ctx.fill();
  }
}
