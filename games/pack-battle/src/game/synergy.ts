// 背包布局 → 每件装备的最终数值 + 加成连线（纯函数）
import { BATTLE, ITEMS } from '../config.ts';
import { adjacency, buildOcc, contactPair, emptyNeighbors, hornLine, type Occ } from './grid.ts';
import type { AdjStat, Derived, Link, LinkKind, Placed, Tag } from './types.ts';
import type { Cell } from './shapes.ts';

export interface SynergyResult {
  derived: Map<number, Derived>;
  links: Link[];
  horns: { uid: number; cells: Cell[]; targets: number[] }[];
  occ: Occ;
  adj: Map<number, Set<number>>;
}

const STAT_KIND: Record<AdjStat, LinkKind> = {
  dmg: 'dmg', shield: 'shield', heal: 'heal', poison: 'poison', reduce: 'reduce',
  reviveFrac: 'heal', startShield: 'shield', lowHpHeal: 'heal',
};

function pct(v: number): string {
  return '+' + Math.round(v * 100) + '%';
}

function statLabel(stat: AdjStat, v: number): string {
  switch (stat) {
    case 'dmg': return `+${v} 伤害`;
    case 'shield': case 'startShield': return `+${v} 护盾`;
    case 'heal': case 'lowHpHeal': return `+${v} 回复`;
    case 'poison': return `+${v} 层中毒`;
    case 'reduce': return `-${v} 受伤`;
    case 'reviveFrac': return `+${Math.round(v * 100)}% 复活`;
  }
}

function matches(tag: Tag, want: Tag | 'any'): boolean {
  return want === 'any' || tag === want;
}

