// Feedback director: logic event → particles / rings / flashes / floaters / sfx / trauma / hitstop / haptics,
// following the juice table (docs §5.1–§5.2). Also owns the ambient per-frame effects (embers, charge sparks,
// thruster sparks, low-HP pulse) and the screen-effect state the post pass reads every frame.
import { config, juice, juiceRules, pal } from '../config';
import type { FxEventId } from '../config';
import { Rng, FX_SEED_XOR } from '../core/rng';
import { settings } from '../core/settings';
import type { FxSink } from '../types';
import type { Game } from '../game/game';
import { KIND_MAIN } from '../game/balls';
import type { Frame } from '../render/atlas';
import type { Sprites } from '../render/sprites';
import type { Camera } from '../render/camera';
import type { WorldView } from '../render/draw-world';
import { HALO, BRICK_STROKE } from '../render/draw-world';
import type { Background } from '../render/background';
import {
  Particles, P_STRETCH, P_FLOOR, P_GROW, P_FADE_SQ, P_FADE_LATE, P_HIGH, P_FLICKER,
} from './particles';
import type { Floaters } from './floaters';
import { sfx } from '../audio/sfx';
import { audio } from '../audio/audio';
import { music } from '../audio/music';
import { C_PLUS } from '../render/text';

const F = config.field;
const TAU = Math.PI * 2;

// particle frame indices (Particles.frames)
export const FR_SPARK = 0;
export const FR_TRI = 1;
export const FR_GLOW = 2;
export const FR_RING = 3;
export const FR_STAR = 4;
export const FR_HEX = 5;
export const FR_FROST = 6;
export const FR_SMOKE = 7;
export const FR_DIAMOND = 8;
export const FR_SQUARE = 9;
export const FR_CROSS = 10;
export const FR_DISC = 11;
export const FR_FLAME = 12;
export const FR_RINGSOFT = 13;
export const FR_GLOWT = 14;
export const FR_RETICLE = 15;
export const FR_CROWN = 16;
export const FR_HEXFILL = 17;

export function particleFrames(s: Sprites): Frame[] {
  return [
    s.spark, s.tri, s.glow, s.ring, s.star4, s.hex, s.frost, s.smoke, s.diamond, s.square, s.cross, s.disc,
    s.flame, s.ringSoft, s.glowTight, s.reticle, s.crown, s.hexFill,
  ];
}

export interface FxHost {
  hitstop(ms: number, tier: number): void;
  slowmo(scale: number, realDur: number, rampBack: number): void;
  banner(ev: FxEventId, a: number, b: number): void;
}

const TIER_COLORS = [0xede9ff, 0x2ee6ff, 0xb6ff2e, 0xff7a1a, 0xff2fd0, 0xffffff];
const CONFETTI = [0x2ee6ff, 0xff2fd0, 0xffc94d, 0xb6ff2e, 0xff7a1a, 0xbfb3ff];
const PRISM_RGB = [0x2ee6ff, 0xff2fd0, 0xffe14d, 0xffffff];

export class Feedback implements FxSink {
  readonly rng: Rng;
  // ---- screen effects (read by the app each frame)
  flashA = 0;
  flashR = 1;
  flashG = 1;
  flashB = 1;
  private flashDecay = 2;
  ca = 0;
  vigRed = 0;
  desat = 0;
  glitch = 0;
  shockX = 195;
  shockY = 300;
  shockT = -1;
  shockDur = 0.6;
  /** red edge pulse during the boss warning */
  warnPulse = 0;
  private muffleT = 0;
  private zoomT = 0;
  /** per-boss-part damage number throttle */
  private partFloatT = new Float32Array(32);
  private ballAcc = new Float32Array(128);
  private ballRing = new Float32Array(128);
  private thrustAcc = 0;
  private comboAcc = 0;
  private lastPerfectStop = -10;
  private lastPerfectWord = -10;
  private lastMaxWord = -10;
  private realTime = 0;
  private touch = false;
  lowHp = false;
  enabled = true;

  constructor(
    private g: Game,
    private parts: Particles,
    private floats: Floaters,
    private cam: Camera,
    private view: WorldView,
    private bg: Background,
    private host: FxHost,
  ) {
    this.rng = new Rng(1 ^ FX_SEED_XOR);
    try {
      this.touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    } catch {
      this.touch = false;
    }
  }

  reseed(seed: number): void {
    this.rng.reseed(seed ^ FX_SEED_XOR);
  }

  reset(): void {
    this.flashA = 0;
    this.ca = 0;
    this.vigRed = 0;
    this.desat = 0;
    this.glitch = 0;
    this.shockT = -1;
    this.warnPulse = 0;
    this.muffleT = 0;
    this.zoomT = 0;
    this.lowHp = false;
    this.partFloatT.fill(0);
    this.ballAcc.fill(0);
    this.ballRing.fill(0);
    this.parts.clear();
    this.floats.clear();
    this.cam.reset();
    music.heartbeat = false;
    music.glitch = false;
  }

  // ------------------------------------------------------------------ primitives
  private n(count: number): number {
    const v = count * this.parts.density;
    const i = Math.floor(v);
    return i + (this.rng.next() < v - i ? 1 : 0);
  }

  flash(hex: number, a: number, dur: number): void {
    const cap = settings.reduceFlash ? juiceRules.reduceFlashCap : 1;
    a = Math.min(a, cap);
    if (a < this.flashA) return;
    this.flashR = ((hex >> 16) & 255) / 255;
    this.flashG = ((hex >> 8) & 255) / 255;
    this.flashB = (hex & 255) / 255;
    this.flashA = a;
    this.flashDecay = a / Math.max(0.05, dur);
  }

  private chroma(v: number): void {
    if (settings.reduceFlash) return;
    this.ca = Math.max(this.ca, v);
  }

  private haptic(p: number | readonly number[]): void {
    if (!settings.haptics || !this.touch) return;
    if (typeof p === 'number' && p <= 0) return;
    try {
      const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (ua && !ua.hasBeenActive) return;
      if (typeof navigator.vibrate !== 'function') return;
      navigator.vibrate(typeof p === 'number' ? p : (p as number[]));
    } catch {
      /* unsupported */
    }
  }

