// DOM banners over the playfield (docs §5.2 rows 33/35/36/37/42/45/46, §6.9): wave sweep, WARNING marquee,
// boss name card, BOSS 击破 / VICTORY, combo milestones, LEVEL UP, 信号中断, resume countdown.
import { el, hexCss } from './dom';
import { EVOLUTIONS } from '../game/upgrades';
import { EVOLUTION_IDS } from '../types';

export class Banners {
  readonly root: HTMLElement;
  private live: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', '', parent);
    this.root.id = 'banners';
  }

  private add(cls: string, html: string, life: number, color?: string): HTMLElement {
    const b = el('div', 'banner ' + cls, this.root, html);
    if (color) b.style.setProperty('--k', color);
    this.live.push(b);
    window.setTimeout(() => {
      b.remove();
      const i = this.live.indexOf(b);
      if (i >= 0) this.live.splice(i, 1);
    }, life * 1000);
    return b;
  }

  clear(): void {
    for (const b of this.live) b.remove();
    this.live = [];
  }

  wave(n: number, endless: boolean): void {
    const num = n < 10 ? '0' + n : String(n);
    this.add('wave sweep', `<div class="bg"></div><div class="t">WAVE ${num}${endless ? '<small>无尽</small>' : ''}</div>`, 1.45);
  }

  warning(): void {
    this.add('warn', '<div class="stripe top"></div><div class="stripe bot"></div><div class="w">WARNING</div><div class="s">强敌接近</div>', 2.05);
  }

  nameCard(cn: string, en: string, color: number): void {
    this.add('name', `<div class="cn">${cn}</div><div class="en">${en}</div><div class="bar"></div>`, 2.25, hexCss(color));
  }

  big(t: string, s: string, color: string, life = 1.85): void {
    this.add('big', `<div class="t">${t}</div><div class="s">${s}</div>`, life, color);
  }

  evolution(idx: number): void {
    const id = EVOLUTION_IDS[idx];
    if (!id) return;
    const e = EVOLUTIONS[id];
    this.big(e.en, `进化：${e.name}`, '#ffc94d');
  }

  combo(m: number): void {
    const color = m >= 1000 ? '#ffffff' : m >= 250 ? '#ff2fd0' : m >= 100 ? '#ff7a1a' : '#b6ff2e';
    const label = m >= 1000 ? `${m / 1000}k` : `${m}`;
    this.add('combo', `<div class="t">${label} COMBO!</div>`, 0.95, color);
  }

  levelUp(): void {
    this.add('lvup', '<div class="t">LEVEL UP</div>', 0.95);
  }

  dead(): void {
    this.add('dead', '<div class="t">信号中断</div><div class="s">SIGNAL LOST</div>', 1.6);
  }

  ready(): void {
    this.add('ready', '<div class="t">准备好了！</div>', 1.15);
  }

  /** 3·2·1 over 1.2 s (real time), then cb */
  countdown(cb: () => void): () => void {
    const box = el('div', 'countdown', this.root);
    let n = 3;
    let timer = 0;
    const tick = (): void => {
      if (n === 0) {
        box.remove();
        cb();
        return;
      }
      box.innerHTML = `<span>${n}</span>`;
      n--;
      timer = window.setTimeout(tick, 400);
    };
    tick();
    return () => {
      window.clearTimeout(timer);
      box.remove();
    };
  }
}
