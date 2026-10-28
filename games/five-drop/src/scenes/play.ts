// 游戏中：把核心逻辑、棋盘视图、HUD、输入、音频串起来
import { CONFIG, garbageInterval } from '../config.ts';
import type { Config } from '../config.ts';
import { Game } from '../core/game.ts';
import type { GameOptions } from '../core/game.ts';
import { Piece, SHAPES } from '../core/pieces.ts';
import { BoardView } from '../render/board.ts';
import type { Layout } from '../render/layout.ts';
import { C, fCn, fNum } from '../render/theme.ts';
import { roundRect } from '../render/scenery.ts';
import { UI, kinsokuCut } from '../render/ui.ts';
import { audio } from '../audio/audio.ts';
import { Spring } from '../util/spring.ts';
import { Trauma } from '../util/trauma.ts';
import { clamp, easeOutBack, easeOutCubic, easeInOutCubic } from '../util/ease.ts';
import type { Settings } from '../util/storage.ts';
import { load, save } from '../util/storage.ts';
import { kindOf } from '../render/stones.ts';

interface Toast { text: string; sub: string; t: number; ttl: number; prio: number; size: number }

export interface PlayHooks {
  onGameOver(game: Game): void;
  onPause(): void;
  onFive?(lines: number, dirs: number[]): void;
  onResolvedNoFive?(): void;
  onResolved?(anyFive: boolean): void;
}

export class PlayScene {
  game!: Game;
  view = new BoardView();
  trauma = new Trauma(CONFIG.feel.traumaDecay, CONFIG.feel.shakeMaxPx);
  score = new Spring(0, 12, 0.9);
  private scorePulse = 1;
  private best = 0;
  private hitstop = 0;
  private slowmo = 0;
  private toast: Toast | null = null;
  private toastPrev: Toast | null = null;
  private toastSwap = 1;
  private comboShow = 0;
  private comboT = 1;
  private holdFailT = 1;
  private holdFlashT = 1;
  private levelFlip = 1;
  private shownLevel = 1;
  private overTimer = -1;
  private overFired = false;
  private dragStartX = 0;
  private softDone = 0;
  private dragBlocked = 0;
  private hints: string[] = load<string[]>('hints', []);
  private holdUnusedT = 0;
  private holdEverUsed = false;
  private heartbeatT = 0;
  private garbageWarnT = 0;
  private garbageToastShown = false;
  hooks: PlayHooks;
  settings: Settings;
  tutorial = false;
  /** 引导期间隐藏的 HUD 区域 */
  hideTopInfo = false;
  /** 引导用：高亮按钮 */
  highlight = '';
  private ui: UI;
  private L!: Layout;
  epoch = 0;
  private cfg: Config;

  constructor(ui: UI, settings: Settings, hooks: PlayHooks, cfg: Config = CONFIG) {
    this.ui = ui;
    this.settings = settings;
    this.hooks = hooks;
    this.cfg = cfg;
  }

  setLayout(L: Layout): void {
    this.L = L;
    this.view.setRect(L.board, L.k);
  }

  start(seed: number, opts: GameOptions = {}, best = 0, setup?: (g: Game) => void): void {
    this.game = new Game(this.cfg, seed, opts);
    setup?.(this.game);
    this.best = best;
    this.view.reset();
    this.score.set(0);
    this.toast = null; this.toastPrev = null;
    this.overTimer = -1; this.overFired = false;
    this.hitstop = 0; this.slowmo = 0;
    this.shownLevel = this.game.level;
    this.holdUnusedT = 0; this.holdEverUsed = false;
    this.garbageToastShown = false;
    this.comboShow = 0;
    this.bind();
    this.game.start();
  }

  private hint(id: string, text: string): void {
    if (this.tutorial || this.hints.includes(id)) return;
    this.hints.push(id);
    save('hints', this.hints);
    this.showToast(text, '', 3.2, 2, 13);
  }
  resetHints(): void { this.hints = []; save('hints', []); }

  showToast(text: string, sub = '', ttl = 1.2, prio = 1, size = 16): void {
    if (this.toast && this.toast.prio > prio && this.toast.t < this.toast.ttl * 0.7) return;
    this.toastPrev = this.toast;
    this.toast = { text, sub, t: 0, ttl, prio, size };
    this.toastSwap = 0;
  }

