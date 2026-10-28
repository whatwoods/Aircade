// 暂停、结算、设置、操作说明（第 6.6–6.8 节）
import { C, fCn, fNum } from '../render/theme.ts';
import { roundRect } from '../render/scenery.ts';
import { UI, drawButton, drawPanel, drawToggle } from '../render/ui.ts';
import type { Layout } from '../render/layout.ts';
import type { Settings } from '../util/storage.ts';
import { clamp, easeOutBack, easeOutCubic, easeOutExpo } from '../util/ease.ts';
import { Fx } from '../render/fx.ts';
import type { StoneArt } from '../render/stones.ts';
import { drawDigits } from './play.ts';
import { audio } from '../audio/audio.ts';

/** 磨砂快照：把当前画面缩到 1/8 再放大（只生成一次） */
export class Frost {
  private small: HTMLCanvasElement = document.createElement('canvas');
  private tiny: HTMLCanvasElement = document.createElement('canvas');
  ready = false;
  capture(src: HTMLCanvasElement): void {
    const w = Math.max(8, Math.round(src.width / 8)), h = Math.max(8, Math.round(src.height / 8));
    this.small.width = w; this.small.height = h;
    const g = this.small.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, w, h);
    // 再缩一级增强模糊
    const w2 = Math.max(4, w >> 1), h2 = Math.max(4, h >> 1);
    this.tiny.width = w2; this.tiny.height = h2;
    const g2 = this.tiny.getContext('2d')!;
    g2.drawImage(this.small, 0, 0, w2, h2);
    g.clearRect(0, 0, w, h);
    g.drawImage(this.tiny, 0, 0, w, h);
    this.ready = true;
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, a: number): void {
    if (!this.ready) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.small, 0, 0, W, H);
    ctx.fillStyle = 'rgba(22,27,33,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// ---------------- 暂停 ----------------
export class PauseOverlay {
  t = 0;
  countdown = -1;
  onResume: () => void = () => {};
  onRestart: () => void = () => {};
  onSettings: () => void = () => {};
  onTitle: () => void = () => {};
  open(): void { this.t = 0; this.countdown = -1; }
  update(dt: number): boolean {
    this.t += dt;
    if (this.countdown >= 0) {
      const before = Math.ceil((1.2 - this.countdown) / 0.4);
      this.countdown += dt;
      const after = Math.ceil((1.2 - this.countdown) / 0.4);
      if (after !== before && after > 0) audio.button();
      if (this.countdown >= 1.2) { this.countdown = -1; this.onResume(); return true; }
    }
    return false;
  }
  startCountdown(): void { this.countdown = 0; audio.button(); }
  draw(ctx: CanvasRenderingContext2D, ui: UI, L: Layout): void {
    const a = easeOutCubic(clamp(this.t / 0.2, 0, 1));
    if (this.countdown >= 0) {
      // 倒数（点击跳过）
      ui.add({ id: 'btn.resume', x: 0, y: 0, w: 390, h: L.H, enabled: true, onPress: () => { this.countdown = 1.2; } });
      const n = Math.max(1, Math.ceil((1.2 - this.countdown) / 0.4));
      const f = ((1.2 - this.countdown) % 0.4) / 0.4;
      ctx.save();
      ctx.translate(195, L.board.y + L.board.h / 2);
      const s = 0.8 + 0.4 * easeOutBack(1 - f);
      ctx.scale(s, s);
      ctx.globalAlpha = 0.4 + 0.6 * f;
      drawDigits(ctx, String(n), 0, 0, 96, 300, C.text1, 'center');
      ctx.restore();
      return;
    }
    const bw = 240, bh = 52, gap = 12;
    const ph = 64 + 4 * bh + 3 * gap + 40;
    const py = (L.H - ph) / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 12);
    drawPanel(ctx, 55, py, 280, ph, 16);
    ctx.font = fNum(600, 11); ctx.fillStyle = C.text3; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('P A U S E D', 195, py + 32);
    ctx.font = fCn(600, 18); ctx.fillStyle = C.text1;
    ctx.fillText('已暂停', 195, py + 56);
    let y = py + 76;
    drawButton(ctx, ui, 'btn.resume', 75, y, bw, bh, '继续', true, () => this.startCountdown()); y += bh + gap;
    drawButton(ctx, ui, 'btn.restart', 75, y, bw, bh, '重新开始', false, () => { audio.button(); this.onRestart(); }); y += bh + gap;
    drawButton(ctx, ui, 'btn.settings', 75, y, bw, bh, '设置', false, () => { audio.button(); this.onSettings(); }); y += bh + gap;
    drawButton(ctx, ui, 'btn.title', 75, y, bw, bh, '回到标题', false, () => { audio.button(); this.onTitle(); });
    ctx.restore();
  }
}

