/**
 * 合成位置框（§6.6 ①）：每个部件在结果字里的位置与偏旁变体。
 * 位置框以结果字的「墨迹包围盒」为单位方框 [0,1]²；部件按自身墨迹包围盒映射进去（可非等比压扁）。
 *   ⿰ 左 45% / 右 51%；⿱ 上 43% / 下 53%；包围：外框 100%、内框约 55% 放在开口处；
 *   品：一上两下（骂为二上一下）。
 * 显示字形逐字取配方的 vv（hanzi.ts 唯一数据源；炎/灭/灾/焚 的火不变灬，只有 照/焦 等才是）。
 * vv 缺省 = 部件本字；竹/羊 在上时字体无独立字头，直接压扁本字。
 */
import { RECIPE_MAP } from '../core/recipes.ts';
import type { RecipeDef } from '../data/hanzi.ts';

export interface PartBox {
  /** 部件本字（飞入起点显示） */
  base: string;
  /** 在结果中显示的字形（变体或本字） */
  show: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 是否外框（包围结构的外部件，不压扁） */
  outer: boolean;
}

type Pos = 'l' | 'r' | 't' | 'b' | '';

const cache = new Map<string, PartBox[]>();

export function partBoxes(r: RecipeDef): PartBox[] {
  const hit = cache.get(r.c);
  if (hit) return hit;
  const p = r.parts;
  const vv = r.vv ? [...r.vv] : p;
  // pos 仅作阅读提示，字形一律取 vv
  const mk = (i: number, _pos: Pos, x: number, y: number, w: number, h: number, outer = false): PartBox => ({
    base: p[i], show: vv[i] ?? p[i], x, y, w, h, outer,
  });
  let out: PartBox[];
  switch (r.s) {
    case '⿰':
      out = [mk(0, 'l', 0, 0, 0.45, 1), mk(1, 'r', 0.49, 0, 0.51, 1)];
      break;
    case '⿱':
      out = [mk(0, 't', 0, 0, 1, 0.43), mk(1, 'b', 0, 0.47, 1, 0.53)];
      break;
    case '⿴':
      out = [mk(0, '', 0, 0, 1, 1, true), mk(1, '', 0.24, 0.22, 0.52, 0.54)];
      break;
    case '⿵':
      out = [mk(0, '', 0, 0, 1, 1, true), mk(1, '', 0.25, 0.3, 0.5, 0.6)];
      break;
    case '⿸':
      out = [mk(0, '', 0, 0, 1, 1, true), mk(1, '', 0.4, 0.38, 0.56, 0.58)];
      break;
    case '⿹':
      out = [mk(0, '', 0, 0, 1, 1, true), mk(1, '', 0.04, 0.4, 0.5, 0.56)];
      break;
    case '⿺':
      out = [mk(0, '', 0, 0, 1, 1, true), mk(1, '', 0.36, 0.02, 0.6, 0.62)];
      break;
    case '品':
    default:
      if (p[0] === p[1] && p[2] !== p[0]) {
        // 骂：口口在上，马在下
        out = [mk(0, '', 0.04, 0, 0.44, 0.42), mk(1, '', 0.52, 0, 0.44, 0.42), mk(2, '', 0.06, 0.46, 0.88, 0.54)];
      } else {
        out = [mk(0, '', 0.26, 0, 0.48, 0.48), mk(1, '', 0, 0.52, 0.48, 0.48), mk(2, '', 0.52, 0.52, 0.48, 0.48)];
      }
  }
  cache.set(r.c, out);
  return out;
}

/** 未成牌：两个部件在目标字里的位置（取第一个候选目标） */
export function pendingBoxes(parts: string[], target: string): PartBox[] {
  const r = RECIPE_MAP.get(target);
  if (!r) return [];
  const all = partBoxes(r);
  const used = new Set<number>();
  const out: PartBox[] = [];
  for (const ch of parts) {
    const i = all.findIndex((b, k) => !used.has(k) && b.base === ch);
    if (i >= 0) {
      used.add(i);
      out.push(all[i]);
    }
  }
  return out;
}

/** 两张牌合成时，A、B 的各部件分别对应的位置框下标。B（落点牌）先占；同部件时 A 依方位取后一个 */
export function assignBoxes(r: RecipeDef, aParts: string[], bParts: string[], aSecond: boolean): { a: number[]; b: number[] } {
  const boxes = partBoxes(r);
  const used = new Set<number>();
  const take = (ch: string, last: boolean): number => {
    let i = -1;
    for (let k = 0; k < boxes.length; k++) {
      if (used.has(k) || boxes[k].base !== ch) continue;
      i = k;
      if (!last) break;
    }
    if (i >= 0) used.add(i);
    return i;
  };
  const a: number[] = [];
  const b: number[] = [];
  // 拖入方 A 在后（右 / 下）时，B 先取前面的框，反之 B 取后面的
  for (const ch of bParts) b.push(take(ch, !aSecond));
  for (const ch of aParts) a.push(take(ch, false));
  return { a, b };
}
