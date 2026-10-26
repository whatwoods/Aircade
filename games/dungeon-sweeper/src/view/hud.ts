import { CONFIG, maxHpForLevel, xpToNextLevel } from '../config';
import { clamp01, cubicOut, quadOut } from '../core/ease';
import { Channel, Tweens } from '../core/tween';
import { P, type Fx } from './fx';
import { type Sprite, roundRect, sprite } from './gfx';
import { drawText, FONT_CN, type Glyphs } from './glyphs';
import type { Layout, Rect } from './layout';
import { PAL } from './palette';
import type { Silhouettes } from './silhouettes';
import type { Textures } from './textures';

export type MsgTone = 'normal' | 'gold' | 'red' | 'mint';

/**
 * HUD：盾徽、生命分段条、经验宝石槽、分数/计时、消息行、怪物图鉴、操作提示。
 * 维护「显示值」，由 director 在演出时刻推进（生命在出击时掉，经验在光点到达时涨）。
 */
export class Hud {
  level = 1;
  maxHp = 5;
  hp = 5;
  xp = 0;
  xpNeed = 3;
  readonly hpFill = new Channel(5);
  readonly hpLag = new Channel(5);
  readonly scoreShown = new Channel(0);
  readonly slide = new Channel(1);
  readonly bars = new Channel(1);
  score = 0;
  timeSec = 0;
  readonly alive = new Array<number>(10).fill(0);
  readonly aliveFlash = new Float64Array(10).fill(-1e9);
  dragonReady = false;
  showHint = false;
  hintText = '数字 = 周围怪物等级之和 · 点击翻开 · 长按标记';
  lowHp = false;
  private slotPop = new Float64Array(24).fill(-1e9);
  private healT0 = -1e9;
  private refillT0 = -1e9;
  private levelT0 = -1e9;
  private dmgT0 = -1e9;
  private scorePopT0 = -1e9;
  // 消息
  private msgText = '';
  private msgTone: MsgTone = 'normal';
  private msgUntil = 0;
  private msgSpr: Sprite | null = null;
  private msgPrevSpr: Sprite | null = null;
  private msgT0 = -1e9;
  private baseMsg = '';
  private baseTone: MsgTone = 'normal';
  private shield: Sprite | null = null;
  private shieldW = -1;
  private shieldD = -1;
  private tw: Tweens;
  private tex: Textures;
  private gl: Glyphs;
  private sil: Silhouettes;
  private fx: Fx;
  hidden = false;

  constructor(tw: Tweens, tex: Textures, gl: Glyphs, sil: Silhouettes, fx: Fx) {
    this.tw = tw;
    this.tex = tex;
    this.gl = gl;
    this.sil = sil;
    this.fx = fx;
  }

  /** 与逻辑真相对齐（新局 / 空闲时兜底） */
  sync(level: number, hp: number, xp: number, score: number, alive: readonly number[]): void {
    this.level = level;
    this.maxHp = maxHpForLevel(level);
    this.hp = hp;
    this.xp = xp;
    this.xpNeed = xpToNextLevel(level);
    this.tw.set(this.hpFill, hp);
    this.tw.set(this.hpLag, hp);
    this.score = score;
    this.tw.set(this.scoreShown, score);
    for (let l = 1; l <= 9; l++) this.alive[l] = alive[l];
  }

  // ------------------------------------------------------------ 显示值推进
  damage(n: number, L: Layout, now: number): void {
    const before = this.hp;
    this.hp = Math.max(0, this.hp - n);
    this.tw.to(this.hpFill, this.hp, 120, now, quadOut);
    this.tw.to(this.hpLag, this.hp, 300, now, quadOut, 300);
    this.dmgT0 = now;
    // 血条碎屑
    const seg = this.segGeom(L);
    for (let k = this.hp; k < before && k < this.maxHp; k++) {
      const x = seg.x0 + (k + 0.5) * seg.w;
      for (let q = 0; q < 2; q++)
        this.fx.spawn(P.Chip, x + this.fx.rr(-3, 3), seg.y + seg.h / 2, this.fx.rr(-60, 60), this.fx.rr(-140, -40), 700, this.fx.rr(3, 5), 2, 700, 0.5, 1);
    }
  }