  private vibrate(p: number | number[]): void {
    if (!this.settings.vibrate) return;
    try { if ('vibrate' in navigator) navigator.vibrate(p); } catch { /* ignore */ }
  }

  private bind(): void {
    const g = this.game, v = this.view;
    g.on('spawn', e => { v.onSpawn(e.piece); this.epoch++; this.onSpawnHook?.(); });
    g.on('move', e => {
      if (e.ok) audio.tick(g.active ? g.active.x : 4);
    });
    g.on('rotate', e => { v.onRotate(e.dir, e.ok); if (e.ok) audio.rotate(); else audio.rotFail(); });
    g.on('invert', e => { if (e.ok) { v.onInvert(); audio.invert(); } });
    g.on('hold', e => {
      if (e.ok) {
        this.holdFlashT = 0; audio.hold(); this.holdEverUsed = true;
        if (e.piece) { this.holdFly = e.piece; this.holdFlyT = 0; this.holdFrom.x = v.cx(e.piece.x + (e.piece.n - 1) / 2); this.holdFrom.y = v.cy(Math.max(2, e.piece.y + 1)); }
      }
      else { this.holdFailT = 0; audio.holdFail(); }
    });
    g.on('softStep', () => {
      audio.softTick();
      const p = g.active;
      if (p) for (let i = 0; i < p.cx.length; i++) { const x = v.cx(p.x + p.cx[i]), y = v.cy(p.y + p.cy[i]); v.fx.trail(x, y - this.L.board.cell * 0.9, y, this.L.board.cell * 0.5); }
    });
    g.on('land', () => { audio.land(); v.onLand(); });
    g.on('hardDrop', e => {
      v.onHardDrop(e.piece, e.fromY, e.toY);
      const rows = e.toY - e.fromY;
      audio.hardDrop(rows);
      this.trauma.add(rows >= 8 ? CONFIG.feel.trauma.light * 3 : CONFIG.feel.trauma.light);
      const p = e.piece;
      const cp = new Piece(p.shape, p.colors, p.rot); cp.x = p.x; cp.y = e.toY;
      v.onLandDust(cp, rows);
    });
    g.on('lock', e => {
      v.onLock(e.piece, e.cells);
      let b = 0, w = 0;
      for (const c of e.colors) { if (c === 1) b++; else if (c === 2) w++; }
      audio.lock(b >= w);
      this.vibrate(8);
      // 第一次出现悬空棋子时解释规则（连结的细桥 + 一次性提示）
      const cols = g.grid.cols, n = g.grid.cells.length;
      if (e.cells.some(k => k + cols < n && !g.grid.cells[k + cols])) this.hint('float', '同块相连可悬空，消除的列才塌落');
    });
    g.on('step', e => {
      const s = e.step;
      const mids = v.onStep(s);
      if (s.kind === 'five') {
        const n = s.lines.length;
        const long = s.lines.some(l => l.length >= 6);
        const heavy = n >= 2 || s.k >= 3;
        this.hitstop = (heavy ? CONFIG.feel.hitstopMs.heavy : CONFIG.feel.hitstopMs.mid) / 1000 * (this.settings.reduceMotion ? 0.5 : 1);
        this.trauma.add(heavy ? CONFIG.feel.trauma.heavy : CONFIG.feel.trauma.mid);
        audio.five(s.k, n, long);
        audio.shatter(s.removed.length);
        if (s.removedColors.some(c => c === 3)) audio.crystal();
        this.vibrate(heavy ? [20, 40, 30] : 20);
        // 跳字：每条线一个，错开 120ms
        const per = Math.round(s.score / n);
        mids.forEach((m, i) => {
          const off = v.fx.floatsActiveNear(m.mx, m.my, 30) * 24;
          const ln = s.lines[i];
          this.view.fx.float(clamp(m.mx, this.L.board.x + 30, this.L.board.x + this.L.board.w - 30), clamp(m.my - off, this.L.board.y + 20, this.L.board.y + this.L.board.h - 10), `+${per}`, ln.length >= 6 ? `${ln.length} 连` : ln.dir >= 2 ? '斜' : '', 20 + Math.min(8, s.k * 2), i * 0.12);
        });
        if (n >= 2) this.showToast(n >= 3 ? '三线' : '双线', `×${1 + CONFIG.score.crossStep * (n - 1)}`, 1.2, 3, 22);
        if (s.k >= 3) this.edgeFlash = 1;
        if (s.k >= 2) { this.showToast(`连锁 ×${CONFIG.score.chainMult[Math.min(s.k, 5) - 1]}`, '', 1.2, 4, 16 + Math.min(8, (s.k - 1) * 3)); this.hint('chain', '下落后再连成五子 = 连锁加倍'); }
        this.hooks.onFive?.(n, s.lines.map(l => l.dir));
      } else {
        audio.fullRow();
        this.trauma.add(CONFIG.feel.trauma.mid * 0.8);
        this.hitstop = 0.04;
        mids.forEach((m, i) => this.view.fx.float(m.mx, m.my, `+${Math.round(s.score / mids.length)}`, '满行', 18, i * 0.12));
        this.hint('fullrow', `满行时，某色达到 ${CONFIG.fullRow.minMajority} 颗即退场`);
        if (s.k >= 2) this.showToast(`连锁 ×${CONFIG.score.chainMult[Math.min(s.k, 5) - 1]}`, '', 1.2, 4, 18);
      }
    });
    g.on('resolved', e => {
      if (e.comboBonus > 0) { this.comboShow = e.combo; this.comboT = 0; audio.combo(e.combo); }
      if (!e.anyFive) this.comboShow = 0;
      if (e.perfect) {
        this.showToast('清盘', `+${e.perfectBonus}`, 2, 5, 22); audio.perfect(); this.trauma.add(CONFIG.feel.trauma.heavy);
        this.perfectT = 0;
        const R = this.L.board;
        v.fx.ring(R.x + R.w / 2, R.y + R.h / 2, R.h * 0.6, 1.2, false, 4);
      }
      this.hooks.onResolved?.(e.anyFive);
      if (!e.anyFive) this.hooks.onResolvedNoFive?.();
    });
    g.on('score', () => { this.score.target = g.score; this.scorePulse = 1.08; });
    g.on('levelUp', e => {
      v.onLevelUp(); audio.levelUp(); audio.level = e.level;
      this.levelFlip = 0;
      if (e.level === CONFIG.crystal.fromLevel && CONFIG.crystal.enabled) { /* 提示在第一次出现冰晶子时 */ }
    });
    g.on('garbageWarn', e => {
      audio.garbageWarn();
      this.garbageWarnT = 1;
      // 只在本局第一次预警时弹出说明，之后靠信息栏的「↑ n」和底边光带提示，避免高等级时刷屏
      if (!this.garbageToastShown) { this.garbageToastShown = true; this.showToast(`↑ ${e.remaining}`, '杂色行即将涌入', 1.2, 2, 18); }
      this.hint('garbage', '底部将涌入杂色行，填满空位可以消掉');
    });
    g.on('garbage', () => { v.onGarbage(); audio.garbagePush(); this.trauma.add(0.12); this.garbageWarnT = 0; });
    g.on('danger', e => {
      v.dangerTarget = e.on ? 1 : 0;
      audio.setDanger(e.on);
      if (e.on) this.hint('danger', '快到顶了！');
    });
    g.on('gameOver', () => {
      this.overTimer = 0;
      this.slowmo = 0.6;
      v.overT = 0;
      audio.gameOver();
      audio.setDanger(false);
      this.trauma.add(CONFIG.feel.trauma.heavy);
      this.vibrate([30, 60, 40]);
    });
    g.on('spawn', e => {
      if (e.piece.colors.includes(3)) this.hint('crystal', '冰晶子：当黑当白都算');
    });
    v.onFallSound = i => audio.fall(i);
  }
  onSpawnHook: (() => void) | null = null;
  private holdFly: Piece | null = null;
  private holdFlyT = 1;
  private holdFrom = { x: 0, y: 0 };
  private perfectT = 9;
  private edgeFlash = 0;

