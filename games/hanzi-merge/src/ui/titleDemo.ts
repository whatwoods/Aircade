/**
 * 标题页演示（§6.7 ①）：每 4 s 循环一组合成——木+木→林、日+月→明、人+木→休（人在左写作亻）。
 * 部件从两侧滑入各自的位置框（变体交叉淡入），再以墨晕显出整字。
 */
import { RECIPE_MAP } from '../core/recipes.ts';
import { clamp, easeInOutCubic, easeOutCubic, seg } from '../anim/ease.ts';
import { partBoxes } from '../render/compose.ts';
import { INK, glyphs } from '../render/glyphs.ts';

const SEQ = ['林', '明', '休'];
const PERIOD = 4;
const SIZE = 160;

export class TitleDemo {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private dpr = 1;
  private t = 0;

  constructor(c: HTMLCanvasElement) {
    this.c = c;
    this.g = c.getContext('2d')!;
  }

  setDpr(d: number): void {
    this.dpr = d;
    const w = Math.round(SIZE * d);
    if (this.c.width !== w) {
      this.c.width = w;
      this.c.height = w;
    }
  }

  update(dt: number, reduced: boolean): void {
    this.t += dt;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    // 米字格
    g.strokeStyle = 'rgba(184,49,42,0.22)';
    g.lineWidth = 1;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(80, 8);
    g.lineTo(80, 152);
    g.moveTo(8, 80);
    g.lineTo(152, 80);
    g.moveTo(8, 8);
    g.lineTo(152, 152);
    g.moveTo(152, 8);
    g.lineTo(8, 152);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(184,49,42,0.4)';
    g.strokeRect(8.5, 8.5, 143, 143);

    const idx = Math.floor(this.t / PERIOD) % SEQ.length;
    const u = (this.t % PERIOD) / PERIOD;
    const r = RECIPE_MAP.get(SEQ[idx]);
    if (!r) return;
    const boxes = partBoxes(r);
    const fadeIn = clamp(u / 0.08, 0, 1);
    const fadeOut = 1 - seg(u, 0.88, 1);
    const move = reduced ? 1 : easeInOutCubic(seg(u, 0.12, 0.4));
    const reveal = reduced ? seg(u, 0.3, 0.4) : easeOutCubic(seg(u, 0.4, 0.58));
    // 结果字的位置框：边长 110，中心 80,80
    const B = 110;
    const ox = 80 - B / 2;
    const oy = 80 - B / 2;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const sx = i === 0 ? 8 : 88;
      const startX = sx;
      const startY = 46;
      const ex = ox + b.x * B;
      const ey = oy + b.y * B;
      const x = startX + (ex - startX) * move;
      const y = startY + (ey - startY) * move;
      const w = 64 + (b.w * B - 64) * move;
      const h = 64 + (b.h * B - 64) * move;
      const vk = seg(move, 0.3, 0.55);
      const a = fadeIn * fadeOut * (1 - reveal);
      if (b.show !== b.base) {
        glyphs.drawFit(g, b.base, 64, INK.light, x, y, w, h, a * (1 - vk), 2.6);
        glyphs.drawFit(g, b.show, 64, INK.light, x, y, w, h, a * vk, 2.6);
      } else glyphs.drawFit(g, b.base, 64, INK.light, x, y, w, h, a, 2.6);
    }
    if (reveal > 0) {
      const s = 1.08 - 0.08 * reveal;
      glyphs.draw(g, r.c, 80, 80, 104 * s, INK.ink, reveal * fadeOut);
    }
  }
}
