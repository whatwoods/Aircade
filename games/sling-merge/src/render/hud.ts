/**
 * 画布 HUD（docs §6.4 / §3.1.1）：最高分胶囊、分数（弹簧滚动 + 1.12 弹跳 + 超最高分变金）、
 * 进化链（彩色 / 40% / 剪影 ?，本局最高级金圈，新解锁翻牌）、「下一个」玻璃泡泡、
 * 连击徽章（档位色、进度环、×5 彩虹描边与火花）、危险倒计时。HUD 不随震屏。
 */
import { CONFIG, fruitDef } from '../config';
import { ease, formatScore } from '../core/math';
import { Spring } from '../core/tween';
import { makeVis, type FruitVis } from '../game/fruits';
import type { Game } from '../game/game';
import { stepBlink } from './deform';
import { drawIdleFace } from './faces';
import { candyText, font } from './popups';
import type { FruitPainter } from './slingView';
import type { Sprites } from './sprites';
import { rrect, starPath } from './util';

const H = CONFIG.layout.hud;
const TAU = Math.PI * 2;
const PLUM = '#5B3A5E';
const COMBO_COL = ['#FFB13D', '#FFB13D', '#FF7A59', '#FF4F8B', '#B05CFF'];
const RAINBOW = ['#FF6F91', '#FFB13D', '#FFE15A', '#5FD3B3', '#7C86FF', '#B07CFF'];

export class Hud {
  private sprites: Sprites;
  // 分数
  private shown = 0;
  private shownV = 0;
  private bumpS = new Spring(1, 7, 0.32);
  private lastScore = 0;
  private scoreStr = '0';
  private scoreStrVal = -1;
  private bestStr = '0';
  private bestStrVal = -1;
  private bestS = new Spring(1, 6, 0.3);
  // 进场
  private introT = 1;
  private show = 0;
  // 进化链
  private flipT = new Float32Array(12).fill(9);
  // 下一个
  private nextLevel = 0;
  private nextPop = 1;
  private outLevel = 0;
  private outT = 9;
  private nextVis: FruitVis = makeVis(0.7);
  private nextOpen = 1;
  // 连击
  private comboShown = 0;
  private comboA = 0;
  private comboPop = 0;
  private comboS = new Spring(1, 7, 0.3);
  private comboEndT = 9;
  private lastCombo = 0;
  // 倒计时
  private cdLeft = 3;
  private cdBump = 1;
  private cdA = 0;
  private t = 0;
  private iconFn: (ctx: CanvasRenderingContext2D, level: number, r: number) => void = drawIdleFace;

  constructor(sprites: Sprites) {
    this.sprites = sprites;
  }

  reset(g: Game): void {
    this.shown = 0;
    this.shownV = 0;
    this.lastScore = 0;
    this.bumpS.snap(1);
    this.comboShown = 0;
    this.comboA = 0;
    this.lastCombo = 0;
    this.flipT.fill(9);
    this.nextLevel = g.run.next;
    this.nextPop = 0;
    this.outT = 9;
  }

  intro(): void {
    this.introT = 0;
  }

  onFlip(level: number): void {
    this.flipT[level] = 0;
  }

  onNextChanged(level: number): void {
    if (level === this.nextLevel && this.nextPop >= 1) return;
    this.outLevel = this.nextLevel;
    this.outT = 0;
    this.nextLevel = level;
    this.nextPop = 0;
  }

  onTick(left: number): void {
    this.cdLeft = left;
    this.cdBump = 1.5;
  }

  onBestBump(): void {
    this.bestS.kick(6);
  }

