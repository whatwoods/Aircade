/** 标题、暂停、设置、结算、关卡小结（docs §6.2 / §6.6–6.8） */
import { settings, saveSettings } from '../core/storage';
import { ballSprites } from '../render/ballArt';
import { fmt, shortStage, templeName } from './hud';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface ScreenHandlers {
  start(): void;
  howto(): void;
  resume(): void;
  restart(): void;
  home(): void;
  again(): void;
  retutorial(): void;
  clearRecords(): void;
  settingsChanged(): void;
  summaryNext(): void;
  click(): void;
}

export function showOverlay(el: HTMLElement, on: boolean): void {
  if (on) {
    el.classList.add('show');
    void el.offsetWidth;
    el.classList.add('vis');
  } else if (el.classList.contains('show')) {
    el.classList.remove('vis');
    window.setTimeout(() => {
      if (!el.classList.contains('vis')) el.classList.remove('show');
    }, 220);
  }
}

export class Screens {
  readonly title = $('title');
  readonly pause = $('pause');
  readonly settingsEl = $('settings');
  readonly results = $('results');
  readonly summary = $('summary');
  private h: ScreenHandlers;
  private clearArmed = 0;
  settingsFrom: 'title' | 'pause' = 'title';
  private resTarget = 0;
  private resShown = 0;
  private resActive = false;
  private resRecord = false;
  private stampDone = false;
  private sumTimers: number[] = [];

