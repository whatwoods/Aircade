// 加成发光连线：二次贝塞尔 + 3 遍 lighter 描边 + 流光 + 端点符文；生长 / 断开 / 战斗闪烁；号角声波；长弓空格点
import type { Link, LinkKind } from '../../game/types.ts';
import type { Cell } from '../../game/shapes.ts';
import { noise1 } from '../noise.ts';
import type { BagRect } from '../layout.ts';
import { glowOf } from '../fx/particles.ts';
import { C } from '../kit.ts';
import { stage } from '../stage.ts';
import { HAND, text } from '../text.ts';

export const LINK_COLOR: Record<LinkKind, string> = {
  speed: '#f0a83a',
  dmg: '#d65a3a',
  shield: '#6f9cc4',
  heal: '#8fbf4f',
  poison: '#9b6cc0',
  hourglass: '#f3cf6a',
  boost: '#4fa49a',
  reduce: '#6f9cc4',
};

const CORE: Record<LinkKind, string> = {
  speed: '#fff1c4',
  dmg: '#ffe0c8',
  shield: '#e8f4ff',
  heal: '#f0ffd0',
  poison: '#f4e4ff',
  hourglass: '#fff6d0',
  boost: '#dcfff6',
  reduce: '#e8f4ff',
};

export interface LinkAnim {
  key: string;
  link: Link;
  grow: number;
  fade: number;
  dying: boolean;
  flash: number;
}

export function linkKey(l: Link): string {
  return l.from + '>' + l.to + ':' + l.kind;
}

const SEG = 10;
const px = new Float32Array(SEG + 1);
const py = new Float32Array(SEG + 1);

/** 计算贝塞尔采样点（带 10fps 沸腾） */
function curve(ax: number, ay: number, bx: number, by: number, time: number, seed: number, boil: boolean): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (ax + bx) / 2 + nx * 0.18 * len;
  const cy = (ay + by) / 2 + ny * 0.18 * len;
  const f = boil ? Math.floor(time * 10) : 0;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const u = 1 - t;
    let x = u * u * ax + 2 * u * t * cx + t * t * bx;
    let y = u * u * ay + 2 * u * t * cy + t * t * by;
    if (i > 0 && i < SEG) {
      const n = noise1(i * 1.7 + f * 3.1, seed) * 0.8;
      x += nx * n;
      y += ny * n;
    }
    px[i] = x;
    py[i] = y;
  }
}

function pathCurve(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(px[0], py[0]);
  for (let i = 1; i <= SEG; i++) ctx.lineTo(px[i], py[i]);
}

function pointAt(t: number, out: { x: number; y: number }): void {
  const f = t * SEG;
  const i = Math.min(SEG - 1, Math.floor(f));
  const k = f - i;
  out.x = px[i] + (px[i + 1] - px[i]) * k;
  out.y = py[i] + (py[i + 1] - py[i]) * k;
}

const P = { x: 0, y: 0 };

