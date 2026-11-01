/**
 * 合成分镜（§6.6）—— 全游戏的视觉高潮。四拍：
 *   ① 飞入：A 沿弧线飞向 B 格，两部件同时挤压进结果字里的位置框；需要变体的部件在 30–55% 进度交叉淡变（水→氵）
 *   ② 拼合：贴合瞬间格子 0.92 挤压回弹 + 命中停顿 + 一圈极淡的冲击环
 *   ③ 墨晕显字：部件淡出，结果字以噪声边晕染遮罩从中心洇开；清墨水痕扩散到 1.6 倍格宽；墨点溅射留渍；
 *      首次发现时字先 1.35 倍显现再缩回
 *   ④ 落印：首次发现——造字法朱印从 1.6 倍落到牌右上角；普通——拼音下一个朱点闪一下
 *   ⑤ 交付（另一段动画 Deliver）：抬起 → 弧线飞向卷轴（拖淡墨尾迹）→ 卷轴描红被笔扫填满 → 「成」印
 * 动画对象全部池化；动画期间对应格子锁定（不可拖、不可落）。
 */
import { BS, LAYOUT, cellXY } from '../config.ts';
import { RECIPE_MAP } from '../core/recipes.ts';
import type { Tile } from '../core/types.ts';
import type { RecipeDef } from '../data/hanzi.ts';
import { bell, clamp, easeInOutCubic, easeInOutQuad, easeOutBack, easeOutCubic, lerp, seg } from '../anim/ease.ts';
import { assignBoxes, partBoxes, pendingBoxes, type PartBox } from './compose.ts';
import { INK, glyphs } from './glyphs.ts';
import type { Revealer } from './ink.ts';
import type { Particles } from './particles.ts';
import { drawSeal, seal } from './seal.ts';
import { GLYPH_BASE, GLYPH_CHAR, defaultOpts, drawCard, drawTile, pendingTarget } from './tiles.ts';

export interface FxHooks {
  /** 拍点回调：给音频与震屏用 */
  beat(kind: 'fly' | 'join' | 'reveal' | 'seal' | 'pendingJoin' | 'arrive' | 'stamp', m: { first: boolean; depth: number; tri: boolean; index: number; x: number; y: number }): void;
  /** 合成动画结束（首次发现时弹新字卡） */
  mergeDone(ch: string, first: boolean, cell: number): void;
  /** 交付动画抵达卷轴（卷轴开始笔扫填墨） */
  deliverArrive(slot: number, uid: number): void;
  /** 交付全部完成（印已落） */
  deliverDone(slot: number, uid: number, score: number): void;
}

/** 时间轴（秒）：[飞入结束, 拼合结束, 显字结束, 落印结束] */
const T_NORMAL = [0.18, 0.24, 0.56, 0.64];
/** 首次发现：大字在 0.36–1.18 s 显出，放大停留约 0.3 s 后才落印 */
const T_FIRST = [0.26, 0.36, 1.18, 1.4];

interface PartAnim {
  base: string;
  show: string;
  /** 起点矩形（逻辑坐标） */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 终点：结果字框内的单位矩形 */
  box: PartBox | null;
  fromA: boolean;
  /** 起点是否已经是变体字形（来自未成牌） */
  startShow: boolean;
}

interface MergeAnim {
  on: boolean;
  t: number;
  times: number[];
  cell: number;
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  a: Tile;
  b: Tile;
  result: Tile;
  recipe: RecipeDef | null;
  pending: boolean;
  first: boolean;
  tri: boolean;
  depth: number;
  parts: PartAnim[];
  nParts: number;
  fired: number;
  sealRot: number;
  mask: number;
  arcDir: number;
}

interface DeliverAnim {
  on: boolean;
  t: number;
  delay: number;
  ch: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  slot: number;
  uid: number;
  score: number;
  index: number;
  arrived: boolean;
  /** 交付前要先等的合成格（该格动画结束后才起飞） */
  waitCell: number;
  trail: Float32Array;
  trailN: number;
}

const D_LIFT = 0.08;
const D_FLY = 0.45;

