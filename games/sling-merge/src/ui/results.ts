/**
 * 结算面板（docs §4.8 ④ / §6.6）：粉色缎带「满杯啦！」、本局最大水果（笑中带泪）、
 * 分数 1.2 s expoOut 滚动（嗒嗒声）、最高分、新纪录金印章 + 50 片彩纸 + 铃声琶音、2×2 统计卡、
 * 「再来一局」（Enter / R）「回到标题」。
 */
import { fruitDef } from '../config';
import { ease, formatScore } from '../core/math';
import type { Game } from '../game/game';
import { drawIdleFace } from '../render/faces';
import type { Sprites } from '../render/sprites';
import { dropPath } from '../render/util';
import { ICON } from './icons';
import { canvasFrom, jellyButton, Overlay, portrait } from './overlay';

export interface ResultsActions {
  again(): void;
  home(): void;
  roll(): void;
  record(): void;
}

const CONFETTI_COLORS = ['#FF6F91', '#FFB13D', '#FFE15A', '#5FD3B3', '#7C86FF', '#B07CFF', '#FFFFFF'];
const ROLL_DELAY = 0.4;
const ROLL_DUR = 1.2;

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}

export class ResultsPanel extends Overlay {
  readonly btnAgain: HTMLButtonElement;
  private game: Game;
  private sprites: Sprites;
  private act: ResultsActions;
  private fruitBox: HTMLElement;
  private scoreEl: HTMLElement;
  private bestEl: HTMLElement;
  private stamp: HTMLElement;
  private confetti: HTMLElement;
  private sBiggest: HTMLElement;
  private sCombo: HTMLElement;
  private sMerges: HTMLElement;
  private sTime: HTMLElement;
  private t = -1;
  private final = 0;
  private shown = -1;
  private record = false;
  private recordDone = false;

  constructor(root: HTMLElement, game: Game, sprites: Sprites, act: ResultsActions) {
    super(root, 'results', '结算');
    this.game = game;
    this.sprites = sprites;
    this.act = act;
    const p = this.panel;
    p.innerHTML =
      '<div class="ribbon"><div class="tail l"></div><div class="tail r"></div><div class="fold l"></div><div class="fold r"></div>' +
      '<div class="band"><span class="candy">满杯啦！</span></div></div>' +
      '<div class="r-fruit"></div>' +
      '<div class="r-label">本局得分</div>' +
      '<div class="r-score">0</div>' +
      `<div class="r-best">${ICON.crown}<span>最高分 <b>0</b></span></div>` +
      '<div class="stamp" aria-hidden="true">新纪录！</div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="k">最大水果</div><div class="v s-big"></div></div>' +
      '<div class="stat"><div class="k">最高连击</div><div class="v s-combo"></div></div>' +
      '<div class="stat"><div class="k">合成次数</div><div class="v s-merges"></div></div>' +
      '<div class="stat"><div class="k">用时</div><div class="v s-time"></div></div>' +
      '</div>' +
      '<div class="confetti"></div>';
    this.fruitBox = p.querySelector('.r-fruit')!;
    this.scoreEl = p.querySelector('.r-score')!;
    this.bestEl = p.querySelector('.r-best b')!;
    this.stamp = p.querySelector('.stamp')!;
    this.confetti = p.querySelector('.confetti')!;
    this.sBiggest = p.querySelector('.s-big')!;
    this.sCombo = p.querySelector('.s-combo')!;
    this.sMerges = p.querySelector('.s-merges')!;
    this.sTime = p.querySelector('.s-time')!;
    this.btnAgain = jellyButton('primary b-again', `${ICON.retry}<span>再来一局</span>`);
    const home = jellyButton('secondary b-title', `${ICON.home}<span>回到标题</span>`);
    p.append(this.btnAgain, home);
    this.btnAgain.addEventListener('click', () => act.again());
    home.addEventListener('click', () => act.home());
    // 50 片彩纸（预建，复用）
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 50; i++) {
      const c = document.createElement('i');
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const sp = 120 + Math.random() * 200;
      c.style.setProperty('--x', `${Math.round(Math.cos(a) * sp * 1.2)}px`);
      c.style.setProperty('--y', `${Math.round(Math.sin(a) * sp)}px`);
      c.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 900)}deg`);
      c.style.setProperty('--d', `${(1.3 + Math.random() * 0.9).toFixed(2)}s`);
      c.style.setProperty('--w', `${(Math.random() * 0.12).toFixed(2)}s`);
      c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
      if (i % 3 === 0) {
        c.style.width = '10px';
        c.style.height = '6px';
      } else if (i % 3 === 1) {
        c.style.borderRadius = '50%';
        c.style.width = '8px';
        c.style.height = '8px';
      }
      frag.appendChild(c);
    }
    this.confetti.appendChild(frag);
    this.confetti.style.left = '171px';
    this.confetti.style.top = '10px';
  }

  open(): void {
    const g = this.game;
    const run = g.run;
    this.final = run.score;
    this.record = run.newRecord && run.score > 0;
    this.recordDone = false;
    this.shown = -1;
    this.t = 0;
    this.scoreEl.textContent = '0';
    this.scoreEl.classList.remove('gold');
    this.stamp.classList.remove('show');
    this.confetti.classList.remove('go');
    this.bestEl.textContent = formatScore(this.record ? run.bestAtStart : g.best);
    const ratio = this.sprites.ratio;
    // 最大水果（笑中带泪）
    const lv = Math.max(1, run.highestLevel);
    this.fruitBox.textContent = '';
    const big = portrait(lv, 80, ratio, 'relief', (ctx, r) => {
      // 一滴泪
      ctx.save();
      ctx.fillStyle = '#8FD8FF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      ctx.beginPath();
      dropPath(ctx, r * 0.42, r * 0.32, r * 0.13);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    const css = parseFloat(big.style.width);
    big.style.marginTop = `${Math.round(46 - css / 2)}px`;
    this.fruitBox.appendChild(big);
    // 统计
    this.sBiggest.textContent = '';
    const ic = canvasFrom(this.sprites.icon(lv, 26, drawIdleFace), this.sprites.iconExtent(lv, 26));
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = fruitDef(lv).name;
    this.sBiggest.append(ic, nm);
    this.sCombo.textContent = run.maxCombo >= 2 ? `×${run.maxCombo}` : '—';
    this.sMerges.textContent = String(run.merges);
    this.sTime.innerHTML = `${mmss(run.time)} <small>发射 ${run.shots} 次</small>`;
    this.show(this.btnAgain);
  }

  close(instant = false): void {
    this.t = -1;
    this.hide(instant);
  }

  update(realDt: number): void {
    if (this.t < 0 || !this.isOpen) return;
    this.t += realDt;
    const k = Math.max(0, Math.min(1, (this.t - ROLL_DELAY) / ROLL_DUR));
    const v = Math.round(this.final * ease.expoOut(k));
    if (v !== this.shown) {
      this.shown = v;
      this.scoreEl.textContent = formatScore(v);
      if (k > 0 && k < 1) this.act.roll();
    }
    if (this.record && !this.recordDone && this.t >= ROLL_DELAY + ROLL_DUR + 0.05) {
      this.recordDone = true;
      this.scoreEl.classList.add('gold');
      this.bestEl.textContent = formatScore(this.final);
      this.stamp.classList.add('show');
      this.confetti.classList.add('go');
      this.act.record();
    }
  }

  /** 跳过滚动（点击分数或按键） */
  finish(): void {
    if (this.t >= 0 && this.t < ROLL_DELAY + ROLL_DUR) this.t = ROLL_DELAY + ROLL_DUR;
  }
}
