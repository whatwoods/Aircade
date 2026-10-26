// 参考构筑：每轮"中"构筑（按当轮累计金币配装）。弱 = 上一轮的中，强 = 下一轮的中。
// 也被 ?debug=1 的 gotoRound(n, build) 使用。

export interface BuildDef {
  layout: string[];
  legend: Record<string, string>;
}

const BASE_LEGEND = {
  S: 'sword', W: 'buckler', A: 'axe', D: 'dagger', G: 'glove', M: 'whetstone', L: 'leather',
  I: 'helmet', H: 'herb', J: 'herb', O: 'moonstone', P: 'potion', F: 'phoenix', E: 'dagger',
};

const LATE = ['.SWWAA', 'DSWWA.', 'GSM.A.', 'GLLLII', 'HOLPP.'];

export const MID_BUILDS: BuildDef[] = [
  // r0（占位）
  { layout: ['......'], legend: {} },
  // r1：12 金 → 铁剑 + 磨刀石 + 草药（10）
  { layout: ['.S....', '.SM...', '.S....', '...H..', '......'], legend: BASE_LEGEND },
  // r2：22 金 → + 匕首、木盾（17）
  { layout: ['.SWW..', 'DSWW..', '.SM...', '..H...', '......'], legend: BASE_LEGEND },
  // r3：33 金 → + 皮手套、皮甲、草药（27）
  { layout: ['.SWW..', 'DSWW..', 'GSM...', 'GLLL..', 'HJL...'], legend: BASE_LEGEND },
  // r4：44 金 → + 战斧（33）
  { layout: ['.SWWAA', 'DSWWA.', 'GSM.A.', 'GLLL..', 'HJL...'], legend: BASE_LEGEND },
  // r5：56 金 → 铁剑★★、+ 铁盔、治疗药水（47）
  { layout: ['.SWWAA', 'DSWWA.', 'GSM.A.', 'GLLLII', 'HJLPP.'], legend: { ...BASE_LEGEND, S: 'sword:2' } },
  // r6：68 金 → + 月光石、匕首★★、草药★★（58）
  { layout: LATE, legend: { ...BASE_LEGEND, S: 'sword:2', D: 'dagger:2', H: 'herb:2' } },
  // r7：81 金 → 磨刀石★★、木盾★★、战斧★★（71）
  {
    layout: LATE,
    legend: { ...BASE_LEGEND, S: 'sword:2', D: 'dagger:2', H: 'herb:2', M: 'whetstone:2', W: 'buckler:2', A: 'axe:2' },
  },
  // r8：94 金 → 皮手套★★、皮甲★★、治疗药水★★（83）
  {
    layout: LATE,
    legend: {
      ...BASE_LEGEND, S: 'sword:2', D: 'dagger:2', H: 'herb:2', M: 'whetstone:2', W: 'buckler:2', A: 'axe:2',
      G: 'glove:2', L: 'leather:2', P: 'potion:2',
    },
  },
  // r9：108 金 → 铁剑★★★（91）
  {
    layout: LATE,
    legend: {
      ...BASE_LEGEND, S: 'sword:3', D: 'dagger:2', H: 'herb:2', M: 'whetstone:2', W: 'buckler:2', A: 'axe:2',
      G: 'glove:2', L: 'leather:2', P: 'potion:2',
    },
  },
  // r10：122 金 → 匕首★★★、磨刀石★★★（≈103）
  {
    layout: LATE,
    legend: {
      ...BASE_LEGEND, S: 'sword:3', D: 'dagger:3', H: 'herb:2', M: 'whetstone:3', W: 'buckler:2', A: 'axe:2',
      G: 'glove:2', L: 'leather:2', P: 'potion:2',
    },
  },
  // r11（= 第 10 轮"强"）：+ 战斧★★★，草药换凤凰羽毛
  {
    layout: ['.SWWAA', 'DSWWA.', 'GSM.AF', 'GLLLIF', 'PPLOIF'],
    legend: {
      ...BASE_LEGEND, S: 'sword:3', D: 'dagger:3', M: 'whetstone:3', W: 'buckler:2', A: 'axe:3',
      G: 'glove:2', L: 'leather:2', P: 'potion:2', F: 'phoenix',
    },
  },
];

export const WEAK_R1: BuildDef = { layout: ['D.....', '......', '...H..', '......', '......'], legend: BASE_LEGEND };

export function buildFor(round: number, kind: 'weak' | 'mid' | 'strong'): BuildDef | null {
  if (kind === 'mid') return MID_BUILDS[round] ?? null;
  if (kind === 'weak') return round <= 1 ? WEAK_R1 : MID_BUILDS[round - 1];
  return MID_BUILDS[Math.min(MID_BUILDS.length - 1, round + 1)];
}
