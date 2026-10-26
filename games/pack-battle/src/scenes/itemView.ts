// 每件已拥有装备的表现状态（弹簧位置 / 缩放 / 倾斜 / 视觉角度 + 闪光、弹起、变灰）
import { Spring, Spring2 } from '../core/spring.ts';
import type { ItemId, ItemInst, Lv, Rot } from '../game/types.ts';
import { shapeOf } from '../game/shapes.ts';
import type { BagRect } from '../render/layout.ts';
import { drawItemAt } from '../render/sprites.ts';

export const HALF_PI = Math.PI / 2;

/** 桌边暂存里的缩放格大小：min(30, 58/宽, 60/高)（文档原为 22，放大以保证可读） */
export function stashCell(id: ItemId, rot: Rot): number {
  const s = shapeOf(id, rot);
  return Math.min(36, 58 / s.w, 60 / s.h);
}

export class ItemView {
  uid: number;
  id: ItemId;
  lv: Lv;
  rot: Rot;
  zone: 'bag' | 'stash';
  /** bag：包围盒左上（格单位）；stash：中心（逻辑像素） */
  pos = new Spring2(26, 0.42);
  scale = new Spring(30, 0.35, 1);
  tilt = new Spring(18, 0.4, 0);
  ang = new Spring(28, 0.55, 0);
  /** 桌边里的显示格大小（弹簧，从 54 缩到小尺寸） */
  cell = new Spring(22, 0.7, 22);
  squashPending = false;
  hidden = false;
  /** 原位 20% 虚影（拖拽中） */
  ghost = false;
  flash = 0;
  /** 闪光峰值（4× 时调低，避免满屏白块） */
  flashMax = 0.75;
  /** 战斗出手弹起：剩余时间 */
  pop = 0;
  gray = 0;
  shakeT = 0;
  /** 合成目标脉冲 / 不可合成变灰 */
  pulse = 0;
  /** 回放：触发次数（用于闪烁） */
  constructor(it: ItemInst) {
    this.uid = it.uid;
    this.id = it.id;
    this.lv = it.lv;
    this.rot = it.rot;
    this.zone = it.zone;
    this.ang.snap(it.rot * HALF_PI);
  }

  step(h: number): void {
    this.pos.step(h);
    this.scale.step(h);
    this.tilt.step(h);
    this.ang.step(h);
    this.cell.step(h);
    if (this.pos.w !== 26 && this.pos.settled(this.zone === 'bag' ? 0.03 : 0.8)) this.pos.set(26, 0.42);
    if (this.squashPending && Math.abs(this.pos.x - this.pos.tx) + Math.abs(this.pos.y - this.pos.ty) < (this.zone === 'bag' ? 0.12 : 6)) {
      this.squashPending = false;
      this.scale.x = 0.93;
      this.scale.v = 0;
      this.scale.target = 1;
    }
  }

  update(dt: number): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt);
  }

  /** 旋转后包围盒尺寸（格） */
  dims(): [number, number] {
    const s = shapeOf(this.id, this.rot);
    return [s.w, s.h];
  }

  /** 视觉中心（逻辑像素） */
  center(g: BagRect | null, out: { x: number; y: number }): void {
    if (this.zone === 'bag' && g) {
      const [w, h] = this.dims();
      out.x = g.gx + (this.pos.x + w / 2) * g.cell;
      out.y = g.gy + (this.pos.y + h / 2) * g.cell;
    } else {
      out.x = this.pos.x;
      out.y = this.pos.y;
    }
  }

  drawCell(g: BagRect | null): number {
    return this.zone === 'bag' && g ? g.cell : this.cell.x;
  }

  draw(ctx: CanvasRenderingContext2D, g: BagRect | null, time: number, shadow: boolean): void {
    if (this.hidden) return;
    const c = TMP;
    this.center(g, c);
    let cx = c.x;
    let cy = c.y;
    const cell = this.drawCell(g);
    const small = this.zone === 'stash';
    if (this.shakeT > 0) cx += Math.sin(this.shakeT * 52) * 4 * Math.min(1, this.shakeT / 0.06);
    let s = this.scale.x;
    if (this.pop > 0) {
      // 出手弹起：冲到 1.16、上移 6px
      const k = this.pop / 0.22;
      const curve = Math.sin(Math.PI * (1 - k));
      s *= 1 + 0.16 * curve;
      cy -= 6 * curve * (cell / 46);
    }
    const tilt = this.tilt.x;
    ctx.save();
    ctx.translate(cx, cy);
    if (tilt !== 0) ctx.rotate(tilt);
    if (s !== 1) ctx.scale(s, s);
    if (shadow) {
      ctx.globalAlpha *= 0.55;
      drawItemAt(ctx, this.id, this.lv, this.ang.x, 1.2, 2.2, cell, 'shadow');
      ctx.globalAlpha /= 0.55;
    }
    drawItemAt(ctx, this.id, this.lv, this.ang.x, 0, 0, cell, 'tile', small);
    if (this.gray > 0.01) {
      ctx.globalAlpha *= Math.min(1, this.gray);
      drawItemAt(ctx, this.id, this.lv, this.ang.x, 0, 0, cell, 'gray');
      ctx.globalAlpha /= Math.min(1, this.gray);
    }
    if (this.flash > 0) {
      ctx.globalAlpha *= Math.min(1, this.flash / 0.09) * this.flashMax;
      ctx.globalCompositeOperation = 'lighter';
      drawItemAt(ctx, this.id, 1, this.ang.x, 0, 0, cell, 'white');
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    void time;
  }
}

const TMP = { x: 0, y: 0 };
