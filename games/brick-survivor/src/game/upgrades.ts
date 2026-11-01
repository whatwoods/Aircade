// 12 upgrades + 4 evolutions: definitions, card text, derived Stats (docs §3.10).
import { config, pal } from '../config';
import type { ElementId, EvolutionId, UpgradeId } from '../types';
import { UPGRADE_IDS } from '../types';

const U = config.upgrades;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  en: string;
  cat: 'weapon' | 'module';
  tag: string;
  color: number;
  element?: ElementId;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  multi: { id: 'multi', name: '多球', en: 'MULTIBALL', cat: 'weapon', tag: '武装', color: pal.multi },
  pierce: { id: 'pierce', name: '穿透', en: 'PIERCE', cat: 'weapon', tag: '武装·行为', color: pal.pierce },
  split: { id: 'split', name: '分裂', en: 'SPLIT', cat: 'weapon', tag: '武装·行为', color: pal.split },
  fire: { id: 'fire', name: '燃烧', en: 'IGNITE', cat: 'weapon', tag: '武装·元素', color: pal.fire, element: 'fire' },
  ice: { id: 'ice', name: '冰冻', en: 'CRYO', cat: 'weapon', tag: '武装·元素', color: pal.ice, element: 'ice' },
  blast: { id: 'blast', name: '爆炸', en: 'BLAST', cat: 'weapon', tag: '武装·元素', color: pal.blast, element: 'blast' },
  homing: { id: 'homing', name: '追踪', en: 'HOMING', cat: 'weapon', tag: '武装·行为', color: pal.homing },
  power: { id: 'power', name: '超载', en: 'OVERLOAD', cat: 'module', tag: '模块', color: pal.gold },
  overclock: { id: 'overclock', name: '超频', en: 'OVERCLOCK', cat: 'module', tag: '模块', color: pal.gold },
  magnet: { id: 'magnet', name: '磁核', en: 'MAGNET', cat: 'module', tag: '模块', color: pal.gold },
  wide: { id: 'wide', name: '宽域', en: 'WIDE FIELD', cat: 'module', tag: '模块', color: pal.gold },
  aegis: { id: 'aegis', name: '护盾', en: 'AEGIS', cat: 'module', tag: '模块', color: pal.gold },
};

export interface EvolutionDef {
  id: EvolutionId;
  name: string;
  en: string;
  main: UpgradeId;
  partner: UpgradeId;
  desc: string;
  color: number;
}

export const EVOLUTIONS: Record<EvolutionId, EvolutionDef> = {
  supernova: {
    id: 'supernova', name: '超新星', en: 'SUPERNOVA', main: 'fire', partner: 'blast', color: pal.fire,
    desc: '燃烧与爆炸合为「新星」：命中既点燃又爆炸；燃烧中的砖死亡时自爆并连锁',
  },
  absoluteZero: {
    id: 'absoluteZero', name: '绝对零度', en: 'ABSOLUTE ZERO', main: 'ice', partner: 'pierce', color: pal.ice,
    desc: '冰冻球一击即冻 3 秒；穿过冻结砖不消耗穿透；冻结砖碎裂时射出 6 道冰棱',
  },
  swarm: {
    id: 'swarm', name: '蜂群', en: 'SWARM', main: 'split', partner: 'homing', color: pal.homing,
    desc: '碎片球化为追踪飞镖（400°/s，寿命 10 秒）；主球每命中 3 次必出 1 枚飞镖',
  },
  prismEcho: {
    id: 'prismEcho', name: '棱镜回响', en: 'PRISM ECHO', main: 'multi', partner: 'wide', color: pal.multi,
    desc: '每次接球射出一颗回响球；完美接球射出 2 颗，并让该球直接满充能',
  },
};

