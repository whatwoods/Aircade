// 装备文字说明：把 config 里的 {dmg} 等占位符换成（含加成后的）数值
import { ITEMS } from '../config.ts';
import type { Derived, ItemId, Lv } from '../game/types.ts';
import type { DetailInfo } from '../render/views/hudView.ts';

const PCT = new Set(['speed', 'boost', 'reviveFrac']);

function fmt(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return v.toFixed(1).replace(/\.0$/, '');
}

/** 不在背包里时的基础数值 */
function baseValues(id: ItemId, lv: Lv): Record<string, number> {
  const def = ITEMS[id];
  const st = def.lv[lv - 1];
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(st)) out[k] = v as number;
  out.cd = def.cd ?? 0;
  if (def.trigger === 'lowHp') out.lowHpHeal = st.heal ?? 0;
  return out;
}

function derivedValues(id: ItemId, lv: Lv, d: Derived): Record<string, number> {
  const v = baseValues(id, lv);
  v.cd = d.speedMul > 0 ? d.cd / d.speedMul : d.cd;
  v.dmg = d.dmg;
  v.shield = d.shield;
  v.heal = d.heal;
  v.poison = d.poison;
  v.stun = d.stun;
  v.reduce = d.reduce;
  v.reviveFrac = d.reviveFrac;
  v.startShield = d.startShield;
  v.lowHpHeal = d.lowHpHeal;
  v.cleanse = d.cleanse;
  return v;
}

export function fill(tpl: string, id: ItemId, vals: Record<string, number>): string {
  const def = ITEMS[id];
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vals[k] ?? 0;
    if (PCT.has(k) || (k === 'adj' && def.adj.kind === 'countTag' && def.adj.stat === 'reviveFrac')) return Math.round(v * 100) + '%';
    return fmt(v);
  });
}

export function describe(id: ItemId, lv: Lv, d?: Derived | null): DetailInfo {
  const def = ITEMS[id];
  const vals = d ? derivedValues(id, lv, d) : baseValues(id, lv);
  let effect = fill(def.text.effect, id, vals);
  if (d && d.speedMul > 1.001 && def.trigger === 'cooldown') effect += `（攻速 ×${d.speedMul.toFixed(2).replace(/0$/, '')}）`;
  if (d && d.shieldOnHit > 0) effect += `，攻击 +${d.shieldOnHit} 护盾`;
  const adj = fill(def.text.adj, id, baseValues(id, lv));
  return { id, lv, effect, adj };
}

/** 合成后（下一级）的效果行 */
export function nextLevel(id: ItemId, lv: Lv): string | null {
  if (lv >= 3) return null;
  return fill(ITEMS[id].text.effect, id, baseValues(id, (lv + 1) as Lv));
}
