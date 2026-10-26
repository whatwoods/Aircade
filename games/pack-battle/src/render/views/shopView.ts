// 行商摊位：条纹遮阳篷（波浪边）+ 深色柜台 + 麻绳挂卡（摆动 / 翻转 / 弹绳）+ 挂锁 + 出售模式
import { ITEMS, RARITY_NAMES } from '../../config.ts';
import { Spring } from '../../core/spring.ts';
import { shapeOf } from '../../game/shapes.ts';
import type { ItemId, ShopSlot } from '../../game/types.ts';
import { inkStroke, rectPts, type Pts } from '../ink.ts';
import { C, RARITY_COLOR, RARITY_TINT, cached, drawGoldCoin, drawPaper, pat } from '../kit.ts';
import type { ArrangeLayout } from '../layout.ts';
import { drawItemAt } from '../sprites.ts';
import { HAND, drawSprite, text } from '../text.ts';
import { rgba } from '../textures.ts';
import { drawStamp, regSpring } from '../ui/widgets.ts';

interface CardState {
  swing: Spring;
  /** 翻转进度：<0 等待，0..1 进行中，≥1 完成 */
  flip: number;
  shownId: ItemId | null;
  shownPrice: number;
  /** 被拿起（拖拽中）时隐藏卡上的装备 */
  lifted: boolean;
  shake: number;
}

export interface ShopDrawOpts {
  gold: number;
  sell: number;
  sellFull: boolean;
  mergeable: (id: ItemId) => boolean;
  /** 0..1 摊位滑出 */
  out: number;
  locked: boolean;
  hover: number;
}

