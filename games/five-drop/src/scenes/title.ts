// 标题页（第 4.5 节画面 1、第 6.2 节）：Logo、5×5 演示小棋盘循环、开始按钮
import { C, fCn, fNum } from '../render/theme.ts';
import { roundRect } from '../render/scenery.ts';
import { StoneArt } from '../render/stones.ts';
import type { StoneKind } from '../render/stones.ts';
import { Fx } from '../render/fx.ts';
import { UI, drawButton } from '../render/ui.ts';
import type { Layout } from '../render/layout.ts';
import { easeOutBack, easeOutCubic, clamp } from '../util/ease.ts';
import { audio } from '../audio/audio.ts';

// 演示序列：先铺几颗陪衬子，再沿斜线落 5 颗黑子
const DECOR: [number, number, StoneKind][] = [[1, 4, 'w'], [2, 4, 'b'], [3, 4, 'w'], [4, 4, 'b'], [2, 3, 'w'], [3, 3, 'b'], [4, 3, 'w'], [3, 2, 'w'], [4, 2, 'b'], [4, 1, 'w']];
const DIAG: [number, number][] = [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]];

export class TitleScene {
  art = new StoneArt();
  fx = new Fx();
  private t = 0;
  private cycle = 0;
  private k = 0;
  best = 0;
  firstVisit = true;
  onStart: () => void = () => {};
  onSettings: () => void = () => {};
  private L!: Layout;
  private enterT = 0;
  private flashed = false;
  private coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return true; } })();

  setLayout(L: Layout): void {
    this.L = L;
    if (L.k !== this.k) { this.k = L.k; this.art.build(34, L.k); }
  }
  enter(): void { this.enterT = 0; this.cycle = 0; this.flashed = false; this.fx.clear(); }

  update(dt: number): void {
    this.t += dt; this.enterT += dt; this.cycle += dt;
    if (this.cycle > 6.2) { this.cycle = 0; this.flashed = false; }
    this.fx.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D, ui: UI): void {
    const L = this.L;
    const ty = L.topY + Math.min(60, L.extra * 0.3);
    const ea = easeOutCubic(clamp(this.enterT / 0.6, 0, 1));
    ctx.save();
    ctx.globalAlpha = ea;
    // 设置齿轮
    ui.add({ id: 'btn.settings', x: 330, y: L.topY + 8, w: 44, h: 44, enabled: true, onPress: () => { audio.button(); this.onSettings(); } });
    drawGear(ctx, 352, L.topY + 30, ui.pressAmount('btn.settings'));
    // 演示棋盘
    this.drawDemo(ctx, 195, ty + 250);
    // Logo
    this.drawLogo(ctx, 195, ty + 470);
    ctx.restore();
    // 开始按钮（首帧即可点）
    const by = 600 + (L.H - 844) * 0.5 - 28;
    const glow = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    drawButton(ctx, ui, 'btn.start', 85, by, 220, 56, '开始', true, () => { audio.button(); this.onStart(); }, { glow });
    ctx.globalAlpha = ea;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (this.best > 0) {
      ctx.font = fNum(600, 11);
      ctx.fillStyle = C.text3;
      ctx.fillText('B E S T', 195, by + 92);
      ctx.font = fNum(300, 22);
      ctx.fillStyle = C.text2;
      ctx.fillText(this.best.toLocaleString('en-US'), 195, by + 118);
    } else {
      ctx.font = fCn(400, 13);
      ctx.fillStyle = C.text3;
      ctx.fillText(this.coarse ? '拖动 · 轻点旋转 · 下甩落下' : '← → 移动 · ↑ 旋转 · F 翻色 · 空格落下', 195, by + 100);
    }
    ctx.font = fCn(400, 11);
    ctx.fillStyle = C.text3;
    ctx.fillText(audio.unlocked ? '黑白五子，横竖斜连成一线即消除' : '音效：首次点击后开启', 195, L.H - L.safeBottom - 28);
    ctx.globalAlpha = 1;
  }

  private drawLogo(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.font = fNum(300, 54);
    ctx.fillStyle = C.text1;
    // 「FIVE DR◯P」：O 用白瓷子替换
    const parts = ['FIVE DR', 'P'];
    const w0 = ctx.measureText(parts[0]).width, w1 = ctx.measureText(parts[1]).width;
    const ow = 40;
    const total = w0 + ow + w1 + 4;
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    ctx.fillText(parts[0], x, y);
    x += w0 + 2;
    const sy = 1 + 0.02 * Math.sin(this.t * 1.3);
    this.art.draw(ctx, 'w', x + ow / 2, y - 19, 38, sy, sy);
    // 旋转高光
    const a = this.t * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x + ow / 2 + Math.cos(a) * 9, y - 19 + Math.sin(a) * 9 - 2, 5, 3, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    x += ow + 2;
    ctx.fillText(parts[1], x, y);
    ctx.font = fCn(500, 18);
    ctx.fillStyle = C.text2;
    ctx.textAlign = 'center';
    drawSpaced(ctx, '五子落', cx, y + 38, 7);
    ctx.restore();
  }

  private drawDemo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const cell = 40, n = 5, w = cell * n, x0 = cx - w / 2, y0 = cy - w / 2;
    // 石板浮雕
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    const gr = ctx.createLinearGradient(0, y0 - 16, 0, y0 + w + 16);
    gr.addColorStop(0, C.slabTop); gr.addColorStop(1, C.slabBottom);
    ctx.fillStyle = gr;
    roundRect(ctx, x0 - 16, y0 - 16, w + 32, w + 32, 14); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x0 - 15.5, y0 - 15.5, w + 31, w + 31, 14); ctx.stroke();
    ctx.strokeStyle = C.slabLineDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = x0 + cell / 2 + i * cell;
      ctx.moveTo(p, y0 + cell / 2); ctx.lineTo(p, y0 + w - cell / 2);
      ctx.moveTo(x0 + cell / 2, y0 + cell / 2 + i * cell); ctx.lineTo(x0 + w - cell / 2, y0 + cell / 2 + i * cell);
    }
    ctx.stroke();
    ctx.fillStyle = C.slabLineDark;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    const t = this.cycle;
    const fade = t > 5.4 ? 1 - (t - 5.4) / 0.8 : Math.min(1, t / 0.4);
    ctx.globalAlpha *= clamp(fade, 0, 1);
    for (const [c, r, k] of DECOR) this.art.draw(ctx, k, x0 + cell / 2 + c * cell, y0 + cell / 2 + r * cell, 34);
    ctx.globalAlpha = 1;
    // 斜线：每 0.5s 一颗
    const clearAt = 0.6 + 5 * 0.5 + 0.15;
    for (let i = 0; i < 5; i++) {
      const at = 0.6 + i * 0.5;
      if (t < at || t > clearAt + 0.05) continue;
      const lt = clamp((t - at) / 0.28, 0, 1);
      const [c, r] = DIAG[i];
      const px = x0 + cell / 2 + c * cell, py = y0 + cell / 2 + r * cell;
      const drop = (1 - easeOutCubic(lt)) * -36;
      const sq = lt < 1 ? 1 : 1;
      const sc = 0.7 + 0.3 * easeOutBack(lt);
      ctx.globalAlpha = lt;
      this.art.draw(ctx, 'b', px, py + drop, 34 * sc, sq, sq);
      ctx.globalAlpha = 1;
    }
    if (t >= clearAt && !this.flashed) {
      this.flashed = true;
      const ax = x0 + cell / 2 + DIAG[0][0] * cell, ay = y0 + cell / 2 + DIAG[0][1] * cell;
      const bx = x0 + cell / 2 + DIAG[4][0] * cell, by = y0 + cell / 2 + DIAG[4][1] * cell;
      this.fx.beam(ax, ay, bx, by, 26, 0.42, 0.12);
      for (let i = 0; i < 5; i++) {
        const [c, r] = DIAG[i];
        this.fx.shatter(x0 + cell / 2 + c * cell, y0 + cell / 2 + r * cell, 0, 17, 0.8);
      }
      this.fx.ring(cx, cy, 90, 0.5, true, 2);
    }
    this.fx.drawWorld(ctx, this.art);
  }
}

export function drawSpaced(ctx: CanvasRenderingContext2D, s: string, cx: number, y: number, sp: number): void {
  const chars = [...s];
  const ws = chars.map(ch => ctx.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let x = cx - total / 2;
  const al = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx.fillText(ch, x, y); x += ws[i] + sp; });
  ctx.textAlign = al;
}

export function drawGear(ctx: CanvasRenderingContext2D, x: number, y: number, press: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 - 0.08 * press, 1 - 0.08 * press);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.text1;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
    ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
