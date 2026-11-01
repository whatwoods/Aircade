// 战报：把一场战斗的事件时间线汇总成"每件装备做了多少事"（纯逻辑，可在 node 中运行）
import type { BattleResult, ItemId, Lv, Side } from './types.ts';

export interface ReportRow {
  uid: number;
  id: ItemId;
  lv: Lv;
  /** 打进生命的伤害 */
  dmg: number;
  /** 打掉对方的护盾 */
  broke: number;
  /** 中毒造成的伤害（按各来源当时的层数占比分摊） */
  poison: number;
  shield: number;
  heal: number;
  /** 减伤挡下的伤害 */
  block: number;
  /** 出手次数 */
  fires: number;
}

export interface SideReport {
  rows: ReportRow[];
  /** 首领特性造成的真实伤害（龙炎） */
  traitDmg: number;
  /** 风暴（超时）受到的伤害 */
  storm: number;
}

export function rowTotal(r: ReportRow): number {
  return r.dmg + r.broke + r.poison + r.shield + r.heal + r.block;
}

/** items：双方参战装备（uid 在各自一方内唯一） */
export function battleReport(res: BattleResult, items: [{ uid: number; id: ItemId; lv: Lv }[], { uid: number; id: ItemId; lv: Lv }[]]): [SideReport, SideReport] {
  const sides: [SideReport, SideReport] = [
    { rows: [], traitDmg: 0, storm: 0 },
    { rows: [], traitDmg: 0, storm: 0 },
  ];
  const maps: [Map<number, ReportRow>, Map<number, ReportRow>] = [new Map(), new Map()];
  items.forEach((list, s) => {
    for (const it of list) {
      const row: ReportRow = { uid: it.uid, id: it.id, lv: it.lv, dmg: 0, broke: 0, poison: 0, shield: 0, heal: 0, block: 0, fires: 0 };
      maps[s].set(it.uid, row);
      sides[s].rows.push(row);
    }
  });
  const row = (side: Side, uid: number | undefined): ReportRow | undefined => (uid === undefined ? undefined : maps[side].get(uid));
  // 每一方身上的中毒层数，按来源装备记（来源属于对方）
  const stacks: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  const scaleStacks = (m: Map<number, number>, k: number): void => {
    for (const [u, n] of m) m.set(u, n * k);
  };
  for (const e of res.events) {
    const s = e.side;
    const o = (1 - s) as Side;
    switch (e.type) {
      case 'fire': {
        const r = row(s, e.uid);
        if (r) r.fires++;
        break;
      }
      case 'hit': {
        const r = row(s, e.uid);
        if (r) {
          r.dmg += e.amount ?? 0;
          r.broke += e.absorbed ?? 0;
        } else if (e.fire) sides[s].traitDmg += e.amount ?? 0;
        break;
      }
      case 'shield': {
        const r = row(s, e.uid);
        if (r) r.shield += e.amount ?? 0;
        break;
      }
      case 'heal':
      case 'lowHp':
      case 'revive': {
        const r = row(s, e.uid);
        if (r) r.heal += e.amount ?? 0;
        if (e.type === 'revive') stacks[s].clear();
        break;
      }
      case 'poisonApply': {
        // side = 中毒的一方，uid 是对方的装备
        const m = stacks[s];
        if (e.uid !== undefined) m.set(e.uid, (m.get(e.uid) ?? 0) + (e.amount ?? 0));
        break;
      }
      case 'cleanse': {
        const m = stacks[s];
        let total = 0;
        for (const n of m.values()) total += n;
        if (total > 0) scaleStacks(m, Math.max(0, total - (e.amount ?? 0)) / total);
        break;
      }
      case 'poisonTick': {
        const m = stacks[s];
        let total = 0;
        for (const n of m.values()) total += n;
        if (total <= 0) break;
        for (const [u, n] of m) {
          const r = row(o, u);
          if (r) r.poison += ((e.amount ?? 0) * n) / total;
        }
        break;
      }
      case 'block': {
        const r = row(s, e.uid);
        if (r) r.block += e.amount ?? 0;
        break;
      }
      case 'fatigue':
        sides[s].storm += e.amount ?? 0;
        break;
      default:
        break;
    }
  }
  for (const sr of sides) {
    for (const r of sr.rows) {
      r.poison = Math.round(r.poison);
      r.block = Math.round(r.block);
    }
    sr.rows.sort((a, b) => rowTotal(b) - rowTotal(a));
  }
  return sides;
}
