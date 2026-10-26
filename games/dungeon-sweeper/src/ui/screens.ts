import type { Records, Settings } from '../core/storage';
import { breakdownRows, fmtInt, fmtTime } from '../game/score';
import type { ScoreBreakdown } from '../game/types';
import type { Rect } from '../view/layout';

export type Action =
  | 'start'
  | 'settings'
  | 'howto'
  | 'pause'
  | 'resume'
  | 'restart'
  | 'title'
  | 'replay'
  | 'skip'
  | 'tutgo'
  | 'close-settings'
  | 'rewatch'
  | 'clear'
  | `toggle:${keyof Settings}`;

const h = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface ResultData {
  b: ScoreBreakdown;
  prevBest: number;
  newBest: boolean;
  level: number;
  explored: number;
  marks: number;
}

/**
 * DOM 覆盖层（文档 §6）：标题 / 暂停 / 设置 / 结算 / 对话框 / Toast / 引导气泡。
 * 所有按钮通过 data-act 分发到 onAction。
 */
export class Screens {
  readonly root: HTMLElement;
  onAction: (a: Action) => void = () => undefined;
  onButton: () => void = () => undefined;
  private title: HTMLElement;
  private plaque: HTMLElement;
  private hint: HTMLElement;
  private pauseBtn: HTMLElement;
  private bubble: HTMLElement;
  private bubbleText: HTMLElement;
  private bubbleGo: HTMLElement;
  private skip: HTMLElement;
  private toasts: HTMLElement;
  private modal: HTMLElement;
  private resultLayer: HTMLElement;
  private fade: HTMLElement;
  private dlgResolve: ((v: boolean) => void) | null = null;
  private settingsFrom: 'title' | 'pause' = 'title';
  private countRaf = 0;
  /** 结算计数中：返回 true 时 app 播放滴答 */
  onRowTick: (i: number) => void = () => undefined;
  onCountTick: () => void = () => undefined;
  onRecord: () => void = () => undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    // 标题
    this.title = h('div', 'layer', '');
    this.title.id = 'title';
    this.title.innerHTML = `
      <div class="logo"><h1>地牢扫雷</h1><div class="sub">DUNGEON SWEEPER</div></div>
      <div class="menu">
        <button class="btn btn-main" data-act="start" id="btn-start">开始冒险</button>
        <div class="row">
          <button class="btn btn-ghost" data-act="settings" id="btn-settings">⚙ 设置</button>
          <button class="btn btn-ghost" data-act="howto" id="btn-howto">❖ 玩法</button>
        </div>
      </div>`;
    this.plaque = h('div', 'plaque hidden');
    this.title.appendChild(this.plaque);
    this.hint = h('div', 'sound-hint', '点击任意处开启声音');
    this.title.appendChild(this.hint);
    root.appendChild(this.title);
    // 暂停钮
    this.pauseBtn = h('button', 'hidden', '<span><i></i><i></i></span>');
    this.pauseBtn.id = 'pause-btn';
    this.pauseBtn.dataset.act = 'pause';
    this.pauseBtn.setAttribute('aria-label', '暂停');
    root.appendChild(this.pauseBtn);
    // 引导
    this.bubble = h('div', 'hidden');
    this.bubble.id = 'bubble';
    this.bubbleText = h('div');
    this.bubbleGo = h('button', 'btn btn-main go hidden', '开始冒险');
    this.bubbleGo.dataset.act = 'tutgo';
    this.bubbleGo.id = 'btn-tutgo';
    this.bubble.append(this.bubbleText, this.bubbleGo);
    root.appendChild(this.bubble);
    this.skip = h('button', 'btn hidden', '跳过引导 ›');
    this.skip.id = 'skip-btn';
    this.skip.dataset.act = 'skip';
    root.appendChild(this.skip);
    // toast
    this.toasts = h('div');
    this.toasts.id = 'toasts';
    root.appendChild(this.toasts);
    // 结算 / 面板
    this.resultLayer = h('div', 'layer hidden');
    this.resultLayer.id = 'result';
    root.appendChild(this.resultLayer);
    this.modal = h('div', 'layer hidden');
    this.modal.id = 'modal';
    root.appendChild(this.modal);
    this.fade = h('div');
    this.fade.id = 'fade';
    root.appendChild(this.fade);
    root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      e.stopPropagation();
      this.onButton();
      const act = t.dataset.act as Action;
      if (act.startsWith('dlg:')) return;
      this.onAction(act);
    });
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.stopPropagation();
    });
  }

  /** 布局：#ui 覆盖游戏栏 */
  place(colX: number, colW: number, vh: number, pause: Rect, hudTop: number, safeTop: number, boardBottom: number): void {
    const r = this.root.style;
    r.left = colX + 'px';
    r.width = colW + 'px';
    r.height = vh + 'px';
    const p = this.pauseBtn.style;
    p.left = pause.x + pause.w / 2 - 24 + 'px';
    p.top = pause.y + pause.h / 2 - 24 + 'px';
    this.skip.style.top = Math.max(6, safeTop + 6) + 'px';
    this.toasts.style.top = hudTop + 76 + 'px';
    this.bubble.style.top = '';
    this.bubble.style.bottom = Math.max(12, vh - boardBottom + 8) + 'px';
  }

  // ---------------------------------------------------------------- 标题
  showTitle(rec: Records, soundHint: boolean): void {
    this.title.classList.remove('hidden', 'out');
    if (rec.plays > 0) {
      this.plaque.classList.remove('hidden');
      this.plaque.innerHTML = `最高分 <b>${fmtInt(rec.best)}</b> · 屠龙 <b>${rec.wins}</b> 次${rec.bestTime ? ` · 最快 <b>${fmtTime(rec.bestTime)}</b>` : ''}`;
    } else this.plaque.classList.add('hidden');
    this.hint.classList.toggle('hidden', !soundHint);
  }
  hideTitle(): void {
    this.title.classList.add('out');
    window.setTimeout(() => this.title.classList.add('hidden'), 320);
  }
  hideSoundHint(): void {
    this.hint.classList.add('hidden');
  }
  setGlow(v: number): void {
    this.title.style.setProperty('--glow', v.toFixed(3));
  }
  get titleVisible(): boolean {
    return !this.title.classList.contains('hidden') && !this.title.classList.contains('out');
  }

  showPauseBtn(on: boolean): void {
    this.pauseBtn.classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------- 引导
  showBubble(text: string, go: boolean, skip: boolean): void {
    this.bubble.classList.remove('hidden');
    this.bubbleText.textContent = text;
    this.bubbleGo.classList.toggle('hidden', !go);
    this.skip.classList.toggle('hidden', !skip);
  }
  hideBubble(): void {
    this.bubble.classList.add('hidden');
    this.skip.classList.add('hidden');
  }
  shakeBubble(text?: string): void {
    if (text) this.bubbleText.textContent = text;
    this.bubble.classList.remove('shake');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('shake');
  }

  // ---------------------------------------------------------------- toast
  toast(text: string, ms = 3000): void {
    const t = h('div', 'toast');
    t.textContent = text;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    window.setTimeout(() => t.classList.add('out'), ms);
    window.setTimeout(() => t.remove(), ms + 320);
  }

  // ---------------------------------------------------------------- 面板
  get modalOpen(): boolean {
    return !this.modal.classList.contains('hidden');
  }
  private openModal(inner: HTMLElement): void {
    this.modal.innerHTML = '';
    const sc = h('div', 'scrim');
    sc.appendChild(inner);
    this.modal.appendChild(sc);
    this.modal.classList.remove('hidden');
  }
  closeModal(): void {
    const p = this.modal.querySelector('.panel');
    if (!p) {
      this.modal.classList.add('hidden');
      return;
    }
    p.classList.add('out');
    const m = this.modal;
    window.setTimeout(() => {
      if (m.querySelector('.panel.out')) {
        m.classList.add('hidden');
        m.innerHTML = '';
      }
    }, 160);
  }

  showPause(seed: number, regen: number, st: Settings): void {
    const p = h('div', 'panel');
    p.id = 'panel-pause';
    p.innerHTML = `<h2>暂停</h2>
      <button class="btn btn-main" data-act="resume" id="btn-resume">继续</button>
      <button class="btn btn-ghost" data-act="restart" id="btn-restart">重新开始</button>
      <button class="btn btn-ghost" data-act="settings" id="btn-psettings">设置</button>
      <button class="btn btn-ghost" data-act="title" id="btn-ptitle">返回标题</button>
      <div class="quick">${this.tog('sfx', '音效', st.sfx)}${this.tog('music', '音乐', st.music)}</div>
      <div class="seed">种子 #${seed}${regen ? `（第 ${regen} 次重抽）` : ''}</div>`;
    this.settingsFrom = 'pause';
    this.openModal(p);
  }

  private tog(k: keyof Settings, label: string, on: boolean): string {
    return `<button class="toggle${on ? ' on' : ''}" data-act="toggle:${k}" data-key="${k}"><span>${label}</span><span class="sw"></span></button>`;
  }

  showSettings(st: Settings, from: 'title' | 'pause'): void {
    this.settingsFrom = from;
    const p = h('div', 'panel');
    p.id = 'panel-settings';
    p.innerHTML = `<h2>设置</h2>
      <div class="toggles">
        ${this.tog('sfx', '音效', st.sfx)}
        ${this.tog('music', '音乐', st.music)}
        ${this.tog('haptics', '震动', st.haptics)}
        ${this.tog('reducedMotion', '减少动效', st.reducedMotion)}
        ${this.tog('chord', '数字快开', st.chord)}
      </div>
      <button class="btn btn-ghost" data-act="rewatch" id="btn-rewatch">重看引导</button>
      <button class="btn btn-ghost btn-danger" data-act="clear" id="btn-clear">清除记录</button>
      <button class="btn btn-main" data-act="close-settings" id="btn-close-settings">完成</button>`;
    this.openModal(p);
  }
  get settingsReturn(): 'title' | 'pause' {
    return this.settingsFrom;
  }

  setToggle(k: keyof Settings, on: boolean): void {
    this.modal.querySelectorAll(`[data-key="${k}"]`).forEach((e) => e.classList.toggle('on', on));
  }

  /** 对话框：主按钮在右；Esc 取消 */
  dialog(text: string, sub: string, ok: string, cancel: string): Promise<boolean> {
    const p = h('div', 'panel');
    p.id = 'dialog';
    p.innerHTML = `<div class="dlg-text"></div><div class="dlg-sub"></div>
      <div class="dlg-btns"><button class="btn btn-ghost" data-act="dlg:no" id="dlg-no"></button><button class="btn btn-main" data-act="dlg:yes" id="dlg-yes"></button></div>`;
    (p.querySelector('.dlg-text') as HTMLElement).textContent = text;
    (p.querySelector('.dlg-sub') as HTMLElement).textContent = sub;
    (p.querySelector('#dlg-no') as HTMLElement).textContent = cancel;
    (p.querySelector('#dlg-yes') as HTMLElement).textContent = ok;
    this.openModal(p);
    return new Promise((res) => {
      this.dlgResolve = res;
      p.querySelector('#dlg-no')!.addEventListener('click', () => this.resolveDialog(false));
      p.querySelector('#dlg-yes')!.addEventListener('click', () => this.resolveDialog(true));
    });
  }
  get dialogOpen(): boolean {
    return this.dlgResolve !== null;
  }
  resolveDialog(v: boolean): void {
    const r = this.dlgResolve;
    if (!r) return;
    this.dlgResolve = null;
    this.closeModal();
    r(v);
  }

  // ---------------------------------------------------------------- 结算
  get resultOpen(): boolean {
    return !this.resultLayer.classList.contains('hidden');
  }

  showResult(d: ResultData): void {
    cancelAnimationFrame(this.countRaf);
    const b = d.b;
    const L = this.resultLayer;
    L.innerHTML = '';
    const sc = h('div', 'scrim');
    const t = h('div', 'tablet');
    t.id = 'panel-result';
    t.innerHTML = `<h2 class="${b.won ? '' : 'lose'}">${b.won ? '屠龙成功' : '你倒下了'}</h2>
      <div class="en">${b.won ? 'DRAGON SLAIN' : 'YOU FELL'}</div>
      <div class="rows"></div>
      <div class="total">0</div>
      <div class="best">历史最高 <b>${fmtInt(Math.max(d.prevBest, d.newBest ? 0 : b.total))}</b></div>
      <div class="stats">等级 ${d.level} · 探索 ${d.explored}% · 猜中标记 ${d.marks} · 用时 ${fmtTime(b.timeSec)}</div>
      <button class="btn btn-main" data-act="replay" id="btn-replay">再来一局</button>
      <button class="btn btn-text" data-act="title" id="btn-rtitle">返回标题</button>`;
    sc.appendChild(t);
    L.appendChild(sc);
    L.classList.remove('hidden');
    const rowsEl = t.querySelector('.rows') as HTMLElement;
    const totalEl = t.querySelector('.total') as HTMLElement;
    const rows = breakdownRows(b);
    const t0 = performance.now() + 420;
    let shown = 0;
    let lastTick = 0;
    const totalStart = t0 + rows.length * 240 + 100;
    let recorded = false;
    const step = (now: number) => {
      while (shown < rows.length && now >= t0 + shown * 240) {
        const r = rows[shown];
        const e = h('div', 'rowi');
        e.innerHTML = `<span class="l">${r.label}${r.detail ? `<small>${r.detail}</small>` : ''}</span><span class="v">+${fmtInt(r.value)}</span>`;
        rowsEl.appendChild(e);
        this.onRowTick(shown);
        shown++;
      }
      if (now >= totalStart) {
        const k = Math.min(1, (now - totalStart) / 900);
        const e = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
        totalEl.textContent = fmtInt(b.total * e);
        if (k < 1 && now - lastTick > 50) {
          lastTick = now;
          this.onCountTick();
        }
        if (k >= 1 && !recorded) {
          recorded = true;
          if (d.newBest) {
            const rays = h('div', 'ribbon-rays');
            const rib = h('div', 'ribbon', '新纪录！');
            rib.id = 'ribbon';
            t.append(rays, rib);
            this.onRecord();
          }
        }
      }
      if (shown < rows.length || now < totalStart + 900 || !recorded) this.countRaf = requestAnimationFrame(step);
    };
    this.countRaf = requestAnimationFrame(step);
  }

  hideResult(): void {
    cancelAnimationFrame(this.countRaf);
    const t = this.resultLayer.querySelector('.tablet');
    if (t) t.classList.add('out');
    window.setTimeout(() => {
      this.resultLayer.classList.add('hidden');
      this.resultLayer.innerHTML = '';
    }, 250);
  }

  fadeTo(on: boolean): void {
    this.fade.classList.toggle('on', on);
  }
}
