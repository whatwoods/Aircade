// 行囊：外框（玩家 / 敌人）、落点预览（绿色行军蚁 / 红色斜线 / 合成金色脉冲）、冷却环、敌情卡缩略图
import { BAG, ITEMS } from '../../config.ts';
import { shapeOf, type Cell } from '../../game/shapes.ts';
import type { FrameStyle, Placed, Tag } from '../../game/types.ts';
import { C, TAG_COLOR, bagFrame, type BagFrameOpts } from '../kit.ts';
import type { BagRect } from '../layout.ts';
import { outlineOf } from '../sprites.ts';
import { drawSprite } from '../text.ts';
import { rgba } from '../textures.ts';

export const PLAYER_FRAME: BagFrameOpts = {
  cols: BAG.cols, rows: BAG.rows, cell: 54, frame: 16, style: 'leather', flap: true, straps: true, corners: 'brass',
};

/** 玩家行囊外框（按格大小缩放；sy = 竖向压扁，以底边为轴） */
export function drawPlayerBag(ctx: CanvasRenderingContext2D, g: BagRect, sy = 1): void {
  const k = g.cell / 54;
  const sp = bagFrame(PLAYER_FRAME);
  const x = g.gx - 16 * k;
  const y = g.gy - 16 * k;
  if (sy !== 1) {
    const by = y + (BAG.rows * 54 + 32) * k;
    ctx.save();
    ctx.translate(0, by);
    ctx.scale(1, sy);
    ctx.translate(0, -by);
    drawSprite(ctx, sp, x, y, k);
    ctx.restore();
  } else drawSprite(ctx, sp, x, y, k);
}

const CORNERS: Record<FrameStyle, BagFrameOpts['corners']> = {
  moss: 'none', patch: 'none', silk: 'none', bone: 'bone', hide: 'iron', crate: 'iron', wicker: 'none', iron: 'iron', shadow: 'iron', gold: 'gold',
};

export function enemyFrameOpts(style: FrameStyle, cols: number, rows: number, cell: number, frame: number): BagFrameOpts {
  return { cols, rows, cell, frame, style, flap: false, straps: false, corners: CORNERS[style] };
}

export function drawEnemyBag(ctx: CanvasRenderingContext2D, g: BagRect, style: FrameStyle, cols: number, rows: number): void {
  drawSprite(ctx, bagFrame(enemyFrameOpts(style, cols, rows, g.cell, g.frame)), g.x, g.y);
}

const outlineCache = new Map<string, [number, number][]>();
function outline(cells: Cell[]): [number, number][] {
  const key = cells.map((c) => c[0] + ',' + c[1]).join(';');
  let o = outlineCache.get(key);
  if (!o) outlineCache.set(key, (o = outlineOf(cells)));
  return o;
}

