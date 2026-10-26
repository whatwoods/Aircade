import { Rng } from '../core/rng';
import { type Sprite, makeCanvas, rgba, sprite } from './gfx';
import { EYE, PAL } from './palette';
import { DRAGON_CRACKS, DRAGON_LAIR, DRAGON_RISE, SHAPES, type ShapeDef } from './shapes';

export interface Shard {
  c: HTMLCanvasElement;
  /** CSS 尺寸 */
  w: number;
  h: number;
  /** 碎片中心相对剪影中心的偏移（CSS） */
  ox: number;
  oy: number;
}

export interface Sil {
  normal: Sprite;
  white: Sprite;
  shards: Shard[];
  /** 整张 sprite 的 CSS 边长（含边距） */
  size: number;
  /** 造型 100 单位对应的 CSS 边长 */
  unit: number;
}

const PAD = 0.12;

/**
 * 剪影烘焙：轮廓光 + 近黑本体 + 发光眼睛；同时烘焙白版（受击闪白）与三角碎片。
 */
export class Silhouettes {
  mon: Sil[] = [];
  rise!: Sil;
  lairBody!: Sprite;
  lairCracks!: Sprite;
  lairSize = 0;
  dpr = 1;
  private baked = '';

  bake(cell: number, dpr: number): void {
    const key = `${cell}|${dpr}`;
    if (key === this.baked) return;
    this.baked = key;
    this.dpr = dpr;
    this.mon = [];
    for (let l = 1; l <= 9; l++) this.mon[l] = this.bakeSil(SHAPES[l], 64, EYE[l], 4, 4, 1000 + l);
    this.rise = this.bakeSil(DRAGON_RISE, 300, EYE[13], 7, 6, 77);
    this.lairSize = cell * 3;
    this.bakeLair(cell * 3);
  }

  private paths(def: ShapeDef): { fill: Path2D; holes: Path2D | null; strokes: { p: Path2D; w: number }[] } {
    const fill = new Path2D();
    for (const d of def.fill) fill.addPath(new Path2D(d));
    for (const [x, y, r] of def.dots ?? []) {
      fill.moveTo(x + r, y);
      fill.arc(x, y, r, 0, Math.PI * 2);
    }
    let holes: Path2D | null = null;
    if (def.holes) {
      holes = new Path2D();
      for (const d of def.holes) holes.addPath(new Path2D(d));
    }
    const strokes = (def.strokes ?? []).map((s) => ({ p: new Path2D(s.d), w: s.w }));
    return { fill, holes, strokes };
  }

