// 收入账单
import { ECONOMY } from '../config.ts';
import type { RunState } from './types.ts';

export interface ReceiptLine {
  label: string;
  amount: number;
}

/** 本次整理开始时的收入明细（第 1 轮首战没有账单） */
export function receiptFor(run: RunState): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  if (run.round === 1 && run.attempt === 1) return lines;
  const base = run.round === 1 ? ECONOMY.incomeByRound[2] : ECONOMY.incomeByRound[Math.min(run.round, ECONOMY.incomeByRound.length - 1)];
  lines.push({ label: run.attempt > 1 ? '本轮收入（再战）' : '本轮收入', amount: base });
  if (run.lastResult === 'win') lines.push({ label: '胜利奖励', amount: ECONOMY.winBonus });
  else if (run.lastResult === 'loss') lines.push({ label: '失败补偿', amount: ECONOMY.lossBonus });
  const interest = Math.min(ECONOMY.interestCap, Math.floor(run.savedGold / ECONOMY.interestStep));
  if (interest > 0) lines.push({ label: `利息（存 ${run.savedGold} 金）`, amount: interest });
  if (run.pouchGold > 0) lines.push({ label: '钱袋', amount: run.pouchGold });
  return lines;
}

export function sellPrice(value: number, boughtStamp: number, phaseStamp: number): number {
  if (ECONOMY.sameRoundFullRefund && boughtStamp === phaseStamp) return value;
  return Math.max(1, Math.floor(value * ECONOMY.sellRatio));
}
