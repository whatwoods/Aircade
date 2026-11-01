// rAF 主循环：dt 限幅 50ms、全局 timeScale、固定 120Hz 物理子步
import { PHYS_H } from './spring.ts';

export const clock = {
  timeScale: 1,
  /** 本帧（缩放后）dt */
  dt: 0,
  /** 本帧真实 dt（限幅后） */
  raw: 0,
  /** 运行总时间（缩放后） */
  time: 0,
  /** 真实时间 */
  real: 0,
  /** 本帧物理子步数 */
  steps: 0,
  /** 最近一帧 CPU 耗时 ms */
  frameMs: 0,
  fps: 60,
};

let acc = 0;
let last = 0;
let running = false;

export function startLoop(frame: () => void): void {
  if (running) return;
  running = true;
  const tick = (now: number): void => {
    if (!running) return;
    requestAnimationFrame(tick);
    const t0 = performance.now();
    const raw = last === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock.raw = raw;
    clock.dt = raw * clock.timeScale;
    clock.time += clock.dt;
    clock.real += raw;
    acc += clock.dt;
    let n = Math.floor(acc / PHYS_H);
    acc -= n * PHYS_H;
    if (n > 6) n = 6;
    clock.steps = n;
    if (raw > 0) clock.fps += (1 / raw - clock.fps) * 0.05;
    frame();
    clock.frameMs += (performance.now() - t0 - clock.frameMs) * 0.1;
  };
  requestAnimationFrame(tick);
}

/** 页面从后台回来时，避免一次性补大 dt */
export function resetClock(): void {
  last = 0;
  acc = 0;
}
