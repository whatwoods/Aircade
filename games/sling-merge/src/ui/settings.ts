/**
 * 设置浮层（docs §6.7）：音效 / 音乐 / 震动（不支持时置灰并注明）/ 屏幕震动 四个果冻开关；
 * 「重看新手引导」「清除最高分」（3 s 内二次确认）「完成」。改动立即生效并保存。
 */
import type { Settings } from '../core/storage';
import { ICON } from './icons';
import { jellyButton, Overlay } from './overlay';

export interface SettingsActions {
  change(key: keyof Settings, on: boolean): void;
  replayTutorial(): void;
  clearBest(): void;
  done(): void;
  click(): void;
}

interface Row {
  key: keyof Settings;
  tog: HTMLButtonElement;
}

export class SettingsPanel extends Overlay {
  readonly btnDone: HTMLButtonElement;
  private rows: Row[] = [];
  private settings: Settings;
  private clearBtn: HTMLButtonElement;
  private clearLabel: HTMLElement;
  private armedT = 0;
  private note: HTMLElement;
  private noteT = 0;

  constructor(root: HTMLElement, settings: Settings, vibrationSupported: boolean, act: SettingsActions) {
    super(root, 'settings', '设置', true);
    this.settings = settings;
    const p = this.panel;
    p.innerHTML = '<h2>设置</h2><div class="toggles"></div><div class="note"></div>';
    const list = p.querySelector('.toggles')!;
    this.note = p.querySelector('.note')!;
    const defs: [keyof Settings, string, string, string][] = [
      ['sfx', '音效', ICON.speaker, ''],
      ['music', '音乐', ICON.note, ''],
      ['vibration', '震动', ICON.vibrate, vibrationSupported ? '' : '此设备不支持'],
      ['shake', '屏幕震动', ICON.shake, ''],
    ];
    for (const [key, label, icon, sub] of defs) {
      const row = document.createElement('div');
      row.className = 'trow';
      const disabled = key === 'vibration' && !vibrationSupported;
      if (disabled) row.classList.add('disabled');
      row.innerHTML = `${icon}<div class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</div>`;
      const tog = document.createElement('button');
      tog.type = 'button';
      tog.className = 'tog';
      tog.setAttribute('role', 'switch');
      tog.setAttribute('aria-label', label);
      if (disabled) tog.disabled = true;
      tog.addEventListener('click', () => {
        const on = !this.settings[key];
        act.change(key, on);
        this.sync();
      });
      row.appendChild(tog);
      list.appendChild(row);
      this.rows.push({ key, tog });
    }
    const tut = jellyButton('secondary b-tutorial', `${ICON.book}<span>重看新手引导</span>`);
    this.clearBtn = jellyButton('tertiary b-clear', `${ICON.trash}<span>清除最高分</span>`);
    this.clearLabel = this.clearBtn.querySelector('span')!;
    this.btnDone = jellyButton('primary b-done', `${ICON.check}<span>完成</span>`);
    p.append(tut, this.clearBtn, this.btnDone);
    tut.addEventListener('click', () => {
      act.replayTutorial();
      this.say('下一局开始时播放');
    });
    this.clearBtn.addEventListener('click', () => {
      if (this.armedT > 0) {
        this.disarm();
        act.clearBest();
        this.say('最高分已清除');
      } else {
        act.click();
        this.armedT = 3;
        this.clearLabel.textContent = '再点一次确认';
        this.clearBtn.classList.add('danger-armed');
      }
    });
    this.btnDone.addEventListener('click', () => act.done());
  }

  private say(text: string): void {
    this.note.textContent = text;
    this.note.classList.add('show');
    this.noteT = 2;
  }

  private disarm(): void {
    this.armedT = 0;
    this.clearLabel.textContent = '清除最高分';
    this.clearBtn.classList.remove('danger-armed');
  }

  sync(): void {
    for (const r of this.rows) {
      const on = r.key === 'vibration' && r.tog.disabled ? false : this.settings[r.key];
      r.tog.classList.toggle('on', on);
      r.tog.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  open(): void {
    this.sync();
    this.disarm();
    this.note.classList.remove('show');
    this.show(this.btnDone);
  }

  update(realDt: number): void {
    if (this.armedT > 0) {
      this.armedT -= realDt;
      if (this.armedT <= 0) this.disarm();
    }
    if (this.noteT > 0) {
      this.noteT -= realDt;
      if (this.noteT <= 0) this.note.classList.remove('show');
    }
  }
}
