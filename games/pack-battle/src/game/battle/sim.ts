// 确定性战斗模拟 → 事件时间线（纯函数）
import { BATTLE } from '../../config.ts';
import { computeSynergy } from '../synergy.ts';
import type { BattleEvent, BattleEventType, BattleResult, Derived, Placed, Side, TraitDef } from '../types.ts';

export interface FighterInput {
  items: readonly Placed[];
  cols: number;
  rows: number;
  maxHp: number;
  traits?: TraitDef[];
}

interface Unit {
  d: Derived;
  timer: number;
  order: number;
}

interface Fighter {
  side: Side;
  maxHp: number;
  hp: number;
  shield: number;
  poison: number;
  poisonT: number;
  stun: number;
  immune: number;
  reduce: number;
  speedBonus: number;
  units: Unit[];
  potions: Derived[];
  phoenix: Derived[];
  starts: Derived[];
  traits: TraitDef[];
  traitFired: boolean[];
  dead: boolean;
}

function makeFighter(side: Side, inp: FighterInput): Fighter {
  const syn = computeSynergy(inp.items, inp.cols, inp.rows);
  const sorted = [...inp.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const units: Unit[] = [];
  const potions: Derived[] = [];
  const phoenix: Derived[] = [];
  const starts: Derived[] = [];
  let reduce = 0;
  sorted.forEach((it, i) => {
    const d = syn.derived.get(it.uid)!;
    reduce += d.reduce;
    if (d.trigger === 'cooldown' && d.cd > 0) units.push({ d, timer: 0, order: i });
    if (d.trigger === 'lowHp') potions.push(d);
    if (d.trigger === 'death') phoenix.push(d);
    if (d.trigger === 'start' && d.startShield > 0) starts.push(d);
  });
  return {
    side, maxHp: inp.maxHp, hp: inp.maxHp, shield: 0, poison: 0, poisonT: 0, stun: 0, immune: 0, reduce,
    speedBonus: 0, units, potions, phoenix, starts, traits: inp.traits ?? [], traitFired: (inp.traits ?? []).map(() => false),
    dead: false,
  };
}

export function simulate(player: FighterInput, enemy: FighterInput): BattleResult {
  const P = makeFighter(0, player);
  const E = makeFighter(1, enemy);
  const F: [Fighter, Fighter] = [P, E];
  const events: BattleEvent[] = [];
  let t = 0;
  let over = false;
  let winner: Side = 0;
  let bestHit = 0;
  const dt = BATTLE.dt;

  const push = (type: BattleEventType, side: Side, extra?: Partial<BattleEvent>): void => {
    const e: BattleEvent = {
      t, type, side,
      hp: [Math.max(P.hp, 0), Math.max(E.hp, 0)],
      shield: [P.shield, E.shield],
      poison: [P.poison, E.poison],
    };
    if (extra) Object.assign(e, extra);
    events.push(e);
  };

  const finish = (w: Side): void => {
    if (over) return;
    over = true;
    winner = w;
  };

  /** 扣血后的检查：复活、药水、首领特性、死亡 */
  const afterLoss = (D: Fighter): void => {
    if (D.hp <= 0 && !D.dead) {
      const ph = D.phoenix.shift();
      if (ph) {
        D.hp = Math.max(1, Math.floor(D.maxHp * Math.min(1, ph.reviveFrac)));
        D.poison = 0;
        D.poisonT = 0;
        push('revive', D.side, { uid: ph.uid, amount: D.hp });
      } else {
        D.dead = true;
        return;
      }
    }
    if (D.hp > 0 && D.hp <= D.maxHp * 0.5 && D.potions.length > 0) {
      const p = D.potions.shift()!;
      const amt = Math.min(p.lowHpHeal, D.maxHp - D.hp);
      D.hp += amt;
      push('lowHp', D.side, { uid: p.uid, amount: amt });
    }
    // 首领特性
    D.traits.forEach((tr, i) => {
      if (D.traitFired[i] || D.dead) return;
      if (D.hp > D.maxHp * tr.at) return;
      D.traitFired[i] = true;
      D.speedBonus += tr.speed;
      push('phase', D.side, { amount: i });
      if (tr.kind === 'dragonRage') {
        const O = F[1 - D.side];
        O.hp -= tr.trueDmg;
        push('hit', D.side, { amount: tr.trueDmg, absorbed: 0, fire: true });
        afterLoss(O);
      }
    });
  };

  const checkDeaths = (): void => {
    if (over) return;
    if (P.dead && E.dead) finish(P.hp >= E.hp ? 0 : 1);
    else if (E.dead) finish(0);
    else if (P.dead) finish(1);
  };

  const doHit = (A: Fighter, D: Fighter, u: Unit, second: boolean): void => {
    const d = u.d;
    let raw = Math.max(BATTLE.minHit, d.dmg - D.reduce);
    const total = raw;
    let absorbed = 0;
    if (D.shield > 0) {
      const sb = d.shieldBreak;
      if (sb > 1) {
        const sd = Math.min(D.shield, raw * sb);
        D.shield -= sd;
        absorbed = sd;
        raw -= Math.ceil(sd / sb);
      } else {
        absorbed = Math.min(D.shield, raw);
        D.shield -= absorbed;
        raw -= absorbed;
      }
    }
    raw = Math.max(0, raw);
    D.hp -= raw;
    if (A.side === 0 && total > bestHit) bestHit = total;
    push('hit', A.side, { uid: d.uid, amount: raw, absorbed, second, links: d.linkIds });
    if (d.poison > 0) {
      D.poison += d.poison;
      push('poisonApply', D.side, { uid: d.uid, amount: d.poison });
    }
    if (d.stun > 0 && D.immune <= 0 && D.stun < d.stun) {
      D.stun = d.stun;
      push('stun', D.side, { uid: d.uid, amount: d.stun });
    }
    afterLoss(D);
    checkDeaths();
  };

  const gainShield = (S: Fighter, uid: number, amt: number, links?: number[]): void => {
    if (amt <= 0) return;
    S.shield += amt;
    push('shield', S.side, { uid, amount: amt, links });
  };

  const heal = (S: Fighter, d: Derived): void => {
    const amt = Math.min(d.heal, S.maxHp - S.hp);
    if (amt > 0) {
      S.hp += amt;
      push('heal', S.side, { uid: d.uid, amount: amt, links: d.linkIds });
    } else if (d.heal > 0) {
      push('overheal', S.side, { uid: d.uid, amount: 0 });
    }
    if (d.cleanse > 0 && S.poison > 0) {
      const c = Math.min(S.poison, d.cleanse);
      S.poison -= c;
      push('cleanse', S.side, { uid: d.uid, amount: c });
    }
  };

  const pending: { t: number; A: Fighter; u: Unit }[] = [];

  const fire = (A: Fighter, u: Unit): void => {
    const D = F[1 - A.side];
    const d = u.d;
    push('fire', A.side, { uid: d.uid, links: d.linkIds });
    if (d.tag === 'weapon') {
      if (d.shieldOnHit > 0) gainShield(A, d.uid, d.shieldOnHit);
      doHit(A, D, u, false);
      if (!over && d.hits >= 2) {
        for (let k = 1; k < d.hits; k++) pending.push({ t: t + BATTLE.boomerangGap * k, A, u });
      }
    } else if (d.tag === 'armor') {
      gainShield(A, d.uid, d.shield, d.linkIds);
    } else if (d.tag === 'remedy') {
      heal(A, d);
    }
  };

  // 开场
  push('start', 0);
  for (const S of F) {
    for (const d of S.starts) gainShield(S, d.uid, d.startShield, d.linkIds);
  }

  let tick = 0;
  let stormK = 0;
  let stormT = 0;
  const fired: { A: Fighter; u: Unit; ov: number }[] = [];
  while (!over) {
    tick++;
    t = tick * dt;
    fired.length = 0;
    for (const S of F) {
      if (S.stun > 0) {
        S.stun -= dt;
        if (S.stun <= 0) {
          S.stun = 0;
          S.immune = BATTLE.stunImmunity;
        }
        continue;
      }
      if (S.immune > 0) S.immune -= dt;
      for (const u of S.units) {
        const mul = Math.min(BATTLE.speedCap, u.d.speedMul + S.speedBonus);
        u.timer += dt * mul;
        if (u.timer >= u.d.cd) fired.push({ A: S, u, ov: (u.timer - u.d.cd) / mul });
      }
    }
    if (fired.length > 1) {
      fired.sort((a, b) => b.ov - a.ov || a.A.side - b.A.side || a.u.order - b.u.order);
    }
    for (const f of fired) {
      if (over) break;
      f.u.timer -= f.u.d.cd;
      fire(f.A, f.u);
    }
    if (over) break;
    // 延迟打击
    for (let i = 0; i < pending.length && !over; ) {
      const p = pending[i];
      if (p.t <= t + 1e-9) {
        pending.splice(i, 1);
        doHit(p.A, F[1 - p.A.side], p.u, true);
      } else i++;
    }
    if (over) break;
    // 中毒（双方同时）
    let poisoned = false;
    for (const S of F) {
      if (S.poison <= 0) {
        S.poisonT = 0;
        continue;
      }
      S.poisonT += dt;
      if (S.poisonT >= BATTLE.poisonInterval - 1e-9) {
        S.poisonT -= BATTLE.poisonInterval;
        S.hp -= S.poison;
        push('poisonTick', S.side, { amount: S.poison });
        poisoned = true;
      }
    }
    if (poisoned) {
      afterLoss(P);
      afterLoss(E);
      checkDeaths();
      if (over) break;
    }
    // 风暴
    if (t >= BATTLE.softLimit) {
      if (stormK === 0 && stormT === 0) push('storm', 0);
      stormT += dt;
      if (stormT >= 1 - 1e-9 || stormK === 0) {
        if (stormK > 0) stormT -= 1;
        stormK++;
        const dmg = BATTLE.fatigueStep * stormK;
        P.hp -= dmg;
        E.hp -= dmg;
        push('fatigue', 0, { amount: dmg });
        push('fatigue', 1, { amount: dmg });
        afterLoss(P);
        afterLoss(E);
        checkDeaths();
        if (over) break;
      }
    }
    if (t >= BATTLE.hardLimit) {
      const rp = P.hp / P.maxHp;
      const re = E.hp / E.maxHp;
      finish(rp >= re ? 0 : 1);
    }
  }
  push('end', winner);
  return {
    winner,
    duration: t,
    events,
    hpEnd: [Math.max(0, P.hp), Math.max(0, E.hp)],
    maxHp: [P.maxHp, E.maxHp],
    bestHit,
  };
}
