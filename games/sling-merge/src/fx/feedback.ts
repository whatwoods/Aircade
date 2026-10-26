/**
 * 反馈分发（docs §5.1 / §5.2）：订阅玩法事件 → 按档位分发 震屏 / hitstop / 慢动作 / 缩放冲击 / 闪白 /
 * 粒子 / 跳字 / 横幅 / 音效 / 震动。连击 ≥3 合成档 +1、≥5 再 +1（最高 T3，T4 只给 L11 事件）。
 * 关闭屏幕震动或系统减弱动效：trauma、缩放、闪白 ×0，慢动作保留，粒子 ×0.6。
 */
import type { Music } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import { CONFIG, fruitDef } from '../config';
import { bus, type GameEvent } from '../core/events';
import type { Loop } from '../core/loop';
import { rngFx } from '../core/rng';
import type { AudioEngine } from '../audio/audio';
import { setExpr } from '../game/fruits';
import type { Game } from '../game/game';
import {
  C_GOLD, C_MINT, C_PINK, C_WHITE, P_BUBBLE, P_CONFETTI, P_DUST, P_JUICE, P_SEED, P_SPARKLE, P_STAR, P_STREAK, RAINBOW,
} from '../render/particles';
import type { Renderer } from '../render/renderer';
import type { TextStyle } from '../render/popups';

const FX = CONFIG.fx;
const TAU = Math.PI * 2;
/** 妙击 / 救场小字（16–18px）在盖子下方的最高位置：内腔顶 + 上浮 36 + 半字高 */
const POP_MIN_Y = CONFIG.layout.jar.inner.T + 36 + 13;
const COMBO_STYLE: TextStyle[] = ['white', 'white', 'orange', 'coral', 'rose', 'violet'];

interface Delayed {
  t: number;
  kind: number;
  x: number;
  y: number;
  n: number;
}
const D_CROWN = 1;
const D_BANNER_RAINBOW = 2;
const D_POPUP_RAINBOW = 3;
const D_CONFETTI = 4;

export class Feedback {
  private g: Game;
  private r: Renderer;
  private loop: Loop;
  private sfx: Sfx;
  private music: Music;
  private audio: AudioEngine;
  vibration = true;
  private shake = true;
  private reduced = false;
  private warnedThisRun = false;
  private bubbleT = 0;
  private delayed: Delayed[] = [];

