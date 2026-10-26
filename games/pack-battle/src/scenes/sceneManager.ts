// 场景管理：title / game / ending；墨渍转场；输入路由
import { sfx } from '../audio/sfx.ts';
import { input, type InputHandler } from '../core/input.ts';
import { blot, inkTransition } from '../render/fx/transitions.ts';
import type { PortraitId } from '../game/types.ts';
import type { UiEl } from '../render/ui/widgets.ts';

export type SceneName = 'title' | 'game' | 'ending';

export interface Scene {
  readonly name: SceneName;
  handler: InputHandler;
  enter(): void;
  exit(): void;
  /** dt：缩放后的游戏 dt；raw：真实 dt */
  update(dt: number, raw: number): void;
  /** 固定 120Hz 物理子步 */
  step(h: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  ui(): UiEl[];
  /** 失焦 / 切后台：自动暂停 */
  autoPause(): void;
  cursor(x: number, y: number): string;
}

export const sm = {
  cur: null as Scene | null,
};

/** 空处理器（转场中屏蔽输入） */
const BLOCK: InputHandler = {
  down() {}, dragStart() {}, drag() {}, up() {}, long() {}, cancel() {}, rotate() {}, hover() {}, key() {}, wheel() {},
};

/** 包一层：转场期间不响应 */
function guard(h: InputHandler): InputHandler {
  return {
    down: (x, y) => { if (!blot.active) h.down(x, y); },
    dragStart: (x, y) => { if (!blot.active) h.dragStart(x, y); },
    drag: (x, y) => { if (!blot.active) h.drag(x, y); },
    up: (x, y, t) => { if (!blot.active) h.up(x, y, t); else h.cancel(); },
    long: (x, y) => { if (!blot.active) h.long(x, y); },
    cancel: () => h.cancel(),
    rotate: () => { if (!blot.active) h.rotate(); },
    hover: (x, y) => h.hover(x, y),
    key: (c) => { if (!blot.active) h.key(c); },
    wheel: () => { if (!blot.active) h.wheel(); },
  };
}

export function setScene(s: Scene): void {
  if (sm.cur) {
    sm.cur.handler.cancel();
    sm.cur.exit();
  }
  sm.cur = s;
  input.handler = guard(s.handler);
  s.enter();
}

/** 墨渍转场后切换场景 */
export function gotoScene(make: () => Scene, cx = 0.5, cy = 0.5): void {
  if (blot.active) return;
  input.handler = BLOCK;
  sfx('brush');
  inkTransition(() => setScene(make()), cx, cy);
}

/** 场景工厂（main.ts 注册，避免循环依赖） */
export const factories = {
  title: null as unknown as () => Scene,
  game: null as unknown as (o: { seed?: number; tutorial?: boolean; round?: number }) => Scene,
  ending: null as unknown as (o: EndingData) => Scene,
};

export interface EndingData {
  cleared: boolean;
  round: number;
  score: number;
  roundScores: number[];
  clearBonus: number;
  hearts: number;
  seed: number;
  bestHit: number;
  merges: number;
  spent: number;
  killer: PortraitId | null;
  killerName: string;
}
