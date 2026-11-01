/** 藤蔓幕转场（docs §6.9）：两侧藤蔓合拢 0.4 s inCubic → 切换 → 拉开 0.45 s outCubic */
import { Rng } from '../core/rng';
import { leaf } from '../render/scene';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function paintCurtain(c: HTMLCanvasElement, dir: 1 | -1, scale: number): void {
  const W = 220, H = 844;
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const g = c.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const rng = new Rng(dir > 0 ? 71 : 113);
  // 底：深苔绿，向内侧边缘渐隐
  const gr = g.createLinearGradient(dir > 0 ? 0 : W, 0, dir > 0 ? W : 0, 0);
  gr.addColorStop(0, '#0B231C');
  gr.addColorStop(0.8, '#123326');
  gr.addColorStop(1, 'rgba(18,51,38,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // 藤蔓
  for (let v = 0; v < 14; v++) {
    const x = dir > 0 ? 10 + v * 14 + rng.next() * 8 : W - 10 - v * 14 - rng.next() * 8;
    g.strokeStyle = `rgba(24,64,38,${0.8 + rng.next() * 0.2})`;
    g.lineWidth = 2 + rng.next() * 2;
    g.beginPath();
    const sway = 6 + rng.next() * 10;
    for (let y = -10; y < H + 10; y += 10) {
      const xx = x + Math.sin(y / 50 + v * 1.7) * sway;
      if (y === -10) g.moveTo(xx, y);
      else g.lineTo(xx, y);
      if (y % 20 === 0) leaf(g, xx, y, 6 + rng.next() * 7, (rng.next() - 0.5) * 2.4 + (rng.next() < 0.5 ? Math.PI : 0), rng);
    }
    g.stroke();
  }
}

export class Transition {
  private el = $('vines');
  private l = $<HTMLCanvasElement>('vines-l');
  private r = $<HTMLCanvasElement>('vines-r');
  private sun = $('vines').querySelector('.vine-sun') as HTMLElement;
  private painted = 0;
  busy = false;

  paint(scale: number): void {
    const s = Math.min(2, Math.max(1, scale));
    if (Math.abs(s - this.painted) < 0.01) return;
    this.painted = s;
    paintCurtain(this.l, 1, s);
    paintCurtain(this.r, -1, s);
  }

  /** 合拢 → mid() → 拉开 */
  run(mid: () => void, onClose?: () => void): void {
    if (this.busy) {
      mid();
      return;
    }
    this.busy = true;
    this.el.classList.add('on');
    onClose?.();
    const close = { duration: 400, easing: 'cubic-bezier(0.55,0,0.9,0.4)', fill: 'forwards' as const };
    this.l.animate([{ transform: 'translateX(-220px)' }, { transform: 'translateX(0px)' }], close);
    this.r.animate([{ transform: 'translateX(220px)' }, { transform: 'translateX(0px)' }], close);
    this.sun.animate([{ opacity: 0, transform: 'scale(0.6) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(90deg)' }], close);
    window.setTimeout(() => {
      try {
        mid();
      } finally {
        const open = { duration: 450, easing: 'cubic-bezier(0.1,0.6,0.3,1)', fill: 'forwards' as const };
        this.l.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(-220px)' }], open);
        this.r.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(220px)' }], open);
        this.sun.animate([{ opacity: 1, transform: 'scale(1) rotate(90deg)' }, { opacity: 0, transform: 'scale(1.2) rotate(180deg)' }], open);
        window.setTimeout(() => {
          this.el.classList.remove('on');
          this.busy = false;
        }, 300);
      }
    }, 420);
  }
}