  constructor(g: Game, r: Renderer, loop: Loop, sfx: Sfx, music: Music, audio: AudioEngine) {
    this.g = g;
    this.r = r;
    this.loop = loop;
    this.sfx = sfx;
    this.music = music;
    this.audio = audio;
    for (let i = 0; i < 8; i++) this.delayed.push({ t: -1, kind: 0, x: 0, y: 0, n: 0 });
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reduced = mq.matches;
      mq.addEventListener?.('change', (e) => {
        this.reduced = e.matches;
        this.apply();
      });
    } catch {
      /* ignore */
    }
    this.apply();
    bus.on(this.onEvent);
  }

  setShake(on: boolean): void {
    this.shake = on;
    this.apply();
  }

  private apply(): void {
    const motion = this.shake && !this.reduced;
    this.r.shakeEnabled = motion;
    this.r.particles.mul = (this.r.quality <= 1 ? 0.6 : 1) * (motion ? 1 : 0.6);
  }

  /** 画质变化后重新计算粒子倍率 */
  refresh(): void {
    this.apply();
  }

  vibrate(p: number | number[]): void {
    if (!this.vibration) return;
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(p);
    } catch {
      /* ignore */
    }
  }

  private later(t: number, kind: number, x = 0, y = 0, n = 0): void {
    for (const d of this.delayed) {
      if (d.t < 0) {
        d.t = t;
        d.kind = kind;
        d.x = x;
        d.y = y;
        d.n = n;
        return;
      }
    }
  }

  /** 每帧：延时动作、飞行气泡、绷紧音 */
  update(realDt: number, gameDt: number): void {
    for (const d of this.delayed) {
      if (d.t < 0) continue;
      d.t -= realDt;
      if (d.t <= 0) {
        d.t = -1;
        this.fire(d);
      }
    }
    const f = this.g.flying;
    if (f && f.body.alive && gameDt > 0) {
      this.bubbleT -= gameDt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.03;
        const b = f.body;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        this.r.particles.spawn(
          P_BUBBLE, C_WHITE, b.x - (b.vx / sp) * b.r * 0.9 + (rngFx.next() - 0.5) * b.r * 0.6, b.y - (b.vy / sp) * b.r * 0.9,
          (rngFx.next() - 0.5) * 40, 20, 0.6 + rngFx.next() * 0.4, 2 + rngFx.next() * 3, 2, -160,
        );
      }
    }
    const s = this.g.sling;
    if (s.aiming && s.valid) this.sfx.aimPower(s.power);
  }

  private fire(d: Delayed): void {
    const r = this.r;
    switch (d.kind) {
      case D_CROWN:
        this.sfx.crownDing();
        r.particles.burst(P_SPARKLE, C_GOLD, d.x, d.y, 8, 80, 220, 0.4, 0.7, 6, 11, 4, -60);
        break;
      case D_BANNER_RAINBOW:
        r.popups.banner('彩虹大西瓜！', 'gold', 2.2);
        this.vibrate([30, 40, 70]);
        r.addTrauma(FX.tiers[4]!.trauma);
        break;
      case D_POPUP_RAINBOW:
        r.popups.add('彩虹诞生 +300', d.x, d.y, 22, 'gold', '', 1.3);
        break;
      case D_CONFETTI:
        this.confetti(d.x, d.y, d.n);
        break;
    }
  }

  private confetti(x: number, y: number, n: number): void {
    const P = this.r.particles;
    const m = P.budget(n);
    for (let i = 0; i < m; i++) {
      const a = -Math.PI / 2 + (rngFx.next() - 0.5) * 2.4;
      const sp = 260 + rngFx.next() * 420;
      P.spawn(
        P_CONFETTI, RAINBOW[i % RAINBOW.length]!, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        1.8 + rngFx.next() * 1.2, 4 + rngFx.next() * 3, 2.2, -50,
      );
    }
  }

  private readonly onEvent = (e: GameEvent): void => {
    const g = this.g;
    const r = this.r;
    const P = r.particles;
    const sfx = this.sfx;
    switch (e.t) {
      case 'aimStart':
        sfx.aimStart();
        r.sling.onAimStart();
        break;
      case 'aimStep':
        sfx.aimStep();
        break;
      case 'aimMax': {
        sfx.aimMax();
        this.vibrate(8);
        r.sling.onMax();
        const Pp = CONFIG.layout.sling.pouch;
        P.burst(P_STAR, C_GOLD, Pp.x + g.sling.pouchX, Pp.y + g.sling.pouchY, 2, 60, 120, 0.4, 0.6, 7, 9, 3, -40, 14);
        break;
      }
      case 'aimCancel': {
        sfx.cancel();
        const Pp = CONFIG.layout.sling.pouch;
        if (g.scene === 'playing') r.popups.add(g.sling.loaded === null ? '还没装好' : '取消', Pp.x, Pp.y - 64, 14, 'white', '', 0.7);
        break;
      }
      case 'launch': {
        sfx.launch(e.power);
        if (e.power > 0.8) this.vibrate(6);
        r.addTrauma(FX.tiers[1]!.trauma * e.power);
        for (let i = 0; i < 4; i++) {
          P.spawn(P_BUBBLE, C_WHITE, e.x + (rngFx.next() - 0.5) * 20, e.y + 6, -e.dx * 60 + (rngFx.next() - 0.5) * 60, 40, 0.7, 3 + rngFx.next() * 3, 2, -140);
        }
        for (let i = 0; i < 3; i++) {
          const side = i - 1;
          P.spawn(P_STREAK, C_WHITE, e.x + side * 12, e.y, e.dx * 380 - e.dy * side * 60, e.dy * 380 + e.dx * side * 60, 0.22, 16, 6, 0);
        }
        break;
      }
      case 'reload': {
        r.sling.onReload(e.level);
        if (g.scene === 'playing') {
          sfx.reload();
          const Pp = CONFIG.layout.sling.pouch;
          P.burst(P_SPARKLE, C_WHITE, Pp.x, Pp.y - 4, 2, 50, 90, 0.35, 0.5, 6, 8, 3, -30, 16);
        }
        break;
      }
      case 'nextChanged':
        r.hud.onNextChanged(e.level);
        break;
      case 'wallBounce': {
        sfx.wall(e.speed);
        P.ring(e.x, e.y, 10, 30, 0.25, 4, C_WHITE);
        P.burst(P_SPARKLE, C_WHITE, e.x, e.y, 6, 60, 200, 0.25, 0.45, 5, 9, 5, 0);
        break;
      }
      case 'impact': {
        if (e.strong) {
          sfx.impactHard();
          this.vibrate(10);
          this.loop.addHitstop(0.03);
          r.addTrauma(FX.tiers[1]!.trauma);
          P.ring(e.x, e.y, 8, 46, 0.15, 7, C_WHITE);
          for (let i = 0; i < 8; i++) {
            const a = (i * TAU) / 8 + rngFx.next() * 0.2;
            P.spawn(P_STREAK, C_WHITE, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, Math.cos(a) * 520, Math.sin(a) * 520, 0.15, 14, 8, 0);
          }
          P.burst(P_DUST, C_GOLD, e.x, e.y, 8, 120, 320, 0.3, 0.5, 6, 10, 5, 0);
        } else {
          sfx.impactSoft();
          const fa = g.fruitById(e.a);
          const lv = fa ? fa.level : 1;
          P.burst(P_JUICE, lv - 1, e.x, e.y, 4, 80, 200, 0.3, 0.5, 2, 4, 5, -120);
        }
        break;
      }
      case 'bump':
        sfx.bump(e.speed);
        break;
      case 'merge':
        this.onMerge(e);
        break;
      case 'pop': {
        sfx.popIndex(e.index);
        P.burst(P_JUICE, e.level - 1, e.x, e.y, 6, 120, 320, 0.4, 0.7, 2, 5, 4, -160, e.r * 0.4);
        P.burst(P_BUBBLE, C_WHITE, e.x, e.y, 3, 30, 90, 0.6, 1.0, 3, 6, 2, -160, e.r * 0.5);
        P.ring(e.x, e.y, e.r * 0.6, e.r * 1.4, 0.22, 4, C_WHITE);
        break;
      }
      case 'clutch': {
        sfx.clutch();
        this.vibrate(15);
        P.burst(P_STAR, C_GOLD, e.x, e.y, 10, 120, 320, 0.5, 0.8, 7, 11, 4, -80);
        break;
      }
      case 'danger':
        if (e.level >= 1 && !this.warnedThisRun) {
          this.warnedThisRun = true;
          sfx.warn();
        }
        this.audio.setDanger(e.level === 2);
        this.music.setDanger(e.level === 2);
        break;
      case 'dangerTick':
        sfx.dangerTick(e.left);
        r.hud.onTick(e.left);
        this.vibrate(8);
        r.addTrauma(0.1);
        break;
      case 'dangerClear': {
        sfx.dangerClear();
        r.jar.sweep();
        const J = CONFIG.layout.jar.inner;
        for (let i = 0; i < 10; i++) {
          P.spawn(P_SPARKLE, C_WHITE, J.L + 10 + rngFx.next() * (J.R - J.L - 20), CONFIG.layout.dangerY, 0, -30 - rngFx.next() * 40, 0.5 + rngFx.next() * 0.3, 6 + rngFx.next() * 4, 2, 0);
        }
        const line = CONFIG.layout.dangerY - CONFIG.danger.warnDistance;
        for (const f of g.fruits) if (f.state === 'active' && f.body.y + f.body.r > line) setExpr(f.vis, 'relief', 0.6);
        break;
      }
      case 'newBest': {
        sfx.newBest();
        r.popups.record();
        r.hud.onBestBump();
        const S = CONFIG.layout.hud.score;
        P.burst(P_STAR, C_GOLD, S.x, S.baseY - 14, 6, 80, 200, 0.5, 0.8, 7, 10, 4, 0, 30);
        break;
      }
      case 'gameOver':
        sfx.stopTension();
        sfx.gameOver();
        this.vibrate(40);
        this.loop.addHitstop(0.2);
        r.addTrauma(FX.tiers[3]!.trauma);
        this.audio.setDanger(false);
        this.music.setDanger(false);
        break;
      case 'scene':
        if (e.scene === 'playing') {
          this.warnedThisRun = false;
          r.hud.reset(g);
          r.hud.intro();
          r.sling.intro();
          r.popups.clear();
          r.particles.clear();
          r.resetEffects();
          this.music.play('game');
          this.audio.setDanger(false);
          this.music.setDanger(false);
        } else if (e.scene === 'title') {
          r.sling.hide();
          r.popups.clear();
          r.particles.clear();
          r.resetEffects();
          this.music.play('game');
          this.audio.setDanger(false);
          this.music.setDanger(false);
        } else if (e.scene === 'results') {
          this.music.play('results');
        }
        break;
      case 'banner':
        r.popups.banner(e.text, e.kind, 2.2);
        break;
      default:
        break;
    }
  };

  private onMerge(e: Extract<GameEvent, { t: 'merge' }>): void {
    const g = this.g;
    const r = this.r;
    const P = r.particles;
    const sfx = this.sfx;
    const L = e.level;
    const x = e.x;
    const y = e.y;
    const nr = e.newR;
    const ci = L - 1;
    const pci = e.parentLevel - 1;
    // 融合残影
    if (!e.superMerge) {
      P.ghost(e.parentLevel, e.ax, e.ay, x, y, CONFIG.merge.fuseTime);
      P.ghost(e.parentLevel, e.bx, e.by, x, y, CONFIG.merge.fuseTime);
    }
    // 档位
    let tier = L <= 4 ? 1 : L <= 7 ? 2 : 3;
    if (e.combo >= 3) tier++;
    if (e.combo >= 5) tier++;
    if (e.clutch) tier++;
    tier = Math.min(3, tier);
    const quiet = g.scene !== 'playing';
    // 音效
    if (!quiet) {
      if (e.superMerge) sfx.superMerge();
      else if (L === 11) sfx.fanfare(!e.firstRainbow);
      sfx.merge(L, e.combo);
      if (e.combo >= 2) sfx.combo(e.combo, L);
      if (e.trick) sfx.trick();
      if (e.discovery) sfx.discovery();
    }
    if (e.combo >= 3 && !quiet) this.music.comboBoost();

    const nf = e.newId > 0 ? g.fruitById(e.newId) : null;

    if (e.superMerge) {
      // 超级合成：白光爆开 + 全屏冲击波 + 彩虹环
      this.loop.addHitstop(0.15);
      const S = FX.slowmo;
      this.loop.slowmo(S.scale, 0.15 + S.duration / S.scale, S.easeBack);
      r.zoomHold(0.06, x, y, 0.15 + S.duration / S.scale);
      r.flash(FX.tiers[4]!.flash, 0.08);
      r.addTrauma(FX.tiers[4]!.trauma);
      this.vibrate([40, 30, 40, 30, 90]);
      P.ring(x, y, 20, 520, 0.6, 14, C_WHITE);
      P.ring(x, y, 20, 420, 0.6, 10, C_PINK, 0.05);
      P.ring(x, y, 20, 320, 0.6, 8, C_MINT, 0.1);
      P.rays(x, y, 16, 300, 1.4, true);
      P.burst(P_STAR, C_GOLD, x, y, 30, 200, 600, 0.6, 1.0, 8, 13, 3, -60, 20);
      this.confetti(x, y, 80);
      r.popups.add('超级合成 +' + e.gained, x, y - 40, 30, 'gold', e.combo >= 2 ? '连击×' + e.combo : '', 1.4);
      return;
    }

    if (L === 11) {
      if (e.firstRainbow) {
        // 高潮分镜（§4.8 ③）
        const S = FX.slowmo;
        const hs = FX.tiers[4]!.hitstop;
        const slowDur = hs + S.duration / S.scale;
        this.loop.addHitstop(hs);
        this.loop.slowmo(S.scale, slowDur, S.easeBack);
        r.zoomHold(0.06, x, y, slowDur);
        r.flash(FX.tiers[4]!.flash, 0.034);
        P.rays(x, y, 16, 260, slowDur + 0.6, true);
        P.ring(x, y, nr, nr * 3, 0.45, 8, C_WHITE);
        P.ring(x, y, nr, nr * 3, 0.45, 7, C_PINK, 0.05);
        P.ring(x, y, nr, nr * 3, 0.45, 6, C_MINT, 0.1);
        P.burst(P_JUICE, ci, x, y, 40, 150, 450, 0.5, 0.8, 2, 6, 4, -200, nr * 0.4);
        P.burst(P_SEED, C_WHITE, x, y, 12, 150, 380, 0.6, 0.9, 5, 7, 4, -200, nr * 0.3);
        P.burst(P_STAR, C_GOLD, x, y, 20, 180, 480, 0.6, 1.0, 8, 12, 3, -80, nr * 0.5);
        this.later(0.12, D_CONFETTI, x, y, 60);
        for (let i = 0; i < 4; i++) P.splat(L, x + (rngFx.next() - 0.5) * nr * 1.6, y + (rngFx.next() - 0.5) * nr * 1.6, 1.2 + rngFx.next() * 0.4);
        if (nf) {
          nf.vis.scale = 0.4;
          nf.vis.scaleV = 9;
          r.crownDropId = nf.id;
          r.crownDropT = 0;
        }
        this.later(0.12 + 0.65 / S.scale * 0.5, D_CROWN, x, y - nr);
        this.later(0.5, D_BANNER_RAINBOW);
        r.popups.add('+' + (e.gained - CONFIG.score.firstRainbow), x, y - nr - 8, 34, 'gold', e.combo >= 2 ? '连击×' + e.combo : '', 1.3);
        this.later(0.55, D_POPUP_RAINBOW, x, y - nr - 50);
        return;
      }
      // 16b 再次合成 L11：简化版
      this.loop.addHitstop(0.09);
      r.addTrauma(FX.tiers[3]!.trauma);
      r.zoomPunch(FX.tiers[3]!.zoom, x, y);
      r.flash(FX.tiers[3]!.flash);
      this.vibrate(30);
      P.rays(x, y, 12, 220, 0.7, true);
      P.ring(x, y, nr, nr * 3, 0.4, 8, C_WHITE);
      P.ring(x, y, nr, nr * 3, 0.4, 7, C_PINK, 0.05);
      P.ring(x, y, nr, nr * 3, 0.4, 6, C_MINT, 0.1);
      P.burst(P_JUICE, ci, x, y, 30, 150, 420, 0.5, 0.8, 2, 6, 4, -200, nr * 0.4);
      P.burst(P_STAR, C_GOLD, x, y, 14, 160, 420, 0.5, 0.9, 8, 12, 3, -80, nr * 0.5);
      this.confetti(x, y, 16);
      if (nf) {
        nf.vis.scale = 0.55;
        nf.vis.scaleV = 6;
      }
      r.popups.banner('彩虹大西瓜！', 'gold', 1.6);
      r.popups.add('+' + e.gained, x, y - nr - 8, 30, 'gold', e.combo >= 2 ? '连击×' + e.combo : '', 1.1);
      return;
    }

    // ── 普通合成 L2–L10 ──
    const T = FX.tiers[tier]!;
    const hitstop = L <= 4 ? (L === 4 ? 0.016 : 0) : L <= 7 ? 0.035 : 0.07;
    this.loop.addHitstop(Math.max(hitstop, tier >= 2 ? T.hitstop * 0.5 : 0));
    r.addTrauma(T.trauma + (e.combo >= 5 ? 0.04 * (e.combo - 4) : 0));
    if (tier >= 2) r.flash(L >= 8 ? FX.tiers[3]!.flash : FX.tiers[2]!.flash);
    if (L >= 8 || tier >= 3) r.zoomPunch(L >= 8 ? FX.tiers[3]!.zoom : T.zoom, x, y);
    if (L >= 8) this.vibrate(25);
    else if (L >= 5) this.vibrate(10);
    else if (e.combo >= 5) this.vibrate(8);
    // 圆环
    P.ring(x, y, nr, nr * 2.6, 0.3, 6, C_WHITE);
    if (L >= 5) P.ring(x, y, nr, nr * 2.4, 0.32, 5, C_MINT, 0.05);
    if (L >= 8) P.rays(x, y, 8, 160 + nr, 0.5, false);
    // 溅痕
    const splats = L <= 4 ? 2 : L <= 7 ? 3 : 4;
    for (let i = 0; i < splats; i++) {
      const a = rngFx.next() * TAU;
      const d = nr * (0.5 + rngFx.next() * 0.8);
      P.splat(L, x + Math.cos(a) * d, y + Math.sin(a) * d, (0.5 + nr / 70) * (0.8 + rngFx.next() * 0.4));
    }
    // 粒子
    const juice = L <= 4 ? 10 : L <= 7 ? 16 : 24;
    P.burst(P_JUICE, ci, x, y, Math.round(juice * 0.7), 150, 450, 0.5, 0.8, 2, 6, 4, -200, nr * 0.4);
    P.burst(P_JUICE, pci, x, y, Math.round(juice * 0.3), 150, 400, 0.5, 0.8, 2, 5, 4, -200, nr * 0.4);
    if (L <= 4) P.burst(P_SPARKLE, C_WHITE, x, y, 4, 80, 220, 0.3, 0.5, 6, 9, 4, -40, nr * 0.6);
    else P.burst(P_STAR, C_GOLD, x, y, L <= 7 ? 6 : 10, 120, 360, 0.5, 0.8, 7, 11, 4, -60, nr * 0.5);
    if (L === 7 || L >= 8) P.burst(P_SEED, C_WHITE, x, y, L === 7 ? 6 : 8, 120, 320, 0.5, 0.8, 3.5, 5, 4, -160, nr * 0.3);
    if (e.trick) P.burst(P_STAR, C_MINT, x, y, 6, 100, 260, 0.5, 0.7, 7, 10, 4, -40, 8);
    if (e.discovery) {
      P.burst(P_STAR, C_GOLD, x, y, 8, 120, 300, 0.6, 0.9, 7, 11, 3, -60, nr);
      r.popups.top('新发现：' + fruitDef(L).name + '！', L);
    }
    if (e.firstOfRun) r.hud.onFlip(L);
    // 跳字
    const size = tier <= 1 ? 18 : tier === 2 ? 24 : 30;
    const style: TextStyle = e.combo >= 2 ? COMBO_STYLE[Math.min(5, e.combo)]! : 'white';
    const sub = e.combo >= 2 ? '连击×' + e.combo : '';
    // 叠在上面的小字（妙击 / 救场）也要留在盖子下方
    const stack = e.trick && e.clutch ? 50 : e.trick || e.clutch ? 26 : 0;
    let py = Math.max(y - nr - 6, POP_MIN_Y + stack);
    if (e.trick) {
      r.popups.add('反弹妙击 ×1.5', x, py - 26, 16, 'mint', '', 1.0);
    }
    if (e.clutch) {
      r.popups.add('惊险救场 +' + CONFIG.score.clutchBonus, x, py - (e.trick ? 50 : 26), 18, 'gold', '', 1.1);
    }
    if (quiet) return;
    r.popups.score(e.gained, x, py, size, style, sub);
    py = 0;
  }
}