export function computeSynergy(items: readonly Placed[], cols: number, rows: number): SynergyResult {
  const occ = buildOcc(items, cols, rows);
  const adj = adjacency(items, occ);
  const byUid = new Map<number, Placed>();
  for (const it of items) byUid.set(it.uid, it);

  const derived = new Map<number, Derived>();
  const speed = new Map<number, number>();
  const dmgBonus = new Map<number, number>();
  const boost = new Map<number, number>();
  const adjAdd = new Map<number, number>();
  const mult = new Map<number, number>();
  // 有向贡献：from → to
  const contrib: { from: number; to: number; kind: LinkKind; label: string }[] = [];

  for (const it of items) {
    const def = ITEMS[it.id];
    const st = def.lv[it.lv - 1];
    derived.set(it.uid, {
      uid: it.uid, id: it.id, lv: it.lv, tag: def.tag, trigger: def.trigger,
      cd: def.cd ?? 0, speedMul: 1,
      dmg: st.dmg ?? 0, hits: st.hits ?? 1, shield: st.shield ?? 0, shieldOnHit: 0,
      heal: def.trigger === 'lowHp' ? 0 : st.heal ?? 0, poison: st.poison ?? 0, cleanse: st.cleanse ?? 0,
      stun: st.stun ?? 0, reduce: st.reduce ?? 0, reviveFrac: st.reviveFrac ?? 0,
      startShield: st.startShield ?? 0, lowHpHeal: def.trigger === 'lowHp' ? st.heal ?? 0 : 0,
      gold: st.gold ?? 0, shieldBreak: def.shieldBreak ?? 1,
      auraSpeed: st.speed ?? 0, auraDmg: st.dmgBonus ?? 0, auraBoost: st.boost ?? 0,
      sources: [], linkIds: [], emptyCells: [],
    });
    speed.set(it.uid, 0);
    dmgBonus.set(it.uid, 0);
    boost.set(it.uid, 0);
    adjAdd.set(it.uid, 0);
    mult.set(it.uid, 1);
  }

  // 光环
  for (const it of items) {
    const def = ITEMS[it.id];
    if (def.adj.kind !== 'aura') continue;
    const st = def.lv[it.lv - 1];
    const rule = def.adj;
    for (const nu of adj.get(it.uid)!) {
      const n = byUid.get(nu)!;
      const nd = ITEMS[n.id];
      if (!rule.tags.some((t) => matches(nd.tag, t))) continue;
      const tgt = derived.get(nu)!;
      if (rule.stat === 'speed') {
        if (nd.trigger !== 'cooldown') continue;
        const v = st.speed ?? 0;
        speed.set(nu, speed.get(nu)! + v);
        const kind: LinkKind = it.id === 'hourglass' ? 'hourglass' : 'speed';
        const label = (it.id === 'hourglass' ? pct(v) + ' 冷却速度' : pct(v) + ' 攻速');
        contrib.push({ from: it.uid, to: nu, kind, label });
        tgt.sources.push({ uid: it.uid, label: def.name + ' ' + label });
      } else if (rule.stat === 'dmgBonus') {
        const v = st.dmgBonus ?? 0;
        dmgBonus.set(nu, dmgBonus.get(nu)! + v);
        contrib.push({ from: it.uid, to: nu, kind: 'dmg', label: `+${v} 伤害` });
        tgt.sources.push({ uid: it.uid, label: `${def.name} +${v} 伤害` });
      } else if (rule.stat === 'boost') {
        const v = st.boost ?? 0;
        boost.set(nu, boost.get(nu)! + v);
        contrib.push({ from: it.uid, to: nu, kind: 'boost', label: pct(v) + ' 效果' });
        tgt.sources.push({ uid: it.uid, label: def.name + ' ' + pct(v) + ' 效果' });
      }
    }
  }

  // 号角（方向性）
  const horns: SynergyResult['horns'] = [];
  for (const it of items) {
    const def = ITEMS[it.id];
    if (def.adj.kind !== 'line') continue;
    const v = def.lv[it.lv - 1].speed ?? 0;
    const cells = hornLine(it, cols, rows);
    const targets: number[] = [];
    for (const [x, y] of cells) {
      const u = occ.get(x, y);
      if (u > 0 && u !== it.uid && !targets.includes(u)) targets.push(u);
    }
    for (const u of targets) {
      const n = byUid.get(u)!;
      if (ITEMS[n.id].trigger !== 'cooldown') continue;
      speed.set(u, speed.get(u)! + v);
      derived.get(u)!.sources.push({ uid: it.uid, label: def.name + ' ' + pct(v) + ' 冷却速度' });
    }
    horns.push({ uid: it.uid, cells, targets: targets.filter((u) => ITEMS[byUid.get(u)!.id].trigger === 'cooldown') });
  }

  // 自身的相邻规则
  for (const it of items) {
    const def = ITEMS[it.id];
    const st = def.lv[it.lv - 1];
    const rule = def.adj;
    const d = derived.get(it.uid)!;
    const neigh = [...adj.get(it.uid)!];
    if (rule.kind === 'countTag') {
      const per = st.adj ?? 0;
      for (const nu of neigh) {
        const nd = ITEMS[byUid.get(nu)!.id];
        if (!matches(nd.tag, rule.tag)) continue;
        adjAdd.set(it.uid, adjAdd.get(it.uid)! + per);
        const label = statLabel(rule.stat, per);
        contrib.push({ from: nu, to: it.uid, kind: STAT_KIND[rule.stat], label });
        d.sources.push({ uid: nu, label: `${nd.name} ${label}` });
      }
    } else if (rule.kind === 'ifTag') {
      const armors = neigh.filter((nu) => ITEMS[byUid.get(nu)!.id].tag === rule.tag);
      if (armors.length > 0) {
        d.shieldOnHit = st.adj ?? 0;
        for (const nu of armors) {
          contrib.push({ from: nu, to: it.uid, kind: 'shield', label: `攻击 +${d.shieldOnHit} 护盾` });
        }
        d.sources.push({ uid: armors[0], label: `相邻护具：攻击 +${d.shieldOnHit} 护盾` });
      }
    } else if (rule.kind === 'lone') {
      const hasW = neigh.some((nu) => ITEMS[byUid.get(nu)!.id].tag === rule.tag);
      if (!hasW) {
        mult.set(it.uid, rule.mult);
        d.sources.push({ uid: 0, label: `独行 伤害 ×${rule.mult}` });
      }
    } else if (rule.kind === 'emptyCells') {
      const empt = emptyNeighbors(it, occ);
      d.emptyCells = empt;
      const per = st.adj ?? 0;
      if (empt.length > 0) {
        adjAdd.set(it.uid, per * empt.length);
        d.sources.push({ uid: 0, label: `${empt.length} 个相邻空格 +${per * empt.length} 伤害` });
      }
    }
  }

  // 汇总
  for (const it of items) {
    const def = ITEMS[it.id];
    const d = derived.get(it.uid)!;
    const add = adjAdd.get(it.uid)!;
    const b = 1 + boost.get(it.uid)!;
    const rule = def.adj;
    if (rule.kind === 'countTag' || rule.kind === 'emptyCells') {
      const stat: AdjStat = rule.kind === 'countTag' ? rule.stat : 'dmg';
      switch (stat) {
        case 'dmg': d.dmg += add; break;
        case 'shield': d.shield += add; break;
        case 'heal':
          if (def.trigger === 'lowHp') d.lowHpHeal += add;
          else d.heal += add;
          break;
        case 'lowHpHeal': d.lowHpHeal += add; break;
        case 'poison': d.poison += add; break;
        case 'reduce': d.reduce += add; break;
        case 'reviveFrac': d.reviveFrac += add; break;
        case 'startShield': d.startShield += add; break;
      }
    }
    if (def.tag === 'weapon') d.dmg = Math.floor((d.dmg + dmgBonus.get(it.uid)!) * mult.get(it.uid)!);
    if (def.tag === 'armor' || def.tag === 'remedy') {
      d.shield = Math.floor(d.shield * b);
      d.startShield = Math.floor(d.startShield * b);
      d.heal = Math.floor(d.heal * b);
      d.lowHpHeal = Math.floor(d.lowHpHeal * b);
      d.reviveFrac = d.reviveFrac * b;
    }
    d.speedMul = Math.min(BATTLE.speedCap, 1 + speed.get(it.uid)!);
  }

  // 连线合并（无向对）
  const pairMap = new Map<string, Link>();
  const links: Link[] = [];
  let lid = 1;
  for (const c of contrib) {
    const lo = Math.min(c.from, c.to);
    const hi = Math.max(c.from, c.to);
    const key = lo + '-' + hi;
    const ex = pairMap.get(key);
    if (ex) {
      if (ex.from === c.from) continue; // 同方向重复
      if (ex.backKind === null) ex.backKind = c.kind;
      derived.get(c.to)!.linkIds.push(ex.id);
      continue;
    }
    const A = byUid.get(c.from)!;
    const B = byUid.get(c.to)!;
    const cp = contactPair(A, B);
    if (!cp) continue;
    const l: Link = { id: lid++, from: c.from, to: c.to, kind: c.kind, backKind: null, a: cp[0], b: cp[1], label: c.label };
    pairMap.set(key, l);
    links.push(l);
    derived.get(c.to)!.linkIds.push(l.id);
  }

  return { derived, links, horns, occ, adj };
}
