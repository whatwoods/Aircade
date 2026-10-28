/**
 * 新字卡（§8.6 / §6.7 ⑤）：底部 54% 高的宣纸卡片。大字 + 拼音、拆解图（变体朱色标注）、造字法印、
 * 形声的义符 / 声符、释义与构形依据（说文引文）、图鉴进度。最短显示 0.5 s 后点任意处关闭。
 */
import { CONFIG } from '../config.ts';
import { BASE_MAP, RECIPE_MAP } from '../core/recipes.ts';
import { RECIPES, type Struct } from '../data/hanzi.ts';
import { partBoxes } from '../render/compose.ts';
import { save } from '../save.ts';
import { btn, h } from './dom.ts';

export function structSvg(s: Struct, size = 22): string {
  const k = size;
  const box = `<rect x="1" y="1" width="${k - 2}" height="${k - 2}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
  const m = k / 2;
  let inner = '';
  switch (s) {
    case '⿰':
      inner = `<line x1="${m - 1}" y1="1" x2="${m - 1}" y2="${k - 1}" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    case '⿱':
      inner = `<line x1="1" y1="${m - 1}" x2="${k - 1}" y2="${m - 1}" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    case '⿴':
      inner = `<rect x="${k * 0.3}" y="${k * 0.3}" width="${k * 0.4}" height="${k * 0.4}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    case '⿵':
      inner = `<polyline points="${k * 0.3},${k - 1} ${k * 0.3},${k * 0.35} ${k * 0.7},${k * 0.35} ${k * 0.7},${k - 1}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    case '⿹':
      inner = `<polyline points="1,${k * 0.35} ${k * 0.65},${k * 0.35} ${k * 0.65},${k - 1}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    case '⿺':
      inner = `<polyline points="${k * 0.35},1 ${k * 0.35},${k * 0.65} ${k - 1},${k * 0.65}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    case '⿸':
      inner = `<polyline points="${k - 1},${k * 0.35} ${k * 0.35},${k * 0.35} ${k * 0.35},${k - 1}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
      break;
    default:
      inner = `<line x1="1" y1="${m}" x2="${k - 1}" y2="${m}" stroke="currentColor" stroke-width="1.4"/><line x1="${m}" y1="${m}" x2="${m}" y2="${k - 1}" stroke="currentColor" stroke-width="1.4"/>`;
  }
  return `<svg viewBox="0 0 ${k} ${k}" width="${k}" height="${k}" aria-hidden="true">${box}${inner}</svg>`;
}

const POS_NAME: Record<string, string> = { l: '左', r: '右', t: '上', b: '下' };

export class Card {
  private root: HTMLElement;
  private open = false;
  private shownAt = 0;
  private done: (() => void) | null = null;
  private briefTimer = 0;
  private brief: HTMLElement | null = null;
  onSound: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  isOpen(): boolean {
    return this.open;
  }

  show(ch: string, note: string, done: () => void, readOnly = false): void {
    const r = RECIPE_MAP.get(ch);
    if (!r) {
      done();
      return;
    }
    this.open = true;
    this.done = done;
    this.shownAt = performance.now();
    const scr = h('section', 'screen show overlay');
    scr.id = 'card';
    scr.setAttribute('role', 'dialog');
    scr.setAttribute('aria-label', `新字：${ch}`);
    const card = h('div', 'card');
    const big = h('div', 'big');
    big.append(h('div', 'ch kai', r.c), h('div', 'py kai', r.py));
    const right = h('div', 'right');
    const decomp = h('div', 'decomp');
    const boxes = partBoxes(r);
    const vnames: string[] = [];
    r.parts.forEach((p, i) => {
      const show = boxes[i]?.show ?? p;
      const span = h('span', show !== p ? 'v kai' : 'kai', show);
      decomp.append(span);
      if (show !== p) {
        const b = BASE_MAP.get(p);
        const pos = (Object.entries(b?.v ?? {}).find(([, v]) => v === show)?.[0] ?? 'l') as string;
        vnames.push(`${p}在${POS_NAME[pos] ?? ''}写作「${show}」${b?.vn ? '（' + b.vn + '）' : ''}`);
      } else {
        const b = BASE_MAP.get(p);
        if (b?.v && Object.values(b.v).includes('') && (r.s === '⿱' && i === 0)) vnames.push(`${p}在上时压扁书写${b.vn ? '（' + b.vn + '）' : ''}`);
      }
      if (i < r.parts.length - 1) {
        const op = h('span', 'op');
        op.innerHTML = i === 0 ? structSvg(r.s, 20) : '';
        decomp.append(op);
      }
    });
    const vn = h('div', 'vname', vnames.join('；'));
    const tags = h('div', 'tags');
    tags.append(h('span', 'tag kai', r.t));
    if (r.t === '形声' && r.ph !== undefined) {
      const sem = r.parts.filter((_, i) => i !== r.ph).join('');
      tags.append(h('span', 'tag light', `${sem}表义 · ${r.parts[r.ph]}表音`));
    }
    if (r.tr) tags.append(h('span', 'tag light', `繁体 ${r.tr}`));
    right.append(decomp, vn, tags);
    const gloss = h('div', 'gloss', r.g);
    const basis = h('div', 'basis', r.basis);
    const foot = h('div', 'foot');
    const got = RECIPES.filter((x) => save.atlas.has(x.c)).length;
    foot.append(h('span', 'count', `图鉴 · 已收 ${got} / ${RECIPES.length}`));
    foot.append(btn('primary kai', readOnly ? '收起' : '收入图鉴', () => this.close(true)));
    card.append(big, right, gloss, basis);
    if (note) card.append(h('div', 'note', note));
    card.append(foot);
    scr.append(card);
    scr.addEventListener('pointerup', () => this.close(false));
    this.root.append(scr);
    this.onSound?.();
  }

  close(force: boolean): void {
    if (!this.open) return;
    if (!force && performance.now() - this.shownAt < CONFIG.card.minShowMs) return;
    if (force && performance.now() - this.shownAt < CONFIG.card.minShowMs) return;
    this.open = false;
    document.getElementById('card')?.remove();
    const d = this.done;
    this.done = null;
    d?.();
  }

  /** 简要模式：顶部横条 2 s，不暂停 */
  showBrief(ch: string): void {
    const r = RECIPE_MAP.get(ch);
    if (!r) return;
    this.brief?.remove();
    clearTimeout(this.briefTimer);
    const b = h('div', 'brief');
    b.append(h('span', 'ch kai', r.c), h('span', 'kai', r.py), h('span', 'tag kai', r.t), h('span', '', r.g));
    this.root.append(b);
    this.brief = b;
    this.briefTimer = window.setTimeout(() => {
      b.remove();
      if (this.brief === b) this.brief = null;
    }, 2000);
  }
}
