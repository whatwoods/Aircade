// 各阶段的矩形（逻辑坐标，按 Hlog 弹性分配间距）。基准为 390×844（见设计文档 §6.3 / §6.5）
import { BAG, SHOP } from '../config.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BagRect extends Rect {
  /** 网格左上 */
  gx: number;
  gy: number;
  cell: number;
  frame: number;
}

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

export interface ArrangeLayout {
  H: number;
  pause: Rect;
  hearts: Rect;
  roundTag: Rect;
  gold: Rect;
  enemyCard: Rect;
  bag: BagRect;
  stash: Rect[];
  stashArea: Rect;
  shop: Rect;
  shopTitleY: number;
  lock: Rect;
  refresh: Rect;
  cards: Rect[];
  fight: Rect;
  undo: Rect;
  skip: Rect;
  drawer: Rect;
  bubbleY: number;
}

/** 弹性：H<844 时压缩间距与卡高；H>844 时把多出的高度分给间距 */
function elastic(H: number): { top: number; g1: number; g2: number; g3: number; g4: number; bottom: number; card: number } {
  const base = { top: 0, g1: 8, g2: 12, g3: 20, g4: 16, bottom: 52, card: 122 };
  if (H < 844) {
    const d = 844 - H;
    const cardShrink = Math.min(12, (12 * d) / 84);
    let rem = d - cardShrink;
    const mins = { g1: 4, g2: 6, g3: 8, g4: 8, bottom: 10 };
    const caps = { g1: base.g1 - mins.g1, g2: base.g2 - mins.g2, g3: base.g3 - mins.g3, g4: base.g4 - mins.g4, bottom: base.bottom - mins.bottom };
    const total = caps.g1 + caps.g2 + caps.g3 + caps.g4 + caps.bottom;
    const k = Math.min(1, rem / total);
    rem = 0;
    return {
      top: 0,
      g1: base.g1 - caps.g1 * k,
      g2: base.g2 - caps.g2 * k,
      g3: base.g3 - caps.g3 * k,
      g4: base.g4 - caps.g4 * k,
      bottom: base.bottom - caps.bottom * k,
      card: base.card - cardShrink,
    };
  }
  const e = H - 844;
  return {
    top: e * 0.22,
    g1: base.g1 + e * 0.1,
    g2: base.g2 + e * 0.1,
    g3: base.g3 + e * 0.14,
    g4: base.g4 + e * 0.1,
    bottom: base.bottom + e * 0.34,
    card: base.card,
  };
}

export function arrangeLayout(H: number): ArrangeLayout {
  const el = elastic(H);
  const top = el.top;
  const cell = Math.min(54, Math.floor(324 / BAG.cols), Math.floor(270 / BAG.rows));
  const frame = 16;
  const bw = BAG.cols * cell + frame * 2;
  const bh = BAG.rows * cell + frame * 2;
  const bagY = top + 118 + el.g1;
  const bx = (390 - bw) / 2;
  const bag: BagRect = { x: bx, y: bagY, w: bw, h: bh, gx: bx + frame, gy: bagY + frame, cell, frame };
  const stashY = bagY + bh + el.g2;
  const stash: Rect[] = [];
  for (let i = 0; i < SHOP.stashSlots; i++) stash.push(R(16 + 73 * i, stashY, 66, 68));
  const shopY = stashY + 68 + el.g3;
  const shopH = 188 - (122 - el.card);
  const cards: Rect[] = [];
  for (let i = 0; i < SHOP.slots; i++) cards.push(R(16 + 73 * i, shopY + 62, 66, el.card));
  const fightY = shopY + shopH + el.g4;
  return {
    H,
    pause: R(12, 8 + top * 0.3, 44, 44),
    hearts: R(64, 18 + top * 0.3, 22, 20),
    roundTag: R(150, 10 + top * 0.3, 90, 36),
    gold: R(262, 10 + top * 0.3, 112, 40),
    enemyCard: R(16, 58 + top * 0.6, 358, 60),
    bag,
    stash,
    stashArea: R(10, stashY - 6, 370, 80),
    shop: R(8, shopY, 374, shopH),
    shopTitleY: shopY + 30,
    lock: R(244, shopY + 25, 40, 32),
    refresh: R(290, shopY + 25, 84, 32),
    cards,
    fight: R(95, fightY, 200, 60),
    undo: R(16, fightY, 72, 60),
    skip: R(302, fightY + 10, 72, 40),
    drawer: R(16, Math.max(stashY - 10, H - 414), 358, Math.min(370, H - stashY - 4)),
    bubbleY: stashY - 2,
  };
}

