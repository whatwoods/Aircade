/** RAF 主循环：dt 限幅交给 Clock；可停可启（暂停 / 页面隐藏时停止 RAF） */
export class Loop {
  private raf = 0;
  private last = 0;
  private running = false;
  private fn: (dt: number, now: number) => void;
  constructor(fn: (dt: number, now: number) => void) {
    this.fn = fn;
  }
  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  get isRunning(): boolean {
    return this.running;
  }
  private tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.max(0, now - this.last);
    this.last = now;
    this.fn(dt, now);
    if (this.running) this.raf = requestAnimationFrame(this.tick);
  };
}