export function evolutionOf(main: UpgradeId): EvolutionDef | null {
  for (const e of Object.values(EVOLUTIONS)) if (e.main === main) return e;
  return null;
}
export function evolutionsWithPart(id: UpgradeId): EvolutionDef[] {
  return Object.values(EVOLUTIONS).filter((e) => e.main === id || e.partner === id);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One-line description of what the next level (to) changes. */
export function describe(id: UpgradeId, to: number): string {
  const from = to - 1;
  switch (id) {
    case 'multi': {
      const add = U.multi.add[to]! - U.multi.add[from]!;
      return `主球 +${add}` + (to === 3 ? '，发射间隔 −10%' : '') + `（共 ${config.ball.startCount + U.multi.add[to]!} 颗）`;
    }
    case 'pierce':
      return to === 1
        ? '每次出击可穿过 1 块砖'
        : `穿过砖数 ${U.pierce.count[from]}→${U.pierce.count[to]}` +
            (to === U.pierce.freeKillFrom ? '，击杀不消耗穿透' : to === 5 ? '，穿过时伤害 ×1.3' : '');
    case 'split':
      return to === 1
        ? '命中时 15% 几率分裂出 1 颗碎片球'
        : `分裂几率 ${pct(U.split.chance[from]!)}→${pct(U.split.chance[to]!)}` +
            (U.split.count[to]! > U.split.count[from]! ? '，每次 2 颗' : '') +
            (to === 5 ? '，碎片伤害 ×0.7' : '');
    case 'fire':
      if (to === 1) return '命中点燃：每层秒伤 25%，最多 3 层';
      return (
        `每层秒伤 ${pct(U.fire.dps[from]!)}→${pct(U.fire.dps[to]!)}` +
        (U.fire.stacks[to]! > U.fire.stacks[from]! ? `，层数上限 ${U.fire.stacks[from]}→${U.fire.stacks[to]}` : '') +
        (to === 3 ? '，死亡蔓延至 2 邻' : to === 5 ? '，蔓延至 4 邻' : '')
      );
    case 'ice':
      if (to === 1) return '命中叠寒冷，4 层冻结 1.5 秒，冻结易伤 +20%';
      return (
        (U.ice.freezeAt[to]! < U.ice.freezeAt[from]! ? `冻结所需 ${U.ice.freezeAt[from]}→${U.ice.freezeAt[to]} 层，` : '') +
        `冻结 ${U.ice.freezeDur[to]} 秒，易伤 ${pct(U.ice.vuln[to]!)}` +
        (to === 3 ? '，碎冰波及 4 邻' : '')
      );
    case 'blast':
      if (to === 1) return '命中爆炸：半径 36，范围伤害 50%';
      return (
        `爆炸半径 ${U.blast.radius[from]}→${U.blast.radius[to]}，范围伤害 ${pct(U.blast.mult[to]!)}` +
        (to === 3 ? '，吃充能加成' : to === 5 ? '，0.15 秒后再炸一圈' : '')
      );
    case 'homing':
      if (to === 1) return '上升的球转向前方的砖，70°/s';
      return (
        `转向速率 ${U.homing.turn[from]}→${U.homing.turn[to]}°/s` +
        (to === 3 ? '，下落时辅助接球' : to === 5 ? '，优先锁定最低的砖' : '')
      );
    case 'power':
      return `伤害 +12%（共 +${to * 12}%）`;
    case 'overclock':
      return `发射间隔 −8%，球速 +4%（共 −${to * 8}% / +${to * 4}%）`;
    case 'magnet':
      return `拾取半径 +28，经验 +4%（半径 ${config.gems.magnetRadius + to * U.magnet.radius}）`;
    case 'wide':
      return `挡板宽度 +10%，完美区 +3%（宽 ${Math.round(config.player.paddleW * (1 + to * U.wide.width))}）`;
    case 'aegis':
      return (
        `生命上限 +2 并回复 2` +
        (to === 2 ? '；获得越线屏障（40 秒）' : to === 4 ? '；屏障充能 28 秒' : to === 5 ? '；屏障充能 20 秒' : '')
      );
  }
}

/** Short current-effect summary for pause / side panel. */
export function summary(id: UpgradeId, lv: number): string {
  if (lv <= 0) return '';
  switch (id) {
    case 'multi': return `主球 ${config.ball.startCount + U.multi.add[lv]!}`;
    case 'pierce': return `穿透 ${U.pierce.count[lv]}`;
    case 'split': return `${pct(U.split.chance[lv]!)} ×${U.split.count[lv]}`;
    case 'fire': return `${pct(U.fire.dps[lv]!)}/层 · ${U.fire.stacks[lv]} 层`;
    case 'ice': return `${U.ice.freezeAt[lv]} 层冻结 · 易伤 ${pct(U.ice.vuln[lv]!)}`;
    case 'blast': return `半径 ${U.blast.radius[lv]} · ${pct(U.blast.mult[lv]!)}`;
    case 'homing': return `${U.homing.turn[lv]}°/s`;
    case 'power': return `伤害 +${lv * 12}%`;
    case 'overclock': return `间隔 −${lv * 8}%`;
    case 'magnet': return `半径 ${config.gems.magnetRadius + lv * U.magnet.radius}`;
    case 'wide': return `宽 ${Math.round(config.player.paddleW * (1 + lv * U.wide.width))}`;
    case 'aegis': return `上限 +${lv * 2}` + (U.aegis.barrierCd[lv]! > 0 ? ` · 屏障 ${U.aegis.barrierCd[lv]}s` : '');
  }
}

export interface Stats {
  ballCount: number;
  fireInterval: number;
  ballSpeed: number;
  dmgMult: number;
  pierce: number;
  pierceFreeKill: boolean;
  pierceDmg: number;
  splitChance: number;
  splitCount: number;
  shardDmg: number;
  fire: { dps: number; maxStacks: number; dur: number; spread: number } | null;
  ice: { freezeAt: number; freezeDur: number; vuln: number; slowPer: number; slowCap: number; shatter: boolean } | null;
  blast: { radius: number; mult: number; chargeApplies: boolean; double: boolean } | null;
  homing: { turn: number; cone: number; catchAssist: boolean; threatFirst: boolean } | null;
  magnetR: number;
  xpMult: number;
  paddleW: number;
  perfectZone: number;
  maxHp: number;
  barrierCd: number;
  evo: { supernova: boolean; absoluteZero: boolean; swarm: boolean; prismEcho: boolean };
}

export function emptyLevels(): Record<UpgradeId, number> {
  const r = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_IDS) r[id] = 0;
  return r;
}