export interface BattleLayout {
  H: number;
  pause: Rect;
  roundTag: Rect;
  gold: Rect;
  enemyBadge: Rect;
  enemyName: { x: number; y: number };
  enemyHp: Rect;
  enemyStatus: { x: number; y: number };
  standee: Rect;
  enemyBagArea: Rect;
  band: Rect;
  hourglass: Rect;
  playerBag: BagRect;
  playerBadge: Rect;
  playerHp: Rect;
  playerStatus: { x: number; y: number };
  speed: Rect;
  cont: Rect;
}

export function battleLayout(H: number): BattleLayout {
  const d = Math.max(0, 844 - H);
  const e = Math.max(0, H - 844);
  const k = d / 84;
  const top = e * 0.2;
  const bandH = 76 - 12 * k;
  const cellP = Math.round(46 - 2 * k);
  const frameP = 14;
  const pw = BAG.cols * cellP + frameP * 2;
  const ph = BAG.rows * cellP + frameP * 2;
  const enemyTop = top + 56;
  const standeeH = 212 - 16 * k;
  const bandY = enemyTop + 50 + standeeH + 4 - 4 * k + e * 0.15;
  const bagY = bandY + bandH + 6 + e * 0.12;
  const hpY = bagY + ph + 6 + e * 0.1;
  const btnY = hpY + 48 + 16 - 8 * k + e * 0.1;
  const px = (390 - pw) / 2;
  return {
    H,
    pause: R(12, 8 + top * 0.3, 44, 44),
    roundTag: R(150, 10 + top * 0.3, 90, 36),
    gold: R(262, 10 + top * 0.3, 112, 40),
    enemyBadge: R(16, enemyTop, 48, 48),
    enemyName: { x: 72, y: enemyTop + 10 },
    enemyHp: R(72, enemyTop + 22, 302, 20),
    enemyStatus: { x: 374, y: enemyTop + 8 },
    standee: R(16, enemyTop + 50, 120, standeeH),
    enemyBagArea: R(146, enemyTop + 59, 228, standeeH - 18),
    band: R(0, bandY, 390, bandH),
    hourglass: R(171, bandY + 6, 48, bandH - 12),
    playerBag: { x: px, y: bagY, w: pw, h: ph, gx: px + frameP, gy: bagY + frameP, cell: cellP, frame: frameP },
    playerBadge: R(16, hpY, 48, 48),
    playerHp: R(72, hpY + 16, 302, 24),
    playerStatus: { x: 374, y: hpY + 2 },
    speed: R(302, btnY, 72, 48),
    cont: R(95, btnY - 6, 200, 60),
  };
}

/** 敌人背包在给定区域内的格大小与位置（6×5 时格 34、框 12；小背包格 36 居中） */
export function enemyBagRect(area: Rect, cols: number, rows: number): BagRect {
  const frame = 12;
  let cell = Math.floor(Math.min((area.w - frame * 2) / cols, (area.h - frame * 2) / rows));
  cell = Math.min(cell, cols * rows <= 12 ? 36 : 36);
  const w = cols * cell + frame * 2;
  const h = rows * cell + frame * 2;
  const x = area.x + (area.w - w) / 2;
  const y = area.y + (area.h - h) / 2;
  return { x, y, w, h, gx: x + frame, gy: y + frame, cell, frame };
}
