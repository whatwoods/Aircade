// HUD：心、轮次签、金币栏、敌情卡 / 详情条、桌边暂存槽
import { ITEMS, PLAYER, RARITY_NAMES, ROUNDS, TAG_NAMES } from '../../config.ts';
import type { Rolling } from '../../core/tween.ts';
import { ease } from '../../core/tween.ts';
import type { EnemyDef, ItemId, Lv, Placed } from '../../game/types.ts';
import { C, RARITY_COLOR, TAG_COLOR, cached, drawGoldCoin, drawHeart, drawPaper } from '../kit.ts';
import type { Rect } from '../layout.ts';
import { drawEnemyBadge } from '../portraits.ts';
import { HAND, drawSprite, measure, num, text } from '../text.ts';
import { rgba } from '../textures.ts';
import { drawMiniBag } from './bagView.ts';

// ---------- 心 ----------

export interface HeartBreak {
  i: number;
  t: number;
}

export function drawHearts(ctx: CanvasRenderingContext2D, r: Rect, hearts: number, breaks: HeartBreak[], time: number, low: boolean): void {
  for (let i = 0; i < PLAYER.hearts; i++) {
    const cx = r.x + r.w / 2 + i * (r.w + 3);
    const cy = r.y + r.h / 2;
    const br = breaks.find((b) => b.i === i);
    const full = i < hearts;
    let s = 1;
    if (full && low && i === hearts - 1) s = 1 + 0.08 * Math.max(0, Math.sin(time * Math.PI * 2 * 1.2));
    if (br && br.t < 1.2) {
      drawHeart(ctx, cx, cy, r.w, r.h, false, i + 1);
      // 两半旋转下落
      const t = br.t;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.globalAlpha *= Math.max(0, 1 - t / 1.2);
        ctx.translate(cx + side * (2 + t * 18), cy + t * t * 160);
        ctx.rotate(side * t * 2.4);
        ctx.beginPath();
        ctx.rect(side < 0 ? -r.w : 0, -r.h, r.w, r.h * 2);
        ctx.clip();
        drawHeart(ctx, 0, 0, r.w, r.h, true, i + 1);
        ctx.restore();
      }
      continue;
    }
    if (s !== 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      drawHeart(ctx, 0, 0, r.w, r.h, full, i + 1);
      ctx.restore();
    } else drawHeart(ctx, cx, cy, r.w, r.h, full, i + 1);
  }
}

// ---------- 轮次签 ----------

export function drawRoundTag(ctx: CanvasRenderingContext2D, r: Rect, round: number, attempt: number, score: number, scoreFlash: number): void {
  drawSprite(ctx, roundTagSprite(r.w, r.h), r.x, r.y);
  text(ctx, `第 ${round} 轮`, r.x + r.w / 2 - 9, r.y + 13, { size: 15, weight: 900, color: C.ink });
  text(ctx, '/' + ROUNDS, r.x + r.w / 2 + 26, r.y + 14, { size: 13, family: HAND, color: C.inkSoft });
  const col = scoreFlash > 0 ? C.goldDark : C.inkSoft;
  if (attempt > 1) {
    // "再战"小签放在轮次签第二行左侧（上下左右都没有空位：心、金币栏、敌情卡）
    drawSprite(ctx, smallTag(32, 15, C.waxLight), r.x + 5, r.y + 20.5);
    text(ctx, '再战', r.x + 21, r.y + 28, { size: 10, weight: 900, color: '#fff6e6' });
    text(ctx, '分 ' + num(score), r.x + r.w / 2 + 17, r.y + 28, { size: 11, weight: 700, color: col });
  } else text(ctx, '分 ' + num(score), r.x + r.w / 2, r.y + 28, { size: 11, weight: 700, color: col });
}

function roundTagSprite(w: number, h: number) {
  return cached('roundtag|' + w + 'x' + h, w, h, 6, (ctx, ratio) => drawPaper(ctx, ratio, 0, 0, w, h, { seed: 77, burn: 0.7, r: 5 }));
}

