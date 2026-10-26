// In-game HUD (docs §6.4): HP cells, wave, score, pause, level badge, XP bar, boss bar, build strip.
// Reads game state every frame; writes the DOM only when a value changes; transform/opacity animations only.
import { config } from '../config';
import type { Game } from '../game/game';
import { UPGRADES, EVOLUTIONS } from '../game/upgrades';
import { UPGRADE_IDS, WEAPON_IDS } from '../types';
import type { EvolutionId, UpgradeId } from '../types';
import { el, onTap, TextSlot, hexCss, fmtInt } from './dom';
import { ICONS, UI_ICONS } from './icons';

export function slotHtml(id: UpgradeId, lv: number, evo: EvolutionId | null): { cls: string; html: string; color: string } {
  if (evo) {
    return { cls: 'bslot chamfer evo', html: ICONS[evo], color: hexCss(EVOLUTIONS[evo].color) };
  }
  const def = UPGRADES[id];
  let dots = '<span class="dots">';
  for (let i = 1; i <= 5; i++) dots += `<i class="${i <= lv ? 'on' : ''}"></i>`;
  dots += '</span>';
  return { cls: 'bslot chamfer', html: ICONS[id] + dots, color: hexCss(def.color) };
}

export function evoForMain(g: Game, id: UpgradeId): EvolutionId | null {
  for (const e of g.evolutions) if (EVOLUTIONS[e].main === id) return e;
  return null;
}

export class Hud {
  readonly root: HTMLElement;
  private hpBox: HTMLElement;
  private cells: HTMLElement[] = [];
  private hpNum: HTMLElement;
  private waveBox: HTMLElement;
  private waveLbl: TextSlot;
  private waveNumBox: HTMLElement;
  private waveNum: HTMLElement;
  private waveTot: TextSlot;
  private scoreEl: HTMLElement;
  private lvBox: HTMLElement;
  private lvNum: TextSlot;
  private xpBox: HTMLElement;
  private xpFill: HTMLElement;
  private xpGain: HTMLElement;
  private bossBox: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private bossTrail: HTMLElement;
  private bossTicks: HTMLElement;
  readonly build: HTMLElement;
  // state
  private shownHp = -1;
  private shownMax = -1;
  private hpText = '';
  private lowOn = false;
  private shownWave = -1;
  private shownBoss = false;
  private scoreV = 0;
  private scoreShown = -1;
  private lastScoreTarget = 0;
  private bumpT = 0;
  private shownLv = -1;
  private xpV = 0;
  private xpTarget = -1;
  private flashT = 0;
  private nearOn = false;
  private bossOn = false;
  private bossKey = '';
  private bossV = 1;
  private trailV = 1;
  private trailHold = 0;
  private buildSig = -1;
  private order: UpgradeId[] = [];

  constructor(parent: HTMLElement, onPause: () => void) {
    const r = el('div', 'hud off', parent);
    r.id = 'hud';
    this.root = r;
    el('div', 'hp-lbl lbl', r, 'HP');
    this.hpBox = el('div', 'hp', r);
    this.hpNum = el('div', 'hp-num num', r);
    const wave = el('div', 'wave', r);
    this.waveBox = wave;
    const lbl = el('span', 'lbl', wave);
    lbl.innerHTML = `<span class="skull">${UI_ICONS.skull}</span><span class="wl">WAVE</span>`;
    this.waveLbl = new TextSlot(lbl.querySelector('.wl') as HTMLElement);
    const w = el('div', 'w', wave);
    this.waveNumBox = el('span', '', w);
    this.waveNumBox.style.position = 'relative';
    this.waveNum = el('span', 'wn', this.waveNumBox, '01');
    this.waveTot = new TextSlot(el('span', 'wt', w, '/20'));
    const sc = el('div', 'score', r);
    el('span', 'lbl', sc, 'SCORE');
    this.scoreEl = el('span', 'sv num', sc, '0');
    const pause = el('button', 'pause chamfer ui press', r, UI_ICONS.pause);
    pause.dataset.testid = 'btn-pause';
    pause.setAttribute('aria-label', '暂停');
    onTap(pause, () => onPause());
    this.lvBox = el('div', 'lv', r);
    el('span', 'l', this.lvBox, 'LV');
    this.lvNum = new TextSlot(el('span', 'n', this.lvBox, '1'));
    this.xpBox = el('div', 'xp', r);
    this.xpGain = el('div', 'gain', this.xpBox);
    this.xpFill = el('div', 'fill', this.xpBox);
    el('div', 'sheen', this.xpBox);
    const boss = el('div', 'boss', r);
    this.bossBox = boss;
    this.bossName = el('div', 'bn', boss);
    const bar = el('div', 'bar', boss);
    this.bossTrail = el('div', 'tr', bar);
    this.bossFill = el('div', 'fl', bar);
    this.bossTicks = el('div', '', bar);
    this.build = el('div', 'build', r);
    this.build.dataset.testid = 'build-strip';
  }

