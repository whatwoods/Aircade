// Scene transition (docs §6.9): a horizontal neon scanline sweeps top → bottom. Implemented as a two-phase
// curtain — the line drags a void curtain down over the old scene, the scene swaps underneath, then the line
// sweeps again and the curtain retracts behind it, revealing the new scene top-first. 2 u chroma split on the
// line, whoosh at the start. 0.28 s per half (easeInOutCubic) so the whole wipe stays snappy.
import { ease } from '../core/ease';
import { sfx } from '../audio/sfx';
import { el } from './dom';

const HALF = 280;

export class Sweep {
  private root: HTMLElement;
  private cur: HTMLElement;
  private ln: HTMLElement;
  busy = false;

  constructor() {
    this.root = el('div', '', document.body);
    this.root.id = 'sweep';
    this.cur = el('div', 'cur', this.root);
    this.ln = el('div', 'ln', this.root);
  }

  /** runs `mid` once the screen is covered, `done` when revealed */
  run(mid: () => void, done?: () => void): void {
    if (this.busy) return;
    this.busy = true;
    this.root.style.display = 'block';
    sfx.whoosh(0.1);
    const h = (): number => window.innerHeight;
    const t0 = performance.now();
    let swapped = false;
    const frame = (now: number): void => {
      const t = now - t0;
      if (t < HALF) {
        const p = ease.inOutCubic(t / HALF);
        const y = p * h();
        this.cur.style.top = '0px';
        this.cur.style.height = y + 'px';
        this.ln.style.top = y + 'px';
        requestAnimationFrame(frame);
        return;
      }
      if (!swapped) {
        swapped = true;
        this.cur.style.top = '0px';
        this.cur.style.height = '100%';
        try {
          mid();
        } catch (e) {
          this.finish();
          throw e;
        }
      }
      const t2 = t - HALF;
      if (t2 < HALF) {
        const p = ease.inOutCubic(t2 / HALF);
        const y = p * h();
        this.cur.style.top = y + 'px';
        this.cur.style.height = Math.max(0, h() - y) + 'px';
        this.ln.style.top = y + 'px';
        requestAnimationFrame(frame);
        return;
      }
      this.finish();
      done?.();
    };
    requestAnimationFrame(frame);
  }

  private finish(): void {
    this.root.style.display = 'none';
    this.busy = false;
  }
}
