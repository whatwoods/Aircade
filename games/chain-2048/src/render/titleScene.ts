/** 标题待机画面（docs §4.6 ①）：日轮浮雕慢转、石槽里珠子来回滚，每 3 s 演示一次「射入 → 连锁合成」。 */
import { Rng } from '../core/rng';
import { glowSprite, raysSprite } from './ballArt';
import { C } from './palette';
import { paintCourtyard, paintVines } from './scene';

interface TB {
  level: number;
  x: number;
  pop: number;
}

const BASE = [1, 2, 3, 4, 5, 6, 7];
const SPACING = 41;

export class TitleScene {
  private back: HTMLCanvasElement | null = null;
  private scale = 0;
  private t = 0;
  private balls: TB[] = [];
  private cycle = 0;
  private phase: 'roll' | 'shoot' | 'cascade' | 'hold' = 'roll';
  private shot = { x: 0, y: 0, on: false };
  private stepT = 0;
  onMerge: ((step: number, level: number) => void) | null = null;

  constructor() {
    this.reset();
  }

  private reset(): void {
    this.balls = BASE.map((l, i) => ({ level: l, x: 72 + i * SPACING, pop: 0 }));
  }

  private y(x: number): number {
    return 470 + Math.sin((x - 40) / 70) * 22;
  }

  bake(scale: number): void {
    if (Math.abs(scale - this.scale) < 0.01 && this.back) return;
    this.scale = scale;
    const c = document.createElement('canvas');
    c.width = Math.ceil(390 * scale);
    c.height = Math.ceil(844 * scale);
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    const rng = new Rng(8);
    paintCourtyard(g, rng);
    // 石拱
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(20, 96, 350, 22);
    const sg = g.createLinearGradient(0, 70, 0, 120);
    sg.addColorStop(0, '#B8B091');
    sg.addColorStop(1, '#5D604C');
    g.fillStyle = sg;
    g.fillRect(14, 70, 362, 34);
    g.strokeStyle = 'rgba(40,40,30,0.5)';
    for (let k = 0; k < 3; k++) g.strokeRect(18 + k * 4, 74 + k * 3, 354 - k * 8, 26 - k * 6);
    g.fillRect(14, 104, 26, 560);
    g.fillRect(350, 104, 26, 560);
    // 石槽
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const groove = (w: number, col: string, dy = 0): void => {
      g.beginPath();
      for (let x = -10; x <= 400; x += 6) {
        const yy = this.y(x) + dy;
        if (x === -10) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
    };
    groove(54, 'rgba(0,0,0,0.35)', 3);
    groove(50, C.stoneDark);
    groove(44, '#3A4036');
    groove(1.5, C.gold, -24);
    groove(1.5, C.gold, 24);
    paintVines(g, rng, 0, 844, 1, 4);
    paintVines(g, rng, 390, 844, -1, 4);
    this.back = c;
  }

  update(dt: number): void {
    this.t += dt;
    for (const b of this.balls) b.pop = Math.max(0, b.pop - dt * 5);
    this.cycle += dt;
    switch (this.phase) {
      case 'roll':
        if (this.cycle > 3) {
          this.phase = 'shoot';
          this.shot = { x: 195, y: 640, on: true };
        }
        break;
      case 'shoot': {
        const tx = this.balls[0]!.x - SPACING, ty = this.y(tx);
        const dx = tx - this.shot.x, dy = ty - this.shot.y;
        const d = Math.hypot(dx, dy);
        const v = 1100 * dt;
        if (d <= v) {
          this.balls.unshift({ level: 1, x: tx, pop: 0.5 });
          this.shot.on = false;
          this.phase = 'cascade';
          this.stepT = 0.12;
        } else {
          this.shot.x += (dx / d) * v;
          this.shot.y += (dy / d) * v;
        }
        break;
      }
      case 'cascade':
        this.stepT -= dt;
        if (this.stepT <= 0) {
          const a = this.balls[0], b = this.balls[1];
          if (a && b && a.level === b.level) {
            b.level++;
            b.pop = 1;
            this.balls.shift();
            this.onMerge?.(b.level - 1, b.level);
            this.stepT = Math.max(0.08, 0.16 * Math.pow(0.88, b.level));
          } else {
            this.phase = 'hold';
            this.cycle = 0;
          }
        }
        break;
      case 'hold':
        if (this.cycle > 1.6) {
          this.reset();
          this.phase = 'roll';
          this.cycle = 0;
        }
        break;
    }
    // 来回缓慢滚动（只在 roll 阶段，整体偏移）
  }

  draw(g: CanvasRenderingContext2D, drawBall: (l: number, x: number, y: number, roll: number, s: number) => void): void {
    if (this.back) g.drawImage(this.back, 0, 0, 390, 844);
    // 日轮浮雕（60 s 一圈）
    g.save();
    g.translate(195, 212);
    g.rotate((this.t / 60) * Math.PI * 2);
    g.globalAlpha = 0.5;
    g.drawImage(raysSprite(), -150, -150, 300, 300);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(30,50,36,0.55)';
    g.beginPath();
    g.arc(0, 0, 112, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(227,178,76,0.55)';
    g.lineWidth = 3;
    g.stroke();
    g.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath();
      g.moveTo(0, -100);
      g.lineTo(8, -88);
      g.lineTo(-8, -88);
      g.closePath();
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, 78, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    const roll = this.phase === 'roll' ? Math.sin(this.t * 0.9) * 10 : 0;
    for (const b of this.balls) {
      const x = b.x + roll;
      drawBall(b.level, x, this.y(x), x / 20, 1 + 0.22 * b.pop * b.pop);
      if (b.pop > 0.5) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = b.pop - 0.5;
        g.drawImage(glowSprite(), x - 34, this.y(x) - 34, 68, 68);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (this.shot.on) drawBall(1, this.shot.x, this.shot.y, 0, 1);
  }
}
