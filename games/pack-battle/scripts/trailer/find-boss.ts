// 找一个第 10 轮背包：被龙炎打到见底 → 凤凰复活 → 反杀古龙（宣传片镜头 8–11 用）
import { BAG, ENEMIES } from '../../src/config.ts';
import { simulate } from '../../src/game/battle/sim.ts';
import { enemyBag, playerMaxHp, parseBag } from '../../src/game/enemies.ts';

const e = ENEMIES[9];
const base = { S: 'sword', W: 'buckler', A: 'axe', D: 'dagger', G: 'glove', M: 'whetstone', L: 'leather', I: 'helmet', O: 'moonstone', P: 'potion', F: 'phoenix' };
const layout = ['.SWWAA', 'DSWWA.', 'GSM.AF', 'GLLLIF', 'PPLOIF'];
const out: string[] = [];
const lv = [1, 2, 3];
for (const s of lv) for (const a of lv) for (const d of lv) for (const m of lv) for (const w of [1, 2]) for (const l of [1, 2]) for (const p of [1, 2]) {
  const legend: Record<string, string> = { ...base, S: 'sword:' + s, A: 'axe:' + a, D: 'dagger:' + d, M: 'whetstone:' + m, W: 'buckler:' + w, L: 'leather:' + l, P: 'potion:' + p, G: 'glove:2' };
  const items = parseBag(layout, legend).map((x) => ({ ...x, zone: 'bag' as const, slot: 0, value: 0, boughtStamp: 0 }));
  const res = simulate(
    { items, cols: BAG.cols, rows: BAG.rows, maxHp: playerMaxHp(10), open: Array(BAG.rows).fill(0).map(() => Array(BAG.cols).fill(true)) as any },
    { items: enemyBag(10), cols: e.cols, rows: e.rows, maxHp: e.hp, traits: e.traits, affixes: e.affixes, speed: e.speed },
  );
  const rev = res.events.find((x) => x.type === 'revive');
  if (res.winner !== 0 || !rev) continue;
  const enr = res.events.find((x) => x.type === 'phase');
  const after = res.duration - rev.t;
  out.push(`${after.toFixed(1)}s after revive · dur ${res.duration.toFixed(1)} · revive@${rev.t.toFixed(1)} · enrage@${enr?.t.toFixed(1)} · S${s} A${a} D${d} M${m} W${w} L${l} P${p}`);
}
out.sort((a, b) => parseFloat(b) - parseFloat(a));
console.log(out.length, '\n' + out.slice(0, 15).join('\n'));