  heal(n: number, now: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
    // 逐段点亮（每段 40ms）
    this.tw.to(this.hpFill, this.hp, 40 * n, now, (t) => t);
    this.tw.to(this.hpLag, this.hp, 40 * n, now, (t) => t);
    this.healT0 = now;
  }

  levelUp(to: number, now: number): void {
    this.level = to;
    this.maxHp = maxHpForLevel(to);
    this.xpNeed = xpToNextLevel(to);
    this.hp = this.maxHp;
    this.tw.set(this.hpLag, this.hpFill.v);
    this.tw.to(this.hpFill, this.maxHp, 420, now, cubicOut);
    this.tw.to(this.hpLag, this.maxHp, 420, now, cubicOut);
    this.levelT0 = now;
    this.refillT0 = now;
    for (let i = 0; i < this.xpNeed; i++) this.slotPop[i] = now + i * 30;
  }

  refill(now: number): void {
    this.hp = this.maxHp;
    this.tw.to(this.hpFill, this.maxHp, 420, now, cubicOut);
    this.tw.to(this.hpLag, this.maxHp, 420, now, cubicOut);
    this.refillT0 = now;
  }

  /** 加 1 点经验显示；返回是否跨过升级线 */
  addXp(n: number, now: number): boolean {
    for (let k = 0; k < n; k++) {
      if (this.xp < this.slotPop.length) this.slotPop[this.xp] = now;
      this.xp++;
    }
    return this.xp >= this.xpNeed;
  }

  addScore(n: number, L: Layout, now: number): void {
    this.score += n;
    this.tw.to(this.scoreShown, this.score, 400, now, cubicOut);
    this.scorePopT0 = now;
    const sp = this.scorePos(L);
    this.fx.numText(this.gl.xpGold, n, 43, sp.x + 60, sp.y, 800, 1, undefined, 1);
  }

  killed(level: number, now: number): void {
    this.alive[level] = Math.max(0, this.alive[level] - 1);
    this.aliveFlash[level] = now;
  }

  // ------------------------------------------------------------ 消息行
  setBase(text: string, tone: MsgTone): void {
    this.baseMsg = text;
    this.baseTone = tone;
  }

  message(text: string, tone: MsgTone, real: number, ms: number = CONFIG.timing.toastMs): void {
    this.msgText = text;
    this.msgTone = tone;
    this.msgUntil = real + ms;
  }

  clearMessage(): void {
    this.msgUntil = 0;
  }

  private curText = '';
  private curTone: MsgTone = 'normal';
  private currentMsg(real: number): void {
    if (real < this.msgUntil) {
      this.curText = this.msgText;
      this.curTone = this.msgTone;
    } else if (this.lowHp) {
      this.curText = '生命垂危！喝血瓶、开宝箱，或打低级怪升级回满';
      this.curTone = 'red';
    } else {
      this.curText = this.baseMsg;
      this.curTone = this.baseTone;
    }
  }

  private lb: { lv: Sprite; xp: Sprite; next: Sprite; score: Sprite; d13: Sprite; ready: Sprite; need: Sprite; hint: Sprite } | null = null;
  private lbS = -1;
  private lbD = -1;
  private lbHint = '';
  private bakeLabels(L: Layout): void {
    if (this.lb && L.s === this.lbS && L.dpr === this.lbD && this.hintText === this.lbHint) return;
    this.lbS = L.s;
    this.lbD = L.dpr;
    this.lbHint = this.hintText;
    const s = L.s;
    const G = this.gl;
    this.lb = {
      lv: G.text.get('LV', 10 * s, PAL.ash, 700, "'Cinzel', serif"),
      xp: G.text.get('经验', 10.5 * s, PAL.ash, 600),
      next: G.text.get('下一级', 10.5 * s, 'rgba(156,142,122,0.7)', 500),
      score: G.text.get('分数', 11 * s, PAL.ash, 600),
      d13: G.text.get('13', 11 * s, '#FF8A6A', 700, "'Cinzel', serif"),
      ready: G.text.get('可战', 12 * s, PAL.gold, 700, FONT_CN, { glow: 'rgba(255,181,74,0.8)', glowBlur: 6 }),
      need: G.text.get('需14', 11.5 * s, PAL.ash, 600),
      hint: G.text.get(this.hintText, 12 * s, 'rgba(156,142,122,0.8)', 500),
    };
  }