  show(on: boolean): void {
    this.root.classList.toggle('off', !on);
  }

  /** full reset for a new run */
  reset(): void {
    this.shownHp = this.shownMax = -1;
    this.shownWave = -1;
    this.scoreV = 0;
    this.scoreShown = -1;
    this.lastScoreTarget = 0;
    this.shownLv = -1;
    this.xpV = 0;
    this.xpTarget = -1;
    this.xpFill.style.transform = this.xpGain.style.transform = 'scaleX(0)';
    this.nearOn = false;
    this.xpBox.classList.remove('near', 'flash');
    this.bossOn = false;
    this.bossBox.classList.remove('on');
    this.root.classList.remove('bossfight');
    this.buildSig = -1;
    this.order = [];
    this.build.innerHTML = '';
  }

  update(g: Game, realDt: number): void {
    this.updateHp(g);
    this.updateWave(g);
    this.updateScore(g, realDt);
    this.updateXp(g, realDt);
    this.updateBoss(g, realDt);
    this.updateBuild(g);
  }

  private updateHp(g: Game): void {
    const hp = g.player.hp;
    const max = g.stats.maxHp;
    if (max !== this.shownMax) {
      this.shownMax = max;
      this.hpBox.innerHTML = '';
      this.cells = [];
      // the cells never extend past x≈132, leaving ≥30 u of air before the centred wave block (any max HP)
      const gap = max > 12 ? 2 : 3;
      const w = Math.min(10, (118 - gap * (max - 1)) / max);
      this.hpBox.style.gap = gap + 'px';
      for (let i = 0; i < max; i++) {
        const c = el('div', 'cell', this.hpBox);
        c.style.width = w + 'px';
        this.cells.push(c);
      }
      // the number sits on the label row, right-aligned to the end of the cells (clear of the centred wave)
      this.hpNum.style.width = max * (w + gap) - gap + 'px';
      this.shownHp = -1;
    }
    if (hp !== this.shownHp) {
      const prev = this.shownHp;
      for (let i = 0; i < this.cells.length; i++) {
        const c = this.cells[i]!;
        const full = i < hp;
        c.classList.toggle('full', full);
        if (prev >= 0 && full && i >= prev) {
          c.classList.remove('gain');
          void c.offsetWidth;
          c.style.animationDelay = (i - prev) * 60 + 'ms';
          c.classList.add('gain');
        }
        if (prev >= 0 && !full && i < prev) this.shatterCell(c);
      }
      this.shownHp = hp;
      this.lowOn = false;
    }
    const low = hp <= config.player.lowHp && hp > 0;
    if (low !== this.lowOn) {
      this.lowOn = low;
      for (let i = 0; i < this.cells.length; i++) this.cells[i]!.classList.toggle('low', low && i < hp);
    }
    const t = `${hp}<i>/${max}</i>`;
    if (t !== this.hpText) {
      this.hpText = t;
      this.hpNum.innerHTML = t;
    }
  }

  private shatterCell(c: HTMLElement): void {
    const x = c.offsetLeft;
    for (const k of ['a', 'b']) {
      const s = el('div', 'shard ' + k, this.hpBox);
      s.style.left = x + 'px';
      s.style.top = '0px';
      s.style.width = c.style.width;
      window.setTimeout(() => s.remove(), 500);
    }
  }

  private updateWave(g: Game): void {
    const boss = g.boss !== null || g.phase === 'bossIntro' || g.phase === 'bossDeath';
    if (boss !== this.shownBoss) {
      this.shownBoss = boss;
      this.waveBox.classList.toggle('is-boss', boss);
      this.waveLbl.set(boss ? 'BOSS' : 'WAVE');
    }
    const w = g.wave;
    if (w !== this.shownWave) {
      const first = this.shownWave < 0;
      this.shownWave = w;
      const txt = w < 10 ? '0' + w : String(w);
      if (!first) {
        const old = this.waveNum;
        old.classList.add('out');
        window.setTimeout(() => old.remove(), 320);
        this.waveNum = el('span', 'wn in', this.waveNumBox, txt);
      } else this.waveNum.textContent = txt;
      this.waveTot.set(g.endless ? '∞' : '/20');
    }
  }

  private updateScore(g: Game, dt: number): void {
    const target = g.score;
    if (target - this.lastScoreTarget > 500) {
      this.scoreEl.classList.add('bump');
      this.bumpT = 0.18;
    }
    this.lastScoreTarget = target;
    if (this.bumpT > 0) {
      this.bumpT -= dt;
      if (this.bumpT <= 0) this.scoreEl.classList.remove('bump');
    }
    this.scoreV += (target - this.scoreV) * (1 - Math.exp(-8 * dt));
    if (Math.abs(target - this.scoreV) < 0.5) this.scoreV = target;
    const v = Math.round(this.scoreV);
    if (v !== this.scoreShown) {
      this.scoreShown = v;
      this.scoreEl.textContent = fmtInt(v);
    }
  }

