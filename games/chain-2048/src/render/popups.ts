/** 跳字（docs §5.5）：一发的整个连锁只出 1 条累计跳字，带避让；同屏最多 6 条 */
import { FONT_NUM } from './palette';

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
}

const MAX_SHOWN = 6;
const TOP = 104;
const BOTTOM = 748;

export class Popups {
  private list: Popup[] = [];
  private totemX = 195;
  private totemY = 500;

  constructor() {
    for (let i = 0; i < 12; i++) this.list.push({ alive: false, cid: 0, pts: 0, x: 0, y: 0, tx: 0, ty: 0, life: 0, max: 1, bump: 0, color: '#fff', size: 18, text: '' });
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
      const qw = q.text.length * q.size * 0.5 + 8;
      // 包括剩余上浮路径
      if (Math.abs(q.x - x) < (qw + w) / 2 && y > q.y - 30 - 22 && y < q.y + 22) return true;
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
          p.tx = x;
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
    const w = text.length * size * 0.5 + 8;
    let px = Math.max(30, Math.min(360, x));
    let py = Math.max(TOP + 20, Math.min(BOTTOM, y - 26));
    const cands = [[0, 0], [0, -30], [-50, 0], [50, 0], [0, 30], [-50, 30], [50, 30], [0, 60]];
    let found = false;
    for (const [dx, dy] of cands) {
      const cx = Math.max(30, Math.min(360, px + dx!)), cy = Math.max(TOP + 20, Math.min(BOTTOM, py + dy!));
      if (!this.overlaps(cx, cy, w, null)) {
        px = cx;
        py = cy;
        found = true;
        break;
      }
    }
    if (!found) return;
    Object.assign(p, { alive: true, cid, pts, x: px, y: py, tx: px, ty: py, life: 0, max: kind === 'seal' ? 1.4 : 1.0, bump: 1, color: kind === 'seal' ? '#FFE7A3' : kind === 'bonus' ? '#A8E6C8' : '#F7EFD8', size, text });
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
      p.ty -= 28 * dt;
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
      g.font = `800 ${Math.round(p.size * sc)}px ${FONT_NUM}`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(11,35,28,0.85)';
      g.strokeText(p.text, p.x, p.y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  }
}
