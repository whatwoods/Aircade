/** 色板（文档 §4.2） */
export const PAL = {
  abyss: '#07080D',
  charcoal: '#12141B',
  slate: '#3A4458',
  slateHi: '#6E7C96',
  slateLo: '#161A24',
  mist: '#2B3550',
  floor: '#4A3A2E',
  grout: '#1E1712',
  amber: '#FFB54A',
  ember: '#FF7A1A',
  gold: '#FFD27A',
  parchment: '#E9DCC0',
  ash: '#9C8E7A',
  blood: '#C8283C',
  bloodDeep: '#6E0F1E',
  chalk: '#DCE3EA',
  lethal: '#FF4D4D',
  mint: '#7FE0B0',
  dragonFire: '#FF3B1F',
  dragonEye: '#FFE066',
  chestWood: '#6B3F22',
  chestGold: '#E8B04B',
  potion: '#E0315A',
  potionHi: '#FF9AB0',
} as const;

/** 数字分档：1–3 / 4–7 / 8–12 / 13–19 / 20+ */
export const NUMBER_TIERS = ['#E9DCC0', '#FFD27A', '#FFB54A', '#FF7A1A', '#FF4D3D'] as const;
export function numberTier(n: number): number {
  if (n <= 3) return 0;
  if (n <= 7) return 1;
  if (n <= 12) return 2;
  if (n <= 19) return 3;
  return 4;
}

/** 怪物眼睛颜色（下标 = 等级，13 = 巨龙） */
export const EYE: Record<number, string> = {
  1: '#9BE36B',
  2: '#FF5A5A',
  3: '#FFD24A',
  4: '#7FD1FF',
  5: '#FFB54A',
  6: '#FF7A1A',
  7: '#FF3B3B',
  8: '#B6FF5A',
  9: '#C77DFF',
  13: '#FFE066',
};
