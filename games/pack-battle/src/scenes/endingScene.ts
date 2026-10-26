// 结局页：冒险者证书（分数逐行累加、总分、历史最高 / 新纪录印章、趣味统计、种子）+ 再来一局 / 标题
import { setMusic } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { SCORE } from '../config.ts';
import type { InputHandler } from '../core/input.ts';
import { clock } from '../core/loop.ts';
import { Rolling, ease } from '../core/tween.ts';
import { loadBest, submitBest, type BestRecord } from '../game/score.ts';
import { emit } from '../render/fx/particles.ts';
import { tier } from '../render/fx/shake.ts';
import { C, paper } from '../render/kit.ts';
import { drawStandee, standeeHeight } from '../render/portraits.ts';
import { LW, stage } from '../render/stage.ts';
import { HAND, drawSprite, num, text } from '../render/text.ts';
import { Button, drawStamp, type UiEl } from '../render/ui/widgets.ts';
import type { EndingData } from './sceneManager.ts';
import { factories, gotoScene, type Scene } from './sceneManager.ts';

interface Line {
  label: string;
  amount: number;
}

export class EndingScene implements Scene {
  readonly name = 'ending' as const;
  handler: InputHandler;
  private d: EndingData;
  private lines: Line[] = [];
  private shown = 0;
  private t = 0;
  private total = new Rolling(0, 0.25);
  private best: BestRecord | null = null;
  private isRecord = false;
  private recordT = -1;
  private again: Button;
  private title: Button;
  private pressed: Button | null = null;
  private oy = 0;
  private rain = 0;

  constructor(d: EndingData) {
    this.d = d;
    d.roundScores.forEach((s, i) => this.lines.push({ label: `第 ${i + 1} 轮`, amount: s }));
    if (d.cleared) {
      this.lines.push({ label: '通关奖励', amount: SCORE.clearBonus });
      if (d.hearts > 0) this.lines.push({ label: `剩余心 ×${d.hearts}`, amount: SCORE.heartBonus * d.hearts });
    }
    this.again = new Button('btn.again', { x: 40, y: 728, w: 210, h: 64 }, '再来一局', 'sealTag', 31);
    this.again.glyph = '↻';
    this.title = new Button('btn.title', { x: 262, y: 728, w: 88, h: 64 }, '标题', 'paper', 32);
    this.handler = this.makeHandler();
  }

  enter(): void {
    const prev = loadBest();
    this.isRecord = submitBest({ score: this.d.score, round: this.d.round, cleared: this.d.cleared, date: Date.now() });
    this.best = this.isRecord ? { score: this.d.score, round: this.d.round, cleared: this.d.cleared, date: Date.now() } : prev;
    setMusic(null);
    if (this.d.cleared) {
      sfx('victory', 0, 0.3);
      tier('T3', false);
      this.rain = 3;
    } else sfx('defeat', 0, 0.3);
    this.layout();
  }

  exit(): void {}

  autoPause(): void {}

  private layout(): void {
    const H = stage.H;
    this.oy = Math.max(0, (H - 844) / 2);
    const by = Math.min(H - 116, 728 + this.oy);
    this.again.r = { x: 40, y: by, w: 210, h: 64 };
    this.title.r = { x: 262, y: by, w: 88, h: 64 };
  }

  private buttons(): Button[] {
    return [this.again, this.title];
  }

  private activate(b: Button): void {
    if (b === this.again) gotoScene(() => factories.game({ tutorial: false }));
    else gotoScene(() => factories.title());
  }

  private makeHandler(): InputHandler {
    return {
      down: (x, y) => {
        for (const b of this.buttons()) {
          if (b.hit(x, y)) {
            b.down();
            this.pressed = b;
            sfx('click');
            return;
          }
        }
        // 点空白：跳过累加
        this.shown = this.lines.length;
      },
      dragStart: () => {},
      drag: () => {},
      up: (x, y) => {
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
      },
      rotate: () => {},
      hover: (x, y) => {
        for (const b of this.buttons()) b.hover = b.hit(x, y);
      },
      key: (code) => {
        if (code === 'Space' || code === 'Enter') this.activate(this.again);
        else if (code === 'Escape') this.activate(this.title);
      },
      wheel: () => {},
    };
  }

  update(dt: number, _raw: number): void {
    if (this.oy !== Math.max(0, (stage.H - 844) / 2)) this.layout();
    this.t += dt;
    const per = 0.14;
    const want = Math.min(this.lines.length, Math.floor(Math.max(0, this.t - 0.6) / per));
    while (this.shown < want) {
      this.shown++;
      sfx('coinUp', this.shown);
    }
    let sum = 0;
    for (let i = 0; i < this.shown; i++) sum += this.lines[i].amount;
    this.total.set(sum);
    this.total.update(dt);
    if (this.shown >= this.lines.length && this.recordT < 0 && this.t > 0.6 + this.lines.length * per + 0.4) {
      this.recordT = 0;
      if (this.isRecord && this.d.score > 0) {
        sfx('record');
        tier('T3', false);
        emit('confetti', 300, 500 + this.oy, 40, { color: C.goldLight, speed: 260, life: 1.2, ui: true });
      }
    }
    if (this.recordT >= 0) this.recordT += dt;
    if (this.rain > 0) {
      this.rain -= dt;
      if (Math.random() < 0.6) emit('confetti', Math.random() * LW, -10, 1, { speed: 40, angle: Math.PI / 2, spread: 0.6, life: 3, ui: true });
    }
  }

