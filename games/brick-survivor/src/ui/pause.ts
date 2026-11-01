// Pause panel (docs §6.6): build details, element cycle, recipe progress, run stats, resume / restart /
// settings / title (restart and title need a second tap to confirm).
import type { Game } from '../game/game';
import { UPGRADES, EVOLUTIONS, summary } from '../game/upgrades';
import { UPGRADE_IDS } from '../types';
import type { ElementId } from '../types';
import { el, onTap, fmtInt, fmtTime } from './dom';
import { slotHtml, evoForMain } from './hud';
import { UI_ICONS } from './icons';

const ELEM_NAMES: Record<ElementId, string> = { none: '无属性', fire: '燃烧', ice: '冰冻', blast: '爆炸', nova: '新星' };

export function confirmButton(b: HTMLElement, label: string, confirmLabel: string, fn: () => void): () => void {
  let armed = 0;
  const reset = (): void => {
    armed = 0;
    b.classList.remove('confirm');
    b.innerHTML = `<span>${label}</span>`;
  };
  reset();
  onTap(b, () => {
    if (armed) {
      window.clearTimeout(armed);
      reset();
      fn();
      return;
    }
    b.classList.add('confirm');
    b.innerHTML = `<span>${confirmLabel}</span>`;
    armed = window.setTimeout(reset, 2600);
  });
  return () => {
    if (armed) window.clearTimeout(armed);
    reset();
  };
}

export class PausePanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  isOpen = false;
  private resets: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    private g: Game,
    h: { resume: () => void; restart: () => void; settings: () => void; title: () => void },
  ) {
    const r = el('div', 'overlay hidden', parent);
    r.id = 'pause';
    this.root = r;
    el('div', 'mask', r);
    const p = el('div', 'panel chamfer ui', r);
    const inner = el('div', 'inner', p);
    el('div', 'ptitle', inner, '已暂停');
    this.body = el('div', '', inner);
    const btns = el('div', 'btns', inner);
    const resume = el('button', 'btn primary chamfer wide press', btns, `${UI_ICONS.play}<span>继续</span>`);
    resume.dataset.testid = 'btn-resume';
    onTap(resume, () => h.resume());
    const restart = el('button', 'btn chamfer press', btns);
    restart.dataset.testid = 'btn-restart';
    this.resets.push(confirmButton(restart, '重新开始', '确认重开？', () => h.restart()));
    const set = el('button', 'btn chamfer press', btns, '<span>设置</span>');
    set.dataset.testid = 'btn-pause-settings';
    onTap(set, () => h.settings());
    const title = el('button', 'btn chamfer press wide', btns);
    title.dataset.testid = 'btn-pause-title';
    title.style.height = '44px';
    title.style.fontSize = '13px';
    this.resets.push(confirmButton(title, '返回标题', '确认返回标题？', () => h.title()));
  }

  open(): void {
    this.isOpen = true;
    for (const r of this.resets) r();
    this.render();
    this.root.classList.remove('hidden', 'leaving');
    void this.root.offsetWidth;
    this.root.classList.add('on');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('leaving');
    this.root.classList.remove('on');
    window.setTimeout(() => {
      if (!this.isOpen) this.root.classList.add('hidden');
      this.root.classList.remove('leaving');
    }, 180);
  }

  private render(): void {
    const g = this.g;
    let list = '';
    for (const id of UPGRADE_IDS) {
      const lv = g.levels[id];
      if (lv <= 0) continue;
      const evo = evoForMain(g, id);
      const s = slotHtml(id, lv, evo);
      const nm = evo ? EVOLUTIONS[evo].name : UPGRADES[id].name;
      const sm = evo ? '已进化' : summary(id, lv);
      list += `<div class="bi" style="--k:${s.color}"><div class="${s.cls}">${s.html}</div><span class="nm">${nm}</span><span class="lv">${evo ? 'EVO' : 'Lv' + lv}</span><span class="sm">${sm}</span></div>`;
    }
    if (!list) list = '<div class="empty">尚未获得强化</div>';
    const cyc = g.elementCycle.length ? g.elementCycle.map((e) => ELEM_NAMES[e]).join(' → ') : '无属性';
    let rec = '';
    for (const e of Object.values(EVOLUTIONS)) {
      const a = g.levels[e.main];
      const b = g.levels[e.partner];
      if (g.evolutions.has(e.id)) rec += `<div class="ok">${e.name} ✓</div>`;
      else if (a > 0 || b > 0) rec += `<div>${e.name}：${UPGRADES[e.main].name} ${Math.min(5, a)}/5 · ${UPGRADES[e.partner].name} ${Math.min(3, b)}/3</div>`;
    }
    if (!rec) rec = '<div style="color:var(--dim)">拥有配方中的强化后显示进度</div>';
    this.body.innerHTML =
      `<div class="sec"><span class="lbl">构筑</span><div class="blist">${list}</div></div>` +
      `<div class="sec"><span class="lbl">元素轮换</span><div class="cycle">${cyc}</div></div>` +
      `<div class="sec"><span class="lbl">进化配方</span><div class="recipes">${rec}</div></div>` +
      `<div class="sec"><span class="lbl">本局数据</span><div class="stats">` +
      `<div>用时<b>${fmtTime(g.runTime)}</b></div><div>分数<b>${fmtInt(g.score)}</b></div>` +
      `<div>波次<b>${g.wave}${g.endless ? '' : '/20'}</b></div><div>等级<b>${g.level}</b></div>` +
      `</div><div class="seed">SEED ${g.seed}</div></div>`;
  }
}