  /** 字形重烘焙后调用 */
  invalidate(): void {
    this.lbS = -1;
    this.msgTextShown = '\u0000';
  }

  // ------------------------------------------------------------ 位置（屏幕 / 栏坐标）
  hpTarget(L: Layout): { x: number; y: number } {
    const g = this.segGeom(L);
    return { x: g.x0 + Math.max(0, this.hp - 0.5) * g.w, y: g.y + g.h / 2 };
  }
  xpTarget(L: Layout, slot: number): { x: number; y: number } {
    const n = Math.max(1, this.xpNeed);
    const w = (L.xp.w - 2) / n;
    return { x: L.xp.x + 1 + (Math.min(slot, n - 1) + 0.5) * w, y: L.xp.y + L.xp.h / 2 + this.slideY(L) };
  }
  scorePos(L: Layout): { x: number; y: number } {
    return { x: L.scoreLine.x + 34 * L.s, y: L.scoreLine.y + L.scoreLine.h / 2 };
  }
  badgeCenter(L: Layout): { x: number; y: number } {
    return { x: L.badge.x + L.badge.w / 2, y: L.badge.y + L.badge.h / 2 + this.slideY(L) };
  }
  private slideY(L: Layout): number {
    return -(1 - this.slide.v) * (L.hudTop + 80);
  }
  private segGeom(L: Layout): { x0: number; y: number; w: number; h: number; n: number } {
    const r = L.hp;
    const x0 = r.x + 16 * L.s;
    const x1 = r.x + r.w - 3;
    const n = Math.max(1, this.maxHp);
    SEG.x0 = x0;
    SEG.y = r.y + 3 + this.slideY(L);
    SEG.w = (x1 - x0) / n;
    SEG.h = r.h - 6;
    SEG.n = n;
    return SEG;
  }

  // ------------------------------------------------------------ draw
  private bakeShield(L: Layout): void {
    if (this.shield && L.badge.w === this.shieldW && L.dpr === this.shieldD) return;
    this.shieldW = L.badge.w;
    this.shieldD = L.dpr;
    const d = L.dpr;
    const w = L.badge.w;
    const h = L.badge.h;
    this.shield = sprite(w * d, h * d, (c) => {
      c.scale(d, d);
      const p = new Path2D();
      p.moveTo(3, 3);
      p.lineTo(w - 3, 3);
      p.lineTo(w - 3, h * 0.5);
      p.quadraticCurveTo(w - 4, h * 0.82, w / 2, h - 2);
      p.quadraticCurveTo(4, h * 0.82, 3, h * 0.5);
      p.closePath();
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.translate(0, 2);
      c.fill(p);
      c.translate(0, -2);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2C3242');
      g.addColorStop(1, '#12141B');
      c.fillStyle = g;
      c.fill(p);
      c.strokeStyle = '#E8B04B';
      c.lineWidth = 2;
      c.stroke(p);
      c.strokeStyle = 'rgba(255,233,190,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(6, 6);
      c.lineTo(w - 6, 6);
      c.stroke();
      c.strokeStyle = 'rgba(232,176,75,0.35)';
      c.setLineDash([2, 3]);
      const inner = new Path2D();
      inner.moveTo(7, 7);
      inner.lineTo(w - 7, 7);
      inner.lineTo(w - 7, h * 0.5);
      inner.quadraticCurveTo(w - 8, h * 0.78, w / 2, h - 7);
      inner.quadraticCurveTo(8, h * 0.78, 7, h * 0.5);
      inner.closePath();
      c.stroke(inner);
    });
  }