  step(_h: number): void {}

  draw(ctx: CanvasRenderingContext2D): void {
    const d = this.d;
    const oy = this.oy;
    const t = this.t;
    const real = clock.real;
    const k = ease.outBack(Math.min(1, t / 0.45));
    // 证书展开
    const px = 20;
    const py = 90 + oy;
    const ph = Math.min(620, stage.H - 210 - oy + 90);
    ctx.save();
    ctx.translate(195, py);
    ctx.scale(1, Math.max(0.05, k));
    ctx.translate(-195, -py);
    drawSprite(ctx, paper('cert', 350, ph, { seed: 77, burn: 1, r: 5, border: true }), px, py);
    ctx.restore();
    if (k < 0.8) {
      this.drawButtons(ctx, real);
      return;
    }
    const a = Math.min(1, (t - 0.3) / 0.25);
    ctx.save();
    ctx.globalAlpha *= a;
    text(ctx, '冒 险 者 证 书', 195, py + 40, { size: 15, weight: 900, color: C.inkSoft, spacing: 3 });
    text(ctx, d.cleared ? '通关！十轮全胜' : `冒险终结于第 ${d.round} 轮`, 195, py + 76, {
      size: 26, weight: 900, color: d.cleared ? C.wax : C.ink, spacing: 2,
    });
    if (!d.cleared && d.killerName) text(ctx, `击败你的是 ${d.killerName}`, 195, py + 104, { size: 13, weight: 700, color: C.inkSoft });
    // 分数明细
    const ly0 = py + 134;
    const lh = Math.min(21, (ph - 380) / Math.max(1, this.lines.length));
    for (let i = 0; i < this.shown; i++) {
      const l = this.lines[i];
      const y = ly0 + i * lh;
      text(ctx, l.label, 64, y, { size: 14, weight: 700, color: C.inkSoft, align: 'left' });
      ctx.strokeStyle = 'rgba(93,72,55,0.35)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(140, y + 3);
      ctx.lineTo(276, y + 3);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, '+' + num(l.amount), 326, y, { size: 18, family: HAND, color: C.goldDark, align: 'right' });
    }
    if (this.lines.length === 0) text(ctx, '（没有赢下任何一轮）', 195, ly0 + 10, { size: 13, weight: 700, color: C.pencil });
    const ty = ly0 + Math.max(1, this.lines.length) * lh + 34;
    ctx.strokeStyle = 'rgba(43,29,20,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, ty - 22);
    ctx.lineTo(330, ty - 22);
    ctx.stroke();
    text(ctx, '总分', 64, ty + 6, { size: 16, weight: 900, color: C.ink, align: 'left' });
    text(ctx, num(this.total.int), 326, ty + 4, { size: 48, family: HAND, color: C.ink, align: 'right' });
    // 历史最高
    const by = ty + 52;
    const b = this.best;
    text(ctx, `历史最高 ${b ? num(b.score) : num(d.score)}`, 64, by, { size: 14, weight: 700, color: C.inkSoft, align: 'left' });
    if (this.recordT >= 0 && this.isRecord && d.score > 0) {
      const st = Math.min(1, this.recordT / 0.12);
      drawStamp(ctx, '新纪录！', 268, by - 4, 22, '#c2402c', -0.18, 1, 2 - st);
    }
    // 趣味统计
    const sy = by + 40;
    const stats = [`最高单击 ${d.bestHit} 伤害`, `合成 ${d.merges} 次`, `花费 ${d.spent} 金`];
    stats.forEach((s, i) => text(ctx, '· ' + s, 64, sy + i * 22, { size: 13, weight: 700, color: C.inkSoft, align: 'left' }));
    text(ctx, '种子 ' + d.seed, 195, py + ph - 22, { size: 11, weight: 700, color: C.pencil });
    ctx.restore();
    // 失败：击败你的敌人立牌（得意地摇晃）
    if (!d.cleared && d.killer) {
      const sc = 120 / standeeHeight(d.killer, 1);
      const lean = Math.sin(t * 5) * 0.06;
      const pop = Math.min(1, Math.max(0, (t - 0.5) / 0.3));
      drawStandee(ctx, d.killer, 318, sy + 74, sc, ease.outBack(pop), lean);
    }
    this.drawButtons(ctx, real);
  }

  private drawButtons(ctx: CanvasRenderingContext2D, real: number): void {
    const a = Math.min(1, Math.max(0, (this.t - 0.4) / 0.3));
    ctx.save();
    ctx.globalAlpha *= a;
    this.again.draw(ctx, this.t, real);
    this.title.draw(ctx, this.t, real);
    ctx.restore();
  }

  ui(): UiEl[] {
    return this.buttons().map((b) => b.el());
  }

  cursor(x: number, y: number): string {
    for (const b of this.buttons()) if (b.hit(x, y)) return 'pointer';
    return 'default';
  }
}
