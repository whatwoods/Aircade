// npm run balance：参考构筑 × 10 个敌人 → 战斗报表
import { BAG, ENEMIES } from '../src/config.ts';
import { simulate } from '../src/game/battle/sim.ts';
import { enemyBag, playerMaxHp, parseBag } from '../src/game/enemies.ts';
import { computeSynergy } from '../src/game/synergy.ts';
import { buildFor } from './balance-builds.ts';

const pad = (s: string | number, n: number): string => {
  const str = String(s);
  let w = 0;
  for (const ch of str) w += ch.charCodeAt(0) > 255 ? 2 : 1;
  return str + ' '.repeat(Math.max(0, n - w));
};

const stats = (items: ReturnType<typeof parseBag>, cols: number, rows: number): string => {
  const syn = computeSynergy(items, cols, rows);
  let dps = 0;
  let sps = 0;
  let hps = 0;
  let start = 0;
  let red = 0;
  for (const d of syn.derived.values()) {
    const rate = d.cd > 0 ? d.speedMul / d.cd : 0;
    if (d.tag === 'weapon') {
      dps += d.dmg * d.hits * rate;
      sps += d.shieldOnHit * rate;
    }
    if (d.tag === 'armor') sps += d.shield * rate;
    if (d.tag === 'remedy') hps += d.heal * rate;
    start += d.startShield;
    red += d.reduce;
  }
  return `D${dps.toFixed(1)} S${sps.toFixed(1)} H${hps.toFixed(1)} +${start}${red ? ' -' + red : ''}`;
};
console.log('轮 敌人        生命 | 构筑 胜负  用时   剩余生命   敌剩余   | 玩家 / 敌人');
console.log('-'.repeat(84));
for (const e of ENEMIES) {
  const r = e.round;
  for (const kind of ['weak', 'mid', 'strong'] as const) {
    const b = buildFor(r, kind);
    if (!b) continue;
    const items = parseBag(b.layout, b.legend, 1);
    const maxHp = playerMaxHp(r);
    const res = simulate(
      { items, cols: BAG.cols, rows: BAG.rows, maxHp },
      { items: enemyBag(r), cols: e.cols, rows: e.rows, maxHp: e.hp, traits: e.traits },
    );
    const hpPct = Math.round((res.hpEnd[0] / maxHp) * 100);
    const ePct = Math.round((res.hpEnd[1] / e.hp) * 100);
    console.log(
      `${pad(r, 3)}${pad(e.title, 10)}${pad(e.hp, 5)}| ${pad(kind, 7)}${pad(res.winner === 0 ? '胜' : '负', 5)}${pad(res.duration.toFixed(1) + 's', 7)}` +
        `${pad(res.hpEnd[0] + '/' + maxHp + ' (' + hpPct + '%)', 15)}${pad(ePct + '%', 9)}| ${stats(items, BAG.cols, BAG.rows)} / ${stats(enemyBag(r), e.cols, e.rows)}`,
    );
  }
}
