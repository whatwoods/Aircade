// 标题页：Logo 横幅（入场落下 + 缓慢摆动 + 墨线沸腾）、合着的行囊（手绘图；落桌 + 呼吸 + 小蹦 + 扣具闪星）、开始按钮、最高分签、设置 / 规则
import { ROUNDS } from '../config.ts';
import { setMusic } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { clock } from '../core/loop.ts';
import { loadBest, loadDaily, today, unlockedTier, type BestRecord } from '../game/score.ts';
import { clearRun, loadRun } from '../game/save.ts';
import { resetTutorialFlag, tutorialDone } from '../game/tutorial.ts';
import type { RunState } from '../game/types.ts';
import { endingData } from './gameScene.ts';
import type { InputHandler } from '../core/input.ts';
import { glowOf } from '../render/fx/particles.ts';
import { titleBagArt } from '../render/titleArt.ts';
import { ellipsePts, inkStroke, rectPts, type Pts } from '../render/ink.ts';
import { C, cached, drawPaper, pat, rivet } from '../render/kit.ts';
import { LW, stage } from '../render/stage.ts';
import { BRUSH, LOGO, drawSprite, num, text, type Sprite } from '../render/text.ts';
import { Button, type UiEl } from '../render/ui/widgets.ts';
import { RulesPanel, Overlays, SettingsPanel, StartPanel } from './overlays.ts';
import { factories, gotoScene, type Scene } from './sceneManager.ts';

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  r: number;
}

export class TitleScene implements Scene {
  readonly name = 'title' as const;
  handler: InputHandler;
  private ov = new Overlays();
  private start: Button;
  /** 有存档时：继续（主按钮），开始冒险降为次按钮并需二次确认 */
  private cont: Button;
  private saved: RunState | null = null;
  private gear: Button;
  private help: Button;
  private pressed: Button | null = null;
  private best: BestRecord | null = null;
  private motes: Mote[] = [];
  private time = 0;
  private oy = 0;

  constructor() {
    this.start = new Button('btn.start', { x: 95, y: 610, w: 200, h: 70 }, '开始冒险', 'sealTag', 21);
    this.start.fontSize = 22;
    this.cont = new Button('btn.continue', { x: 95, y: 596, w: 200, h: 70 }, '继续冒险', 'sealTag', 24);
    this.cont.fontSize = 18;
    this.gear = new Button('btn.settings', { x: 24, y: 760, w: 44, h: 44 }, '', 'coin', 22);
    this.gear.icon = 'gear';
    this.help = new Button('btn.rules', { x: 322, y: 760, w: 44, h: 44 }, '', 'coin', 23);
    this.help.icon = 'help';
    for (let i = 0; i < 16; i++) {
      this.motes.push({
        x: 60 + ((i * 97) % 270), y: 160 + ((i * 131) % 380), vx: ((i % 5) - 2) * 3, vy: -4 - (i % 4) * 2, ph: i * 1.7, r: 2 + (i % 3),
      });
    }
    this.handler = this.makeHandler();
  }

  enter(): void {
    this.best = loadBest();
    this.saved = loadRun();
    if (this.saved) {
      const r = this.saved;
      this.cont.label = r.phase === 'ending' ? '查看结算' : `继续 · 第${r.round}轮`;
      this.start = new Button('btn.start', { x: 125, y: 678, w: 140, h: 44 }, '新的冒险', 'paper', 21);
      this.start.fontSize = 17;
    }
    setMusic('arrange');
    this.layout();
  }

  exit(): void {}

  autoPause(): void {}

  private layout(): void {
    const H = stage.H;
    this.oy = (H - 844) / 2;
    const oy = this.oy;
    if (this.saved) {
      this.cont.r = { x: 95, y: 596 + oy, w: 200, h: 70 };
      this.start.r = { x: 125, y: 678 + oy, w: 140, h: 44 };
    } else this.start.r = { x: 95, y: 610 + oy, w: 200, h: 70 };
    this.gear.r = { x: 24, y: H - 84, w: 44, h: 44 };
    this.help.r = { x: 322, y: H - 84, w: 44, h: 44 };
  }

