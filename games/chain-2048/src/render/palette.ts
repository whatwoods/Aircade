/** 色板（docs §4.2） */
export const C = {
  canopy: '#0B231C',
  mossDeep: '#17392D',
  moss: '#2F6B4C',
  jade: '#4FB58A',
  jadeLight: '#A8E6C8',
  stoneDark: '#4A5143',
  stone: '#8A8770',
  stoneLight: '#CFC7A6',
  bronze: '#8E5F27',
  gold: '#E3B24C',
  goldHi: '#FFE7A3',
  sunset: '#FF9A55',
  sunsetSoft: '#FFD19A',
  danger: '#E2463A',
  uiText: '#F7EFD8',
  uiDim: '#B8C4A6',
};

export interface LevelStyle {
  name: string;
  base: string;
  dark: string;
  light: string;
  text: string;
  /** 数字是浅色（需要深色描边） */
  lightText: boolean;
  /** 碎屑颜色 */
  shard: string;
}

export const LEVELS: LevelStyle[] = [
  { name: '-', base: '#888', dark: '#444', light: '#ccc', text: '#000', lightText: false, shard: '#888' },
  { name: '砂岩', base: '#D8C59C', dark: '#9C8460', light: '#F4E8C8', text: '#3B2A16', lightText: false, shard: '#E2D2AE' },
  { name: '赭陶', base: '#AD522C', dark: '#7E3618', light: '#E89A6E', text: '#FFF1DE', lightText: true, shard: '#D47A4E' },
  { name: '青金石', base: '#3C69B0', dark: '#1D3466', light: '#7EA3E0', text: '#F4F0FF', lightText: true, shard: '#5B86CC' },
  { name: '翡翠', base: '#1F8255', dark: '#14583A', light: '#8FE0B6', text: '#F2FFF6', lightText: true, shard: '#5CC492' },
  { name: '紫晶', base: '#8455C2', dark: '#4A2780', light: '#C3A0EE', text: '#FBF3FF', lightText: true, shard: '#A27AD8' },
  { name: '朱砂', base: '#C43A32', dark: '#7C1A16', light: '#F2857A', text: '#FFF4EA', lightText: true, shard: '#E2645A' },
  { name: '孔雀石', base: '#0B7F74', dark: '#06534C', light: '#6BD9C9', text: '#F0FFFC', lightText: true, shard: '#36B8A8' },
  { name: '琥珀', base: '#E6972A', dark: '#9A5508', light: '#FFD07A', text: '#3A1F05', lightText: false, shard: '#F4B04A' },
  { name: '黑曜石', base: '#24212E', dark: '#0C0B12', light: '#5A5470', text: '#FFE3A0', lightText: true, shard: '#E3B24C' },
  { name: '鎏金', base: '#E2B04A', dark: '#8E5F27', light: '#FFE9A8', text: '#3A2406', lightText: false, shard: '#FFD877' },
  { name: '日轮', base: '#FFF0C0', dark: '#E0A848', light: '#FFFFFF', text: '#7A3E00', lightText: false, shard: '#FFE7A3' },
  { name: '星辉', base: '#E8D8FF', dark: '#8A6AD0', light: '#FFFFFF', text: '#2A1A3A', lightText: false, shard: '#D8C8FF' },
];

export function levelStyle(l: number): LevelStyle {
  return LEVELS[Math.max(1, Math.min(LEVELS.length - 1, l))]!;
}

export function label(level: number): string {
  const v = 2 ** level;
  if (v < 10000) return String(v);
  return `${Math.round(v / 1024)}K`;
}

export const FONT_NUM = '"Big Shoulders Display", "Arial Narrow", "PingFang SC", sans-serif';
export const FONT_TITLE = 'Bungee, Impact, "PingFang SC", sans-serif';
export const FONT_CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
