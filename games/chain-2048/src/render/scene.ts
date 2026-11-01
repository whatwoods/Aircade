/**
 * 静态场景烘焙（docs §4.4 / §4.5）：丛林庭院背景 + 石槽轨道 + 蛇口（底层），闸门 + 石桥（前景层）。
 * 每关烘焙一次。
 */
import { Rng } from '../core/rng';
import type { Track } from '../game/track';
import { C } from './palette';

export const SW = 390;
export const SH = 844;

export interface SceneLayers {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

function mk(scale: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(SW * scale);
  c.height = Math.ceil(SH * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  return [c, g];
}

export function tracePath(g: CanvasRenderingContext2D, t: Track, s0: number, s1: number, step = 6): void {
  g.beginPath();
  let p = t.posAt(s0);
  g.moveTo(p.x, p.y);
  for (let s = s0 + step; s < s1; s += step) {
    p = t.posAt(s);
    g.lineTo(p.x, p.y);
  }
  p = t.posAt(s1);
  g.lineTo(p.x, p.y);
}

export function paintCourtyard(g: CanvasRenderingContext2D, rng: Rng, w = SW, h = SH): void {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, C.mossDeep);
  bg.addColorStop(0.5, '#23503D');
  bg.addColorStop(1, '#3C5A44');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // 石板：错缝铺设
  const rowH = 58;
  for (let y = -10, row = 0; y < h; y += rowH, row++) {
    let x = row % 2 ? -30 : -60;
    while (x < w) {
      const bw = 70 + rng.next() * 50;
      const tone = 0.06 + rng.next() * 0.07;
      g.fillStyle = `rgba(${150 + rng.int(-10, 10)},${150 + rng.int(-10, 10)},${118},${tone})`;
      roundRect(g, x + 2, y + 2, bw - 4, rowH - 4, 6);
      g.fill();
      // 石缝里的苔藓
      g.strokeStyle = `rgba(70,140,80,${0.12 + rng.next() * 0.1})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x + 2, y + rowH - 1);
      g.lineTo(x + bw - 2, y + rowH - 1);
      g.stroke();
      g.strokeStyle = 'rgba(5,20,12,0.35)';
      g.lineWidth = 1;
      roundRect(g, x + 2, y + 2, bw - 4, rowH - 4, 6);
      g.stroke();
      // 刻纹
      if (rng.chance(0.15)) {
        g.strokeStyle = 'rgba(210,200,160,0.07)';
        g.lineWidth = 1.5;
        const cx = x + bw / 2, cy = y + rowH / 2;
        for (let k = 0; k < 3; k++) {
          g.strokeRect(cx - 10 + k * 3, cy - 8 + k * 3, 20 - k * 6, 16 - k * 6);
        }
      }
      x += bw;
    }
  }
  // 苔藓斑
  for (let i = 0; i < 46; i++) {
    const x = rng.next() * w, y = rng.next() * h, r = 8 + rng.next() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(80,150,80,${0.1 + rng.next() * 0.1})`);
    gr.addColorStop(1, 'rgba(80,150,80,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 噪点
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,230,0.05)' : 'rgba(0,0,0,0.07)';
    g.fillRect(rng.next() * w, rng.next() * h, 1, 1);
  }
  // 夕照：右上暖光
  const sun = g.createRadialGradient(w * 0.92, -20, 10, w * 0.92, -20, h * 0.75);
  sun.addColorStop(0, 'rgba(255,170,95,0.32)');
  sun.addColorStop(0.4, 'rgba(255,150,85,0.1)');
  sun.addColorStop(1, 'rgba(255,150,85,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
}

export function paintVines(g: CanvasRenderingContext2D, rng: Rng, x0: number, h: number, dir: 1 | -1, count = 4): void {
  for (let v = 0; v < count; v++) {
    const x = x0 + dir * (rng.next() * 26);
    const len = h * (0.25 + rng.next() * 0.4);
    g.strokeStyle = `rgba(24,64,38,${0.75 + rng.next() * 0.2})`;
    g.lineWidth = 2 + rng.next() * 1.5;
    g.beginPath();
    g.moveTo(x, -10);
    const sway = 14 + rng.next() * 16;
    const pts: Array<[number, number]> = [];
    for (let y = -10; y < len; y += 8) {
      const xx = x + dir * Math.sin(y / 40 + v) * sway * (y / len);
      g.lineTo(xx, y);
      pts.push([xx, y]);
    }
    g.stroke();
    for (let i = 2; i < pts.length; i += 2) {
      const [px, py] = pts[i]!;
      const side = i % 4 ? 1 : -1;
      leaf(g, px, py, 5 + rng.next() * 5, side * (0.6 + rng.next() * 0.5) + (dir < 0 ? Math.PI : 0), rng);
    }
  }
}

export function leaf(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, rng: Rng): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const shade = rng.int(0, 3);
  g.fillStyle = ['#2F6B4C', '#3D7F55', '#24573D', '#4C8F5E'][shade]!;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(s * 0.9, -s * 0.55, s * 2, 0);
  g.quadraticCurveTo(s * 0.9, s * 0.55, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(160,220,150,0.25)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s * 1.8, 0);
  g.stroke();
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function bakeScene(t: Track, scale: number, seed: number): SceneLayers {
  const rng = new Rng(seed);
  const [back, g] = mk(scale);
  paintCourtyard(g, rng);
  const L = t.length;
  // 石槽
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.save();
  g.translate(2, 4);
  tracePath(g, t, 0, L);
  g.strokeStyle = 'rgba(5,15,10,0.45)';
  g.lineWidth = 60;
  g.stroke();
  g.restore();
  tracePath(g, t, 0, L);
  g.strokeStyle = C.bronze;
  g.lineWidth = 56;
  g.stroke();
  g.strokeStyle = '#C99A3E';
  g.lineWidth = 53;
  g.stroke();
  g.strokeStyle = '#6F735C';
  g.lineWidth = 49;
  g.stroke();
  g.strokeStyle = '#3E463A';
  g.lineWidth = 45;
  g.stroke();
  g.strokeStyle = '#2B3329';
  g.lineWidth = 40;
  g.stroke();
  // 槽底中线微光
  g.strokeStyle = 'rgba(255,220,150,0.05)';
  g.lineWidth = 14;
  g.stroke();
  // 受光的槽沿（右上光源）：沿线方向画短高光
  for (let s = 0; s < L; s += 10) {
    const p = t.posAt(s);
    const a = t.angleAt(s);
    const nx = -Math.sin(a), ny = Math.cos(a);
    // 法线朝上方的一侧受光
    const lit = ny < 0 ? 1 : -1;
    g.fillStyle = 'rgba(255,236,180,0.18)';
    g.fillRect(p.x + nx * lit * 25.5 - 1, p.y + ny * lit * 25.5 - 1, 2.2, 2.2);
  }
  // 槽边苔藓
  for (let s = 0; s < L; s += 24 + rng.next() * 30) {
    const p = t.posAt(s);
    const a = t.angleAt(s);
    const side = rng.chance(0.5) ? 1 : -1;
    const nx = -Math.sin(a) * side, ny = Math.cos(a) * side;
    const x = p.x + nx * 28, y = p.y + ny * 28;
    const r = 4 + rng.next() * 7;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(90,160,85,0.55)');
    gr.addColorStop(1, 'rgba(90,160,85,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 蛇口（洞）
  drawSerpentHead(g, t);
  // 暗角
  const vg = g.createRadialGradient(SW / 2, SH / 2, SH * 0.32, SW / 2, SH / 2, SH * 0.72);
  vg.addColorStop(0, 'rgba(11,35,28,0)');
  vg.addColorStop(1, 'rgba(11,35,28,0.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, SW, SH);
  // 两侧藤蔓
  paintVines(g, rng, 4, SH, 1, 3);
  paintVines(g, rng, SW - 4, SH, -1, 3);

  // 前景层：闸门 + 石桥
  const [front, f] = mk(scale);
  drawGate(f, t);
  for (const [a, b] of t.tunnels) drawBridge(f, t, a, b, rng);
  return { back, front };
}

function drawSerpentHead(g: CanvasRenderingContext2D, t: Track): void {
  const L = t.length;
  const p = t.posAt(L);
  const a = t.angleAt(L);
  g.save();
  g.translate(p.x, p.y);
  g.rotate(a);
  // 头部朝向轨道来向（口对着来的珠子）：-x 方向是来向
  const gold = g.createLinearGradient(0, -30, 0, 30);
  gold.addColorStop(0, C.goldHi);
  gold.addColorStop(0.5, C.gold);
  gold.addColorStop(1, C.bronze);
  // 后脑
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.ellipse(12, 4, 34, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = gold;
  g.beginPath();
  g.ellipse(10, 0, 32, 28, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.bronze;
  g.lineWidth = 2;
  g.stroke();
  // 鳞纹
  g.strokeStyle = 'rgba(120,70,20,0.6)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(22 + i * 2, 0, 8 + i * 5, -1.1, 1.1);
    g.stroke();
  }
  // 张开的口
  g.fillStyle = '#0A0806';
  g.beginPath();
  g.ellipse(-4, 0, 22, 20, 0, 0, Math.PI * 2);
  g.fill();
  const inner = g.createRadialGradient(-4, 0, 2, -4, 0, 21);
  inner.addColorStop(0, '#000');
  inner.addColorStop(0.7, '#1A0D06');
  inner.addColorStop(1, '#3A1A08');
  g.fillStyle = inner;
  g.fill();
  // 獠牙
  g.fillStyle = '#F7EFD8';
  for (const sy of [-1, 1]) {
    g.beginPath();
    g.moveTo(-18, sy * 15);
    g.lineTo(-12, sy * 6);
    g.lineTo(-8, sy * 16);
    g.fill();
  }
  // 唇缘金线
  g.strokeStyle = C.goldHi;
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(-4, 0, 22, 20, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** 蛇眼位置（动态发光用） */
export function serpentEyes(t: Track): Array<{ x: number; y: number }> {
  const L = t.length;
  const p = t.posAt(L);
  const a = t.angleAt(L);
  const out: Array<{ x: number; y: number }> = [];
  for (const sy of [-1, 1]) {
    const lx = 22, ly = sy * 18;
    out.push({ x: p.x + Math.cos(a) * lx - Math.sin(a) * ly, y: p.y + Math.sin(a) * lx + Math.cos(a) * ly });
  }
  return out;
}

function drawGate(g: CanvasRenderingContext2D, t: Track): void {
  // 闸门石拱：覆盖 s ∈ [0, gateLen]，放在第一段可见轨道上
  const s0 = t.visStart;
  const s1 = s0 + t.gateLen;
  const p0 = t.posAt(s0), p1 = t.posAt(s1);
  const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) + 18;
  g.save();
  g.translate(mx, my);
  g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(-len / 2 + 3, -36 + 5, len, 72);
  const sg = g.createLinearGradient(0, -36, 0, 36);
  sg.addColorStop(0, '#B8B091');
  sg.addColorStop(0.5, C.stone);
  sg.addColorStop(1, '#5D604C');
  g.fillStyle = sg;
  g.fillRect(-len / 2, -36, len, 72);
  // 阶梯纹
  g.strokeStyle = 'rgba(40,40,30,0.55)';
  g.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) g.strokeRect(-len / 2 + 4 + k * 4, -32 + k * 4, len - 8 - k * 8, 64 - k * 8);
  // 拱顶日轮浮雕
  g.fillStyle = C.gold;
  g.beginPath();
  g.arc(0, 0, 11, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.bronze;
  g.lineWidth = 1.5;
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const aa = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(aa) * 13, Math.sin(aa) * 13);
    g.lineTo(Math.cos(aa) * 18, Math.sin(aa) * 18);
    g.strokeStyle = C.gold;
    g.stroke();
  }
  // 藤蔓
  const rng = new Rng(77);
  g.strokeStyle = '#24573D';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-len / 2, -36);
  g.bezierCurveTo(-len / 4, -20, len / 4, -44, len / 2, -30);
  g.stroke();
  for (let i = 0; i < 9; i++) leaf(g, -len / 2 + (i / 8) * len, -34 + Math.sin(i) * 6, 5, (i % 2 ? 1 : -1) * 0.9 + 1.4, rng);
  g.restore();
}

export function gateCenter(t: Track): { x: number; y: number } {
  const p = t.posAt(t.visStart + t.gateLen / 2);
  return { x: p.x, y: p.y };
}

function drawBridge(g: CanvasRenderingContext2D, t: Track, a: number, b: number, rng: Rng): void {
  g.save();
  g.lineCap = 'butt';
  tracePath(g, t, a, b, 4);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 70;
  g.stroke();
  tracePath(g, t, a, b, 4);
  g.strokeStyle = '#6F6C57';
  g.lineWidth = 64;
  g.stroke();
  g.strokeStyle = C.stone;
  g.lineWidth = 58;
  g.stroke();
  g.setLineDash([3, 9]);
  g.strokeStyle = 'rgba(40,40,30,0.5)';
  g.lineWidth = 44;
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(227,178,76,0.7)';
  g.lineWidth = 2;
  tracePath(g, t, a, b, 4);
  g.lineWidth = 30;
  g.strokeStyle = 'rgba(207,199,166,0.35)';
  g.stroke();
  // 桥面苔藓
  for (let s = a; s < b; s += 12) {
    const p = t.posAt(s);
    const r = 4 + rng.next() * 6;
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, 'rgba(90,160,85,0.5)');
    gr.addColorStop(1, 'rgba(90,160,85,0)');
    g.fillStyle = gr;
    g.fillRect(p.x - r + rng.next() * 30 - 15, p.y - r + rng.next() * 30 - 15, r * 2, r * 2);
  }
  g.restore();
}
