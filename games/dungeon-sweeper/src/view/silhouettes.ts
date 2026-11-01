import { Rng } from '../core/rng';
import { type Sprite, makeCanvas, rgba, sprite } from './gfx';
import { EYE, PAL } from './palette';
import { LAIR_EYES, RISE_EYES, RISE_OUTLINE, paintLair, paintLairGlow, paintRise, paintRiseGlow } from './dragonArt';
import { SHAPES, type ShapeDef } from './shapes';

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
  lairGlow!: Sprite;
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
    this.rise = this.bakeRise(300, EYE[13]);
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
    const inside = (test: CanvasRenderingContext2D, x: number, y: number): boolean => {
      if (test.isPointInPath(P.fill, x, y)) return true;
      for (const st of P.strokes) {
        test.lineWidth = st.w;
        if (test.isPointInStroke(st.p, x, y)) return true;
      }
      return false;
    };
    return this.finishSil(normal, inside, cssSize, gx, gy, seed);
  }

  /** 由烘好的正常版生成受击白版与碎片。inside 在恒等变换下判定单位坐标是否落在剪影内 */
  private finishSil(normal: Sprite, inside: (test: CanvasRenderingContext2D, x: number, y: number) => boolean, cssSize: number, gx: number, gy: number, seed: number): Sil {
    const d = this.dpr;
    const unitPx = cssSize * d;
    const total = normal.w;
    const off = unitPx * PAD;
    const sc = unitPx / 100;
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
          for (const [sx, sy] of samples) if (inside(test, sx, sy)) hit = true;
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

  /** 屠龙战斗形态：dragonArt 画本体，整体向左上偏移着色得到轮廓光，叠上发光细节与眼睛 */
  private bakeRise(cssSize: number, eye: string): Sil {
    const d = this.dpr;
    const unitPx = cssSize * d;
    const total = Math.ceil(unitPx * (1 + PAD * 2));
    const off = unitPx * PAD;
    const sc = unitPx / 100;
    const [body, bc] = makeCanvas(total, total);
    bc.setTransform(sc, 0, 0, sc, off, off);
    paintRise(bc);
    const rimPx = 1.6 * d;
    const normal = sprite(total, total, (c) => {
      // 轮廓光：本体的琥珀色剪影，向左上与右上各偏一点，只露出边缘
      const [rim, rc] = makeCanvas(total, total);
      rc.drawImage(body, -rimPx, -rimPx);
      rc.drawImage(body, rimPx * 0.6, -rimPx);
      rc.globalCompositeOperation = 'source-in';
      rc.fillStyle = rgba(PAL.amber, 0.9);
      rc.fillRect(0, 0, total, total);
      c.drawImage(rim, 0, 0);
      c.drawImage(body, 0, 0);
      c.setTransform(sc, 0, 0, sc, off, off);
      paintRiseGlow(c, 4 * d);
      for (const [x, y, rx, ry] of RISE_EYES) {
        c.shadowColor = eye;
        c.shadowBlur = 8 * d;
        c.fillStyle = eye;
        c.beginPath();
        c.moveTo(x - rx, y - ry * 0.2);
        c.quadraticCurveTo(x, y - ry * 1.4, x + rx, y + ry * 0.4 * (x < 50 ? 1 : -1));
        c.quadraticCurveTo(x, y + ry * 1.1, x - rx, y - ry * 0.2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,235,0.95)';
        c.beginPath();
        c.ellipse(x, y, rx * 0.22, ry * 0.75, 0, 0, Math.PI * 2);
        c.fill();
      }
    });
    const inside = (test: CanvasRenderingContext2D, x: number, y: number) => test.isPointInPath(RISE_OUTLINE, x, y);
    return this.finishSil(normal, inside, cssSize, 7, 6, 77);
  }

  /** 巢中睡龙：本体（光照之下）+ 发光层（光照之后叠加） */
  private bakeLair(css: number): void {
    const d = this.dpr;
    const px = Math.round(css * d);
    const sc = px / 100;
    const [body, bc] = makeCanvas(px, px);
    bc.setTransform(sc, 0, 0, sc, 0, 0);
    paintLair(bc);
    this.lairBody = sprite(px, px, (c) => {
      // 下缘受巢中余烬映照的暖色轮廓
      const rimPx = 1.1 * d;
      const [rim, rc] = makeCanvas(px, px);
      rc.drawImage(body, 0, rimPx);
      rc.globalCompositeOperation = 'source-in';
      rc.fillStyle = 'rgba(214,96,48,0.7)';
      rc.fillRect(0, 0, px, px);
      c.drawImage(rim, 0, 0);
      c.drawImage(body, 0, 0);
    });
    this.lairGlow = sprite(px, px, (c) => {
      c.setTransform(sc, 0, 0, sc, 0, 0);
      paintLairGlow(c, 4 * d);
    });
  }

  /** 巢中巨龙眼睛位置（单位坐标） */
  get lairEyes(): [number, number, number, number][] {
    return LAIR_EYES;
  }
}
