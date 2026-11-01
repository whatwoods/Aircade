// 从 ASCII 布局解析背包（敌人与参考构筑共用）
import { AFFIX, DIFFICULTY, ENDLESS, ENEMIES, EVENTS, ITEMS, PLAYER, ROUNDS } from '../config.ts';
import { derive } from '../core/rng.ts';
import { cellsKey, shapeOf, type Cell } from './shapes.ts';
import type { AffixId, EnemyDef, ItemId, Lv, Placed, Rot, RunState } from './types.ts';

/**
 * layout：每行一个字符串，'.' 或空格为空格子；legend：字母 → "id[:lv][方向]"
 * 方向用于号角：'>' '<' '^' 'v' 表示号口朝向。
 */
export function parseBag(layout: string[], legend: Record<string, string>, uidStart = 1): Placed[] {
  const rows = layout.map((r) => r.replace(/\s+/g, ''));
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const seen = new Set<string>();
  const out: Placed[] = [];
  let uid = uidStart;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (!ch || ch === '.' || seen.has(x + ',' + y)) continue;
      // flood fill 同字母连通块
      const comp: Cell[] = [];
      const stack: Cell[] = [[x, y]];
      seen.add(x + ',' + y);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        comp.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || ny >= h || nx >= rows[ny].length) continue;
          if (rows[ny][nx] !== ch || seen.has(nx + ',' + ny)) continue;
          seen.add(nx + ',' + ny);
          stack.push([nx, ny]);
        }
      }
      const spec = legend[ch];
      if (!spec) throw new Error('legend 缺少字母 ' + ch);
      const m = /^([a-z]+)(?::(\d))?([<>^v])?$/.exec(spec);
      if (!m) throw new Error('legend 格式错误 ' + spec);
      const id = m[1] as ItemId;
      if (!ITEMS[id]) throw new Error('未知装备 ' + id);
      const lv = (m[2] ? Number(m[2]) : 1) as Lv;
      const dir = m[3];
      const minX = Math.min(...comp.map((c) => c[0]));
      const minY = Math.min(...comp.map((c) => c[1]));
      const key = cellsKey(comp.map((c) => [c[0] - minX, c[1] - minY] as Cell));
      let found: Rot | null = null;
      for (let r = 0 as Rot; r < 4; r = (r + 1) as Rot) {
        const s = shapeOf(id, r);
        if (cellsKey(s.cells) !== key) continue;
        if (dir && s.mouth && s.tail) {
          const dx = s.mouth[0] - s.tail[0];
          const dy = s.mouth[1] - s.tail[1];
          const want = dir === '>' ? [1, 0] : dir === '<' ? [-1, 0] : dir === 'v' ? [0, 1] : [0, -1];
          if (dx !== want[0] || dy !== want[1]) continue;
        }
        found = r;
        break;
      }
      if (found === null) throw new Error(`形状不匹配：${ch}=${spec} @${x},${y}`);
      out.push({ uid: uid++, id, lv, rot: found, x: minX, y: minY });
    }
  }
  return out;
}

/** 无尽第几轮（第 10 轮及以前为 0） */
export function endlessK(round: number): number {
  return Math.max(0, round - ROUNDS);
}

/** 敌人原表（不含精英、词缀）；无尽轮依次轮换第 cycleFrom–10 轮的敌人 */
export function enemyFor(round: number): EnemyDef {
  const k = endlessK(round);
  if (k > 0) {
    const span = ROUNDS - ENDLESS.cycleFrom + 1;
    return ENEMIES[ENDLESS.cycleFrom - 1 + ((k - 1) % span)];
  }
  return ENEMIES[Math.max(0, Math.min(ENEMIES.length - 1, round - 1))];
}

/** 无尽轮敌人装备的最低等级（0 = 不改） */
function endlessLvFloor(round: number): number {
  const k = endlessK(round);
  if (k === 0) return 0;
  return Math.min(3, 1 + ENDLESS.lvFloorPerCycle * Math.ceil(k / (ROUNDS - ENDLESS.cycleFrom + 1)));
}

const ALL_AFFIXES: AffixId[] = ['tough', 'swift', 'armored', 'shielded', 'regen'];

/** 这一局第 round 轮敌人的词缀（确定性：hash(seed, 'affix', round)） */
export function affixesFor(seed: number, round: number, tier = 0): AffixId[] {
  const e = enemyFor(round);
  let n = 0;
  const k = endlessK(round);
  if (k > 0) n = Math.min(ENDLESS.affixMax, ENDLESS.affixBase + Math.floor(k / ENDLESS.affixEvery));
  else if (e.boss) n = tier >= DIFFICULTY.bossAffixFrom ? 1 : 0;
  else if (round >= AFFIX.fromRound) n = tier >= DIFFICULTY.twoAffixFrom ? 2 : AFFIX.perEnemy;
  if (n === 0) return [];
  const rng = derive(seed, 'affix', round);
  const pool = [...ALL_AFFIXES];
  const out: AffixId[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

const runEnemyCache = new Map<string, EnemyDef>();
/** 本局实际遇到的敌人：词缀（坚韧加生命）+ 精英（生命 ×EVENTS.eliteHpMul，称号前加"精英"） */
export function runEnemy(run: Pick<RunState, 'seed' | 'elite' | 'tier'>, round: number): EnemyDef {
  const affixes = affixesFor(run.seed, round, run.tier);
  const key = round + '|' + run.elite + '|' + run.tier + '|' + affixes.join(',');
  let x = runEnemyCache.get(key);
  if (!x) {
    const e = enemyFor(round);
    let hp = e.hp * (1 + ENDLESS.hpPerRound * endlessK(round));
    if (affixes.includes('tough')) hp *= AFFIX.toughHpMul;
    if (run.elite) hp *= EVENTS.eliteHpMul;
    if (run.tier >= DIFFICULTY.hpMulFrom) hp *= DIFFICULTY.hpMul;
    const k = endlessK(round);
    x = { ...e, hp: Math.round(hp), title: (run.elite ? '精英' : '') + e.title, affixes, speed: k > 0 ? ENDLESS.speedPerRound * k : undefined };
    runEnemyCache.set(key, x);
  }
  return x;
}

const enemyBagCache = new Map<number, Placed[]>();
export function enemyBag(round: number): Placed[] {
  let b = enemyBagCache.get(round);
  if (!b) {
    const e = enemyFor(round);
    b = parseBag(e.layout, e.legend, 1001);
    const floor = endlessLvFloor(round);
    if (floor > 0) b = b.map((p) => ({ ...p, lv: Math.max(p.lv, floor) as Placed['lv'] }));
    enemyBagCache.set(round, b);
  }
  return b;
}

/** 玩家生命上限；无尽轮停在第 10 轮的值 */
export function playerMaxHp(round: number): number {
  return PLAYER.baseHp + PLAYER.hpPerRound * (Math.min(round, ROUNDS) - 1);
}