export class MergeFx {
  private merges: MergeAnim[] = [];
  private delivers: DeliverAnim[] = [];
  private scrollX: (slot: number) => number = () => 0;
  pinyin = true;
  method = true;
  reduced = false;
  private opts = defaultOpts();

  private reveal: Revealer;
  private blooms: HTMLCanvasElement[];
  private particles: Particles;
  private hooks: FxHooks;
  constructor(reveal: Revealer, blooms: HTMLCanvasElement[], particles: Particles, hooks: FxHooks) {
    this.reveal = reveal;
    this.blooms = blooms;
    this.particles = particles;
    this.hooks = hooks;
    for (let i = 0; i < 8; i++) {
      this.merges.push({
        on: false, t: 0, times: T_NORMAL, cell: 0, cx: 0, cy: 0, ax: 0, ay: 0,
        a: { id: 0, kind: 'base', ch: '' }, b: { id: 0, kind: 'base', ch: '' }, result: { id: 0, kind: 'base', ch: '' },
        recipe: null, pending: false, first: false, tri: false, depth: 1,
        parts: [0, 1, 2, 3].map(() => ({ base: '', show: '', sx: 0, sy: 0, sw: 0, sh: 0, box: null, fromA: false, startShow: false })),
        nParts: 0, fired: 0, sealRot: 0, mask: 0, arcDir: 1,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.delivers.push({ on: false, t: 0, delay: 0, ch: '', x0: 0, y0: 0, x1: 0, y1: 0, slot: 0, uid: 0, score: 0, index: 0, arrived: false, waitCell: -1, trail: new Float32Array(24), trailN: 0 });
    }
  }

  setScrollX(f: (slot: number) => number): void {
    this.scrollX = f;
  }

  clear(): void {
    for (const m of this.merges) m.on = false;
    for (const d of this.delivers) d.on = false;
  }

  /** 格子是否被动画锁定 */
  locked(cell: number): boolean {
    for (const m of this.merges) if (m.on && m.cell === cell) return true;
    for (const d of this.delivers) if (d.on && d.waitCell === cell && !d.arrived && d.t < D_LIFT + 0.05) return true;
    return false;
  }

  busy(): boolean {
    for (const m of this.merges) if (m.on) return true;
    for (const d of this.delivers) if (d.on) return true;
    return false;
  }

  /** 某格的合成动画还剩多少秒 */
  remaining(cell: number): number {
    for (const m of this.merges) if (m.on && m.cell === cell) return Math.max(0, m.times[3] - m.t);
    return 0;
  }

  /**
   * 开始一次合成动画。ax/ay：A 的起点（拖拽松手处或原格中心）。
   */
  startMerge(a: Tile, b: Tile, result: Tile, cell: number, ax: number, ay: number, first: boolean, aSecond: boolean): void {
    const m = this.merges.find((x) => !x.on) ?? this.merges[0];
    const { x, y } = cellXY(cell);
    m.on = true;
    m.t = 0;
    m.cell = cell;
    m.cx = x + LAYOUT.cell / 2;
    m.cy = y + LAYOUT.cell / 2;
    // 起点换算到缩放前的坐标系（draw 时以格心为原点放大 BS 倍）
    m.ax = m.cx + (ax - m.cx) / BS;
    m.ay = m.cy + (ay - m.cy) / BS;
    m.a = a;
    m.b = b;
    m.result = result;
    m.pending = result.kind === 'pending';
    m.recipe = m.pending ? RECIPE_MAP.get(pendingTarget(result.parts ?? [])) ?? null : RECIPE_MAP.get(result.ch) ?? null;
    m.first = first && !m.pending;
    m.tri = !m.pending && (a.kind === 'pending' || b.kind === 'pending');
    m.depth = m.recipe ? m.recipe.parts.length : 2;
    m.times = m.first ? T_FIRST : T_NORMAL;
    if (m.pending) m.times = [0.18, 0.24, 0.24, 0.54];
    if (this.reduced) m.times = m.times.map((v) => v * 0.8);
    m.fired = 0;
    m.sealRot = ((Math.random() - 0.5) * 8 * Math.PI) / 180;
    m.mask = Math.floor(Math.random() * 3);
    m.arcDir = ax < m.cx ? -1 : 1;
    // 部件 → 位置框
    const r = m.recipe;
    const aParts = a.kind === 'pending' ? a.parts ?? [] : [a.ch];
    const bParts = b.kind === 'pending' ? b.parts ?? [] : [b.ch];
    m.nParts = 0;
    let boxes: PartBox[] = [];
    let ia: number[] = [];
    let ib: number[] = [];
    if (r && !m.pending) {
      boxes = partBoxes(r);
      const asg = assignBoxes(r, aParts, bParts, aSecond);
      ia = asg.a;
      ib = asg.b;
    } else if (r && m.pending) {
      // 未成：两部件放在目标字里各自的位置（70% 框）
      boxes = pendingBoxes(result.parts ?? [], r.c);
      ib = [boxes.findIndex((bx) => bx.base === bParts[0])];
      ia = [boxes.findIndex((bx, k) => bx.base === aParts[0] && k !== ib[0])];
    }
    const addParts = (t: Tile, list: string[], idx: number[], fromA: boolean, px: number, py: number) => {
      const isPend = t.kind === 'pending';
      const pb = isPend ? pendingBoxes(t.parts ?? [], pendingTarget(t.parts ?? [])) : [];
      for (let i = 0; i < list.length; i++) {
        const p = m.parts[m.nParts++];
        const box = idx[i] >= 0 ? boxes[idx[i]] ?? null : null;
        p.base = list[i];
        p.show = box ? box.show : list[i];
        p.box = box;
        p.fromA = fromA;
        if (isPend && pb[i]) {
          // 起点：未成牌里 70% 框中的位置
          const F = GLYPH_CHAR * 0.7;
          p.sx = px - F / 2 + pb[i].x * F;
          p.sy = py - F / 2 - 2 + pb[i].y * F;
          p.sw = pb[i].w * F;
          p.sh = pb[i].h * F;
          p.startShow = true;
          p.base = pb[i].show;
        } else {
          const size = t.kind === 'base' ? GLYPH_BASE : GLYPH_CHAR;
          const ink = glyphs.ink(list[i]);
          const oy = t.kind === 'char' && this.pinyin ? -5 : 0;
          p.sx = px + ink.l * size;
          p.sy = py + oy + ink.t * size;
          p.sw = (ink.r - ink.l) * size;
          p.sh = (ink.b - ink.t) * size;
          p.startShow = false;
        }
      }
    };
    addParts(b, bParts, ib, false, m.cx, m.cy);
    addParts(a, aParts, ia, true, m.ax, m.ay);
    this.hooks.beat('fly', this.meta(m, 0));
  }

  /** 交付：字牌从 cell 飞向卷轴 slot；若该格有合成动画，等它结束 */
  startDeliver(ch: string, cell: number, slot: number, uid: number, score: number, index: number): void {
    const d = this.delivers.find((x) => !x.on) ?? this.delivers[0];
    const { x, y } = cellXY(cell);
    d.on = true;
    d.t = 0;
    d.ch = ch;
    d.x0 = x + LAYOUT.cell / 2;
    d.y0 = y + LAYOUT.cell / 2;
    d.slot = slot;
    d.uid = uid;
    d.score = score;
    d.index = index;
    d.arrived = false;
    d.waitCell = cell;
    d.delay = this.remaining(cell) + index * 0.15;
    d.trailN = 0;
  }

  private meta(m: MergeAnim, index: number) {
    return { first: m.first, depth: m.depth, tri: m.tri, index, x: m.cx, y: m.cy };
  }

  /** 推进动画；dt 为游戏时间（命中停顿时为 0） */
  update(dt: number): void {
    for (const m of this.merges) {
      if (!m.on) continue;
      m.t += dt;
      const T = m.times;
      if (m.fired < 1 && m.t >= T[0]) {
        m.fired = 1;
        this.hooks.beat(m.pending ? 'pendingJoin' : 'join', this.meta(m, 0));
      }
      if (m.fired < 2 && m.t >= T[1] && !m.pending) {
        m.fired = 2;
        this.hooks.beat('reveal', this.meta(m, 0));
        const n = m.first ? 12 : 7;
        this.particles.splash(m.cx, m.cy, m.tri ? n + 4 : n, 260);
      }
      if (m.fired < 3 && m.t >= T[2] && !m.pending) {
        m.fired = 3;
        this.hooks.beat('seal', this.meta(m, 0));
        if (m.first) this.particles.confetti(m.cx + 20, m.cy - 20, 2, 120);
      }
      if (m.t >= T[3]) {
        m.on = false;
        if (!m.pending) this.hooks.mergeDone(m.result.ch, m.first, m.cell);
      }
    }
    for (const d of this.delivers) {
      if (!d.on) continue;
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      if (d.t === 0) {
        d.x1 = this.scrollX(d.slot) + LAYOUT.scrollW / 2;
        d.y1 = LAYOUT.scrollY + 50;
      }
      d.t += dt;
      if (!d.arrived && d.t >= D_LIFT + D_FLY) {
        d.arrived = true;
        this.hooks.deliverArrive(d.slot, d.uid);
        this.hooks.beat('arrive', { first: false, depth: 0, tri: false, index: d.index, x: d.x1, y: d.y1 });
      }
      if (d.t >= D_LIFT + D_FLY + 0.36) {
        d.on = false;
        this.hooks.deliverDone(d.slot, d.uid, d.score);
      }
    }
  }

  /** 交付中的字是否还在飞（卷轴用：飞到前描红保持空心） */
  delivering(uid: number): boolean {
    // uid = -1：任何一个交付还在飞
    for (const d of this.delivers) if (d.on && (uid === -1 || d.uid === uid) && !d.arrived) return true;
    return false;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    // 动画按 66 px 设计格绘制，整体缩放到实际格（BS）
    for (const m of this.merges) {
      if (!m.on) continue;
      ctx.save();
      ctx.translate(m.cx, m.cy);
      ctx.scale(BS, BS);
      ctx.translate(-m.cx, -m.cy);
      this.drawMerge(ctx, m, time);
      ctx.restore();
    }
  }

  /** 交付飞行层（画在 HUD 之上） */
  drawDeliver(ctx: CanvasRenderingContext2D): void {
    for (const d of this.delivers) if (d.on && d.delay <= 0 && !d.arrived) this.drawDeliverOne(ctx, d);
  }

  private drawMerge(ctx: CanvasRenderingContext2D, m: MergeAnim, time: number): void {
    const T = m.times;
    const t = m.t;
    const o = this.opts;
    o.pinyin = this.pinyin;
    o.method = this.method;
    o.time = time;
    // ② 格子挤压回弹
    let sq = 1;
    if (t >= T[0]) {
      const tau = t - T[0];
      sq = 1 - 0.08 * Math.exp(-tau * 10) * Math.cos(tau * 30);
    }
    const pFly = easeInOutCubic(seg(t, 0, T[0]));
    // 牌底：B 在格中挤压；A 的牌底随 A 飞来并在飞入末段淡出
    drawCard(ctx, m.cx, m.cy, sq, 1, 0);
    const ax = lerp(m.ax, m.cx, pFly);
    const ay = lerp(m.ay, m.cy, pFly) - bell(pFly) * 18;
    const arcX = ax + m.arcDir * bell(pFly) * 6;
    if (pFly < 1) drawCard(ctx, arcX, ay, 1 - 0.1 * pFly, 1 - seg(pFly, 0.55, 1), 0.6 * (1 - pFly));
    // 冲击环
    if (t >= T[0] && t < T[0] + 0.22) {
      const u = (t - T[0]) / 0.22;
      ctx.globalAlpha = 0.28 * (1 - u);
      ctx.strokeStyle = INK.wash;
      ctx.lineWidth = 2 * (1 - u) + 0.5;
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, 22 + u * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // ③ 水痕：清墨晕扩散到 2 倍格宽（首次 / 三部件 2.6 倍），外圈一道淡墨水线越出格子
    if (!m.pending && t >= T[1]) {
      const span = m.first ? 0.75 : 0.5;
      const u = seg(t, T[1], T[1] + span);
      const big = m.first || m.tri ? 1.3 : 1;
      const e = easeOutCubic(u);
      const R = 66 * (0.6 + 1.4 * e) * big;
      ctx.globalAlpha = 0.42 * (1 - u);
      const b = this.blooms[(m.mask + 2) % this.blooms.length];
      ctx.drawImage(b, m.cx - R / 2, m.cy - R / 2, R, R);
      ctx.globalAlpha = 0.5 * (1 - u) * (1 - u);
      ctx.strokeStyle = INK.light;
      ctx.lineWidth = 1.2 + 2.2 * (1 - u);
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, 66 * (0.45 + 0.6 * e) * big, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 结果字的框（墨迹包围盒）
    const r = m.recipe;
    const resCh = m.pending ? '' : m.result.ch;
    const F = m.pending ? GLYPH_CHAR * 0.7 : GLYPH_CHAR;
    const gy = m.pending ? m.cy - 2 : m.cy - (this.pinyin ? 5 : 0);
    let fx: number;
    let fy: number;
    let fw: number;
    let fh: number;
    if (!m.pending && resCh) {
      const ink = glyphs.ink(resCh);
      fx = m.cx + ink.l * F;
      fy = gy + ink.t * F;
      fw = (ink.r - ink.l) * F;
      fh = (ink.b - ink.t) * F;
    } else {
      fx = m.cx - F / 2;
      fy = gy - F / 2;
      fw = F;
      fh = F;
    }
    // ①③ 部件：飞入挤压到位置框，显字时淡出
    const partsAlpha = m.pending ? 1 : 1 - seg(t, T[1], T[1] + (T[2] - T[1]) * 0.45);
    const darken = m.tri && t > T[0] ? seg(t, T[0], T[1]) : 0;
    if (partsAlpha > 0) {
      for (let i = 0; i < m.nParts; i++) {
        const p = m.parts[i];
        const k = p.fromA ? pFly : easeInOutCubic(seg(t, 0, T[0] * 0.9));
        let tx = p.sx;
        let ty = p.sy;
        let tw = p.sw;
        let th = p.sh;
        if (p.box) {
          tx = fx + p.box.x * fw;
          ty = fy + p.box.y * fh;
          tw = p.box.w * fw;
          th = p.box.h * fh;
        }
        const lift = p.fromA ? -bell(k) * 18 : 0;
        const x = lerp(p.sx, tx, k) + (p.fromA ? m.arcDir * bell(k) * 6 : 0);
        const y = lerp(p.sy, ty, k) + lift;
        const w = lerp(p.sw, tw, k);
        const h = lerp(p.sh, th, k);
        const col = darken > 0 ? INK.ink2 : p.startShow ? INK.light : p.fromA ? (m.a.kind === 'base' ? INK.light : INK.ink) : m.b.kind === 'base' ? INK.light : INK.ink;
        // 变体交叉淡变（水→氵）
        const cf = p.show !== p.base ? seg(k, 0.3, 0.55) : 0;
        if (cf < 1) glyphs.drawFit(ctx, p.base, GLYPH_CHAR, col, x, y, w, h, partsAlpha * (1 - cf));
        if (cf > 0) glyphs.drawFit(ctx, p.show, GLYPH_CHAR, col, x, y, w, h, partsAlpha * cf);
      }
    }
    if (m.pending) {
      // 虚线框逐段画出（300 ms）+「未成」小印
      const u = seg(t, T[1], T[3]);
      if (u > 0) {
        ctx.save();
        ctx.strokeStyle = INK.red;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        const L = 54 * 4;
        ctx.lineDashOffset = 0;
        ctx.beginPath();
        const x0 = m.cx - 27;
        const y0 = m.cy - 27;
        // 按周长比例画出
        let rest = L * u;
        const seg4 = [
          [x0, y0, x0 + 54, y0], [x0 + 54, y0, x0 + 54, y0 + 54], [x0 + 54, y0 + 54, x0, y0 + 54], [x0, y0 + 54, x0, y0],
        ];
        ctx.moveTo(x0, y0);
        for (const [x1, y1, x2, y2] of seg4) {
          if (rest <= 0) break;
          const f = Math.min(1, rest / 54);
          ctx.lineTo(lerp(x1, x2, f), lerp(y1, y2, f));
          rest -= 54;
        }
        ctx.stroke();
        ctx.restore();
        drawSeal(ctx, seal('未成', 15, 'white', 'kai', 9), m.cx + 21, m.cy + 21, 1, 0.05, u);
      }
      return;
    }
    // ③ 墨显：结果字从中心洇开
    if (t >= T[1] && resCh) {
      const u = seg(t, T[1], T[2]);
      const p = easeOutCubic(u);
      let sc = 1;
      let lift = 0;
      // 首次发现：放大到 1.5 倍、略抬起，停留后再落回格子
      if (m.first) {
        const back = easeInOutQuad(seg(u, 0.72, 1));
        sc = lerp(lerp(1, 1.5, easeOutBack(clamp(u / 0.3))), 1, back);
        lift = -10 * (1 - back) * clamp(u / 0.3);
      }
      const c = glyphs.get(resCh, GLYPH_CHAR, INK.ink);
      const box = (c.width / glyphs.dpr) * sc;
      this.reveal.bloomReveal(ctx, c, m.cx, gy + lift, box, box, Math.min(1, p * (m.tri ? 1.1 : 1)), m.mask);
      // 拼音与造字法角标在显字后半淡入
      if (r && this.pinyin) glyphs.label(ctx, r.py, m.cx, m.cy + 23, 11, INK.light, 0.5, seg(u, 0.5, 1));
    }
    // ④ 落印
    if (t >= T[2] && r) {
      const u = seg(t, T[2], T[3]);
      if (m.first) {
        const s = lerp(1.6, 1, easeOutBack(clamp(u * 1.4)));
        const a = u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15;
        drawSeal(ctx, seal(r.t, 24, 'white', 'kai', 4), m.cx + 19, m.cy - 19, s, m.sealRot, a);
      } else {
        ctx.globalAlpha = bell(u);
        ctx.fillStyle = INK.red;
        ctx.fillRect(m.cx - 1, m.cy + 30, 2, 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawDeliverOne(ctx: CanvasRenderingContext2D, d: DeliverAnim): void {
    const t = d.t;
    const o = this.opts;
    o.pinyin = this.pinyin;
    o.method = false;
    if (t < D_LIFT) {
      const u = t / D_LIFT;
      o.scale = BS * (1 + 0.1 * u);
      o.lift = u;
      o.alpha = 1;
      drawTile(ctx, { kind: 'char', ch: d.ch }, d.x0, d.y0 - u * 4, o);
      o.scale = 1;
      o.lift = 0;
      return;
    }
    const u = easeInOutQuad(seg(t, D_LIFT, D_LIFT + D_FLY));
    const x = lerp(d.x0, d.x1, u);
    const y = lerp(d.y0 - 4, d.y1, u) - bell(u) * 46;
    // 尾迹
    const n = d.trail.length / 2;
    if (d.trailN < n) d.trailN++;
    for (let i = d.trailN - 1; i > 0; i--) {
      d.trail[i * 2] = d.trail[(i - 1) * 2];
      d.trail[i * 2 + 1] = d.trail[(i - 1) * 2 + 1];
    }
    d.trail[0] = x;
    d.trail[1] = y;
    for (let i = 1; i < d.trailN; i++) {
      const b = this.blooms[i % this.blooms.length];
      const s = 18 * (1 - i / n);
      ctx.globalAlpha = 0.16 * (1 - i / n);
      ctx.drawImage(b, d.trail[i * 2] - s / 2, d.trail[i * 2 + 1] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    // 牌底在途中淡出，字放大到卷轴描红的字号（60 px）
    const size = lerp(1.1 * BS, 60 / GLYPH_CHAR, u);
    o.scale = size;
    o.alpha = 1;
    drawCard(ctx, x, y, size, 1 - seg(u, 0.3, 0.8), 1);
    glyphs.draw(ctx, d.ch, x, y, GLYPH_CHAR, INK.ink, 1, GLYPH_CHAR * size, GLYPH_CHAR * size);
    o.scale = 1;
  }

  /** 调试：活动动画数 */
  activeCount(): number {
    let n = 0;
    for (const m of this.merges) if (m.on) n++;
    for (const d of this.delivers) if (d.on) n++;
    return n;
  }
}

export const MERGE_TOTAL = { normal: T_NORMAL[3], first: T_FIRST[3] };
