// 首局引导（第 6.5 节）：3 步，固定盘面与方块，重力关闭，可跳过
import type { PlayScene } from './play.ts';
import type { PieceSpec } from '../core/pieces.ts';
import { parseColors } from '../core/pieces.ts';
import { C, fCn } from '../render/theme.ts';
import { roundRect } from '../render/scenery.ts';
import { kinsokuCut } from '../render/ui.ts';
import type { UI } from '../render/ui.ts';
import type { Layout } from '../render/layout.ts';
import { clamp, easeOutBack, easeOutCubic, easeInOutSine } from '../util/ease.ts';
import { audio } from '../audio/audio.ts';

interface StepDef {
  board: string[];
  piece: PieceSpec;
  card: string;
  target: { c: number; r: number };
  line: { c: number; r: number }[];
  /** 需要的方向：-1 任意 */
  dir: number;
  /** 手势动画：拖动的列数、是否先轻点、是否高亮翻色 */
  drag: number; tap: boolean; invert: boolean;
}

const STEPS: StepDef[] = [
  {
    board: ['.BBBB....'],
    piece: { shape: 'I3', colors: parseColors('BBB'), rot: 1 },
    card: '同色五子连成一线就会消除。拖动方块到亮起的位置，向下一甩落下',
    target: { c: 5, r: 14 }, line: [{ c: 1, r: 14 }, { c: 5, r: 14 }], dir: -1, drag: 1, tap: false, invert: false,
  },
  {
    board: ['....W....', '....W....', '....W....', '....W....'],
    piece: { shape: 'D2', colors: parseColors('BB'), rot: 1 },
    card: '竖着也算！颜色不对？点下方「翻色」',
    target: { c: 4, r: 10 }, line: [{ c: 4, r: 9 }, { c: 4, r: 14 }], dir: -1, drag: 0, tap: false, invert: true,
  },
  {
    board: ['.........', '...B.....', '..BW.....', '.BWWW....', 'BWWWW....'],
    piece: { shape: 'I3', colors: parseColors('BWW'), rot: 0 },
    card: '斜线也算！轻点旋转，把黑子放到亮起的位置',
    target: { c: 4, r: 10 }, line: [{ c: 0, r: 14 }, { c: 4, r: 10 }], dir: 3, drag: 0, tap: true, invert: false,
  },
];

export class Tutorial {
  active = false;
  step = 0;
  private t = 0;
  private doneT = -1;
  private failText = '';
  private failT = 0;
  private slow = 1;
  private endT = -1;
  private cardT = 0;
  private fiveDirs: number[] = [];
  private gotFive = false;
  private play: PlayScene;
  onFinish: () => void = () => {};
  private L!: Layout;

  constructor(play: PlayScene) { this.play = play; }
  setLayout(L: Layout): void { this.L = L; }

  begin(): void {
    this.active = true;
    this.step = 0;
    this.slow = 1;
    this.endT = -1;
    this.load();
  }

  private load(): void {
    const s = STEPS[this.step];
    const P = this.play;
    P.tutorial = true;
    P.hideTopInfo = true;
    P.hooks.onFive = (_n, dirs) => { this.gotFive = true; this.fiveDirs.push(...dirs); };
    P.hooks.onResolved = () => this.onResolved();
    P.start(1, { gravityOff: true, noLevelTimer: true, noGarbage: true, script: [s.piece, { shape: 'I3', colors: parseColors('WWW'), rot: 0 }] }, 0, g => g.grid.setAscii(s.board));
    // 本步的方块锁定后不再出下一块，避免切换步骤前冒出一块可操作的填充方块
    P.game.on('lock', () => { P.game.spawnLocked = true; });
    P.view.target = s.target;
    P.view.targetLine = s.line;
    P.highlight = s.invert ? 'btn.invert' : '';
    this.t = 0; this.doneT = -1; this.gotFive = false; this.fiveDirs = []; this.cardT = 0;
  }