  private go(): void {
    sfx('click');
    const saved = this.saved;
    if (saved) {
      if (saved.phase === 'ending') gotoScene(() => factories.ending(endingData(saved)));
      else gotoScene(() => factories.game({ resume: saved }), 0.5, (596 + this.oy + 35) / stage.H);
      return;
    }
    this.pickMode((610 + this.oy + 35) / stage.H);
  }

  /** 打过引导后：先选难度 / 每日挑战 */
  private pickMode(fy: number): void {
    if (!tutorialDone()) {
      gotoScene(() => factories.game({ tutorial: true }), 0.5, fy);
      return;
    }
    const date = today();
    this.ov.open(
      new StartPanel(stage.H, unlockedTier(), loadDaily(date)?.score ?? null, (tier, daily) => {
        clearRun();
        this.saved = null;
        const mode = { tier, daily: daily ? date : undefined };
        gotoScene(() => factories.game({ tutorial: false, mode }), 0.5, fy);
      }),
    );
  }

  /** 有存档时开新局：二次确认后丢弃存档 */
  private goNew(): void {
    const real = clock.real;
    if (this.start.confirmUntil <= real) {
      this.start.confirmUntil = real + 3;
      return;
    }
    this.start.confirmUntil = 0;
    sfx('click');
    this.pickMode((678 + this.oy + 22) / stage.H);
  }

  private buttons(): Button[] {
    return this.saved ? [this.cont, this.start, this.gear, this.help] : [this.start, this.gear, this.help];
  }

  private activate(b: Button): void {
    if (b === this.cont) this.go();
    else if (b === this.start) {
      if (this.saved) this.goNew();
      else this.go();
    }
    else if (b === this.gear) {
      this.ov.open(
        new SettingsPanel(stage.H, () => {
          this.ov.closeAll();
          resetTutorialFlag();
          gotoScene(() => factories.game({ tutorial: true }));
        }),
      );
    } else if (b === this.help) this.ov.open(new RulesPanel(stage.H));
  }

  private makeHandler(): InputHandler {
    return {
      down: (x, y) => {
        if (this.ov.active) {
          this.ov.top!.down(x, y);
          return;
        }
        for (const b of this.buttons()) {
          if (b.hit(x, y)) {
            b.down();
            this.pressed = b;
            sfx('click');
            return;
          }
        }
      },
      dragStart: () => {},
      drag: () => {},
      up: (x, y, tap) => {
        if (this.ov.active) {
          this.ov.top!.up(x, y, tap, clock.real);
          return;
        }
        const b = this.pressed;
        this.pressed = null;
        if (b) {
          b.release();
          if (b.hit(x, y, 10)) this.activate(b);
        }
      },
      long: () => {},
      cancel: () => {
        if (this.pressed) this.pressed.release();
        this.pressed = null;
        if (this.ov.active) this.ov.top!.cancel();
      },
      rotate: () => {},
      hover: (x, y) => {
        for (const b of this.buttons()) b.hover = b.hit(x, y);
      },
      key: (code) => {
        if (this.ov.active) {
          this.ov.top!.key(code);
          return;
        }
        if (code === 'Space' || code === 'Enter') this.go();
      },
      wheel: () => {},
    };
  }