  // ---------- 输入 ----------
  dragStart(): void { const p = this.game.active; this.dragStartX = p ? p.x : 0; this.softDone = 0; this.dragBlocked = 0; }
  dragX(dx: number): void {
    const g = this.game, p = g.active;
    if (!p || g.phase !== 'play') return;
    const sens = CONFIG.input.dragSensitivity[this.settings.sensitivity];
    const target = this.dragStartX + Math.round(dx / (this.L.board.cell * sens));
    let guard = 12;
    while (p.x !== target && guard-- > 0) {
      const d = target > p.x ? 1 : -1;
      if (!g.move(d)) {
        if (this.dragBlocked !== d) { this.view.onBump(d); audio.bump(); this.dragBlocked = d; }
        break;
      }
      this.dragBlocked = 0;
    }
  }
  dragDown(dy: number): void {
    const rows = Math.floor(dy / (this.L.board.cell * CONFIG.input.softDragPerRow));
    if (rows > this.softDone) { this.game.softDropRows(rows - this.softDone); this.softDone = rows; }
  }
  move(d: number): void { if (!this.game.move(d)) { this.view.onBump(d); audio.bump(); } }
  rotate(d: 1 | -1): void { this.game.rotate(d); }
  invert(): void { this.game.invert(); }
  hold(): void { this.game.hold(); }
  hardDrop(): void { this.game.hardDrop(); }
  softDrop(on: boolean): void { this.game.softDrop = on; }

