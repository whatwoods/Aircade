// 首局引导的画面：聚光镂空、墨笔手势、羊皮纸气泡（步骤逻辑见 game/tutorial.ts）
import { ITEMS } from '../config.ts';
import { ease } from '../core/tween.ts';
import { shapeOf } from '../game/shapes.ts';
import { TUT_TEXT } from '../game/tutorial.ts';
import type { Rect } from '../render/layout.ts';
import { LW, stage } from '../render/stage.ts';
import { drawItemAt } from '../render/sprites.ts';
import { drawBubble, drawHand, spotlight } from '../render/ui/widgets.ts';
import type { GameScene } from './gameScene.ts';

const PAD = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

export class Guide {
  gs: GameScene;
  private fade = 0;
  private lastStep = 0;
  private bubbleT = 0;
  private doneT = 0;

  constructor(gs: GameScene) {
    this.gs = gs;
  }

  update(dt: number): void {
    const gs = this.gs;
    const t = gs.tut;
    if (t.step !== this.lastStep) {
      this.lastStep = t.step;
      this.bubbleT = 0;
      this.doneT = 0;
    }
    this.bubbleT += dt;
    const want = t.step > 0 && (t.step !== 5 || gs.phase === 'battle') ? 1 : 0;
    this.fade += (want - this.fade) * Math.min(1, dt * 8);
    gs.nextB.visible = t.step === 3 && t.t > 4 && gs.phase === 'arrange';
    // 第 5 步：第一次出手后 0.9s 收起
    if (t.step === 5 && gs.bc.firstFire) {
      this.doneT += dt;
      if (this.doneT > 0.9) t.stop();
    }
  }

  private shopIndex(id: string): number {
    return this.gs.run.shop.findIndex((s) => s.id === id);
  }

