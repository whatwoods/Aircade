/**
 * 巨龙的程序化画法（文档 §4.6）。全部在 100×100 单位坐标里画，由 silhouettes.ts 烘焙成 sprite。
 *
 * - 巢中睡龙（俯视 3/4）：身躯盘成一圈，双翼收拢在背上，头枕在尾巴上、吻部朝向玩家。
 *   本体画得偏亮，因为它在光照层之下，会被黑暗压暗；发光部分（脊背余烬、鼻息）单独一层。
 * - 屠龙战斗形态（正面直立，参照 art-ref/dragon-ref-a.png）：高举的蝠翼、双对角、粗颈宽胸、贯穿颈腹的熔火人字纹、举起的利爪、粗壮后腿、铲尾。
 *   与小怪一致的「暗色剪影 + 轮廓光」风格，但细节更多。
 */

export type Pt = [number, number];

// ------------------------------------------------------------------ 几何工具

/** Catmull-Rom 采样：经过所有控制点的平滑曲线 */
export function spline(pts: Pt[], seg = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

interface Tube {
  path: Path2D;
  c: Pt[];
  /** 单位法线 */
  n: Pt[];
  /** 单位切线 */
  tg: Pt[];
  w: number[];
}

/** 沿中心线按宽度函数生成的锥形管（躯干、尾巴、角、颈） */
function tube(c: Pt[], wf: (t: number) => number, capStart = true): Tube {
  const n: Pt[] = [];
  const tg: Pt[] = [];
  const w: number[] = [];
  const L = c.length;
  for (let i = 0; i < L; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(L - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    tg.push([tx, ty]);
    n.push([-ty, tx]);
    w.push(wf(i / (L - 1)));
  }
  const p = new Path2D();
  for (let i = 0; i < L; i++) {
    const x = c[i][0] + (n[i][0] * w[i]) / 2;
    const y = c[i][1] + (n[i][1] * w[i]) / 2;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  // 末端圆头
  const e = L - 1;
  p.quadraticCurveTo(c[e][0] + tg[e][0] * w[e] * 0.7, c[e][1] + tg[e][1] * w[e] * 0.7, c[e][0] - (n[e][0] * w[e]) / 2, c[e][1] - (n[e][1] * w[e]) / 2);
  for (let i = L - 2; i >= 0; i--) p.lineTo(c[i][0] - (n[i][0] * w[i]) / 2, c[i][1] - (n[i][1] * w[i]) / 2);
  if (capStart)
    p.quadraticCurveTo(c[0][0] - tg[0][0] * w[0] * 0.7, c[0][1] - tg[0][1] * w[0] * 0.7, c[0][0] + (n[0][0] * w[0]) / 2, c[0][1] + (n[0][1] * w[0]) / 2);
  p.closePath();
  return { path: p, c, n, tg, w };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** 鳞片：沿管身排列的扇形小弧，开口朝尾部 */
function scales(c: CanvasRenderingContext2D, T: Tube, step: number, r: number, from = 0, to = 1, dark = 'rgba(0,0,0,0.5)', lite = 'rgba(255,170,140,0.16)'): void {
  c.save();
  c.clip(T.path);
  const L = T.c.length;
  const i0 = Math.floor(from * (L - 1));
  const i1 = Math.ceil(to * (L - 1));
  let row = 0;
  let acc = 0;
  for (let i = i0 + 1; i <= i1; i++) {
    acc += Math.hypot(T.c[i][0] - T.c[i - 1][0], T.c[i][1] - T.c[i - 1][1]);
    if (acc < step) continue;
    acc = 0;
    row++;
    const [cx, cy] = T.c[i];
    const [nx, ny] = T.n[i];
    const [tx, ty] = T.tg[i];
    const half = T.w[i] / 2;
    const a0 = Math.atan2(ty, tx) - Math.PI / 2;
    for (let j = -half + (row % 2 ? step * 0.5 : 0); j <= half; j += step) {
      const x = cx + nx * j;
      const y = cy + ny * j;
      c.strokeStyle = dark;
      c.lineWidth = r * 0.32;
      c.beginPath();
      c.arc(x, y, r, a0, a0 + Math.PI);
      c.stroke();
      c.strokeStyle = lite;
      c.lineWidth = r * 0.18;
      c.beginPath();
      c.arc(x - tx * r * 0.25, y - ty * r * 0.25, r, a0 + 0.3, a0 + Math.PI - 0.3);
      c.stroke();
    }
  }
  c.restore();
}

/** 在管身中心线上取 t 处的点、法线、切线、宽度 */
function at(T: Tube, t: number): { p: Pt; n: Pt; tg: Pt; w: number } {
  const i = Math.max(0, Math.min(T.c.length - 1, Math.round(t * (T.c.length - 1))));
  return { p: T.c[i], n: T.n[i], tg: T.tg[i], w: T.w[i] };
}

/** 背脊刺：管身中线上一排朝尾部倒伏的三角 */
function spikes(c: CanvasRenderingContext2D, T: Tube, from: number, to: number, count: number, size: number, fill: string, edge: string, skip?: (p: Pt) => boolean): void {
  for (let k = 0; k < count; k++) {
    const t = lerp(from, to, count === 1 ? 0.5 : k / (count - 1));
    const { p, n, tg } = at(T, t);
    if (skip?.(p)) continue;
    const s = size * (0.75 + 0.25 * Math.sin((k / count) * Math.PI));
    const bx = p[0] - tg[0] * s * 0.5;
    const by = p[1] - tg[1] * s * 0.5;
    const tipX = p[0] + tg[0] * s * 1.1 + n[0] * s * 0.15;
    const tipY = p[1] + tg[1] * s * 1.1 + n[1] * s * 0.15;
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(bx + n[0] * s * 0.45, by + n[1] * s * 0.45);
    c.lineTo(tipX, tipY);
    c.lineTo(bx - n[0] * s * 0.45, by - n[1] * s * 0.45);
    c.closePath();
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = s * 0.12;
    c.beginPath();
    c.moveTo(bx + n[0] * s * 0.45, by + n[1] * s * 0.45);
    c.lineTo(tipX, tipY);
    c.stroke();
  }
}

/** 骨角：弯曲锥形，骨色渐变 + 环纹 */
function horn(c: CanvasRenderingContext2D, pts: Pt[], w0: number, base: string, tip: string): Tube {
  const T = tube(spline(pts, 8), (t) => lerp(w0, 0.25, Math.pow(t, 0.8)));
  const a = T.c[0];
  const b = T.c[T.c.length - 1];
  const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
  g.addColorStop(0, base);
  g.addColorStop(1, tip);
  c.fillStyle = g;
  c.fill(T.path);
  c.save();
  c.clip(T.path);
  c.strokeStyle = 'rgba(30,18,12,0.45)';
  c.lineWidth = 0.35;
  for (let t = 0.12; t < 0.8; t += 0.13) {
    const { p, n, w } = at(T, t);
    c.beginPath();
    c.moveTo(p[0] + n[0] * w * 0.6, p[1] + n[1] * w * 0.6);
    c.lineTo(p[0] - n[0] * w * 0.6, p[1] - n[1] * w * 0.6);
    c.stroke();
  }
  c.restore();
  return T;
}

/** 爪子：小掌 + 三根弯钩（rot 弧度，0 = 爪尖朝下） */
function claw(c: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, body: string, nail: string, rot = 0): void {
  if (rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    claw(c, 0, 0, s, dir, body, nail);
    c.restore();
    return;
  }
  c.fillStyle = body;
  c.beginPath();
  c.ellipse(x, y, 2.6 * s, 2 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = nail;
  c.lineCap = 'round';
  c.lineWidth = 0.75 * s;
  for (let k = -1; k <= 1; k++) {
    const bx = x + k * 1.6 * s;
    const by = y + 1.2 * s;
    c.beginPath();
    c.moveTo(bx, by);
    c.quadraticCurveTo(bx + k * 0.6 * s + dir * 0.3 * s, by + 1.8 * s, bx + k * 0.2 * s - dir * 0.4 * s, by + 2.6 * s);
    c.stroke();
  }
}

// ------------------------------------------------------------------ 巢中睡龙

/** 睡龙的眼睛（单位坐标 [x, y, rx, ry]），DragonView 在光后层画开合 */
export const LAIR_EYES: [number, number, number, number][] = [
  [44.2, 68.5, 3, 1.1],
  [55.8, 68.5, 3, 1.1],
];
/** 鼻孔（鼻息烟雾与余烬的位置） */
export const LAIR_NOSTRILS: Pt[] = [
  [47.6, 84.2],
  [52.4, 84.2],
];

const LAIR = (() => {
  // 身躯：从头下的颈根出发，逆时针绕一圈到右后方，尾巴从右侧绕到前方、经下巴下面伸向左
  const body = spline(
    [
      [50, 64],
      [37, 63],
      [27, 54],
      [25, 41],
      [32, 30],
      [45, 24],
      [58, 25],
      [70, 32],
      [76, 45],
      [75, 58],
      [69, 69],
      [60, 79],
      [48, 87],
      [34, 90],
      [22, 87],
      [15, 79],
      [16, 70],
      [21, 66],
    ],
    10,
  );
  // 0..0.62 是躯干，之后是尾巴
  const bodyT = tube(body, (t) => {
    if (t < 0.08) return lerp(13, 16, t / 0.08);
    if (t < 0.4) return 17;
    if (t < 0.62) return lerp(17, 11, smooth((t - 0.4) / 0.22));
    return lerp(11, 1.2, Math.pow((t - 0.62) / 0.38, 0.9));
  });
  // 收拢的双翼盖住盘圈中央：前缘沿身躯外侧，后缘三道扇贝收到中线
  const wingL = new Path2D('M47 62 C38 56 29 48 25 38 C22 31 21 24 20.5 17 C24 21 27 23 30 24 Q33 28.5 38 26 Q42 30.5 46 29.5 Q47.5 32 50.5 34 L50.5 58 Z');
  const wingR = new Path2D('M53 62 C62 56 71 48 75 38 C78 31 79 24 79.5 17 C76 21 73 23 70 24 Q67 28.5 62 26 Q58 30.5 54 29.5 Q52.5 32 49.5 34 L49.5 58 Z');
  const head = new Path2D(
    'M41 61 C42 56 58 56 59 61 C61 64 61.5 67 60 71 C58.5 76 56 80 55.2 84 C54.6 87 52.5 89 50 89 C47.5 89 45.4 87 44.8 84 C44 80 41.5 76 40 71 C38.5 67 39 64 41 61 Z',
  );
  return { bodyT, wingL, wingR, head };
})();

/** 睡龙本体（光照层之下） */
export function paintLair(c: CanvasRenderingContext2D): void {
  const { bodyT, wingL, wingR, head } = LAIR;
  const SKIN = '#40292c';
  const SKIN_DK = '#24161a';
  // 投影
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.save();
  c.translate(1.2, 2);
  c.fill(bodyT.path);
  c.restore();
  // 躯干与尾巴
  const g = c.createRadialGradient(50, 58, 4, 50, 58, 44);
  g.addColorStop(0, SKIN_DK);
  g.addColorStop(0.55, SKIN);
  g.addColorStop(1, '#4e3230');
  c.fillStyle = g;
  c.fill(bodyT.path);
  scales(c, bodyT, 2.6, 1.35, 0, 1, 'rgba(0,0,0,0.38)', 'rgba(255,170,140,0.09)');
  // 腹侧（外缘）受巢中余烬映照
  c.save();
  c.clip(bodyT.path);
  const ug = c.createLinearGradient(0, 40, 0, 100);
  ug.addColorStop(0, 'rgba(255,110,50,0)');
  ug.addColorStop(1, 'rgba(255,110,50,0.22)');
  c.fillStyle = ug;
  c.fillRect(0, 0, 100, 100);
  c.restore();
  // 尾巴末端的骨刺尖
  const tail = at(bodyT, 1);
  c.fillStyle = '#6a4436';
  c.beginPath();
  c.moveTo(tail.p[0] + tail.n[0] * 2.2, tail.p[1] + tail.n[1] * 2.2);
  c.lineTo(tail.p[0] + tail.tg[0] * 4.5, tail.p[1] + tail.tg[1] * 4.5);
  c.lineTo(tail.p[0] - tail.n[0] * 2.2, tail.p[1] - tail.n[1] * 2.2);
  c.closePath();
  c.fill();
  // 背脊刺（翅膀盖住的部分跳过）
  const under = (q: Pt) => c.isPointInPath(wingL, q[0], q[1]) || c.isPointInPath(wingR, q[0], q[1]);
  spikes(c, bodyT, 0.05, 0.95, 26, 2.4, '#1e0f11', 'rgba(255,150,110,0.35)', (p) => underUnit(c, under, p));
  // 收拢的双翼
  for (const [w, sx] of [
    [wingL, -1],
    [wingR, 1],
  ] as [Path2D, number][]) {
    const wg = c.createLinearGradient(50, 55, 50 + sx * 30, 20);
    wg.addColorStop(0, '#24141a');
    wg.addColorStop(1, '#3a2226');
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.save();
    c.translate(0.8, 1.4);
    c.fill(w);
    c.restore();
    c.fillStyle = wg;
    c.fill(w);
    c.save();
    c.clip(w);
    // 翼膜褶皱：从肩部放射
    c.strokeStyle = 'rgba(20,8,10,0.55)';
    c.lineWidth = 0.7;
    for (const [tx, ty] of [
      [50 + sx * 20, 24.5],
      [50 + sx * 12, 26.5],
      [50 + sx * 4, 30],
    ] as Pt[]) {
      c.beginPath();
      c.moveTo(sx < 0 ? 46 : 54, 59);
      c.quadraticCurveTo(lerp(sx < 0 ? 46 : 54, tx, 0.5) + sx * 3, lerp(59, ty, 0.5), tx, ty);
      c.stroke();
    }
    c.restore();
    // 前缘翼骨（外侧边）
    c.strokeStyle = '#6c4038';
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(sx < 0 ? 47 : 53, 62);
    c.bezierCurveTo(sx < 0 ? 38 : 62, 56, sx < 0 ? 29 : 71, 48, sx < 0 ? 25 : 75, 38);
    c.bezierCurveTo(sx < 0 ? 22 : 78, 31, sx < 0 ? 21 : 79, 24, sx < 0 ? 20.5 : 79.5, 18);
    c.stroke();
    c.strokeStyle = 'rgba(255,180,140,0.35)';
    c.lineWidth = 0.45;
    c.stroke();
    // 腕爪
    c.fillStyle = '#c9b48f';
    c.beginPath();
    c.moveTo(sx < 0 ? 19 : 81, 15);
    c.lineTo(sx < 0 ? 22.2 : 77.8, 19.5);
    c.lineTo(sx < 0 ? 19.2 : 80.8, 19.8);
    c.closePath();
    c.fill();
  }
  // 前爪：搭在头两侧
  claw(c, 38.5, 80.5, 1, -1, '#4e2c2c', '#cbb894');
  claw(c, 61.5, 80.5, 1, 1, '#4e2c2c', '#cbb894');
  // 角（压在背上，朝后）
  horn(c, [[44, 60.5], [40, 55], [35.5, 51.5], [31, 50]], 3.4, '#c8b38c', '#4a3a2e');
  horn(c, [[56, 60.5], [60, 55], [64.5, 51.5], [69, 50]], 3.4, '#c8b38c', '#4a3a2e');
  // 头
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.save();
  c.translate(0.8, 1.6);
  c.fill(head);
  c.restore();
  const hg = c.createLinearGradient(0, 56, 0, 89);
  hg.addColorStop(0, '#3a2022');
  hg.addColorStop(0.6, '#5a3432');
  hg.addColorStop(1, '#6e4238');
  c.fillStyle = hg;
  c.fill(head);
  c.save();
  c.clip(head);
  // 眉骨
  c.fillStyle = 'rgba(15,6,8,0.55)';
  c.beginPath();
  c.ellipse(44.2, 66.6, 4.4, 1.8, 0.25, 0, Math.PI * 2);
  c.ellipse(55.8, 66.6, 4.4, 1.8, -0.25, 0, Math.PI * 2);
  c.fill();
  // 吻部中脊与鳞纹
  c.strokeStyle = 'rgba(255,170,130,0.28)';
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(50, 60);
  c.lineTo(50, 82);
  c.stroke();
  c.strokeStyle = 'rgba(15,6,8,0.45)';
  c.lineWidth = 0.4;
  for (let y = 72; y < 84; y += 2.4) {
    c.beginPath();
    c.moveTo(46 + (y - 72) * 0.12, y);
    c.quadraticCurveTo(50, y + 1.3, 54 - (y - 72) * 0.12, y);
    c.stroke();
  }
  c.restore();
  // 颊刺
  c.fillStyle = '#2a1416';
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.moveTo(50 + sx * 10.5, 66);
    c.lineTo(50 + sx * 14, 70.5);
    c.lineTo(50 + sx * 9.5, 71);
    c.closePath();
    c.fill();
  }
  // 鼻孔
  c.fillStyle = '#0c0506';
  for (const [x, y] of LAIR_NOSTRILS) {
    c.beginPath();
    c.ellipse(x, y, 1, 0.7, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** isPointInPath 用的是当前变换；单位坐标的判定在恒等变换下做 */
function underUnit(c: CanvasRenderingContext2D, fn: (p: Pt) => boolean, p: Pt): boolean {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const r = fn(p);
  c.restore();
  return r;
}

/** 睡龙的发光层（光照之后、叠加混合）：背脊余烬、喉下炉火、鼻息 */
export function paintLairGlow(c: CanvasRenderingContext2D, shadowBlur: number): void {
  const { bodyT, wingL, wingR } = LAIR;
  const hidden = (p: Pt) => {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    const r = c.isPointInPath(wingL, p[0], p[1]) || c.isPointInPath(wingR, p[0], p[1]) || (p[1] > 58 && Math.abs(p[0] - 50) < 11);
    c.restore();
    return r;
  };
  c.lineCap = 'round';
  c.shadowColor = '#FF3B1F';
  c.shadowBlur = shadowBlur;
  // 背脊鳞缝里的余烬：沿中线连续的裂缝，亮度起伏不规则
  const N = 90;
  const heat = (k: number) => Math.max(0, Math.sin(k * 0.37) * 0.6 + Math.sin(k * 0.91 + 1.3) * 0.5 + 0.15);
  for (const [col, lw, core] of [
    ['255,84,36', 1, false],
    ['255,214,150', 0.32, true],
  ] as [string, number, boolean][]) {
    c.shadowBlur = core ? 0 : shadowBlur;
    c.lineWidth = lw;
    for (let k = 0; k < N - 1; k++) {
      const t0 = 0.04 + (k / N) * 0.86;
      const t1 = 0.04 + ((k + 1) / N) * 0.86;
      const a = at(bodyT, t0).p;
      const b = at(bodyT, t1).p;
      if (hidden(a) || hidden(b)) continue;
      const h = heat(k);
      const al = core ? Math.max(0, h - 0.45) * 1.6 : Math.min(1, h);
      if (al < 0.04) continue;
      c.strokeStyle = `rgba(${col},${al.toFixed(2)})`;
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.stroke();
    }
  }
  c.shadowBlur = 0;
  // 翼骨关节的暗火
  c.fillStyle = 'rgba(255,90,40,0.55)';
  for (const [x, y] of [
    [31, 28],
    [69, 28],
  ] as Pt[]) {
    c.beginPath();
    c.arc(x, y, 0.9, 0, Math.PI * 2);
    c.fill();
  }
  // 鼻孔里的火光
  c.shadowBlur = shadowBlur * 0.8;
  c.fillStyle = 'rgba(255,120,50,0.95)';
  for (const [x, y] of LAIR_NOSTRILS) {
    c.beginPath();
    c.ellipse(x, y, 0.8, 0.5, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.shadowBlur = 0;
}

// ------------------------------------------------------------------ 屠龙战斗形态

/** 战斗形态的口中火核（单位坐标），龙息从这里喷出 */
export const RISE_MOUTH: Pt = [50, 24.4];
/** 战斗形态的眼睛 [x, y, rx, ry] */
export const RISE_EYES: [number, number, number, number][] = [
  [45.9, 15, 1.95, 0.92],
  [54.1, 15, 1.95, 0.92],
];

/** 头部整体放大：以 (50, 18) 为中心 ×1.15（RISE_MOUTH / RISE_EYES 已按放大后的位置给出） */
const HEAD_XF = new DOMMatrix().translate(50, 18).scale(1.15).translate(-50, -18);
const headXf = (c: CanvasRenderingContext2D): void => {
  c.save();
  c.transform(HEAD_XF.a, HEAD_XF.b, HEAD_XF.c, HEAD_XF.d, HEAD_XF.e, HEAD_XF.f);
};

const RISE = (() => {
  const mirror = (p: Pt): Pt => [100 - p[0], p[1]];
  const id = (p: Pt) => p;
  // 翅膀（左；右翼镜像）：臂骨 肩 → 肘 → 高举的腕，五根指骨从腕向下散开，翼膜在指尖间向腕部凹
  const shoulder: Pt = [39, 40];
  const elbow: Pt = [30.5, 28];
  const wrist: Pt = [30, 7];
  const tips: Pt[] = [
    [15.5, 11],
    [4.5, 27],
    [0.5, 46],
    [3, 62],
    [15.5, 70],
  ];
  const hip: Pt = [38.5, 62];
  const wingPath = (m: (p: Pt) => Pt): Path2D => {
    const P = new Path2D();
    const w = m(wrist);
    const sh = m(shoulder);
    P.moveTo(sh[0], sh[1]);
    const el = m(elbow);
    P.lineTo(el[0], el[1]);
    P.lineTo(w[0], w[1]);
    let prev = w;
    for (const tp of tips) {
      const b = m(tp);
      const mx = (prev[0] + b[0]) / 2;
      const my = (prev[1] + b[1]) / 2;
      if (prev === w) P.lineTo(b[0], b[1]);
      else P.quadraticCurveTo(lerp(mx, w[0], 0.3), lerp(my, w[1], 0.3), b[0], b[1]);
      prev = b;
    }
    const h = m(hip);
    P.quadraticCurveTo(lerp((prev[0] + h[0]) / 2, w[0], 0.2), lerp((prev[1] + h[1]) / 2, w[1], 0.2), h[0], h[1]);
    P.closePath();
    return P;
  };
  const wingArm = (m: (p: Pt) => Pt) => tube(spline(([shoulder, [34, 33], elbow, [29, 18], wrist] as Pt[]).map(m), 8), (t) => lerp(5.2, 3, t));
  const neck = tube(
    spline(
      [
        [50, 24],
        [50, 31],
        [50, 40],
      ],
      8,
    ),
    (t) => lerp(11, 18, smooth(t)),
  );
  // 楔形龙头：额顶窄、眉宽、颊外凸、下颌收拢
  const head = new Path2D('M50 8.2 L54 9.8 L57.4 12.6 L58.8 16 L57.4 19.6 L55.8 22.4 L53.8 27 L50 28.8 L46.2 27 L44.2 22.4 L42.6 19.6 L41.2 16 L42.6 12.6 L46 9.8 Z');
  // 宽胸厚背的躯干
  const torso = new Path2D('M36.5 40.5 C40 35.6 60 35.6 63.5 40.5 C66.6 45.5 66 52.5 63.4 57.5 C61.8 61 61.2 64 61.6 67 C62 71.5 58 75.5 54 76.5 L46 76.5 C42 75.5 38 71.5 38.4 67 C38.8 64 38.2 61 36.6 57.5 C34 52.5 33.4 45.5 36.5 40.5 Z');
  // 下颌到胯下的浅色腹带（halfWidth(y) 供人字纹取宽度）
  const bellyHW = (y: number): number => {
    if (y < 37) return lerp(3.6, 5.6, (y - 26) / 11);
    if (y < 50) return lerp(5.6, 8.2, smooth((y - 37) / 13));
    if (y < 66) return lerp(8.2, 7, (y - 50) / 16);
    return Math.max(0.5, lerp(7, 0.5, (y - 66) / 11));
  };
  const belly = new Path2D();
  belly.moveTo(50 - bellyHW(26), 26);
  for (let y = 26.5; y <= 77; y += 0.5) belly.lineTo(50 - bellyHW(y), y);
  for (let y = 77; y >= 26; y -= 0.5) belly.lineTo(50 + bellyHW(y), y);
  belly.closePath();
  // 前肢（左；右镜像）：上臂外撑向下，前臂向上举起，掌在胸侧
  const arm = (m: (p: Pt) => Pt) => ({
    upper: tube(spline(([[39, 42], [33.5, 47.5], [30.5, 53.5]] as Pt[]).map(m), 8), (t) => lerp(9, 6.6, t)),
    fore: tube(spline(([[30.5, 53.5], [27.5, 49], [25.6, 44.5]] as Pt[]).map(m), 8), (t) => lerp(6.6, 5.4, t)),
  });
  // 后腿（左；右镜像）：粗大腿 → 膝 → 小腿 → 宽脚掌
  const leg = (m: (p: Pt) => Pt) => ({
    thigh: tube(spline(([[44, 62], [38.5, 66.5], [35.5, 74]] as Pt[]).map(m), 8), (t) => lerp(14, 10, t)),
    shin: tube(spline(([[35.5, 74], [35, 80], [35.5, 86]] as Pt[]).map(m), 8), (t) => lerp(8.4, 6.2, t)),
    foot: tube(spline(([[35.5, 85], [35, 89], [34.5, 92]] as Pt[]).map(m), 6), (t) => lerp(6.4, 8, t)),
  });
  const tail = tube(
    spline(
      [
        [56, 71],
        [63, 81],
        [73, 88],
        [84, 87],
        [90.5, 80],
        [92, 72],
      ],
      12,
    ),
    (t) => lerp(10, 2.4, Math.pow(t, 0.9)),
  );
  // 铲形尾鳍
  const fin = new Path2D('M92 73.5 C87.4 70.6 86.4 64 90.6 56.4 C91.4 60.4 94.6 61.8 99.2 61 C96.8 64 97.6 68.6 92 73.5 Z');
  const L = { wing: wingPath(id), wingArm: wingArm(id), arm: arm(id), leg: leg(id) };
  const Rt = { wing: wingPath(mirror), wingArm: wingArm(mirror), arm: arm(mirror), leg: leg(mirror) };
  // 剪影外形（碎片取样与受击闪白用）
  const outline = new Path2D();
  for (const side of [L, Rt]) {
    outline.addPath(side.wing);
    for (const t of [side.wingArm, side.arm.upper, side.arm.fore, side.leg.thigh, side.leg.shin, side.leg.foot]) outline.addPath(t.path);
  }
  for (const p of [neck.path, torso, tail.path, fin]) outline.addPath(p);
  outline.addPath(head, HEAD_XF);
  return { L, R: Rt, neck, head, torso, belly, bellyHW, tail, fin, outline, tips, wrist, mirror, id };
})();

export const RISE_OUTLINE: Path2D = RISE.outline;

const BONE = '#d9c7a2';
const BONE_TIP = '#7a6650';

/** 弯钩（爪 / 腕爪）：骨色锥管 */
function hook(c: CanvasRenderingContext2D, pts: Pt[], w0: number): void {
  const T = tube(spline(pts, 6), (t) => lerp(w0, 0.2, Math.pow(t, 0.9)));
  const a = T.c[0];
  const b = T.c[T.c.length - 1];
  const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
  g.addColorStop(0, BONE_TIP);
  g.addColorStop(0.35, BONE);
  g.addColorStop(1, '#f2e6cc');
  c.fillStyle = g;
  c.fill(T.path);
}

/** 战斗形态本体（不含轮廓光，轮廓光由烘焙时整体偏移着色叠在下面） */
export function paintRise(c: CanvasRenderingContext2D): void {
  const R = RISE;
  const body = (y0: number, y1: number) => {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#2c2029');
    g.addColorStop(1, '#130d14');
    return g;
  };
  const skin = (T: Tube, y0: number, y1: number, step = 2.1, r = 1) => {
    c.fillStyle = body(y0, y1);
    c.fill(T.path);
    scales(c, T, step, r, 0, 1, 'rgba(0,0,0,0.55)', 'rgba(255,150,110,0.12)');
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // 尾巴与尾鳍（最后面）
  skin(R.tail, 70, 92, 2.4, 1.2);
  spikes(c, R.tail, 0.12, 0.85, 8, 2.4, '#140d14', 'rgba(255,150,90,0.25)');
  const fg = c.createLinearGradient(88, 74, 96, 61);
  fg.addColorStop(0, '#2a1418');
  fg.addColorStop(1, '#8a2a1a');
  c.fillStyle = fg;
  c.fill(R.fin);
  // 翅膀
  for (const [side, m, dir] of [
    [R.L, R.id, -1],
    [R.R, R.mirror, 1],
  ] as const) {
    const w = m(R.wrist);
    const mg = c.createLinearGradient(w[0], w[1], m([14, 60])[0], 60);
    mg.addColorStop(0, '#24121a');
    mg.addColorStop(0.45, '#5e1a1c');
    mg.addColorStop(0.8, '#a2321d');
    mg.addColorStop(1, '#c4461f');
    c.fillStyle = mg;
    c.fill(side.wing);
    c.save();
    c.clip(side.wing);
    // 指骨两侧的暗影，靠近骨头的膜更暗
    for (const tp of R.tips) {
      const t = m(tp);
      c.strokeStyle = 'rgba(20,6,10,0.55)';
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(w[0], w[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
    }
    // 翼膜细脉
    c.strokeStyle = 'rgba(40,8,10,0.35)';
    c.lineWidth = 0.3;
    for (let k = 0; k < R.tips.length - 1; k++) {
      const a = m(R.tips[k]);
      const b = m(R.tips[k + 1]);
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      c.beginPath();
      c.moveTo(w[0], w[1]);
      c.quadraticCurveTo(lerp(w[0], mx, 0.5) + dir, lerp(w[1], my, 0.5), mx, my);
      c.stroke();
    }
    c.restore();
    // 指骨
    for (let k = 0; k < R.tips.length; k++) {
      const t = m(R.tips[k]);
      c.strokeStyle = '#21161f';
      c.lineWidth = 1.5 - k * 0.15;
      c.beginPath();
      c.moveTo(w[0], w[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
    }
    // 臂骨
    skin(side.wingArm, 5, 42, 1.8, 0.8);
    // 腕爪：向内卷的大骨钩
    hook(c, [m([30.5, 8]), m([28.6, 3.6]), m([31, 0.8]), m([34.6, 1.4])], 3.6);
    hook(c, [m([28.5, 9.5]), m([25.5, 8.2]), m([24.2, 10.6])], 1.6);
  }
  // 颈与躯干
  c.fillStyle = body(24, 42);
  c.fill(R.neck.path);
  scales(c, R.neck, 2, 0.95, 0, 1, 'rgba(0,0,0,0.5)', 'rgba(255,150,110,0.12)');
  c.fillStyle = body(36, 77);
  c.fill(R.torso);
  c.save();
  c.clip(R.torso);
  for (let y = 38; y < 77; y += 2.2) {
    for (let x = 33 + ((y / 2.2) % 2) * 1.1; x < 67; x += 2.2) {
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 0.32;
      c.beginPath();
      c.arc(x, y, 1.05, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    }
  }
  // 胸肌分块的暗影
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(40.5, 47, 4.5, 6, 0.3, 0, Math.PI * 2);
  c.ellipse(59.5, 47, 4.5, 6, -0.3, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // 后腿：先小腿与脚掌，再压大腿
  for (const [side, dir] of [
    [R.L, -1],
    [R.R, 1],
  ] as const) {
    skin(side.leg.foot, 84, 94, 1.6, 0.8);
    skin(side.leg.shin, 74, 88, 1.8, 0.85);
    // 跗关节骨刺
    const h = at(side.leg.shin, 0.75);
    c.fillStyle = '#140d14';
    c.beginPath();
    c.moveTo(h.p[0] + dir * 2.6, h.p[1] - 1.6);
    c.lineTo(h.p[0] + dir * 6, h.p[1] - 0.4);
    c.lineTo(h.p[0] + dir * 2.8, h.p[1] + 1.4);
    c.closePath();
    c.fill();
    skin(side.leg.thigh, 60, 80, 2.2, 1.05);
    // 大腿肌肉的高光棱
    c.strokeStyle = 'rgba(255,160,110,0.16)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(50 + dir * 8, 63);
    c.quadraticCurveTo(50 + dir * 16, 66, 50 + dir * 17.5, 73);
    c.stroke();
    // 四根趾爪
    const f = at(side.leg.foot, 1);
    for (let k = 0; k < 4; k++) {
      const bx = f.p[0] + (k - 1.5) * 2.4;
      const by = f.p[1] + 0.6;
      const out = (k - 1.5) * 0.9;
      hook(c, [[bx, by], [bx + out, by + 3.2], [bx + out * 1.8 + dir * -0.4, by + 5.6]], 1.9);
    }
  }
  // 腹带
  const bg = c.createLinearGradient(0, 26, 0, 77);
  bg.addColorStop(0, '#4a3230');
  bg.addColorStop(0.5, '#5a3a32');
  bg.addColorStop(1, '#3a2624');
  c.fillStyle = bg;
  c.fill(R.belly);
  c.save();
  c.clip(R.belly);
  for (let y = 30; y < 77; y += 3.8) {
    const hw = R.bellyHW(y);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    c.moveTo(50 - hw, y - 2.2);
    c.lineTo(50, y);
    c.lineTo(50 + hw, y - 2.2);
    c.lineTo(50 + hw, y - 1.4);
    c.lineTo(50, y + 0.9);
    c.lineTo(50 - hw, y - 1.4);
    c.closePath();
    c.fill();
  }
  c.restore();
  // 前肢与利爪
  for (const [side, dir] of [
    [R.L, -1],
    [R.R, 1],
  ] as const) {
    skin(side.arm.fore, 42, 56, 1.8, 0.85);
    skin(side.arm.upper, 40, 56, 2, 0.95);
    // 肘刺
    const e = at(side.arm.upper, 1);
    c.fillStyle = '#140d14';
    c.beginPath();
    c.moveTo(e.p[0] + dir * 1.6, e.p[1] - 1.6);
    c.lineTo(e.p[0] + dir * 5.2, e.p[1] + 2.6);
    c.lineTo(e.p[0] - dir * 0.4, e.p[1] + 2.4);
    c.closePath();
    c.fill();
    // 手掌
    const hx = 50 + dir * 24.4;
    c.save();
    c.translate(hx, 43);
    c.scale(1.3, 1.3);
    c.translate(-hx, -43);
    c.fillStyle = '#1e161e';
    c.beginPath();
    c.ellipse(hx, 43, 3.6, 3, 0, 0, Math.PI * 2);
    c.fill();
    // 三根向上弯的指爪 + 一根拇指爪
    hook(c, [[hx + dir * 2.6, 41.4], [hx + dir * 4.4, 38.4], [hx + dir * 3.4, 35.6]], 2);
    hook(c, [[hx, 40.4], [hx + dir * 0.6, 36.6], [hx - dir * 1, 34.4]], 2.1);
    hook(c, [[hx - dir * 2.6, 41], [hx - dir * 3.6, 37.8], [hx - dir * 5.6, 36.8]], 1.9);
    hook(c, [[hx - dir * 3, 44.6], [hx - dir * 5.8, 44.4], [hx - dir * 6.6, 42.2]], 1.6);
    c.restore();
  }
  // 头部（整体放大）
  headXf(c);
  // 角：主角向上外翻再内勾，副角向外下卷
  for (const m of [R.id, R.mirror]) {
    horn(c, [m([46.2, 10.6]), m([43, 6.6]), m([42.4, 3]), m([45.2, 0.8])], 3.4, BONE, '#8a7656');
    horn(c, [m([43.2, 13.6]), m([39, 12.6]), m([36.8, 15]), m([37.8, 18.2])], 2.4, BONE, '#8a7656');
  }
  // 颊侧锯齿鳍
  c.fillStyle = '#160e15';
  for (const m of [R.id, R.mirror]) {
    c.beginPath();
    const pts: Pt[] = [
      [42.6, 17.5],
      [38.2, 18.6],
      [42.2, 19.8],
      [38.6, 21.6],
      [43, 22],
      [40.2, 24.6],
      [44.4, 24],
    ];
    const p0 = m(pts[0]);
    c.moveTo(p0[0], p0[1]);
    for (const p of pts.slice(1)) {
      const q = m(p);
      c.lineTo(q[0], q[1]);
    }
    c.closePath();
    c.fill();
  }
  // 头
  const hg = c.createLinearGradient(0, 8, 0, 29);
  hg.addColorStop(0, '#30232c');
  hg.addColorStop(1, '#120c12');
  c.fillStyle = hg;
  c.fill(R.head);
  // 头顶冠刺
  c.fillStyle = '#160e15';
  for (const [x, y, h] of [
    [50, 9, 4.6],
    [47.6, 10, 3],
    [52.4, 10, 3],
  ] as const) {
    c.beginPath();
    c.moveTo(x - 1.1, y + 0.6);
    c.lineTo(x, y - h);
    c.lineTo(x + 1.1, y + 0.6);
    c.closePath();
    c.fill();
  }
  c.save();
  c.clip(R.head);
  // 怒眉
  c.fillStyle = '#0a070b';
  c.beginPath();
  c.moveTo(42, 13.4);
  c.lineTo(49.2, 15.2);
  c.lineTo(48.8, 16.6);
  c.lineTo(42.4, 15.4);
  c.closePath();
  c.moveTo(58, 13.4);
  c.lineTo(50.8, 15.2);
  c.lineTo(51.2, 16.6);
  c.lineTo(57.6, 15.4);
  c.closePath();
  c.fill();
  // 吻部中脊与鼻孔
  c.strokeStyle = 'rgba(255,160,110,0.18)';
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(50, 9.5);
  c.lineTo(50, 19.5);
  c.stroke();
  c.fillStyle = '#060406';
  c.beginPath();
  c.ellipse(48.4, 19.4, 0.7, 0.4, 0.4, 0, Math.PI * 2);
  c.ellipse(51.6, 19.4, 0.7, 0.4, -0.4, 0, Math.PI * 2);
  c.fill();
  // 张开的口
  c.fillStyle = '#1a0606';
  c.beginPath();
  c.moveTo(45.6, 21);
  c.quadraticCurveTo(50, 19.8, 54.4, 21);
  c.lineTo(51.8, 26.6);
  c.quadraticCurveTo(50, 27.8, 48.2, 26.6);
  c.closePath();
  c.fill();
  c.restore();
  // 獠牙：上颌两根长、下颌两根短
  c.fillStyle = '#ecdcbc';
  for (const [x, y0, len] of [
    [46.6, 21, 3],
    [53.4, 21, 3],
    [48.6, 26.6, -2],
    [51.4, 26.6, -2],
  ] as const) {
    c.beginPath();
    c.moveTo(x - 0.6, y0);
    c.lineTo(x, y0 + len);
    c.lineTo(x + 0.6, y0);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** 战斗形态的发光细节（叠在本体上，随 sprite 一起烘焙） */
export function paintRiseGlow(c: CanvasRenderingContext2D, shadowBlur: number): void {
  const R = RISE;
  c.shadowColor = '#FF3B1F';
  c.shadowBlur = shadowBlur;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // 腹带人字纹：体内熔炉，胸口最亮
  c.save();
  c.clip(R.belly);
  c.shadowBlur = shadowBlur * 0.5;
  for (let y = 30; y < 77; y += 3.8) {
    const hw = R.bellyHW(y) * 0.9;
    const k = Math.abs(y - 50) / 27;
    c.strokeStyle = `rgba(255,${Math.round(lerp(180, 100, k))},50,${lerp(0.95, 0.5, k).toFixed(2)})`;
    c.lineWidth = lerp(0.55, 0.35, k);
    c.beginPath();
    c.moveTo(50 - hw, y - 1.9);
    c.lineTo(50, y + 0.4);
    c.lineTo(50 + hw, y - 1.9);
    c.stroke();
  }
  c.restore();
  // 尾巴腹侧的熔缝：一条细线，越往尾尖越暗
  c.lineWidth = 0.4;
  for (let i = Math.round(R.tail.c.length * 0.32); i < R.tail.c.length * 0.8; i++) {
    const a = R.tail.c[i - 1];
    const b = R.tail.c[i];
    const t = i / R.tail.c.length;
    const off = -R.tail.w[i] * 0.22;
    c.strokeStyle = `rgba(255,120,40,${lerp(0.75, 0.1, (t - 0.32) / 0.48).toFixed(2)})`;
    c.beginPath();
    c.moveTo(a[0] + R.tail.n[i - 1][0] * off, a[1] + R.tail.n[i - 1][1] * off);
    c.lineTo(b[0] + R.tail.n[i][0] * off, b[1] + R.tail.n[i][1] * off);
    c.stroke();
  }
  c.shadowBlur = shadowBlur;
  // 口中火光
  headXf(c);
  const mg = c.createRadialGradient(50, 24, 0.4, 50, 24, 4);
  mg.addColorStop(0, 'rgba(255,230,140,1)');
  mg.addColorStop(0.5, 'rgba(255,130,40,0.95)');
  mg.addColorStop(1, 'rgba(200,40,20,0.6)');
  c.fillStyle = mg;
  c.beginPath();
  c.moveTo(46.4, 21.4);
  c.quadraticCurveTo(50, 20.6, 53.6, 21.4);
  c.lineTo(51.4, 26.2);
  c.quadraticCurveTo(50, 27, 48.6, 26.2);
  c.closePath();
  c.fill();
  c.restore();
  c.shadowBlur = 0;
}
