// 中途存档：整理阶段随改随存；开战那一刻存"打完之后"的状态（杀进程不能重打）
import { ITEMS, ROUNDS, SHOP } from '../config.ts';
import { load, remove, save } from '../core/storage.ts';
import type { ItemInst, RunState } from './types.ts';

const KEY = 'run';
const VER = 1;

interface SavedRun {
  v: number;
  run: RunState;
}

/** 调试接口改过的局、首局引导第 1 场之前的局不存 */
export function saveable(run: RunState): boolean {
  return !run.debug && !(run.tutorial && run.round === 1 && run.attempt === 1);
}

export function saveRun(run: RunState): void {
  if (!saveable(run)) return;
  save(KEY, { v: VER, run } satisfies SavedRun);
}

export function clearRun(): void {
  remove(KEY);
}

function validItem(it: ItemInst | null): boolean {
  return !!it && typeof it.uid === 'number' && !!ITEMS[it.id] && it.lv >= 1 && it.lv <= 3;
}

/** 读档；格式不对就丢弃 */
export function loadRun(): RunState | null {
  const s = load<SavedRun | null>(KEY, null);
  const r = s?.run;
  if (!s || s.v !== VER || !r) return null;
  const ok =
    r.round >= 1 && r.round <= ROUNDS && r.hearts >= 0 &&
    (r.phase === 'arrange' || r.phase === 'result' || r.phase === 'ending') &&
    Array.isArray(r.bag) && r.bag.every(validItem) &&
    Array.isArray(r.stash) && r.stash.length === SHOP.stashSlots && r.stash.every((x) => x === null || validItem(x)) &&
    Array.isArray(r.shop) && !!r.stats;
  if (!ok) {
    clearRun();
    return null;
  }
  return r;
}
