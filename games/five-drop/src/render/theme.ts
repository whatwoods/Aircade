// 色板与字体（docs/five-drop.md 第 4.2、4.3 节）
export const C = {
  bgDeep: '#161B21',
  bgBase: '#212931',
  bgFog: '#2E3843',
  panel: 'rgba(54,66,79,0.72)',
  panelLine: 'rgba(255,255,255,0.06)',
  slabTop: '#6F7E8D',
  slabBottom: '#5D6B79',
  slabLine: '#8F9DAB',
  slabLineDark: '#505C68',
  hoshi: '#434F5B',
  accent: '#7FDBFF',
  accentCore: '#D8F6FF',
  accentDim: 'rgba(127,219,255,0.22)',
  text1: '#ECF1F5',
  text2: '#A2B0BD',
  text3: '#6E7C8A',
  danger: '#FF7B8A',
  black: '#0C0E11',
  white: '#F4F6F8',
  divider: 'rgba(255,255,255,0.08)',
};
export const FONT_CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const FONT_NUM = 'Inter, "Helvetica Neue", Arial, sans-serif';
export function fNum(weight: 300 | 600, px: number): string { return `${weight} ${px}px ${FONT_NUM}`; }
export function fCn(weight: number, px: number): string { return `${weight} ${px}px ${FONT_CN}`; }
