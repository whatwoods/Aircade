// Results (docs §4.6 E, §6.7): slide-up panel, 1.2 s score roll with ticks, staggered stat rows, build strip,
// NEW RECORD stamp, retry / title / endless.
import type { Game } from '../game/game';
import { UPGRADE_IDS } from '../types';
import { el, onTap, fmtInt, fmtTime } from './dom';
import { slotHtml, evoForMain } from './hud';
import { UI_ICONS } from './icons';

export interface ResultData {
  victory: boolean;
  endless: boolean;
  score: number;
  /** best score before this run */
  best: number;
  newRecord: boolean;
  wave: number;
  time: number;
  maxCombo: number;
  bricks: number;
  bosses: number;
  level: number;
}

export class ResultsPanel {
  readonly root: HTMLElement;
  private inner: HTMLElement;
  private scoreEl!: HTMLElement;
  private raf = 0;
  private timers: number[] = [];
  isOpen = false;

  constructor(
    parent: HTMLElement,
    private g: Game,
    private h: { retry: () => void; title: () => void; endless: () => void; tick: () => void; record: () => void },
  ) {
    const r = el('div', 'overlay hidden', parent);
    r.id = 'results';
    this.root = r;
    el('div', 'mask', r);
    const p = el('div', 'panel chamfer ui', r);
    this.inner = el('div', 'inner', p);
  }

  open(d: ResultData): void {
    this.isOpen = true;
    this.clearTimers();
    const r = this.root;
    r.classList.toggle('win', d.victory);
    r.classList.remove('rec');
    const rows: [string, string][] = [
      ['到达波数', d.endless ? `无尽 · 第 ${d.wave} 波` : `${d.wave} / 20`],
      ['用时', fmtTime(d.time)],
      ['最大连击', fmtInt(d.maxCombo)],
      ['击碎砖块', fmtInt(d.bricks)],
      ['击破 Boss', String(d.bosses)],
      ['等级', String(d.level)],
    ];
    let build = '';
    for (const id of UPGRADE_IDS) {
      const lv = this.g.levels[id];
      if (lv <= 0) continue;
      const s = slotHtml(id, lv, evoForMain(this.g, id));
      build += `<div class="${s.cls}" style="--k:${s.color}">${s.html}</div>`;
    }
    this.inner.innerHTML =
      `<div class="rt"><div class="bgw">${d.victory ? 'VICTORY' : 'GAME OVER'}</div><div class="fg">${d.victory ? '通关' : '信号中断'}</div></div>` +
      `<div class="endl">${d.endless ? 'ENDLESS · 无尽模式' : ''}</div>` +
      `<div class="sc"><div class="lbl">SCORE</div><div class="v">0</div><div class="best">最高分 <b>${fmtInt(d.best)}</b></div></div>` +
      `<div class="stamp">新纪录！</div>` +
      `<div class="rows">${rows.map(([k, v]) => `<div class="rr"><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
      `<div class="bstrip">${build}</div>` +
      `<div class="btns"></div>`;
    const btns = this.inner.querySelector('.btns') as HTMLElement;
    if (d.victory && !d.endless) {
      const e = el('button', 'btn gold chamfer press', btns, `${UI_ICONS.infinity}<span>进入无尽</span>`);
      e.dataset.testid = 'btn-endless';
      onTap(e, () => this.h.endless());
    }
    const retry = el('button', 'btn primary chamfer retry press', btns, `${UI_ICONS.retry}<span>再来一局</span>`);
    retry.dataset.testid = 'btn-retry';
    onTap(retry, () => this.h.retry());
    const title = el('button', 'btn chamfer press', btns, `${UI_ICONS.home}<span>返回标题</span>`);
    title.dataset.testid = 'btn-title';
    onTap(title, () => this.h.title());
    this.scoreEl = this.inner.querySelector('.sc .v') as HTMLElement;
    r.classList.remove('hidden', 'leaving');
    void r.offsetWidth;
    r.classList.add('on');
    // score roll 1.2 s (easeOutCubic) with ticks
    const t0 = performance.now() + 250;
    let lastTick = 0;
    let stamped = false;
    const bestEl = this.inner.querySelector('.sc .best b') as HTMLElement;
    const roll = (now: number): void => {
      const p = Math.max(0, Math.min(1, (now - t0) / 1200));
      const e = 1 - Math.pow(1 - p, 3);
      const v = d.score * e;
      this.scoreEl.textContent = fmtInt(v);
      // new record: the old best stays up until the roll passes it, then the stamp lands
      if (d.newRecord && !stamped && (v > d.best || p >= 1)) {
        stamped = true;
        bestEl.textContent = fmtInt(d.score);
        this.timers.push(window.setTimeout(() => this.celebrate(), 120));
      }
      if (p > 0 && p < 1 && now - lastTick > 70) {
        lastTick = now;
        this.h.tick();
      }
      if (p < 1) this.raf = requestAnimationFrame(roll);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(roll);
    const rr = this.inner.querySelectorAll('.rr');
    rr.forEach((row, i) => this.timers.push(window.setTimeout(() => row.classList.add('in'), 450 + i * 90)));
  }

  private celebrate(): void {
    (this.inner.querySelector('.stamp') as HTMLElement).classList.add('go');
    this.root.classList.add('rec');
    this.h.record();
    // neon confetti in the DOM, above the opaque panel (the WebGL burst sits behind it)
    const layer = el('div', 'confetti', this.root);
    const cols = ['#2ee6ff', '#ff2fd0', '#ffc94d', '#b6ff2e', '#8a5cff', '#ffffff'];
    for (let i = 0; i < 46; i++) {
      const c = el('i', '', layer);
      const x = 40 + Math.random() * 310;
      const dx = (Math.random() - 0.5) * 120;
      c.style.cssText = `left:${x}px;top:${150 + Math.random() * 60}px;background:${cols[i % cols.length]};--dx:${dx}px;--dy:${380 + Math.random() * 260}px;--r:${(Math.random() - 0.5) * 900}deg;animation-delay:${Math.random() * 0.25}s;animation-duration:${1.4 + Math.random() * 0.9}s;width:${4 + Math.random() * 4}px;height:${6 + Math.random() * 6}px`;
    }
    this.timers.push(window.setTimeout(() => layer.remove(), 2800));
  }

  private clearTimers(): void {
    this.root.querySelectorAll('.confetti').forEach((n) => n.remove());
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.clearTimers();
    this.root.classList.add('leaving');
    this.root.classList.remove('on');
    window.setTimeout(() => {
      if (!this.isOpen) this.root.classList.add('hidden');
      this.root.classList.remove('leaving');
    }, 180);
  }
}
