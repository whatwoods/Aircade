/**
 * 巨龙的程序化画法（文档 §4.6）。全部在 100×100 单位坐标里画，由 silhouettes.ts 烘焙成 sprite。
 *
 * - 巢中睡龙（俯视 3/4）：身躯盘成一圈，双翼收拢在背上，头枕在尾巴上、吻部朝向玩家。
 *   本体画得偏亮，因为它在光照层之下，会被黑暗压暗；发光部分（脊背余烬、鼻息）单独一层。
 * - 屠龙战斗形态（正面直立）：张开的蝠翼、S 形长颈、带角的头、发光的腹甲和口中火核。
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

/** 爪子：小掌 + 三根弯钩 */
function claw(c: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, body: string, nail: string): void {
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
export const RISE_MOUTH: Pt = [50, 30.5];
/** 战斗形态的眼睛 [x, y, rx, ry] */
export const RISE_EYES: [number, number, number, number][] = [
  [45.6, 20.2, 2.1, 1.05],
  [54.4, 20.2, 2.1, 1.05],
];

const RISE = (() => {
  // 翅膀（左，右翼镜像）：肩 → 肘 → 腕，指骨四根，翼膜在指尖间向内凹
  const wrist: Pt = [17, 13];
  const tips: Pt[] = [
    [1, 7],
    [0, 27],
    [4, 45],
    [15, 58],
  ];
  const shoulder: Pt = [41, 46];
  const elbow: Pt = [27, 33];
  const hip: Pt = [39, 63];
  const mirror = (p: Pt): Pt => [100 - p[0], p[1]];
  const wingPath = (m: (p: Pt) => Pt): Path2D => {
    const P = new Path2D();
    const s = m(shoulder);
    P.moveTo(s[0], s[1]);
    const e = m(elbow);
    const w = m(wrist);
    P.quadraticCurveTo(m([33, 36])[0], m([33, 36])[1] - 4, e[0], e[1]);
    P.quadraticCurveTo(m([21, 25])[0], m([21, 25])[1] - 3, w[0], w[1]);
    const t0 = m(tips[0]);
    P.lineTo(t0[0], t0[1]);
    for (let i = 1; i < tips.length; i++) {
      const a = m(tips[i - 1]);
      const b = m(tips[i]);
      // 凹向腕部的扇贝边
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const ww = m(wrist);
      P.quadraticCurveTo(lerp(mx, ww[0], 0.32), lerp(my, ww[1], 0.32), b[0], b[1]);
    }
    const last = m(tips[tips.length - 1]);
    const h = m(hip);
    P.quadraticCurveTo(lerp((last[0] + h[0]) / 2, m(wrist)[0], 0.25), lerp((last[1] + h[1]) / 2, m(wrist)[1], 0.25) + 2, h[0], h[1]);
    P.closePath();
    return P;
  };
  const id = (p: Pt) => p;
  const wingL = wingPath(id);
  const wingR = wingPath(mirror);
  const neck = tube(
    spline(
      [
        [50, 50],
        [49, 42],
        [51.5, 34],
        [50, 26],
      ],
      8,
    ),
    (t) => lerp(12, 7.5, t),
  );
  // 有棱角的龙头：宽眉板、颧骨外凸、下颌收窄
  const head = new Path2D(
    'M42.5 15.5 L46 11.3 L54 11.3 L57.5 15.5 L61.2 18.2 L59.2 21.6 L57.2 23.4 L56.1 28.4 C55.1 31.6 52.8 33.6 50 33.6 C47.2 33.6 44.9 31.6 43.9 28.4 L42.8 23.4 L40.8 21.6 L38.8 18.2 Z',
  );
  const torso = new Path2D(
    'M39.5 48 C42 45 58 45 60.5 48 C63.5 53 63.5 61 61.5 68 C60 74 57.5 79 55.5 83 L44.5 83 C42.5 79 40 74 38.5 68 C36.5 61 36.5 53 39.5 48 Z',
  );
  // 反关节后腿：大腿外鼓、膝在前、小腿收回到脚踝
  const thighL = new Path2D('M42 69 C36.5 70 32.5 75 33 81 C33.3 85 35.5 87.5 37.5 88.5 L36.8 93.5 L41.2 93.5 L42.2 87 C43.6 82 43.8 76 43 72 Z');
  const thighR = new Path2D('M58 69 C63.5 70 67.5 75 67 81 C66.7 85 64.5 87.5 62.5 88.5 L63.2 93.5 L58.8 93.5 L57.8 87 C56.4 82 56.2 76 57 72 Z');
  const armL = tube(
    spline(
      [
        [40, 51],
        [34, 57.5],
        [33.2, 64.5],
        [35.5, 68.5],
      ],
      8,
    ),
    (t) => lerp(5.6, 3, t),
  );
  const armR = tube(
    spline(
      [
        [60, 51],
        [66, 57.5],
        [66.8, 64.5],
        [64.5, 68.5],
      ],
      8,
    ),
    (t) => lerp(5.6, 3, t),
  );
  const tail = tube(
    spline(
      [
        [55, 82],
        [68, 90],
        [82, 92],
        [92, 86],
        [95, 76],
        [92, 70],
      ],
      10,
    ),
    (t) => lerp(8, 1.4, Math.pow(t, 0.85)),
  );
  // 剪影外形（碎片取样与受击闪白用）
  const outline = new Path2D();
  for (const p of [wingL, wingR, neck.path, head, torso, thighL, thighR, armL.path, armR.path, tail.path]) outline.addPath(p);
  return { wingL, wingR, neck, head, torso, thighL, thighR, armL, armR, tail, outline, tips, wrist, elbow, shoulder, mirror };
})();

export const RISE_OUTLINE: Path2D = RISE.outline;

/** 战斗形态本体（不含轮廓光，轮廓光由烘焙时整体偏移着色叠在下面） */
export function paintRise(c: CanvasRenderingContext2D): void {
  const R = RISE;
  const BODY_T = '#231a26';
  const BODY_B = '#0d0a10';
  const body = (y0: number, y1: number) => {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, BODY_T);
    g.addColorStop(1, BODY_B);
    return g;
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // 尾巴在最后面
  c.fillStyle = body(70, 96);
  c.fill(R.tail.path);
  scales(c, R.tail, 2.4, 1.2, 0, 1, 'rgba(0,0,0,0.6)', 'rgba(255,140,90,0.1)');
  const tt = at(R.tail, 1);
  c.fillStyle = '#1a1218';
  c.beginPath();
  c.moveTo(tt.p[0] + tt.n[0] * 3, tt.p[1] + tt.n[1] * 3);
  c.lineTo(tt.p[0] + tt.tg[0] * 6, tt.p[1] + tt.tg[1] * 6);
  c.lineTo(tt.p[0] - tt.n[0] * 3, tt.p[1] - tt.n[1] * 3);
  c.closePath();
  c.fill();
  // 翅膀：翼膜带一点暗红透光，翼骨与指骨压在上面
  for (const [w, m] of [
    [R.wingL, (p: Pt) => p],
    [R.wingR, R.mirror],
  ] as [Path2D, (p: Pt) => Pt][]) {
    const wr = m(R.wrist);
    const mg = c.createRadialGradient(wr[0], wr[1], 2, wr[0], wr[1], 50);
    mg.addColorStop(0, '#2a1a24');
    mg.addColorStop(0.6, '#1f1018');
    mg.addColorStop(1, '#3a1416');
    c.fillStyle = mg;
    c.fill(w);
    c.save();
    c.clip(w);
    // 翼脉
    c.strokeStyle = 'rgba(120,30,30,0.35)';
    c.lineWidth = 0.35;
    for (let i = 0; i < R.tips.length; i++) {
      const a = m(R.tips[i]);
      for (let k = 1; k <= 2; k++) {
        const b = i + 1 < R.tips.length ? m(R.tips[i + 1]) : m([37, 63]);
        const mx = lerp(a[0], b[0], k / 3);
        const my = lerp(a[1], b[1], k / 3);
        c.beginPath();
        c.moveTo(wr[0], wr[1]);
        c.quadraticCurveTo(lerp(wr[0], mx, 0.5) + 1, lerp(wr[1], my, 0.5) + 1, mx, my);
        c.stroke();
      }
    }
    c.restore();
    // 指骨
    c.strokeStyle = '#2e2230';
    for (let i = 0; i < R.tips.length; i++) {
      const t = m(R.tips[i]);
      c.lineWidth = 1.5 - i * 0.18;
      c.beginPath();
      c.moveTo(wr[0], wr[1]);
      c.lineTo(t[0], t[1]);
      c.stroke();
    }
    // 臂骨：肩 → 肘 → 腕
    const s = m(R.shoulder);
    const e = m(R.elbow);
    c.strokeStyle = '#1a121c';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(s[0], s[1]);
    c.quadraticCurveTo(m([33, 36])[0], m([33, 36])[1] - 3, e[0], e[1]);
    c.quadraticCurveTo(m([21, 25])[0], m([21, 25])[1] - 2, wr[0], wr[1]);
    c.stroke();
    c.strokeStyle = 'rgba(255,170,110,0.12)';
    c.lineWidth = 0.5;
    c.stroke();
    // 腕爪
    c.fillStyle = '#b9a685';
    c.beginPath();
    c.moveTo(wr[0] - 1.4, wr[1] + 0.6);
    c.lineTo(wr[0] + (m([15, 0])[0] - wr[0]) * 0.1, wr[1] - 5.5);
    c.lineTo(wr[0] + 1.4, wr[1] + 0.4);
    c.closePath();
    c.fill();
  }
  // 后腿
  for (const t of [R.thighL, R.thighR]) {
    c.fillStyle = body(70, 92);
    c.fill(t);
  }
  claw(c, 38.6, 94, 1.15, -1, '#140e14', '#b9a685');
  claw(c, 61.4, 94, 1.15, 1, '#140e14', '#b9a685');
  // 躯干
  c.fillStyle = body(45, 85);
  c.fill(R.torso);
  c.save();
  c.clip(R.torso);
  // 腹甲：一节一节的横向骨板
  for (let y = 52; y < 85; y += 4.2) {
    const k = (y - 52) / 33;
    const hw = lerp(7.4, 4.6, k);
    c.fillStyle = 'rgba(70,42,46,0.55)';
    c.beginPath();
    c.moveTo(50 - hw, y);
    c.quadraticCurveTo(50, y + 1.6, 50 + hw, y);
    c.lineTo(50 + hw * 0.95, y + 3.2);
    c.quadraticCurveTo(50, y + 4.8, 50 - hw * 0.95, y + 3.2);
    c.closePath();
    c.fill();
  }
  // 胸肌阴影
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.ellipse(42.5, 53, 4.2, 3, 0.5, 0, Math.PI * 2);
  c.ellipse(57.5, 53, 4.2, 3, -0.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // 前臂（抬起的爪）
  for (const a of [R.armL, R.armR]) {
    c.fillStyle = body(50, 72);
    c.fill(a.path);
  }
  claw(c, 36, 69.8, 0.95, -1, '#140e14', '#c9b48f');
  claw(c, 64, 69.8, 0.95, 1, '#140e14', '#c9b48f');
  // 颈
  c.fillStyle = body(26, 50);
  c.fill(R.neck.path);
  // 颈前喉板
  c.save();
  c.clip(R.neck.path);
  c.strokeStyle = 'rgba(80,46,50,0.6)';
  c.lineWidth = 0.6;
  for (let t = 0.1; t < 0.95; t += 0.11) {
    const { p, w } = at(R.neck, t);
    c.beginPath();
    c.moveTo(p[0] - w * 0.22, p[1]);
    c.quadraticCurveTo(p[0], p[1] + 0.9, p[0] + w * 0.22, p[1]);
    c.stroke();
  }
  c.restore();
  // 背刺（颈两侧露出来的）
  c.fillStyle = '#120c12';
  for (let k = 0; k < 4; k++) {
    const y = 30 + k * 4.6;
    for (const sx of [-1, 1]) {
      const { p, w } = at(R.neck, 1 - (y - 26) / 24);
      c.beginPath();
      c.moveTo(p[0] + (sx * w) / 2, y - 1.2);
      c.lineTo(p[0] + sx * (w / 2 + 2.4), y - 2.6);
      c.lineTo(p[0] + (sx * w) / 2, y + 1.2);
      c.closePath();
      c.fill();
    }
  }
  // 角
  horn(c, [[44.5, 14], [40, 9], [36, 4.5], [31, 2]], 3.4, '#bba57f', '#3a2c26');
  horn(c, [[55.5, 14], [60, 9], [64, 4.5], [69, 2]], 3.4, '#bba57f', '#3a2c26');
  horn(c, [[42, 19], [38.5, 17.5], [35.5, 14.5]], 1.8, '#9a876a', '#3a2c26');
  horn(c, [[58, 19], [61.5, 17.5], [64.5, 14.5]], 1.8, '#9a876a', '#3a2c26');
  // 颧刺
  c.fillStyle = '#100b12';
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.moveTo(50 + sx * 8.6, 21);
    c.lineTo(50 + sx * 14.5, 25.5);
    c.lineTo(50 + sx * 7.4, 24.6);
    c.closePath();
    c.fill();
  }
  // 头
  const hg = c.createLinearGradient(0, 11, 0, 34);
  hg.addColorStop(0, '#2c2230');
  hg.addColorStop(1, '#100c12');
  c.fillStyle = hg;
  c.fill(R.head);
  c.save();
  c.clip(R.head);
  // 怒眉：压在眼睛上的斜骨
  c.fillStyle = '#0a070b';
  c.beginPath();
  c.moveTo(41, 17.4);
  c.lineTo(49, 19.6);
  c.lineTo(48.5, 21);
  c.lineTo(41.5, 19.6);
  c.closePath();
  c.moveTo(59, 17.4);
  c.lineTo(51, 19.6);
  c.lineTo(51.5, 21);
  c.lineTo(58.5, 19.6);
  c.closePath();
  c.fill();
  // 吻部中脊
  c.strokeStyle = 'rgba(255,160,110,0.16)';
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(50, 13);
  c.lineTo(50, 26);
  c.stroke();
  // 张开的口：上下颌之间一道暗缝
  c.fillStyle = '#050304';
  c.beginPath();
  c.moveTo(45.2, 28.4);
  c.quadraticCurveTo(50, 32.6, 54.8, 28.4);
  c.quadraticCurveTo(50, 30.4, 45.2, 28.4);
  c.fill();
  c.restore();
  // 獠牙
  c.fillStyle = '#d8c8a8';
  for (const x of [46.6, 53.4]) {
    c.beginPath();
    c.moveTo(x - 0.6, 28.8);
    c.lineTo(x, 31.4);
    c.lineTo(x + 0.6, 29);
    c.closePath();
    c.fill();
  }
}

/** 战斗形态的发光细节（叠在本体上，随 sprite 一起烘焙） */
export function paintRiseGlow(c: CanvasRenderingContext2D, shadowBlur: number): void {
  const R = RISE;
  c.shadowColor = '#FF3B1F';
  c.shadowBlur = shadowBlur;
  // 腹甲缝里的火：体内熔炉
  c.save();
  c.clip(R.torso);
  for (let y = 55.2; y < 85; y += 4.2) {
    const k = (y - 52) / 33;
    const hw = lerp(6.9, 4.2, k);
    c.strokeStyle = `rgba(255,${Math.round(lerp(120, 70, k))},40,${lerp(0.85, 0.35, k).toFixed(2)})`;
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(50 - hw, y + 0.2);
    c.quadraticCurveTo(50, y + 1.9, 50 + hw, y + 0.2);
    c.stroke();
  }
  c.restore();
  // 喉部火光
  c.strokeStyle = 'rgba(255,110,40,0.6)';
  c.lineWidth = 0.5;
  for (let t = 0.15; t < 0.9; t += 0.22) {
    const { p, w } = at(R.neck, t);
    c.beginPath();
    c.moveTo(p[0] - w * 0.18, p[1] + 0.2);
    c.quadraticCurveTo(p[0], p[1] + 1, p[0] + w * 0.18, p[1] + 0.2);
    c.stroke();
  }
  // 口中火光
  c.fillStyle = 'rgba(255,120,40,0.95)';
  c.beginPath();
  c.moveTo(46, 28.8);
  c.quadraticCurveTo(50, 31.8, 54, 28.8);
  c.quadraticCurveTo(50, 30.2, 46, 28.8);
  c.fill();
  c.shadowBlur = 0;
}
