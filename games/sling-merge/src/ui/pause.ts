/**
 * 暂停面板（docs §6.5）：标题「暂停中」+ 犯困的李子；进化图鉴 6 + 5（36 px 图标 + 11 px 名字，未发现「?」）；
 * 「继续」「重新开始」「设置」「回到标题」。
 */
import { CONFIG, fruitDef } from '../config';
import type { Game } from '../game/game';
import { drawIdleFace } from '../render/faces';
import type { Sprites } from '../render/sprites';
import { ICON } from './icons';
import { canvasFrom, jellyButton, Overlay, portrait } from './overlay';

export interface PauseActions {
  resume(): void;
  restart(): void;
  settings(): void;
  home(): void;
}

export class PausePanel extends Overlay {
  readonly btnContinue: HTMLButtonElement;
  private codex: HTMLElement;
  private plum: HTMLElement;
  private sprites: Sprites;
  private game: Game;
  private builtKey = '';

  constructor(root: HTMLElement, game: Game, sprites: Sprites, act: PauseActions) {
    super(root, 'pause', '暂停');
    this.game = game;
    this.sprites = sprites;
    const p = this.panel;
    p.innerHTML =
      '<h2><span class="plum"></span><span>暂停中</span></h2>' +
      '<div class="codex-title">进化图鉴</div><div class="codex"></div>';
    this.plum = p.querySelector('.plum')!;
    this.codex = p.querySelector('.codex')!;
    this.btnContinue = jellyButton('primary b-continue', `${ICON.play}<span>继续</span>`);
    const restart = jellyButton('secondary b-restart', `${ICON.retry}<span>重新开始</span>`);
    const settings = jellyButton('tertiary b-settings', `${ICON.gear}<span>设置</span>`);
    const home = jellyButton('tertiary b-home', `${ICON.home}<span>回到标题</span>`);
    p.append(this.btnContinue, restart, settings, home);
    this.btnContinue.addEventListener('click', () => act.resume());
    restart.addEventListener('click', () => act.restart());
    settings.addEventListener('click', () => act.settings());
    home.addEventListener('click', () => act.home());
  }

  open(): void {
    this.build();
    this.show(this.btnContinue);
  }

  private build(): void {
    const g = this.game;
    const disc = Math.max(g.discovered, g.run.highestLevel);
    const ratio = this.sprites.ratio;
    const key = `${disc}|${ratio.toFixed(2)}|${g.run.highestLevel}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    // 犯困的李子
    this.plum.textContent = '';
    const pc = portrait(8, 34, ratio, 'sleepy');
    pc.style.width = '46px';
    pc.style.height = '46px';
    this.plum.appendChild(pc);
    // 图鉴
    this.codex.textContent = '';
    const frag = document.createDocumentFragment();
    for (let lv = 1; lv <= CONFIG.maxLevel; lv++) {
      const known = lv <= disc;
      const cell = document.createElement('div');
      cell.className = 'cell' + (known ? '' : ' unk');
      const pic = document.createElement('div');
      pic.className = 'pic';
      const ext = this.sprites.iconExtent(lv, 36);
      const src = known ? this.sprites.icon(lv, 36, drawIdleFace) : this.sprites.silhouette(lv, 36);
      pic.appendChild(canvasFrom(src, ext));
      if (!known) {
        const q = document.createElement('span');
        q.className = 'q';
        q.textContent = '?';
        pic.appendChild(q);
      }
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = known ? fruitDef(lv).name.replace('彩虹', '') : '？？？';
      if (known && lv === 11) nm.textContent = '彩虹西瓜';
      cell.append(pic, nm);
      if (known && lv <= g.run.highestLevel && lv > 5 && g.scene === 'playing') cell.title = '本局已合成';
      frag.appendChild(cell);
    }
    this.codex.appendChild(frag);
  }
}