  constructor(h: ScreenHandlers) {
    this.h = h;
    const on = (id: string, fn: () => void): void => {
      const el = $(id);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        h.click();
        fn();
      });
    };
    on('btn-start', () => h.start());
    on('btn-howto', () => h.howto());
    on('btn-title-settings', () => this.openSettings('title'));
    on('btn-resume', () => h.resume());
    on('btn-restart', () => h.restart());
    on('btn-home', () => h.home());
    on('btn-pause-settings', () => this.openSettings('pause'));
    on('btn-again', () => h.again());
    on('btn-res-home', () => h.home());
    on('btn-set-done', () => this.closeSettings());
    on('btn-retut', () => {
      this.closeSettings();
      h.retutorial();
    });
    on('btn-clear', () => {
      const b = $('btn-clear');
      if (performance.now() - this.clearArmed < 3000) {
        h.clearRecords();
        b.textContent = '纪录已清除';
        this.clearArmed = 0;
      } else {
        this.clearArmed = performance.now();
        b.textContent = '再点一次确认清除';
      }
    });
    const toggle = (id: string, key: 'sfx' | 'music' | 'loupe'): void => {
      on(id, () => {
        settings[key] = !settings[key];
        saveSettings();
        this.syncSettings();
        h.settingsChanged();
      });
    };
    toggle('set-sfx', 'sfx');
    toggle('set-music', 'music');
    toggle('set-loupe', 'loupe');
    $('set-shake').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        h.click();
        settings.shake = Number(b.dataset.v) as 0 | 1 | 2;
        saveSettings();
        this.syncSettings();
        h.settingsChanged();
      });
    });
    this.summary.addEventListener('click', (e) => {
      e.stopPropagation();
      h.summaryNext();
    });
    // 按钮按下下沉（触摸）
    document.querySelectorAll<HTMLElement>('.stone-btn').forEach((b) => {
      b.addEventListener('pointerdown', () => b.classList.add('pressed'));
      const up = (): void => b.classList.remove('pressed');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    });
    this.syncSettings();
  }

  syncSettings(): void {
    const set = (id: string, v: boolean): void => $(id).setAttribute('aria-checked', String(v));
    set('set-sfx', settings.sfx);
    set('set-music', settings.music);
    set('set-loupe', settings.loupe);
    $('set-shake').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === settings.shake));
  }

  showTitle(on: boolean, best: number, bestStage: number): void {
    this.title.classList.toggle('show', on);
    if (on) {
      $('title-best').textContent = best > 0 ? `最高分 ${fmt(best)} · 最远 ${shortStage(Math.max(1, bestStage))}` : '首次游玩有约 30 秒的上手引导';
      window.setTimeout(() => $('btn-start').focus({ preventScroll: true }), 50);
    }
  }

  openSettings(from: 'title' | 'pause'): void {
    this.settingsFrom = from;
    this.clearArmed = 0;
    $('btn-clear').textContent = '清除纪录';
    this.syncSettings();
    showOverlay(this.settingsEl, true);
  }

  closeSettings(): void {
    showOverlay(this.settingsEl, false);
  }

  get settingsOpen(): boolean {
    return this.settingsEl.classList.contains('vis');
  }

  showPause(on: boolean, info?: { stage: number; seal: string; seals: number; quota: number; score: number }): void {
    if (on && info) {
      $('pause-info').innerHTML = `${templeName(info.stage)}<br>金印 <b>${info.seal}</b> · 已封印 <b>${info.seals} / ${info.quota}</b> · 分数 <b>${fmt(info.score)}</b>`;
      this.drawCodex();
    }
    showOverlay(this.pause, on);
    if (on) window.setTimeout(() => $('btn-resume').focus({ preventScroll: true }), 50);
  }

  get pauseOpen(): boolean {
    return this.pause.classList.contains('vis');
  }

  drawCodex(): void {
    const c = $<HTMLCanvasElement>('codex');
    const k = 2;
    if (c.width !== 300 * k) {
      c.width = 300 * k;
      c.height = 84 * k;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, 300, 84);
    for (let l = 1; l <= 11; l++) {
      const row = l <= 6 ? 0 : 1;
      const col = row === 0 ? l - 1 : l - 7;
      const x = row === 0 ? 25 + col * 50 : 50 + col * 50;
      const y = 21 + row * 42;
      const sp = ballSprites(l);
      const s = 56 * 0.92;
      g.drawImage(sp.body, x - s / 2, y - s / 2, s, s);
      g.drawImage(sp.shade, x - s / 2, y - s / 2, s, s);
      g.drawImage(sp.num, x - s / 2, y - s / 2, s, s);
    }
  }

  showResults(on: boolean, r?: { score: number; best: number; record: boolean; stage: number; longest: number; seals: number; merges: number; time: number; seed: number | null }): void {
    if (on && r) {
      this.resTarget = r.score;
      this.resShown = 0;
      this.resActive = true;
      this.resRecord = r.record;
      this.stampDone = false;
      $('res-score').textContent = '0';
      $('res-stamp').classList.remove('show');
      $('res-best').textContent = `最高分 ${fmt(r.best)}`;
      $('res-stage').textContent = shortStage(r.stage);
      $('res-long').textContent = String(r.longest);
      $('res-seals').textContent = String(r.seals);
      $('res-merges').textContent = String(r.merges);
      const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60);
      $('res-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
      $('res-seed-wrap').style.visibility = r.seed !== null ? 'visible' : 'hidden';
      $('res-seed').textContent = r.seed !== null ? String(r.seed) : '—';
      window.setTimeout(() => $('btn-again').focus({ preventScroll: true }), 80);
    } else this.resActive = false;
    showOverlay(this.results, on);
  }

  get resultsOpen(): boolean {
    return this.results.classList.contains('show');
  }

  /** 返回 true 表示此帧新纪录印章落下 */
  update(dt: number): boolean {
    if (!this.resActive) return false;
    const T = this.resTarget;
    if (this.resShown < T) {
      this.resShown = Math.min(T, this.resShown + Math.max(T * dt * 0.9, 40 * dt * 60));
      $('res-score').textContent = fmt(this.resShown);
    }
    if (this.resShown >= T && this.resRecord && !this.stampDone) {
      this.stampDone = true;
      $('res-stamp').classList.add('show');
      return true;
    }
    return false;
  }

  showSummary(on: boolean, s?: { stage: number; stageScore: number; clearBonus: number; cashBonus: number; longest: number }): void {
    this.sumTimers.forEach((t) => window.clearTimeout(t));
    this.sumTimers = [];
    const rows = Array.from(this.summary.querySelectorAll<HTMLElement>('.sum-row'));
    if (on && s) {
      (this.summary.querySelector('.sum-title') as HTMLElement).textContent = `第 ${s.stage} 关 完成`;
      const vals = [s.stageScore, s.clearBonus, s.cashBonus, s.longest];
      rows.forEach((r, i) => {
        r.classList.remove('on');
        const b = r.querySelector('b') as HTMLElement;
        b.textContent = '0';
        this.sumTimers.push(
          window.setTimeout(() => {
            r.classList.add('on');
            this.h.click();
            const v = vals[i]!;
            const t0 = performance.now();
            const tickN = (): void => {
              const k = Math.min(1, (performance.now() - t0) / 300);
              b.textContent = i === 3 ? String(Math.round(v * k)) : fmt(v * k);
              if (k < 1 && this.summary.classList.contains('show')) requestAnimationFrame(tickN);
            };
            tickN();
          }, 250 + i * 280),
        );
      });
      this.summary.classList.add('show');
    } else this.summary.classList.remove('show');
  }
}
