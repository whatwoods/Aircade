// 商店掷骰（确定性：hash(seed, round, attempt, refreshIndex)）
import { ITEMS, SHOP, SHOP_POOL, TUTORIAL } from '../config.ts';
import { derive, type Rng } from '../core/rng.ts';
import type { ItemId, Rarity, RunState, ShopSlot } from './types.ts';

const BY_RARITY: ItemId[][] = [[], [], [], []];
for (const id of SHOP_POOL) BY_RARITY[ITEMS[id].rarity].push(id);
const COMMON_WEAPONS = SHOP_POOL.filter((id) => ITEMS[id].rarity === 0 && ITEMS[id].tag === 'weapon');

function ownedIds(run: RunState): Set<ItemId> {
  const s = new Set<ItemId>();
  for (const it of run.bag) if (it.lv < 3) s.add(it.id);
  for (const it of run.stash) if (it && it.lv < 3) s.add(it.id);
  return s;
}

function pickRarity(rng: Rng, round: number): Rarity {
  const w = SHOP.rarityWeights[Math.min(round, SHOP.rarityWeights.length - 1)];
  let total = 0;
  for (const v of w) total += v;
  let r = rng.next() * total;
  for (let i = 0; i < 4; i++) {
    r -= w[i];
    if (r < 0) return i as Rarity;
  }
  return 0;
}

function pickItem(rng: Rng, rarity: Rarity, owned: Set<ItemId>, counts: Map<ItemId, number>): ItemId {
  let pool = BY_RARITY[rarity].filter((id) => (counts.get(id) ?? 0) < SHOP.maxDupPerShop);
  if (pool.length === 0) pool = SHOP_POOL.filter((id) => (counts.get(id) ?? 0) < SHOP.maxDupPerShop);
  let total = 0;
  const ws = pool.map((id) => {
    const w = owned.has(id) ? SHOP.ownedWeightMul : 1;
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= ws[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 掷一次商店。keep：锁定时保留的货品（null 槽会重掷） */
export function rollShop(run: RunState, keep?: ShopSlot[]): ShopSlot[] {
  if (run.tutorial && run.round === 1 && run.attempt === 1 && run.refreshIndex === 0) {
    return TUTORIAL.shop.map((id) => ({ id, price: ITEMS[id].price }));
  }
  const rng = derive(run.seed, 'shop', run.round, run.attempt, run.refreshIndex);
  const owned = ownedIds(run);
  const counts = new Map<ItemId, number>();
  const out: ShopSlot[] = [];
  for (let i = 0; i < SHOP.slots; i++) {
    const k = keep?.[i];
    if (k && k.id) {
      out.push({ id: k.id, price: k.price });
      counts.set(k.id, (counts.get(k.id) ?? 0) + 1);
      continue;
    }
    const id = pickItem(rng, pickRarity(rng, run.round), owned, counts);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    out.push({ id, price: ITEMS[id].price });
  }
  // 前几轮保底武器
  if (run.round <= SHOP.weaponGuaranteeUntil && !out.some((s) => s.id && ITEMS[s.id].tag === 'weapon')) {
    const id = rng.pick(COMMON_WEAPONS);
    out[SHOP.slots - 1] = { id, price: ITEMS[id].price };
  }
  // 引导第 2 轮保底铁剑（用于教合成）
  if (run.tutorial && run.round === 2 && run.refreshIndex === 0 && !out.some((s) => s.id === TUTORIAL.round2Guarantee)) {
    out[0] = { id: TUTORIAL.round2Guarantee, price: ITEMS[TUTORIAL.round2Guarantee].price };
  }
  return out;
}
