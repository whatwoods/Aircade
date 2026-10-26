// 桌边暂存：5 个粉笔虚线槽 + 钉着的小纸签"桌边 · 不参战"
import { C, cached, drawPaper } from '../kit.ts';
import type { Rect } from '../layout.ts';
import { drawSprite, text } from '../text.ts';
import { rgba } from '../textures.ts';

export function drawStash(ctx: CanvasRenderingContext2D, slots: Rect[], area: Rect, hi: number, time: number, alpha: number, dy: number): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(0, dy);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const on = i === hi;
    ctx.strokeStyle = on ? rgba(C.goldLight, 0.95) : rgba(C.chalk, 0.38);
    ctx.lineWidth = on ? 2.2 : 1.6;
    ctx.setLineDash([6, 5]);
    if (on) ctx.lineDashOffset = -time * 24;
    ctx.beginPath();
    ctx.roundRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4, 9);
    ctx.stroke();
    ctx.lineDashOffset = 0;
    if (on) {
      ctx.fillStyle = rgba(C.goldLight, 0.12);
      ctx.fill();
    }
  }
  ctx.setLineDash([]);
  // 小纸签"桌边 · 不参战"
  ctx.save();
  ctx.translate(area.x + 44, area.y + 8);
  ctx.rotate(-0.052);
  drawSprite(ctx, stashTag(), -36, -9);
  text(ctx, '桌边 · 不参战', 0, 0, { size: 10, weight: 800, color: C.inkSoft });
  ctx.restore();
  ctx.restore();
}

function stashTag() {
  return cached('stashtag', 72, 18, 4, (ctx, ratio) => {
    drawPaper(ctx, ratio, 0, 0, 72, 18, { seed: 31, burn: 0.6, r: 3 });
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.arc(6, 9, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
}
