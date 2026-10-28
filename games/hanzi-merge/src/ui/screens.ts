/**
 * DOM 覆盖层（§8）：标题、选帖、暂停、结算、图鉴、设置、HUD 提示条与「跳过」、转场墨晕。
 * 用打包楷体（.kai）显示的文字只来自 KAI 常量或字库数据；其余说明文字用系统字体栈。
 */
import { RECIPES, BASES } from '../data/hanzi.ts';
import { CHAPTER_NAMES, LEVELS } from '../data/levels.ts';
import { RECIPE_MAP } from '../core/recipes.ts';
import type { ResultInfo } from '../play.ts';
import { save, saveSettings, storageOk, resetSave, type Settings } from '../save.ts';
import { easeInOutQuad } from '../anim/ease.ts';
import { $, btn, h } from './dom.ts';

const NUM = '一二三四五六七八九十';

export interface UiHost {
  startLevel(id: number): void;
  startEndless(): void;
  resume(): void;
  restart(): void;
  toTitle(): void;
  nextLevel(): void;
  openCard(ch: string): void;
  settingsChanged(): void;
  replayTutorial(): void;
  skipTutorial(): void;
  click(): void;
}

export class Screens {
  ui = $('ui');
  private host: UiHost;
  private tipEl: HTMLElement;
  private tipTimer = 0;
  private skipEl: HTMLButtonElement;
  hud: HTMLElement;
  private stack: HTMLElement[] = [];
  private wipeC: HTMLCanvasElement;
  private wipeT = -1;
  private wipeMid: (() => void) | null = null;
  private wipeSprite: HTMLCanvasElement | null = null;

  constructor(host: UiHost) {
    this.host = host;
    this.hud = h('div');
    this.hud.id = 'hud';
    this.tipEl = h('div', 'tipbar');
    this.tipEl.setAttribute('role', 'status');
    this.tipEl.addEventListener('pointerup', () => this.clearTip());
    this.skipEl = btn('ghost skip', '跳过', () => host.skipTutorial(), '跳过引导');
    this.skipEl.style.display = 'none';
    this.hud.append(this.tipEl, this.skipEl);
    this.ui.append(this.hud);
    this.wipeC = h('canvas');
    this.wipeC.id = 'wipe';
    this.wipeC.width = 390;
    this.wipeC.height = 844;
    this.wipeC.style.width = '390px';
    this.wipeC.style.height = '844px';
    this.ui.append(this.wipeC);
  }

  setWipeSprite(c: HTMLCanvasElement): void {
    this.wipeSprite = c;
  }

  // ───────── 标题 ─────────
  showTitle(): void {
    this.closeAll();
    $('title').classList.add('show');
    this.hud.classList.remove('show');
    const got = RECIPES.filter((r) => save.atlas.has(r.c)).length;
    let stars = 0;
    for (const k in save.progress.levels) stars += save.progress.levels[k].stars;
    const foot = $('title-foot');
    foot.textContent = `已识 ${got} / ${RECIPES.length} 字 · 星 ${stars} / ${LEVELS.length * 3}`;
    if (!storageOk) foot.append(h('div', 'nosave', '无法保存进度'));
    const endless = $('btn-endless') as HTMLButtonElement;
    endless.disabled = save.progress.unlocked <= 10 && !this.unlockedAll;
    endless.title = endless.disabled ? '通过第二卷后解锁' : '';
  }
  unlockedAll = false;

  hideTitle(): void {
    $('title').classList.remove('show');
  }

  showHud(): void {
    this.hud.classList.add('show');
  }

  // ───────── 提示条 ─────────
  tip(text: string, ms: number, strong = false): void {
    clearTimeout(this.tipTimer);
    this.tipEl.textContent = text;
    this.tipEl.classList.add('show');
    this.tipEl.classList.toggle('strong', strong);
    if (ms > 0) this.tipTimer = window.setTimeout(() => this.clearTip(), ms);
  }
  clearTip(): void {
    clearTimeout(this.tipTimer);
    this.tipEl.classList.remove('show');
  }
  showSkip(on: boolean): void {
    this.skipEl.style.display = on ? '' : 'none';
  }

