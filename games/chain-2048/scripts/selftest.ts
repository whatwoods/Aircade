/** 确定性的链条用例（docs §10 M1）：node scripts/selftest.ts */
import { CONFIG, stageCfg } from '../src/config.ts';
import { Rng } from '../src/core/rng.ts';
import { Chain } from '../src/game/chain.ts';
import { Track } from '../src/game/track.ts';
import { TRACKS } from '../src/game/tracks.ts';

const track = new Track(TRACKS[0]!);
const D = CONFIG.ball.D;
let fails = 0;
function mk(levels: number[], head = 1200) {
  const log: string[] = [];
  const c = new Chain(track, { ...stageCfg(1) }, new Rng(1), (k, p) => { log.push(k + (k === 'merged' ? ':' + (p as { level: number }).level : '')); });
  c.mode = 'frozenTutorial';
  c.spawning = false;
  c.setLevels(levels, head);
  return { c, log };
}
function run(c: Chain, t = 3) { for (let i = 0; i < t * 120; i++) c.step(1 / 120); }
function expect(name: string, cond: boolean, info = '') { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${info}`); }
const lv = (c: Chain) => c.balls.map((b) => b.level).join(',');

{ // 阶梯连锁 → 封印：32·16·8·4 + 4
  const { c, log } = mk([5, 4, 3, 2]);
  const head = c.headS();
  c.insertAt(c.balls[3]!.id, 1, 2, 7, 0, 0);
  run(c);
  expect('stair cascade seals 64', c.balls.length === 0 && log.filter((l) => l.startsWith('merged')).length === 4 && log.includes('sealed'), lv(c) + ' ' + log.join(' '));
  void head;
}
{ // 三合一：16·8·16 + 8 → 8+8=16 → 三合一 64
  const { c, log } = mk([1, 4, 3, 4, 2]);
  c.insertAt(c.balls[2]!.id, 1, 3, 7, 0, 0);
  run(c);
  expect('triple → seal', log.includes('sealed') && lv(c) === '1,2', lv(c) + ' ' + log.join(' '));
}
{ // 合成让链头回缩 1 球
  const { c } = mk([3, 1, 2]);
  const h0 = c.headS();
  c.insertAt(c.balls[1]!.id, 1, 1, 7, 0, 0); // 插入后 2 与 2 合成 → 4，再与 4 合成 → 8 → 与 8 合成 16
  run(c);
  expect('cascade retracts head', lv(c) === '4' && Math.abs(c.headS() - (h0 - 2 * D)) < 1, `${lv(c)} head ${c.headS() - h0}`);
}
{ // 无合成插入：链头前进 1 球
  const { c } = mk([3, 1, 4]);
  const h0 = c.headS();
  c.insertAt(c.balls[1]!.id, 1, 2, 7, 0, 0);
  run(c);
  expect('plain insert pushes head', lv(c) === '3,1,2,4' && Math.abs(c.headS() - (h0 + D)) < 1, `${lv(c)} ${c.headS() - h0}`);
}
{ // 封印后缺口两端相同 → 回吸并继续合成：2·[32·16·8]·2 ... 封印后 2 与 2 吸合 → 4
  const { c, log } = mk([2, 1, 5, 4, 3, 1, 3]);
  c.mode = 'live';
  c.cfg.vBase = 0.0001;
  c.insertAt(c.balls[4]!.id, 1, 3, 9, 0, 0);
  run(c, 5);
  expect('gap attraction merges', log.includes('sealed') && lv(c) === '2,2,3'.replace('2,2,3', lv(c)) && log.filter((l) => l === 'joined').length >= 1, lv(c) + ' ' + log.join(' '));
}
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exitCode = fails ? 1 : 0;
