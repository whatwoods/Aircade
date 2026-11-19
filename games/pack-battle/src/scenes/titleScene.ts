// 标题页：桌面小场景——毛笔字羊皮纸标题、打开的行囊（格子里码好装备）、对面的古龙立牌，
// 装备每隔几秒向龙打出金色连击（命中闪白 + 后仰）；下面是开始按钮、最高分签、设置 / 规则
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
import { C, bagFrame, cached, drawPaper, rivet, type BagFrameOpts } from '../render/kit.ts';
import { drawStandee, warmPortrait } from '../render/portraits.ts';
import { drawItem, warmItem } from '../render/sprites.ts';
import { LW, stage } from '../render/stage.ts';
import { BRUSH, drawSprite, num, text, type Sprite } from '../render/text.ts';
import type { ItemId, Lv, Rot } from '../game/types.ts';
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
  /** 古龙立牌建好的真实时间；-1 = 还在建 */
  private dragonAt = -1;

  constructor() {
    this.start = new Button('btn.start', { x: 95, y: START_Y, w: 200, h: 70 }, '开始冒险', 'sealTag', 21);
    this.start.fontSize = 22;
    this.cont = new Button('btn.continue', { x: 95, y: CONT_Y, w: 200, h: 70 }, '继续冒险', 'sealTag', 24);
    this.cont.fontSize = 18;
    this.gear = new Button('btn.settings', { x: 24, y: 760, w: 44, h: 44 }, '', 'coin', 22);
    this.gear.icon = 'gear';
    this.help = new Button('btn.rules', { x: 322, y: 760, w: 44, h: 44 }, '', 'coin', 23);
    this.help.icon = 'help';
    for (let i = 0; i < 16; i++) {
      this.motes.push({
        x: 60 + ((i * 97) % 270), y: 200 + ((i * 131) % 400), vx: ((i % 5) - 2) * 3, vy: -4 - (i % 4) * 2, ph: i * 1.7, r: 2 + (i % 3),
      });
    }
    this.handler = this.makeHandler();
  }

  enter(): void {
    for (const it of PACK) warmItem(it.id, it.lv);
    this.best = loadBest();
    this.saved = loadRun();
    if (this.saved) {
      const r = this.saved;
      this.cont.label = r.phase === 'ending' ? '查看结算' : `继续 · 第${r.round}轮`;
      this.start = new Button('btn.start', { x: 125, y: NEW_Y, w: 140, h: 44 }, '新的冒险', 'paper', 21);
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
      this.cont.r = { x: 95, y: CONT_Y + oy, w: 200, h: 70 };
      this.start.r = { x: 125, y: NEW_Y + oy, w: 140, h: 44 };
    } else this.start.r = { x: 95, y: START_Y + oy, w: 200, h: 70 };
    this.gear.r = { x: 24, y: H - 84, w: 44, h: 44 };
    this.help.r = { x: 322, y: H - 84, w: 44, h: 44 };
  }

  private go(): void {
    sfx('click');
    const saved = this.saved;
    if (saved) {
      if (saved.phase === 'ending') gotoScene(() => factories.ending(endingData(saved)));
      else gotoScene(() => factories.game({ resume: saved }), 0.5, (CONT_Y + this.oy + 35) / stage.H);
      return;
    }
    this.pickMode((START_Y + this.oy + 35) / stage.H);
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
    this.pickMode((NEW_Y + this.oy + 22) / stage.H);
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
    // 立牌分几帧建好再淡入，避免进标题页那一帧卡顿；淡入按真实时间算，暂停（失焦）时也能出来
    if (this.dragonAt < 0 && warmPortrait(FOE)) this.dragonAt = clock.real;
    this.ov.update(raw);
    (this.saved ? this.cont : this.start).pulse = 0.035;
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.time * 0.7 + m.ph) * 4) * dt;
      m.y += m.vy * dt;
      if (m.y < 190 + this.oy) {
        m.y = 600 + this.oy;
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
    this.drawDiorama(ctx, t, oy);
    // 标题牌：缓慢摆动 ±0.6°
    ctx.save();
    ctx.translate(195, SIGN_Y + oy);
    ctx.rotate(Math.sin((t / 4) * Math.PI * 2) * 0.0105);
    drawSprite(ctx, signSprite(), -SIGN_W / 2, 0);
    ctx.restore();
    // 按钮
    if (this.saved) this.cont.draw(ctx, t, real);
    this.start.draw(ctx, t, real);
    if (this.best && this.best.score > 0) {
      const b = this.best;
      const s = `最高分 ${num(b.score)} · ${b.round > ROUNDS ? '无尽第 ' + b.round + ' 轮' : b.cleared ? '已通关' : '最远第 ' + b.round + ' 轮'}`;
      const by = this.saved ? NEW_Y + 54 : START_Y + 82;
      drawSprite(ctx, bestTag(), 105, by + oy);
      text(ctx, s, 195, by + 13 + oy, { size: 13, weight: 700, color: C.ink });
    }
    this.gear.draw(ctx, t, real);
    this.help.draw(ctx, t, real);
    this.ov.draw(ctx, LW, stage.H, t, real);
  }

  /** 桌面小场景：古龙立牌（后）→ 连击光线 → 行囊与装备（前）→ 命中火花 */
  private drawDiorama(ctx: CanvasRenderingContext2D, t: number, oy: number): void {
    const k = CELL / 54;
    const gx = BAG_X + 16 * k;
    const gy = BAG_Y + oy + 16 * k;
    // 一轮连击：u ∈ [0,1) 的时间轴，三道光依次出手
    const u = (t % STRIKE_T) / STRIKE_T;
    const hits = PACK.filter((it) => it.target).map((it, i) => {
      const t0 = 0.3 + i * 0.045;
      return { it, p: (u - t0) / 0.11 };
    });
    // 命中后的余震：最后一道光到达后 0.3 个周期内衰减
    const lastHit = 0.3 + (hits.length - 1) * 0.045 + 0.11;
    const after = u >= lastHit ? Math.max(0, 1 - (u - lastHit) / 0.22) : 0;
    const firstHit = 0.3 + 0.11;
    const shake = u >= firstHit && u < lastHit + 0.22 ? Math.max(after, u < lastHit ? 1 : 0) : 0;

    // 台灯暖光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.drawImage(glowOf('#ffb35a'), 195 - 230, 300 + oy - 230, 460, 460);
    ctx.restore();

    // 古龙立牌
    if (this.dragonAt >= 0) {
      const ease = 1 - Math.pow(1 - Math.min(1, (clock.real - this.dragonAt) / 0.4), 3);
      const lean = -0.07 * shake * Math.sin(Math.min(1, (u - firstHit) / 0.05) * Math.PI * 0.5) + Math.sin(t * 0.9) * 0.008;
      // 镜像：让龙面朝行囊；后仰方向随之取反
      ctx.save();
      ctx.translate(FOE_X, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = ease;
      drawStandee(ctx, FOE, 0, FOE_Y + oy + (1 - ease) * 18, FOE_SCALE, 1, -lean);
      if (shake > 0) {
        ctx.globalAlpha = ease * 0.28 * shake * shake;
        drawStandee(ctx, FOE, 0, FOE_Y + oy, FOE_SCALE, 1, -lean, 'white');
      }
      ctx.restore();
    }

    // 连线：常亮的细金线（正常混合 + 深色描边，压在浅色立牌上也看得见）+ 出手时的光弹
    ctx.save();
    ctx.lineCap = 'round';
    for (const h of hits) {
      const [sx, sy] = itemCenter(h.it, gx, gy);
      const [tx, ty] = [FOE_X + h.it.target![0], FOE_Y + oy + h.it.target![1]];
      const mx = (sx + tx) / 2;
      const my = Math.min(sy, ty) - 46;
      const idle = 0.16 + 0.06 * Math.sin(t * 2 + sx * 0.05);
      const live = h.p > 0 && h.p < 1.6 ? Math.max(0, 1 - Math.abs(h.p - 0.6)) : 0;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.strokeStyle = 'rgba(70,36,14,1)';
      ctx.globalAlpha = (idle + live * 0.4) * 1.4;
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.strokeStyle = C.gold;
      ctx.globalAlpha = Math.min(1, (idle + live * 0.6) * 2.6);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      ctx.lineDashOffset = -t * 40;
      ctx.stroke();
      ctx.setLineDash([]);
      if (h.p > 0 && h.p < 1) {
        ctx.globalCompositeOperation = 'lighter';
        // 光弹：沿二次曲线飞，带两段拖尾
        for (let j = 0; j < 3; j++) {
          const q = Math.max(0, h.p - j * 0.09);
          const x = (1 - q) * (1 - q) * sx + 2 * (1 - q) * q * mx + q * q * tx;
          const y = (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * my + q * q * ty;
          const r = 15 - j * 4;
          ctx.globalAlpha = 0.9 - j * 0.28;
          ctx.drawImage(glowOf('#ffe08a'), x - r, y - r, r * 2, r * 2);
        }
        // 光弹核心：正常混合的实心金点
        const q = h.p;
        const x = (1 - q) * (1 - q) * sx + 2 * (1 - q) * q * mx + q * q * tx;
        const y = (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * my + q * q * ty;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(70,36,14,1)';
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.goldLight;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 行囊 + 装备
    drawSprite(ctx, bagFrame(PACK_FRAME), BAG_X, BAG_Y + oy, k);
    const flash = hits.map((h) => (h.p > -0.4 && h.p < 0.2 ? 1 - Math.abs(h.p + 0.1) / 0.3 : 0));
    let fi = 0;
    for (const it of PACK) {
      const x = gx + it.x * CELL;
      const y = gy + it.y * CELL;
      drawItem(ctx, it.id, it.lv, it.rot, x, y, CELL);
      if (it.target) {
        const f = Math.max(0, flash[fi++]);
        if (f > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = f * 0.35;
          drawItem(ctx, it.id, it.lv, it.rot, x, y, CELL, 'white');
          ctx.restore();
        }
      }
    }

    // 命中火花
    ctx.save();
    ctx.lineCap = 'round';
    for (const h of hits) {
      if (h.p < 1 || h.p > 2.2) continue;
      const a = 1 - (h.p - 1) / 1.2;
      const [tx, ty] = [FOE_X + h.it.target![0], FOE_Y + oy + h.it.target![1]];
      const r = 18 + (1 - a) * 22;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.drawImage(glowOf('#fff3c4'), tx - r, ty - r, r * 2, r * 2);
      // 火花射线：正常混合的橙金色，浅色背景上也清楚
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#e8862a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const ang = j * 1.047 + h.it.x;
        const r0 = 6 + (1 - a) * 10;
        const r1 = r0 + 8 * a + 4;
        ctx.moveTo(tx + Math.cos(ang) * r0, ty + Math.sin(ang) * r0);
        ctx.lineTo(tx + Math.cos(ang) * r1, ty + Math.sin(ang) * r1);
      }
      ctx.stroke();
    }
    ctx.restore();
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

// ---------- 场景布置（逻辑坐标，竖屏 390×844 基准，整体随 oy 居中） ----------

const SIGN_W = 330;
const SIGN_H = 128;
const SIGN_Y = 48;
const START_Y = 636;
const CONT_Y = 624;
const NEW_Y = 702;
const CELL = 50;
const BAG_X = 26;
const BAG_Y = 420;
const FOE = 'dragon' as const;
const FOE_X = 270;
const FOE_Y = 486;
const FOE_SCALE = 1.16;
const STRIKE_T = 3.2;

const PACK_FRAME: BagFrameOpts = { cols: 4, rows: 3, cell: 54, frame: 16, style: 'leather', flap: true, straps: true, corners: 'brass' };

interface PackItem {
  id: ItemId;
  lv: Lv;
  rot: Rot;
  x: number;
  y: number;
  /** 打向立牌的落点（相对立牌底座中心） */
  target?: [number, number];
}

/** 4×3 码满：剑 | 盾 | 磨刀石 / 药水，手套横放在盾下 */
const PACK: PackItem[] = [
  { id: 'sword', lv: 2, rot: 0, x: 0, y: 0, target: [-6, -196] },
  { id: 'buckler', lv: 1, rot: 0, x: 1, y: 0, target: [10, -160] },
  { id: 'whetstone', lv: 1, rot: 0, x: 3, y: 0 },
  { id: 'potion', lv: 1, rot: 0, x: 3, y: 1 },
  { id: 'glove', lv: 1, rot: 1, x: 1, y: 2, target: [-4, -124] },
];

function itemCenter(it: PackItem, gx: number, gy: number): [number, number] {
  const w = it.rot % 2 === 1 ? 2 : 1;
  const sizes: Record<string, [number, number]> = { sword: [1, 3], buckler: [2, 2], whetstone: [1, 1], potion: [1, 2], glove: [w, 3 - w] };
  const [cw, ch] = sizes[it.id] ?? [1, 1];
  return [gx + (it.x + cw / 2) * CELL, gy + (it.y + ch / 2) * CELL];
}

// ---------- 静态精灵 ----------

/** 标题牌：撕边羊皮纸 + 两颗图钉 + 毛笔字「行囊对决」 */
function signSprite(): Sprite {
  return cached('title.sign', SIGN_W, SIGN_H, 16, (ctx, r) => {
    drawPaper(ctx, r, 0, 0, SIGN_W, SIGN_H, { seed: 41, burn: 0.9, r: 6 });
    rivet(ctx, 22, 20, 7);
    rivet(ctx, SIGN_W - 22, 20, 7);
    const s = '行囊对决';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 86px ${BRUSH}`;
    // 字距收紧一点：逐字放
    const gap = -4;
    const widths = [...s].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (s.length - 1);
    let x = SIGN_W / 2 - total / 2;
    const y = SIGN_H / 2 + 6;
    for (let i = 0; i < s.length; i++) {
      const cx = x + widths[i] / 2;
      // 墨晕：淡色偏移一层
      ctx.fillStyle = 'rgba(43,29,20,0.18)';
      ctx.fillText(s[i], cx + 1.5, y + 2);
      ctx.fillStyle = C.ink;
      ctx.fillText(s[i], cx, y);
      x += widths[i] + gap;
    }
    ctx.restore();
  });
}

function bestTag(): Sprite {
  return cached('title.best', 180, 26, 6, (ctx, r) => {
    drawPaper(ctx, r, 0, 0, 180, 26, { seed: 19, burn: 0.5, r: 3 });
  });
}
