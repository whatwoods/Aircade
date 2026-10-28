/** DOM HUD（docs §6.5）：只在变化时写；数值变化全部缓动。另含提示条、横幅队列、引导卡片与手势。 */
import { follow } from '../core/tween';
import { ballSprites, getBakeScale } from '../render/ballArt';
import { label } from '../render/palette';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const ROMAN = ['I', 'II', 'III', 'IV'];

export function templeName(stage: number): string {
  if (stage > 12) return `无尽 · 第 ${stage} 关`;
  const t = Math.floor((stage - 1) / 3);
  return `神殿 ${ROMAN[t]} · ${((stage - 1) % 3) + 1} / 3`;
}

/** 短格式：神殿 IV-3 / 无尽 14 */
export function shortStage(stage: number): string {
  if (stage > 12) return `无尽 ${stage}`;
  return `神殿 ${ROMAN[Math.floor((stage - 1) / 3)]}-${((stage - 1) % 3) + 1}`;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

interface BannerItem {
  main: string;
  sub: string;
  dur: number;
  en: boolean;
  slam: boolean;
}

export class Hud {
  readonly root = $('hud');
  private scoreEl = $('score');
  private stageEl = $('stage-label');
  private streakEl = $('streak');
  private sealEl = $('seal-val');
  private badgeEl = $('seal-badge');
  private quotaEl = $('quota');
  private progFill = $('progress-fill');
  private progHead = $('progress-head');
  private progEl = $('progress');
  private livesEl = $('lives');
  private hintEl = $('hint');
  private bannerEl = $('banner');
  private bMain = this.bannerEl.querySelector('.b-main') as HTMLElement;
  private bSub = this.bannerEl.querySelector('.b-sub') as HTMLElement;
  private tutEl = $('tut-card');
  private handEl = $('hand');
  private wildBtn = $<HTMLButtonElement>('btn-wild');
  private swapCanvas = $<HTMLCanvasElement>('swap-ball');
  // 状态缓存
  private shown = -1;
  score = 0;
  private bump = 0;
  private lastScoreStr = '';
  private prog = 0;
  private progShown = -1;
  private lastStage = -1;
  private lastSeal = '';
  private lastQuota = '';
  private lastLives = -1;
  private lastNext = -1;
  private lastWild = '';
  private record = false;
  best = 0;
  // 提示条
  private hintQ: string[] = [];
  private hintT = 0;
  // 横幅
  private bannerQ: BannerItem[] = [];
  private bannerT = 0;
  private bannerOn = false;
  // 手势
  private hand: { mode: 'off' | 'drag' | 'tap'; x0: number; y0: number; x1: number; y1: number; t: number } = { mode: 'off', x0: 0, y0: 0, x1: 0, y1: 0, t: 0 };
  private quotaFlash = -1;

  show(on: boolean, enter = false): void {
    this.root.classList.toggle('show', on);
    if (enter) {
      this.root.classList.add('enter');
      const kids = Array.from(this.root.querySelectorAll<HTMLElement>('.hud-top > *'));
      kids.forEach((k, i) => (k.style.transitionDelay = `${Math.floor(i / 3) * 60}ms`));
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('enter')));
    }
  }

  resetScore(v: number): void {
    this.score = v;
    this.shown = -1;
    this.record = false;
    this.scoreEl.classList.remove('record');
  }

  update(dt: number, target: number, p: number, blink: boolean): void {
    // 分数：指数跟随（时间常数 0.25 s）
    if (target > this.score + 0.5) {
      if (Math.round(target) !== this.shown) this.bump = Math.max(this.bump, 0.6);
      this.score = follow(this.score, target, 4, dt);
      if (target - this.score < 1) this.score = target;
    } else this.score = target;
    const v = Math.round(this.score);
    if (v !== this.shown) {
      this.shown = v;
      const s = fmt(v);
      if (s !== this.lastScoreStr) {
        this.scoreEl.textContent = s;
        this.lastScoreStr = s;
      }
      if (!this.record && this.best > 0 && v > this.best) {
        this.record = true;
        this.scoreEl.classList.add('record');
      }
    }
    if (this.bump > 0) {
      this.bump = Math.max(0, this.bump - dt * 5);
      this.scoreEl.style.transform = `scale(${(1 + 0.08 * Math.sin(this.bump * Math.PI)).toFixed(3)})`;
    }
    // 进度条
    this.prog = follow(this.prog, p, 8, dt);
    const q = Math.round(this.prog * 400) / 400;
    if (q !== this.progShown) {
      this.progShown = q;
      this.progFill.style.transform = `scaleX(${q})`;
      this.progHead.style.transform = `translateX(${(q * 358).toFixed(1)}px) rotate(45deg)`;
    }
    this.progEl.classList.toggle('blink', blink);
    // 提示条
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('show');
    } else if (this.hintQ.length && this.hintT <= -0.3) {
      this.hintEl.textContent = this.hintQ.shift()!;
      this.hintEl.classList.add('show');
      this.hintT = 2.5;
    } else this.hintT -= dt;
    // 横幅
    if (this.bannerOn) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.bannerOn = false;
        this.bannerEl.classList.remove('show', 'slam');
        this.bannerEl.classList.add('hide');
        this.bannerT = -0.25;
      }
    } else if (this.bannerT < 0) this.bannerT = Math.min(0, this.bannerT + dt);
    else if (this.bannerQ.length) this.showBanner(this.bannerQ.shift()!);
    this.updateHand(dt);
  }

  setStage(stage: number): void {
    if (stage === this.lastStage) return;
    this.lastStage = stage;
    this.stageEl.textContent = templeName(stage);
  }

  setSeal(level: number, seals: number, quota: number): void {
    const s = label(level);
    if (s !== this.lastSeal) {
      this.lastSeal = s;
      this.sealEl.textContent = s;
      this.sealEl.style.fontSize = `${[22, 22, 20, 17, 15][Math.min(4, s.length)]}px`;
    }
    const key = `${seals}/${quota}`;
    if (key !== this.lastQuota) {
      const prev = this.lastQuota ? Number(this.lastQuota.split('/')[0]) : 0;
      this.lastQuota = key;
      let html = '';
      for (let i = 0; i < quota; i++) html += `<i class="${i < seals ? 'on' : ''}"></i>`;
      this.quotaEl.innerHTML = html;
      if (seals > prev) this.quotaFlash = seals - 1;
    }
  }

  /** 金粉到达：对应菱形弹一下 */
  flashQuota(): void {
    const i = this.quotaFlash;
    const el = this.quotaEl.children[i] as HTMLElement | undefined;
    if (!el) return;
    el.animate([{ transform: 'rotate(45deg) scale(1.5)' }, { transform: 'rotate(45deg) scale(0.82)' }], { duration: 300, easing: 'cubic-bezier(0.3,1.6,0.5,1)' });
    this.badgeEl.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(0.3,1.6,0.5,1)' });
  }

  highlightSeal(on: boolean): void {
    this.badgeEl.classList.toggle('hl', on);
  }

  setLives(n: number, total: number): void {
    if (n === this.lastLives) return;
    this.lastLives = n;
    let html = '';
    for (let i = 0; i < total; i++) html += `<i class="pei${i < n ? '' : ' lost'}"></i>`;
    this.livesEl.innerHTML = html;
  }

  setStreak(n: number, mul: number, broken: boolean): void {
    const el = this.streakEl;
    if (broken) {
      if (el.classList.contains('show')) {
        el.classList.add('broken');
        el.classList.remove('show');
      }
      return;
    }
    if (n >= 2) {
      el.textContent = `连击 ×${mul.toFixed(1)}`;
      el.classList.remove('broken');
      el.classList.add('show');
      el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'cubic-bezier(0.3,1.6,0.5,1)' });
    }
  }

  setAmmo(next: number, wild: number, armed: boolean, enabled: boolean): void {
    if (next !== this.lastNext) {
      this.lastNext = next;
      this.drawMini(next);
    }
    const key = `${wild}|${armed}|${enabled}`;
    if (key !== this.lastWild) {
      this.lastWild = key;
      this.wildBtn.classList.toggle('has', wild > 0);
      this.wildBtn.classList.toggle('armed', armed);
      this.wildBtn.disabled = wild <= 0 || !enabled;
    }
  }

  redrawMini(): void {
    if (this.lastNext > 0) this.drawMini(this.lastNext);
  }

  private drawMini(level: number): void {
    const c = this.swapCanvas;
    const k = Math.max(1, Math.min(2, getBakeScale() / 1.5));
    const px = Math.round(40 * k);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, px, px);
    const sp = ballSprites(level);
    // 精灵是 56 逻辑 px（含光晕边），珠径 40
    const s = (px / 40) * 56 * 0.9;
    const o = (px - s) / 2;
    g.drawImage(sp.body, o, o, s, s);
    g.drawImage(sp.shade, o, o, s, s);
    g.drawImage(sp.num, o, o, s, s);
  }

  hint(text: string): void {
    if (this.hintQ.includes(text)) return;
    this.hintQ.push(text);
  }

  clearHints(): void {
    this.hintQ.length = 0;
    this.hintT = 0;
    this.hintEl.classList.remove('show');
  }

  banner(main: string, sub = '', dur = 1.4, en = false, slam = false): void {
    if (this.bannerQ.length > 2) this.bannerQ.shift();
    this.bannerQ.push({ main, sub, dur, en, slam });
  }

  clearBanners(): void {
    this.bannerQ.length = 0;
    this.bannerOn = false;
    this.bannerT = 0;
    this.bannerEl.classList.remove('show', 'slam', 'hide');
  }

  private showBanner(b: BannerItem): void {
    this.bMain.textContent = b.main;
    this.bMain.classList.toggle('en', b.en);
    this.bSub.innerHTML = b.sub;
    this.bSub.style.display = b.sub ? '' : 'none';
    this.bannerEl.classList.remove('hide', 'show', 'slam');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    if (b.slam) this.bannerEl.classList.add('slam');
    this.bannerOn = true;
    this.bannerT = b.dur;
  }

  tutCard(html: string | null, dim = false): void {
    if (html === null) {
      this.tutEl.classList.remove('show', 'dim');
      return;
    }
    const wrapped = `<span>${html}</span>`;
    if (this.tutEl.innerHTML !== wrapped) this.tutEl.innerHTML = wrapped;
    this.tutEl.classList.add('show');
    this.tutEl.classList.toggle('dim', dim);
  }

  private dimmed = false;

  dimTut(on: boolean): void {
    if (on === this.dimmed) return;
    this.dimmed = on;
    this.tutEl.classList.toggle('dim', on);
  }

  handDrag(x0: number, y0: number, x1: number, y1: number): void {
    this.hand = { mode: 'drag', x0, y0, x1, y1, t: 0 };
  }

  handTap(x: number, y: number): void {
    this.hand = { mode: 'tap', x0: x, y0: y, x1: x, y1: y, t: 0 };
  }

  handOff(): void {
    this.hand.mode = 'off';
    this.handEl.style.opacity = '0';
  }

  private updateHand(dt: number): void {
    const h = this.hand;
    if (h.mode === 'off') return;
    h.t += dt;
    const T = h.mode === 'drag' ? 2.0 : 1.2;
    const k = (h.t % T) / T;
    let x = h.x0, y = h.y0, a = 0, sc = 1;
    if (h.mode === 'drag') {
      // 按住 → 拖向目标（停在图腾与目标之间的 70%）→ 松开
      if (k < 0.15) {
        a = k / 0.15;
        sc = 1.1 - 0.1 * a;
      } else if (k < 0.65) {
        const e = (k - 0.15) / 0.5;
        const s = e * e * (3 - 2 * e);
        x = h.x0 + (h.x1 - h.x0) * s;
        y = h.y0 + (h.y1 - h.y0) * s;
        a = 1;
        sc = 0.92;
      } else {
        x = h.x1;
        y = h.y1;
        const e = (k - 0.65) / 0.35;
        a = 1 - e;
        sc = 0.92 + 0.15 * e;
      }
    } else {
      a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      sc = k < 0.3 ? 1.1 - (k / 0.3) * 0.2 : 0.9 + Math.min(0.2, (k - 0.3) * 0.6);
    }
    this.handEl.style.opacity = (a * 0.9).toFixed(2);
    this.handEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
  }

  /** 玉佩碎裂：从 HUD 放大到屏幕中央，裂成 5 片落下 */
  shatterPei(index: number): void {
    const host = $('shards');
    const x0 = 71 + index * 22, y0 = 40;
    const parts: HTMLElement[] = [];
    for (let i = 0; i < 5; i++) {
      const el = document.createElement('div');
      el.className = 'shard';
      const a0 = (i / 5) * 360, a1 = ((i + 1) / 5) * 360;
      const pts = ['50% 50%'];
      for (let a = a0; a <= a1 + 0.1; a += (a1 - a0) / 3) pts.push(`${(50 + 50 * Math.cos((a * Math.PI) / 180)).toFixed(1)}% ${(50 + 50 * Math.sin((a * Math.PI) / 180)).toFixed(1)}%`);
      el.style.clipPath = `polygon(${pts.join(',')})`;
      el.style.left = '0px';
      el.style.top = '0px';
      host.appendChild(el);
      parts.push(el);
      const mid = ((a0 + a1) / 2) * (Math.PI / 180);
      const dx = Math.cos(mid) * 60, dy = Math.sin(mid) * 30;
      el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(0.3)`, opacity: 1 },
          { transform: 'translate(195px, 380px) scale(1.6)', opacity: 1, offset: 0.4 },
          { transform: `translate(${195 + dx}px, ${380 + dy}px) scale(1.6) rotate(${(i - 2) * 6}deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${195 + dx * 1.6}px, ${720 + dy}px) scale(1.4) rotate(${(i - 2) * 50}deg)`, opacity: 0 },
        ],
        { duration: 1100, easing: 'cubic-bezier(0.4,0,0.7,1)', fill: 'forwards' },
      );
    }
    window.setTimeout(() => parts.forEach((p) => p.remove()), 1200);
  }
}
