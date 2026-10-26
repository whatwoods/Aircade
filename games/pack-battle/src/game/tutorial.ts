// 首局引导步骤机 + 情境提示标记
import { load, remove, save } from '../core/storage.ts';

export type HintId = 'sell' | 'stash' | 'boss' | 'poison' | 'loss' | 'interest';

export const HINT_TEXT: Record<HintId, string> = {
  sell: '把装备拖回摊位可以卖掉',
  stash: '桌边的装备不参战',
  boss: '首领半血会变强',
  poison: '中毒无视护盾',
  loss: '失去 1 颗心：调整背包，再战同一对手',
  interest: '存钱有利息：每 10 金下轮 +1',
};

export const TUT_TEXT: Record<number, string> = {
  1: '把「铁剑」拖进背包',
  2: '再把「磨刀石」放在剑旁边',
  3: '轻点背包里的装备，可以旋转',
  4: '还剩 {gold} 金，想买就买。\n准备好就点「开战」！',
  5: '转满一圈，装备自动出手',
  6: '相同的装备叠上去 → 合成升级！',
};

export function tutorialDone(): boolean {
  return load<number>('tutorialDone', 0) === 1;
}

export function markTutorialDone(): void {
  save('tutorialDone', 1);
}

export function resetTutorialFlag(): void {
  remove('tutorialDone');
}

let hints: Partial<Record<HintId, number>> = load<Partial<Record<HintId, number>>>('hints', {});

export function hintSeen(id: HintId): boolean {
  return hints[id] === 1;
}

export function markHint(id: HintId): void {
  hints[id] = 1;
  save('hints', hints);
}

export function resetHints(): void {
  hints = {};
  remove('hints');
}

/** 引导状态（UI 层驱动） */
export class Tutorial {
  /** 0 = 关闭；1–4 整理引导；5 首战；6 第 2 轮合成提示；99 完成 */
  step = 0;
  /** 进入当前步骤后的秒数 */
  t = 0;
  /** 步骤 2：完成后停留提示 */
  praise = 0;
  /** 步骤 2：放得不相邻时的纠正提示 */
  wrong = false;

  start(): void {
    this.go(1);
  }

  go(s: number): void {
    this.step = s;
    this.t = 0;
    this.wrong = false;
  }

  get arranging(): boolean {
    return this.step >= 1 && this.step <= 4;
  }

  update(dt: number): void {
    if (this.step > 0) this.t += dt;
    if (this.praise > 0) {
      this.praise -= dt;
      if (this.praise <= 0) {
        this.praise = 0;
        if (this.step === 2) this.go(3);
      }
    }
  }

  stop(): void {
    this.step = 0;
    this.praise = 0;
  }
}