// ---------------- 结算 ----------------
export interface ResultData {
  score: number; time: number; level: number; fives: number; longest: number; maxChain: number; maxLines: number;
  best: number; newBest: boolean; seed: number;
}

export class ResultsOverlay {
  t = 0;
  d: ResultData | null = null;
  fx = new Fx();
  private burst = false;
  onAgain: () => void = () => {};
  onTitle: () => void = () => {};
  open(d: ResultData): void { this.d = d; this.t = 0; this.burst = false; this.fx.clear(); audio.panel(); }
  update(dt: number): void { this.t += dt; this.fx.update(dt); }
  draw(ctx: CanvasRenderingContext2D, ui: UI, L: Layout, art: StoneArt): void {
    const d = this.d;
    if (!d) return;
    const a = easeOutCubic(clamp(this.t / 0.35, 0, 1));
    const pw = 342, ph = 490;
    const px = 24, py = Math.max(L.topY + 70, (L.H - ph) / 2 - 30);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 24);
    drawPanel(ctx, px, py, pw, ph, 18);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = fNum(600, 11); ctx.fillStyle = C.text3;
    ctx.fillText('G A M E   O V E R', 195, py + 36);
    // 分数滚动 1.2s
    const k = easeOutExpo(clamp((this.t - 0.25) / 1.2, 0, 1));
    const v = Math.round(d.score * k);
    drawDigits(ctx, v.toLocaleString('en-US'), 195, py + 92, 60, 300, C.text1, 'center');
    if (d.newBest && k >= 1) {
      if (!this.burst) {
        this.burst = true;
        audio.record();
        for (let i = 0; i < 15; i++) { this.fx.shatter(195 + (i - 7) * 10, py + 92, i % 2, 10, 1.1); }
        this.fx.ring(195, py + 92, 170, 0.8, false, 3);
      }
      const bk = easeOutBack(clamp((this.t - 1.45) / 0.3, 0, 1));
      ctx.save();
      ctx.translate(195, py + 136);
      ctx.scale(bk, bk);
      ctx.fillStyle = C.accentDim;
      roundRect(ctx, -46, -12, 92, 24, 12); ctx.fill();
      ctx.font = fNum(600, 11); ctx.fillStyle = C.accentCore;
      ctx.textBaseline = 'middle';
      ctx.fillText('N E W  B E S T', 0, 1);
      ctx.restore();
    } else {
      ctx.font = fNum(600, 11); ctx.fillStyle = C.text3;
      ctx.textBaseline = 'middle';
      ctx.fillText(`BEST  ${d.best.toLocaleString('en-US')}`, 195, py + 136);
    }
    // 2×3 统计
    const mm = Math.floor(d.time / 60), ss = Math.floor(d.time % 60);
    const cells: [string, string][] = [
      ['时长', `${mm}:${String(ss).padStart(2, '0')}`], ['等级', `${d.level}`], ['五连', `${d.fives}`],
      ['最长线', `${d.longest || '-'}`], ['最大连锁', `${d.maxChain || '-'}`], ['同时线数', `${d.maxLines || '-'}`],
    ];
    const gx = px + 20, gy = py + 166, cw = (pw - 40) / 3, chh = 66;
    cells.forEach(([lab, val], i) => {
      const cx = gx + (i % 3) * cw, cy = gy + Math.floor(i / 3) * (chh + 10);
      const ca = clamp((this.t - 0.4 - i * 0.06) / 0.25, 0, 1);
      ctx.globalAlpha = a * ca;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, cx + 4, cy, cw - 8, chh, 10); ctx.fill();
      ctx.textBaseline = 'alphabetic';
      ctx.font = fNum(600, 22); ctx.fillStyle = C.text1;
      ctx.fillText(val, cx + cw / 2, cy + 34);
      ctx.font = fCn(500, 11); ctx.fillStyle = C.text3;
      ctx.fillText(lab, cx + cw / 2, cy + 54);
    });
    ctx.globalAlpha = a;
    const live = this.t > 0.6;
    const by = py + ph - 150;
    drawButton(ctx, ui, 'btn.again', 65, by, 260, 56, '再来一局', true, () => { audio.button(); this.onAgain(); }, { enabled: live, alpha: live ? 1 : 0.6 });
    drawButton(ctx, ui, 'btn.title', 105, by + 66, 180, 44, '回到标题', false, () => { audio.button(); this.onTitle(); }, { enabled: live, alpha: live ? 1 : 0.6 });
    ctx.font = fNum(600, 11); ctx.fillStyle = C.text3; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`SEED ${d.seed}`, 195, py + ph - 16);
    ctx.restore();
    this.fx.drawWorld(ctx, art);
  }
}

