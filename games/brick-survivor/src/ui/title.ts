// Title screen (docs §4.6 A, §6.2): the DOM is inlined in index.html so it paints before the bundle; this wires
// icons, the best-score badge, letter power-on + random flicker, the busy spinner and the three ghost buttons.
import { settings, setSetting } from '../core/settings';
import type { BestRecord } from '../core/storage';
import { byId, onTap, fmtInt } from './dom';
import { UI_ICONS } from './icons';

export class TitleScreen {
  readonly root: HTMLElement;
  private startBtn: HTMLElement;
  private soundBtn: HTMLElement;
  private badge: HTMLElement;
  private foot: HTMLElement;
  private letters: HTMLElement[];
  private flickerT = 3;
  private visible = false;
  private litTimer = 0;

  constructor(h: { start: () => void; settings: () => void; tutorial: () => void }) {
    this.root = byId('title');
    this.startBtn = byId('btn-start');
    this.soundBtn = byId('btn-sound');
    this.badge = byId('best-badge');
    this.foot = byId('title-foot');
    this.letters = Array.from(this.root.querySelectorAll<HTMLElement>('.ch'));
    byId('btn-settings').innerHTML = UI_ICONS.settings;
    byId('btn-tutorial').innerHTML = UI_ICONS.tutorial;
    this.syncSound();
    onTap(this.startBtn, () => h.start());
    onTap(byId('btn-settings'), () => h.settings());
    onTap(byId('btn-tutorial'), () => h.tutorial());
    onTap(this.soundBtn, () => {
      const on = !(settings.sfx || settings.music);
      setSetting('sfx', on);
      setSetting('music', on);
      this.syncSound();
    });
  }

  syncSound(): void {
    const on = settings.sfx || settings.music;
    this.soundBtn.innerHTML = on ? UI_ICONS.soundOn : UI_ICONS.soundOff;
    this.soundBtn.classList.toggle('off', !on);
    this.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  setBest(b: BestRecord | null): void {
    this.badge.innerHTML = b && b.score > 0
      ? `<span>最高分 <b>${fmtInt(b.score)}</b> <i>·</i> ${b.victory ? '<b>通关</b>' : `第 ${b.wave} 波`}</span>`
      : '<span>首次出击</span>';
  }

  setFoot(seed: number | null): void {
    this.foot.textContent = seed === null ? 'AIRCADE · v1.0' : `AIRCADE · v1.0 · SEED ${seed}`;
  }

  setBusy(on: boolean): void {
    this.startBtn.classList.toggle('busy', on);
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (on) {
      // restart the power-on sequence
      this.root.classList.remove('on', 'lit');
      void this.root.offsetWidth;
      this.root.classList.add('on');
      window.clearTimeout(this.litTimer);
      this.litTimer = window.setTimeout(() => this.root.classList.add('lit'), 1500);
      this.flickerT = 3;
      this.syncSound();
    }
  }

  /** random "loose tube" flicker: one letter blinks twice every few seconds */
  update(realDt: number): void {
    if (!this.visible || !this.root.classList.contains('lit')) return;
    this.flickerT -= realDt;
    if (this.flickerT > 0) return;
    this.flickerT = 2.5 + Math.random() * 3.5;
    const l = this.letters[Math.floor(Math.random() * this.letters.length)];
    if (!l) return;
    l.classList.remove('flicker');
    void l.offsetWidth;
    l.classList.add('flicker');
    window.setTimeout(() => l.classList.remove('flicker'), 360);
  }
}
