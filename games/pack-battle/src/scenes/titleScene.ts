// 标题页：Logo 横幅（钉子 + 缓慢摆动 + 墨线沸腾）、合着的行囊（呼吸 + 扣具闪光）、开始按钮、最高分签、设置 / 规则
import { setMusic } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { clock } from '../core/loop.ts';
import { loadBest, type BestRecord } from '../game/score.ts';
import { resetTutorialFlag, tutorialDone } from '../game/tutorial.ts';
import type { InputHandler } from '../core/input.ts';
import { glowOf } from '../render/fx/particles.ts';
import { ellipsePts, inkStroke, rectPts, type Pts } from '../render/ink.ts';
import { C, cached, drawPaper, pat, rivet } from '../render/kit.ts';
import { LW, stage } from '../render/stage.ts';
import { LOGO, drawSprite, num, text, type Sprite } from '../render/text.ts';
import { Button, type UiEl } from '../render/ui/widgets.ts';
import { RulesPanel, Overlays, SettingsPanel } from './overlays.ts';
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
    setMusic('arrange');
    this.layout();
  }

  exit(): void {}

  autoPause(): void {}

  private layout(): void {
    const H = stage.H;
    this.oy = (H - 844) / 2;
    const oy = this.oy;
    this.start.r = { x: 95, y: 610 + oy, w: 200, h: 70 };
    this.gear.r = { x: 24, y: H - 84, w: 44, h: 44 };
    this.help.r = { x: 322, y: H - 84, w: 44, h: 44 };
  }

  private go(): void {
    sfx('click');
    gotoScene(() => factories.game({ tutorial: !tutorialDone() }), 0.5, (610 + this.oy + 35) / stage.H);
  }

  private buttons(): Button[] {
    return [this.start, this.gear, this.help];
  }

  private activate(b: Button): void {
    if (b === this.start) this.go();
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
    this.start.pulse = 0.035;
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
    // 横幅：缓慢摆动 ±0.6°
    ctx.save();
    ctx.translate(195, 120 + oy);
    ctx.rotate(Math.sin((t / 4) * Math.PI * 2) * 0.0105);
    ctx.translate(-195, -(120 + oy));
    drawSprite(ctx, bannerSprite(), 30, 120 + oy);
    const frame = Math.floor(t * 10) % 3;
    drawSprite(ctx, logoSprite(frame), 30, 120 + oy);
    ctx.restore();
    // 合着的行囊：呼吸
    const breath = 1 + 0.012 * (0.5 + 0.5 * Math.sin((t / 2.8) * Math.PI * 2));
    const bagS = closedBag();
    ctx.save();
    ctx.translate(195, 565 + oy);
    ctx.scale(1, breath);
    drawSprite(ctx, bagS, -130, -205);
    // 扣具高光：每 4 秒一次
    const gk = (t % 4) / 4;
    if (gk < 0.12) {
      const a = Math.sin((gk / 0.12) * Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(glowOf('#fff3c4'), -16, -114, 32, 32);
      ctx.strokeStyle = 'rgba(255,250,220,' + (a * 0.9).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, -98);
      ctx.lineTo(10, -98);
      ctx.moveTo(0, -108);
      ctx.lineTo(0, -88);
      ctx.stroke();
    }
    ctx.restore();
    // 按钮
    this.start.draw(ctx, t, real);
    if (this.best && this.best.score > 0) {
      const b = this.best;
      const s = `最高分 ${num(b.score)} · ${b.cleared ? '已通关' : '最远第 ' + b.round + ' 轮'}`;
      drawSprite(ctx, bestTag(), 105, 694 + oy);
      text(ctx, s, 195, 707 + oy, { size: 13, weight: 700, color: C.ink });
    }
    this.gear.draw(ctx, t, real);
    this.help.draw(ctx, t, real);
    text(ctx, '设置', this.gear.r.x + 22, this.gear.r.y + 52, { size: 11, weight: 700, color: C.chalk, alpha: 0.7 });
    text(ctx, '规则', this.help.r.x + 22, this.help.r.y + 52, { size: 11, weight: 700, color: C.chalk, alpha: 0.7 });
    this.ov.draw(ctx, LW, stage.H, t, real);
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
    // 分隔小饰线
    ctx.strokeStyle = 'rgba(93,72,55,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(70, 102);
    ctx.lineTo(140, 102);
    ctx.moveTo(190, 102);
    ctx.lineTo(260, 102);
    ctx.stroke();
    ctx.fillStyle = C.wax;
    ctx.beginPath();
    ctx.moveTo(165, 96);
    ctx.lineTo(171, 102);
    ctx.lineTo(165, 108);
    ctx.lineTo(159, 102);
    ctx.closePath();
    ctx.fill();
  });
}

/** Logo 字（3 帧沸腾：每帧不同的描边抖动） */
function logoSprite(frame: number): Sprite {
  return cached('title.logo' + frame, 330, 180, 16, (ctx) => {
    const jx = [0, 0.6, -0.5][frame];
    const jy = [0, -0.4, 0.5][frame];
    // PACK BATTLE
    ctx.save();
    ctx.translate(165 + jx, 70 + jy);
    ctx.font = `700 56px ${LOGO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(43,29,20,0.95)';
    ctx.lineWidth = 7 + frame * 0.4;
    ctx.strokeText('PACK BATTLE', 0, 0);
    ctx.fillStyle = C.wax;
    ctx.fillText('PACK BATTLE', 0, 0);
    ctx.fillStyle = 'rgba(255,220,180,0.35)';
    ctx.fillText('PACK BATTLE', -1.2, -1.6);
    ctx.restore();
    // 行囊对决
    ctx.save();
    ctx.translate(165 - jx * 0.6, 138 - jy * 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 44px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif`;
    const s = '行囊对决';
    // 字距 6px：逐字绘制
    const widths = [...s].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + 6 * (s.length - 1);
    let x = -total / 2;
    for (let i = 0; i < s.length; i++) {
      const cx = x + widths[i] / 2;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(244,234,208,0.9)';
      ctx.strokeText(s[i], cx, 0);
      ctx.fillStyle = C.ink;
      ctx.fillText(s[i], cx, 0);
      x += widths[i] + 6;
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