  private onResolved(): void {
    if (!this.active || this.doneT >= 0 || this.endT >= 0) return;
    const s = STEPS[this.step];
    const ok = this.gotFive && (s.dir < 0 || this.fiveDirs.includes(s.dir));
    if (ok) {
      this.doneT = 0;
      audio.levelUp();
      this.play.view.target = null; this.play.view.targetLine = null;
      if (s.dir === 3) this.play.view.fx.float(this.play.view.cx(2), this.play.view.cy(12 + 2) - 30, '斜', '', 26, 0.1);
    } else {
      this.failText = this.step === 1 ? '先翻成白色' : this.step === 2 ? '先轻点旋转，再放到亮起的位置' : '再试一次：对准亮起的位置';
      this.failT = 0;
      this.slow = 1.6;
      audio.holdFail();
      this.load();
    }
  }

  skip(): void {
    if (!this.active) return;
    this.finish();
  }

  private finish(): void {
    this.active = false;
    const P = this.play;
    P.tutorial = false; P.hideTopInfo = false; P.highlight = '';
    P.hooks.onFive = undefined; P.hooks.onResolved = undefined;
    P.view.target = null; P.view.targetLine = null;
    this.onFinish();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt; this.cardT += dt;
    this.failT += dt;
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT > 0.6 + 0.5) {
        if (this.step < STEPS.length - 1) { this.step++; this.load(); }
        else if (this.endT < 0) { this.endT = 0; this.doneT = -1; this.cardT = 0; }
      }
    }
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 1.5) this.finish();
    }
    // 引导中的方块整块露出来（出块点在隐藏行里，新手只看得到一颗子）
    const g = this.play.game;
    const ap = g.active;
    if (ap && ap !== this.shown && g.phase === 'play') {
      this.shown = ap;
      let top = 99;
      for (const y of ap.cy) top = Math.min(top, ap.y + y);
      let n = g.grid.hidden - top;
      while (n-- > 0 && !g.grid.collides(ap, ap.x, ap.y + 1)) ap.y++;
    }
    // 方块对准时把光轨点亮
    const pv = g.preview();
    this.aligned = !!pv && pv.lines.length > 0;
  }
  private aligned = false;
  private shown: unknown = null;

  draw(ctx: CanvasRenderingContext2D, ui: UI): void {
    if (!this.active) return;
    const L = this.L, y = L.topY + 60;
    // 跳过
    ui.add({ id: 'btn.skip', x: 322, y: L.topY + 6, w: 52, h: 44, enabled: true, onPress: () => { audio.button(); this.skip(); } });
    const sp = ui.pressAmount('btn.skip');
    ctx.save();
    ctx.translate(348, L.topY + 28);
    ctx.scale(1 - 0.06 * sp, 1 - 0.06 * sp);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, -26, -16, 52, 32, 16); ctx.fill();
    ctx.font = fCn(600, 13); ctx.fillStyle = C.text2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('跳过', 0, 1);
    ctx.restore();
    // 卡片
    const ca = easeOutCubic(clamp(this.cardT / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = ca;
    ctx.translate(0, (1 - ca) * -8);
    ctx.fillStyle = 'rgba(54,66,79,0.82)';
    roundRect(ctx, 16, y, 358, 64, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(127,219,255,0.25)'; ctx.lineWidth = 1;
    roundRect(ctx, 16.5, y + 0.5, 357, 63, 12); ctx.stroke();
    // 步骤点
    for (let i = 0; i < STEPS.length; i++) {
      ctx.fillStyle = i < this.step || (i === this.step && this.doneT >= 0) || this.endT >= 0 ? C.accent : i === this.step ? C.text1 : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(34, y + 20 + i * 12, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let text = this.endT >= 0 ? '凑五连，别让棋子堆到顶。' : STEPS[this.step].card;
    if (this.doneT < 0 && this.endT < 0 && this.aligned) text = '放下就能消除';
    const fail = this.failT < 1.6 && this.failText && this.doneT < 0 && this.endT < 0;
    ctx.fillStyle = C.text1;
    ctx.font = fCn(600, 15);
    const lines = wrap(ctx, text, 300);
    lines.forEach((ln, i) => ctx.fillText(ln, 52, y + 32 + (i - (lines.length - 1) / 2) * 21));
    if (fail) {
      ctx.globalAlpha = ca * clamp((1.6 - this.failT) / 0.3, 0, 1);
      ctx.fillStyle = 'rgba(46,57,69,0.96)';
      roundRect(ctx, 16, y, 358, 64, 12); ctx.fill();
      ctx.fillStyle = C.danger;
      ctx.fillText(this.failText, 52, y + 32);
    }
    // 勾号
    if (this.doneT >= 0) {
      const k = easeOutBack(clamp(this.doneT / 0.3, 0, 1));
      ctx.globalAlpha = clamp(1.2 - this.doneT, 0, 1);
      ctx.save();
      ctx.translate(346, y + 32); ctx.scale(k, k);
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#11303D'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-1.5, 5); ctx.lineTo(7, -5); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    if (this.doneT < 0 && this.endT < 0) this.drawHand(ctx);
  }

  /** 半透明手势动画：拖 → 轻点 → 下甩 */
  private drawHand(ctx: CanvasRenderingContext2D): void {
    const s = STEPS[this.step];
    const P = this.play;
    const R = this.L.board;
    const period = 3.2 * this.slow;
    const t = (this.t % period) / period * 3.2;
    if (this.t < 0.6) return;
    const cell = R.cell * 0.9;
    const x0 = 195, y0 = R.y + R.h - 120;
    let x = x0, y = y0, a = 0, press = 0;
    const seq: { d: number; kind: 'drag' | 'tap' | 'flick' | 'invert' }[] = [];
    if (s.drag) seq.push({ d: 0.9, kind: 'drag' });
    if (s.tap) seq.push({ d: 0.6, kind: 'tap' });
    if (s.invert) seq.push({ d: 0.8, kind: 'invert' });
    seq.push({ d: 0.7, kind: 'flick' });
    let acc = 0.2;
    if (t < acc) { a = t / acc; }
    else {
      a = 1;
      let tt = t - acc, dx = 0;
      for (const st of seq) {
        if (tt > st.d) { tt -= st.d; if (st.kind === 'drag') dx = s.drag * cell; continue; }
        const u = tt / st.d;
        if (st.kind === 'drag') { press = 1; dx = easeInOutSine(clamp(u / 0.8, 0, 1)) * s.drag * cell; }
        else if (st.kind === 'tap') { press = u > 0.3 && u < 0.55 ? 1 : 0; }
        else if (st.kind === 'invert') {
          // 指向翻色按钮
          const bx = 195, by = 750 + this.L.barShift;
          const k = easeInOutSine(clamp(u / 0.6, 0, 1));
          x = x0 + dx + (bx - x0 - dx) * k; y = y0 + (by + 10 - y0) * k;
          press = u > 0.6 && u < 0.85 ? 1 : 0;
          dx = 0;
          ctx.save(); this.finger(ctx, x, y, a * 0.6, press); ctx.restore();
          return;
        } else { press = u < 0.7 ? 1 : 0; y = y0 + easeOutCubic(clamp(u / 0.5, 0, 1)) * 90; a = 1 - clamp((u - 0.6) / 0.4, 0, 1); }
        break;
      }
      x = x0 + dx;
      if (tt > 0 && seq.every(() => true) && t > acc + seq.reduce((q, w) => q + w.d, 0)) a = 0;
    }
    void P;
    this.finger(ctx, x, y, a * 0.6, press);
  }

  private finger(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, press: number): void {
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(236,241,245,0.9)';
    ctx.beginPath(); ctx.arc(x, y, 15 - press * 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(127,219,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 21 + press * 6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  if (ctx.measureText(s).width <= maxW) return [s];
  // 优先在标点处断行
  const cuts = [...s.matchAll(/[，。！？]/g)].map(m => (m.index ?? 0) + 1).filter(i => i < s.length);
  let best = kinsokuCut(s, Math.ceil(s.length / 2)), bd = 1e9;
  for (const c of cuts) {
    const d = Math.abs(ctx.measureText(s.slice(0, c)).width - ctx.measureText(s.slice(c)).width);
    if (d < bd && ctx.measureText(s.slice(0, c)).width <= maxW && ctx.measureText(s.slice(c)).width <= maxW) { bd = d; best = c; }
  }
  return [s.slice(0, best), s.slice(best)];
}