function pathOutline(ctx: CanvasRenderingContext2D, g: BagRect, ox: number, oy: number, cells: Cell[], inset: number): void {
  const o = outline(cells);
  const n = o.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = o[(i - 1 + n) % n];
    const b = o[i];
    const c = o[(i + 1) % n];
    const d1x = Math.sign(b[0] - a[0]);
    const d1y = Math.sign(b[1] - a[1]);
    const d2x = Math.sign(c[0] - b[0]);
    const d2y = Math.sign(c[1] - b[1]);
    const x = g.gx + (ox + b[0]) * g.cell + inset * (-d1y - d2y);
    const y = g.gy + (oy + b[1]) * g.cell + inset * (d1x + d2x);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export interface Placement {
  id: Placed['id'];
  rot: Placed['rot'];
  x: number;
  y: number;
  ok: boolean;
  conflict: Cell[];
}

/** 落点预览：合法 = 绿色 22% + 流动铅笔虚线；非法 = 冲突格红斜线 + 红虚线 */
export function drawPlacement(ctx: CanvasRenderingContext2D, g: BagRect, p: Placement, time: number): void {
  const s = shapeOf(p.id, p.rot);
  const cell = g.cell;
  ctx.save();
  if (p.ok) {
    ctx.fillStyle = rgba(C.ok, 0.22);
    for (const [cx, cy] of s.cells) ctx.fillRect(g.gx + (p.x + cx) * cell + 1, g.gy + (p.y + cy) * cell + 1, cell - 2, cell - 2);
    pathOutline(ctx, g, p.x, p.y, s.cells, 2);
    ctx.strokeStyle = '#d8f0b0';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -time * 28;
    ctx.stroke();
  } else {
    // 只画在背包内的格子
    const bad = new Set(p.conflict.map((c) => c[0] + ',' + c[1]));
    ctx.beginPath();
    ctx.rect(g.gx, g.gy, BAG.cols * cell, BAG.rows * cell);
    ctx.clip();
    for (const [cx, cy] of s.cells) {
      const x = g.gx + (p.x + cx) * cell;
      const y = g.gy + (p.y + cy) * cell;
      if (bad.has(p.x + cx + ',' + (p.y + cy))) {
        ctx.fillStyle = rgba(C.bad, 0.2);
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.clip();
        ctx.strokeStyle = rgba('#ff8a6a', 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let d = -cell; d < cell; d += 9) {
          ctx.moveTo(x + d, y + cell);
          ctx.lineTo(x + d + cell, y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    pathOutline(ctx, g, p.x, p.y, s.cells, 2);
    ctx.strokeStyle = '#ff8a6a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
  }
  ctx.restore();
}

/** 合成目标：金色 3Hz 脉冲描边 */
export function drawMergeGlow(ctx: CanvasRenderingContext2D, g: BagRect, it: Placed, time: number): void {
  const s = shapeOf(it.id, it.rot);
  const k = 0.5 + 0.5 * Math.sin(time * Math.PI * 6);
  ctx.save();
  pathOutline(ctx, g, it.x, it.y, s.cells, -2 - k * 2);
  ctx.strokeStyle = rgba(C.goldLight, 0.35 + 0.4 * k);
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = C.goldLight;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** 号角影响 / 引导：在格子上画琥珀色脉冲点 */
export function drawPulseDots(ctx: CanvasRenderingContext2D, g: BagRect, cells: Cell[], time: number, color: string = C.goldLight): void {
  ctx.save();
  for (const [x, y] of cells) {
    const k = 0.5 + 0.5 * Math.sin(time * 6 + x * 0.7 + y);
    ctx.fillStyle = rgba(color, 0.18 + 0.15 * k);
    ctx.fillRect(g.gx + x * g.cell + 3, g.gy + y * g.cell + 3, g.cell - 6, g.cell - 6);
    ctx.fillStyle = rgba(color, 0.6 + 0.4 * k);
    ctx.beginPath();
    ctx.arc(g.gx + (x + 0.5) * g.cell, g.gy + (y + 0.5) * g.cell, 3 + 2 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const RING_COLOR: Record<Tag, string> = { weapon: TAG_COLOR.weapon, armor: TAG_COLOR.armor, remedy: TAG_COLOR.remedy, tool: TAG_COLOR.tool };

/** 冷却环：底环 20% 墨色 + 进度弧；≥85% 变亮变粗；flash>0 时闪白 */
export function drawCooldownRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number, color: string, flash: number, stunned: boolean): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r + 2.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,16,8,0.42)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(240,227,194,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();
  if (flash > 0) {
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = Math.min(1, flash / 0.12);
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (p > 0.001) {
    const hot = p >= 0.85;
    ctx.strokeStyle = stunned ? '#9a9088' : hot ? lightenCol(color) : color;
    ctx.lineWidth = hot ? 4.2 : 3;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
    if (hot && !stunned) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 7;
      ctx.stroke();
    }
  }
  ctx.restore();
}

const lightCache = new Map<string, string>();
function lightenCol(c: string): string {
  let v = lightCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + 70);
    const g = Math.min(255, ((n >> 8) & 255) + 70);
    const b = Math.min(255, (n & 255) + 60);
    v = `rgb(${r},${g},${b})`;
    lightCache.set(c, v);
  }
  return v;
}

/** 敌情卡里的背包缩略图（格 8px，按标签着色） */
export function drawMiniBag(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, items: readonly Placed[], cols: number, rows: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(40,22,10,0.75)';
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, cols * cell + 6, rows * cell + 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(240,227,194,0.08)';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.fillRect(x + c * cell + 0.5, y + r * cell + 0.5, cell - 1, cell - 1);
  for (const it of items) {
    const s = shapeOf(it.id, it.rot);
    ctx.fillStyle = TAG_COLOR[ITEMS[it.id].tag];
    for (const [cx, cy] of s.cells) ctx.fillRect(x + (it.x + cx) * cell + 0.5, y + (it.y + cy) * cell + 0.5, cell - 1, cell - 1);
  }
  ctx.restore();
}
