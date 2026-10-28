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
}

const MAX_SHOWN = 6;
const W = 390;
const halfW = (text: string, size: number, label: boolean): number => (text.length * size * (label ? 1.0 : 0.5) + 8) / 2;
const clampX = (x: number, hw: number): number => Math.max(hw + 6, Math.min(W - hw - 6, x));
const TOP = 104;
const BOTTOM = 748;

export class Popups {
  private list: Popup[] = [];
  private totemX = 195;
  private totemY = 500;

  constructor() {
    for (let i = 0; i < 12; i++) this.list.push({ alive: false, cid: 0, pts: 0, x: 0, y: 0, tx: 0, ty: 0, life: 0, max: 1, bump: 0, color: '#fff', size: 18, text: '', label: false });
  }

  setTotem(x: number, y: number): void {
    this.totemX = x;
    this.totemY = y;
  }

  clear(): void {
    for (const p of this.list) p.alive = false;
  }

  private overlaps(x: number, y: number, w: number, self: Popup | null): boolean {
    if (Math.hypot(x - this.totemX, y - this.totemY) < 58) return true;
    for (const q of this.list) {
      if (!q.alive || q === self) continue;
      const qw = halfW(q.text, q.size, q.label) * 2;
      // 包括剩余上浮路径；文字高度按字号估
      const hh = (q.size + 18) / 2 + 6;
      if (Math.abs(q.x - x) < (qw + w) / 2 && y > q.y - 30 - hh && y < q.y + hh) return true;
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
          p.tx = clampX(x, halfW(p.text, p.size * 1.18, false));
          p.ty = Math.max(TOP + 20, Math.min(BOTTOM, y - 26));
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
    const pos = this.place(text, size, false, x, y - 26);
    if (!pos) return;
    Object.assign(p, { alive: true, cid, pts, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, life: 0, max: kind === 'seal' ? 1.4 : 1.0, bump: 1, color: kind === 'seal' ? '#FFE7A3' : kind === 'bonus' ? '#A8E6C8' : '#F7EFD8', size, text, label: false });
  }

  /** 按「上 → 左右 → 下」找空位（docs §5.5）；让不开返回 null（省略） */
  private place(text: string, size: number, label: boolean, x: number, y: number): { x: number; y: number } | null {
    const hw = halfW(text, size * 1.18, label);
    const w = hw * 2;
    const px = clampX(x, hw);
    const py = Math.max(TOP + 20, Math.min(BOTTOM, y));
    const cands = [[0, 0], [0, -34], [-60, 0], [60, 0], [0, -68], [-60, -34], [60, -34], [0, 34], [-60, 34], [60, 34]];
    for (const [dx, dy] of cands) {
      const cx = clampX(px + dx!, hw), cy = Math.max(TOP + 20, Math.min(BOTTOM, py + dy!));
      if (!this.overlaps(cx, cy, w, null)) return { x: cx, y: cy };
    }
    return null;
  }

  /** 情境小字（三合一、获得灵珠、链条缩短……）：与跳字共用避让与同屏上限 */
  label(text: string, x: number, y: number, color: string, size = 16, life = 1.3): void {
    let shown = 0;
    for (const q of this.list) if (q.alive) shown++;
    if (shown >= MAX_SHOWN) return;
    const p = this.list.find((q) => !q.alive);
    if (!p) return;
    const pos = this.place(text, size, true, x, y);
    if (!pos) return;
    Object.assign(p, { alive: true, cid: -2, pts: 0, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, life: 0, max: life, bump: 1, color, size, text, label: true });
  }

  update(dt: number): void {
    for (const p of this.list) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        continue;
      }
      p.x += (p.tx - p.x) * Math.min(1, dt * 10);
      p.ty -= (p.label ? 16 : 28) * dt;
      p.y += (p.ty - p.y) * Math.min(1, dt * 10);
      p.bump = Math.max(0, p.bump - dt * 5);
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const p of this.list) {
      if (!p.alive) continue;
      const t = p.life / p.max;
      const a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const appear = Math.min(1, p.life / 0.12);
      const sc = (0.6 + 0.4 * appear) * (1 + p.bump * 0.18);
      g.globalAlpha = a;
      g.font = p.label ? `900 ${Math.round(p.size * sc)}px ${FONT_CN}` : `800 ${Math.round(p.size * sc)}px ${FONT_NUM}`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(11,35,28,0.85)';
      g.strokeText(p.text, p.x, p.y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  }
}
