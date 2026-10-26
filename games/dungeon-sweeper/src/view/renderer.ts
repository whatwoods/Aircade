import { clamp01, cubicOut, backOut } from '../core/ease';
import { flicker } from '../core/noise';
import { Channel } from '../core/tween';
import type { Clock } from '../core/clock';
import { N, cx, cy } from '../game/board';
import type { Game } from '../game/rules';
import { Kind } from '../game/types';
import type { BoardView } from './boardView';
import type { Camera } from './camera';
import type { DragonView } from './dragonView';
import { P, type Fx } from './fx';
import type { Mat, Sprite } from './gfx';
import { drawText, type Glyphs } from './glyphs';
import type { Hud } from './hud';
import type { Layout } from './layout';
import type { LightInput, Lighting } from './lighting';
import { PAL, numberTier } from './palette';
import type { Radial } from './radial';
import type { Textures } from './textures';

/** 全屏叠加效果的状态（director 写入，renderer 读取） */
export class Overlay {
  redT0 = -1e9;
  redA = 0;
  boostT0 = -1e9;
  whiteT0 = -1e9;
  deathT0 = -1;
  clearT0 = -1e9;
  readonly battleDim = new Channel(0);
  readonly dawn = new Channel(0);
  readonly brazier = new Channel(0);
  readonly boardAlpha = new Channel(1);
  readonly dragonAlpha = new Channel(1);
  readonly redVig = new Channel(0);
  /** 标题 → 游戏：墙面视差位移 0..1 */
  readonly dive = new Channel(0);
  bigText: Sprite | null = null;
  bigSub: Sprite | null = null;
  bigT0 = -1e9;
  xray = false;
  fog = true;
  lowHp = false;

  reset(): void {
    this.redT0 = -1e9;
    this.boostT0 = -1e9;
    this.whiteT0 = -1e9;
    this.deathT0 = -1;
    this.clearT0 = -1e9;
    this.battleDim.v = 0;
    this.dawn.v = 0;
    this.redVig.v = 0;
    this.bigText = null;
    this.bigSub = null;
  }
}

export interface RenderDeps {
  ctx: CanvasRenderingContext2D;
  tex: Textures;
  gl: Glyphs;
  lighting: Lighting;
  board: BoardView;
  dragon: DragonView;
  hud: Hud;
  fx: Fx;
  radial: Radial;
  cam: Camera;
  clock: Clock;
  ov: Overlay;
}

export interface Pointer {
  /** 格坐标；-1 = 无 */
  x: number;
  y: number;
  strength: number;
  radius: number;
}

/**
 * 每帧合成（文档 §4.4 分层顺序）：背景 → 棋盘层 → 光照 → 光后层 → 特效 → HUD → 覆盖层。
 */
export class Renderer {
  private d: RenderDeps;
  mode: 'title' | 'game' = 'title';
  calls = 0;
  private base: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private screen: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private li: LightInput;
  private dustT = 0;
  private eyeNext = 4000;
  private eyeT0 = -1e9;
  /** 标题 Logo 外发光强度（随烛火闪烁），供 DOM 使用 */
  titleGlow = 0.35;
  reduced = false;

  constructor(d: RenderDeps) {
    this.d = d;
    const z = new Float32Array(N);
    this.li = {
      cell: z,
      candle: z,
      potion: z,
      ext: z,
      candleCell: new Uint8Array(N),
      brazier: 0,
      ptrX: -1,
      ptrY: -1,
      ptrStrength: 0,
      ptrRadius: 1.1,
      lair: 0,
      lairRing: 0,
      boost: 1,
      dawn: 0,
      dim: 0,
      fog: true,
    };
  }

  draw(L: Layout, game: Game | null, ptr: Pointer): void {
    const { ctx, clock } = this.d;
    const d = L.dpr;
    this.calls = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    this.screen.a = d;
    this.screen.d = d;
    if (this.mode === 'title' || !game) {
      this.drawTitle(L, clock.real, clock.rdt);
      return;
    }
    this.drawGame(L, game, ptr);
  }

