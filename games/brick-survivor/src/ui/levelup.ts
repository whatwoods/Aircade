// Level-up three-choice panel (docs §6.5): staggered cards, 350 ms input lock, fresh pointerdown+up to pick,
// reroll flip, keyboard 1/2/3/R, evolution cards with rotating gold edge.
import { config, pal } from '../config';
import type { Game } from '../game/game';
import { UPGRADES, EVOLUTIONS, describe } from '../game/upgrades';
import { recipeHint } from '../game/offers';
import type { Card, EvolutionId, UpgradeId } from '../types';
import { el, onTap, hexCss } from './dom';
import { ICONS, HEX_FRAME } from './icons';

const CARD_Y = [228, 374, 520];

export class LevelUpPanel {
  readonly root: HTMLElement;
  private head: HTMLElement;
  private more: HTMLElement;
  private cardEls: HTMLElement[] = [];
  private rerollBtn: HTMLButtonElement;
  private lockedUntil = 0;
  isOpen = false;
  private busy = false;
  cards: Card[] = [];
  onPick: (i: number) => void = () => {};
  onReroll: () => void = () => {};

  constructor(parent: HTMLElement, private g: Game) {
    const r = el('div', 'overlay hidden', parent);
    r.id = 'levelup';
    this.root = r;
    el('div', 'mask', r);
    this.head = el('div', 'head', r, '<div class="t">LEVEL UP</div><div class="s">选择一项强化</div>');
    this.more = el('div', 'more hidden', this.head);
    for (let i = 0; i < 3; i++) {
      const c = el('button', 'card chamfer ui', r);
      c.dataset.testid = 'card-' + i;
      c.style.top = CARD_Y[i] + 'px';
      onTap(c, () => this.pick(i), () => this.canPick());
      this.cardEls.push(c);
    }
    this.rerollBtn = el('button', 'reroll btn chamfer ui press', r) as HTMLButtonElement;
    this.rerollBtn.dataset.testid = 'btn-reroll';
    onTap(this.rerollBtn, () => this.reroll(), () => this.canPick());
  }

  private canPick(): boolean {
    return this.isOpen && !this.busy && performance.now() >= this.lockedUntil;
  }

  open(cards: Card[], pending: number): void {
    this.cards = cards;
    this.isOpen = true;
    this.busy = false;
    this.root.classList.remove('hidden', 'leaving');
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.more.classList.toggle('hidden', pending <= 1);
    this.more.textContent = '+' + pending;
    this.fill(false);
    this.updateReroll();
    this.lockedUntil = performance.now() + config.levelup.inputLockMs;
  }

  private updateReroll(): void {
    const n = this.g.rerolls;
    this.rerollBtn.innerHTML = `<span>刷新 ×${n}</span>`;
    this.rerollBtn.disabled = n <= 0;
  }

  private fill(flip: boolean): void {
    for (let i = 0; i < 3; i++) {
      const c = this.cardEls[i]!;
      const card = this.cards[i];
      c.className = 'card chamfer ui';
      c.style.removeProperty('--fly');
      if (!card) {
        c.classList.add('hidden');
        continue;
      }
      this.render(c, card);
      if (flip) {
        c.classList.add('in', 'flip');
      } else {
        c.classList.remove('in');
        window.setTimeout(() => c.classList.add('in'), 30 + i * config.levelup.cardStagger * 1000);
      }
    }
  }

  private render(c: HTMLElement, card: Card): void {
    let name = '';
    let en = '';
    let color = pal.uiText as number;
    let desc = '';
    let tag = '';
    let recipe = '';
    let icon = '';
    let from = card.from;
    let to = card.to;
    if (card.kind === 'evolution') {
      const e = EVOLUTIONS[card.id as EvolutionId];
      name = e.name;
      en = e.en;
      color = pal.gold;
      desc = e.desc;
      tag = '进化';
      recipe = `⛓ ${UPGRADES[e.main].name} Lv5 + ${UPGRADES[e.partner].name} Lv3`;
      icon = ICONS[e.id];
      from = to = -1;
      c.classList.add('evo');
    } else if (card.kind === 'battery') {
      name = '能量电池';
      en = 'BATTERY';
      color = pal.heal;
      desc = `回复 ${config.fillers.batteryHeal} 点生命`;
      tag = '补给';
      icon = ICONS.battery;
      from = to = -1;
    } else if (card.kind === 'cache') {
      name = '数据缓存';
      en = 'DATA CACHE';
      color = pal.gold;
      desc = `立即获得 ${config.fillers.cachePerWave * this.g.wave} 分`;
      tag = '补给';
      icon = ICONS.cache;
      from = to = -1;
    } else {
      const id = card.id as UpgradeId;
      const d = UPGRADES[id];
      name = d.name;
      en = d.en;
      color = d.color;
      desc = describe(id, card.to);
      tag = d.tag;
      recipe = recipeHint(this.g, id) ?? '';
      icon = ICONS[id];
    }
    c.style.setProperty('--k', hexCss(color));
    let dots = '';
    if (to > 0) {
      dots = '<div class="lvrow">';
      for (let k = 1; k <= 5; k++) dots += `<span class="d ${k <= from ? 'on' : k === to ? 'nx' : ''}"></span>`;
      dots += `<span class="lt">${from === 0 ? '<em>NEW</em>' : `Lv${from} → <em>${to}</em>`}</span></div>`;
    }
    c.innerHTML =
      (card.kind === 'evolution' ? '<span class="ring"></span><span class="rib">进化</span>' : '') +
      `<div class="hexf">${HEX_FRAME}${icon.replace('<svg ', '<svg class="ic" ')}</div>` +
      `<div class="nm"><b>${name}</b><i>${en}</i></div>` +
      dots +
      `<div class="ds">${desc}</div>` +
      `<div class="tg"><span class="tag">${tag}</span>${recipe ? `<span class="rc">${recipe}</span>` : ''}</div>`;
    if (to <= 0) (c.querySelector('.ds') as HTMLElement).style.top = '48px';
  }

  /** pick card i (force = debug pickCard, ignores the lock) */
  pick(i: number, force = false): void {
    if (!this.isOpen || this.busy) return;
    if (!force && !this.canPick()) return;
    if (!this.cards[i]) return;
    this.busy = true;
    const c = this.cardEls[i]!;
    c.style.setProperty('--fly', `${822 - (CARD_Y[i]! + 66)}px`);
    c.classList.add('picked');
    for (let k = 0; k < 3; k++) if (k !== i) this.cardEls[k]!.classList.add('sink');
    this.onPick(i);
  }

  reroll(): void {
    if (!this.isOpen || this.busy || this.g.rerolls <= 0) return;
    this.onReroll();
  }

  /** replace cards after a reroll (flip animation) */
  replace(cards: Card[]): void {
    this.cards = cards;
    this.fill(true);
    this.updateReroll();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('leaving');
    this.root.classList.remove('on');
    window.setTimeout(() => {
      if (!this.isOpen) this.root.classList.add('hidden');
      this.root.classList.remove('leaving');
    }, 200);
  }

  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Digit1' || code === 'Numpad1') this.pick(0);
    else if (code === 'Digit2' || code === 'Numpad2') this.pick(1);
    else if (code === 'Digit3' || code === 'Numpad3') this.pick(2);
    else if (code === 'KeyR') this.reroll();
    else return false;
    return true;
  }
}