function smallTag(w: number, h: number, color: string) {
  return cached('stag|' + w + 'x' + h + color, w, h, 3, (ctx) => {
    ctx.fillStyle = 'rgba(20,10,4,0.3)';
    ctx.beginPath();
    ctx.roundRect(1, 2, w, h, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
}

// ---------- 金币栏 ----------

export function drawGold(ctx: CanvasRenderingContext2D, r: Rect, gold: Rolling, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawSprite(ctx, goldPlaque(r.w, r.h), r.x, r.y);
  const f = gold.flash;
  const s = f !== 0 ? 1 + 0.12 * Math.abs(f) / 0.45 : 1;
  drawGoldCoin(ctx, r.x + 22, r.y + r.h / 2, 13);
  ctx.translate(r.x + 44, r.y + r.h / 2 + 1);
  ctx.scale(s, s);
  const col = f > 0 ? C.goldLight : f < 0 ? '#ff8a70' : C.paper;
  text(ctx, String(gold.int), 0, 0, { size: 28, family: HAND, color: col, stroke: C.ink, strokeW: 4.5, align: 'left' });
  ctx.restore();
}

function goldPlaque(w: number, h: number) {
  return cached('goldplaque|' + w + 'x' + h, w, h, 6, (ctx) => {
    ctx.fillStyle = 'rgba(12,6,2,0.35)';
    ctx.beginPath();
    ctx.roundRect(1.5, 3, w, h, h / 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a2d18');
    g.addColorStop(1, '#2e1b10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(239,217,167,0.45)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, (h - 8) / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.stroke();
  });
}

// ---------- 敌情卡 ----------

export function drawEnemyCard(ctx: CanvasRenderingContext2D, r: Rect, e: EnemyDef, bag: readonly Placed[], flip: number, time: number): void {
  const k = ease.outBack(Math.max(0, Math.min(1, flip)));
  if (k <= 0.01) return;
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y);
  ctx.scale(1, Math.max(0.02, k));
  ctx.translate(-r.w / 2, 0);
  drawSprite(ctx, enemyCardSprite(r.w, r.h, !!e.boss), 0, 0);
  drawEnemyBadge(ctx, e.portrait, 32, r.h / 2, 24);
  const nm = `${e.title}「${e.name}」`;
  text(ctx, e.boss ? '首领：' : '下一位：', 64, 19, { size: 12, weight: 700, color: e.boss ? C.wax : C.inkSoft, align: 'left' });
  const lw = measure(ctx, e.boss ? '首领：' : '下一位：', 12, 700);
  text(ctx, nm, 64 + lw, 19, { size: 16, weight: 900, color: C.ink, align: 'left', maxW: 190 - lw });
  text(ctx, `♥${e.hp} · ${bag.length} 件装备`, 64, 41, { size: 13, weight: 700, color: C.hp, align: 'left' });
  const cell = 7;
  const mw = e.cols * cell;
  const mh = e.rows * cell;
  const mx = r.w - 64 - mw / 2;
  drawMiniBag(ctx, mx, r.h / 2 - mh / 2, cell, bag, e.cols, e.rows);
  text(ctx, '查看 ›', r.w - 14, r.h / 2, { size: 12, weight: 800, color: C.inkSoft, align: 'right', alpha: 0.75 + 0.25 * Math.sin(time * 2.5) });
  ctx.restore();
}

function enemyCardSprite(w: number, h: number, boss: boolean) {
  return cached('ecard|' + w + 'x' + h + boss, w, h, 6, (ctx, ratio) => {
    drawPaper(ctx, ratio, 0, 0, w, h, { seed: boss ? 91 : 90, tint: boss ? '#f0d0b8' : undefined, burn: 0.8, r: 6 });
    if (boss) {
      ctx.strokeStyle = rgba(C.wax, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 5);
      ctx.stroke();
    }
  });
}

// ---------- 详情条 ----------

export interface DetailInfo {
  id: ItemId;
  lv: Lv;
  effect: string;
  adj: string;
  extra?: string;
  sell?: number;
  hint?: string;
}

export function drawDetailBar(ctx: CanvasRenderingContext2D, r: Rect, d: DetailInfo, appear: number): void {
  const def = ITEMS[d.id];
  const k = Math.min(1, appear);
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(0.96 + 0.04 * k, 0.96 + 0.04 * k);
  ctx.translate(-r.w / 2, -r.h / 2);
  drawSprite(ctx, detailSprite(r.w, r.h), 0, 0);
  // 标签色条
  ctx.fillStyle = TAG_COLOR[def.tag];
  ctx.beginPath();
  ctx.roundRect(8, 8, 4, r.h - 16, 2);
  ctx.fill();
  text(ctx, def.name, 20, 15, { size: 16, weight: 900, color: RARITY_COLOR[def.rarity], align: 'left' });
  const nw = measure(ctx, def.name, 16, 900);
  text(ctx, '★'.repeat(d.lv) + '☆'.repeat(3 - d.lv), 26 + nw, 15, { size: 13, color: C.goldDark, align: 'left' });
  text(ctx, `${RARITY_NAMES[def.rarity]} · ${TAG_NAMES[def.tag]}`, r.w - 12, 15, { size: 11, weight: 700, color: C.inkSoft, align: 'right' });
  text(ctx, d.effect, 20, 34, { size: 13, weight: 700, color: C.ink, align: 'left', maxW: r.w - 30 });
  text(ctx, d.hint ?? d.adj, 20, 50, { size: 12, weight: 600, color: d.hint ? C.wax : C.inkSoft, align: 'left', maxW: r.w - 30 });
  ctx.restore();
}

function detailSprite(w: number, h: number) {
  return cached('detail|' + w + 'x' + h, w, h, 6, (ctx, ratio) => drawPaper(ctx, ratio, 0, 0, w, h, { seed: 93, tint: '#f6ecd4', burn: 0.6, r: 6 }));
}
