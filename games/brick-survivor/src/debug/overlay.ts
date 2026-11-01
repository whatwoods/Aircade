// FPS / frame-time overlay (docs §8): `60fps 4.1ms(p95 6.8) | dc 9 spr 2134 | pt 640/1800 | ball 23 brick 61 gem 40 | Q:高 | seed 12345`
import type { App } from '../app';

const QN = { high: '高', mid: '中', low: '低' } as const;

export class DebugOverlay {
  private el: HTMLElement;
  private t = 0;
  private scratch = new Float32Array(120);

  constructor(private app: App) {
    this.el = document.createElement('div');
    this.el.id = 'debug-ov';
    document.body.appendChild(this.el);
  }

  update(realDt: number): void {
    this.t -= realDt;
    if (this.t > 0) return;
    this.t = 0.25;
    const a = this.app;
    const g = a.g;
    const fm = a.frameMs;
    let sum = 0;
    for (let i = 0; i < fm.length; i++) {
      sum += fm[i]!;
      this.scratch[i] = fm[i]!;
    }
    this.scratch.sort();
    const p95 = this.scratch[Math.floor(fm.length * 0.95)] ?? 0;
    let balls = 0;
    for (const b of g.balls.pool) if (b.alive) balls++;
    const dc = a.batcher.drawCalls + 1 + (a.post.enabled ? 4 : 1);
    this.el.textContent =
      `${a.fps}fps ${(sum / fm.length).toFixed(1)}ms(p95 ${p95.toFixed(1)}) | dc ${dc} spr ${a.batcher.quads} | ` +
      `pt ${a.parts.n}/${a.parts.cap} | ball ${balls} brick ${g.formation.aliveCount} gem ${g.gemsSys.count} | ` +
      `Q:${QN[a.quality]} | seed ${g.seed}`;
  }
}