  draw(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const gs = this.gs;
    const t = gs.tut;
    if (t.step === 0 || this.fade < 0.02) return;
    const L = gs.L;
    const g = gs.bagRect();
    const dragging = !!gs.ac.drag;
    const ov = gs.ov.active;
    if (ov) return;
    const a = this.fade;
    ctx.save();
    ctx.globalAlpha *= a;
    const bubbleY = L.bubbleY - 34;
    const appear = Math.min(1, this.bubbleT / 0.25);
    if (t.step === 1 || t.step === 2) {
      const id = t.step === 1 ? 'sword' : 'whetstone';
      const si = this.shopIndex(id);
      const holes: Rect[] = [PAD(L.bag, 4)];
      if (si >= 0) holes.push(PAD(L.cards[si], 6));
      const st = gs.run.stash.findIndex((x) => x && x.id === id);
      if (st >= 0) holes.push(PAD(L.stash[st], 4));
      if (t.praise <= 0) spotlight(ctx, LW, stage.H, holes, 0.55);
      let msg = TUT_TEXT[t.step];
      if (t.step === 2 && t.praise > 0) msg = '相邻的装备会互相加成！';
      else if (t.step === 2 && t.wrong) msg = '要和剑挨着（共享一条边）';
      drawBubble(ctx, msg, 195, bubbleY, 320, [195, bubbleY + 26], appear);
      if (!dragging && t.praise <= 0) {
        // 手从卡片（或桌边）拖一个虚影到目标格
        let sx = 0;
        let sy = 0;
        if (si >= 0) {
          const box = gs.shopV.itemBox(L, si, id as 'sword');
          sx = box.cx;
          sy = box.cy;
        } else if (st >= 0) {
          const r = L.stash[st];
          sx = r.x + r.w / 2;
          sy = r.y + r.h / 2;
        } else {
          ctx.restore();
          return;
        }
        let tx = 2;
        let ty = 1;
        if (t.step === 2) {
          const sword = gs.run.bag.find((x) => x.id === 'sword');
          if (sword) {
            const ss = shapeOf('sword', sword.rot);
            const ws = shapeOf('whetstone', 0);
            // 剑的右侧优先，其次左侧
            tx = sword.x + ss.w;
            ty = sword.y;
            if (tx + ws.w > 6) tx = sword.x - ws.w;
          }
        }
        const sh = shapeOf(id as 'sword', 0);
        const ex = g.gx + (tx + sh.w / 2) * g.cell;
        const ey = g.gy + (ty + sh.h / 2) * g.cell;
        const cyc = (time % 2.2) / 2.2;
        const k = cyc < 0.15 ? 0 : cyc > 0.75 ? 1 : ease.inOutCubic((cyc - 0.15) / 0.6);
        const hx = sx + (ex - sx) * k;
        const hy = sy + (ey - sy) * k;
        const ghostA = cyc < 0.1 ? cyc / 0.1 : cyc > 0.85 ? Math.max(0, 1 - (cyc - 0.85) / 0.15) : 1;
        ctx.save();
        ctx.globalAlpha *= 0.45 * ghostA;
        drawItemAt(ctx, id as 'sword', 1, 0, hx, hy, 22 + (g.cell - 22) * k, 'tile', k < 0.5);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha *= ghostA;
        drawHand(ctx, hx + 6, hy + 8, cyc > 0.1 && cyc < 0.8 ? 1 : 0, 3);
        ctx.restore();
      }
    } else if (t.step === 3) {
      drawBubble(ctx, TUT_TEXT[3], 195, bubbleY, 320, [195, bubbleY + 26], appear);
      const sword = gs.run.bag.find((x) => x.id === 'sword') ?? gs.run.bag[0];
      if (sword && !dragging) {
        const v = gs.views.get(sword.uid);
        if (v) {
          const c = { x: 0, y: 0 };
          v.center(g, c);
          const cyc = (time % 1.4) / 1.4;
          const press = cyc > 0.35 && cyc < 0.55 ? 1 : 0;
          drawHand(ctx, c.x + 4, c.y + 6 - (press ? 0 : 6), press, 3);
        }
      }
      if (gs.nextB.visible) gs.nextB.draw(ctx, time, real);
    } else if (t.step === 4) {
      const msg = TUT_TEXT[4].replace('{gold}', String(gs.run.gold));
      drawBubble(ctx, msg, 195, bubbleY, 320, [195, bubbleY + 26], appear);
      const f = L.fight;
      const bob = Math.sin(time * 6) * 6;
      drawHand(ctx, f.x + f.w * 0.62, f.y + f.h * 0.55 + bob, 0, 3);
    } else if (t.step === 5) {
      if (gs.phase === 'battle') {
        const pr = this.firstRing();
        if (pr) {
          const by = pr.y - 64;
          drawBubble(ctx, TUT_TEXT[5], 195, Math.max(gs.B.band.y + 8, by - 10), 300, [pr.x, pr.y - 18], appear);
          // 指向冷却环的箭头
          ctx.save();
          ctx.strokeStyle = '#fff3c4';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          const bob = Math.sin(time * 7) * 3;
          ctx.beginPath();
          ctx.moveTo(pr.x + 24, pr.y - 30 + bob);
          ctx.lineTo(pr.x + 8, pr.y - 12 + bob);
          ctx.moveTo(pr.x + 8, pr.y - 12 + bob);
          ctx.lineTo(pr.x + 18, pr.y - 13 + bob);
          ctx.moveTo(pr.x + 8, pr.y - 12 + bob);
          ctx.lineTo(pr.x + 10, pr.y - 22 + bob);
          ctx.stroke();
          ctx.restore();
        }
      }
    } else if (t.step === 6 && gs.phase === 'arrange') {
      drawBubble(ctx, TUT_TEXT[6], 195, bubbleY, 320, [195, bubbleY + 26], appear);
      const si = this.shopIndex('sword');
      const sword = gs.run.bag.find((x) => x.id === 'sword' && x.lv === 1);
      if (si >= 0 && sword && !dragging) {
        const box = gs.shopV.itemBox(L, si, 'sword');
        const v = gs.views.get(sword.uid);
        if (v) {
          const c = { x: 0, y: 0 };
          v.center(g, c);
          const cyc = (time % 2.2) / 2.2;
          const k = cyc < 0.15 ? 0 : cyc > 0.75 ? 1 : ease.inOutCubic((cyc - 0.15) / 0.6);
          const hx = box.cx + (c.x - box.cx) * k;
          const hy = box.cy + (c.y - box.cy) * k;
          const ga = cyc < 0.1 ? cyc / 0.1 : cyc > 0.85 ? Math.max(0, 1 - (cyc - 0.85) / 0.15) : 1;
          ctx.save();
          ctx.globalAlpha *= 0.45 * ga;
          drawItemAt(ctx, 'sword', 1, 0, hx, hy, box.cell + (g.cell - box.cell) * k, 'tile', k < 0.5);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha *= ga;
          drawHand(ctx, hx + 6, hy + 8, cyc > 0.1 && cyc < 0.8 ? 1 : 0, 3);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  /** 第一件有冷却的玩家装备的冷却环位置 */
  private firstRing(): { x: number; y: number } | null {
    const gs = this.gs;
    const g = gs.bagRect();
    let best: { x: number; y: number } | null = null;
    for (const it of gs.run.bag) {
      const def = ITEMS[it.id];
      if (def.trigger !== 'cooldown') continue;
      const v = gs.views.get(it.uid);
      if (!v) continue;
      const c = { x: 0, y: 0 };
      v.center(g, c);
      if (!best || def.tag === 'weapon') best = c;
      if (def.tag === 'weapon') break;
    }
    return best;
  }
}