  draw(ctx: CanvasRenderingContext2D, L: Layout, real: number, world: number): number {
    if (this.hidden) return 0;
    const d = L.dpr;
    const s = L.s;
    const G = this.gl;
    const T = this.tex;
    let calls = 0;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const oy = this.slideY(L);
    const bars = this.bars.v;
    // ---- 盾徽
    this.bakeShield(L);
    const B = L.badge;
    const lt = (world - this.levelT0) / 700;
    let bsc = 1;
    if (lt >= 0 && lt < 1) bsc = 1 + 0.18 * Math.sin(lt * Math.PI) * (1 - lt);
    const bcx = B.x + B.w / 2;
    const bcy = B.y + B.h / 2 + oy;
    ctx.drawImage(this.shield!.c, bcx - (B.w * bsc) / 2, bcy - (B.h * bsc) / 2, B.w * bsc, B.h * bsc);
    this.bakeLabels(L);
    const lb = this.lb!;
    drawText(ctx, lb.lv, bcx, B.y + 14 * s + oy, 0.5, d);
    G.level.drawInt(ctx, this.level, bcx, B.y + 34 * s + oy, 0.5, false, bsc);
    calls += 3;
    // 流光（每 6 秒）
    const sh = (real % 6000) / 700;
    if (sh < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * Math.sin(sh * Math.PI);
      ctx.drawImage(T.spark.c, B.x + B.w * (sh - 0.1) - 8, B.y + oy + 4, 16, B.h - 12);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      calls++;
    }
    // ---- 生命条
    const H = L.hp;
    const hy = H.y + oy;
    roundRect(ctx, H.x, hy, H.w, H.h, H.h / 2);
    ctx.fillStyle = '#0B0C10';
    ctx.fill();
    ctx.strokeStyle = '#2A3242';
    ctx.lineWidth = 1;
    ctx.stroke();
    const sg = this.segGeom(L);
    const fill = this.hpFill.v * bars;
    const lag = Math.max(this.hpLag.v * bars, fill);
    for (let k = 0; k < sg.n; k++) {
      const x = sg.x0 + k * sg.w + 0.75;
      const w = sg.w - 1.5;
      const f = clamp01(fill - k);
      const lg = clamp01(lag - k);
      ctx.fillStyle = '#1A0E10';
      ctx.fillRect(x, sg.y, w, sg.h);
      if (lg > f) {
        ctx.fillStyle = '#F4E6E0';
        ctx.fillRect(x + w * f, sg.y, w * (lg - f), sg.h);
      }
      if (f > 0) {
        ctx.fillStyle = this.lowHp ? '#E0283C' : '#C8283C';
        ctx.fillRect(x, sg.y, w * f, sg.h);
        ctx.fillStyle = 'rgba(255,150,160,0.45)';
        ctx.fillRect(x, sg.y + 1, w * f, Math.max(1, sg.h * 0.22));
        ctx.fillStyle = 'rgba(60,4,12,0.45)';
        ctx.fillRect(x, sg.y + sg.h * 0.7, w * f, sg.h * 0.3);
      }
    }
    calls += sg.n;
    // 回复 / 灌满流光
    const ft = Math.max((world - this.refillT0) / 600, -1);
    if (ft >= 0 && ft < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8 * (1 - ft);
      const x = sg.x0 + sg.n * sg.w * ft;
      ctx.drawImage(T.spark.c, x - 14, sg.y - 6, 28, sg.h + 12);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      calls++;
    }
    const ht = (world - this.healT0) / 500;
    if (ht >= 0 && ht < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * (1 - ht);
      ctx.drawImage(T.pinkOrb.c, H.x, hy - 6, H.w, H.h + 12);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // 屠龙线
    if (this.maxHp >= CONFIG.dragon.minHpToChallenge) {
      const x = sg.x0 + CONFIG.dragon.minHpToChallenge * sg.w;
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(x - 1, hy - 3, 2, H.h + 6);
      ctx.beginPath();
      ctx.moveTo(x, hy - 2);
      ctx.lineTo(x - 4, hy - 8);
      ctx.lineTo(x - 1.5, hy - 6.5);
      ctx.lineTo(x, hy - 10);
      ctx.lineTo(x + 1.5, hy - 6.5);
      ctx.lineTo(x + 4, hy - 8);
      ctx.closePath();
      ctx.fill();
      calls += 2;
    }
    // 心形
    const beat = this.lowHp ? 1100 : 1600;
    const bp = (real % beat) / beat;
    const hb = bp < 0.12 ? 1 + 0.18 * Math.sin((bp / 0.12) * Math.PI) : bp > 0.2 && bp < 0.3 ? 1 + 0.1 * Math.sin(((bp - 0.2) / 0.1) * Math.PI) : 1;
    const dmgK = (world - this.dmgT0) / 260;
    const hsz = 24 * s * hb * (dmgK >= 0 && dmgK < 1 ? 1 + 0.25 * (1 - dmgK) : 1);
    ctx.drawImage(T.heart.c, H.x - 6 * s - hsz / 2 + 12 * s, hy + H.h / 2 - hsz / 2, hsz, hsz);
    // 数值
    G.hp.drawFraction(ctx, Math.round(this.hp * bars), this.maxHp, H.x + H.w - 8 * s, hy + H.h / 2 + 0.5, 1, 1, 3 * s);
    calls += 2;
    // ---- 经验条
    const X = L.xp;
    const xy = X.y + oy;
    const n = Math.max(1, this.xpNeed);
    const gw = (X.w - 2) / n;
    for (let k = 0; k < n; k++) {
      const x = X.x + 1 + k * gw;
      const lit = k < this.xp * bars;
      const pt = (world - this.slotPop[k]) / 220;
      let sc = 1;
      if (pt >= 0 && pt < 1) sc = 1 + 0.35 * Math.sin(pt * Math.PI);
      const w = (gw - 2) * sc;
      const h = X.h * sc;
      const gx = x + gw / 2 - w / 2;
      const gy = xy + X.h / 2 - h / 2;
      roundRect(ctx, gx, gy, w, h, Math.min(3, h / 3));
      if (lit) {
        ctx.fillStyle = '#E8B04B';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.65)';
        ctx.fillRect(gx + 1, gy + 1, Math.max(1, w - 2), Math.max(1, h * 0.3));
      } else {
        ctx.fillStyle = '#14161E';
        ctx.fill();
        ctx.strokeStyle = '#2A3242';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      calls++;
    }
    if (this.xp > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(real * 0.004);
      ctx.drawImage(T.orb.c, X.x - 4, xy - 6, Math.min(this.xp, n) * gw + 8, X.h + 12);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // 经验文字（右对齐）
    const fr = G.small.measureInt(this.xp) + G.small.measureInt(this.xpNeed) + G.small.charW(47) + 4;
    G.small.drawFraction(ctx, Math.min(this.xp, 999), this.xpNeed, X.x + X.w, xy + X.h + 8 * s, 1, 1, 2);
    drawText(ctx, lb.xp, X.x + X.w - fr - 4, xy + X.h + 8 * s, 1, d);
    // 等级标签（左）
    drawText(ctx, lb.next, X.x, xy + X.h + 8 * s, 0, d);
    calls += 3;
    // ---- 分数 / 计时
    const S = L.scoreLine;
    const sy = S.y + S.h / 2;
    drawText(ctx, lb.score, S.x, sy, 0, d);
    const spt = (world - this.scorePopT0) / 300;
    const ssc = spt >= 0 && spt < 1 ? 1 + 0.12 * Math.sin(spt * Math.PI) : 1;
    G.score.drawInt(ctx, Math.round(this.scoreShown.v), S.x + 30 * s, sy, 0, true, ssc);
    const tw = G.time.drawTime(ctx, this.timeSec, S.x + S.w, sy, 1);
    ctx.drawImage(T.hourglass.c, S.x + S.w - tw - 18 * s, sy - 8 * s, 14 * s, 16 * s);
    calls += 4;
    // ---- 消息行
    this.currentMsg(real);
    const mt = this.curText;
    const tone = this.curTone;
    if (mt !== this.msgTextShown) {
      this.msgPrevSpr = this.msgSpr;
      this.msgTextShown = mt;
      this.msgSpr = mt ? G.text.get(mt, 13 * s, toneColor(tone), 600, FONT_CN, tone === 'gold' ? { glow: 'rgba(255,181,74,0.5)', glowBlur: 6 } : {}) : null;
      this.msgT0 = real;
    }
    const M = L.message;
    const mk = clamp01((real - this.msgT0) / 220);
    if (this.msgPrevSpr && mk < 1) {
      ctx.globalAlpha = 1 - mk;
      drawText(ctx, this.msgPrevSpr, M.x + M.w / 2, M.y + M.h / 2 - 6 * mk, 0.5, d);
    }
    if (this.msgSpr) {
      ctx.globalAlpha = mk * (tone === 'red' ? 0.75 + 0.25 * Math.sin(real * 0.008) : 1);
      const mw = this.msgSpr.w / d;
      const scl = mw > M.w ? M.w / mw : 1;
      drawText(ctx, this.msgSpr, M.x + M.w / 2, M.y + M.h / 2 + 6 * (1 - mk), 0.5, d, scl);
    }
    ctx.globalAlpha = 1;
    calls += 2;
    // ---- 图鉴
    calls += this.drawRoster(ctx, L, real, world);
    // ---- 操作提示
    if (this.showHint && L.showHint) {
      drawText(ctx, lb.hint, L.hint.x + L.hint.w / 2, L.hint.y + L.hint.h / 2, 0.5, d);
      calls++;
    }
    return calls;
  }

  private msgTextShown = '\u0000';

  private drawRoster(ctx: CanvasRenderingContext2D, L: Layout, real: number, world: number): number {
    const R = L.roster;
    const s = L.s;
    const d = L.dpr;
    const G = this.gl;
    const sw = R.w / 10;
    let calls = 0;
    for (let k = 0; k < 10; k++) {
      const x = R.x + k * sw;
      const cxm = x + sw / 2;
      const isDragon = k === 9;
      const lvl = isDragon ? 13 : k + 1;
      // 等级数字
      const lb = this.lb!;
      if (isDragon) {
        drawText(ctx, lb.d13, cxm, R.y + 11 * s, 0.5, d);
      } else G.small.drawInt(ctx, lvl, cxm, R.y + 11 * s, 0.5);
      const cnt = isDragon ? 1 : this.alive[lvl];
      const bob = Math.sin(real * 0.0021 + k * 0.9) * 1.2;
      const sil = isDragon ? this.sil.rise : this.sil.mon[lvl];
      const sz = (isDragon ? 30 : 26) * s * (sil.size / sil.unit);
      const ft = (world - (isDragon ? -1e9 : this.aliveFlash[lvl])) / 500;
      const flash = ft >= 0 && ft < 1 ? 1 - ft : 0;
      ctx.globalAlpha = cnt === 0 ? 0.25 : 1;
      const psc = 1 + 0.25 * flash;
      ctx.drawImage(sil.normal.c, cxm - (sz * psc) / 2, R.y + 37 * s + bob - (sz * psc) / 2, sz * psc, sz * psc);
      ctx.globalAlpha = 1;
      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flash * 0.6;
        ctx.drawImage(this.tex.spark.c, cxm - 14 * s, R.y + 23 * s, 28 * s, 28 * s);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      calls += 2;
      if (cnt === 0 && !isDragon) {
        // 粉笔斜杠
        ctx.strokeStyle = 'rgba(220,227,234,0.75)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cxm - 10 * s, R.y + 47 * s);
        ctx.lineTo(cxm + 10 * s, R.y + 27 * s);
        ctx.stroke();
        calls++;
      }
      // 数量
      if (isDragon) {
        const ready = this.dragonReady;
        const t = ready ? lb.ready : lb.need;
        ctx.globalAlpha = ready ? 0.7 + 0.3 * Math.sin(real * 0.005) : 1;
        drawText(ctx, t, cxm, R.y + 63 * s, 0.5, d);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = cnt === 0 ? 0.4 : 1;
        G.roster.drawInt(ctx, cnt, cxm, R.y + 63 * s, 0.5, false, 1, 215);
        ctx.globalAlpha = 1;
      }
      calls++;
    }
    return calls;
  }

  /** 一些子区域（引导高亮用） */
  rects(L: Layout): { badge: Rect; hp: Rect; xp: Rect } {
    return { badge: L.badge, hp: L.hp, xp: L.xp };
  }
}

const SEG = { x0: 0, y: 0, w: 1, h: 1, n: 1 };

function toneColor(t: MsgTone): string {
  switch (t) {
    case 'gold':
      return PAL.gold;
    case 'red':
      return '#FF6A6A';
    case 'mint':
      return PAL.mint;
    default:
      return PAL.parchment;
  }
}