  update(dt: number, raw: number): void {
    if (this.oy !== (stage.H - 844) / 2) this.layout();
    this.time += dt;
    this.ov.update(raw);
    (this.saved ? this.cont : this.start).pulse = 0.035;
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.time * 0.7 + m.ph) * 4) * dt;
      m.y += m.vy * dt;
      if (m.y < 140 + this.oy) {
        m.y = 560 + this.oy;
        m.x = 60 + Math.random() * 270;
      }
      if (m.x < 30) m.x = 360;
      if (m.x > 360) m.x = 30;
    }
  }

  step(_h: number): void {}

  draw(ctx: CanvasRenderingContext2D): void {
    const t = this.time;
    const real = clock.real;
    const oy = this.oy;
    // 灰尘（加色）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = glowOf('#ffd88a');
    for (const m of this.motes) {
      const a = 0.25 + 0.2 * Math.sin(t * 1.3 + m.ph);
      ctx.globalAlpha = a;
      const s = m.r * 3;
      ctx.drawImage(glow, m.x - s, m.y + oy * 0 - s, s * 2, s * 2);
    }
    ctx.restore();
    // 行囊先画：入场时从横幅后面落下来
    this.drawBag(ctx, t, oy);
    // 横幅：入场从上方落下（回弹 + 阻尼摆动），之后缓慢摆动 ±0.6°
    const drop = ease.outBack(clamp01(t / 0.55));
    const swing = t > 0.45 ? 0.045 * Math.exp(-2.6 * (t - 0.45)) * Math.sin((t - 0.45) * 7.5) : 0;
    ctx.save();
    ctx.translate(195, 120 + oy - (1 - drop) * 300);
    ctx.rotate(Math.sin((t / 4) * Math.PI * 2) * 0.0105 + swing);
    ctx.translate(-195, -(120 + oy));
    drawSprite(ctx, bannerSprite(), 30, 120 + oy);
    const frame = Math.floor(t * 10) % 3;
    drawSprite(ctx, logoSprite(frame), 30, 120 + oy);
    ctx.restore();
    // 按钮：行囊落地后弹出（入场期间照样能点）
    const pop = ease.outBack(clamp01((t - 0.55) / 0.32));
    ctx.save();
    const main = this.saved ? this.cont : this.start;
    const pcx = main.r.x + main.r.w / 2;
    const pcy = main.r.y + main.r.h / 2;
    ctx.globalAlpha = clamp01((t - 0.55) / 0.12);
    ctx.translate(pcx, pcy);
    ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    ctx.translate(-pcx, -pcy);
    if (this.saved) this.cont.draw(ctx, t, real);
    this.start.draw(ctx, t, real);
    ctx.restore();
    if (this.best && this.best.score > 0) {
      const b = this.best;
      const s = `最高分 ${num(b.score)} · ${b.round > ROUNDS ? '无尽第 ' + b.round + ' 轮' : b.cleared ? '已通关' : '最远第 ' + b.round + ' 轮'}`;
      const by = this.saved ? 734 : 694;
      drawSprite(ctx, bestTag(), 105, by + oy);
      text(ctx, s, 195, by + 13 + oy, { size: 13, weight: 700, color: C.ink });
    }
    this.gear.draw(ctx, t, real);
    this.help.draw(ctx, t, real);
    this.ov.draw(ctx, LW, stage.H, t, real);
  }

  /**
   * 合着的行囊（底边中心 (195, BAG_BASE)）：
   * 入场从上方落到桌上（压扁回弹 + 扬尘）；待机呼吸，每 6 秒原地一蹦；黄铜扣每 4 秒闪一颗星。
   */
  private drawBag(ctx: CanvasRenderingContext2D, t: number, oy: number): void {
    const base = BAG_BASE + oy;
    // 入场下落（加速）
    const f = clamp01((t - 0.18) / 0.4);
    const fallY = -110 * (1 - f * f);
    const landed = t - 0.58;
    // 待机小蹦：0–0.08 蓄力压扁，0.08–0.46 腾空，之后落地回弹
    const hp = t > 2.4 ? (t - 2.4) % 6 : -1;
    let hop = 0;
    let sq = 0;
    if (landed > 0 && landed < 1.2) sq = Math.exp(-landed * 6) * Math.cos(landed * 20) * 0.11;
    if (hp >= 0 && hp < 0.08) sq = Math.sin((hp / 0.08) * Math.PI * 0.5) * 0.05;
    else if (hp >= 0.08 && hp < 0.46) {
      const q = (hp - 0.08) / 0.38;
      hop = Math.sin(q * Math.PI) * 10;
      sq = -0.035 * Math.sin(q * Math.PI);
    } else if (hp >= 0.46 && hp < 1.3) sq = Math.exp(-(hp - 0.46) * 7) * Math.cos((hp - 0.46) * 22) * 0.05;
    const breath = 0.006 * Math.sin((t / 2.8) * Math.PI * 2);
    const sy = 1 - sq + breath;
    const sx = 1 + sq * 0.7;

    // 台灯暖光（在包后面，轻微起伏）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + 0.04 * Math.sin(t * 0.8);
    ctx.drawImage(glowOf('#ffb35a'), 195 - 210, base - 130 - 210, 420, 420);
    ctx.restore();

    // 接触阴影：离桌越高越小越淡
    const lift = hop - fallY;
    const sk = Math.max(0.35, 1 - lift / 120);
    ctx.save();
    ctx.globalAlpha = clamp01(f * 1.5) * (0.7 * sk);
    ctx.translate(195, base + 2);
    ctx.scale(sk * sx, sk);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 132);
    g.addColorStop(0, 'rgba(20,9,3,0.9)');
    g.addColorStop(0.6, 'rgba(20,9,3,0.45)');
    g.addColorStop(1, 'rgba(20,9,3,0)');
    ctx.fillStyle = g;
    ctx.scale(1, 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, 132, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 包身
    const art = titleBagArt();
    let bx: number;
    let by: number;
    ctx.save();
    ctx.globalAlpha = clamp01(f * 20);
    ctx.translate(195, base + fallY - hop);
    ctx.scale(sx, sy);
    if (art) {
      const w = BAG_ART.w;
      const h = (w * (art.naturalHeight || art.height)) / (art.naturalWidth || art.width);
      ctx.drawImage(art, -w / 2, -h + BAG_ART.sink, w, h);
      bx = BAG_ART.buckle[0] * w;
      by = -h + BAG_ART.sink + BAG_ART.buckle[1] * h;
    } else {
      drawSprite(ctx, closedBag(), -130, -230);
      bx = 0;
      by = -87;
    }
    // 黄铜扣闪星：每 4 秒一次（入场后开始）
    const gk = t > 1 ? ((t - 1) % 4) / 4 : 1;
    if (gk < 0.14) {
      const a = Math.sin((gk / 0.14) * Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(glowOf('#fff3c4'), bx - 18, by - 18, 36, 36);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fffbe8';
      star4(ctx, bx + 4, by - 6, 4 + a * 9, gk * 2);
    }
    ctx.restore();

    // 落地扬尘：左右各三团
    const dust = (age: number, spread: number, amt: number): void => {
      if (age < 0 || age > 0.6) return;
      const q = age / 0.6;
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const dir = i < 3 ? -1 : 1;
        const j = i % 3;
        const x = 195 + dir * (spread * (0.75 + j * 0.18) + q * (26 + j * 14));
        const y = base - 4 - q * (8 + j * 5);
        const r = (9 + j * 4) * (0.6 + q * 0.9) * amt;
        ctx.globalAlpha = (1 - q) * (1 - q) * 0.55 * amt;
        ctx.drawImage(glowOf('#e9d8b0'), x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    };
    dust(landed, 110, 1);
    if (hp >= 0.46) dust(hp - 0.46, 104, 0.55);
  }

  ui(): UiEl[] {
    if (this.ov.active) return this.ov.els();
    return this.buttons().map((b) => b.el());
  }

  cursor(x: number, y: number): string {
    if (this.ov.active) return 'default';
    for (const b of this.buttons()) if (b.hit(x, y)) return 'pointer';
    return 'default';
  }
}

// ---------- 布局与小工具 ----------

/** 行囊底边 y（逻辑坐标，竖屏 844 基准） */
const BAG_BASE = 582;
/** 手绘图：绘制宽度、底边下沉（图底透明留白）、扣具中心（占图宽高的比例，x 相对中心） */
const BAG_ART = { w: 276, sink: 3, buckle: [-0.004, 0.575] as [number, number] };

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = {
  outBack: (x: number): number => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2),
};

