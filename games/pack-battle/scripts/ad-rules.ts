// 广告奖励规则检查：pnpm ad-rules（限次、每日挑战不给、复活计分、补给发放）
import assert from 'node:assert/strict';
import { AD, DIFFICULTY, ECONOMY, EVENTS, PLAYER, SCORE } from '../src/config.ts';
import { applyResult, beginArrange, canRevive, canSupply, canTakeBoth, enterEndless, newRun, revive, takeBoth, takeSupply } from '../src/game/run.ts';
import type { BattleResult, RunState } from '../src/game/types.ts';

const battle = (win: boolean): BattleResult => ({
  winner: win ? 0 : 1, duration: 1, maxHp: [100, 100], hpEnd: win ? [100, 0] : [0, 100], bestHit: 1, events: [],
});

function atRound(round: number, mode = { tier: 0 } as { tier: number; daily?: string }): RunState {
  const run = newRun(1, false, mode);
  run.round = round;
  run.attempt = 1;
  run.phase = 'arrange';
  return run;
}

function loseAll(run: RunState): void {
  while (run.hearts > 0) applyResult(run, battle(false));
}

// 复活：回 1 颗心、限次、撤掉难度加成
{
  const run = atRound(5, { tier: 2 });
  run.score = 1000;
  loseAll(run);
  assert.equal(run.phase, 'ending');
  assert.equal(run.tierBonus, Math.round(1000 * DIFFICULTY.scoreBonus * 2));
  assert.ok(canRevive(run));
  assert.ok(revive(run));
  assert.deepEqual([run.hearts, run.phase, run.score, run.tierBonus], [1, 'result', 1000, 0]);
  assert.ok(!canRevive(run));
  loseAll(run);
  assert.equal(run.phase, 'ending');
  assert.ok(!canRevive(run), '每局只能复活一次');
  assert.equal(run.score, 1000 + Math.round(1000 * DIFFICULTY.scoreBonus * 2), '加成不重复算');
}

// 复活后再通关：复活的心不算通关奖励
{
  const run = atRound(10);
  run.hearts = 1;
  applyResult(run, battle(false));
  revive(run);
  const out = applyResult(run, battle(true));
  assert.equal(run.clearHearts, 0);
  assert.equal(out.clearBonus, SCORE.clearBonus);
}

// 无尽：多给一次复活，加成只算一份
{
  const run = atRound(10, { tier: 1 });
  applyResult(run, battle(true));
  assert.ok(enterEndless(run));
  loseAll(run);
  const bonus = run.tierBonus;
  const score = run.score;
  assert.ok(revive(run));
  assert.equal(run.score, score, '无尽复活不动分数');
  loseAll(run);
  assert.equal(run.tierBonus, bonus);
  assert.equal(run.score, score);
  assert.ok(revive(run), '无尽里第二次：通关前没用过，这里还有一次');
  loseAll(run);
  assert.ok(!canRevive(run));
}

// 败北补给：第 3 轮起、还有心、每局一次，下次账单发放后清零
{
  const early = atRound(AD.fromRound - 1);
  applyResult(early, battle(false));
  assert.ok(!canSupply(early));
  const run = atRound(AD.fromRound);
  applyResult(run, battle(false));
  assert.ok(takeSupply(run));
  assert.ok(!canSupply(run));
  const before = run.gold;
  const lines = beginArrange(run);
  assert.ok(lines.some((l) => l.label === '败北补给' && l.amount === AD.supplyGold));
  assert.equal(run.gold, before + lines.reduce((a, l) => a + l.amount, 0));
  assert.equal(run.adGold, 0);
  assert.ok(lines.some((l) => l.amount === ECONOMY.lossBonus));
  run.hearts = 1;
  applyResult(run, battle(false));
  assert.ok(!canSupply(run), '心掉光时给复活，不给补给');
}

// 两张都要：第 3 轮起、每局一次，两个事件都生效
{
  const run = atRound(AD.fromRound);
  run.hearts = PLAYER.hearts - 1;
  run.choice = ['cache', 'rest'];
  assert.ok(takeBoth(run));
  assert.equal(run.gold, EVENTS.cacheGold);
  assert.equal(run.hearts, PLAYER.hearts);
  assert.equal(run.choice, null);
  run.choice = ['cache', 'market'];
  assert.ok(!canTakeBoth(run), '每局只能一次');
  const early = atRound(AD.fromRound - 1);
  early.choice = ['cache', 'market'];
  assert.ok(!canTakeBoth(early));
}

// 每日挑战：三项都不给
{
  const run = atRound(5, { tier: 2, daily: '2026-11-02' });
  run.choice = ['cache', 'market'];
  assert.ok(!canTakeBoth(run));
  run.choice = null;
  applyResult(run, battle(false));
  assert.ok(!canSupply(run));
  loseAll(run);
  assert.ok(!canRevive(run));
}

console.log('广告规则检查通过');