  // ───────── 通用 ─────────
  private push(id: string, overlay: boolean): HTMLElement {
    document.getElementById(id)?.remove();
    const s = h('section', 'screen show' + (overlay ? ' overlay' : ''));
    s.id = id;
    if (!overlay) s.style.background = 'var(--paper)';
    this.ui.insertBefore(s, this.wipeC);
    this.stack.push(s);
    return s;
  }
  close(id: string): void {
    const e = document.getElementById(id);
    if (!e) return;
    e.remove();
    this.stack = this.stack.filter((x) => x !== e);
  }
  closeAll(): void {
    for (const s of this.stack) s.remove();
    this.stack = [];
  }
  isOpen(id: string): boolean {
    return !!document.getElementById(id);
  }

  private topbar(s: HTMLElement, title: string, back: () => void, extra = ''): void {
    const bar = h('div', 'topbar');
    bar.append(h('h2', '', title));
    bar.querySelector('h2')!.className = 'kai';
    const b = btn('icon back', '', back, '返回');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    bar.append(b);
    if (extra) bar.append(h('div', 'extra', extra));
    s.append(bar);
  }

  // ───────── 选帖 ─────────
  showSelect(onBack: () => void): void {
    const s = this.push('select', false);
    let total = 0;
    for (const k in save.progress.levels) total += save.progress.levels[k].stars;
    this.topbar(s, '选帖', onBack, `星 ${total} / ${LEVELS.length * 3}`);
    const list = h('div', 'list');
    for (let c = 1; c <= 6; c++) {
      const lv = LEVELS.filter((l) => l.chapter === c);
      const first = lv[0].id;
      const locked = first > save.progress.unlocked && !this.unlockedAll;
      const vol = h('div', 'vol' + (locked ? ' locked' : ''));
      vol.append(h('h3', 'kai', `卷${NUM[c - 1]} · ${CHAPTER_NAMES[c - 1]}`));
      // 代表字：每帖取一个本卷尚未用过的目标字（从最后一个往前找），不重复
      const used = new Set<string>();
      const reps = lv.map((l) => {
        const ch = [...l.targets].reverse().find((x) => !used.has(x)) ?? l.targets[l.targets.length - 1];
        used.add(ch);
        return ch;
      });
      vol.append(h('div', 'reps', '代表字：' + reps.join(' ')));
      const grid = h('div', 'grid');
      for (const l of lv) {
        const unlocked = l.id <= save.progress.unlocked || this.unlockedAll;
        const rec = save.progress.levels[l.id];
        const b = btn('lv', '', () => {
          this.host.click();
          this.host.startLevel(l.id);
        }, `第 ${l.id} 帖`);
        b.disabled = !unlocked;
        b.append(h('span', 'n kai', `第${NUM[(l.id - 1) % 5]}帖`));
        const st = h('span', 's');
        for (let i = 0; i < 3; i++) st.append(h('i', rec && rec.stars > i ? 'on' : ''));
        b.append(st);
        grid.append(b);
      }
      vol.append(grid);
      list.append(vol);
    }
    s.append(list);
  }

  // ───────── 暂停 ─────────
  showPause(isEndless: boolean, onAtlas: () => void, onSettings: () => void): void {
    const s = this.push('pause', true);
    const p = h('div', 'panel');
    p.style.top = '150px';
    p.append(h('h2', '', '暂停'));
    const st = h('div', 'stack');
    st.append(
      btn('primary kai', '继续', () => this.host.resume()),
      btn('ghost kai', isEndless ? '再写一遍' : '重写本帖', () => this.host.restart()),
      btn('ghost kai', '选帖', () => {
        this.close('pause');
        this.showSelect(() => this.close('select'));
      }),
      btn('ghost kai', '图鉴', onAtlas),
      btn('ghost kai', '设置', onSettings),
      btn('ghost kai', '回到标题', () => this.host.toTitle()),
    );
    p.append(st);
    s.append(p);
  }

