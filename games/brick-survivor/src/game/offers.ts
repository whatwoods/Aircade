// Three-card draw: slots, weights, forced evolution, first-offer element rule, fillers (docs §3.9).
import { config } from '../config';
import type { Card, EvolutionId, UpgradeId } from '../types';
import { MODULE_IDS, UPGRADE_IDS, WEAPON_IDS } from '../types';
import { EVOLUTIONS } from './upgrades';
import type { Game } from './game';

const U = config.upgrades;

export function eligibleEvolutions(g: Game): EvolutionId[] {
  const out: EvolutionId[] = [];
  for (const e of Object.values(EVOLUTIONS)) {
    if (g.evolutions.has(e.id)) continue;
    if (g.levels[e.main] >= 5 && g.levels[e.partner] >= 3) out.push(e.id);
  }
  return out;
}

function weaponCount(g: Game): number {
  let n = 0;
  for (const id of WEAPON_IDS) if (g.levels[id] > 0) n++;
  return n;
}
function moduleCount(g: Game): number {
  let n = 0;
  for (const id of MODULE_IDS) if (g.levels[id] > 0) n++;
  return n;
}

export function upgradeCandidates(g: Game): { id: UpgradeId; w: number }[] {
  const wFull = weaponCount(g) >= U.weaponSlots;
  const mFull = moduleCount(g) >= U.moduleSlots;
  const out: { id: UpgradeId; w: number }[] = [];
  for (const id of UPGRADE_IDS) {
    const lv = g.levels[id];
    if (lv >= 5) continue;
    const isWeapon = WEAPON_IDS.includes(id);
    if (lv === 0 && (isWeapon ? wFull : mFull)) continue;
    let w = isWeapon ? U.weightWeapon : U.weightModule;
    if (lv > 0) w *= U.ownedMult;
    out.push({ id, w });
  }
  return out;
}

export function rollOffer(g: Game): Card[] {
  const cards: Card[] = [];
  const rng = g.rng;
  const evo = eligibleEvolutions(g);
  if (evo.length > 0) {
    const id = evo[rng.int(0, evo.length - 1)]!;
    cards.push({ kind: 'evolution', id, from: 0, to: 1 });
  }
  const pool = upgradeCandidates(g);
  while (cards.length < 3 && pool.length > 0) {
    let total = 0;
    for (const c of pool) total += c.w;
    let r = rng.next() * total;
    let pick = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.w;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    const c = pool.splice(pick, 1)[0]!;
    cards.push({ kind: 'upgrade', id: c.id, from: g.levels[c.id], to: g.levels[c.id] + 1 });
  }
  // first ever offer must include an element
  if (g.offersMade === 0) {
    const hasElement = cards.some((c) => c.id === 'fire' || c.id === 'ice' || c.id === 'blast');
    if (!hasElement) {
      const els: UpgradeId[] = ['fire', 'ice', 'blast'];
      const id = els[rng.int(0, 2)]!;
      const idx = cards.length >= 3 ? 2 : cards.length;
      cards[idx] = { kind: 'upgrade', id, from: g.levels[id], to: g.levels[id] + 1 };
    }
  }
  while (cards.length < 3) {
    const hasBattery = cards.some((c) => c.kind === 'battery');
    const hurt = g.player.hp < g.stats.maxHp;
    if (!hasBattery && (hurt || cards.some((c) => c.kind === 'cache'))) cards.push({ kind: 'battery', id: 'battery', from: 0, to: 0 });
    else cards.push({ kind: 'cache', id: 'cache', from: 0, to: 0 });
  }
  g.offersMade++;
  return cards;
}

/** Recipe hint: this upgrade is part of an evolution whose other half the player owns. */
export function recipeHint(g: Game, id: UpgradeId): string | null {
  for (const e of Object.values(EVOLUTIONS)) {
    if (g.evolutions.has(e.id)) continue;
    if (e.main === id && g.levels[e.partner] > 0) return `⛓ 进化：${e.name}（需 ${nameOf(e.partner)} Lv3）`;
    if (e.partner === id && g.levels[e.main] > 0) return `⛓ 进化：+${nameOf(e.main)} Lv5 → ${e.name}`;
  }
  return null;
}

function nameOf(id: UpgradeId): string {
  const n: Record<UpgradeId, string> = {
    multi: '多球', pierce: '穿透', split: '分裂', fire: '燃烧', ice: '冰冻', blast: '爆炸', homing: '追踪',
    power: '超载', overclock: '超频', magnet: '磁核', wide: '宽域', aegis: '护盾',
  };
  return n[id];
}
