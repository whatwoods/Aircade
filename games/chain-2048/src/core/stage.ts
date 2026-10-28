/** 舞台：逻辑 390×844，按视口等比缩放居中；DPR 上限 2（docs §6.10） */
import { CONFIG } from '../config';

export const W = 390;
export const H = 844;

export interface StageInfo {
  scale: number;
  left: number;
  top: number;
  dpr: number;
  vw: number;
  vh: number;
}

export const stageInfo: StageInfo = { scale: 1, left: 0, top: 0, dpr: 1, vw: W, vh: H };

type Listener = (s: StageInfo) => void;
const listeners: Listener[] = [];

export function onResize(fn: Listener): void {
  listeners.push(fn);
}

export function layoutStage(el: HTMLElement): void {
  const vv = window.visualViewport;
  const vw = Math.max(200, vv ? vv.width : window.innerWidth);
  const vh = Math.max(300, vv ? vv.height : window.innerHeight);
  const scale = Math.min(vw / W, vh / H);
  const left = (vw - W * scale) / 2;
  const top = (vh - H * scale) / 2;
  stageInfo.scale = scale;
  stageInfo.left = left;
  stageInfo.top = top;
  stageInfo.vw = vw;
  stageInfo.vh = vh;
  stageInfo.dpr = Math.min(CONFIG.perf.dprMax, window.devicePixelRatio || 1);
  el.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  document.documentElement.classList.toggle('framed', left > 8 || top > 8);
  for (const fn of listeners) fn(stageInfo);
}

/** 视口坐标 → 逻辑坐标 */
export function toLogical(cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - stageInfo.left) / stageInfo.scale, y: (cy - stageInfo.top) / stageInfo.scale };
}

/** 逻辑坐标 → 视口（CSS）坐标 */
export function toClient(x: number, y: number): { x: number; y: number } {
  return { x: stageInfo.left + x * stageInfo.scale, y: stageInfo.top + y * stageInfo.scale };
}
