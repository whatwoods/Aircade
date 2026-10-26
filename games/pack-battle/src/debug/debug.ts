// ?debug=1：FPS 浮层（DOM）+ window.__game 测试 / 审查接口（坐标一律为 CSS 像素）
import { sfx } from '../audio/sfx.ts';
import { BAG, ENEMIES, ITEMS, ROUNDS, SCORE } from '../config.ts';
import { clock } from '../core/loop.ts';
import { simulate as runSim } from '../game/battle/sim.ts';
import { enemyBag, enemyFor, parseBag, playerMaxHp } from '../game/enemies.ts';
import { giveItem } from '../game/run.ts';
import { rollShop } from '../game/shop.ts';
import { markTutorialDone, resetHints, resetTutorialFlag } from '../game/tutorial.ts';
import type { BattleEvent, BattleResult, ItemId, ItemInst, Lv, Rot } from '../game/types.ts';
import { particles, emit } from '../render/fx/particles.ts';
import { popup } from '../render/fx/popups.ts';
import { tier } from '../render/fx/shake.ts';
import { C } from '../render/kit.ts';
import { rectCss, stage } from '../render/stage.ts';
import { GameScene } from '../scenes/gameScene.ts';
import { factories, gotoScene, setScene, sm } from '../scenes/sceneManager.ts';
import { buildFor } from '../../scripts/balance-builds.ts';

type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });

function game(): GameScene | null {
  return sm.cur instanceof GameScene ? sm.cur : null;
}