/** 四角星闪光（收腰曲线） */
function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const b = a + Math.PI / 4;
    const c = a + Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.quadraticCurveTo(Math.cos(b) * r * 0.16, Math.sin(b) * r * 0.16, Math.cos(c) * r, Math.sin(c) * r);
  }
  ctx.fill();
  ctx.restore();
}

// ---------- 静态精灵 ----------

function bannerSprite(): Sprite {
  return cached('title.banner', 330, 180, 16, (ctx, r) => {
    // 羊皮纸横幅（两端卷边）
    drawPaper(ctx, r, 0, 0, 330, 180, { seed: 41, burn: 0.9, r: 6 });
    // 卷边阴影
    for (const x of [0, 318]) {
      const g = ctx.createLinearGradient(x, 0, x + 12, 0);
      g.addColorStop(x === 0 ? 0 : 1, 'rgba(90,60,30,0.35)');
      g.addColorStop(x === 0 ? 1 : 0, 'rgba(90,60,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 4, 12, 172);
    }
    // 两颗黄铜图钉
    rivet(ctx, 22, 20, 7);
    rivet(ctx, 308, 20, 7);
    // 分隔饰线：两道收尖的墨线 + 蜡红菱形 + 两粒小点
    ctx.fillStyle = 'rgba(93,72,55,0.7)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(165 + dir * 14, 100.4);
      ctx.lineTo(165 + dir * 92, 101.5);
      ctx.lineTo(165 + dir * 14, 102.6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(165 + dir * 100, 101.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.wax;
    ctx.beginPath();
    ctx.moveTo(165, 95);
    ctx.lineTo(171, 101.5);
    ctx.lineTo(165, 108);
    ctx.lineTo(159, 101.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,170,0.5)';
    ctx.beginPath();
    ctx.moveTo(165, 97.5);
    ctx.lineTo(168, 101.5);
    ctx.lineTo(165, 101.5);
    ctx.closePath();
    ctx.fill();
  });
}

/** Logo 字（3 帧沸腾：英文描边每帧抖动不同） */
function logoSprite(frame: number): Sprite {
  return cached('title.logo' + frame, 330, 180, 16, (ctx) => {
    const jx = [0, 0.6, -0.5][frame];
    const jy = [0, -0.4, 0.5][frame];
    // PACK BATTLE：按横幅宽度收字号，最宽 288
    ctx.save();
    ctx.font = `700 54px ${LOGO}`;
    const wEn = ctx.measureText('PACK BATTLE').width;
    const k = Math.min(1, 288 / wEn);
    ctx.translate(165 + jx, 64 + jy);
    ctx.scale(k, k);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // 套色错位的墨影
    ctx.fillStyle = 'rgba(43,29,20,0.28)';
    ctx.fillText('PACK BATTLE', 3, 3.5);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 7.5 + frame * 0.4;
    ctx.strokeText('PACK BATTLE', 0, 0);
    const g = ctx.createLinearGradient(0, -26, 0, 22);
    g.addColorStop(0, C.waxLight);
    g.addColorStop(0.55, C.wax);
    g.addColorStop(1, '#7a1d17');
    ctx.fillStyle = g;
    ctx.fillText('PACK BATTLE', 0, 0);
    // 顶缘高光
    ctx.save();
    ctx.beginPath();
    ctx.rect(-200, -40, 400, 26);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,214,170,0.35)';
    ctx.fillText('PACK BATTLE', -0.8, -1.4);
    ctx.restore();
    ctx.restore();
    // 行囊对决：毛笔字，墨色，轻微晕染
    ctx.save();
    ctx.translate(165, 141);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 58px ${BRUSH}`;
    const s = '行囊对决';
    const gap = 2;
    const widths = [...s].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (s.length - 1);
    let x = -total / 2;
    for (let i = 0; i < s.length; i++) {
      const cx = x + widths[i] / 2;
      const cy = [0, -1.5, 1, -0.5][i];
      ctx.fillStyle = 'rgba(43,29,20,0.18)';
      ctx.fillText(s[i], cx + 1.2, cy + 1.6);
      ctx.fillStyle = C.ink;
      ctx.fillText(s[i], cx, cy);
      x += widths[i] + gap;
    }
    ctx.restore();
  });
}

/** 合着的行囊：皮革包身 + 翻盖 + 黄铜扣 + 露出的剑柄和弓梢（中心在 (130, 205-?)） */
function closedBag(): Sprite {
  return cached('title.bag', 260, 230, 16, (ctx, r) => {
    const T = (p: Pts): Pts => p;
    // 弓梢（在包后面）
    ctx.save();
    ctx.strokeStyle = '#7a4a24';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(196, 70);
    ctx.quadraticCurveTo(214, 30, 196, 0);
    ctx.stroke();
    ctx.strokeStyle = '#e9d8b0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(196, 2);
    ctx.lineTo(192, 70);
    ctx.stroke();
    inkStroke(ctx, [196, 70, 210, 40, 204, 16, 196, 0], false, 1.6, C.ink, 9, { unit: 1, jitter: 0.3, dry: false });
    ctx.restore();
    // 剑柄（在包后面）
    ctx.save();
    ctx.translate(74, 0);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(-5, 14, 10, 44);
    ctx.strokeStyle = '#3a2213';
    ctx.lineWidth = 1;
    for (let y = 18; y < 56; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-5, y);
      ctx.lineTo(5, y + 3);
      ctx.stroke();
    }
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.roundRect(-22, 56, 44, 9, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 10, 7, 0, Math.PI * 2);
    ctx.fill();
    inkStroke(ctx, rectPts(-22, 56, 44, 9, 4), true, 1.4, C.ink, 3, { unit: 1, jitter: 0.3, dry: false });
    inkStroke(ctx, ellipsePts(0, 10, 7, 7, 14), true, 1.4, C.ink, 4, { unit: 1, jitter: 0.3, dry: false });
    ctx.restore();
    // 包身
    const body = T(rectPts(14, 62, 232, 160, 26));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(14, 62, 232, 160, 26);
    ctx.fillStyle = C.leather;
    ctx.fill();
    ctx.fillStyle = pat(ctx, 'leather', r);
    ctx.fill();
    const sh = ctx.createLinearGradient(0, 62, 0, 222);
    sh.addColorStop(0, 'rgba(255,220,170,0.12)');
    sh.addColorStop(1, 'rgba(20,8,2,0.35)');
    ctx.fillStyle = sh;
    ctx.fill();
    ctx.restore();
    // 缝线
    ctx.save();
    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.roundRect(24, 72, 212, 140, 20);
    ctx.stroke();
    ctx.restore();
    inkStroke(ctx, body, true, 2.4, C.ink, 11, { unit: 1, jitter: 0.5, dry: false });
    // 侧带
    for (const x of [44, 202]) {
      ctx.fillStyle = C.leatherDark;
      ctx.fillRect(x, 58, 14, 166);
      inkStroke(ctx, rectPts(x, 58, 14, 166, 3), true, 1.4, C.ink, x, { unit: 1, jitter: 0.3, dry: false });
      rivet(ctx, x + 7, 200, 3.5);
    }
    // 翻盖
    const flap: Pts = [];
    flap.push(10, 60);
    flap.push(250, 60);
    flap.push(246, 120);
    flap.push(170, 146);
    flap.push(130, 150);
    flap.push(90, 146);
    flap.push(14, 120);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(flap[0], flap[1]);
    for (let i = 2; i < flap.length; i += 2) ctx.lineTo(flap[i], flap[i + 1]);
    ctx.closePath();
    ctx.fillStyle = C.leatherDark;
    ctx.fill();
    ctx.fillStyle = pat(ctx, 'leatherDark', r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, 68);
    ctx.lineTo(240, 68);
    ctx.lineTo(237, 114);
    ctx.lineTo(130, 141);
    ctx.lineTo(23, 114);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    inkStroke(ctx, flap, true, 2.2, C.ink, 13, { unit: 1, jitter: 0.5, dry: false });
    // 黄铜扣
    ctx.save();
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.roundRect(116, 126, 28, 34, 6);
    ctx.fill();
    ctx.fillStyle = C.brassLight;
    ctx.fillRect(121, 131, 18, 4);
    ctx.fillStyle = '#3a2213';
    ctx.beginPath();
    ctx.roundRect(126, 142, 8, 12, 3);
    ctx.fill();
    ctx.restore();
    inkStroke(ctx, rectPts(116, 126, 28, 34, 6), true, 1.6, C.ink, 17, { unit: 1, jitter: 0.3, dry: false });
  });
}

function bestTag(): Sprite {
  return cached('title.best', 180, 26, 6, (ctx, r) => {
    drawPaper(ctx, r, 0, 0, 180, 26, { seed: 19, burn: 0.5, r: 3 });
  });
}