  /** 画剪影形状（单位坐标 → 已设好的变换），只负责形状，不负责颜色 */
  private shape(c: CanvasRenderingContext2D, P: ReturnType<Silhouettes['paths']>, style: string | CanvasGradient): void {
    c.fillStyle = style;
    c.strokeStyle = style;
    c.fill(P.fill);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const s of P.strokes) {
      c.lineWidth = s.w;
      c.stroke(s.p);
    }
    if (P.holes) {
      c.globalCompositeOperation = 'destination-out';
      c.fill(P.holes);
      c.globalCompositeOperation = 'source-over';
    }
  }

  private bakeSil(def: ShapeDef, cssSize: number, eye: string, gx: number, gy: number, seed: number): Sil {
    const d = this.dpr;
    const unitPx = cssSize * d;
    const total = Math.ceil(unitPx * (1 + PAD * 2));
    const off = unitPx * PAD;
    const sc = unitPx / 100;
    const P = this.paths(def);
    const rimOff = (1.5 * d) / sc;
    // 轮廓光层
    const [rim, rc] = makeCanvas(total, total);
    rc.setTransform(sc, 0, 0, sc, off - rimOff * sc, off - rimOff * sc);
    this.shape(rc, P, rgba(PAL.amber, 0.95));
    // 本体层
    const [body, bc] = makeCanvas(total, total);
    bc.setTransform(sc, 0, 0, sc, off, off);
    const g = bc.createLinearGradient(0, 0, 0, 100);
    g.addColorStop(0, '#1C1826');
    g.addColorStop(0.55, '#0E0C14');
    g.addColorStop(1, '#0A0910');
    this.shape(bc, P, g);
    const normal = sprite(total, total, (c) => {
      c.drawImage(rim, 0, 0);
      c.drawImage(body, 0, 0);
      c.setTransform(sc, 0, 0, sc, off, off);
      // 眼睛
      for (const [x, y, rx, ry] of def.eyes) {
        c.shadowColor = eye;
        c.shadowBlur = 6 * d;
        c.fillStyle = eye;
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,240,0.95)';
        c.beginPath();
        c.ellipse(x, y, rx * 0.4, ry * 0.45, 0, 0, Math.PI * 2);
        c.fill();
      }
      for (const [x, y, r, col] of def.gems ?? []) {
        c.shadowColor = col;
        c.shadowBlur = 8 * d;
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.beginPath();
        c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
        c.fill();
      }
    });
    const white = sprite(total, total, (c) => {
      c.drawImage(normal.c, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, total, total);
    });
    // 碎片：抖动网格三角剖分
    const rng = new Rng(seed);
    const pts: [number, number][] = [];
    const x0 = -4;
    const y0 = -4;
    const span = 108;
    for (let j = 0; j < gy; j++)
      for (let i = 0; i < gx; i++) {
        const edgeX = i === 0 || i === gx - 1;
        const edgeY = j === 0 || j === gy - 1;
        const jx = edgeX ? 0 : rng.range(-0.3, 0.3) * (span / (gx - 1));
        const jy = edgeY ? 0 : rng.range(-0.3, 0.3) * (span / (gy - 1));
        pts.push([x0 + (i * span) / (gx - 1) + jx, y0 + (j * span) / (gy - 1) + jy]);
      }
    const [, test] = makeCanvas(4, 4);
    const inside = (x: number, y: number): boolean => {
      if (test.isPointInPath(P.fill, x, y)) return true;
      for (const s of P.strokes) {
        test.lineWidth = s.w;
        if (test.isPointInStroke(s.p, x, y)) return true;
      }
      return false;
    };
    const shards: Shard[] = [];
    const cssPer = cssSize / 100;
    for (let j = 0; j < gy - 1; j++)
      for (let i = 0; i < gx - 1; i++) {
        const a = pts[j * gx + i];
        const b = pts[j * gx + i + 1];
        const c2 = pts[(j + 1) * gx + i];
        const e = pts[(j + 1) * gx + i + 1];
        const tris = (i + j) % 2 ? [[a, b, e], [a, e, c2]] : [[a, b, c2], [b, e, c2]];
        for (const t of tris) {
          // 采样判断是否有内容
          let hit = false;
          const cxu = (t[0][0] + t[1][0] + t[2][0]) / 3;
          const cyu = (t[0][1] + t[1][1] + t[2][1]) / 3;
          const samples: [number, number][] = [[cxu, cyu]];
          for (const v of t) samples.push([(v[0] * 2 + cxu) / 3, (v[1] * 2 + cyu) / 3]);
          for (let q = 0; q < 3; q++) samples.push([(t[q][0] + t[(q + 1) % 3][0] + cxu) / 3, (t[q][1] + t[(q + 1) % 3][1] + cyu) / 3]);
          for (const [sx, sy] of samples) if (inside(sx, sy)) hit = true;
          if (!hit) continue;
          const minX = Math.min(t[0][0], t[1][0], t[2][0]);
          const maxX = Math.max(t[0][0], t[1][0], t[2][0]);
          const minY = Math.min(t[0][1], t[1][1], t[2][1]);
          const maxY = Math.max(t[0][1], t[1][1], t[2][1]);
          const bx = Math.floor(off + minX * sc) - 1;
          const by = Math.floor(off + minY * sc) - 1;
          const bw = Math.ceil((maxX - minX) * sc) + 3;
          const bh = Math.ceil((maxY - minY) * sc) + 3;
          const [sc2, sx2] = makeCanvas(bw, bh);
          sx2.beginPath();
          for (let q = 0; q < 3; q++) {
            const px = off + t[q][0] * sc - bx;
            const py = off + t[q][1] * sc - by;
            if (q === 0) sx2.moveTo(px, py);
            else sx2.lineTo(px, py);
          }
          sx2.closePath();
          sx2.clip();
          sx2.drawImage(normal.c, -bx, -by);
          // 碎片边缘的轮廓光
          sx2.strokeStyle = rgba(PAL.amber, 0.35);
          sx2.lineWidth = 1.2 * d;
          sx2.stroke();
          shards.push({
            c: sc2,
            w: bw / d,
            h: bh / d,
            ox: ((minX + maxX) / 2 - 50) * cssPer,
            oy: ((minY + maxY) / 2 - 50) * cssPer,
          });
        }
      }
    return { normal, white, shards, size: total / d, unit: cssSize };
  }

  private bakeLair(css: number): void {
    const d = this.dpr;
    const px = Math.round(css * d);
    const sc = px / 100;
    const P = this.paths(DRAGON_LAIR);
    const rimOff = (1.2 * d) / sc;
    this.lairBody = sprite(px, px, (c) => {
      c.setTransform(sc, 0, 0, sc, -rimOff * sc, -rimOff * sc);
      this.shape(c, P, rgba('#B0502A', 0.55));
      c.setTransform(sc, 0, 0, sc, 0, 0);
      const g = c.createLinearGradient(0, 0, 0, 100);
      g.addColorStop(0, '#1C1620');
      g.addColorStop(1, '#0A0910');
      this.shape(c, P, g);
      // 鳞片：暗上加暗的菱形纹理
      c.save();
      c.clip(P.fill);
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 0.5;
      for (let y = -6; y < 106; y += 4.2) {
        c.beginPath();
        for (let x = -6; x < 106; x += 4.2) {
          c.moveTo(x, y + 2.1);
          c.lineTo(x + 2.1, y);
          c.lineTo(x + 4.2, y + 2.1);
        }
        c.stroke();
      }
      c.strokeStyle = 'rgba(80,60,90,0.12)';
      c.translate(0.6, 0.6);
      for (let y = -6; y < 106; y += 4.2) {
        c.beginPath();
        for (let x = -6; x < 106; x += 4.2) {
          c.moveTo(x, y + 2.1);
          c.lineTo(x + 2.1, y);
        }
        c.stroke();
      }
      c.restore();
      // 鼻孔
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(47.5, 86, 1.2, 0.8, 0, 0, Math.PI * 2);
      c.ellipse(52.5, 86, 1.2, 0.8, 0, 0, Math.PI * 2);
      c.fill();
    });
    this.lairCracks = sprite(px, px, (c) => {
      c.setTransform(sc, 0, 0, sc, 0, 0);
      c.lineCap = 'round';
      c.shadowColor = PAL.dragonFire;
      c.shadowBlur = 5 * d;
      c.strokeStyle = 'rgba(255,90,40,0.95)';
      c.lineWidth = 1.1;
      for (const s of DRAGON_CRACKS) c.stroke(new Path2D(s));
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(255,220,150,0.9)';
      c.lineWidth = 0.4;
      for (const s of DRAGON_CRACKS) c.stroke(new Path2D(s));
    });
  }

  /** 巢中巨龙眼睛位置（单位坐标） */
  get lairEyes(): [number, number, number, number][] {
    return DRAGON_LAIR.eyes;
  }
}
