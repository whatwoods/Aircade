// Settings (docs §6.8): sfx / music / shake / haptics / reduce flash / landing hints / quality, re-watch
// tutorial, reset best (confirm). Reachable from the title and the pause panel.
import { settings, setSetting } from '../core/settings';
import type { Settings } from '../core/settings';
import { el, onTap } from './dom';
import { confirmButton } from './pause';

type BoolKey = 'sfx' | 'music' | 'shake' | 'haptics' | 'reduceFlash' | 'landingHints';
const ROWS: [BoolKey, string][] = [
  ['sfx', '音效'],
  ['music', '音乐'],
  ['shake', '屏幕震动'],
  ['haptics', '触感反馈'],
  ['reduceFlash', '减少闪光'],
  ['landingHints', '落点提示'],
];
const Q: [Settings['quality'], string][] = [
  ['auto', '自动'],
  ['high', '高'],
  ['mid', '中'],
  ['low', '低'],
];

export class SettingsPanel {
  readonly root: HTMLElement;
  isOpen = false;
  private toggles = new Map<BoolKey, HTMLElement>();
  private seg: HTMLElement[] = [];
  private onClose: () => void = () => {};
  private resetConfirm: () => void;

  constructor(parent: HTMLElement, h: { retutorial: () => void; resetBest: () => void }) {
    const r = el('div', 'overlay hidden', parent);
    r.id = 'settings';
    this.root = r;
    el('div', 'mask', r);
    const p = el('div', 'panel chamfer ui', r);
    const inner = el('div', 'inner', p);
    el('div', 'ptitle', inner, '设置');
    const list = el('div', '', inner);
    list.style.marginTop = '10px';
    for (const [k, label] of ROWS) {
      const row = el('div', 'rowi', list);
      el('span', '', row, label);
      const t = el('button', 'tgl ui', row);
      t.dataset.testid = 'set-' + k;
      t.setAttribute('aria-label', label);
      onTap(t, () => {
        setSetting(k, !settings[k]);
        this.sync();
      });
      this.toggles.set(k, t);
    }
    const qrow = el('div', 'rowi', list);
    el('span', '', qrow, '画质');
    const seg = el('div', 'seg', qrow);
    for (const [q, label] of Q) {
      const b = el('button', 'ui', seg, label);
      b.dataset.testid = 'set-q-' + q;
      onTap(b, () => {
        setSetting('quality', q);
        this.sync();
      });
      this.seg.push(b);
    }
    const acts = el('div', 'acts', inner);
    const tut = el('button', 'btn chamfer press', acts, '<span>重看引导</span>');
    tut.dataset.testid = 'btn-retutorial';
    onTap(tut, () => {
      this.close();
      h.retutorial();
    });
    const rb = el('button', 'btn chamfer press', acts);
    rb.dataset.testid = 'btn-reset-best';
    this.resetConfirm = confirmButton(rb, '重置最高分', '确认重置？', () => {
      h.resetBest();
      rb.innerHTML = '<span>已重置</span>';
    });
    const done = el('button', 'btn primary chamfer done press', inner, '<span>完成</span>');
    done.dataset.testid = 'btn-settings-done';
    onTap(done, () => this.close());
  }

  private sync(): void {
    for (const [k, t] of this.toggles) t.classList.toggle('on', settings[k]);
    for (let i = 0; i < Q.length; i++) this.seg[i]!.classList.toggle('on', settings.quality === Q[i]![0]);
  }

  open(onClose: () => void): void {
    this.onClose = onClose;
    this.isOpen = true;
    this.resetConfirm();
    this.sync();
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
    this.onClose();
  }
}