// ---------------- 设置 ----------------
type Row = { kind: 'toggle'; key: keyof Settings; label: string } | { kind: 'seg'; label: string } | { kind: 'link'; id: string; label: string };
const ROWS: Row[] = [
  { kind: 'toggle', key: 'sfx', label: '音效' },
  { kind: 'toggle', key: 'music', label: '音乐' },
  { kind: 'toggle', key: 'vibrate', label: '振动' },
  { kind: 'toggle', key: 'ghost', label: '落点影子' },
  { kind: 'toggle', key: 'preview', label: '五连预告' },
  { kind: 'seg', label: '拖动灵敏度' },
  { kind: 'toggle', key: 'reduceMotion', label: '减弱动态' },
  { kind: 'link', id: 'tutorial', label: '重看引导' },
  { kind: 'link', id: 'help', label: '操作说明' },
  { kind: 'link', id: 'about', label: '关于' },
];

export class SettingsOverlay {
  t = 0;
  page: 'main' | 'help' | 'about' = 'main';
  private tw = new Map<string, number>();
  onChange: (s: Settings) => void = () => {};
  onClose: () => void = () => {};
  onTutorial: () => void = () => {};
  canTutorial = true;
  open(): void { this.t = 0; this.page = 'main'; audio.panel(); }
  update(dt: number, s: Settings): void {
    this.t += dt;
    for (const r of ROWS) if (r.kind === 'toggle') {
      const cur = this.tw.get(r.key) ?? (s[r.key] ? 1 : 0);
      const tgt = s[r.key] ? 1 : 0;
      this.tw.set(r.key, cur + (tgt - cur) * (1 - Math.exp(-dt / 0.05)));
    }
  }
  draw(ctx: CanvasRenderingContext2D, ui: UI, L: Layout, s: Settings): void {
    const a = easeOutCubic(clamp(this.t / 0.2, 0, 1));
    ctx.save();
    ctx.globalAlpha = a;
    // 背景挡板（点击空白不穿透）
    ui.add({ id: 'settings.backdrop', x: 0, y: 0, w: 390, h: L.H, enabled: true, onPress: () => {} });
    ctx.fillStyle = 'rgba(16,20,25,0.55)';
    ctx.fillRect(0, 0, 390, L.H);
    const rowH = 52;
    const ph = this.page === 'main' ? 72 + ROWS.length * rowH + 12 : this.page === 'help' ? 560 : 300;
    const py = Math.max(L.topY + 12, (L.H - ph) / 2);
    ctx.translate(0, (1 - a) * 16);
    drawPanel(ctx, 16, py, 358, ph, 16);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = fCn(600, 18); ctx.fillStyle = C.text1;
    const title = this.page === 'main' ? '设置' : this.page === 'help' ? '操作说明' : '关于';
    ctx.fillText(title, 36, py + 36);
    // 关闭 / 返回
    const back = this.page !== 'main';
    ui.add({ id: 'btn.close', x: 318, y: py + 12, w: 48, h: 48, enabled: true, onPress: () => { audio.button(); if (back) this.page = 'main'; else this.onClose(); } });
    const cp = ui.pressAmount('btn.close');
    ctx.save();
    ctx.translate(342, py + 36); ctx.scale(1 - 0.08 * cp, 1 - 0.08 * cp);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.text1; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (back) { ctx.moveTo(4, -7); ctx.lineTo(-4, 0); ctx.lineTo(4, 7); }
    else { ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); }
    ctx.stroke();
    ctx.restore();
    if (this.page === 'main') this.drawMain(ctx, ui, py, rowH, s);
    else if (this.page === 'help') this.drawHelp(ctx, py);
    else this.drawAbout(ctx, py);
    ctx.restore();
  }

  private drawMain(ctx: CanvasRenderingContext2D, ui: UI, py: number, rowH: number, s: Settings): void {
    let y = py + 72;
    for (const r of ROWS) {
      ctx.fillStyle = C.divider;
      ctx.fillRect(36, y, 318, 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = fCn(500, 15);
      const dis = r.kind === 'link' && r.id === 'tutorial' && !this.canTutorial;
      ctx.fillStyle = dis ? C.text3 : C.text1;
      ctx.fillText(r.label, 36, y + rowH / 2);
      if (r.kind === 'toggle') {
        const key = r.key;
        ui.add({ id: `set.${key}`, x: 16, y, w: 358, h: rowH, enabled: true, onPress: () => {
          (s as unknown as Record<string, boolean>)[key] = !s[key];
          audio.button();
          this.onChange(s);
        } });
        drawToggle(ctx, 310, y + 13, this.tw.get(key) ?? (s[key] ? 1 : 0));
      } else if (r.kind === 'seg') {
        const opts: ['low' | 'mid' | 'high', string][] = [['low', '低'], ['mid', '中'], ['high', '高']];
        const sw = 48, sx0 = 354 - sw * 3;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(ctx, sx0, y + 9, sw * 3, 34, 17); ctx.fill();
        opts.forEach(([v, lab], i) => {
          const x = sx0 + i * sw;
          ui.add({ id: `set.sens.${v}`, x, y: y + 4, w: sw, h: 44, enabled: true, onPress: () => { s.sensitivity = v; audio.button(); this.onChange(s); } });
          if (s.sensitivity === v) { ctx.fillStyle = 'rgba(127,219,255,0.28)'; roundRect(ctx, x + 2, y + 11, sw - 4, 30, 15); ctx.fill(); }
          ctx.fillStyle = s.sensitivity === v ? C.text1 : C.text2;
          ctx.font = fCn(600, 13); ctx.textAlign = 'center';
          ctx.fillText(lab, x + sw / 2, y + rowH / 2 + 1);
        });
      } else {
        const id = r.id;
        ui.add({ id: `set.${id}`, x: 16, y, w: 358, h: rowH, enabled: !dis, onPress: () => {
          audio.button();
          if (id === 'tutorial') this.onTutorial();
          else this.page = id as 'help' | 'about';
        } });
        ctx.strokeStyle = C.text3; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(346, y + rowH / 2 - 6); ctx.lineTo(352, y + rowH / 2); ctx.lineTo(346, y + rowH / 2 + 6); ctx.stroke();
      }
      y += rowH;
    }
  }

  private drawHelp(ctx: CanvasRenderingContext2D, py: number): void {
    const rows: [string, string, string][] = [
      ['移动', '左右拖动（任意位置）', '← →'],
      ['软降', '慢慢下拖', '↓'],
      ['硬降', '向下快甩 / 硬降键', '空格'],
      ['顺时针旋转', '轻点', '↑ / X'],
      ['逆时针旋转', '「逆转」键', 'Z'],
      ['翻色', '「翻色」键 / 双指轻点', 'F / V'],
      ['暂存', '向上快甩 / 「暂存」键', 'C / Shift'],
      ['暂停', '左上角按钮', 'Esc / P'],
      ['静音', '设置', 'M'],
    ];
    let y = py + 80;
    ctx.font = fCn(600, 11); ctx.fillStyle = C.text3; ctx.textAlign = 'left';
    ctx.fillText('动作', 36, y); ctx.fillText('触屏', 136, y); ctx.textAlign = 'right'; ctx.fillText('键盘', 354, y);
    y += 26;
    for (const [a, t, k] of rows) {
      ctx.fillStyle = C.divider; ctx.fillRect(36, y - 18, 318, 1);
      ctx.textAlign = 'left';
      ctx.font = fCn(600, 14); ctx.fillStyle = C.text1; ctx.fillText(a, 36, y + 4);
      ctx.font = fCn(400, 12); ctx.fillStyle = C.text2; ctx.fillText(t, 136, y + 4);
      ctx.textAlign = 'right'; ctx.font = fNum(600, 12); ctx.fillStyle = C.text2; ctx.fillText(k, 354, y + 4);
      y += 44;
    }
    ctx.textAlign = 'left';
    ctx.font = fCn(400, 12); ctx.fillStyle = C.text3;
    ctx.fillText('同色五子横、竖、斜连成一线即消除；冰晶子当黑当白都算。', 36, y + 6);
    ctx.fillText('一行填满时，达到 6 颗的那种颜色退场。', 36, y + 26);
  }

  private drawAbout(ctx: CanvasRenderingContext2D, py: number): void {
    ctx.textAlign = 'left';
    const lines: [string, number, string][] = [
      ['五子落 FIVE DROP', 16, C.text1],
      ['俄罗斯方块 × 五子棋。', 13, C.text2],
      ['落下的方块由黑白棋子组成，横、竖、斜同色连成五子即消除；', 12, C.text2],
      ['形状要拼得紧，颜色要排得对。', 12, C.text2],
      ['画面、音效、音乐均为程序实时生成，不加载任何外部资源。', 12, C.text3],
      ['字体：Inter（SIL OFL 1.1）。', 12, C.text3],
    ];
    let y = py + 90;
    for (const [s, sz, col] of lines) {
      ctx.font = sz >= 16 ? fCn(600, sz) : fCn(400, sz); ctx.fillStyle = col;
      ctx.fillText(s, 36, y);
      y += sz >= 16 ? 34 : 26;
    }
  }
}
