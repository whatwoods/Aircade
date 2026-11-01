import { COLS, N, ROWS, cx, cy, inLair } from '../game/board';
import type { Game } from '../game/rules';
import { fmtInt, fmtTime } from '../game/score';
import { Kind, type ScoreBreakdown } from '../game/types';
import { FONT_CN, FONT_DECO, FONT_NUM, FONT_TITLE } from '../view/glyphs';
import { PAL } from '../view/palette';
import { dayLabel } from './screens';

/**
 * 分享（文档 §6.9）：Canvas 画分享卡 + emoji 地图文字。
 * 地图只区分「探索过 / 黑暗 / 龙巢 / 倒下处」，不暴露怪物位置，每日挑战分享不剧透。
 */
type CellTag = 'lit' | 'dark' | 'lair' | 'dragon' | 'death';

function cellTag(g: Game, i: number): CellTag {
  if (g.b.kind[i] === Kind.Lair) return cx(i) === 4 && cy(i) === 5 ? 'dragon' : 'lair';
  if (i === g.deathCell && g.phase === 'lost') return 'death';
  return g.revealed[i] ? 'lit' : 'dark';
}

const EMOJI: Record<CellTag, string> = { lit: '🟨', dark: '⬛', lair: '🟥', dragon: '🐉', death: '💀' };

export function shareText(g: Game, b: ScoreBreakdown, url: string): string {
  const head = g.daily ? `地牢扫雷 · 每日挑战 ${dayLabel(g.daily)}` : `地牢扫雷 · ${g.diff.name} · 种子 #${g.seed}`;
  const res = b.won ? `屠龙成功 ${fmtInt(b.total)} 分 · ${fmtTime(b.timeSec)}` : `倒在了 Lv${g.player.level} · ${fmtInt(b.total)} 分`;
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let r = '';
    for (let x = 0; x < COLS; x++) r += EMOJI[cellTag(g, y * COLS + x)];
    rows.push(r);
  }
  return `${head}\n${res} · 探索 ${explored(g)}%\n${rows.join('\n')}\n${url}`;
}

export function explored(g: Game): number {
  return Math.round((g.revealedCount() / Math.max(1, g.playableCount())) * 100);
}

const setSpacing = (ctx: CanvasRenderingContext2D, px: number) => {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
};

function backdrop(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = PAL.abyss;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, Math.max(W, H) * 0.7);
  glow.addColorStop(0, 'rgba(255,181,74,0.16)');
  glow.addColorStop(0.5, 'rgba(255,122,26,0.05)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  setSpacing(ctx, size * 0.04);
  ctx.font = `${size}px ${FONT_TITLE}, ${FONT_CN}`;
  ctx.shadowColor = 'rgba(255,181,74,0.55)';
  ctx.shadowBlur = size * 0.3;
  const grad = ctx.createLinearGradient(0, y - size, 0, y);
  grad.addColorStop(0, '#FFE9C2');
  grad.addColorStop(1, PAL.amber);
  ctx.fillStyle = grad;
  ctx.fillText('地牢扫雷', x, y);
  ctx.shadowBlur = 0;
  setSpacing(ctx, size * 0.12);
  ctx.font = `700 ${size * 0.3}px ${FONT_DECO}`;
  ctx.fillStyle = 'rgba(255,210,122,0.75)';
  ctx.fillText('DUNGEON SWEEPER', x, y + size * 0.55);
  setSpacing(ctx, 0);
}

