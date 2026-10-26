// 覆盖层：暂停、设置、规则速览、敌人抽屉、详情卡、确认框、路线条
import { applyVolumes } from '../audio/audio.ts';
import { setMusic, musicMode } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { BATTLE, ENEMIES, ITEMS, RARITY_NAMES, ROUNDS, TAG_NAMES } from '../config.ts';
import { saveSettings, settings } from '../core/storage.ts';
import { ease } from '../core/tween.ts';
import { enemyBag } from '../game/enemies.ts';
import { shapeOf } from '../game/shapes.ts';
import type { Derived, EnemyDef, ItemId, Lv, Placed } from '../game/types.ts';
import { C, RARITY_COLOR, TAG_COLOR, drawGoldCoin } from '../render/kit.ts';
import type { Rect } from '../render/layout.ts';
import { drawEnemyBadge } from '../render/portraits.ts';
import { drawItem } from '../render/sprites.ts';
import { HAND, measure, text, wrap } from '../render/text.ts';
import { rgba } from '../render/textures.ts';
import { Button, Toggle, drawPanel, titleText, type UiEl } from '../render/ui/widgets.ts';
import { drawEnemyBag } from '../render/views/bagView.ts';
import { describe, nextLevel } from './describe.ts';

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export abstract class Panel {
  /** 类型名（调试接口用；打包后类名会被压缩） */
  abstract readonly kind: string;
  t = 0;
  closing = false;
  buttons: Button[] = [];
  pressed: Button | null = null;
  /** 点面板外是否关闭 */
  outsideCloses = true;
  dim = 0.6;
  /** 面板矩形（用于点外判断） */
  abstract rect(): Rect;
  abstract drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void;
  onClose: (() => void) | null = null;
  done = false;

  update(dt: number): void {
    if (this.closing) {
      this.t -= dt / 0.18;
      if (this.t <= 0) {
        this.t = 0;
        this.done = true;
      }
    } else this.t = Math.min(1, this.t + dt / 0.32);
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.onClose?.();
  }

  /** 返回 true 表示消费 */
  down(x: number, y: number): void {
    for (const b of this.buttons) {
      if (b.enabled && b.hit(x, y)) {
        b.down();
        this.pressed = b;
        sfx('click');
        return;
      }
    }
  }

  up(x: number, y: number, tap: boolean, real: number): void {
    const b = this.pressed;
    this.pressed = null;
    if (b) {
      b.release();
      if (b.hit(x, y, 10)) this.activate(b, real);
      return;
    }
    if (tap && this.outsideCloses) {
      const r = this.rect();
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) {
        sfx('page');
        this.close();
        return;
      }
    }
    if (tap) this.tapInside(x, y);
  }

  cancel(): void {
    if (this.pressed) this.pressed.release();
    this.pressed = null;
  }

  tapInside(_x: number, _y: number): void {}
  activate(_b: Button, _real: number): void {}
  key(code: string): void {
    if (code === 'Escape') this.close();
  }

  /** 二次确认：第一次点只变字，3 秒内再点才执行 */
  confirm(b: Button, real: number): boolean {
    if (b.confirmUntil > real) {
      b.confirmUntil = 0;
      return true;
    }
    b.confirmUntil = real + 3;
    return false;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, real: number): void {
    const k = this.closing ? ease.inQuad(this.t) : this.t;
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(22,11,5,${this.dim * Math.min(1, k * 1.4)})`;
      ctx.fillRect(-400, -400, W + 800, H + 800);
    }
    const r = this.rect();
    const s = this.closing ? 0.9 + 0.1 * k : 0.9 + 0.1 * ease.outBack(k);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 1.6);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2 - (1 - k) * 40);
    ctx.scale(s, s);
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    this.drawBody(ctx, time, real);
    ctx.restore();
  }

  els(): UiEl[] {
    return this.buttons.filter((b) => b.visible).map((b) => b.el());
  }
}

// ---------- 暂停 ----------

export class PausePanel extends Panel {
  readonly kind = 'PausePanel';
  oy: number;
  resume: Button;
  settingsB: Button;
  restart: Button;
  title: Button;
  private act: { resume: () => void; settings: () => void; restart: () => void; title: () => void };
  constructor(H: number, act: { resume: () => void; settings: () => void; restart: () => void; title: () => void }) {
    super();
    this.act = act;
    this.oy = (H - 844) / 2;
    this.outsideCloses = false;
    const y0 = 220 + this.oy;
    this.resume = new Button('pause.resume', R(75, y0 + 92, 240, 52), '继续', 'paper', 11);
    this.settingsB = new Button('pause.settings', R(75, y0 + 156, 240, 52), '设置', 'paper', 12);
    this.restart = new Button('pause.restart', R(75, y0 + 220, 240, 52), '重新开始', 'paper', 13);
    this.title = new Button('pause.title', R(75, y0 + 284, 240, 52), '返回标题', 'paper', 14);
    this.resume.tint = '#e8efd8';
    this.buttons = [this.resume, this.settingsB, this.restart, this.title];
  }
  rect(): Rect {
    return R(45, 220 + this.oy, 300, 380);
  }
  drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    drawPanel(ctx, this.rect(), 21);
    titleText(ctx, '暂停', 195, 220 + this.oy + 50, 32);
    for (const b of this.buttons) b.draw(ctx, time, real);
  }
  activate(b: Button, real: number): void {
    if (b === this.resume) this.act.resume();
    else if (b === this.settingsB) this.act.settings();
    else if (b === this.restart) {
      if (this.confirm(b, real)) this.act.restart();
    } else if (b === this.title) {
      if (this.confirm(b, real)) this.act.title();
    }
  }
  key(code: string): void {
    if (code === 'Escape' || code === 'Space') this.act.resume();
  }
}

// ---------- 设置 ----------

export class SettingsPanel extends Panel {
  readonly kind = 'SettingsPanel';
  oy: number;
  toggles: Toggle[];
  speeds: Button[];
  tut: Button;
  closeB: Button;
  pressedT: Toggle | null = null;
  private onReplayTutorial: (() => void) | null;
  constructor(H: number, onReplayTutorial: (() => void) | null) {
    super();
    this.onReplayTutorial = onReplayTutorial;
    this.oy = (H - 844) / 2;
    const y0 = 150 + this.oy;
    this.toggles = [
      new Toggle('set.sfx', R(62, y0 + 86, 266, 40), '音效', settings.sfx),
      new Toggle('set.music', R(62, y0 + 134, 266, 40), '音乐', settings.music),
      new Toggle('set.vibrate', R(62, y0 + 182, 266, 40), '震动', settings.vibrate),
      new Toggle('set.shake', R(62, y0 + 230, 266, 40), '画面震动', settings.shake),
    ];
    this.speeds = BATTLE.speeds.map((s, i) => {
      const b = new Button('set.speed' + s, R(150 + i * 60, y0 + 290, 52, 38), s + '×', 'tag', 30 + i);
      b.fontSize = 18;
      return b;
    });
    this.tut = new Button('set.tutorial', R(75, y0 + 350, 240, 50), '重看教程', 'paper', 31);
    this.tut.visible = !!onReplayTutorial;
    this.closeB = new Button('set.close', R(312, y0 + 8, 40, 40), '', 'coin', 33);
    this.closeB.icon = 'close';
    this.buttons = [...this.speeds, this.tut, this.closeB];
  }
  rect(): Rect {
    return R(30, 150 + this.oy, 330, 540);
  }
  down(x: number, y: number): void {
    for (const t of this.toggles) {
      if (t.hit(x, y)) {
        this.pressedT = t;
        return;
      }
    }
    super.down(x, y);
  }
  up(x: number, y: number, tap: boolean, real: number): void {
    const t = this.pressedT;
    this.pressedT = null;
    if (t) {
      if (t.hit(x, y)) {
        t.set(!t.on);
        sfx('click');
        if (t.id === 'set.sfx') settings.sfx = t.on;
        if (t.id === 'set.music') settings.music = t.on;
        if (t.id === 'set.vibrate') settings.vibrate = t.on;
        if (t.id === 'set.shake') settings.shake = t.on;
        saveSettings();
        applyVolumes();
        if (t.id === 'set.music') setMusic(musicMode(), true);
      }
      return;
    }
    super.up(x, y, tap, real);
  }
  activate(b: Button): void {
    if (b === this.closeB) this.close();
    else if (b === this.tut) {
      this.close();
      this.onReplayTutorial?.();
    } else {
      const i = this.speeds.indexOf(b);
      if (i >= 0) {
        settings.speed = BATTLE.speeds[i];
        saveSettings();
      }
    }
  }
  drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const r = this.rect();
    drawPanel(ctx, r, 22);
    titleText(ctx, '设置', 195, r.y + 48, 30);
    for (const t of this.toggles) t.draw(ctx);
    text(ctx, '默认战斗速度', 62, r.y + 309, { size: 17, weight: 700, align: 'left' });
    for (let i = 0; i < this.speeds.length; i++) {
      const b = this.speeds[i];
      b.tint = settings.speed === BATTLE.speeds[i] ? '#f3d88a' : '';
      b.draw(ctx, time, real);
    }
    this.tut.draw(ctx, time, real);
    this.closeB.draw(ctx, time, real);
    text(ctx, '行囊对决 PACK BATTLE · v1.0', 195, r.y + r.h - 64, { size: 12, weight: 700, color: C.inkSoft });
    text(ctx, '全部美术与音效均为程序生成', 195, r.y + r.h - 44, { size: 12, weight: 700, color: C.inkSoft });
  }
  els(): UiEl[] {
    return [...this.toggles.map((t) => t.el()), ...super.els()];
  }
}

// ---------- 规则速览 ----------

const RULES = [
  '从摊位把装备拖进行囊，松手即买。',
  '相邻（共享一条边）的装备互相加成，发光连线就是加成。',
  '轻点装备旋转；同名同级的叠上去，合成升级。',
  '开战后自动战斗：冷却环转满一圈，装备就出手。',
  '输了失去 1 颗心，可以调整后再战同一个对手。',
  '击败第 10 轮的古龙即通关。',
];

export class RulesPanel extends Panel {
  readonly kind = 'RulesPanel';
  oy: number;
  closeB: Button;
  constructor(H: number) {
    super();
    this.oy = (H - 844) / 2;
    this.closeB = new Button('rules.close', R(312, 158 + this.oy, 40, 40), '', 'coin', 41);
    this.closeB.icon = 'close';
    this.buttons = [this.closeB];
  }
  rect(): Rect {
    return R(30, 150 + this.oy, 330, 520);
  }
  activate(): void {
    this.close();
  }
  drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const r = this.rect();
    drawPanel(ctx, r, 23);
    titleText(ctx, '规则速览', 195, r.y + 48, 28);
    let y = r.y + 96;
    RULES.forEach((s, i) => {
      ctx.fillStyle = C.wax;
      ctx.beginPath();
      ctx.arc(64, y + 1, 11, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(i + 1), 64, y + 2, { size: 15, family: HAND, color: '#fff3e0' });
      const lines = wrap(ctx, s, 240, 15, 700);
      lines.forEach((l, j) => text(ctx, l, 84, y + j * 22, { size: 15, weight: 700, align: 'left' }));
      y += Math.max(1, lines.length) * 22 + 22;
    });
    text(ctx, '拖拽中：第二根手指轻点 / R / 右键 / 滚轮 = 旋转', 195, r.y + r.h - 40, { size: 11, weight: 700, color: C.inkSoft });
    this.closeB.draw(ctx, time, real);
  }
}

// ---------- 确认框 ----------

export class ConfirmPanel extends Panel {
  readonly kind = 'ConfirmPanel';
  oy: number;
  ok: Button;
  no: Button;
  private msg: string;
  private onOk: () => void;
  constructor(H: number, msg: string, okLabel: string, onOk: () => void) {
    super();
    this.msg = msg;
    this.onOk = onOk;
    this.oy = (H - 844) / 2;
    this.ok = new Button('confirm.ok', R(70, 470 + this.oy, 120, 52), okLabel, 'paper', 51);
    this.ok.tint = '#f0d8c8';
    this.no = new Button('confirm.cancel', R(200, 470 + this.oy, 120, 52), '再想想', 'paper', 52);
    this.buttons = [this.ok, this.no];
  }
  rect(): Rect {
    return R(45, 320 + this.oy, 300, 230);
  }
  activate(b: Button): void {
    this.close();
    if (b === this.ok) this.onOk();
  }
  drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const r = this.rect();
    drawPanel(ctx, r, 24);
    const lines = wrap(ctx, this.msg, 240, 18, 800);
    lines.forEach((l, i) => text(ctx, l, 195, r.y + 60 + i * 28, { size: 18, weight: 800 }));
    for (const b of this.buttons) b.draw(ctx, time, real);
  }
}

// ---------- 路线条 ----------

export class RoutePanel extends Panel {
  readonly kind = 'RoutePanel';
  private round: number;
  private cleared: number;
  constructor(round: number, cleared: number) {
    super();
    this.round = round;
    this.cleared = cleared;
    this.dim = 0.25;
  }
  rect(): Rect {
    return R(16, 56, 358, 74);
  }
  tapInside(): void {
    this.close();
  }
  drawBody(ctx: CanvasRenderingContext2D): void {
    const r = this.rect();
    drawPanel(ctx, r, 25, 1, false);
    const x0 = r.x + 26;
    const dx = (r.w - 52) / (ROUNDS - 1);
    const y = r.y + 30;
    ctx.strokeStyle = rgba(C.ink, 0.6);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + dx * (ROUNDS - 1), y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < ROUNDS; i++) {
      const x = x0 + dx * i;
      const e = ENEMIES[i];
      const cur = i + 1 === this.round;
      const done = i + 1 <= this.cleared;
      ctx.fillStyle = cur ? C.wax : done ? C.ok : e.boss ? '#5a3a2a' : C.paperShade;
      ctx.beginPath();
      ctx.arc(x, y, cur ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, e.boss ? '☠' : String(i + 1), x, y + 1, { size: e.boss ? 11 : 12, family: e.boss ? undefined : HAND, color: cur || done || e.boss ? '#fff3e0' : C.ink });
      text(ctx, e.title.slice(0, 3), x, y + 25, { size: 9, weight: 700, color: cur ? C.wax : C.inkSoft });
    }
  }
}

// ---------- 敌人抽屉 ----------

export class DrawerPanel extends Panel {
  readonly kind = 'DrawerPanel';
  closeB: Button;
  sel: Placed | null = null;
  private bag: Placed[];
  private r: Rect;
  private e: EnemyDef;
  constructor(r: Rect, e: EnemyDef, round: number) {
    super();
    this.r = r;
    this.e = e;
    this.dim = 0.4;
    this.bag = enemyBag(round);
    this.closeB = new Button('drawer.close', R(r.x + r.w - 46, r.y + 6, 40, 40), '', 'coin', 61);
    this.closeB.icon = 'close';
    this.buttons = [this.closeB];
  }
  rect(): Rect {
    return this.r;
  }
  activate(): void {
    this.close();
  }
  private grid(): { x: number; y: number; cell: number } {
    const e = this.e;
    const cell = Math.min(40, Math.floor((this.r.w - 40) / e.cols), Math.floor((this.r.h - 170) / e.rows));
    return { x: this.r.x + (this.r.w - cell * e.cols) / 2, y: this.r.y + 70, cell };
  }
  tapInside(x: number, y: number): void {
    const g = this.grid();
    const cx = Math.floor((x - g.x) / g.cell);
    const cy = Math.floor((y - g.y) / g.cell);
    this.sel = null;
    for (const it of this.bag) {
      const s = shapeOf(it.id, it.rot);
      if (s.cells.some(([a, b]) => it.x + a === cx && it.y + b === cy)) {
        this.sel = it;
        sfx('page');
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, real: number): void {
    // 抽屉：从下往上滑出
    const k = this.closing ? ease.inQuad(this.t) : ease.outCubic(this.t);
    ctx.fillStyle = `rgba(22,11,5,${this.dim * k})`;
    ctx.fillRect(-400, -400, W + 800, H + 800);
    ctx.save();
    ctx.translate(0, (1 - k) * (H - this.r.y + 20));
    this.drawBody(ctx, time, real);
    ctx.restore();
  }
  drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const r = this.r;
    const e = this.e;
    drawPanel(ctx, r, 26);
    drawEnemyBadge(ctx, e.portrait, r.x + 36, r.y + 34, 22);
    text(ctx, `${e.title}「${e.name}」`, r.x + 66, r.y + 26, { size: 18, weight: 900, align: 'left' });
    text(ctx, `♥ ${e.hp}${e.boss ? ' · 首领' : ''}`, r.x + 66, r.y + 47, { size: 13, weight: 800, color: C.hp, align: 'left' });
    const g = this.grid();
    const frame = 12;
    drawEnemyBag(ctx, { x: g.x - frame, y: g.y - frame, w: e.cols * g.cell + frame * 2, h: e.rows * g.cell + frame * 2, gx: g.x, gy: g.y, cell: g.cell, frame }, e.frame, e.cols, e.rows);
    for (const it of this.bag) drawItem(ctx, it.id, it.lv, it.rot, g.x + it.x * g.cell, g.y + it.y * g.cell, g.cell);
    if (this.sel) {
      const s = shapeOf(this.sel.id, this.sel.rot);
      ctx.strokeStyle = C.goldLight;
      ctx.lineWidth = 2.5;
      for (const [a, b] of s.cells) ctx.strokeRect(g.x + (this.sel.x + a) * g.cell + 2, g.y + (this.sel.y + b) * g.cell + 2, g.cell - 4, g.cell - 4);
    }
    let y = g.y + e.rows * g.cell + 26;
    if (this.sel) {
      const d = describe(this.sel.id, this.sel.lv);
      text(ctx, ITEMS[this.sel.id].name + ' ' + '★'.repeat(this.sel.lv), r.x + 24, y, { size: 15, weight: 900, color: RARITY_COLOR[ITEMS[this.sel.id].rarity], align: 'left' });
      text(ctx, d.effect, r.x + 24, y + 22, { size: 13, weight: 700, align: 'left', maxW: r.w - 48 });
      y += 48;
    } else {
      for (const tr of e.traits) {
        const s = tr.kind === 'enrage' ? `半血狂暴：全部冷却速度 +${Math.round(tr.speed * 100)}%` : `龙怒：半血时喷吐 ${tr.trueDmg} 真实伤害，冷却速度 +${Math.round(tr.speed * 100)}%`;
        text(ctx, '◆ ' + s, r.x + 24, y, { size: 13, weight: 800, color: C.wax, align: 'left', maxW: r.w - 48 });
        y += 22;
      }
      text(ctx, '轻点装备查看效果', r.x + 24, y, { size: 12, weight: 700, color: C.inkSoft, align: 'left' });
      y += 24;
    }
    text(ctx, '“' + e.hint + '”', r.x + r.w / 2, Math.min(y + 8, r.y + r.h - 24), { size: 14, weight: 800, color: C.inkSoft, maxW: r.w - 40 });
    this.closeB.draw(ctx, time, real);
  }
}

// ---------- 详情卡 ----------

export interface DetailOpts {
  id: ItemId;
  lv: Lv;
  d: Derived | null;
  /** 来自商店：可购买 */
  shop?: { slot: number; price: number; canMerge: boolean; afford: boolean };
  sell?: number;
  peek: boolean;
  /** 弹出起点 */
  fx: number;
  fy: number;
  names?: Map<number, string>;
}

export class DetailPanel extends Panel {
  readonly kind = 'DetailPanel';
  buyB: Button | null = null;
  mergeB: Button | null = null;
  private r: Rect;
  o: DetailOpts;
  private onBuy: (slot: number, merge: boolean) => void;
  constructor(H: number, o: DetailOpts, onBuy: (slot: number, merge: boolean) => void) {
    super();
    this.o = o;
    this.onBuy = onBuy;
    this.dim = o.peek ? 0.25 : 0.45;
    const h = o.shop ? 300 : 250;
    const y = Math.max(70, Math.min(H - h - 30, o.fy - h - 30));
    this.r = R(40, y, 310, h);
    if (o.shop) {
      this.buyB = new Button('detail.buy', R(56, y + h - 66, o.shop.canMerge ? 132 : 278, 50), '购买', 'paper', 71);
      this.buyB.enabled = o.shop.afford;
      this.buttons.push(this.buyB);
      if (o.shop.canMerge) {
        this.mergeB = new Button('detail.merge', R(198, y + h - 66, 136, 50), '购买并合成', 'paper', 72);
        this.mergeB.tint = '#f3dfa0';
        this.mergeB.fontSize = 17;
        this.mergeB.enabled = o.shop.afford;
        this.buttons.push(this.mergeB);
      }
    }
  }
  rect(): Rect {
    return this.r;
  }
  activate(b: Button): void {
    if (!this.o.shop) return;
    this.close();
    this.onBuy(this.o.shop.slot, b === this.mergeB);
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, real: number): void {
    // 从装备位置弹出（scale 0.6→1，略超冲）
    const k = this.closing ? ease.inQuad(this.t) : this.t;
    ctx.fillStyle = `rgba(22,11,5,${this.dim * Math.min(1, k * 1.4)})`;
    ctx.fillRect(-400, -400, W + 800, H + 800);
    const r = this.r;
    const s = this.closing ? 0.6 + 0.4 * k : 0.6 + 0.4 * ease.outBack(k);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const px = this.o.fx + (cx - this.o.fx) * Math.min(1, k * 1.3);
    const py = this.o.fy + (cy - this.o.fy) * Math.min(1, k * 1.3);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 2);
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    this.drawBody(ctx, time, real);
    ctx.restore();
  }
  drawBody(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const r = this.r;
    const o = this.o;
    const def = ITEMS[o.id];
    drawPanel(ctx, r, 27);
    ctx.fillStyle = TAG_COLOR[def.tag];
    ctx.fillRect(r.x + 16, r.y + 18, 4, 40);
    text(ctx, def.name, r.x + 28, r.y + 30, { size: 22, weight: 900, color: RARITY_COLOR[def.rarity], align: 'left' });
    const nw = measure(ctx, def.name, 22, 900);
    text(ctx, '★'.repeat(o.lv) + '☆'.repeat(3 - o.lv), r.x + 36 + nw, r.y + 31, { size: 16, color: C.goldDark, align: 'left' });
    text(ctx, `${RARITY_NAMES[def.rarity]} · ${TAG_NAMES[def.tag]}`, r.x + 28, r.y + 54, { size: 12, weight: 700, color: C.inkSoft, align: 'left' });
    // 右上角装备
    const s = shapeOf(o.id, 0);
    const cell = Math.min(26, 70 / s.w, 70 / s.h);
    drawItem(ctx, o.id, o.lv, 0, r.x + r.w - 28 - s.w * cell, r.y + 20, cell);
    const d = describe(o.id, o.lv, o.d);
    let y = r.y + 90;
    const lines = wrap(ctx, d.effect, r.w - 44, 15, 800);
    for (const l of lines) {
      text(ctx, l, r.x + 22, y, { size: 15, weight: 800, align: 'left' });
      y += 21;
    }
    text(ctx, '相邻：' + d.adj, r.x + 22, y + 2, { size: 13, weight: 700, color: C.inkSoft, align: 'left', maxW: r.w - 44 });
    y += 26;
    if (o.d && o.d.sources.length) {
      const src = o.d.sources.slice(0, 3).map((x) => x.label).join('；');
      text(ctx, '加成：' + src, r.x + 22, y, { size: 12, weight: 700, color: C.ok, align: 'left', maxW: r.w - 44 });
      y += 22;
    }
    const nx = nextLevel(o.id, o.lv);
    if (nx) {
      text(ctx, '合成后：' + nx, r.x + 22, y, { size: 12, weight: 700, color: C.goldDark, align: 'left', maxW: r.w - 44 });
      y += 22;
    }
    if (o.sell !== undefined) {
      drawGoldCoin(ctx, r.x + 30, r.y + r.h - 28, 9);
      text(ctx, `出售可得 ${o.sell} 金`, r.x + 44, r.y + r.h - 27, { size: 14, weight: 800, color: C.inkSoft, align: 'left' });
    }
    if (o.shop) {
      drawGoldCoin(ctx, r.x + 30, r.y + r.h - 86, 9);
      text(ctx, `价格 ${o.shop.price} 金${o.shop.afford ? '' : '（金币不足）'}`, r.x + 44, r.y + r.h - 85, { size: 14, weight: 800, color: o.shop.afford ? C.inkSoft : C.bad, align: 'left' });
      for (const b of this.buttons) b.draw(ctx, time, real);
    }
    if (o.peek) text(ctx, '松手关闭', r.x + r.w - 20, r.y + r.h - 20, { size: 11, weight: 700, color: C.pencil, align: 'right' });
  }
}

/** 覆盖层栈 */
export class Overlays {
  stack: Panel[] = [];
  open(p: Panel): Panel {
    this.stack.push(p);
    sfx('page');
    return p;
  }
  get top(): Panel | null {
    for (let i = this.stack.length - 1; i >= 0; i--) if (!this.stack[i].closing) return this.stack[i];
    return null;
  }
  get active(): boolean {
    return this.top !== null;
  }
  has(ctor: abstract new (...a: never[]) => Panel): boolean {
    return this.stack.some((p) => p instanceof ctor && !p.closing);
  }
  closeAll(): void {
    for (const p of this.stack) p.close();
  }
  update(dt: number): void {
    for (const p of this.stack) p.update(dt);
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].done) this.stack.splice(i, 1);
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, real: number): void {
    for (const p of this.stack) p.draw(ctx, W, H, time, real);
  }
  els(): UiEl[] {
    const t = this.top;
    return t ? t.els() : [];
  }
}

