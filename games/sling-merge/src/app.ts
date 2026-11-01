/**
 * 应用级接口：main.ts 组装各系统，debug / ui 通过它协作（只用类型，避免循环依赖）。
 */
import type { Game } from './game/game';
import type { Loop } from './core/loop';
import type { Stage } from './core/stage';
import type { Input } from './core/input';

export interface QualityApi {
  level: number;
  locked: boolean;
  set(level: number, lock?: boolean): void;
}

export interface RendererApi {
  hitboxes: boolean;
  particleCount(): number;
}

export interface App {
  game: Game;
  loop: Loop;
  stage: Stage;
  input: Input;
  renderer: RendererApi;
  quality: QualityApi;
  /** 开新局；transition=false 时立即切换（自动化用） */
  startRun(tutorial: boolean, transition: boolean): void;
  toTitle(transition: boolean): void;
  /** 立即显示结算 */
  showResults(): void;
  /** panel=false：静默暂停（调试工具用，不弹面板） */
  pause(panel?: boolean): void;
  resume(): void;
  isPaused(): boolean;
  fps(): number;
}