/** 迷你地图：tag 决定颜色；cell 为格宽 */
function miniMap(ctx: CanvasRenderingContext2D, tagAt: (i: number) => CellTag, x0: number, y0: number, cell: number, gap: number, won: boolean): void {
  const r = cell * 0.18;
  for (let i = 0; i < N; i++) {
    const t = tagAt(i);
    if (t === 'lair' || t === 'dragon') continue;
    const x = x0 + cx(i) * (cell + gap);
    const y = y0 + cy(i) * (cell + gap);
    ctx.fillStyle = t === 'lit' ? PAL.amber : t === 'death' ? PAL.lethal : '#232937';
    ctx.globalAlpha = t === 'lit' ? 0.85 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cell, cell, r);
    ctx.fill();
    if (t === 'dark') {
      ctx.strokeStyle = 'rgba(110,124,150,0.35)';
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // 龙巢 3×3 合成一块，画一双龙眼
  const lx = x0 + 3 * (cell + gap);
  const ly = y0 + 4 * (cell + gap);
  const ls = 3 * cell + 2 * gap;
  ctx.fillStyle = won ? '#3A1A10' : '#1A0D10';
  ctx.beginPath();
  ctx.roundRect(lx, ly, ls, ls, r * 2);
  ctx.fill();
  ctx.strokeStyle = won ? PAL.gold : PAL.bloodDeep;
  ctx.lineWidth = Math.max(1.5, cell * 0.08);
  ctx.stroke();
  ctx.fillStyle = won ? PAL.gold : PAL.dragonEye;
  ctx.shadowColor = won ? PAL.gold : PAL.dragonFire;
  ctx.shadowBlur = cell * 0.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (won) ctx.ellipse(lx + ls / 2 + s * ls * 0.18, ly + ls * 0.48, ls * 0.1, ls * 0.012 + 1, 0, 0, Math.PI * 2);
    else ctx.ellipse(lx + ls / 2 + s * ls * 0.18, ly + ls * 0.48, ls * 0.09, ls * 0.045, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

/** 分享卡（1080×1350） */
export function drawShareCard(g: Game, b: ScoreBreakdown): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  backdrop(ctx, W, H);
  logo(ctx, W / 2, 150, 96);
  ctx.textAlign = 'center';
  ctx.font = `600 36px ${FONT_CN}`;
  ctx.fillStyle = PAL.ash;
  setSpacing(ctx, 4);
  ctx.fillText(g.daily ? `每日挑战 · ${dayLabel(g.daily)}` : `${g.diff.name} · 种子 #${g.seed}`, W / 2, 280);
  ctx.font = `900 60px ${FONT_CN}`;
  ctx.fillStyle = b.won ? PAL.gold : '#FF5A6A';
  ctx.fillText(b.won ? '屠龙成功' : '你倒下了', W / 2, 380);
  setSpacing(ctx, 0);
  ctx.font = `900 140px ${FONT_NUM}`;
  ctx.fillStyle = PAL.gold;
  ctx.shadowColor = 'rgba(255,181,74,0.5)';
  ctx.shadowBlur = 40;
  ctx.fillText(fmtInt(b.total), W / 2, 530);
  ctx.shadowBlur = 0;
  ctx.font = `600 34px ${FONT_CN}`;
  ctx.fillStyle = PAL.parchment;
  ctx.fillText(`等级 ${g.player.level} · 探索 ${explored(g)}% · 用时 ${fmtTime(b.timeSec)}`, W / 2, 600);
  const cell = 46;
  const gap = 6;
  const mw = COLS * cell + (COLS - 1) * gap;
  miniMap(ctx, (i) => cellTag(g, i), (W - mw) / 2, 660, cell, gap, b.won);
  return c;
}

/** OG 预览图（1200×630）：示意盘面，用于 public/og.png */
export function drawOgImage(): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  backdrop(ctx, W, H);
  logo(ctx, 380, 300, 120);
  ctx.textAlign = 'center';
  ctx.font = `600 34px ${FONT_CN}`;
  ctx.fillStyle = PAL.parchment;
  setSpacing(ctx, 3);
  ctx.fillText('扫雷推理 × 地牢冒险', 380, 450);
  setSpacing(ctx, 0);
  // 从入口向上铺开的一片示意探索区（# = 已探索）
  const OG_MAP = [
    '.........',
    '.........',
    '##....#..',
    '###..###.',
    '###...##.',
    '##.....##',
    '#.......#',
    '##.####.#',
    '#########',
    '#########',
    '.########',
    '#########',
  ];
  const lit = (i: number): boolean => OG_MAP[cy(i)][cx(i)] === '#';
  miniMap(ctx, (i) => (inLair(cx(i), cy(i)) ? 'lair' : lit(i) ? 'lit' : 'dark'), 760, 45, 38, 6, false);
  return c;
}

/**
 * 应用图标：黑暗中一双龙眼，下方一排暗砖、正中一块被烛光照亮的数字砖。
 * full = 满版（maskable / apple-touch-icon 由系统裁圆角）；否则自带圆角。
 */
export function drawIcon(size: number, full: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const u = size / 100;
  if (!full) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 22 * u);
    ctx.clip();
  }
  ctx.fillStyle = PAL.abyss;
  ctx.fillRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(50 * u, 70 * u, 0, 50 * u, 70 * u, 55 * u);
  glow.addColorStop(0, 'rgba(255,150,50,0.28)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // 龙眼
  ctx.fillStyle = PAL.dragonEye;
  ctx.shadowColor = PAL.dragonFire;
  ctx.shadowBlur = 9 * u;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(50 * u + s * 15 * u, 34 * u, 10 * u, 4.2 * u, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = PAL.abyss;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(50 * u + s * 15 * u, 34 * u, 1.6 * u, 3.8 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 砖：两侧暗、正中亮
  const tw = 22 * u;
  const ty = 58 * u;
  for (let k = -1; k <= 1; k++) {
    const x = 50 * u + k * (tw + 3 * u) - tw / 2;
    ctx.beginPath();
    ctx.roundRect(x, ty, tw, tw, 3.5 * u);
    if (k === 0) {
      const g = ctx.createLinearGradient(0, ty, 0, ty + tw);
      g.addColorStop(0, '#FFD27A');
      g.addColorStop(1, '#C9782A');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(255,181,74,0.8)';
      ctx.shadowBlur = 8 * u;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#2B3243';
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,124,150,0.45)';
      ctx.lineWidth = 0.8 * u;
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#2A1606';
  ctx.font = `900 ${16 * u}px ${FONT_NUM}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('3', 50 * u, ty + tw / 2 + 1 * u);
  return c;
}

export function toBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}
