/** 桌面两侧装饰（docs §6.10）：夕照丛林剪影 + 羽蛇石柱 + 垂藤（视差/轻摆）+ god rays + 萤火虫。≤30fps，失焦停止。 */
import { Rng } from '../core/rng';
import { stageInfo } from '../core/stage';
import { leaf } from './scene';

export class DesktopBg {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private stat: HTMLCanvasElement | null = null;
  private vines: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private acc = 0;
  private t = 0;
  private mx = 0;
  private flies = new Float32Array(24 * 3);
  active = false;

  constructor(c: HTMLCanvasElement) {
    this.c = c;
    this.g = c.getContext('2d')!;
    const r = new Rng(3);
    for (let i = 0; i < 24; i++) {
      this.flies[i * 3] = r.next();
      this.flies[i * 3 + 1] = r.next();
      this.flies[i * 3 + 2] = r.next() * 10;
    }
    window.addEventListener('pointermove', (e) => {
      this.mx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    });
  }

  resize(): void {
    const framed = stageInfo.left > 8;
    this.active = framed;
    this.c.style.display = framed ? 'block' : 'none';
    if (!framed) return;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.c.width = Math.round(this.w * this.dpr);
    this.c.height = Math.round(this.h * this.dpr);
    this.bake();
    this.draw();
  }

  private bake(): void {
    const W = this.w, H = this.h, d = this.dpr;
    const s = document.createElement('canvas');
    s.width = Math.round(W * d);
    s.height = Math.round(H * d);
    const g = s.getContext('2d')!;
    g.scale(d, d);
    // 夕照天空
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2B3A2C');
    sky.addColorStop(0.35, '#7A5A34');
    sky.addColorStop(0.55, '#3E4A30');
    sky.addColorStop(1, '#0B231C');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(W * 0.82, H * 0.22, 10, W * 0.82, H * 0.22, H * 0.6);
    sun.addColorStop(0, 'rgba(255,190,110,0.55)');
    sun.addColorStop(1, 'rgba(255,150,85,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // 3 层山林剪影
    const rng = new Rng(19);
    const layers = ['#3A4B33', '#24382B', '#122A20'];
    layers.forEach((col, li) => {
      g.fillStyle = col;
      g.beginPath();
      const base = H * (0.45 + li * 0.12);
      g.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 14) {
        const y = base - Math.abs(Math.sin(x / (60 + li * 30) + li)) * 40 - rng.next() * 18 - (li === 0 ? 30 * Math.sin(x / 200) : 0);
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    });
    // 石柱：舞台左右各一根
    const sl = stageInfo.left, sw = 390 * stageInfo.scale;
    for (const side of [-1, 1]) {
      const pw = Math.min(90, sl * 0.45);
      if (pw < 24) continue;
      const cx = side < 0 ? sl - pw * 0.9 : sl + sw + pw * 0.9;
      const x0 = cx - pw / 2;
      const pg = g.createLinearGradient(x0, 0, x0 + pw, 0);
      pg.addColorStop(0, '#4A5143');
      pg.addColorStop(0.4, '#9A9678');
      pg.addColorStop(1, '#3F4538');
      g.fillStyle = pg;
      g.fillRect(x0, 0, pw, H);
      // 柱头阶梯纹
      g.fillStyle = '#B5AE8E';
      for (let k = 0; k < 3; k++) g.fillRect(x0 - 6 - k * 5, 40 + k * 10, pw + 12 + k * 10, 10);
      // 羽蛇鳞纹
      g.strokeStyle = 'rgba(40,40,30,0.5)';
      g.lineWidth = 1.5;
      for (let y = 90; y < H; y += 22) {
        for (let x = x0 + 8; x < x0 + pw - 4; x += 16) {
          g.beginPath();
          g.arc(x + ((y / 22) % 2) * 8, y, 8, 0, Math.PI);
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(227,178,76,0.6)';
      g.fillRect(x0, 0, 2, H);
      g.fillRect(x0 + pw - 2, 0, 2, H);
    }
    this.stat = s;
    // 垂藤（前层，动画时整体平移/摆动）
    const v = document.createElement('canvas');
    v.width = Math.round(W * d);
    v.height = Math.round(H * 0.7 * d);
    const vg = v.getContext('2d')!;
    vg.scale(d, d);
    const vr = new Rng(23);
    const n = Math.floor(W / 60);
    for (let i = 0; i < n; i++) {
      const x = (i + vr.next()) * (W / n);
      if (x > sl - 10 && x < sl + sw + 10) continue;
      const len = H * (0.2 + vr.next() * 0.45);
      vg.strokeStyle = '#1C4630';
      vg.lineWidth = 2.5;
      vg.beginPath();
      vg.moveTo(x, -5);
      for (let y = 0; y < len; y += 8) {
        const xx = x + Math.sin(y / 50 + i) * 10;
        vg.lineTo(xx, y);
      }
      vg.stroke();
      for (let y = 10; y < len; y += 16) leaf(vg, x + Math.sin(y / 50 + i) * 10, y, 6 + vr.next() * 6, (vr.next() < 0.5 ? 0.7 : Math.PI - 0.7) + vr.next() * 0.4, vr);
    }
    this.vines = v;
  }

  update(dt: number, visible: boolean): void {
    if (!this.active || !visible) return;
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    this.draw();
  }

  private draw(): void {
    if (!this.stat) return;
    const g = this.g, d = this.dpr, W = this.w, H = this.h;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.stat, 0, 0);
    g.setTransform(d, 0, 0, d, 0, 0);
    // god rays
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = 0.55 + i * 0.15 + Math.sin(this.t / (9 + i * 2) + i) * 0.04;
      g.save();
      g.translate(W * 0.9, -40);
      g.rotate(a + Math.PI / 2);
      const gr = g.createLinearGradient(0, 0, 0, H * 1.3);
      gr.addColorStop(0, `rgba(255,190,120,${(0.12 + 0.05 * Math.sin(this.t / 5 + i)).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-20 - i * 8, 0);
      g.lineTo(20 + i * 8, 0);
      g.lineTo(90 + i * 30, H * 1.3);
      g.lineTo(-90 - i * 30, H * 1.3);
      g.fill();
      g.restore();
    }
    // 萤火虫
    for (let i = 0; i < 24; i++) {
      const fx = this.flies[i * 3]! * W + Math.sin(this.t * 0.3 + i) * 30;
      const fy = H * 0.3 + this.flies[i * 3 + 1]! * H * 0.65 + Math.cos(this.t * 0.25 + i * 2) * 20;
      const b = Math.max(0, Math.sin(this.t * 1.2 + this.flies[i * 3 + 2]!));
      const r = g.createRadialGradient(fx, fy, 0, fx, fy, 6);
      r.addColorStop(0, `rgba(230,255,160,${(0.7 * b).toFixed(3)})`);
      r.addColorStop(1, 'rgba(230,255,160,0)');
      g.fillStyle = r;
      g.fillRect(fx - 6, fy - 6, 12, 12);
    }
    g.globalCompositeOperation = 'source-over';
    // 前层藤蔓：轻摆 + 鼠标视差
    if (this.vines) {
      const off = this.mx * 10 + Math.sin(this.t * 0.6) * 3;
      g.drawImage(this.vines, off, 0, W, H * 0.7);
    }
  }
}