  /** standard juice-table response (trauma + hitstop + haptic) */
  private j(ev: FxEventId, scale = 1): void {
    const J = juice[ev];
    if (J.trauma) this.cam.addTrauma(J.trauma * scale, J.tier);
    if (J.hitstopMs) this.host.hitstop(J.hitstopMs, J.tier);
    if (J.haptic) this.haptic(J.haptic);
  }

  private sparks(x: number, y: number, count: number, c: number, vMin: number, vMax: number, life: number, ang = 0, spread = TAU, size = 4, high = false): void {
    const k = this.n(count);
    const r = this.rng;
    for (let i = 0; i < k; i++) {
      const a = ang + (r.next() - 0.5) * spread;
      const v = r.range(vMin, vMax);
      this.parts.spawn(FR_SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, life * r.range(0.6, 1.1), size, size * 0.5, c, c, 1, 1,
        P_STRETCH | P_FADE_SQ | (high ? P_HIGH : 0), 260, 3, 0, 0, 1);
    }
  }

  private debris(x: number, y: number, count: number, c: number, vMin: number, vMax: number, size = 4): void {
    const k = this.n(count);
    const r = this.rng;
    for (let i = 0; i < k; i++) {
      const a = r.next() * TAU;
      const v = r.range(vMin, vMax);
      this.parts.spawn(FR_TRI, x + r.range(-12, 12), y + r.range(-6, 6), Math.cos(a) * v, Math.sin(a) * v - 60, r.range(0.6, 0.9), size * r.range(0.7, 1.25), size * 0.6, c, c, 0.95, 0.55,
        P_FLOOR | P_FADE_LATE, 520, 1.2, r.next() * TAU, r.range(-14, 14));
    }
  }

  private ring(x: number, y: number, r0: number, r1: number, life: number, c: number, a = 0.9, high = true, frame = FR_RING): void {
    this.parts.spawn(frame, x, y, 0, 0, life, r0, r1, c, c, a, 1, P_GROW | P_FADE_SQ | (high ? P_HIGH : 0));
  }

  private glowAt(x: number, y: number, r: number, life: number, c: number, a = 0.9, high = true): void {
    this.parts.spawn(FR_GLOW, x, y, 0, 0, life, r, r * 1.3, c, c, a, 1, P_FADE_SQ | (high ? P_HIGH : 0));
  }

  private embers(x: number, y: number, count: number, spreadX = 14): void {
    const k = this.n(count);
    const r = this.rng;
    for (let i = 0; i < k; i++) {
      this.parts.spawn(FR_GLOWT, x + r.range(-spreadX, spreadX), y + r.range(-8, 6), r.range(-20, 20), r.range(-70, -30), r.range(0.4, 0.8), r.range(1.6, 2.6), 0.6,
        0xffb050, pal.fire, 0.95, 1, P_FLICKER | P_FADE_LATE, -40, 1.5);
    }
  }