  update(g: Game, dt: number): void {
    this.t += dt;
    const playing = g.scene === 'playing' || g.scene === 'gameover' || g.scene === 'results';
    this.show += ((playing ? 1 : 0) - this.show) * Math.min(1, dt * 10);
    if (this.introT < 1) this.introT = Math.min(1, this.introT + dt / 0.55);
    // 分数：临界阻尼追随 + 弹跳
    const sc = g.run.score;
    if (sc > this.lastScore) this.bumpS.kick(5.3);
    else if (sc < this.lastScore) this.shown = sc;
    this.lastScore = sc;
    {
      const w = 2 * Math.PI * 3;
      const n = Math.min(16, Math.max(1, Math.ceil(dt * w * 2.5)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = w * w * (sc - this.shown) - 2 * w * this.shownV;
        this.shownV += a * h;
        this.shown += this.shownV * h;
      }
      if (Math.abs(sc - this.shown) < 0.5 && Math.abs(this.shownV) < 2) {
        this.shown = sc;
        this.shownV = 0;
      }
    }
    this.bumpS.update(dt);
    this.bestS.update(dt);
    for (let i = 1; i <= 11; i++) if (this.flipT[i]! < 9) this.flipT[i] = this.flipT[i]! + dt;
    // 下一个
    if (this.nextLevel !== g.run.next && g.scene === 'playing') this.onNextChanged(g.run.next);
    if (this.nextPop < 1) this.nextPop = Math.min(1, this.nextPop + dt / 0.35);
    if (this.outT < 9) this.outT += dt;
    this.nextOpen = stepBlink(this.nextVis, dt);
    const nv = this.nextVis;
    const k = 1 - Math.exp(-4 * dt);
    nv.lookX += (Math.sin(this.t * 0.9) * 0.9 - nv.lookX) * k;
    nv.lookY += (Math.cos(this.t * 0.7) * 0.5 - nv.lookY) * k;
    // 连击
    const c = g.run.combo;
    if (c >= 2) {
      if (this.comboShown < 2) this.comboPop = 0;
      if (c !== this.lastCombo) this.comboS.kick(5);
      this.comboShown = c;
      this.comboEndT = 9;
      this.comboA = 1;
    } else if (this.comboShown >= 2 && this.comboEndT >= 9) {
      this.comboEndT = 0;
    }
    this.lastCombo = c;
    if (this.comboPop < 1) this.comboPop = Math.min(1, this.comboPop + dt / 0.3);
    if (this.comboEndT < 9) {
      this.comboEndT += dt;
      if (this.comboEndT >= 0.25) {
        this.comboShown = 0;
        this.comboA = 0;
        this.comboEndT = 9;
      }
    }
    this.comboS.update(dt);
    // 倒计时
    const danger = g.dangerLevel === 2 && g.scene === 'playing';
    this.cdA += ((danger ? 1 : 0) - this.cdA) * Math.min(1, dt * 12);
    if (this.cdBump > 1) this.cdBump = Math.max(1, this.cdBump - dt * 2);
  }

  draw(ctx: CanvasRenderingContext2D, g: Game, painter: FruitPainter): void {
    if (this.show < 0.01) return;
    ctx.globalAlpha = this.show;
    this.drawTop(ctx, g);
    this.drawChain(ctx, g);
    this.drawNext(ctx, g, painter);
    this.drawCombo(ctx, g);
    this.drawCountdown(ctx);
    ctx.globalAlpha = 1;
  }

  private slide(i: number): number {
    const k = Math.max(0, Math.min(1, (this.introT * 0.55 - i * 0.06) / 0.4));
    return -60 * (1 - ease.backOut(k));
  }

  private drawTop(ctx: CanvasRenderingContext2D, g: Game): void {
    const run = g.run;
    const beat = run.bestAtStart > 0 && run.score > run.bestAtStart;
    // 最高分胶囊（引导中由 DOM「跳过引导」按钮替代）
    if (!g.tutorial.active) {
      const B = H.best;
      const oy = this.slide(0);
      const bestVal = Math.max(g.best, run.score);
      if (bestVal !== this.bestStrVal) {
        this.bestStrVal = bestVal;
        this.bestStr = formatScore(bestVal);
      }
      const gold = beat || (g.scene === 'results' && run.newRecord);
      const bs = Math.min(1.3, this.bestS.value);
      ctx.save();
      ctx.translate(B.x + B.w / 2, B.y + B.h / 2 + oy);
      ctx.scale(bs, bs);
      ctx.translate(-B.w / 2, -B.h / 2);
      ctx.fillStyle = 'rgba(91,58,94,0.1)';
      ctx.beginPath();
      rrect(ctx, 0, 3, B.w, B.h, 20);
      ctx.fill();
      ctx.fillStyle = gold ? 'rgba(255,240,168,0.95)' : 'rgba(255,248,240,0.85)';
      ctx.beginPath();
      rrect(ctx, 0, 0, B.w, B.h, 20);
      ctx.fill();
      ctx.strokeStyle = gold ? '#FFC93C' : '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      crown(ctx, 20, 20, 9);
      ctx.fillStyle = gold ? '#C97F00' : PLUM;
      ctx.font = font(18, 600);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(this.bestStr, 36, 27, B.w - 42);
      ctx.restore();
    }
    // 分数
    const S = H.score;
    const oy = this.slide(1);
    ctx.fillStyle = '#9C7A9E';
    ctx.font = LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('分数', S.x, S.labelY + oy);
    const v = Math.round(this.shown);
    if (v !== this.scoreStrVal) {
      this.scoreStrVal = v;
      this.scoreStr = formatScore(v);
    }
    const b = Math.min(1.3, this.bumpS.value);
    const cy = S.baseY - S.size * 0.36 + oy;
    ctx.save();
    ctx.translate(S.x, cy);
    ctx.scale(b, b);
    if (beat) {
      if (!this.goldGrad || this.goldCtx !== ctx) {
        this.goldGrad = ctx.createLinearGradient(0, -S.size * 0.5, 0, S.size * 0.5);
        this.goldGrad.addColorStop(0, '#FFF0A8');
        this.goldGrad.addColorStop(0.5, '#FFD84F');
        this.goldGrad.addColorStop(1, '#FFB300');
        this.goldCtx = ctx;
      }
      candyText(ctx, this.scoreStr, 0, 0, S.size, 'gold', this.goldGrad);
    } else {
      candyText(ctx, this.scoreStr, 0, 0, S.size, 'white');
    }
    ctx.restore();
  }

  private goldGrad: CanvasGradient | null = null;
  private goldCtx: CanvasRenderingContext2D | null = null;

  private drawChain(ctx: CanvasRenderingContext2D, g: Game): void {
    const C = H.chain;
    const oy = this.slide(2);
    ctx.fillStyle = 'rgba(91,58,94,0.08)';
    ctx.beginPath();
    rrect(ctx, C.x, C.y + 2 + oy, C.w, C.h, C.h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,240,0.78)';
    ctx.beginPath();
    rrect(ctx, C.x, C.y + oy, C.w, C.h, C.h / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const hi = g.run.highestLevel;
    const disc = g.discovered;
    const tu = g.tutorial;
    for (let i = 0; i < 11; i++) {
      const lv = i + 1;
      const x = C.iconX0 + C.iconStep * i;
      const y = C.iconY + oy;
      const d = C.iconD;
      const ft = this.flipT[lv]!;
      let sx = 1;
      let revealed = lv <= hi;
      if (ft < 0.4) {
        const k = ft / 0.4;
        sx = Math.abs(Math.cos(k * Math.PI));
        if (k < 0.5) revealed = false;
      }
      // 本局最高级：脉动金圈
      if (lv === hi && g.scene !== 'title') {
        const p = 0.5 + 0.5 * Math.sin(this.t * 5);
        ctx.strokeStyle = '#FFC93C';
        ctx.globalAlpha = this.show * (0.55 + 0.45 * p);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, d / 2 + 2.5 + p * 0.8, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = this.show;
      }
      if (tu.chainFlashT > 0 && tu.chainFlashLevel === lv) {
        ctx.globalAlpha = this.show * Math.min(1, tu.chainFlashT * 2) * (0.5 + 0.5 * Math.sin(this.t * 20));
        ctx.fillStyle = '#FFF0A8';
        ctx.beginPath();
        ctx.arc(x, y, d / 2 + 5, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = this.show;
      }
      const e = this.sprites.iconExtent(lv, d);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, 1);
      if (revealed) {
        ctx.drawImage(this.sprites.icon(lv, d, this.iconFn), -e / 2, -e / 2, e, e);
      } else if (lv <= disc) {
        ctx.globalAlpha = this.show * 0.4;
        ctx.drawImage(this.sprites.icon(lv, d, this.iconFn), -e / 2, -e / 2, e, e);
        ctx.globalAlpha = this.show;
      } else {
        ctx.drawImage(this.sprites.silhouette(lv, d), -e / 2, -e / 2, e, e);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = font(12, 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 1);
      }
      ctx.restore();
    }
  }

  private drawNext(ctx: CanvasRenderingContext2D, g: Game, painter: FruitPainter): void {
    const N = CONFIG.layout.next;
    const show = g.scene === 'playing' || g.scene === 'gameover' ? 1 : 0;
    if (!show) return;
    const oy = (1 - ease.backOut(Math.min(1, this.introT * 1.2))) * 120;
    const x = N.x;
    const y = N.y + oy;
    ctx.fillStyle = '#9C7A9E';
    ctx.font = LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('下一个', x, N.labelY + oy);
    // 玻璃泡泡
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(x, y, N.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(168,227,236,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, N.r + 1.8, 0, TAU);
    ctx.stroke();
    // 果
    const lv = this.nextLevel;
    if (lv > 0 && g.scene === 'playing') {
      const r = fruitDef(lv).radius;
      const fit = Math.min(1, 40 / (2 * r));
      const pop = ease.backOut(this.nextPop);
      const bob = Math.sin(this.t * 2.2) * 1.2;
      painter.paint(ctx, lv, x, y + bob, this.nextVis, 'idle', this.nextOpen, fit * pop, 1);
    }
    if (this.outT < 0.25 && this.outLevel > 0 && g.sling.hopT < 0) {
      const k = this.outT / 0.25;
      const r = fruitDef(this.outLevel).radius;
      const fit = Math.min(1, 40 / (2 * r));
      painter.paint(ctx, this.outLevel, x, y - k * 18, this.nextVis, 'born', 1, fit * (1 - k), 1 - k);
    }
    // 左上高光弧
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, N.r - 5, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x + N.r * 0.42, y - N.r * 0.6, 2, 0, TAU);
    ctx.fill();
  }

  private drawCombo(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.comboShown < 2 || g.scene !== 'playing') return;
    const C = CONFIG.layout.combo;
    const n = this.comboShown;
    const tier = Math.min(4, n - 1);
    let s = ease.backOut(this.comboPop) * Math.min(1.35, this.comboS.value);
    let a = this.comboA;
    if (this.comboEndT < 9) {
      const k = this.comboEndT / 0.25;
      s *= 1 - k * 0.6;
      a *= 1 - k;
    }
    ctx.globalAlpha = this.show * a;
    ctx.fillStyle = '#9C7A9E';
    ctx.font = LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('连击', C.x, C.labelY);
    ctx.save();
    ctx.translate(C.x, C.y);
    ctx.scale(s, s);
    const col = COMBO_COL[tier]!;
    if (n >= 5) {
      // 彩虹描边（旋转）
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = RAINBOW[i]!;
        ctx.lineWidth = 5;
        const a0 = this.t * 2 + (i * TAU) / 6;
        ctx.beginPath();
        ctx.arc(0, 0, C.r + 5, a0, a0 + TAU / 6 + 0.02);
        ctx.stroke();
      }
      // 环绕火花
      ctx.fillStyle = '#FFE15A';
      for (let i = 0; i < 3; i++) {
        const aa = this.t * 3.2 + (i * TAU) / 3;
        const px = Math.cos(aa) * (C.r + 10);
        const py = Math.sin(aa) * (C.r + 10);
        ctx.beginPath();
        starPath(ctx, px, py, 4.5, 2, 4, aa);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(91,58,94,0.18)';
    ctx.beginPath();
    ctx.arc(1.5, 3, C.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, C.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-C.r * 0.3, -C.r * 0.45, C.r * 0.45, C.r * 0.22, -0.4, 0, TAU);
    ctx.fill();
    // 进度环：按窗口剩余逆时针减少
    const rem = Math.max(0, Math.min(1, g.run.comboTimer / CONFIG.combo.window));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, C.r - 4, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, C.r - 4, -Math.PI / 2, -Math.PI / 2 - TAU * rem, true);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(C.x, C.y + 1);
    ctx.scale(s, s);
    candyText(ctx, COMBO_TXT[Math.min(n, 99)]!, 0, 0, 24, 'white');
    ctx.restore();
    ctx.globalAlpha = this.show;
  }

  private drawCountdown(ctx: CanvasRenderingContext2D): void {
    if (this.cdA < 0.02) return;
    const C = CONFIG.layout.countdown;
    ctx.globalAlpha = this.show * this.cdA;
    ctx.save();
    ctx.translate(C.x, C.labelY);
    candyText(ctx, '危险！', 0, 0, 16, 'red', '#FF3B5C');
    ctx.restore();
    const b = this.cdBump;
    ctx.save();
    ctx.translate(C.x, C.y);
    ctx.scale(b, b);
    candyText(ctx, CD_TXT[Math.max(1, Math.min(3, this.cdLeft))]!, 0, 0, C.size, 'red', '#FF3B5C');
    ctx.restore();
    ctx.globalAlpha = this.show;
  }
}

const LABEL = '800 12px Fredoka, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const COMBO_TXT: string[] = [];
for (let i = 0; i <= 99; i++) COMBO_TXT.push('×' + i);
const CD_TXT = ['0', '1', '2', '3'];

function crown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.35);
  ctx.lineTo(x - s * 0.5, y + s * 0.05);
  ctx.lineTo(x, y - s * 0.7);
  ctx.lineTo(x + s * 0.5, y + s * 0.05);
  ctx.lineTo(x + s, y - s * 0.35);
  ctx.lineTo(x + s * 0.78, y + s * 0.7);
  ctx.lineTo(x - s * 0.78, y + s * 0.7);
  ctx.closePath();
  ctx.fillStyle = '#FFC93C';
  ctx.fill();
  ctx.strokeStyle = '#F2A100';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#FF6F91';
  ctx.beginPath();
  ctx.arc(x, y + s * 0.25, s * 0.18, 0, TAU);
  ctx.fill();
}
