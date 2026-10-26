// 从 ASCII 布局解析背包（敌人与参考构筑共用）
import { ENEMIES, ITEMS, PLAYER } from '../config.ts';
import { cellsKey, shapeOf, type Cell } from './shapes.ts';
import type { EnemyDef, ItemId, Lv, Placed, Rot } from './types.ts';

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

export function enemyFor(round: number): EnemyDef {
  return ENEMIES[Math.max(0, Math.min(ENEMIES.length - 1, round - 1))];
}

const enemyBagCache = new Map<number, Placed[]>();
export function enemyBag(round: number): Placed[] {
  let b = enemyBagCache.get(round);
  if (!b) {
    const e = enemyFor(round);
    b = parseBag(e.layout, e.legend, 1001);
    enemyBagCache.set(round, b);
  }
  return b;
}

export function playerMaxHp(round: number): number {
  return PLAYER.baseHp + PLAYER.hpPerRound * (round - 1);
}
