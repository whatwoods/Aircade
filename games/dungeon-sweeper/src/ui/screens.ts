import type { Layout } from '../view/layout';
import type { Records, Settings } from '../core/storage';
import { ACHIEVEMENTS, type Achievement } from '../game/achievements';
import { type BlessId, blessDef } from '../game/blessings';
import { type DiffId, DIFF_IDS, diffParams } from '../game/difficulty';
import { breakdownRows, fmtInt, fmtTime } from '../game/score';
import type { DailyInfo } from '../game/daily';
import type { Game } from '../game/rules';
import type { ScoreBreakdown } from '../game/types';

export type Action =
  | 'start'
  | 'continue'
  | 'daily'
  | 'review'
  | 'review-back'
  | 'share'
  | 'settings'
  | 'howto'
  | 'achievements'
  | 'close-modal'
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
  | `toggle:${keyof Settings}`
  | `diff:${DiffId}`;

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
  daily: string | null;
  /** 本局新解锁的成就 */
  unlocked: Achievement[];
}

/** 'YYYY-MM-DD' → 'M月D日' */
export const dayLabel = (key: string): string => {
  const [, m, d] = key.split('-');
  return `${+m}月${+d}日`;
};

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
  private menu: HTMLElement;
  private reviewBar: HTMLElement;
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
  private blessResolve: ((id: BlessId) => void) | null = null;
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
      <div class="menu"></div>`;
    this.menu = this.title.querySelector('.menu') as HTMLElement;
    this.plaque = h('div', 'plaque hidden');
    this.title.appendChild(this.plaque);
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
    // 死亡复盘：收起结算后的返回按钮
    this.reviewBar = h('button', 'btn btn-main hidden', '返回结算');
    this.reviewBar.id = 'review-back';
    this.reviewBar.dataset.act = 'review-back';
    root.appendChild(this.reviewBar);
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
  place(L: Layout): void {
    const r = this.root.style;
    r.left = L.colX + 'px';
    r.width = L.colW + 'px';
    r.height = L.vh + 'px';
    const p = this.pauseBtn.style;
    p.left = L.pause.x + L.pause.w / 2 - 24 + 'px';
    p.top = L.pause.y + L.pause.h / 2 - 24 + 'px';
    // 跳过按钮放在分数行正中（分数与计时之间），不与暂停键/HUD 重叠
    this.skip.style.top = L.scoreLine.y + L.scoreLine.h / 2 - 14 + 'px';
    this.skip.style.left = L.scoreLine.x + L.scoreLine.w / 2 + 'px';
    const side = L.side;
    // 提示条：竖屏压在棋盘上沿内侧（不挡分数/计时）；横屏放在右栏图鉴上
    const t = this.toasts.style;
    t.top = side.toastTop + 'px';
    t.left = side.cx - side.w / 2 + 'px';
    t.right = '';
    t.width = side.w + 'px';
    // 引导气泡：竖屏放在棋盘下方（盖住图鉴），不挡引导目标格与轮盘；空间不足时贴底
    const bs = this.bubble.style;
    bs.left = side.cx + 'px';
    bs.width = Math.min(side.w, 360) + 'px';
    const boardBottom = L.boardOuter.y + L.boardOuter.h;
    const below = L.vh - L.safeBottom - boardBottom;
    if (L.landscape || below >= 96) {
      bs.bottom = '';
      bs.top = (L.landscape ? side.bubbleTop : boardBottom + 6) + 'px';
    } else {
      bs.top = '';
      bs.bottom = L.safeBottom + 8 + 'px';
    }
  }

  // ---------------------------------------------------------------- 标题
  showTitle(rec: Records, hasRun: boolean, daily: DailyInfo, diff: DiffId): void {
    this.title.classList.remove('hidden', 'out');
    // 有存档时【新的冒险】与【每日挑战】半宽并排，日期省略
    const half = hasRun;
    const dl =
      daily.state === 'done'
        ? `<button class="btn btn-ghost btn-daily done" disabled id="btn-daily">今日 <b>${fmtInt(daily.score)}</b>${daily.won && !half ? ' · 屠龙' : ''}</button>`
        : daily.state === 'playing'
          ? ''
          : `<button class="btn btn-ghost btn-daily" data-act="daily" id="btn-daily">每日挑战${half ? '' : ` · ${dayLabel(daily.key)}`}</button>`;
    const seg = DIFF_IDS.map(
      (d) => `<button class="${d === diff ? 'on' : ''}" data-act="diff:${d}" role="radio" aria-checked="${d === diff}">${diffParams(d).name}</button>`,
    ).join('');
    const start = `<button class="btn ${hasRun ? 'btn-ghost' : 'btn-main'}" data-act="start" id="btn-start">${hasRun ? '新的冒险' : '开始冒险'}</button>`;
    this.menu.innerHTML = `
      ${hasRun ? `<button class="btn btn-main" data-act="continue" id="btn-continue">继续冒险</button>` : ''}
      <div class="seg" role="radiogroup" id="diff">${seg}</div>
      ${hasRun ? `<div class="pair${dl ? '' : ' solo'}">${start}${dl}</div>` : `${start}${dl}`}
      <div class="tools">
        <button class="link" data-act="settings" id="btn-settings">设置</button>
        <button class="link" data-act="achievements" id="btn-ach">成就</button>
        <button class="link" data-act="howto" id="btn-howto">玩法</button>
      </div>`;
    this.menu.appendChild(this.plaque);
    // 没有记录时只隐身、不收起：菜单从底部排，收起会让切换难度时按钮上下跳
    this.plaque.classList.remove('hidden');
    this.plaque.classList.toggle('empty', rec.plays === 0);
    this.plaque.innerHTML = `<span>最高分 <b>${fmtInt(rec.best)}</b> · 屠龙 <b>${rec.wins}</b> 次${rec.bestTime ? ` · 最快 <b>${fmtTime(rec.bestTime)}</b>` : ''}</span>`;
  }
  hideTitle(): void {
    this.title.classList.add('out');
    window.setTimeout(() => this.title.classList.add('hidden'), 320);
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
  /** replace = 先淡出现有提示（操作触发的提示打断旧提示） */
  toast(text: string, ms = 3000, replace = false): void {
    if (replace)
      for (const old of Array.from(this.toasts.children) as HTMLElement[]) {
        if (old.classList.contains('out')) continue;
        old.classList.add('out');
        window.setTimeout(() => old.remove(), 320);
      }
    const t = h('div', 'toast');
    t.textContent = text;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    window.setTimeout(() => t.classList.add('out'), ms);
    window.setTimeout(() => t.remove(), ms + 320);
  }

  clearToasts(): void {
    for (const old of Array.from(this.toasts.children) as HTMLElement[]) {
      old.classList.add('out');
      window.setTimeout(() => old.remove(), 320);
    }
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

  showPause(g: Game, st: Settings): void {
    const p = h('div', 'panel');
    p.id = 'panel-pause';
    const regen = g.b.regen;
    const tag = g.daily ? `每日挑战 · ${dayLabel(g.daily)}` : `${g.diff.name} · 种子 #${g.seed}${regen ? `（第 ${regen} 次重抽）` : ''}`;
    p.innerHTML = `<h2>暂停</h2>
      <button class="btn btn-main" data-act="resume" id="btn-resume">继续</button>
      ${g.daily ? '' : '<button class="btn btn-ghost" data-act="restart" id="btn-restart">重新开始</button>'}
      <button class="btn btn-ghost" data-act="settings" id="btn-psettings">设置</button>
      <button class="btn btn-ghost" data-act="title" id="btn-ptitle">返回标题</button>
      ${g.blessings.length ? `<div class="bless-own">${g.blessings.map((id) => blessCard(id)).join('')}</div>` : ''}
      <div class="quick">${this.tog('sfx', '音效', st.sfx)}${this.tog('music', '音乐', st.music)}</div>
      <div class="seed">${tag}</div>`;
    this.settingsFrom = 'pause';
    this.openModal(p);
  }

  /** 成就一览：已解锁在前，未解锁的压暗但给出条件 */
  showAchievements(have: Record<string, number>): void {
    const p = h('div', 'panel');
    p.id = 'panel-ach';
    const n = ACHIEVEMENTS.filter((a) => have[a.id]).length;
    const list = [...ACHIEVEMENTS].sort((a, b) => (have[b.id] ? 1 : 0) - (have[a.id] ? 1 : 0));
    p.innerHTML = `<h2>成就 <small>${n} / ${ACHIEVEMENTS.length}</small></h2>
      <div class="ach-list">${list
        .map((a) => `<div class="ach-i${have[a.id] ? ' got' : ''}"><span class="s">${have[a.id] ? '★' : '☆'}</span><b>${a.name}</b><span class="d">${a.desc}</span></div>`)
        .join('')}</div>
      <button class="btn btn-main" data-act="close-modal" id="btn-close-ach">完成</button>`;
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
  /** 祝福三选一（§3.10）：没有取消，点卡片即选 */
  blessPick(offer: readonly BlessId[]): Promise<BlessId> {
    const p = h('div', 'panel');
    p.id = 'panel-bless';
    p.innerHTML = `<h2>选择祝福</h2><div class="bless-cards">${offer.map((id, k) => blessCard(id, `bless:${k}`)).join('')}</div>`;
    this.openModal(p);
    return new Promise((res) => {
      this.blessResolve = res;
      p.querySelectorAll<HTMLElement>('.bless-card').forEach((el, k) => el.addEventListener('click', () => this.resolveBless(offer[k])));
    });
  }
  get blessOpen(): boolean {
    return this.blessResolve !== null;
  }
  resolveBless(id: BlessId): void {
    const r = this.blessResolve;
    if (!r) return;
    this.blessResolve = null;
    this.closeModal();
    r(id);
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
      <div class="en">${d.daily ? `每日挑战 · ${dayLabel(d.daily)}` : b.won ? 'DRAGON SLAIN' : 'YOU FELL'}</div>
      <div class="rows"></div>
      <div class="total">0</div>
      <div class="best">${d.newBest ? (d.prevBest > 0 ? `此前最高 <b>${fmtInt(d.prevBest)}</b>` : '首个纪录') : `历史最高 <b>${fmtInt(d.prevBest)}</b>`}</div>
      <div class="stats">等级 ${d.level} · 探索 ${d.explored}% · 猜中标记 ${d.marks} · 用时 ${fmtTime(b.timeSec)}</div>
      ${d.unlocked.length ? `<div class="ach-new">${d.unlocked.map((a) => `<span>★ ${a.name}</span>`).join('')}</div>` : ''}
      <button class="btn btn-main" data-act="replay" id="btn-replay">再来一局</button>
      <div class="row">
        ${b.won ? '' : '<button class="btn btn-ghost" data-act="review" id="btn-review">查看盘面</button>'}
        <button class="btn btn-ghost" data-act="share" id="btn-share">分享</button>
      </div>
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

  /** 复盘：收起 / 放回结算面板（不重新计数） */
  setResultHidden(on: boolean): void {
    this.resultLayer.classList.toggle('peek', on);
    this.showReviewBar(on);
  }
  showReviewBar(on: boolean): void {
    this.reviewBar.classList.toggle('hidden', !on);
  }

  hideResult(): void {
    cancelAnimationFrame(this.countRaf);
    const t = this.resultLayer.querySelector('.tablet');
    if (t) t.classList.add('out');
    this.showReviewBar(false);
    window.setTimeout(() => {
      this.resultLayer.classList.add('hidden');
      this.resultLayer.classList.remove('peek');
      this.resultLayer.innerHTML = '';
    }, 250);
  }

  fadeTo(on: boolean): void {
    this.fade.classList.toggle('on', on);
  }
}

/** 祝福卡：印章 + 名字 + 收益 + 代价 */
function blessCard(id: BlessId, act = ''): string {
  const d = blessDef(id);
  const tag = act ? 'button' : 'div';
  return `<${tag} class="bless-card"${act ? ` data-bless="${id}"` : ''}><span class="seal">${d.seal}</span><span class="txt"><b>${d.name}</b><span class="gain">${d.gain}</span>${
    d.cost ? `<span class="cost">${d.cost}</span>` : ''
  }</span></${tag}>`;
}