  // ───────── 结算 ─────────
  showResult(r: ResultInfo): void {
    const s = this.push('result', true);
    s.classList.add('result');
    const sc = h('div', 'scroll');
    if (r.mode === 'level') {
      sc.append(h('div', 'head' + (r.won ? '' : ' fail'), r.won ? '帖成' : '墨尽'));
      const def = LEVELS[r.level - 1];
      sc.append(h('div', 'sub', `卷${NUM[def.chapter - 1]} · 第${NUM[(def.id - 1) % 5]}帖 · ${r.won ? `剩墨 ${r.inkLeft}` : `完成 ${r.done} / ${r.total}`}`));
      if (r.won) {
        const stars = h('div', 'stars');
        for (let i = 0; i < 3; i++) {
          const e = h('div', 'star' + (i < r.stars ? ' on' : ''));
          e.style.animationDelay = `${0.3 + i * 0.28}s`;
          e.append(h('span', 'kai', '星'));
          stars.append(e);
        }
        sc.append(stars);
      } else if (r.missing.length) {
        const m = h('div', 'newchars');
        m.append(document.createTextNode('还差：'));
        // 最多列 8 个，多出的写「等 N 字」，不静默截断
        const MAX = 8;
        for (const ch of r.missing.slice(0, MAX)) m.append(h('b', '', ch));
        if (r.missing.length > MAX) m.append(document.createTextNode(` 等 ${r.missing.length} 字`));
        sc.append(m);
      }
    } else {
      sc.append(h('div', 'head', '书斋'));
      sc.append(h('div', 'sub', `到达第 ${r.stage} 章 · 写成 ${r.done} 字`));
    }
    const score = h('div', 'score kai', '0');
    sc.append(score);
    sc.append(h('div', 'best', `最高 ${r.best}`));
    if (r.newChars.length) {
      const nc = h('div', 'newchars');
      nc.append(document.createTextNode('本帖新识：'));
      for (const ch of r.newChars.slice(0, 10)) {
        const b = h('b', 'kai', ch);
        b.addEventListener('click', () => this.host.openCard(ch));
        nc.append(b);
      }
      sc.append(nc);
    }
    const act = h('div', 'actions');
    if (r.mode === 'level' && r.won) {
      act.append(btn('primary big kai', r.level >= LEVELS.length ? '回到标题' : '下一帖', () => (r.level >= LEVELS.length ? this.host.toTitle() : this.host.nextLevel())));
      const row = h('div', 'row');
      row.append(btn('ghost kai', '再写一遍', () => this.host.restart()), btn('ghost kai', '选帖', () => {
        this.close('result');
        this.showSelect(() => this.host.toTitle());
      }));
      act.append(row);
    } else {
      act.append(btn('primary big kai', '再写一遍', () => this.host.restart()));
      const row = h('div', 'row');
      if (r.mode === 'level') row.append(btn('ghost kai', '选帖', () => {
        this.close('result');
        this.showSelect(() => this.host.toTitle());
      }));
      row.append(btn('ghost kai', '回到标题', () => this.host.toTitle()));
      act.append(row);
    }
    sc.append(act);
    if (r.record) {
      const rec = h('div', 'record', '新纪录');
      sc.append(rec);
    }
    s.append(sc);
    // 分数缓动
    const t0 = performance.now();
    const dur = 900;
    const tick = () => {
      if (!document.body.contains(score)) return;
      const u = Math.min(1, (performance.now() - t0) / dur);
      score.textContent = String(Math.round(r.score * easeInOutQuad(u)));
      if (u < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ───────── 图鉴 ─────────
  showAtlas(onBack: () => void): void {
    const s = this.push('atlas', false);
    const got = RECIPES.filter((r) => save.atlas.has(r.c)).length;
    this.topbar(s, '图鉴', onBack, `已收 ${got} / ${RECIPES.length}`);
    const tabs = h('div', 'tabs');
    const list = h('div', 'list');
    const modes: [string, () => void][] = [
      ['按卷', () => this.atlasByTier(list)],
      ['造字法', () => this.atlasByMethod(list)],
      ['部件', () => this.atlasBases(list)],
    ];
    const bs: HTMLButtonElement[] = [];
    modes.forEach(([name, fn], i) => {
      const b = btn('ghost kai', name, () => {
        bs.forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        list.scrollTop = 0;
        fn();
      });
      if (i === 0) b.classList.add('on');
      bs.push(b);
      tabs.append(b);
    });
    s.append(tabs, list);
    this.atlasByTier(list);
  }

  private cell(ch: string): HTMLElement {
    const r = RECIPE_MAP.get(ch)!;
    const has = save.atlas.has(ch);
    const b = h('button', 'acell' + (has ? '' : ' no'));
    b.type = 'button';
    if (has) {
      b.append(h('span', 'c kai', ch), h('span', 'p', r.py));
      b.addEventListener('click', () => this.host.openCard(ch));
      b.setAttribute('aria-label', ch);
    } else {
      b.append(h('span', 'c kai', '？'));
      b.setAttribute('aria-label', '未收集');
      b.disabled = true;
    }
    return b;
  }

  private section(list: HTMLElement, title: string, chars: string[]): void {
    const got = chars.filter((c) => save.atlas.has(c)).length;
    const sec = h('div', 'sect');
    sec.append(h('span', 'kai', title), h('span', 'cnt', `${got} / ${chars.length}`));
    if (got === chars.length) sec.append(h('span', 'full kai', '全'));
    const grid = h('div', 'agrid');
    for (const c of chars) grid.append(this.cell(c));
    list.append(sec, grid);
  }

  private atlasByTier(list: HTMLElement): void {
    list.innerHTML = '';
    for (let t = 1; t <= 6; t++) this.section(list, `卷${NUM[t - 1]} · ${CHAPTER_NAMES[t - 1]}`, RECIPES.filter((r) => r.tier === t).map((r) => r.c));
    const st = save.stats;
    list.append(h('div', 'astats', `合成 ${st.merges} 次 · 洗笔 ${st.discards} 次 · 游玩 ${Math.round(st.seconds / 60)} 分钟`));
  }

  private atlasByMethod(list: HTMLElement): void {
    list.innerHTML = '';
    for (const m of ['会意', '形声', '指事'] as const) this.section(list, m, RECIPES.filter((r) => r.t === m).map((r) => r.c));
  }

  private atlasBases(list: HTMLElement): void {
    list.innerHTML = '';
    const grid = h('div', 'agrid');
    for (const b of BASES) {
      const e = h('div', 'acell base');
      e.append(h('span', 'c kai', b.c));
      const v = b.v ? Object.values(b.v).filter(Boolean).join('') : '';
      e.append(h('span', 'p', v ? `${b.py} ${v}` : b.py));
      e.title = b.vn ? `${b.c} · ${b.vn}` : b.g;
      grid.append(e);
    }
    const sec = h('div', 'sect');
    sec.append(h('span', 'kai', '部件'), h('span', 'cnt', String(BASES.length)));
    list.append(sec, h('div', 'astats', '小字为常见偏旁变体；用不用、用哪个，由具体的字决定（如 炎 下面仍是火，照 下面才是灬）'), grid);
  }

  // ───────── 设置 ─────────
  showSettings(onBack: () => void): void {
    const s = this.push('settings', false);
    this.topbar(s, '设置', onBack);
    const list = h('div', 'list');
    const st = save.settings;
    const row = (label: string, ctl: HTMLElement) => {
      const r = h('div', 'set');
      r.append(h('span', '', label), ctl);
      list.append(r);
    };
    const toggle = (k: keyof Settings) => {
      const b = h('button', 'toggle' + (st[k] ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', String(!!st[k]));
      b.addEventListener('click', () => {
        (st as unknown as Record<string, unknown>)[k] = !st[k];
        b.classList.toggle('on', !!st[k]);
        b.setAttribute('aria-checked', String(!!st[k]));
        saveSettings();
        this.host.settingsChanged();
        this.host.click();
      });
      return b;
    };
    row('音效', toggle('sfx'));
    row('音乐', toggle('music'));
    const vol = h('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(st.volume * 100));
    vol.setAttribute('aria-label', '主音量');
    vol.addEventListener('input', () => {
      st.volume = Number(vol.value) / 100;
      saveSettings();
      this.host.settingsChanged();
    });
    row('音量', vol);
    row('牌上显示拼音', toggle('pinyin'));
    row('显示造字法角标', toggle('methodMark'));
    const seg = (opts: [string, string][], get: () => string, set: (v: string) => void) => {
      const g = h('div', 'seg');
      const bs = opts.map(([v, label]) => {
        const b = btn('ghost', label, () => {
          set(v);
          bs.forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          saveSettings();
          this.host.settingsChanged();
        });
        if (get() === v) b.classList.add('on');
        return b;
      });
      g.append(...bs);
      return g;
    };
    row('新字卡', seg([['full', '完整'], ['brief', '简要']], () => st.card, (v) => (st.card = v as Settings['card'])));
    row('减弱动效', toggle('reduceMotion'));
    row('重写时出牌', seg([['same', '相同'], ['new', '换一组']], () => (st.sameDeal ? 'same' : 'new'), (v) => (st.sameDeal = v === 'same')));
    row('重看引导', btn('ghost', '开始', () => this.host.replayTutorial()));
    let armed = false;
    const clr = btn('ghost danger', '清除存档', () => {
      if (!armed) {
        armed = true;
        clr.textContent = '再点一次确认';
        return;
      }
      resetSave();
      clr.textContent = '已清除';
      this.host.settingsChanged();
    });
    row('清除存档', clr);
    list.append(h('div', 'astats', '字体：霞鹜文楷、马善政（SIL OFL 1.1）。构形依据：《说文解字》与现代通行分析。'));
    if (!storageOk) list.append(h('div', 'astats nosave', '无法保存进度（浏览器禁止本地存储）'));
    s.append(list);
  }

  // ───────── 转场（墨晕盖满 → 化开） ─────────
  wipe(mid: () => void): void {
    if (save.settings.reduceMotion || !this.wipeSprite) {
      mid();
      return;
    }
    this.wipeT = 0;
    this.wipeMid = mid;
    this.wipeC.classList.add('on');
  }

  wiping(): boolean {
    return this.wipeT >= 0;
  }

  update(dt: number): void {
    if (this.wipeT < 0) return;
    const prev = this.wipeT;
    this.wipeT += dt;
    if (prev < 0.42 && this.wipeT >= 0.42 && this.wipeMid) {
      const m = this.wipeMid;
      this.wipeMid = null;
      m();
    }
    const g = this.wipeC.getContext('2d')!;
    g.clearRect(0, 0, 390, 844);
    const t = this.wipeT;
    if (t >= 0.9) {
      this.wipeT = -1;
      this.wipeC.classList.remove('on');
      return;
    }
    const sp = this.wipeSprite!;
    if (t < 0.42) {
      const u = easeInOutQuad(t / 0.42);
      const R = 60 + u * 1500;
      g.globalAlpha = Math.min(1, u * 1.6);
      g.drawImage(sp, 195 - R / 2, 422 - R / 2, R, R);
      g.globalAlpha = u * u;
      g.fillStyle = '#2E2822';
      g.fillRect(0, 0, 390, 844);
    } else {
      const u = easeInOutQuad((t - 0.42) / 0.48);
      g.fillStyle = '#2E2822';
      g.globalAlpha = 1 - u;
      g.fillRect(0, 0, 390, 844);
      g.globalCompositeOperation = 'destination-out';
      const R = 40 + u * 1600;
      g.globalAlpha = 1;
      g.drawImage(sp, 390 - R / 2 + 20, 844 - R / 2 - 40, R, R);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }
}