  // ---------- 更新 ----------
  update(dtReal: number): void {
    let dt = dtReal;
    if (this.slowmo > 0) { this.slowmo -= dtReal; dt *= 0.3; }
    this.trauma.enabled = !this.settings.reduceMotion;
    this.view.fx.density = this.settings.reduceMotion ? 0.5 : 1;
    this.view.ghostOn = this.settings.ghost;
    this.view.previewOn = this.settings.preview;
    this.trauma.update(dtReal);
    const sc = this.score.value;
    this.score.update(dtReal);
    void sc;
    this.scorePulse += (1 - this.scorePulse) * (1 - Math.exp(-dtReal / 0.08));
    if (this.hitstop > 0) { this.hitstop -= dtReal; return; }
    this.game.update(dt);
    this.view.update(dt, this.game);
    if (this.view.checkNewPreview(this.game)) audio.previewDing();
    if (this.toast) { this.toast.t += dtReal; if (this.toast.t > this.toast.ttl) { this.toastPrev = this.toast; this.toast = null; this.toastSwap = 0; } }
    this.toastSwap = Math.min(1, this.toastSwap + dtReal / 0.12);
    this.comboT = Math.min(1, this.comboT + dtReal / 0.3);
    this.holdFailT = Math.min(1, this.holdFailT + dtReal / 0.15);
    this.holdFlashT = Math.min(1, this.holdFlashT + dtReal / 0.22);
    this.levelFlip = Math.min(1, this.levelFlip + dtReal / 0.4);
    this.holdFlyT = Math.min(1, this.holdFlyT + dtReal / 0.22);
    this.perfectT += dtReal;
    this.edgeFlash = Math.max(0, this.edgeFlash - dtReal / 0.5);
    if (this.levelFlip >= 0.5) this.shownLevel = this.game.level;
    const rem = this.game.garbageRemaining();
    this.view.garbageWarn += ((rem >= 0 && rem <= CONFIG.garbage.warnPieces ? 1 : 0) - this.view.garbageWarn) * (1 - Math.exp(-dtReal / 0.2));
    if (this.game.phase !== 'over' && !this.tutorial) {
      if (!this.holdEverUsed) { this.holdUnusedT += dt; if (this.holdUnusedT > 40) this.hint('hold', '上甩或点「暂存」可以留着这块'); }
    }
    if (this.game.danger && this.game.phase !== 'over') {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) { this.heartbeatT = 0.9; if (!audio.musicOn) audio.heartbeat(); }
    }
    if (this.overTimer >= 0) {
      this.overTimer += dtReal;
      if (this.overTimer > 1.6 && !this.overFired) { this.overFired = true; this.hooks.onGameOver(this.game); }
    }
    void this.garbageWarnT;
  }

  // ---------- 绘制 ----------
  draw(ctx: CanvasRenderingContext2D): void {
    const L = this.L;
    ctx.save();
    ctx.translate(this.trauma.x, this.trauma.y);
    ctx.translate(195, L.board.y + L.board.h / 2);
    ctx.rotate(this.trauma.rot);
    ctx.translate(-195, -(L.board.y + L.board.h / 2));
    this.view.draw(ctx, this.game);
    this.view.fx.drawFloats(ctx);
    ctx.restore();
    // 危险暗角
    if (this.view.danger > 0.01) {
      const gr = ctx.createRadialGradient(195, L.H / 2, L.H * 0.3, 195, L.H / 2, L.H * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, `rgba(0,0,0,${0.3 * this.view.danger})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 390, L.H);
    }
    // 连锁 ≥ 3：屏幕边缘冷光
    if (this.edgeFlash > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(127,219,255,${0.5 * this.edgeFlash})`;
      ctx.lineWidth = 10;
      ctx.shadowColor = 'rgba(127,219,255,0.9)'; ctx.shadowBlur = 30;
      ctx.strokeRect(-4, -4, 398, L.H + 8);
      ctx.restore();
    }
    // 清盘字样
    if (this.perfectT < 1.6) {
      const a = Math.min(1, this.perfectT / 0.3) * Math.min(1, (1.6 - this.perfectT) / 0.4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = fNum(300, 40);
      ctx.fillStyle = C.accentCore;
      ctx.shadowColor = 'rgba(127,219,255,0.8)'; ctx.shadowBlur = 24;
      ctx.fillText('PERFECT', 195, L.board.y + L.board.h * 0.42 - this.perfectT * 10);
      ctx.restore();
    }
    this.drawHud(ctx);
    this.drawBar(ctx);
    // 暂存飞入
    if (this.holdFly && this.holdFlyT < 1) {
      const t = easeInOutCubic(this.holdFlyT);
      const x1 = 52, y1 = L.topY + 95;
      const cx = (this.holdFrom.x + x1) / 2 - 40, cy = Math.min(this.holdFrom.y, y1) - 60;
      const u = 1 - t;
      const x = u * u * this.holdFrom.x + 2 * u * t * cx + t * t * x1;
      const y = u * u * this.holdFrom.y + 2 * u * t * cy + t * t * y1;
      ctx.globalAlpha = 1 - t * 0.3;
      this.mini(ctx, this.holdFly, x, y, 38 + (13 - 38) * t);
      ctx.globalAlpha = 1;
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const L = this.L, g = this.game, ty = L.topY;
    // 暂停按钮
    const pp = this.ui.pressAmount('btn.pause');
    this.ui.add({ id: 'btn.pause', x: 16, y: ty + 8, w: 44, h: 44, enabled: g.phase !== 'over', onPress: () => this.hooks.onPause() });
    ctx.save();
    ctx.translate(38, ty + 30);
    ctx.scale(1 - 0.08 * pp, 1 - 0.08 * pp);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.text1;
    ctx.fillRect(-6, -7, 4, 14); ctx.fillRect(2, -7, 4, 14);
    ctx.restore();
    // 分数
    // 弹簧只用于动感，显示值不超过真实分数
    const val = Math.min(g.score, Math.max(0, Math.round(this.score.value)));
    ctx.save();
    ctx.translate(195, ty + 30);
    ctx.scale(this.scorePulse, this.scorePulse);
    drawDigits(ctx, val.toLocaleString('en-US'), 0, 2, 32, 300, C.text1, 'center');
    ctx.restore();
    ctx.font = fNum(600, 10);
    ctx.fillStyle = C.text3;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('S C O R E', 195, ty + 56);
    // 最高分（引导时让位给「跳过」）
    if (!this.tutorial) {
    ctx.textAlign = 'right';
    ctx.font = fNum(600, 10);
    ctx.fillStyle = C.text3;
    ctx.fillText('BEST', 374, ty + 22);
    ctx.font = fNum(600, 14);
    ctx.fillStyle = val > this.best && this.best > 0 ? C.accent : C.text2;
    ctx.fillText(Math.max(this.best, val).toLocaleString('en-US'), 374, ty + 40);
    }
    // 连击
    if (this.comboShow >= 2) {
      const s = this.comboT < 1 ? easeOutBack(this.comboT) : 1;
      ctx.save();
      ctx.translate(374, ty + 54);
      ctx.scale(s, s);
      ctx.font = fCn(600, 11);
      ctx.fillStyle = C.accent;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`连击 ${this.comboShow}`, 0, 0);
      ctx.restore();
    }
    if (this.hideTopInfo) return;
    const iy = ty + 60;
    // HOLD
    const hf = this.holdFailT < 1 ? Math.sin(this.holdFailT * Math.PI * 4) * 3 * (1 - this.holdFailT) : 0;
    this.box(ctx, 16 + hf, iy, 72, 60, 'HOLD', this.holdFlashT < 1 ? 1 - this.holdFlashT : 0);
    if (g.holdPiece && this.holdFlyT >= 1) {
      ctx.globalAlpha = g.holdUsed ? 0.4 : 1;
      this.mini(ctx, g.holdPiece, 52 + hf, iy + 35 + Math.sin(this.view.time * 1.6) * 1, 13);
      ctx.globalAlpha = 1;
    }
    // 信息栏
    this.drawInfo(ctx, 96, iy, 116, 60);
    // NEXT
    this.box(ctx, 220, iy, 72, 60, 'NEXT', 0);
    if (g.queue[0]) this.mini(ctx, g.queue[0], 256, iy + 35 + Math.sin(this.view.time * 1.6 + 1) * 1, 13);
    for (let i = 1; i < 3; i++) {
      const by = iy + (i - 1) * 32;
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      roundRect(ctx, 300, by, 74, 28, 8); ctx.fill();
      if (g.queue[i]) { ctx.globalAlpha = i === 1 ? 0.8 : 0.6; this.mini(ctx, g.queue[i], 337, by + 14, 9); ctx.globalAlpha = 1; }
    }
  }

  private box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, flash: number): void {
    ctx.fillStyle = 'rgba(54,66,79,0.55)';
    roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = flash > 0 ? `rgba(127,219,255,${0.3 + 0.6 * flash})` : C.panelLine;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10); ctx.stroke();
    ctx.font = fNum(600, 9);
    ctx.fillStyle = C.text3;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label.split('').join(' '), x + 8, y + 13);
  }

  mini(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, cell: number): void {
    const def = SHAPES[p.shape];
    let minX = 9, maxX = -1, minY = 9, maxY = -1;
    for (const [x, y] of def.cells) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const w = (maxX - minX + 1) * cell, h = (maxY - minY + 1) * cell;
    def.cells.forEach(([x, y], i) => {
      const px = cx - w / 2 + (x - minX) * cell + cell / 2, py = cy - h / 2 + (y - minY) * cell + cell / 2;
      this.view.art.draw(ctx, kindOf(p.colors[i]), px, py, cell * 0.92);
    });
  }

  private drawInfo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const g = this.game;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const sw = easeOutCubic(this.toastSwap);
    const showToast = (t: Toast, a: number, dy: number) => {
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const isCn = /[一-鿿]/.test(t.text);
      ctx.font = isCn ? fCn(600, Math.min(t.size, t.text.length > 7 ? 12 : t.size)) : fNum(600, t.size);
      ctx.fillStyle = t.prio >= 3 ? C.accentCore : C.text1;
      if (t.text.length > 9 && isCn) {
        // 两行
        const mid = Math.ceil(t.text.length / 2);
        const cut = t.text.indexOf('，') > 0 ? t.text.indexOf('，') + 1 : kinsokuCut(t.text, mid);
        ctx.font = fCn(600, 12);
        ctx.fillText(t.text.slice(0, cut), x + w / 2, y + h / 2 - 9 + dy);
        ctx.fillText(t.text.slice(cut), x + w / 2, y + h / 2 + 9 + dy);
      } else {
        ctx.fillText(t.text, x + w / 2, y + h / 2 - (t.sub ? 8 : 0) + dy);
        if (t.sub) {
          ctx.font = fCn(600, 11);
          ctx.fillStyle = C.accent;
          ctx.fillText(t.sub, x + w / 2, y + h / 2 + 13 + dy);
        }
      }
      ctx.globalAlpha = 1;
    };
    if (this.toast) {
      if (this.toastPrev && sw < 1) showToast(this.toastPrev, 1 - sw, -20 * sw);
      showToast(this.toast, sw * clamp((this.toast.ttl - this.toast.t) / 0.2, 0, 1), 20 * (1 - sw));
    } else {
      if (this.toastPrev && sw < 1) showToast(this.toastPrev, 1 - sw, -20 * sw);
      const a = sw;
      ctx.globalAlpha = a;
      // LV + 进度
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = fNum(600, 10);
      ctx.fillStyle = C.text3;
      ctx.fillText('L V', x + 4, y + 16);
      const flip = this.levelFlip < 1 ? Math.abs(Math.cos(this.levelFlip * Math.PI)) : 1;
      ctx.save();
      ctx.translate(x + 30, y + 30);
      ctx.scale(1, flip);
      drawDigits(ctx, String(this.shownLevel).padStart(2, '0'), 0, 0, 24, 300, C.text1, 'left');
      ctx.restore();
      const sec = CONFIG.level.secondsPerLevel;
      const maxed = g.level >= CONFIG.level.max;
      const prog = maxed ? 1 : (g.time % sec) / sec;
      const remain = maxed ? 0 : sec - (g.time % sec);
      ctx.font = fNum(600, 11);
      ctx.fillStyle = C.text2;
      ctx.textAlign = 'right';
      ctx.fillText(maxed ? 'MAX' : `0:${String(Math.floor(remain)).padStart(2, '0')}`, x + w - 4, y + 38);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, x + 4, y + 46, w - 8, 4, 2); ctx.fill();
      ctx.fillStyle = C.accent;
      roundRect(ctx, x + 4, y + 46, Math.max(4, (w - 8) * prog), 4, 2); ctx.fill();
      // 垃圾倒数
      const rem = g.garbageRemaining();
      const iv = garbageInterval(g.level, this.cfg);
      if (iv && rem >= 0 && rem <= CONFIG.garbage.warnPieces) {
        ctx.font = fNum(600, 11);
        ctx.fillStyle = C.accent;
        ctx.textAlign = 'right';
        ctx.fillText(`↑ ${rem}`, x + w - 4, y + 18);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawBar(ctx: CanvasRenderingContext2D): void {
    const L = this.L, g = this.game;
    const cy = 750 + L.barShift;
    const items = this.barItems;
    const live = g.phase === 'play' || g.phase === 'resolving' || g.phase === 'are';
    for (const it of items) {
      const enabled = live && (it.id !== 'btn.hold' || !g.holdUsed);
      this.ui.add({ id: it.id, x: it.x - it.r, y: cy - it.r, w: it.r * 2, h: it.r * 2, enabled: live, onPress: it.act, circle: true });
      const p = this.ui.pressAmount(it.id);
      const hl = this.highlight === it.id ? 0.5 + 0.5 * Math.sin(this.view.time * 6) : 0;
      ctx.save();
      ctx.translate(it.x, cy);
      ctx.scale(1 - 0.06 * p, 1 - 0.06 * p);
      if (hl > 0) {
        ctx.fillStyle = `rgba(127,219,255,${0.18 * hl})`;
        ctx.beginPath(); ctx.arc(0, 0, it.r + 8 + hl * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = p > 0 ? 'rgba(127,219,255,0.22)' : it.primary ? 'rgba(127,219,255,0.08)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = it.primary ? 'rgba(127,219,255,0.7)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = it.primary ? 1.5 : 1;
      ctx.beginPath(); ctx.arc(0, 0, it.r - 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = enabled ? 1 : 0.35;
      ctx.strokeStyle = C.text1; ctx.fillStyle = C.text1;
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      it.icon(ctx);
      ctx.restore();
      ctx.globalAlpha = enabled ? 1 : 0.4;
      ctx.font = fCn(500, 11);
      ctx.fillStyle = C.text2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(it.label, it.x, cy + it.r + 15);
      ctx.globalAlpha = 1;
    }
  }

  private barItems: { id: string; x: number; r: number; label: string; icon: (c: CanvasRenderingContext2D) => void; act: () => void; primary?: boolean }[] = [
    { id: 'btn.hold', x: 43, r: 30, label: '暂存', icon: iconHold, act: () => this.hold() },
    { id: 'btn.ccw', x: 119, r: 30, label: '逆转', icon: c => iconRot(c, -1), act: () => this.rotate(-1) },
    { id: 'btn.invert', x: 195, r: 36, label: '翻色', icon: iconInvert, act: () => this.invert(), primary: true },
    { id: 'btn.cw', x: 271, r: 30, label: '顺转', icon: c => iconRot(c, 1), act: () => this.rotate(1) },
    { id: 'btn.drop', x: 347, r: 30, label: '硬降', icon: iconDrop, act: () => this.hardDrop() },
  ];

  zone(x: number, y: number): boolean {
    const L = this.L;
    return y >= 124 + L.boardShift && y <= 708 + L.barShift && x >= 0 && x <= 390;
  }
}

/** 固定字宽绘制数字（Canvas 不支持 tnum） */
export function drawDigits(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: 300 | 600, color: string, align: 'left' | 'center' | 'right'): void {
  ctx.font = fNum(weight, size);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const dw = size * 0.6, cw = size * 0.28;
  let w = 0;
  for (const ch of s) w += ch === ',' || ch === '.' ? cw : dw;
  let cx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  for (const ch of s) {
    const a = ch === ',' || ch === '.' ? cw : dw;
    ctx.fillText(ch, cx + a / 2, y);
    cx += a;
  }
}

function iconHold(c: CanvasRenderingContext2D): void {
  c.beginPath(); c.roundRect(-9, -7, 18, 14, 3); c.stroke();
  c.beginPath(); c.moveTo(0, -12); c.lineTo(0, -2); c.moveTo(-4, -6); c.lineTo(0, -2); c.lineTo(4, -6); c.stroke();
}
/** 旋转图标：dir=1 顺时针 ↻，dir=-1 逆时针 ↺。弧线缺口在顶部，箭头画在弧线终点、沿切线方向 */
function iconRot(c: CanvasRenderingContext2D, dir: number): void {
  const r = 9, cy = 1, gap = 0.62, span = Math.PI * 2 - gap * 2 + 0.25;
  const a0 = -Math.PI / 2 + gap * dir;
  const a1 = a0 + span * dir;
  c.beginPath();
  c.arc(0, cy, r, a0, a1, dir < 0);
  c.stroke();
  // 终点与切线方向（画布 y 向下，角度增加 = 顺时针）
  const ex = Math.cos(a1) * r, ey = cy + Math.sin(a1) * r;
  const tx = -Math.sin(a1) * dir, ty = Math.cos(a1) * dir;
  const L = 6.5, w = 0.62;
  const bx = ex + tx * 2, by = ey + ty * 2;
  c.beginPath();
  c.moveTo(bx + tx * 2, by + ty * 2);
  for (const s of [w, -w]) {
    const cs = Math.cos(Math.PI - s), sn = Math.sin(Math.PI - s);
    c.lineTo(bx + (tx * cs - ty * sn) * L, by + (tx * sn + ty * cs) * L);
  }
  c.closePath();
  c.fill();
}
function iconInvert(c: CanvasRenderingContext2D): void {
  c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, 12, -Math.PI / 2, Math.PI / 2); c.closePath(); c.fill();
  c.fillStyle = '#1B232B';
  c.beginPath(); c.arc(0, -6, 6, Math.PI / 2, -Math.PI / 2); c.fill();
  c.fillStyle = '#ECF1F5';
  c.beginPath(); c.arc(0, 6, 6, -Math.PI / 2, Math.PI / 2); c.fill();
}
function iconDrop(c: CanvasRenderingContext2D): void {
  c.beginPath(); c.moveTo(0, -11); c.lineTo(0, 5); c.moveTo(-6, -1); c.lineTo(0, 5); c.lineTo(6, -1); c.stroke();
  c.beginPath(); c.moveTo(-9, 10); c.lineTo(9, 10); c.stroke();
}
