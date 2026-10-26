import { type Records, save } from '../core/storage';
import type { ScoreBreakdown } from './types';

export interface RecordResult {
  prevBest: number;
  newBest: boolean;
  newFastest: boolean;
}

/** 结算：更新本地记录（最高分、最快通关、通关/总局数）并保存 */
export function commitRecords(rec: Records, b: ScoreBreakdown): RecordResult {
  const prevBest = rec.best;
  const newBest = b.total > rec.best && b.total > 0;
  rec.plays++;
  if (newBest) rec.best = b.total;
  let newFastest = false;
  if (b.won) {
    rec.wins++;
    if (rec.bestTime === 0 || b.timeSec < rec.bestTime) {
      newFastest = rec.bestTime !== 0;
      rec.bestTime = b.timeSec;
    }
  }
  save('records', rec);
  return { prevBest, newBest, newFastest };
}

/** 结算行：标签与数值（文档 §4.7 D） */
export function breakdownRows(b: ScoreBreakdown): { label: string; detail: string; value: number }[] {
  const rows = [
    { label: '击杀', detail: `${b.kills} 只`, value: b.killScore },
    { label: '金币', detail: '', value: b.gold },
  ];
  if (b.won) {
    rows.push({ label: '屠龙', detail: '', value: b.dragon });
    rows.push({ label: '余勇', detail: `生命 ${b.hpLeft} × 30`, value: b.hpScore });
    rows.push({ label: '迅捷', detail: fmtTime(b.timeSec), value: b.timeScore });
  }
  if (b.fullClear > 0) rows.push({ label: '肃清', detail: '', value: b.fullClear });
  return rows;
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
