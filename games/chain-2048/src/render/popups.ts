/** 跳字（docs §5.5）：一发的整个连锁只出 1 条累计跳字，带避让；同屏最多 6 条 */
import { FONT_CN, FONT_NUM } from './palette';

interface Popup {
  alive: boolean;
  cid: number;
  pts: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  max: number;
  bump: number;
  color: string;
  size: number;
  text: string;
  /** 文字标签（三合一、获得灵珠等），用中文字体 */
  label: boolean;
  /** 锚点（刚合成的珠子）：跳字不得压住它 */
  ax: number;
  ay: number;
  /** 延迟出现（秒）：期间占位但不绘制 */
  delay: number;
  rise: number;
  /** 标签画成深色小签，和数字跳字区分层级 */
  pill: boolean;
}

export interface LabelOpts {
  delay?: number;
  /** 放在锚点珠子上方、给跳字留出一行的位置 */
  above?: boolean;
  rise?: number;
  pill?: boolean;
}

const MAX_SHOWN = 6;
const W = 390;
/** 避让边距：两条文字之间至少留这么多空 */
const PAD = 8;
/** 合成珠避让半径（珠子 20 + 合成弹跳） */
const BALL_AVOID = 26;
let measureCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
/** 文字半宽：优先用 measureText 实测，测不了（无 DOM）退回估算 */
const halfW = (text: string, size: number, label: boolean): number => {
  const key = `${label ? 1 : 0}|${Math.round(size)}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (measureCtx === undefined) {
      try {
        measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
      } catch {
        measureCtx = null;
      }
    }
    if (measureCtx) {
      measureCtx.font = label ? `900 ${Math.round(size)}px ${FONT_CN}` : `800 ${Math.round(size)}px ${FONT_NUM}`;
      w = measureCtx.measureText(text).width + 8;
    } else w = text.length * size * (label ? 1.0 : 0.56) + 8;
    if (widthCache.size > 400) widthCache.clear();
    widthCache.set(key, w);
  }
  return w / 2;
};
/** 标签相对分数跳字的候选偏移：[往屏幕中心侧 px, 上(-1)/下(+1)] */
const LABEL_SLOTS: [number, number][] = [0, 12, 24, 36, 48, 60, 72].map((u) => [u, -1] as [number, number]).concat([0, 12, 24, 36, 48].map((u) => [u, 1] as [number, number]));
const halfH = (size: number): number => size * 0.62 + 2;
/** 矩形（中心 cx,cy，半宽 hw，半高 hh）与圆是否相交 */
export const rectHitsCircle = (cx: number, cy: number, hw: number, hh: number, ox: number, oy: number, r: number): boolean => {
  const dx = Math.max(Math.abs(ox - cx) - hw, 0), dy = Math.max(Math.abs(oy - cy) - hh, 0);
  return dx * dx + dy * dy < r * r;
};
const clampX = (x: number, hw: number): number => Math.max(hw + 6, Math.min(W - hw - 6, x));
const TOP = 104;
const BOTTOM = 748;

export class Popups {
  private list: Popup[] = [];
  private totemX = 195;
  private totemY = 500;

  constructor() {
    for (let i = 0; i < 12; i++) this.list.push({ alive: false, cid: 0, pts: 0, x: 0, y: 0, tx: 0, ty: 0, life: 0, max: 1, bump: 0, color: '#fff', size: 18, text: '', label: false, ax: -999, ay: -999, delay: 0, rise: 28, pill: false });
  }

  /** 链上珠子探针：给定文字矩形是否压到任何可见珠子（尽量不压，让不开再放宽） */
  private ballProbe: ((x: number, y: number, hw: number, hh: number) => boolean) | null = null;

  setBallProbe(fn: (x: number, y: number, hw: number, hh: number) => boolean): void {
    this.ballProbe = fn;
  }

  setTotem(x: number, y: number): void {
    this.totemX = x;
    this.totemY = y;
  }

  clear(): void {
    for (const p of this.list) p.alive = false;
  }

  private overlaps(x: number, y: number, hw: number, hh: number, self: Popup | null, ax: number, ay: number, strict = false): boolean {
    if (Math.hypot(x - this.totemX, y - this.totemY) < 58) return true;
    // 自己的合成珠，以及其他跳字的合成珠（刚合成、还在弹跳）
    if (rectHitsCircle(x, y, hw, hh, ax, ay, BALL_AVOID)) return true;
    if (strict && this.ballProbe?.(x, y, hw, hh)) return true;
    for (const q of this.list) {
      if (!q.alive || q === self) continue;
      if (q.life < 0.5 && rectHitsCircle(x, y, hw, hh, q.ax, q.ay, BALL_AVOID)) return true;
      const qw = halfW(q.text, q.size * 1.18, q.label) + (q.pill ? 6 : 0);
      const qh = halfH(q.size * 1.18);
      // 包括剩余上浮路径
      const path = q.rise * Math.max(0, q.max - q.life) * 0.6;
      if (Math.abs(q.x - x) < qw + hw + PAD && y > q.y - path - qh - hh - PAD && y < q.y + qh + hh + PAD) return true;
    }
    return false;
  }

  /** 加分：同一 cid 累加到同一条 */
  add(cid: number, pts: number, x: number, y: number, kind: 'merge' | 'seal' | 'bonus'): void {
    if (pts <= 0) return;
    if (cid >= 0) {
      for (const p of this.list) {
        if (p.alive && p.cid === cid && p.life < p.max * 0.7) {
          p.pts += pts;
          p.text = `+${p.pts.toLocaleString('en-US')}`;
          p.bump = 1;
          p.life = Math.min(p.life, 0.15);
          p.size = Math.min(30, 18 + Math.log2(1 + p.pts / 50) * 1.6);
          if (kind === 'seal') p.color = '#FFE7A3';
          p.ax = x;
          p.ay = y;
          const pos = this.place(p.text, p.size, false, x, y, p);
          if (pos) {
            p.tx = pos.x;
            p.ty = pos.y;
          }
          return;
        }
      }
    }
    let shown = 0;
    for (const p of this.list) if (p.alive) shown++;
    if (shown >= MAX_SHOWN) return;
    const p = this.list.find((q) => !q.alive);
    if (!p) return;
    const text = `+${pts.toLocaleString('en-US')}`;
    const size = kind === 'seal' ? 26 : kind === 'bonus' ? 20 : 18;
    // bonus（退链奖励）锚点不是合成珠，不需要避珠
    const ax = kind === 'bonus' ? -999 : x, ay = kind === 'bonus' ? -999 : y;
    const pos = this.place(text, size, false, x, y, null, ax, ay);
    if (!pos) return;
    Object.assign(p, { alive: true, cid, pts, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, life: 0, max: kind === 'seal' ? 1.4 : 1.0, bump: 1, color: kind === 'seal' ? '#FFE7A3' : kind === 'bonus' ? '#A8E6C8' : '#F7EFD8', size, text, label: false, ax, ay, delay: 0, rise: 28, pill: false });
  }

  /**
   * 按「上 → 往屏幕中心侧 → 另一侧 → 下」找空位（docs §5.5），且不压住锚点珠子；让不开返回 null（省略）。
   * (x, y) 是锚点珠子中心；跳字默认放在珠子正上方贴边处。
   */
  private place(text: string, size: number, label: boolean, x: number, y: number, self: Popup | null, ax = x, ay = y, lift = 0, pill = false): { x: number; y: number } | null {
    const hw = halfW(text, size * 1.18, label) + (pill ? 6 : 0);
    const hh = halfH(size * 1.18);
    const up = BALL_AVOID + hh + 4 + lift;
    // 往屏幕中心那一侧（空地多、不贴边）
    const ix = x > W / 2 ? -1 : 1;
    const iy = y > (TOP + BOTTOM) / 2 ? -1 : 1;
    const side = hw + BALL_AVOID + 4;
    const cands: [number, number][] = [
      [0, -up], [ix * side * 0.8, iy * up * 0.8], [ix * side, 0], [0, -up - 34], [ix * side, iy * 34], [-ix * side, 0], [0, -up - 68], [-ix * side * 0.8, iy * up * 0.8], [0, up], [ix * side, -iy * 34],
    ];
    // 第一轮连链上其他珠子一起避开；不行再只避合成珠
    for (const strict of [true, false]) {
      for (const [dx, dy] of cands) {
        const cx = clampX(x + dx, hw), cy = Math.max(TOP + 20, Math.min(BOTTOM, y + dy));
        if (!this.overlaps(cx, cy, hw, hh, self, ax, ay, strict)) return { x: cx, y: cy };
      }
    }
    return null;
  }

  /**
   * 情境小字（三合一、获得灵珠、链条缩短……）：与跳字共用避让与同屏上限。
   * above：(x, y) 视为合成珠，标签放在珠子上方并空出一行给分数跳字，延迟出现，形成「分数 → 说明」的层级。
   */
  label(text: string, x: number, y: number, color: string, size = 16, life = 1.3, o: LabelOpts = {}): void {
    let shown = 0;
    for (const q of this.list) if (q.alive) shown++;
    if (shown >= MAX_SHOWN) return;
    const p = this.list.find((q) => !q.alive);
    if (!p) return;
    const pill = o.pill ?? false;
    const ax = o.above ? x : -999, ay = o.above ? y : -999;
    // 给分数跳字（约 18–30 px 高）让出一整行
    const lift = o.above ? 34 + PAD : 0;
    let pos: { x: number; y: number } | null = null;
    if (o.above) {
      // 同一颗珠子的分数跳字已就位：标签直接叠在它上方一行
      const sc = this.list.find((q) => q.alive && !q.label && Math.abs(q.ax - x) < 1 && Math.abs(q.ay - y) < 1);
      if (sc) {
        const hw = halfW(text, size * 1.18, true) + (pill ? 6 : 0), hh = halfH(size * 1.18);
        const d = halfH(sc.size * 1.18) + hh + PAD;
        const ix = sc.tx > W / 2 ? -1 : 1;
        // 首选分数正上方；压到珠子就往屏幕中心侧挪（最多 72px），再不行放分数正下方
        search: for (const strict of [true, false]) {
          for (const [dx, dy] of LABEL_SLOTS.map(([u, v]) => [ix * u, v * d] as const)) {
            const cx = clampX(sc.tx + dx, hw), cy = Math.max(TOP + 20, Math.min(BOTTOM, sc.ty + dy));
            if (!this.overlaps(cx, cy, hw, hh, sc, ax, ay, strict)) {
              pos = { x: cx, y: cy };
              break search;
            }
          }
        }
      }
      pos ??= this.place(text, size, true, x, y, null, ax, ay, lift, pill);
    } else pos = this.place(text, size, true, x, y + halfH(size * 1.18) + BALL_AVOID + 4, null, ax, ay, 0, pill);
    if (!pos) return;
    Object.assign(p, { alive: true, cid: -2, pts: 0, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, life: 0, max: life, bump: 1, color, size, text, label: true, ax, ay, delay: o.delay ?? 0, rise: o.rise ?? 16, pill });
  }

  update(dt: number): void {
    for (const p of this.list) {
      if (!p.alive) continue;
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        continue;
      }
      p.x += (p.tx - p.x) * Math.min(1, dt * 10);
      p.ty -= p.rise * dt;
      p.y += (p.ty - p.y) * Math.min(1, dt * 10);
      p.bump = Math.max(0, p.bump - dt * 5);
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const p of this.list) {
      if (!p.alive || p.delay > 0) continue;
      const t = p.life / p.max;
      const a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const appear = Math.min(1, p.life / 0.12);
      const sc = (0.6 + 0.4 * appear) * (1 + p.bump * 0.18);
      g.globalAlpha = a;
      g.font = p.label ? `900 ${Math.round(p.size * sc)}px ${FONT_CN}` : `800 ${Math.round(p.size * sc)}px ${FONT_NUM}`;
      if (p.pill) {
        const hw = halfW(p.text, p.size * sc, true) + 6, hh = p.size * sc * 0.5 + 5;
        g.fillStyle = 'rgba(11,35,28,0.82)';
        g.beginPath();
        g.roundRect(p.x - hw, p.y - hh, hw * 2, hh * 2, hh);
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = p.color;
        g.stroke();
        g.fillStyle = p.color;
        g.fillText(p.text, p.x, p.y + 0.5);
        continue;
      }
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(11,35,28,0.85)';
      g.strokeText(p.text, p.x, p.y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  }
}