function safe<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R | Fail {
  return (...a: A) => {
    try {
      return fn(...a);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

function css(r: { x: number; y: number; w: number; h: number } | null | undefined) {
  return r ? rectCss(r.x, r.y, r.w, r.h) : null;
}

/** 确保处于游戏场景（同步切换，不走转场） */
function ensureGame(): GameScene {
  const g = game();
  if (g) return g;
  setScene(factories.game({ tutorial: false }));
  return game()!;
}

function applyBuild(gs: GameScene, round: number, build: string): void {
  const run = gs.run;
  run.bag.length = 0;
  run.stash.fill(null);
  if (build === 'none') return;
  const def = buildFor(round, build === 'weak' || build === 'strong' ? build : 'mid');
  if (!def) return;
  const placed = parseBag(def.layout, def.legend, run.nextUid);
  for (const p of placed) {
    const inst: ItemInst = {
      uid: run.nextUid++, id: p.id, lv: p.lv, rot: p.rot, zone: 'bag', x: p.x, y: p.y, slot: 0,
      value: ITEMS[p.id].price * (p.lv === 1 ? 1 : p.lv === 2 ? 2 : 4), boughtStamp: 0,
    };
    run.bag.push(inst);
  }
}

function gotoRound(n: number, build: 'none' | 'weak' | 'mid' | 'strong' = 'mid'): { ok: true; round: number } | Fail {
  if (!(n >= 1 && n <= ROUNDS)) return fail('轮次应在 1–10');
  const g = ensureGame();
  g.gotoRoundDirect(n);
  applyBuild(g, n, build);
  g.rebuild();
  return { ok: true, round: n };
}

/** 把当前战斗换成一个立即分出胜负的时间线 */
function forceResult(gs: GameScene, win: boolean): true | Fail {
  if (gs.phase === 'arrange') gs.goBattle();
  if (gs.phase !== 'toBattle' && gs.phase !== 'battle') return fail('当前阶段不能结束战斗：' + gs.phase);
  const real = gs.bc.res;
  if (!real) return fail('没有战斗');
  const maxHp = real.maxHp;
  const hpEnd: [number, number] = win ? [maxHp[0], 0] : [0, maxHp[1]];
  const ev = (t: number, type: BattleEvent['type'], side: 0 | 1, extra: Partial<BattleEvent> = {}): BattleEvent => ({
    t, type, side, hp: hpEnd, shield: [0, 0], poison: [0, 0], ...extra,
  });
  const res: BattleResult = {
    winner: win ? 0 : 1, duration: 0.1, maxHp, hpEnd, bestHit: win ? maxHp[1] : 0,
    events: [
      { t: 0, type: 'start', side: 0, hp: [maxHp[0], maxHp[1]], shield: [0, 0], poison: [0, 0] },
      ev(0.05, 'hit', win ? 0 : 1, { amount: win ? maxHp[1] : maxHp[0], absorbed: 0 }),
      ev(0.06, 'end', win ? 0 : 1),
    ],
  };
  gs.bc.begin(res);
  gs.tr.bag = gs.tr.enemy = gs.tr.shop = 1;
  gs.phase = 'battle';
  gs.bc.standee.popUp();
  gs.bc.start();
  gs.bc.skipToEnd();
  return true;
}

export function installDebug(): void {
  // FPS 浮层
  const el = document.createElement('div');
  el.id = 'debug';
  el.style.cssText =
    'position:fixed;left:4px;top:calc(env(safe-area-inset-top) + 56px);z-index:10;pointer-events:none;' +
    'font:11px/1.35 ui-monospace,Menlo,monospace;color:#f3e6c4;background:rgba(20,10,4,0.62);padding:3px 6px;border-radius:4px;white-space:pre;';
  document.body.appendChild(el);
  let acc = 0;
  let worst = 0;
  const tick = (): void => {
    const g = game();
    const ph = g ? g.phase : sm.cur?.name ?? '-';
    el.textContent =
      `FPS ${clock.fps.toFixed(0)} · ${clock.frameMs.toFixed(2)}ms (max ${worst.toFixed(1)})\n` +
      `seed ${g ? g.run.seed : '-'} · 第 ${g ? g.run.round : '-'} 轮 · ${ph} · 粒子 ${particles.live.length}`;
    worst = 0;
  };
  const loop = (): void => {
    requestAnimationFrame(loop);
    acc += clock.raw;
    worst = Math.max(worst, clock.frameMs);
    if (acc >= 0.25) {
      acc = 0;
      tick();
    }
  };
  requestAnimationFrame(loop);

  const api = {
    get seed(): number | null {
      return game()?.run.seed ?? null;
    },
    state: safe(() => {
      const g = game();
      if (!g) return { scene: sm.cur?.name ?? null };
      const r = g.run;
      const e = enemyFor(r.round);
      return {
        scene: 'game', phase: g.phase, round: r.round, attempt: r.attempt, hearts: r.hearts, gold: r.gold, score: r.score,
        bag: r.bag.map((i) => ({ uid: i.uid, id: i.id, lv: i.lv, rot: i.rot, x: i.x, y: i.y })),
        stash: r.stash.map((i) => (i ? { uid: i.uid, id: i.id, lv: i.lv, rot: i.rot, slot: i.slot } : null)),
        shop: r.shop.map((s) => ({ id: s.id, price: s.price })),
        locked: r.locked, enemy: { name: e.name, title: e.title, hp: e.hp, boss: !!e.boss },
        tutorial: g.tut.step, paused: g.paused, speed: g.bc.speed, overlay: g.ov.top ? g.ov.top.kind : null,
        dragging: !!g.ac.drag, links: g.syn.links.map((l) => ({ from: l.from, to: l.to, kind: l.kind, label: l.label })),
        maxHp: playerMaxHp(r.round), undo: !!g.undo, outcome: g.outcome,
      };
    }),
    ui: safe(() => (sm.cur ? sm.cur.ui().map((u) => ({ ...u, ...rectCss(u.x, u.y, u.w, u.h) })) : [])),
    cell: safe((c: number, r: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (c < 0 || r < 0 || c >= BAG.cols || r >= BAG.rows) return fail('越界');
      const b = g.bagRect();
      return rectCss(b.gx + c * b.cell, b.gy + r * b.cell, b.cell, b.cell);
    }),
    shopSlot: safe((i: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      return css(g.L.cards[i]) ?? fail('越界');
    }),
    stashSlot: safe((i: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      return css(g.L.stash[i]) ?? fail('越界');
    }),
    itemRect: safe((uid: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      return css(g.itemRect(uid)) ?? fail('装备不存在');
    }),
    addGold: safe((n: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      g.run.gold = Math.max(0, g.run.gold + n);
      g.gold.set(g.run.gold);
      return g.run.gold;
    }),
    setGold: safe((n: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      g.run.gold = Math.max(0, n);
      g.gold.set(g.run.gold);
      return g.run.gold;
    }),
    setHearts: safe((n: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      g.run.hearts = Math.max(1, Math.min(3, n));
      return g.run.hearts;
    }),
    gotoRound: safe(gotoRound),
    boss: safe((n: 5 | 10) => {
      if (n !== 5 && n !== 10) return fail('只能是 5 或 10');
      return gotoRound(n, 'mid');
    }),
    give: safe((id: ItemId, lv: Lv = 1, where: 'stash' | 'bag' | { x: number; y: number; rot?: Rot } = 'stash') => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (!ITEMS[id]) return fail('没有这件装备');
      if (g.phase !== 'arrange') return fail('只能在整理阶段');
      const r = giveItem(g.run, id, lv, where);
      if (!r.ok) return r;
      g.syncViews(true);
      g.recompute(true);
      return { ok: true, uid: r.uid };
    }),
    place: safe((id: ItemId, x: number, y: number, rot: Rot = 0, lv: Lv = 1) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (!ITEMS[id]) return fail('没有这件装备');
      if (g.phase !== 'arrange') return fail('只能在整理阶段');
      const r = giveItem(g.run, id, lv, { x, y, rot });
      if (!r.ok) return null;
      g.syncViews(true);
      g.recompute(true);
      return r.uid;
    }),
    clearBag: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (g.phase !== 'arrange') return fail('只能在整理阶段');
      g.ac.reset();
      g.run.bag.length = 0;
      g.rebuild();
      return true;
    }),
    clearStash: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (g.phase !== 'arrange') return fail('只能在整理阶段');
      g.ac.reset();
      g.run.stash.fill(null);
      g.rebuild();
      return true;
    }),
    setShop: safe((ids: (ItemId | null)[]) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (g.phase !== 'arrange') return fail('只能在整理阶段');
      for (const id of ids) if (id && !ITEMS[id]) return fail('没有这件装备：' + id);
      g.ac.reset();
      g.run.shop = Array.from({ length: g.run.shop.length }, (_, i) => {
        const id = ids[i] ?? null;
        return { id, price: id ? ITEMS[id].price : 0 };
      });
      g.shopV.setInstant(g.run.shop);
      return true;
    }),
    reroll: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (g.phase !== 'arrange') return fail('只能在整理阶段');
      g.run.refreshIndex++;
      g.run.shop = rollShop(g.run);
      g.shopV.flipAll();
      return true;
    }),
    startBattle: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (g.phase !== 'arrange') return fail('只能在整理阶段开战：' + g.phase);
      g.goBattle();
      return true;
    }),
    winBattle: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      return forceResult(g, true);
    }),
    loseBattle: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      return forceResult(g, false);
    }),
    win: safe(() => {
      const g = game();
      const run = g?.run;
      const hearts = run?.hearts ?? 3;
      const scores = run ? run.stats.roundScores.slice() : [];
      while (scores.length < ROUNDS) scores.push(110 + scores.length * 30);
      const clearBonus = SCORE.clearBonus + SCORE.heartBonus * hearts;
      const score = scores.reduce((a, b) => a + b, 0) + clearBonus;
      gotoScene(() =>
        factories.ending({
          cleared: true, round: ROUNDS, score, roundScores: scores, clearBonus, hearts, seed: run?.seed ?? 0,
          bestHit: run?.stats.bestHit ?? 0, merges: run?.stats.merges ?? 0, spent: run?.stats.spent ?? 0, killer: null, killerName: '',
        }),
      );
      return true;
    }),
    lose: safe(() => {
      const g = game();
      const run = g?.run;
      const round = run?.round ?? 1;
      const e = enemyFor(round);
      gotoScene(() =>
        factories.ending({
          cleared: false, round, score: run?.score ?? 0, roundScores: run ? run.stats.roundScores.slice() : [], clearBonus: 0, hearts: 0,
          seed: run?.seed ?? 0, bestHit: run?.stats.bestHit ?? 0, merges: run?.stats.merges ?? 0, spent: run?.stats.spent ?? 0,
          killer: e.portrait, killerName: `${e.title}「${e.name}」`,
        }),
      );
      return true;
    }),
    simulate: safe(() => {
      const g = game();
      if (!g) return fail('不在游戏中');
      const r = g.run;
      const e = enemyFor(r.round);
      const res = runSim(
        { items: r.bag, cols: BAG.cols, rows: BAG.rows, maxHp: playerMaxHp(r.round) },
        { items: enemyBag(r.round), cols: e.cols, rows: e.rows, maxHp: e.hp, traits: e.traits },
      );
      return { winner: res.winner, duration: +res.duration.toFixed(2), hpEnd: res.hpEnd, events: res.events.length };
    }),
    speed: safe((x: number) => {
      const g = game();
      if (!g) return fail('不在游戏中');
      if (!(x >= 0.25 && x <= 8)) return fail('速度应在 0.25–8');
      g.setSpeed(x);
      return x;
    }),
    timeScale: safe((x: number) => {
      if (!(x >= 0 && x <= 8)) return fail('应在 0–8');
      clock.timeScale = x;
      return x;
    }),
    skipTutorial: safe(() => {
      markTutorialDone();
      game()?.tut.stop();
      return true;
    }),
    resetTutorial: safe(() => {
      resetTutorialFlag();
      return true;
    }),
    resetHints: safe(() => {
      resetHints();
      return true;
    }),
    fx: safe((name: string) => {
      const cx = 195;
      const cy = stage.H * 0.45;
      const g = game();
      switch (name) {
        case 'shake1': tier('T1', false); break;
        case 'shake2': tier('T2'); break;
        case 'shake3': tier('T3'); break;
        case 'shake4': tier('T4'); break;
        case 'merge2':
        case 'merge3': {
          const three = name === 'merge3';
          popup(three ? '★★★' : '★★', cx, cy - 18, three ? C.goldLight : '#fff3c4', three ? 34 : 28, { life: 1.1, vy: -36 });
          emit('star', cx, cy, three ? 14 : 8, { color: C.goldLight, speed: 150, life: 0.7 });
          emit('confetti', cx, cy, three ? 16 : 10, { speed: 160, life: 0.9 });
          sfx(three ? 'merge3' : 'merge2');
          tier(three ? 'T3' : 'T2', false);
          break;
        }
        case 'revive':
          g?.bc.screenFlash('#ffd27a', 0.85);
          emit('flame', cx, cy, 30, { speed: 180, life: 0.9, ui: true });
          sfx('revive');
          tier('T4');
          break;
        case 'enrage':
          g?.bc.screenFlash('#d0402a', 0.7);
          sfx('roar');
          sfx('gong', 0, 0.2);
          tier('T4');
          break;
        case 'record':
          popup('新纪录！', cx, cy, '#c2402c', 34, { cn: true, ui: true, life: 1.4 });
          emit('confetti', cx, cy, 40, { color: C.goldLight, speed: 260, life: 1.2, ui: true });
          sfx('record');
          tier('T3', false);
          break;
        default:
          return fail('未知反馈：' + name);
      }
      return true;
    }),
    items: () => ITEMS,
    enemies: () => ENEMIES,
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