  private updateXp(g: Game, dt: number): void {
    const lv = g.level;
    const frac = Math.min(1, g.xp / g.xpToNext());
    if (lv !== this.shownLv) {
      const first = this.shownLv < 0;
      this.shownLv = lv;
      this.lvNum.set(lv);
      if (!first) {
        this.lvBox.classList.remove('pop');
        void this.lvBox.offsetWidth;
        this.lvBox.classList.add('pop');
        this.xpBox.classList.add('flash');
        this.flashT = 0.3;
        this.xpV = 0;
        this.xpTarget = -1;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.xpBox.classList.remove('flash');
    }
    if (frac !== this.xpTarget) {
      this.xpTarget = frac;
      this.xpGain.style.transform = `scaleX(${frac.toFixed(4)})`;
    }
    const prev = this.xpV;
    this.xpV += (frac - this.xpV) * (1 - Math.exp(-14 * dt));
    if (Math.abs(frac - this.xpV) < 0.002) this.xpV = frac;
    if (this.xpV !== prev) this.xpFill.style.transform = `scaleX(${this.xpV.toFixed(4)})`;
    const near = frac > 0.85;
    if (near !== this.nearOn) {
      this.nearOn = near;
      this.xpBox.classList.toggle('near', near);
    }
  }

  private updateBoss(g: Game, dt: number): void {
    const b = g.boss;
    const on = !!b && b.state !== 'warn';
    if (on !== this.bossOn) {
      this.bossOn = on;
      this.bossBox.classList.toggle('on', on);
      this.root.classList.toggle('bossfight', on);
      if (on) {
        this.bossV = this.trailV = 1;
        this.bossFill.style.transform = this.bossTrail.style.transform = 'scaleX(1)';
      }
    }
    if (!b || !on) return;
    const key = b.kind;
    if (key !== this.bossKey) {
      this.bossKey = key;
      this.bossName.innerHTML = `<b>${b.name}</b><i>${b.en}</i>`;
      this.bossTicks.innerHTML = b.ticks.map((t) => `<span class="tick" style="left:${(t * 100).toFixed(1)}%"></span>`).join('');
    }
    const f = b.hpFrac();
    if (f < this.bossV - 1e-4) this.trailHold = 0.4;
    if (f !== this.bossV) {
      this.bossV = f;
      this.bossFill.style.transform = `scaleX(${f.toFixed(4)})`;
    }
    if (this.trailHold > 0) this.trailHold -= dt;
    else if (this.trailV > f) {
      this.trailV += (f - this.trailV) * (1 - Math.exp(-6 * dt));
      if (this.trailV - f < 0.001) this.trailV = f;
      this.bossTrail.style.transform = `scaleX(${this.trailV.toFixed(4)})`;
    } else if (this.trailV < f) {
      this.trailV = f;
      this.bossTrail.style.transform = `scaleX(${f.toFixed(4)})`;
    }
  }

  private updateBuild(g: Game): void {
    let sig = 0;
    for (let i = 0; i < UPGRADE_IDS.length; i++) sig = sig * 6 + g.levels[UPGRADE_IDS[i]!];
    sig = sig * 16 + (g.evolutions.has('supernova') ? 1 : 0) + (g.evolutions.has('absoluteZero') ? 2 : 0) + (g.evolutions.has('swarm') ? 4 : 0) + (g.evolutions.has('prismEcho') ? 8 : 0);
    if (sig === this.buildSig) return;
    const firstBuild = this.buildSig === -1;
    this.buildSig = sig;
    const fresh = new Set<string>();
    for (const id of UPGRADE_IDS) {
      if (g.levels[id] > 0 && !this.order.includes(id)) {
        this.order.push(id);
        if (!firstBuild) fresh.add(id);
      }
    }
    this.order = this.order.filter((id) => g.levels[id] > 0);
    // weapons first, then modules (acquisition order inside each group)
    const sorted = this.order.filter((id) => WEAPON_IDS.includes(id)).concat(this.order.filter((id) => !WEAPON_IDS.includes(id)));
    const prevEvo = new Set(Array.from(this.build.querySelectorAll('.bslot.evo')).map((e) => (e as HTMLElement).dataset.id ?? ''));
    this.build.innerHTML = '';
    for (const id of sorted) {
      const evo = evoForMain(g, id);
      const s = slotHtml(id, g.levels[id], evo);
      const d = el('div', s.cls, this.build, s.html);
      d.dataset.id = id;
      d.style.setProperty('--k', s.color);
      if (fresh.has(id) || (evo && !prevEvo.has(id) && !firstBuild)) d.classList.add('new');
    }
  }
}