  private confetti(x: number, y: number, count: number, spreadX: number, vy0: number): void {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const c = CONFETTI[i % CONFETTI.length]!;
      this.parts.spawn(i & 1 ? FR_SQUARE : FR_DIAMOND, x + r.range(-spreadX, spreadX), y + r.range(-10, 10), r.range(-160, 160), vy0 + r.range(-220, 40), r.range(1.6, 2.6),
        r.range(2.4, 3.6), 2.4, c, c, 0.95, 0.35, P_HIGH | P_FADE_LATE, 260, 1.4, r.next() * TAU, r.range(-10, 10), r.range(0.4, 1));
    }
  }

  private particlesForBrick(ti: number, x: number, y: number, special: boolean, elite: boolean, burn: boolean): void {
    const c = BRICK_STROKE[ti] ?? pal.basic;
    const mul = special ? 1.5 : 1;
    if (elite) {
      this.debris(x, y, 30, c, 90, 260, 6);
      this.sparks(x, y, 14, 0xffe6a0, 160, 420, 0.5, 0, TAU, 5, true);
      this.ring(x, y, 10, 90, 0.4, pal.gold, 0.9);
      this.ring(x, y, 6, 48, 0.28, 0xffffff, 0.8);
      this.glowAt(x, y, 70, 0.22, pal.gold, 0.85);
      // crown pops up and falls
      this.parts.spawn(FR_CROWN, x, y - 24, this.rng.range(-30, 30), -230, 1.1, 6, 6, pal.gold, pal.gold, 1, 0.3, P_HIGH | P_FADE_LATE | P_FLOOR, 620, 0, 0, this.rng.range(-3, 3));
    } else {
      this.debris(x, y, Math.round(12 * mul), c, 70, 200, 4);
      this.sparks(x, y, Math.round(6 * mul), 0xffffff, 140, 320, 0.35, 0, TAU, 4, true);
      this.ring(x, y, 6, 34, 0.25, c, 0.75);
      this.glowAt(x, y, 30, 0.12, c, 0.7);
    }
    if (ti === 1) {
      // armored: blue plates
      for (let i = 0; i < 4; i++) {
        const a = this.rng.next() * TAU;
        this.parts.spawn(FR_SQUARE, x, y, Math.cos(a) * 120, Math.sin(a) * 120 - 80, 0.8, 4, 3, pal.armored, 0x9fb4ff, 0.95, 0.2, P_FLOOR | P_FADE_LATE, 600, 0.8, a, this.rng.range(-12, 12), 0.5);
      }
    } else if (ti === 5) {
      // warden: shield released as a glass ripple
      this.ring(x, y, 12, 70, 0.45, 0xe6e2ff, 0.8, true, FR_RINGSOFT);
    } else if (ti === 3) {
      // prism: gold burst
      this.sparks(x, y, 10, pal.gold, 120, 300, 0.5, 0, TAU, 4.5, true);
      this.parts.spawn(FR_STAR, x, y, 0, 0, 0.35, 10, 26, pal.gemHi, pal.gold, 1, 1, P_HIGH | P_FADE_SQ, 0, 0, 0, 2);
    }
    if (burn) this.embers(x, y, 5, 18);
  }

  // ------------------------------------------------------------------ FxSink
  emit(ev: FxEventId, x: number, y: number, a: number, b: number): void {
    if (!this.enabled) return;
    const g = this.g;
    const r = this.rng;
    switch (ev) {
      case 'fire': {
        const c = HALO[a] ?? pal.neutral;
        this.glowAt(x, y, 12, 0.09, c, 0.9);
        this.sparks(x, y, 2, c, 90, 180, 0.18, -Math.PI / 2, 0.9, 3);
        sfx.fire(a);
        break;
      }
      case 'catch':
      case 'perfectCatch': {
        const perfect = ev === 'perfectCatch';
        const cy = F.catchY;
        this.ring(x, cy, 4, perfect ? 30 : 18, perfect ? 0.26 : 0.2, perfect ? 0xffffff : pal.neutral, perfect ? 1 : 0.8);
        this.sparks(x, cy, perfect ? 8 : 4, perfect ? 0xffffff : pal.neutral, 120, 260, 0.25, -Math.PI / 2, 2.2, 3.5, true);
        if (perfect) {
          this.parts.spawn(FR_STAR, x, cy, 0, 0, 0.3, 8, 22, 0xffffff, pal.gold, 1, 1, P_HIGH | P_FADE_SQ, 0, 0, 0, 3);
          // several catches in a burst share one word, so they never pile into an unreadable smear
          if (this.realTime - this.lastPerfectWord >= 0.35) {
            this.lastPerfectWord = this.realTime;
            this.floats.word(x, cy - 34, '完美', 0xfff3b0, 15, 0.7);
          }
          sfx.perfect();
          this.cam.addTrauma(juice.perfectCatch.trauma, 2);
          if (this.realTime - this.lastPerfectStop >= config.catch.perfectHitstopGap) {
            this.lastPerfectStop = this.realTime;
            this.host.hitstop(juice.perfectCatch.hitstopMs, 2);
          }
          this.haptic(juice.perfectCatch.haptic);
        } else {
          sfx.catchBall(a);
          this.j('catch');
        }
        if (a >= 3 && b === KIND_MAIN && this.realTime - this.lastMaxWord >= 0.3) {
          this.lastMaxWord = this.realTime;
          this.floats.word(x + 30, cy - 22, 'MAX', 0xffffff, 9, 0.45);
        }
        break;
      }
      case 'miss': {
        const c = HALO[a] ?? pal.neutral;
        this.parts.spawn(FR_SPARK, x, y, 0, 520, 0.14, 7, 3, c, c, 0.9, 1, P_STRETCH | P_FADE_SQ);
        if (b === KIND_MAIN) {
          const p = g.player;
          this.parts.spawn(FR_GLOWT, x, F.floorY, (p.x - x) / 0.5, (F.catchY - 8 - F.floorY) / 0.5, 0.5, 3.5, 2, c, 0xffffff, 1, 1, P_HIGH | P_FADE_LATE);
        }
        sfx.miss();
        break;
      }
      case 'wallHit': {
        this.view.wallHit(a, a === 2 ? x : y);
        const c = HALO[b] ?? pal.neutral;
        const ang = a === 0 ? 0 : a === 1 ? Math.PI : Math.PI / 2;
        this.sparks(x, y, 2, c, 80, 180, 0.2, ang, 1.4, 3);
        sfx.wall();
        break;
      }
      case 'brickHit': {
        const column = a % 8;
        const charges = (a / 8) | 0;
        const c = charges >= 3 ? 0xfff6e0 : 0xd8d0ff;
        this.sparks(x + r.range(-10, 10), y + r.range(-6, 6), 3, c, 90, 220, 0.18, 0, TAU, 3);
        sfx.brickHit(column, Math.max(0, g.comboTier));
        break;
      }
      case 'brickBreak':
      case 'specialBreak':
      case 'eliteBreak': {
        if (a === -1) {
          // armor plate cracked off
          for (let i = 0; i < 5; i++) {
            const an = r.next() * TAU;
            this.parts.spawn(FR_SQUARE, x, y, Math.cos(an) * 110, Math.sin(an) * 110 - 60, 0.7, 3.5, 2.5, pal.armored, 0xbfd0ff, 0.95, 0.2, P_FLOOR | P_FADE_LATE, 600, 0.8, an, r.range(-12, 12), 0.45);
          }
          this.ring(x, y, 6, 26, 0.2, pal.armored, 0.7);
          sfx.glass();
          break;
        }
        const elite = ev === 'eliteBreak';
        const special = ev === 'specialBreak';
        this.particlesForBrick(a, x, y, special, elite, b === 1);
        if (elite) {
          sfx.brickBreak(2);
          this.flash(pal.gold, 0.14, 0.2);
        } else {
          sfx.brickBreak(special ? 1 : 0);
          if (a === 3) sfx.prismChime();
        }
        this.j(ev);
        break;
      }
      case 'burn': {
        this.embers(x, y, b === 1 ? 3 : 2);
        sfx.crackle();
        break;
      }
      case 'chill': {
        const cx = x + (r.next() < 0.5 ? -20 : 20);
        const cy = y + (r.next() < 0.5 ? -9 : 9);
        this.parts.spawn(FR_STAR, cx, cy, 0, 0, 0.3, 4, 7, pal.iceCore, pal.ice, 1, 1, P_HIGH | P_FADE_SQ, 0, 0, 0, 4);
        sfx.chill();
        break;
      }
      case 'freeze': {
        const w = a === 2 ? 50 : 24;
        for (let i = 0; i < 4; i++) {
          this.parts.spawn(FR_HEX, x + r.range(-w, w), y + r.range(-10, 10), r.range(-50, 50), r.range(-90, -20), 0.5, 3, 1.5, pal.iceCore, pal.ice, 0.95, 0.6, P_HIGH | P_FADE_SQ, 200, 1, r.next() * TAU, r.range(-6, 6));
        }
        this.ring(x, y, 8, 34, 0.25, pal.ice, 0.6);
        sfx.freeze();
        break;
      }
      case 'thaw': {
        for (let i = 0; i < 4; i++) {
          this.parts.spawn(FR_FROST, x + r.range(-18, 18), y + r.range(-8, 8), r.range(-20, 20), r.range(10, 50), 0.5, 3, 2, pal.ice, pal.ice, 0.7, 0.5, P_FADE_SQ, 300);
        }
        break;
      }
      case 'thermalShock': {
        for (let i = 0; i < this.n(8); i++) {
          const an = r.next() * TAU;
          this.parts.spawn(FR_SMOKE, x, y, Math.cos(an) * 60, Math.sin(an) * 60 - 40, r.range(0.5, 0.8), 8, 22, 0xfff0e0, 0xff9a40, 0.5, 0.6, P_FADE_SQ | P_HIGH, -30, 2.5);
        }
        this.sparks(x, y, 6, 0xffd0a0, 120, 280, 0.35, 0, TAU, 4, true);
        for (let i = 0; i < 4; i++) {
          const an = r.next() * TAU;
          this.parts.spawn(FR_TRI, x, y, Math.cos(an) * 140, Math.sin(an) * 140, 0.5, 3.5, 2, pal.iceCore, pal.ice, 0.9, 0.5, P_FLOOR | P_FADE_LATE, 500, 1, an, r.range(-12, 12));
        }
        this.floats.word(x, y - 22, '热冲击!', pal.fire, 13, 0.6);
        sfx.thermal();
        this.j(ev);
        break;
      }
      case 'blast': {
        const R = Math.max(12, a);
        this.ring(x, y, 4, R, 0.25, pal.blast, 0.95);
        this.ring(x, y, 2, R * 0.75, 0.18, pal.blastCore, 0.6);
        this.glowAt(x, y, R * 0.55, 0.12, pal.blastCore, 0.8);
        this.sparks(x, y, 10, pal.blast, 140, 320, 0.3, 0, TAU, 4, true);
        sfx.boom(0);
        this.j(ev);
        break;
      }
      case 'novaBoom': {
        if (a === -1) {
          this.flash(0xffa040, 0.22, 0.3);
          this.embers(x, y - 120, 18, 160);
          break;
        }
        const R = Math.max(16, a);
        this.ring(x, y, 4, R, 0.28, pal.fire, 0.95);
        this.ring(x, y, 4, R * 1.15, 0.36, pal.blast, 0.8);
        this.glowAt(x, y, R * 0.6, 0.14, pal.novaCore, 0.9);
        this.sparks(x, y, 12, 0xffb070, 150, 340, 0.35, 0, TAU, 4, true);
        this.embers(x, y, 4, 16);
        sfx.boom(1);
        this.j(ev);
        break;
      }
      case 'volatileBoom': {
        this.ring(x, y, 8, 80, 0.32, 0xff5a3a, 1);
        this.ring(x, y, 4, 52, 0.24, 0xffc080, 0.8);
        this.glowAt(x, y, 54, 0.16, 0xff7a40, 0.9);
        this.sparks(x, y, 20, 0xffa060, 160, 420, 0.4, 0, TAU, 5, true);
        for (let i = 0; i < this.n(6); i++) {
          const an = r.next() * TAU;
          this.parts.spawn(FR_SMOKE, x, y, Math.cos(an) * 50, Math.sin(an) * 50, r.range(0.6, 0.9), 10, 26, 0x3a1450, 0x1a0a28, 0.6, 0, P_FADE_SQ, -20, 2);
        }
        sfx.boom(2);
        this.j(ev);
        break;
      }
      case 'split': {
        const c = HALO[a] ?? pal.split;
        this.glowAt(x, y, 10, 0.08, c, 0.9);
        this.sparks(x, y, 2, b ? pal.homing : pal.split, 100, 200, 0.2, 0, TAU, 3);
        sfx.split();
        break;
      }
      case 'dart': {
        this.parts.spawn(FR_GLOWT, x, y, 0, 0, 0.12, 4, 6, pal.homing, pal.homing, 0.9, 1, P_FADE_SQ);
        break;
      }
      case 'echo': {
        for (let i = 0; i < 4; i++) {
          const an = (i / 4) * TAU + r.next();
          this.parts.spawn(FR_STAR, x, y, Math.cos(an) * 60, Math.sin(an) * 60, 0.3, 4, 1, PRISM_RGB[i]!, 0xffffff, 0.9, 1, P_HIGH | P_FADE_SQ);
        }
        sfx.shimmer();
        break;
      }
      case 'pierce': {
        this.parts.spawn(FR_SPARK, x, y, 0, 0, 0.1, 22, 26, 0xffffff, pal.pierce, 1, 0.7, P_HIGH | P_FADE_SQ, 0, 0, -0.75, 0, 0.6);
        this.sparks(x, y, 3, pal.pierce, 100, 220, 0.2, 0, TAU, 3);
        sfx.pierce();
        break;
      }
      case 'homingLock': {
        this.parts.spawn(FR_RETICLE, x, y, 0, 0, 0.42, 20, 12, pal.homing, pal.homing, 0.9, 0.6, P_HIGH | P_GROW | P_FADE_LATE, 0, 0, 0, 2);
        break;
      }
      case 'gemPickup': {
        const p = g.player;
        this.parts.spawn(FR_STAR, p.x, F.catchY - 14, 0, 0, 0.22, 5 + a * 2, 9 + a * 3, pal.gemHi, pal.gem, 1, 1, P_HIGH | P_FADE_SQ, 0, 0, 0, 3);
        sfx.pickup();
        break;
      }
      case 'healPickup': {
        for (let i = 0; i < this.n(10); i++) {
          const an = r.next() * TAU;
          this.parts.spawn(FR_CROSS, x, y, Math.cos(an) * 70, Math.sin(an) * 70 - 50, 0.6, 4, 2.5, 0xffffff, pal.heal, 1, 0.6, P_HIGH | P_FADE_LATE, 60, 1.5);
        }
        this.haptic(juice.healPickup.haptic);
        break;
      }
      case 'heal': {
        const p = g.player;
        this.floats.number(p.x, F.catchY - 40, a, pal.heal, 15, 0.8, C_PLUS);
        this.ring(p.x, F.catchY - 6, 6, 40, 0.35, pal.heal, 0.8);
        sfx.heal();
        break;
      }
      case 'levelUp': {
        const p = g.player;
        for (let i = 0; i < 24; i++) {
          const an = (i / 24) * TAU;
          this.parts.spawn(FR_GLOWT, p.x, F.catchY - 10, Math.cos(an) * 200, Math.sin(an) * 200, 0.55, 3, 1, 0xd8c8ff, 0xb07cff, 1, 1, P_HIGH | P_FADE_SQ, 0, 3);
        }
        this.ring(p.x, F.catchY - 10, 10, 90, 0.45, 0xb07cff, 0.9);
        sfx.levelUp();
        this.j(ev);
        break;
      }
      case 'evolve': {
        const p = g.player;
        this.flash(pal.gold, 0.3, 0.45);
        this.ring(p.x, F.catchY - 10, 10, 120, 0.5, pal.gold, 1);
        this.ring(p.x, F.catchY - 10, 6, 180, 0.75, 0xfff0b0, 0.8);
        this.ring(p.x, F.catchY - 10, 4, 260, 1.0, pal.gold, 0.6);
        for (let i = 0; i < 60; i++) {
          const an = r.next() * TAU;
          const v = r.range(80, 360);
          this.parts.spawn(FR_GLOWT, p.x, F.catchY - 10, Math.cos(an) * v, Math.sin(an) * v - 60, r.range(0.6, 1.1), 3, 1, 0xfff3b0, pal.gold, 1, 1, P_HIGH | P_FADE_LATE, 120, 1.8);
        }
        this.host.banner('evolve', a, 0);
        sfx.evolve();
        this.j(ev);
        break;
      }
      case 'advance': {
        this.view.advancePulse = 1;
        this.bg.gridTarget += 1;
        this.cam.nudge = 1;
        sfx.advance();
        break;
      }
      case 'breachWarn': {
        if (a === -1) {
          this.floats.word(195, F.dangerY - 40, '警告', pal.danger, 18, 0.9);
          this.vigRed = Math.max(this.vigRed, 0.5);
        }
        sfx.alarm();
        break;
      }
      case 'breach': {
        this.view.dangerCrackAt(x);
        this.debris(x, F.dangerY, 12, pal.danger, 80, 240, 4);
        this.sparks(x, F.dangerY, 8, 0xff8095, 150, 380, 0.35, -Math.PI / 2, 2.5, 4, true);
        this.ring(x, F.dangerY, 8, 60, 0.3, pal.danger, 0.9);
        this.vigRed = 1;
        this.chroma(0.6);
        this.flash(pal.danger, 0.12, 0.25);
        sfx.breach();
        this.j(ev);
        break;
      }
      case 'barrierBlock': {
        this.view.barrierFlash = 1;
        for (let i = 0; i < this.n(24); i++) {
          const px = F.wallL + 12 + r.next() * (F.wallR - F.wallL - 24);
          this.parts.spawn(FR_HEX, px, F.dangerY - 8, r.range(-40, 40), r.range(-140, -40), 0.6, 4, 2, 0xffffff, 0x7ff6ff, 0.9, 0.7, P_HIGH | P_FADE_SQ, 120, 1.2, 0, r.range(-4, 4));
        }
        this.ring(x, F.dangerY - 8, 8, 60, 0.3, 0x7ff6ff, 0.9);
        this.floats.word(x, F.dangerY - 34, '屏障', 0x7ff6ff, 13, 0.7);
        sfx.barrier();
        this.j(ev);
        break;
      }
      case 'barrierReady': {
        for (let i = 0; i < 8; i++) {
          this.parts.spawn(FR_HEX, F.wallL + 24 + i * 48, F.dangerY - 8, 0, -20, 0.5, 3, 5, 0x7ff6ff, 0xffffff, 0.8, 1, P_FADE_SQ);
        }
        sfx.shimmer();
        break;
      }
      case 'playerHit': {
        const p = g.player;
        this.sparks(p.x, F.catchY - 6, 12, 0xff6680, 150, 360, 0.35, 0, TAU, 4.5, true);
        this.ring(p.x, F.catchY - 6, 8, 46, 0.25, pal.danger, 0.9);
        this.vigRed = 1;
        this.chroma(0.5);
        this.flash(pal.danger, 0.1, 0.2);
        sfx.playerHit();
        this.j(ev);
        break;
      }
      case 'bulletIntercept': {
        this.ring(x, y, 3, 16, 0.18, pal.danger, 0.85);
        this.glowAt(x, y, 7, 0.1, 0xffffff, 0.9);
        this.sparks(x, y, 4, 0xff8095, 80, 180, 0.2, 0, TAU, 3);
        if (a === 0) this.floats.number(x, y - 10, config.score.intercept, 0xffb0c0, 9, 0.5, C_PLUS);
        sfx.pop();
        break;
      }
      case 'comboTier': {
        this.view.comboTierFlash = 1;
        this.view.multSlide = 1;
        const c = TIER_COLORS[a] ?? 0xffffff;
        this.ring(345, 505, 8, 52, 0.35, c, 0.85, false);
        this.sparks(345, 505, 8, c, 80, 200, 0.35, 0, TAU, 3.5, false);
        sfx.comboTier(a);
        break;
      }
      case 'comboMilestone': {
        // neon ring in the milestone colour (matches the DOM banner): white alone reads as grey smoke
        const mc = a >= 1000 ? 0xffffff : a >= 250 ? pal.blast : a >= 100 ? pal.fire : 0xb6ff2e;
        this.ring(195, 330, 20, 220, 0.45, mc, 0.9);
        this.ring(195, 330, 10, 150, 0.3, 0xffffff, 0.7);
        for (let i = 0; i < this.n(30); i++) {
          const an = r.next() * TAU;
          const v = r.range(120, 340);
          this.parts.spawn(FR_STAR, 195, 330, Math.cos(an) * v, Math.sin(an) * v, 0.6, 4, 1, 0xffffff, CONFETTI[i % 6]!, 1, 1, P_HIGH | P_FADE_SQ, 0, 2.5);
        }
        this.host.banner('comboMilestone', a, 0);
        sfx.milestone();
        this.j(ev);
        break;
      }
      case 'comboBreak': {
        this.view.comboBroken(a);
        for (let i = 0; i < 12; i++) {
          this.parts.spawn(FR_TRI, 372 - r.range(0, 60), 505 + r.range(-10, 10), r.range(-60, 60), r.range(-80, 0), r.range(0.5, 0.8), 3, 2, 0xbdb6d8, 0x5a5478, 0.8, 0.2, P_FADE_LATE, 500, 0.5, r.next() * TAU, r.range(-10, 10));
        }
        sfx.comboBreak();
        break;
      }
      case 'comboDrop': {
        // dropped ball: the number shakes and sheds grey shards, the multiplier slides back in
        this.view.comboDropped();
        for (let i = 0; i < this.n(6); i++) {
          this.parts.spawn(FR_TRI, 372 - r.range(0, 50), 505 + r.range(-8, 8), r.range(-50, 50), r.range(-70, 0), r.range(0.4, 0.6), 3, 2, 0xbdb6d8, 0x5a5478, 0.7, 0.2, P_FADE_LATE, 500, 0.5, r.next() * TAU, r.range(-10, 10));
        }
        this.floats.word(330, 466, '连击减半', 0xbdb6d8, 11, 0.6);
        break;
      }
      case 'waveStart': {
        this.host.banner('waveStart', a, b);
        sfx.waveStart();
        break;
      }
      case 'bossWarning': {
        this.warnPulse = config.bosses.intro.warn;
        this.muffleT = config.bosses.intro.warn;
        this.host.banner('bossWarning', a, 0);
        sfx.bossWarning();
        music.setMode('boss');
        this.bg.bossTarget = 1;
        this.j(ev);
        break;
      }
      case 'bossArrive': {
        if (a === 0) {
          this.host.banner('bossArrive', 0, 0);
          this.cam.addTrauma(0.12, 3);
          sfx.swell();
        } else if (a === 1) {
          this.ring(x, y, 20, 200, 0.5, 0xffffff, 0.8);
          this.ring(x, y, 10, 130, 0.4, pal.danger, 0.8);
          this.sparks(x, y, 40, 0xffd0e0, 160, 460, 0.5, 0, TAU, 5, true);
          sfx.bossArrive();
          this.j(ev);
        } else if (a === 2) {
          this.ring(x, y, 10, 90, 0.35, pal.danger, 0.9);
          this.sparks(x, y, 16, 0xffa0b0, 140, 320, 0.35, 0, TAU, 4, true);
          this.cam.addTrauma(0.15, 3);
          sfx.boom(1);
        } else {
          for (let i = 0; i < this.n(14); i++) {
            this.parts.spawn(FR_SQUARE, x + r.range(-20, 20), y + r.range(-14, 14), r.range(-30, 30), r.range(-30, 30), 0.35, 3, 1, pal.serpent, 0xffffff, 0.9, 0.8, P_HIGH | P_FLICKER | P_FADE_SQ);
          }
          sfx.zap();
        }
        break;
      }
      case 'bossHit': {
        if (a < 0) {
          this.sparks(x, y, 3, 0x9fb0ff, 90, 200, 0.2, 0, TAU, 3, true);
          sfx.bossHit();
          break;
        }
        this.sparks(x, y, 3, 0xffffff, 100, 240, 0.22, 0, TAU, 3.5, true);
        const i = a & 31;
        if (this.realTime - this.partFloatT[i]! >= 0.15 && b > 0) {
          this.partFloatT[i] = this.realTime;
          this.floats.number(x + r.range(-10, 10), y - 18, Math.round(b), 0xffd0dc, 10, 0.5);
        }
        sfx.bossHit();
        break;
      }
      case 'bossShieldBreak': {
        const c = a === 1 ? pal.pulsar : a === 2 ? pal.serpent : pal.monolithPlate;
        this.debris(x, y, 10, c, 90, 240, 4);
        this.ring(x, y, 6, 40, 0.28, c, 0.9);
        this.sparks(x, y, 6, 0xffffff, 120, 280, 0.3, 0, TAU, 3.5, true);
        sfx.glass();
        this.j(ev);
        break;
      }
      case 'bossTelegraph': {
        sfx.telegraph();
        break;
      }
      case 'bossPhase': {
        this.flash(0xffffff, 0.3, 0.35);
        this.ring(x, y, 20, 220, 0.5, 0xffffff, 0.9);
        this.sparks(x, y, 30, 0xffd8e8, 160, 460, 0.5, 0, TAU, 5, true);
        this.debris(x, y, 20, g.boss?.kind === 'omega' ? 0xffffff : pal.danger, 100, 280, 5);
        this.chroma(0.5);
        if (g.boss?.kind === 'omega' && a >= 3) music.glitch = true;
        sfx.bossPhase();
        this.j(ev);
        break;
      }
      case 'bossDefeat':
      case 'victory': {
        const vic = ev === 'victory';
        if (a === -1) {
          this.host.hitstop(vic ? config.bosses.victory.hitstopMs : config.bosses.death.hitstopMs, 5);
          const D = vic ? config.bosses.victory : config.bosses.death;
          this.host.slowmo(D.slowScale, D.slowReal, config.bosses.death.rampBack);
          this.cam.focusX = x;
          this.cam.focusY = y;
          this.cam.zoomTarget = config.bosses.death.zoom;
          this.zoomT = D.slowReal;
          this.muffleT = D.slowReal;
          this.cam.addTrauma(0.3, 5);
          this.haptic(juice[ev].haptic);
          sfx.swell();
          if (vic) {
            // implosion: particles pulled into the core
            for (let i = 0; i < 80; i++) {
              const an = r.next() * TAU;
              const d = r.range(80, 260);
              this.parts.spawn(FR_GLOWT, x + Math.cos(an) * d, y + Math.sin(an) * d, -Math.cos(an) * d / 0.12, -Math.sin(an) * d / 0.12, 0.12, 3, 1, 0xffffff, CONFETTI[i % 6]!, 1, 1, P_HIGH | P_FADE_LATE);
            }
          }
        } else if (a === 1) {
          this.ring(x, y, 6, 50, 0.3, 0xffffff, 0.9);
          this.glowAt(x, y, 34, 0.18, 0xffc0d0, 0.9);
          this.sparks(x, y, 14, 0xffe0e8, 150, 380, 0.4, 0, TAU, 4.5, true);
          sfx.boom(1);
        } else {
          this.flash(0xffffff, vic ? 0.95 : 0.9, vic ? 0.6 : 0.45);
          this.chroma(0.8);
          this.shockX = x;
          this.shockY = y;
          this.shockT = 0;
          this.ring(x, y, 20, 420, 0.7, 0xffffff, 1);
          this.ring(x, y, 10, 260, 0.55, vic ? pal.gold : pal.danger, 0.9);
          this.glowAt(x, y, 120, 0.4, 0xffffff, 1);
          this.sparks(x, y, vic ? 120 : 90, 0xfff0f4, 200, 620, 0.8, 0, TAU, 6, true);
          this.debris(x, y, vic ? 60 : 50, vic ? 0xffffff : pal.danger, 120, 420, 6);
          if (vic) this.confetti(195, 200, 140, 180, -120);
          this.host.banner(ev, 0, 0);
          if (vic) sfx.fanfare();
          sfx.bossDefeat(true);
          this.cam.addTrauma(juice[ev].trauma, 5);
          this.haptic(juice[ev].haptic);
        }
        break;
      }
      case 'slam': {
        this.ring(x, F.dangerY, 10, 140, 0.4, a ? pal.serpent : pal.monolith, 0.9);
        this.sparks(x, F.dangerY, 24, 0xffd0e0, 160, 420, 0.45, -Math.PI / 2, 2.6, 5, true);
        for (let i = 0; i < this.n(8); i++) {
          this.parts.spawn(FR_SMOKE, x + r.range(-60, 60), F.dangerY, r.range(-80, 80), r.range(-40, -10), 0.8, 10, 24, 0x5a4b8f, 0x1b0f3a, 0.5, 0, P_FADE_SQ, 0, 2);
        }
        this.vigRed = 1;
        this.chroma(0.5);
        sfx.slam();
        this.j(ev);
        break;
      }
      case 'summon': {
        for (let i = 0; i < this.n(8); i++) {
          const an = r.next() * TAU;
          this.parts.spawn(FR_GLOWT, x + Math.cos(an) * 24, y + Math.sin(an) * 14, -Math.cos(an) * 80, -Math.sin(an) * 50, 0.3, 3, 1, 0xcdb8ff, 0xffffff, 0.9, 1, P_HIGH | P_FADE_SQ);
        }
        sfx.zap();
        break;
      }
      case 'enemyShot': {
        this.sparks(x, y, 3, 0xff8095, 60, 140, 0.2, Math.PI / 2, 2, 3, true);
        this.glowAt(x, y, 10, 0.1, pal.danger, 0.8);
        sfx.enemyShot();
        break;
      }
      case 'laserFire': {
        this.sparks(x, F.floorY, 10, 0xffd0d8, 140, 340, 0.4, -Math.PI / 2, 2.4, 4.5, true);
        this.ring(x, F.floorY, 6, 44, 0.3, pal.danger, 0.9);
        sfx.laser();
        this.j(ev);
        break;
      }
      case 'crush': {
        const c = BRICK_STROKE[a] ?? pal.basic;
        this.debris(x, y, 8, c, 60, 180, 3.5);
        this.sparks(x, y, 2, 0xffffff, 80, 180, 0.2, 0, TAU, 3);
        sfx.brickBreak(0);
        break;
      }
      case 'shatter': {
        for (let i = 0; i < this.n(6); i++) {
          const an = r.next() * TAU;
          this.parts.spawn(FR_TRI, x, y, Math.cos(an) * 160, Math.sin(an) * 160, 0.4, 3, 1.5, pal.iceCore, pal.ice, 0.95, 0.6, P_HIGH | P_FADE_SQ, 200, 1, an, r.range(-12, 12));
        }
        this.floats.word(x, y - 16, '碎冰', pal.ice, 11, 0.5);
        sfx.chill();
        break;
      }
      case 'iceShard': {
        const dx = a - x;
        const dy = b - y;
        this.parts.spawn(FR_SPARK, x, y, dx / 0.14, dy / 0.14, 0.14, 7, 5, pal.iceCore, pal.ice, 1, 0.8, P_HIGH | P_STRETCH);
        this.parts.spawn(FR_FROST, a, b, 0, 0, 0.25, 3, 7, pal.iceCore, pal.ice, 1, 1, P_HIGH | P_FADE_SQ);
        break;
      }
      case 'playerDeath': {
        const p = g.player;
        this.host.slowmo(0.25, 0.8, 0.01);
        for (let i = 0; i < 80; i++) {
          const an = r.next() * TAU;
          const v = r.range(80, 420);
          const c = PRISM_RGB[i % 4]!;
          this.parts.spawn(i & 1 ? FR_TRI : FR_SPARK, p.x, F.catchY - 8, Math.cos(an) * v, Math.sin(an) * v - 80, r.range(0.8, 1.4), i & 1 ? 4.5 : 5, 2, c, c, 1, 0.5,
            P_HIGH | P_FADE_LATE | (i & 1 ? P_FLOOR : P_STRETCH), 300, 1.2, an, r.range(-10, 10));
        }
        this.ring(p.x, F.catchY - 8, 10, 160, 0.5, 0xffffff, 1);
        this.flash(0xffffff, 0.5, 0.4);
        this.chroma(1);
        this.glitch = 1;
        this.vigRed = 1;
        music.setMode('off');
        audio.setMuffle(1, 0.4);
        sfx.death();
        this.host.banner('playerDeath', 0, 0);
        this.j(ev);
        break;
      }
      case 'uiPress': {
        if (a === 1) {
          sfx.shimmer();
          this.haptic(10);
        } else {
          sfx.ui();
          this.haptic(juice.uiPress.haptic);
        }
        break;
      }
      case 'newRecord': {
        this.confetti(195, 120, 120, 170, 60);
        sfx.fanfare();
        this.haptic(juice.newRecord.haptic);
        break;
      }
      case 'cardPick':
        sfx.cardPick();
        this.haptic(juice.cardPick.haptic);
        break;
      case 'reroll':
        sfx.reroll();
        break;
      case 'dragStart':
        this.parts.spawn(FR_RINGSOFT, x, y, 0, 0, 0.12, 8, 20, 0xbfb3ff, 0xbfb3ff, 0.35, 1, P_GROW | P_FADE_SQ | P_HIGH);
        break;
      default:
        this.j(ev);
    }
  }

  // ------------------------------------------------------------------ per frame
  /** game-time dt drives world particles (hitstop freezes them); realDt drives screen effects */
  update(dt: number, realDt: number, playing: boolean): void {
    const g = this.g;
    this.realTime += realDt;
    // screen effects
    this.flashA = Math.max(0, this.flashA - this.flashDecay * realDt);
    this.ca = Math.max(0, this.ca - realDt / 0.2);
    this.vigRed = Math.max(0, this.vigRed - realDt * 1.6);
    this.glitch = Math.max(0, this.glitch - realDt * 0.6);
    this.warnPulse = Math.max(0, this.warnPulse - realDt);
    if (this.shockT >= 0) {
      this.shockT += realDt;
      if (this.shockT > this.shockDur) this.shockT = -1;
    }
    if (this.zoomT > 0) {
      this.zoomT -= realDt;
      if (this.zoomT <= 0) this.cam.zoomTarget = 1;
    }
    if (this.muffleT > 0) {
      this.muffleT -= realDt;
      audio.setMuffle(g.phase === 'dying' || g.phase === 'over' ? 1 : this.muffleT > 0 ? 0.75 : 0, 0.15);
    }
    // low HP: heartbeat + vignette pulse
    const low = playing && g.player.alive && g.player.hp <= config.player.lowHp && g.phase !== 'idle';
    this.lowHp = low;
    music.heartbeat = low;
    if (g.phase === 'dying') this.desat = Math.min(1, this.desat + realDt * 2.5);
    else this.desat = Math.max(0, this.desat - realDt * 2);
    this.parts.update(dt);
    this.floats.update(dt);
    if (dt <= 0 || !playing) return;
    this.ambient(dt);
  }

  private ambient(dt: number): void {
    const g = this.g;
    const r = this.rng;
    const P = this.parts;
    const pool = g.balls.pool;
    for (let i = 0; i < pool.length && i < 128; i++) {
      const b = pool[i]!;
      if (!b.alive) continue;
      const fire = b.element === 'fire' || b.element === 'nova';
      let rate = 0;
      if (fire) rate += b.kind === KIND_MAIN ? 14 : 5;
      if (b.charges >= 3) rate += 20;
      if (rate > 0) {
        let acc = this.ballAcc[i]! + rate * dt * P.density;
        while (acc >= 1) {
          acc -= 1;
          if (b.charges >= 3 && r.next() < 20 / rate) {
            const an = r.next() * TAU;
            P.spawn(FR_SPARK, b.x, b.y, Math.cos(an) * 90 - b.vx * 0.1, Math.sin(an) * 90 - b.vy * 0.1, 0.25, 3, 1, 0xfff6e0, 0xffd080, 0.9, 1, P_STRETCH | P_FADE_SQ, 0, 4);
          } else {
            P.spawn(FR_GLOWT, b.x + r.range(-3, 3), b.y + r.range(-3, 3), -b.vx * 0.08 + r.range(-15, 15), -b.vy * 0.08 + r.range(-25, 5), r.range(0.3, 0.55), r.range(1.5, 2.4), 0.5,
              0xffc070, pal.fire, 0.9, 1, P_FLICKER | P_FADE_LATE, -30, 2);
          }
        }
        this.ballAcc[i] = acc;
      }
      if (b.element === 'blast' && b.kind === KIND_MAIN) {
        const t = this.ballRing[i]! + dt;
        if (t >= 0.5) {
          this.ballRing[i] = t - 0.5;
          P.spawn(FR_RING, b.x, b.y, b.vx * 0.3, b.vy * 0.3, 0.3, 5, 16, pal.blast, pal.blast, 0.6, 1, P_GROW | P_FADE_SQ);
        } else this.ballRing[i] = t;
      }
    }
    // thruster sparks: 10/s while moving
    const p = g.player;
    if (p.alive && g.phase !== 'idle') {
      const sp = Math.abs(p.vx);
      this.thrustAcc += (sp > 60 ? 10 : 2) * dt;
      while (this.thrustAcc >= 1) {
        this.thrustAcc -= 1;
        const side = r.next() < 0.5 ? -14 : 14;
        P.spawn(FR_SPARK, p.x + side, F.catchY + 12, -p.vx * 0.15 + r.range(-20, 20), r.range(60, 140), 0.22, 2.5, 1, 0xbfe8ff, 0x8a5cff, 0.8, 1, P_STRETCH | P_FADE_SQ);
      }
    }
    // combo 100+ embers near the number
    if (g.comboTier >= 3 && this.view.comboVis > 0.5) {
      this.comboAcc += 8 * dt;
      while (this.comboAcc >= 1) {
        this.comboAcc -= 1;
        P.spawn(FR_GLOWT, 372 - r.range(0, 70), 505 + r.range(-8, 12), r.range(-10, 10), r.range(-60, -25), r.range(0.4, 0.7), 2, 0.5,
          g.comboTier >= 4 ? 0xff9ef0 : 0xffc070, g.comboTier >= 4 ? pal.blast : pal.fire, 0.85, 1, P_FLICKER | P_FADE_LATE, -20, 1);
      }
    }
  }

  /** CSS-free colour for the low-HP vignette pulse (0..1) */
  lowHpPulse(): number {
    if (!this.lowHp) return 0;
    return 0.5 + 0.5 * Math.sin((this.realTime * TAU) / 1.2);
  }
}