export class ShopView {
  cards: CardState[] = [];
  lockY = regSpring(new Spring(20, 0.32, -40));
  refreshSpin = 0;
  sellK = regSpring(new Spring(24, 0.8, 0));
  rope = regSpring(new Spring(30, 0.2, 0));

  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      this.cards.push({ swing: regSpring(new Spring(6, 0.15, 0)), flip: 1, shownId: null, shownPrice: 0, lifted: false, shake: 0 });
    }
  }

  /** 新一轮：不翻转，直接显示 */
  setInstant(shop: ShopSlot[]): void {
    shop.forEach((s, i) => {
      const c = this.cards[i];
      c.shownId = s.id;
      c.shownPrice = s.price;
      c.flip = 1;
      c.lifted = false;
    });
  }

  /** 刷新：依次翻转（间隔 40ms） */
  flipAll(): void {
    this.cards.forEach((c, i) => {
      c.flip = -i * 0.04 / 0.26;
      c.swing.v += (i % 2 ? 1 : -1) * 1.2;
    });
    this.refreshSpin = 1;
    this.rope.v += 25;
  }

  bump(i: number, k = 1): void {
    const c = this.cards[i];
    if (c) c.swing.v += k * 2.2;
    this.rope.v += 30 * k;
  }

  shakeCard(i: number): void {
    const c = this.cards[i];
    if (c) c.shake = 0.3;
  }

  setLocked(on: boolean): void {
    this.lockY.target = on ? 0 : -40;
    if (on) this.lockY.v = 60;
    else this.lockY.v = -80;
  }

  update(dt: number, shop: ShopSlot[]): void {
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      if (c.shake > 0) c.shake = Math.max(0, c.shake - dt);
      if (c.flip < 1) {
        const prev = c.flip;
        c.flip += dt / 0.26;
        if (prev < 0.5 && c.flip >= 0.5) {
          c.shownId = shop[i]?.id ?? null;
          c.shownPrice = shop[i]?.price ?? 0;
        }
      } else {
        const s = shop[i];
        if (s && (s.id !== c.shownId || s.price !== c.shownPrice)) {
          c.shownId = s.id;
          c.shownPrice = s.price;
        }
      }
    }
    if (this.refreshSpin > 0) this.refreshSpin = Math.max(0, this.refreshSpin - dt / 0.45);
  }

  /** 卡片在逻辑坐标中的命中（考虑摆动的近似） */
  cardAt(L: ArrangeLayout, x: number, y: number): number {
    for (let i = 0; i < L.cards.length; i++) {
      const r = L.cards[i];
      if (x >= r.x - 3 && x <= r.x + r.w + 3 && y >= r.y - 4 && y <= r.y + r.h + 3) return i;
    }
    return -1;
  }

  /** 卡片上装备绘制区的格大小与中心 */
  itemBox(L: ArrangeLayout, i: number, id: ItemId): { cx: number; cy: number; cell: number } {
    const r = L.cards[i];
    const s = shapeOf(id, 0);
    const areaH = r.h - 50;
    const cell = cardCell(s.w, s.h, areaH);
    return { cx: r.x + r.w / 2, cy: r.y + 8 + areaH / 2, cell };
  }

  draw(ctx: CanvasRenderingContext2D, L: ArrangeLayout, shop: ShopSlot[], time: number, o: ShopDrawOpts): void {
    const r = L.shop;
    const sell = this.sellK.x;
    ctx.save();
    if (o.out > 0) {
      ctx.translate(0, o.out * 120);
      ctx.globalAlpha *= Math.max(0, 1 - o.out * 1.3);
    }
    // 柜台
    drawSprite(ctx, counterSprite(r.w, r.h - 14), r.x, r.y + 14);
    // 绳子
    const ropeY = r.y + 58;
    const sag = 5 + this.rope.x * 0.08;
    ctx.strokeStyle = '#b89464';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(r.x + 6, ropeY - 2);
    ctx.quadraticCurveTo(r.x + r.w / 2, ropeY + sag * 2, r.x + r.w - 6, ropeY - 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,35,15,0.6)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 卡片
    for (let i = 0; i < L.cards.length; i++) this.drawCard(ctx, L, i, shop[i], time, o, ropeY, sag);
    // 遮阳篷
    drawSprite(ctx, awningSprite(r.w), r.x, r.y);
    if (sell > 0.01) {
      ctx.save();
      ctx.globalAlpha *= sell * 0.55;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#e0503a';
      ctx.fillRect(r.x, r.y, r.w, 24);
      ctx.restore();
    }
    // 标题
    text(ctx, '行商摊位', r.x + 12, L.shopTitleY + 9, { size: 17, weight: 900, color: C.paper, stroke: C.ink, strokeW: 4, align: 'left', spacing: 2 });
    // 挂锁（从遮阳篷落下）
    const ly = this.lockY.x;
    if (ly > -38) {
      const lx = L.lock.x + L.lock.w / 2;
      ctx.save();
      ctx.globalAlpha *= Math.max(0, Math.min(1, (ly + 38) / 20));
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lx - 30, r.y + 22);
      ctx.lineTo(lx - 30, r.y + 30 + ly);
      ctx.stroke();
      drawPadlock(ctx, lx - 30, r.y + 38 + ly);
      ctx.restore();
    }
    // 出售模式
    if (sell > 0.01) {
      ctx.save();
      ctx.globalAlpha *= sell;
      ctx.fillStyle = 'rgba(160,30,20,0.32)';
      ctx.beginPath();
      ctx.roundRect(r.x + 2, r.y + 26, r.w - 4, r.h - 28, 10);
      ctx.fill();
      ctx.strokeStyle = '#ff9a80';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 6]);
      ctx.lineDashOffset = -time * 30;
      ctx.stroke();
      ctx.setLineDash([]);
      // 金额价签挂在拖拽件上方（arrangeController.drawSellTag）；这里只在柜台中央写一行提示
      text(ctx, '松手出售', 174, L.shopTitleY + 9, { size: 15, weight: 900, color: '#ffd2c4', stroke: C.ink, strokeW: 3.5 });
      ctx.restore();
    }
    ctx.restore();
  }

  private drawCard(ctx: CanvasRenderingContext2D, L: ArrangeLayout, i: number, _slot: ShopSlot | undefined, time: number, o: ShopDrawOpts, ropeY: number, sag: number): void {
    const c = this.cards[i];
    const r = L.cards[i];
    const id = c.shownId;
    const px = r.x + r.w / 2;
    const tAlong = (px - L.shop.x) / L.shop.w;
    const hookY = ropeY + sag * 4 * tAlong * (1 - tAlong) * 2 - 2;
    // 待机微摆
    const idle = Math.sin(time * 1.3 + i * 1.7) * 0.012;
    const ang = c.swing.x + idle + (c.shake > 0 ? Math.sin(c.shake * 60) * 0.06 * (c.shake / 0.3) : 0);
    // 绳
    ctx.save();
    ctx.translate(px, hookY);
    ctx.rotate(ang);
    const top = r.y - hookY;
    ctx.strokeStyle = '#a8865a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, top + 6);
    ctx.stroke();
    const fx = c.flip < 1 && c.flip >= 0 ? Math.abs(Math.cos(c.flip * Math.PI)) : 1;
    ctx.translate(0, top);
    if (fx !== 1) ctx.scale(Math.max(0.02, fx), 1);
    if (!id) {
      // 已售出
      ctx.strokeStyle = rgba(C.chalk, 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(-r.w / 2 + 2, 2, r.w - 4, r.h - 4, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      drawStamp(ctx, '已售出', 0, r.h / 2, 13, rgba(C.chalk, 0.6), -0.2);
      ctx.restore();
      return;
    }
    const def = ITEMS[id];
    drawSprite(ctx, cardSprite(r.w, r.h, def.rarity, i), -r.w / 2, 0);
    // 装备
    if (!c.lifted) {
      const s = shapeOf(id, 0);
      const areaH = r.h - 50;
      const cell = cardCell(s.w, s.h, areaH);
      drawItemAt(ctx, id, 1, 0, 0, 8 + areaH / 2, cell, 'tile', true);
    } else {
      ctx.strokeStyle = rgba(C.ink, 0.25);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(-r.w / 2 + 8, 10, r.w - 16, r.h - 62);
      ctx.setLineDash([]);
    }
    // 名称
    text(ctx, def.name, 0, r.h - 37, { size: 13, weight: 800, color: C.ink, maxW: r.w - 6 });
    // 价签
    const afford = o.gold >= c.shownPrice;
    drawSprite(ctx, priceRibbon(r.w - 6, def.rarity), -r.w / 2 + 3, r.h - 27);
    drawGoldCoin(ctx, -12, r.h - 14, 8);
    text(ctx, String(c.shownPrice), 2, r.h - 13, { size: 21, family: HAND, color: afford ? '#fff6dc' : '#ffb4a0', stroke: C.ink, strokeW: 3.5, align: 'left' });
    if (!afford) {
      ctx.fillStyle = 'rgba(40,20,10,0.18)';
      ctx.fillRect(-r.w / 2 + 3, 4, r.w - 6, r.h - 32);
    }
    // 可合成
    if (o.mergeable(id) && !c.lifted) {
      ctx.save();
      ctx.translate(r.w / 2 - 12, 10);
      ctx.rotate(0.22);
      drawSprite(ctx, mergeTag(), -22, -9);
      text(ctx, '可合成', 0, 0, { size: 10, weight: 900, color: '#ffffff' });
      ctx.restore();
    }
    // 稀有度角标（精良以上）
    if (def.rarity > 0) {
      ctx.fillStyle = RARITY_COLOR[def.rarity];
      ctx.beginPath();
      ctx.arc(-r.w / 2 + 9, 11, 3.2, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, RARITY_NAMES[def.rarity], -r.w / 2 + 15, 11, { size: 9, weight: 800, color: RARITY_COLOR[def.rarity], align: 'left' });
    }
    if (o.hover === i && !c.lifted) {
      ctx.strokeStyle = rgba(C.goldLight, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-r.w / 2 + 1, 1, r.w - 2, r.h - 2, 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 卡片的屏幕位置（含摆动的近似中心） */
  cardCenter(L: ArrangeLayout, i: number, out: { x: number; y: number }): void {
    const r = L.cards[i];
    out.x = r.x + r.w / 2;
    out.y = r.y + (r.h - 50) / 2 + 8;
  }
}

/** 卡片上装备的格大小：1×1 放大到 34px 保证可读，长条按可用高度收缩 */
function cardCell(w: number, h: number, areaH: number): number {
  return Math.min(34, 56 / w, (areaH - 8) / h);
}

function counterSprite(w: number, h: number) {
  return cached('counter|' + w + 'x' + h, w, h, 8, (ctx, ratio) => {
    const p = rectPts(0, 0, w, h, 10);
    ctx.save();
    ctx.translate(2, 5);
    ctx.fillStyle = 'rgba(12,6,2,0.4)';
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pat(ctx, 'leatherDark', ratio, 0.8);
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(10,4,0,0.55)');
    g.addColorStop(0.25, 'rgba(10,4,0,0.25)');
    g.addColorStop(1, 'rgba(10,4,0,0.5)');
    ctx.fillStyle = g;
    ctx.fill();
    // 木条
    ctx.strokeStyle = 'rgba(255,215,160,0.08)';
    ctx.lineWidth = 1;
    for (let y = 30; y < h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }
    inkStroke(ctx, p, true, 2, C.ink, 21, { unit: 1, jitter: 0.5, dry: false });
  });
}

function awningSprite(w: number) {
  return cached('awning|' + w, w, 30, 8, (ctx) => {
    const sw = 22;
    const n = Math.ceil(w / sw);
    const top = 0;
    const bot = 22;
    // 投影
    ctx.fillStyle = 'rgba(12,6,2,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, top + 4);
    ctx.lineTo(w, top + 4);
    for (let i = n; i >= 0; i--) {
      const x = Math.min(w, i * sw);
      ctx.lineTo(x, bot + 4);
      if (i > 0) ctx.quadraticCurveTo(x - sw / 2, bot + 12, Math.max(0, x - sw), bot + 4);
    }
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < n; i++) {
      const x0 = i * sw;
      const x1 = Math.min(w, x0 + sw);
      ctx.fillStyle = i % 2 ? '#efe0bd' : C.awning;
      ctx.beginPath();
      ctx.moveTo(x0, top);
      ctx.lineTo(x1, top);
      ctx.lineTo(x1, bot);
      ctx.quadraticCurveTo((x0 + x1) / 2, bot + 8, x0, bot);
      ctx.closePath();
      ctx.fill();
    }
    // 褶皱阴影
    const g = ctx.createLinearGradient(0, top, 0, bot + 8);
    g.addColorStop(0, 'rgba(255,240,210,0.18)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,10,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, bot + 8);
    // 木杆
    ctx.fillStyle = '#6b4424';
    ctx.beginPath();
    ctx.roundRect(-4, top - 4, w + 8, 7, 3);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 波浪边墨线
    const edge: Pts = [];
    for (let i = 0; i < n; i++) {
      const x0 = i * sw;
      const x1 = Math.min(w, x0 + sw);
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const x = x0 + (x1 - x0) * t;
        const y = bot + 8 * 2 * t * (1 - t) * 0.95;
        edge.push(x, y);
      }
    }
    inkStroke(ctx, edge, false, 1.6, C.ink, 5, { unit: 1, jitter: 0.4, dry: false });
  });
}

function cardSprite(w: number, h: number, rarity: number, seed: number) {
  return cached('card|' + w + 'x' + h + '|' + rarity + '|' + seed, w, h, 6, (ctx, ratio) => {
    drawPaper(ctx, ratio, 0, 0, w, h, { seed: 40 + seed * 3 + rarity, tint: RARITY_TINT[rarity], burn: 0.7, r: 6 });
    // 稀有度色边
    if (rarity > 0) {
      ctx.strokeStyle = rgba(RARITY_COLOR[rarity], 0.75);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(3.5, 3.5, w - 7, h - 7, 5);
      ctx.stroke();
    }
    // 打孔（挂绳）
    ctx.fillStyle = 'rgba(40,22,10,0.8)';
    ctx.beginPath();
    ctx.arc(w / 2, 6, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.brass;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(w / 2, 6, 3.6, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function priceRibbon(w: number, rarity: number) {
  return cached('price|' + w + '|' + rarity, w, 24, 4, (ctx) => {
    const col = rarity === 0 ? '#7a5a3e' : RARITY_COLOR[rarity];
    ctx.fillStyle = 'rgba(20,10,4,0.3)';
    ctx.beginPath();
    ctx.roundRect(1, 2, w, 24, 4);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w - 5, 12);
    ctx.lineTo(w, 24);
    ctx.lineTo(0, 24);
    ctx.lineTo(5, 12);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, 24);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  });
}

function mergeTag() {
  return cached('mergetag', 44, 18, 3, (ctx) => {
    ctx.fillStyle = 'rgba(20,10,4,0.3)';
    ctx.beginPath();
    ctx.roundRect(1, 2, 44, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#4d8a3a';
    ctx.beginPath();
    ctx.roundRect(0, 0, 44, 18, 4);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
}

function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#8f8f8f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -6, 6, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, -6, 7.5, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = C.brass;
  ctx.beginPath();
  ctx.roundRect(-8, -6, 16, 14, 3);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-0.8, 0, 1.6, 4);
  ctx.restore();
}