/** 画一条连线。alpha：整体透明度；widthK：宽度倍率；grow：0..1 生长；dashed：拖拽预览 */
export function drawLinkCurve(
  ctx: CanvasRenderingContext2D, g: BagRect, l: Link, time: number, alpha: number, widthK: number, grow: number, dashed: boolean, sparks: boolean,
): void {
  const cell = g.cell;
  const ax = g.gx + (l.a[0] + 0.5) * cell;
  const ay = g.gy + (l.a[1] + 0.5) * cell;
  const bx = g.gx + (l.b[0] + 0.5) * cell;
  const by = g.gy + (l.b[1] + 0.5) * cell;
  // 自适应画质降档后关闭线条沸腾
  curve(ax, ay, bx, by, time, l.id * 7 + 1, stage.dprCap >= 2);
  const color = LINK_COLOR[l.kind];
  const k = cell / 54;
  const L = Math.hypot(bx - ax, by - ay) * 1.12;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  if (dashed) ctx.setLineDash([6 * k, 5 * k]);
  else if (grow < 1) {
    ctx.setLineDash([L, L]);
    ctx.lineDashOffset = L * (1 - grow);
  }
  pathCurve(ctx);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.18 * alpha;
  ctx.lineWidth = 10 * k * widthK;
  ctx.stroke();
  ctx.globalAlpha = 0.35 * alpha;
  ctx.lineWidth = 5 * k * widthK;
  ctx.stroke();
  ctx.strokeStyle = CORE[l.kind];
  ctx.globalAlpha = 0.9 * alpha;
  ctx.lineWidth = 2 * k * widthK;
  ctx.stroke();
  ctx.setLineDash([]);
  // 端点符文
  if (grow >= 1) {
    const pr = 4 * k * (1 + 0.15 * Math.sin(time * 3 + l.id));
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.75 * alpha;
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.arc(ax, ay, pr, 0, Math.PI * 2);
    ctx.moveTo(bx + pr, by);
    ctx.arc(bx, by, pr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 流光：2 颗光点，0.9 全程/秒，相位差 0.5；互相加成时第二颗反向、换色
  if (sparks && grow >= 1) {
    const sz = 10 * k;
    for (let i = 0; i < 2; i++) {
      const back = i === 1 && l.backKind !== null;
      let t = (time * 0.9 + i * 0.5 + l.id * 0.13) % 1;
      if (back) t = 1 - t;
      pointAt(t, P);
      ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(t * Math.PI));
      ctx.drawImage(glowOf(back ? LINK_COLOR[l.backKind!] : color), P.x - sz, P.y - sz, sz * 2, sz * 2);
    }
  }
  ctx.restore();
}

/** 连线中点（用于标签） */
export function linkMid(g: BagRect, l: Link, out: { x: number; y: number }): void {
  out.x = g.gx + ((l.a[0] + l.b[0]) / 2 + 0.5) * g.cell;
  out.y = g.gy + ((l.a[1] + l.b[1]) / 2 + 0.5) * g.cell;
}

export class LinkLayer {
  anims: LinkAnim[] = [];

  /** 用新的连线集合更新；返回新增与断开的连线（用于音效与字签） */
  sync(links: Link[], animate: boolean): { added: Link[]; removed: Link[] } {
    const added: Link[] = [];
    const removed: Link[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      const key = linkKey(l);
      seen.add(key);
      const ex = this.anims.find((a) => a.key === key && !a.dying);
      if (ex) ex.link = l;
      else {
        this.anims.push({ key, link: l, grow: animate ? 0 : 1, fade: 1, dying: false, flash: 0 });
        added.push(l);
      }
    }
    for (const a of this.anims) {
      if (!a.dying && !seen.has(a.key)) {
        if (animate) {
          a.dying = true;
          removed.push(a.link);
        } else a.fade = 0;
      }
    }
    this.anims = this.anims.filter((a) => a.fade > 0);
    return { added, removed };
  }

  clear(): void {
    this.anims.length = 0;
  }

  flashLinks(ids: number[] | undefined): void {
    if (!ids) return;
    for (const a of this.anims) if (ids.includes(a.link.id)) a.flash = 0.12;
  }

  update(dt: number): void {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (a.grow < 1) a.grow = Math.min(1, a.grow + dt / 0.25);
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt);
      if (a.dying) {
        a.fade -= dt / 0.2;
        if (a.fade <= 0) this.anims.splice(i, 1);
      }
    }
  }

  /** dim：战斗中平时变暗 */
  draw(ctx: CanvasRenderingContext2D, g: BagRect, time: number, dim: number, hideUid = 0): void {
    for (const a of this.anims) {
      if (hideUid && (a.link.from === hideUid || a.link.to === hideUid)) continue;
      const f = a.flash > 0 ? 1 : 0;
      const alpha = a.fade * (dim + (1 - dim) * f) * (a.grow < 1 ? 1 : 1);
      // 生长完成时闪一下
      const pop = a.grow >= 1 ? 0 : 0;
      drawLinkCurve(ctx, g, a.link, time, Math.min(1, alpha + pop), f ? 1.5 : 1, a.grow, false, dim > 0.9 || f > 0);
    }
  }
}

/** 号角：从号口沿线传出 3 道声波弧（每 0.8s 一组），线上格子淡琥珀，受影响装备右上角小环 */
export function drawHornWaves(ctx: CanvasRenderingContext2D, g: BagRect, mouth: Cell, dir: Cell, cells: Cell[], time: number, alpha: number): void {
  const cell = g.cell;
  ctx.save();
  ctx.globalAlpha = 0.16 * alpha;
  ctx.fillStyle = '#f0a83a';
  for (const [x, y] of cells) ctx.fillRect(g.gx + x * cell + 2, g.gy + y * cell + 2, cell - 4, cell - 4);
  const mx = g.gx + (mouth[0] + 0.5 + dir[0] * 0.5) * cell;
  const my = g.gy + (mouth[1] + 0.5 + dir[1] * 0.5) * cell;
  const ang = Math.atan2(dir[1], dir[0]);
  const reach = (cells.length + 0.3) * cell;
  ctx.strokeStyle = '#f0a83a';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const t = ((time / 0.8 + i / 3) % 1);
    const r = 6 + t * Math.max(cell * 0.6, reach);
    ctx.globalAlpha = alpha * (1 - t) * 0.85;
    ctx.lineWidth = 2.2 * (cell / 54);
    ctx.beginPath();
    ctx.arc(mx, my, r, ang - 0.5, ang + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** 长弓：相邻空格的铅笔小圆点 + "+N" */
export function drawBowDots(ctx: CanvasRenderingContext2D, g: BagRect, cells: Cell[], per: number, time: number): void {
  const cell = g.cell;
  ctx.save();
  for (const [x, y] of cells) {
    const cx = g.gx + (x + 0.5) * cell;
    const cy = g.gy + (y + 0.5) * cell;
    ctx.globalAlpha = 0.75 + 0.2 * Math.sin(time * 4 + x + y);
    ctx.strokeStyle = C.chalk;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, '+' + per, cx, cy + 1, { size: 15, family: HAND, color: C.paper, stroke: C.ink, strokeW: 3 });
  }
  ctx.restore();
}