export function computeStats(lv: Record<UpgradeId, number>, evo: ReadonlySet<EvolutionId>, out?: Stats): Stats {
  const s: Stats = out ?? ({ evo: { supernova: false, absoluteZero: false, swarm: false, prismEcho: false } } as Stats);
  s.ballCount = Math.min(config.ball.maxMain, config.ball.startCount + U.multi.add[lv.multi]!);
  s.fireInterval = config.ball.fireInterval * (lv.multi >= 3 ? U.multi.intervalLv3 : 1) * (1 - U.overclock.interval * lv.overclock);
  s.ballSpeed = config.ball.speed * (1 + U.overclock.speed * lv.overclock);
  s.dmgMult = 1 + U.power.perLv * lv.power;
  s.pierce = U.pierce.count[lv.pierce]!;
  s.pierceFreeKill = lv.pierce >= U.pierce.freeKillFrom;
  s.pierceDmg = lv.pierce >= 5 ? U.pierce.dmgLv5 : 1;
  s.splitChance = U.split.chance[lv.split]!;
  s.splitCount = U.split.count[lv.split]!;
  s.shardDmg = U.split.dmg[lv.split]! || 0.5;
  s.fire = lv.fire > 0 ? { dps: U.fire.dps[lv.fire]!, maxStacks: U.fire.stacks[lv.fire]!, dur: U.fire.dur[lv.fire]!, spread: U.fire.spread[lv.fire]! } : null;
  s.ice =
    lv.ice > 0
      ? {
          freezeAt: U.ice.freezeAt[lv.ice]!, freezeDur: U.ice.freezeDur[lv.ice]!, vuln: U.ice.vuln[lv.ice]!,
          slowPer: U.ice.slowPer[lv.ice]!, slowCap: evo.has('absoluteZero') ? config.evolutions.absoluteZero.slowCap : U.ice.slowCap[lv.ice]!,
          shatter: lv.ice >= U.ice.shatterFrom,
        }
      : null;
  s.blast =
    lv.blast > 0
      ? { radius: U.blast.radius[lv.blast]!, mult: U.blast.mult[lv.blast]!, chargeApplies: lv.blast >= U.blast.chargeFrom, double: lv.blast >= 5 }
      : null;
  s.homing =
    lv.homing > 0
      ? { turn: U.homing.turn[lv.homing]!, cone: U.homing.cone[lv.homing]!, catchAssist: lv.homing >= U.homing.assistFrom, threatFirst: lv.homing >= U.homing.threatFrom }
      : null;
  s.magnetR = config.gems.magnetRadius + U.magnet.radius * lv.magnet;
  s.xpMult = 1 + U.magnet.xp * lv.magnet;
  s.paddleW = config.player.paddleW * (1 + U.wide.width * lv.wide);
  s.perfectZone = config.player.perfectZone + U.wide.perfect * lv.wide;
  s.maxHp = Math.min(config.player.hpCap, config.player.maxHp + U.aegis.hp * lv.aegis);
  s.barrierCd = U.aegis.barrierCd[lv.aegis]!;
  s.evo.supernova = evo.has('supernova');
  s.evo.absoluteZero = evo.has('absoluteZero');
  s.evo.swarm = evo.has('swarm');
  s.evo.prismEcho = evo.has('prismEcho');
  return s;
}
