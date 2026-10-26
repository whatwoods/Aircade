// Desktop side panels (docs §6.10): shown when a gutter is ≥ 260 px wide. Left: build + recipe progress;
// right: score / best / time / max combo + key hints. Refreshed at 5 Hz, DOM only touched on change.
import type { Game } from '../game/game';
import { UPGRADES, EVOLUTIONS } from '../game/upgrades';
import { UPGRADE_IDS } from '../types';
import { el, TextSlot, fmtInt, fmtTime, hexCss } from './dom';
import { ICONS } from './icons';
import { evoForMain } from './hud';

export class SidePanels {
  private l: HTMLElement;
  private r: HTMLElement;
  private list: HTMLElement;
  private rcp: HTMLElement;
  private score: TextSlot;
  private best: TextSlot;
  private time: TextSlot;
  private combo: TextSlot;
  private sig = '';
  private t = 0;
  private on = false;
  bestScore = 0;

  constructor() {
    this.l = el('div', 'side', document.body);
    this.l.id = 'side-l';
    const lp = el('div', 'chamfer', this.l);
    el('span', 'lbl', lp, '构筑 · BUILD');
    this.list = el('div', '', lp);
    this.rcp = el('div', 'rcp', lp);
    this.r = el('div', 'side', document.body);
    this.r.id = 'side-r';
    const rp = el('div', 'chamfer', this.r);
    el('span', 'lbl', rp, '战况 · STATUS');
    const kv = (k: string): TextSlot => {
      const row = el('div', 'kv', rp);
      el('span', '', row, k);
      return new TextSlot(el('b', '', row));
    };
    this.score = kv('分数');
    this.best = kv('最高分');
    this.time = kv('用时');
    this.combo = kv('最大连击');
    el('div', 'keys', rp, '<kbd>←</kbd>/<kbd>→</kbd> 或 <kbd>A</kbd>/<kbd>D</kbd> 移动<br>鼠标跟随 · <kbd>P</kbd> 暂停<br>升级时 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 选卡 · <kbd>R</kbd> 刷新');
  }

  /** visible = scene allows it; side = free CSS px beside the column */
  update(g: Game, visible: boolean, side: number, realDt: number): void {
    const on = visible && side >= 260;
    if (on !== this.on) {
      this.on = on;
      this.l.classList.toggle('on', on);
      this.r.classList.toggle('on', on);
      this.t = 0;
    }
    if (!on) return;
    this.t -= realDt;
    if (this.t > 0) return;
    this.t = 0.2;
    this.score.set(fmtInt(g.score));
    this.best.set(fmtInt(Math.max(this.bestScore, g.score)));
    this.time.set(fmtTime(g.runTime));
    this.combo.set(fmtInt(g.maxCombo));
    let sig = '';
    for (const id of UPGRADE_IDS) sig += g.levels[id];
    for (const e of g.evolutions) sig += e;
    if (sig === this.sig) return;
    this.sig = sig;
    let html = '';
    for (const id of UPGRADE_IDS) {
      const lv = g.levels[id];
      if (lv <= 0) continue;
      const evo = evoForMain(g, id);
      const d = UPGRADES[id];
      const color = evo ? '#ffc94d' : hexCss(d.color);
      const icon = (evo ? ICONS[evo] : ICONS[id]).replace('<svg ', '<svg width="18" height="18" ');
      html += `<div class="si" style="--k:${color};color:${color}">${icon}<span style="color:var(--text)">${evo ? EVOLUTIONS[evo].name : d.name}</span><span class="lvv">${evo ? 'EVO' : 'Lv' + lv}</span></div>`;
    }
    this.list.innerHTML = html || '<div class="si" style="color:var(--dim)">尚未获得强化</div>';
    let rc = '';
    for (const e of Object.values(EVOLUTIONS)) {
      const a = g.levels[e.main];
      const b = g.levels[e.partner];
      if (g.evolutions.has(e.id)) rc += `<div class="ok">${e.name} ✓</div>`;
      else if (a > 0 || b > 0) rc += `<div>${e.name}　${UPGRADES[e.main].name} ${Math.min(5, a)}/5 · ${UPGRADES[e.partner].name} ${Math.min(3, b)}/3</div>`;
    }
    this.rcp.innerHTML = rc;
  }
}