  // ------------------------------------------------------------------ 标题页
  private drawTitle(L: Layout, real: number, rdt: number): void {
    const { ctx, tex, fx, board } = this.d;
    const d = L.dpr;
    const W = L.colW;
    const H = L.vh;
    ctx.drawImage(tex.wall, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const tSec = real / 1000;
    // 体积光柱（左上，约 25°）
    this.drawShaft(ctx, W, H, tSec, 0.11);
    // 尘埃
    this.dustT += rdt;
    while (this.dustT > 140) {
      this.dustT -= 140;
      const u = Math.random();
      const sx = W * 0.05 + u * W * 0.5;
      const sy = H * 0.05 + u * H * 0.55 + (Math.random() - 0.5) * 80;
      fx.spawn(P.Dust, sx, sy, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6 - 2, 4000, 2.5, 2, 0, 0, 1, 0.7);
    }
    // 远处龙眼
    const ey = H * 0.5;
    if (real > this.eyeNext) {
      this.eyeT0 = real;
      this.eyeNext = real + 6000 + Math.random() * 3000;
    }
    const et = (real - this.eyeT0) / 1600;
    let open = 0;
    if (et >= 0 && et < 1) open = et < 0.2 ? et / 0.2 : et > 0.8 ? (1 - et) / 0.2 : 1;
    this.drawFarEyes(ctx, W / 2, ey, 7 * L.s, open, tSec);
    // 蜡烛（Logo 两侧）
    const ly = H * 0.29;
    const k = L.s * 2.1;
    const fl = (flicker(tSec * 1.3, 3) + flicker(tSec * 1.3, 11)) * 0.5;
    this.titleGlow = 0.3 + 0.12 * fl;
    for (const [x, seed] of [
      [W * (40 / 390), 3],
      [W * (350 / 390), 11],
    ] as [number, number][]) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + 0.06 * flicker(tSec, seed);
      const gs = 170 * L.s;
      ctx.drawImage(tex.flameGlow.c, x - gs / 2, ly - gs / 2 - 8 * k, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(tex.candleBase.c, x - 7 * k, ly - 6 * k, 14 * k, 18 * k);
      this.calls += board.drawFlame(ctx, this.screen, x - 0.5 * k, ly - 4.5 * k, k * 0.95, tSec, seed, 1);
    }
    // 粒子（屏幕空间）
    this.calls += fx.draw(ctx, 1, this.screen);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(tex.vignette, 0, 0, W * d, H * d);
    this.calls += 8;
  }

  private drawShaft(ctx: CanvasRenderingContext2D, W: number, H: number, tSec: number, a: number): void {
    const { tex } = this.d;
    const drift = Math.sin(tSec * 0.13) * 0.06;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * (0.8 + 0.2 * Math.sin(tSec * 0.4));
    ctx.translate(W * 0.18, -H * 0.05);
    ctx.rotate(-0.42 + drift);
    ctx.drawImage(tex.shaft.c, -W * 0.18, 0, W * 0.36, H * 1.15);
    ctx.setTransform(this.screen.a, 0, 0, this.screen.d, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawFarEyes(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, open: number, tSec: number): void {
    const { tex } = this.d;
    if (open <= 0.01) return;
    const gap = rx * 3.2;
    // 龙首轮廓光
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07 * open;
    ctx.drawImage(tex.flameGlow.c, x - rx * 14, y - rx * 7, rx * 28, rx * 16);
    for (const sx of [-1, 1]) {
      const ex = x + sx * gap;
      ctx.globalAlpha = 0.75 * open;
      ctx.drawImage(tex.flameGlow.c, ex - rx * 3, y - rx * 3, rx * 6, rx * 6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = open;
      ctx.fillStyle = PAL.dragonEye;
      ctx.beginPath();
      ctx.ellipse(ex, y, rx, Math.max(0.5, rx * 0.55 * open), sx * -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1A0A04';
      ctx.beginPath();
      ctx.ellipse(ex, y, rx * 0.16, Math.max(0.4, rx * 0.5 * open), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    void tSec;
  }

  // ------------------------------------------------------------------ 游戏
  private drawGame(L: Layout, game: Game, ptr: Pointer): void {
    const { ctx, tex, gl, lighting, board, dragon, hud, fx, radial, cam, clock, ov } = this.d;
    const d = L.dpr;
    const world = clock.world;
    const real = clock.real;
    const W = L.colW;
    const H = L.vh;
    // 1. 背景
    const ba = ov.boardAlpha.v;
    if (ba < 1) {
      const dy = -ov.dive.v * H * 0.12 * d;
      ctx.drawImage(tex.wall, 0, dy);
      ctx.drawImage(tex.wall, 0, dy + tex.wall.height - 1);
      ctx.globalAlpha = ba;
    }
    ctx.drawImage(tex.backdrop, 0, 0);
    ctx.globalAlpha = 1;
    this.calls += 2;
    // 震屏矩阵：以棋盘中心为轴
    const B = this.base;
    const pcx = L.board.x + L.board.w / 2;
    const pcy = L.board.y + L.board.h / 2;
    const c = Math.cos(cam.rot);
    const s = Math.sin(cam.rot);
    B.a = d * c;
    B.b = d * s;
    B.c = -d * s;
    B.d = d * c;
    B.e = d * (pcx + cam.x - c * pcx + s * pcy);
    B.f = d * (pcy + cam.y - s * pcx - c * pcy);
    if (ba > 0.01) {
      ctx.globalAlpha = ba;
      // 2. 棋盘层
      const da = ov.dragonAlpha.v * ba;
      dragon.drawBase(ctx, B, L, real, da);
      this.calls += board.drawTiles(ctx, B, L, world, real);
      ctx.globalAlpha = 1;
      // 3. 光照
      this.lightInput(game, ptr, real);
      lighting.render(this.li, real / 1000, clock.rdt / 1000);
      ctx.setTransform(B.a, B.b, B.c, B.d, B.e, B.f);
      if (ba < 1) ctx.globalAlpha = ba;
      lighting.composite(ctx, L, ov.fog);
      this.calls += 3;
      // 4. 光后层
      ctx.globalAlpha = 1;
      this.calls += board.drawPost(ctx, B, L, world, real, this.reduced);
      this.calls += dragon.drawGlow(ctx, B, L, real, da);
      if (ov.xray) this.drawXray(ctx, L, game);
      // 5. 屠龙压暗（除龙巢外）
      const bd = ov.battleDim.v;
      if (bd > 0.01) {
        ctx.setTransform(B.a, B.b, B.c, B.d, B.e, B.f);
        const r = dragon.lairRect(L);
        ctx.fillStyle = '#030406';
        ctx.globalAlpha = 0.6 * bd;
        ctx.beginPath();
        ctx.rect(-40, -40, W + 80, H + 80);
        ctx.rect(r.x + r.s, r.y, -r.s, r.s);
        ctx.fill('nonzero');
        ctx.globalAlpha = 1;
        this.calls++;
      }
      // 6. 剪影 / 战斗巨龙 / 棋盘空间特效
      this.calls += board.drawPops(ctx, B, L, world);
      this.calls += dragon.drawBattle(ctx, B, L, world);
      this.calls += fx.draw(ctx, 0, B);
      // 7. 引导 / 轮盘压暗
      this.calls += board.drawDim(ctx, B, L, real);
    }
    // 8. 体积光 + 暗角 + 红暗角
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.drawShaft(ctx, W, H, real / 1000, 0.06);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(tex.vignette, 0, 0, W * d, H * d);
    let red = ov.redVig.v;
    const rt = (real - ov.redT0) / 420;
    if (rt >= 0 && rt < 1) red = Math.max(red, ov.redA * (1 - rt));
    if (ov.lowHp) red = Math.max(red, 0.2 + 0.14 * Math.sin((real / 1100) * Math.PI * 2));
    if (red > 0.01) {
      ctx.globalAlpha = Math.min(1, red);
      ctx.drawImage(tex.redVignette, 0, 0, W * d, H * d);
      ctx.globalAlpha = 1;
    }
    this.calls += 3;
    // 9. HUD（不震）
    this.calls += hud.draw(ctx, L, real, world);
    // 10. 屏幕空间特效
    this.calls += fx.draw(ctx, 1, this.screen);
    // 肃清金色涟漪
    const ct = (real - ov.clearT0) / 1000;
    if (ct >= 0 && ct < 1) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * (1 - ct);
      const r = 40 + cubicOut(ct) * H * 0.9;
      ctx.drawImage(tex.ringGold.c, W / 2 - r, L.board.y + L.board.h / 2 - r, r * 2, r * 2);
      ctx.globalAlpha = 0.12 * (1 - ct);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this.calls += 2;
    }
    // 11. 死亡去饱和
    if (ov.deathT0 >= 0) {
      const k = clamp01((real - ov.deathT0) / 800);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W * d, H * d);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.28 * k;
      ctx.fillStyle = '#0A0406';
      ctx.fillRect(0, 0, W * d, H * d);
      ctx.globalAlpha = 1;
      this.calls += 2;
    }
    // 大字
    if (ov.bigText) {
      const t = clamp01((real - ov.bigT0) / 500);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = t;
      const sc = 1.25 - 0.25 * backOut(t);
      const y = L.board.y + L.board.h * 0.42;
      drawText(ctx, ov.bigText, W / 2, y, 0.5, d, sc);
      if (ov.bigSub) drawText(ctx, ov.bigSub, W / 2, y + 40 * L.s, 0.5, d);
      ctx.globalAlpha = 1;
      this.calls += 2;
    }
    // 闪白
    const wt = real - ov.whiteT0;
    if (wt >= 0 && wt < 90) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W * d, H * d);
      ctx.globalAlpha = 1;
      this.calls++;
    }
    // 12. 轮盘
    this.calls += radial.draw(ctx, L, real);
    void gl;
  }

  private lightInput(game: Game, ptr: Pointer, real: number): void {
    const { board, dragon, ov } = this.d;
    const li = this.li;
    li.cell = board.light;
    li.candle = board.candle;
    li.potion = board.potionGlow;
    li.ext = board.ext;
    li.candleCell = game.b.candle;
    li.brazier = ov.brazier.v;
    li.ptrX = ptr.x;
    li.ptrY = ptr.y;
    li.ptrStrength = ptr.strength;
    li.ptrRadius = ptr.radius;
    li.lair = dragon.lairLight(real) * ov.dragonAlpha.v * (1 - ov.dawn.v);
    li.lairRing = dragon.awake && !dragon.slain ? 0.25 + 0.3 * dragon.breath(real) : 0;
    const bt = real - ov.boostT0;
    li.boost = bt < 0 ? 1 : bt < 300 ? 1.6 : bt < 1000 ? 1.6 - 0.6 * cubicOut((bt - 300) / 700) : 1;
    li.dawn = ov.dawn.v;
    li.dim = ov.lowHp ? 1 : 0;
    li.fog = ov.fog;
  }

  private drawXray(ctx: CanvasRenderingContext2D, L: Layout, game: Game): void {
    const { gl } = this.d;
    ctx.setTransform(this.base.a, this.base.b, this.base.c, this.base.d, this.base.e, this.base.f);
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < N; i++) {
      if (game.revealed[i]) continue;
      const k = game.b.kind[i];
      if (k === Kind.Lair || k === Kind.Empty) continue;
      const x = L.board.x + cx(i) * L.cell + L.cell / 2;
      const y = L.board.y + cy(i) * L.cell + L.cell / 2;
      if (k === Kind.Monster) gl.num[numberTier(game.b.level[i] * 2)][0].drawInt(ctx, game.b.level[i], x, y, 0.5);
      else {
        ctx.fillStyle = k === Kind.Chest ? PAL.chestGold : PAL.potion;
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
    }
    ctx.globalAlpha = 1;
  }
}
