// World layers: field → combo → bricks → crystals → low particles → trails → balls → high particles → core →
// enemy fire → boss → floaters (docs §7 draw order, §4.5 entity specs).
import { config, pal } from '../config';
import { ease } from '../core/ease';
import { settings } from '../core/settings';
import type { Game } from '../game/game';
import type { Ball } from '../game/balls';
import { KIND_DART, KIND_ECHO, KIND_MAIN, KIND_SHARD } from '../game/balls';
import { GEM_HEAL } from '../game/gems';
import { TG_CELL, TG_COLUMN, TG_LINE } from '../game/bullets';
import type { Brick } from '../game/formation';
import { elementIndex, brickTypeIndex } from '../types';
import type { Batcher } from './batcher';
import { col, mixHex } from './batcher';
import type { Sprites } from './sprites';
import { drawNumber, drawWord, C_TIMES, NUM_DEC1 } from './text';
import type { Particles } from '../fx/particles';
import type { Floaters } from '../fx/floaters';
import { drawBoss } from './draw-boss';

const F = config.field;
const G = config.grid;
const BC = config.ball;
const TAU = Math.PI * 2;
const C_K = 'k'.charCodeAt(0);
const C_M = 'M'.charCodeAt(0);

export const HALO = [0xbfb3ff, 0xff7a1a, 0x2ee6ff, 0xff2fd0, 0xff7a1a];
export const CORE = [0xffffff, 0xffe0b0, 0xe8fdff, 0xffd6f6, 0xfff6e0];
export const BRICK_STROKE = [pal.basic, pal.armored, pal.volatile, pal.prismBrick, pal.turret, pal.warden, pal.elite];
const COMBO_COLORS = [0xede9ff, 0x2ee6ff, 0xb6ff2e, 0xff7a1a, 0xff2fd0, 0xffffff];
const COMBO_SIZES = [30, 34, 38, 42, 46, 50];

/** HSV hue (deg) → 0xRRGGBB at full saturation/value */
export function hueHex(h: number): number {
  h = ((h % 360) + 360) % 360;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  const seg = Math.floor(h / 60);
  const X = (x * 255) | 0;
  switch (seg) {
    case 0: return 0xff0000 | (X << 8);
    case 1: return (X << 16) | 0x00ff00;
    case 2: return 0x00ff00 | X;
    case 3: return (X << 8) | 0x0000ff;
    case 4: return (X << 16) | 0x0000ff;
    default: return 0xff0000 | X;
  }
}

export class WorldView {
  time = 0;
  /** interpolation factor between the previous and current fixed step */
  alpha = 1;
  trailMax = 14;
  /** wall flashes: side, position, timer (×16) */
  readonly wallFlash = new Float32Array(16 * 3);
  private wallIdx = 0;
  advancePulse = 0;
  dangerCrack = new Float32Array(8 * 2); // x, t
  private crackIdx = 0;
  /** combo display */
  comboVis = 0;
  comboBounce = 0;
  comboBounceV = 0;
  comboShown = 0;
  comboBreakT = 0;
  comboBreakVal = 0;
  comboTierFlash = 0;
  multSlide = 0;
  /** tutorial highlight ball id, -1 none */
  highlightBall = -1;
  tutorialGuide = 0;
  hideHud = false;
  showPlayer = true;
  playerDeathT = -1;
  barrierFlash = 0;
  private readonly pts = new Float32Array(32 * 2);
  private readonly nrm = new Float32Array(32 * 2);
  private readonly pred = { x: 0, t: 0 };

  constructor(
    private b: Batcher,
    private spr: Sprites,
    private g: Game,
    private parts: Particles,
    private floats: Floaters,
  ) {}

  wallHit(side: number, pos: number): void {
    const i = this.wallIdx * 3;
    this.wallFlash[i] = side;
    this.wallFlash[i + 1] = pos;
    this.wallFlash[i + 2] = 0.12;
    this.wallIdx = (this.wallIdx + 1) % 16;
  }

  dangerCrackAt(x: number): void {
    this.dangerCrack[this.crackIdx * 2] = x;
    this.dangerCrack[this.crackIdx * 2 + 1] = 2;
    this.crackIdx = (this.crackIdx + 1) % 8;
  }

  /** presentation-only state integration (game-time dt so hitstop freezes it too) */
  update(dt: number, realDt: number): void {
    this.time += realDt;
    for (let i = 0; i < 16; i++) if (this.wallFlash[i * 3 + 2]! > 0) this.wallFlash[i * 3 + 2]! -= realDt;
    for (let i = 0; i < 8; i++) if (this.dangerCrack[i * 2 + 1]! > 0) this.dangerCrack[i * 2 + 1]! -= realDt;
    this.advancePulse = Math.max(0, this.advancePulse - realDt * 3);
    this.barrierFlash = Math.max(0, this.barrierFlash - realDt * 2.5);
    const f = this.g.formation;
    const k = 1 - Math.exp(-22 * dt);
    for (const br of f.bricks) {
      if (!br.alive) continue;
      // scale spring (logic writes impulses into popS)
      br.popV += (-650 * br.popS - 20 * br.popV) * dt;
      br.popS += br.popV * dt;
      if (Math.abs(br.popS) < 1e-4 && Math.abs(br.popV) < 1e-3) br.popS = br.popV = 0;
      br.popX -= br.popX * k;
      br.popY -= br.popY * k;
      if (br.flashT > 0) br.flashT -= dt;
    }
    const p = this.g.player;
    p.recoil *= Math.exp(-14 * dt);
    p.squash *= Math.exp(-9 * dt);
    // combo
    const c = this.g.combo;
    const target = c >= config.combo.tiers[0]! ? 1 : 0;
    if (target && this.comboVis < 1) this.comboVis = Math.min(1, this.comboVis + realDt / 0.25);
    else if (!target) this.comboVis = Math.max(0, this.comboVis - realDt / 0.15);
    if (c > this.comboShown && c >= 10) {
      this.comboBounceV += 6;
    }
    if (c > 0) this.comboShown = c;
    else if (this.comboVis <= 0) this.comboShown = 0;
    this.comboBounceV += (-420 * this.comboBounce - 16 * this.comboBounceV) * realDt;
    this.comboBounce += this.comboBounceV * realDt;
    this.comboBreakT = Math.max(0, this.comboBreakT - realDt);
    this.comboTierFlash = Math.max(0, this.comboTierFlash - realDt * 2.5);
    this.multSlide = Math.max(0, this.multSlide - realDt * 4);
  }

  comboDropped(): void {
    this.comboBounceV -= 10;
    this.multSlide = 1;
  }

  comboBroken(v: number): void {
    this.comboBreakT = 0.3;
    this.comboBreakVal = v;
    this.comboVis = 0;
  }

  // ================================================================================== draw
  draw(): void {
    const g = this.g;
    if (!this.hideHud) this.drawField();
    if (g.phase !== 'idle') {
      this.drawCombo();
      this.drawBricks();
      this.drawTelegraphs();
      this.drawGems();
      this.parts.draw(this.b, false, this.time);
      this.drawTrails();
      this.drawBalls();
      if (g.boss) drawBoss(this.b, this.spr, g.boss, this.time, this.alpha);
      this.parts.draw(this.b, true, this.time);
      if (this.showPlayer) this.drawPlayer();
      this.drawBullets();
      this.drawShock();
    } else {
      this.parts.draw(this.b, false, this.time);
      this.parts.draw(this.b, true, this.time);
    }
    this.floats.draw(this.b, this.spr.text);
  }

  // ---------------------------------------------------------------------------------- field
  private drawField(): void {
    const b = this.b;
    const s = this.spr;
    const g = this.g;
    const wallC = col(pal.wall, 0.9, 0.2);
    const wallGlow = col(pal.wall, 0.35, 1);
    // walls + ceiling
    b.rect(s.strip, F.wallL - 5, F.ceilY, 10, F.floorY - F.ceilY, wallGlow);
    b.rect(s.strip, F.wallR - 5, F.ceilY, 10, F.floorY - F.ceilY, wallGlow);
    b.rect(s.white, F.wallL - 1, F.ceilY, 1.5, F.floorY - F.ceilY + 20, wallC);
    b.rect(s.white, F.wallR - 0.5, F.ceilY, 1.5, F.floorY - F.ceilY + 20, wallC);
    b.line(s.strip, F.wallL - 4, F.ceilY, F.wallR + 4, F.ceilY, 9, wallGlow);
    b.rect(s.white, F.wallL - 1, F.ceilY - 0.75, F.wallR - F.wallL + 2, 1.5, wallC);
    // wall hit flashes (24u segments, 120 ms)
    for (let i = 0; i < 16; i++) {
      const t = this.wallFlash[i * 3 + 2]!;
      if (t <= 0) continue;
      const side = this.wallFlash[i * 3]!;
      const pos = this.wallFlash[i * 3 + 1]!;
      const a = t / 0.12;
      const c = col(0xffffff, a, 0.6);
      const cg = col(0xbfb3ff, a * 0.7, 1);
      if (side === 2) {
        b.line(s.strip, pos - 12, F.ceilY, pos + 12, F.ceilY, 10, cg);
        b.rect(s.white, pos - 12, F.ceilY - 1, 24, 2, c);
      } else {
        const x = side === 0 ? F.wallL : F.wallR;
        b.line(s.strip, x, pos - 12, x, pos + 12, 10, cg);
        b.rect(s.white, x - 1, pos - 12, 2, 24, c);
      }
    }
    // danger line: 8 on / 6 off marching ants, 1.5u, with glow
    const f = g.formation;
    const dangerish = this.dangerLevel();
    const mask = f.warnColumnMask();
    const march = (this.time * 18) % 14;
    const baseA = 0.55 + 0.25 * dangerish + this.advancePulse * 0.4;
    const dc = col(pal.danger, baseA, 0.3);
    b.line(s.strip, F.wallL, F.dangerY, F.wallR, F.dangerY, 8, col(pal.danger, 0.18 + 0.2 * dangerish + this.advancePulse * 0.3, 1));
    for (let x = F.wallL - 14 + march; x < F.wallR; x += 14) {
      const x0 = Math.max(F.wallL, x);
      const x1 = Math.min(F.wallR, x + 8);
      if (x1 > x0) b.rect(s.white, x0, F.dangerY - 0.75, x1 - x0, 1.5, dc);
    }
    // advance countdown: bright line grows from both ends to the centre
    if (f.mode !== 'hold' && g.hostile()) {
      const p = f.progress();
      const len = 187 * ease.inQuad(Math.min(1, p));
      const cc = col(pal.danger, 0.55, 0.5);
      b.rect(s.white, F.wallL, F.dangerY - 1, len, 2, cc);
      b.rect(s.white, F.wallR - len, F.dangerY - 1, len, 2, cc);
    }
    // per-column breach warning: solid bright red + hatch
    if (mask) {
      const blink = 0.6 + 0.4 * Math.sin(this.time * TAU * 3);
      for (let c = 0; c < G.cols; c++) {
        if (!(mask & (1 << c))) continue;
        const x0 = G.x0 + c * G.cellW;
        b.rect(s.white, x0, F.dangerY - 1.25, G.cellW, 2.5, col(0xff6680, blink, 0.2));
        b.line(s.strip, x0, F.dangerY, x0 + G.cellW, F.dangerY, 14, col(pal.danger, 0.5 * blink, 1));
        for (let k = 0; k < 2; k++) {
          b.sprite(s.hatch, x0 + 13 + k * 26, F.dangerY + 9, 26 / 32, 14 / 32, 0, col(pal.danger, 0.18 * blink, 0.4));
        }
      }
    }
    // cracks where bricks breached (2 s)
    for (let i = 0; i < 8; i++) {
      const t = this.dangerCrack[i * 2 + 1]!;
      if (t <= 0) continue;
      const x = this.dangerCrack[i * 2]!;
      b.sprite(s.crack[1]!, x, F.dangerY, 0.9, 0.7, 0, col(0xff8095, Math.min(1, t), 0.3));
    }
    // barrier: hex energy band along the danger line
    const pl = g.player;
    if ((pl.barrierReady || this.barrierFlash > 0) && g.phase !== 'idle') {
      const a = pl.barrierReady ? 0.35 + 0.15 * Math.sin(this.time * 4) : 0;
      const fl = this.barrierFlash;
      for (let x = F.wallL + 12; x < F.wallR; x += 20) {
        b.sprite(s.hex, x, F.dangerY - 8, 0.62, 0.62, 0, col(mixHex(0x7ff6ff, 0xffffff, fl), a + fl, 1));
      }
      b.line(s.strip, F.wallL, F.dangerY - 8, F.wallR, F.dangerY - 8, 14, col(0x7ff6ff, (a + fl) * 0.4, 1));
    }
  }

  dangerLevel(): number {
    const g = this.g;
    const lr = g.formation.lowestDisplayRow();
    const rowsLeft = G.visibleRows - 1 - lr;
    let d = 0;
    if (lr >= 0 && rowsLeft <= 3) d = 1 - rowsLeft / 4;
    if (g.player.hp <= config.player.lowHp && g.phase !== 'idle') d = Math.max(d, 0.7);
    return d;
  }

  // ---------------------------------------------------------------------------------- combo
  private drawCombo(): void {
    const g = this.g;
    const b = this.b;
    const s = this.spr;
    const t = s.text;
    const xR = 372;
    const yB = 520;
    if (this.comboBreakT > 0) {
      const a = this.comboBreakT / 0.3;
      const bv = this.comboBreakVal;
      drawNumber(b, t.numL, bv >= 1000 ? Math.floor(bv / 100) / 10 : bv, xR, yB - 14 + (1 - a) * 18, 30, 1, col(0x8f86b8, a * 0.7, 0), 0, bv >= 1000 ? NUM_DEC1 : 0, 0, bv >= 1000 ? C_K : 0);
    }
    if (this.comboVis <= 0 || this.comboShown < 10) return;
    const c = this.comboShown;
    let tier = 0;
    const tiers = config.combo.tiers;
    for (let i = 0; i < tiers.length; i++) if (c >= tiers[i]!) tier = i;
    const vis = ease.outBack(this.comboVis);
    let color = COMBO_COLORS[tier]!;
    if (tier >= 5) color = mixHex(hueHex(this.time * 120), 0xffffff, 0.45);
    const size = COMBO_SIZES[tier]! * vis * (1 + this.comboBounce * 0.12 / 6);
    const a = 0.85;
    let jx = 0;
    let jy = 0;
    if (tier >= 5) {
      jx = Math.sin(this.time * 53) * 0.8;
      jy = Math.cos(this.time * 47) * 0.8;
    }
    const cy = yB - size * 0.42;
    // flame halo for 200+
    if (tier >= 4) {
      for (let i = 0; i < 7; i++) {
        const fx = xR - size * 0.35 * (i + 0.5) * 0.55 - 4;
        const h = 1.4 + 0.5 * Math.sin(this.time * 17 + i * 2.3);
        b.sprite(s.flame, fx + jx, cy + size * 0.12, 1.6, h * 1.6, 0, col(tier >= 5 ? color : 0xff2fd0, 0.35, 1));
      }
    }
    // label
    drawWord(b, t, 'COMBO', xR - 26, cy - size * 0.62, 10, col(0xede9ff, a * 0.8 * vis, 0), col(color, 0.4 * vis, 1));
    // ≥1000 reads as "1.2k" so the counter does not turn into a long, meaningless string
    if (c >= 1000) drawNumber(b, t.numL, Math.floor(c / 100) / 10, xR + jx, cy + jy, size, 1, col(0xffffff, a, 0.1), col(color, a * (0.8 + this.comboTierFlash * 0.4), 1), NUM_DEC1, 0, C_K);
    else drawNumber(b, t.numL, c, xR + jx, cy + jy, size, 1, col(0xffffff, a, 0.1), col(color, a * (0.8 + this.comboTierFlash * 0.4), 1));
    // multiplier ×1.5 sliding in from the right
    const mult = config.combo.mults[tier]!;
    const slide = this.multSlide * 20;
    drawNumber(b, t.numS, mult, xR + slide, yB + 10, 13, 1, col(color, a * vis, 0.2), col(color, 0.4 * vis, 1), NUM_DEC1, C_TIMES);
    // window timer bar (80u)
    const frac = Math.max(0, Math.min(1, g.comboT / g.comboWindow()));
    const red = g.comboT < 0.4;
    const bc = red ? col(pal.danger, (0.5 + 0.5 * Math.sin(this.time * 40)) * vis, 0.3) : col(color, 0.75 * vis, 0.3);
    b.rect(s.white, xR - 80, yB + 21, 80, 1.5, col(0x3b2c73, 0.6 * vis, 0));
    b.rect(s.white, xR - 80 * frac, yB + 21, 80 * frac, 1.5, bc);
    // sparkles 50+
    if (tier >= 2) {
      for (let i = 0; i < 3; i++) {
        const ph = (this.time * 0.9 + i * 0.37) % 1;
        const sx = xR - size * 1.6 + ((i * 53) % 37) * (size / 30);
        const sy = cy - size * 0.4 + ((i * 29) % 23) * (size / 30);
        b.spriteR(s.star4, sx, sy, 5 * Math.sin(ph * Math.PI), ph * 3, col(color, 0.8 * Math.sin(ph * Math.PI), 1));
      }
    }
  }

  // ---------------------------------------------------------------------------------- bricks
  private drawBricks(): void {
    const g = this.g;
    const f = g.formation;
    const b = this.b;
    const s = this.spr;
    const t = s.text;
    const time = this.time;
    const ice = g.stats.ice;
    const freezeAt = ice ? ice.freezeAt : 4;
    // pass 1: outer glows (additive) so neighbouring bodies overlap them
    for (const br of f.bricks) {
      if (!br.alive) continue;
      const elite = br.type === 'elite';
      const ti = brickTypeIndex(br.type);
      const top = f.top(br);
      if (top > F.floorY + 30) continue;
      const cx = (f.left(br) + f.right(br)) * 0.5 + br.popX;
      const cy = (top + f.bottom(br)) * 0.5 + br.popY;
      const sp = this.spawnScale(br);
      let gc: number = BRICK_STROKE[ti]!;
      if (br.chill > 0) gc = mixHex(gc, pal.ice, Math.min(1, br.chill / freezeAt) * 0.7);
      if (br.frozenT > 0) gc = pal.ice;
      let ga = 0.35;
      if (br.warn) {
        gc = pal.danger;
        ga = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * TAU * 3));
      }
      if (br.type === 'volatile') ga += 0.15 * (0.5 + 0.5 * Math.sin(time * 6 + br.id));
      const sc = sp * (1 + br.popS);
      b.sprite(elite ? s.eliteGlow : s.brickGlow, cx, cy, sc, sc, 0, col(gc, ga, 1));
    }
    // pass 2: bodies + overlays + numbers
    for (const br of f.bricks) {
      if (!br.alive) continue;
      const elite = br.type === 'elite';
      const ti = brickTypeIndex(br.type);
      const top = f.top(br);
      if (top > F.floorY + 30) continue;
      const left = f.left(br);
      const w = f.right(br) - left;
      const h = f.bottom(br) - top;
      const cx = left + w * 0.5 + br.popX;
      const cy = top + h * 0.5 + br.popY;
      const sp = this.spawnScale(br);
      const sc = sp * (1 + br.popS);
      const fade = sp < 1 ? Math.min(1, sp * 1.4) : 1;
      b.sprite(s.brick[ti]!, cx, cy, sc, sc, 0, col(0xffffff, fade, 0));
      // shield pattern
      if (br.shielded) b.sprite(elite ? s.shieldPatE : s.shieldPat, cx, cy, sc, sc, 0, col(0xffffff, 0.25 * fade, 0.3));
      // cracks
      const fr = br.hp / br.maxHp;
      const stroke = BRICK_STROKE[ti]!;
      if (fr < 0.5) b.sprite(elite ? s.crackE[0]! : s.crack[0]!, cx, cy, sc, sc, 0, col(mixHex(stroke, 0xffffff, 0.4), 0.6, 0.2));
      if (fr < 0.25) b.sprite(elite ? s.crackE[1]! : s.crack[1]!, cx, cy, sc, sc, 0, col(mixHex(stroke, 0xffffff, 0.4), 0.7, 0.2));
      // turret eye
      if (br.type === 'turret') {
        const ex = left + 9 + br.popX;
        const charge = Math.max(0, (br.fireT - (config.bricks.turretPeriod - config.bricks.turretCharge)) / config.bricks.turretCharge);
        const lock = br.locked ? 0.5 + 0.5 * Math.sin(time * 60) : 0;
        b.spriteR(s.glow, ex, cy, 6 + 10 * charge, 0, col(pal.danger, 0.4 + 0.5 * charge, 1));
        b.spriteR(s.disc, ex, cy, 2.2 + 1.2 * charge, 0, col(mixHex(pal.danger, 0xffffff, 0.3 + lock * 0.5), 1, 0.3));
        if (charge > 0 && br.frozenT <= 0) {
          const la = (0.25 + 0.5 * charge) * (br.locked ? 0.6 + 0.4 * lock : 0.6);
          b.line(s.white, ex, cy, br.aimX, br.aimY, 1, col(pal.danger, la, 0.4));
        }
      } else if (br.type === 'warden') {
        b.spriteR(s.glow, left + 9 + br.popX, cy, 7, 0, col(pal.warden, 0.25 + 0.1 * Math.sin(time * 3 + br.id), 1));
      } else if (br.type === 'elite') {
        // energy sweep + crown
        const sweep = ((time * 0.6 + br.id * 0.13) % 1.6) - 0.3;
        if (sweep > 0 && sweep < 1) b.sprite(s.spark, left + w * sweep, cy, 1.2, 5.5, 1.1, col(pal.elite, 0.35, 1));
        b.sprite(s.crown, cx, top - 3 + Math.sin(time * 2.4 + br.id) * 1.2, sc, sc, 0, col(0xffffff, fade, 0));
      }
      // frost corners (one per chill stack)
      if (br.chill > 0 && br.frozenT <= 0) {
        const n = Math.min(4, Math.ceil(br.chill));
        for (let k = 0; k < n; k++) {
          const fx = k === 0 || k === 3 ? left + 3 : left + w - 3;
          const fy = k < 2 ? top + 3 : top + h - 3;
          b.spriteR(s.frost, fx, fy, 4.5, time * 0.5 + k, col(0xd8fbff, 0.85, 0.4));
        }
      }
      // ice shell
      if (br.frozenT > 0) b.sprite(elite ? s.iceE : s.ice, cx, cy, sc, sc, 0, col(0xffffff, 0.92, 0.1));
      // flames (1–5 tongues)
      if (br.burnStacks > 0) {
        const n = Math.min(5, br.burnStacks);
        for (let k = 0; k < n; k++) {
          const fx = left + (w * (k + 1)) / (n + 1);
          const j = Math.sin(time * 23 + k * 2.1 + br.id) * 0.18 + Math.sin(time * 37 + k) * 0.08;
          const fh = (elite ? 1.5 : 1.05) * (1 + j);
          b.sprite(s.flame, fx + Math.sin(time * 9 + k) * 0.8, top - 2 * fh, 1.1, fh, Math.sin(time * 5 + k) * 0.12, col(pal.fire, 0.75, 1));
          b.sprite(s.flame, fx, top - 1.2 * fh, 0.6, fh * 0.6, 0, col(0xffd27a, 0.7, 1));
        }
      }
      // hit flash
      if (br.flashT > 0) b.sprite(elite ? s.eliteFlash : s.brickFlash, cx, cy, sc, sc, 0, col(0xffffff, (br.flashT / 0.06) * 0.85, 0.35));
      // breach warning outline
      if (br.warn) b.sprite(elite ? s.eliteEdge : s.brickEdge, cx, cy, sc, sc, 0, col(pal.danger, 0.5 + 0.5 * Math.sin(time * TAU * 3), 0.3));
      // HP number
      const hp = Math.ceil(br.hp);
      const offset = br.type === 'turret' || br.type === 'prism' || br.type === 'warden' ? 6 : 0;
      const numC = br.frozenT > 0 ? col(0x9ff4ff, fade, 0) : col(0xede9ff, 0.92 * fade, 0);
      const size = elite ? 16 : 11;
      if (hp >= 1e6) drawNumber(b, t.numS, hp / 1e6, cx + offset, cy + 0.5, size * 0.9, 0.5, numC, 0, NUM_DEC1, 0, C_M, sc);
      else if (hp >= 1000) drawNumber(b, t.numS, hp >= 1e5 ? Math.round(hp / 1000) : hp / 1000, cx + offset, cy + 0.5, size * 0.9, 0.5, numC, 0, hp >= 1e5 ? 0 : NUM_DEC1, 0, C_K, sc);
      else drawNumber(b, t.numS, hp, cx + offset, cy + 0.5, size, 0.5, numC, 0, 0, 0, 0, sc);
    }
  }

  private spawnScale(br: Brick): number {
    if (br.spawnT <= 0) return 1;
    const p = 1 - br.spawnT / config.advance.spawnScale;
    return Math.max(0.05, ease.outBack(Math.max(0, p)));
  }

  // ---------------------------------------------------------------------------------- gems
  private drawGems(): void {
    const b = this.b;
    const s = this.spr;
    const al = this.alpha;
    const GM = config.gems;
    for (const gm of this.g.gemsSys.pool) {
      if (!gm.alive) continue;
      const x = gm.px + (gm.x - gm.px) * al;
      const y = gm.py + (gm.y - gm.py) * al;
      let a = 1;
      if (gm.grounded && gm.floorT > GM.floorLife - GM.blinkLast) a = Math.sin(this.time * 50) > 0 ? 1 : 0.25;
      if (gm.kind === GEM_HEAL) {
        const pulse = 1 + 0.12 * Math.sin(this.time * 6 + gm.id);
        b.sprite(s.gem[3]!, x, y, pulse, pulse, 0, col(0xffffff, a, 0));
        continue;
      }
      const sx = 0.45 + 0.55 * Math.abs(Math.cos(gm.spin));
      b.sprite(s.gem[gm.kind]!, x, y, sx, 1, 0, col(0xffffff, a, 0));
      const ph = (this.time / 1.5 + gm.id * 0.137) % 1;
      if (ph < 0.12) {
        const k = Math.sin((ph / 0.12) * Math.PI);
        b.spriteR(s.star4, x + 1, y - 2, (4 + gm.kind * 2) * k, 0, col(0xfff3b0, 0.9 * k, 1));
      }
    }
  }

  // ---------------------------------------------------------------------------------- trails
  private drawTrails(): void {
    const g = this.g;
    let alive = 0;
    for (const ball of g.balls.pool) if (ball.alive) alive++;
    const heavy = alive > 30;
    for (const ball of g.balls.pool) {
      if (!ball.alive) continue;
      const ei = elementIndex(ball.element);
      const kind = ball.kind;
      const n = this.collectTrail(ball, heavy);
      if (n < 2) continue;
      const small = kind === KIND_SHARD || kind === KIND_DART;
      let color = HALO[ei]!;
      if (kind === KIND_SHARD) color = pal.split;
      else if (kind === KIND_DART) color = pal.homing;
      else if (kind === KIND_ECHO) color = hueHex(ball.hue + this.time * 90);
      const boost = ball.charges >= 3 ? 1.4 : 1;
      const wOuter = (small ? 6 : 12) * boost;
      const wInner = (small ? 1.6 : 3) * boost;
      if (!heavy || !small) this.strip(n, wOuter, color, 0.35 * (kind === KIND_ECHO ? 0.7 : 1), 1, true);
      this.strip(n, wInner, ei === 4 ? 0xffe0c0 : mixHex(color, 0xffffff, 0.55), 0.9, 0.6, false);
      if (ei === 4 && kind === KIND_MAIN) this.strip(n, wOuter * 0.7, pal.blast, 0.25, 1, true);
    }
  }

  /** gather trail points oldest → newest + current interpolated position into this.pts; returns count */
  private collectTrail(ball: Ball, heavy: boolean): number {
    const cnt = ball.trailCount;
    const max = Math.min(this.trailMax, 14);
    const take = Math.min(cnt, heavy ? Math.ceil(max / 2) : max);
    const step = heavy ? 2 : 1;
    let n = 0;
    const head = ball.trailHead;
    for (let k = take - 1; k >= 0; k -= step) {
      const idx = (head - 1 - k + 28) % 14;
      this.pts[n * 2] = ball.trail[idx * 2]!;
      this.pts[n * 2 + 1] = ball.trail[idx * 2 + 1]!;
      n++;
    }
    const x = ball.px + (ball.x - ball.px) * this.alpha;
    const y = ball.py + (ball.y - ball.py) * this.alpha;
    // avoid zero-length end segment
    if (n > 0) {
      const dx = x - this.pts[(n - 1) * 2]!;
      const dy = y - this.pts[(n - 1) * 2 + 1]!;
      if (dx * dx + dy * dy < 0.25) n--;
    }
    this.pts[n * 2] = x;
    this.pts[n * 2 + 1] = y;
    n++;
    return n;
  }

  private strip(n: number, width: number, color: number, alpha: number, add: number, soft: boolean): void {
    const b = this.b;
    const fr = soft ? this.spr.strip : this.spr.stripCore;
    const p = this.pts;
    const nm = this.nrm;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      let dx = p[i1 * 2]! - p[i0 * 2]!;
      let dy = p[i1 * 2 + 1]! - p[i0 * 2 + 1]!;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= l;
      dy /= l;
      nm[i * 2] = -dy;
      nm[i * 2 + 1] = dx;
    }
    for (let i = 0; i < n - 1; i++) {
      const t0 = i / (n - 1);
      const t1 = (i + 1) / (n - 1);
      const w0 = width * 0.5 * t0;
      const w1 = width * 0.5 * t1;
      const c0 = col(color, alpha * t0 * t0, add);
      const c1 = col(color, alpha * t1 * t1, add);
      const x0 = p[i * 2]!;
      const y0 = p[i * 2 + 1]!;
      const x1 = p[i * 2 + 2]!;
      const y1 = p[i * 2 + 3]!;
      const nx0 = nm[i * 2]! * w0;
      const ny0 = nm[i * 2 + 1]! * w0;
      const nx1 = nm[i * 2 + 2]! * w1;
      const ny1 = nm[i * 2 + 3]! * w1;
      b.quad4(x0 + nx0, y0 + ny0, x0 - nx0, y0 - ny0, x1 - nx1, y1 - ny1, x1 + nx1, y1 + ny1, fr.u0, fr.v0, fr.u1, fr.v1, c0, c0, c1, c1);
    }
  }

  // ---------------------------------------------------------------------------------- balls
  private drawBalls(): void {
    const g = this.g;
    const b = this.b;
    const s = this.spr;
    const time = this.time;
    const al = this.alpha;
    for (const ball of g.balls.pool) {
      if (!ball.alive) continue;
      const x = ball.px + (ball.x - ball.px) * al;
      const y = ball.py + (ball.y - ball.py) * al;
      const ei = elementIndex(ball.element);
      const kind = ball.kind;
      const ang = Math.atan2(ball.vy, ball.vx);
      const grow = ball.age < 0.06 ? ball.age / 0.06 : 1;
      if (kind === KIND_SHARD) {
        b.spriteR(s.glow, x, y, 11, 0, col(pal.split, 0.5, 1));
        b.sprite(s.diamond, x, y, 0.62 * grow, 0.62 * grow, ang + Math.PI / 2, col(0xf0e0ff, 1, 0.2));
        continue;
      }
      if (kind === KIND_DART) {
        b.spriteR(s.glow, x, y, 12, 0, col(pal.homing, 0.45, 1));
        b.sprite(s.spark, x, y, 0.55, 2.2, ang, col(0xeaffc0, 1, 0.3));
        continue;
      }
      const echo = kind === KIND_ECHO;
      let halo = HALO[ei]!;
      if (echo) halo = hueHex(ball.hue + time * 90);
      const core = echo ? 0xffffff : CORE[ei]!;
      const nova = ei === 4;
      const scale = (nova ? BC.novaScale : 1) * grow * (ball.catchT > 0 ? 1 + ball.catchT * 1.2 : 1);
      let hr = 18 * scale;
      if (ei === 1) hr *= 1 + 0.08 * Math.sin(time * 31 + ball.id);
      if (ei === 3) hr *= 1 + 0.15 * Math.sin(time * TAU * 6);
      const ha = echo ? 0.4 : 0.55;
      if (nova) {
        b.spriteR(s.glow, x, y, hr * 1.25, 0, col(pal.fire, 0.5, 1));
        const ca = time * 4 + ball.id;
        b.spriteR(s.glow, x + Math.cos(ca) * 3, y + Math.sin(ca) * 3, hr, 0, col(pal.blast, 0.45, 1));
      } else b.spriteR(s.glow, x, y, hr, 0, col(halo, ha, 1));
      // charge rings
      if (ball.charges >= 1) b.spriteR(s.ring, x, y, 10 * scale, 0, col(mixHex(halo, 0xffffff, 0.5), 0.8, 0.6));
      if (ball.charges >= 2) b.spriteR(s.ring, x, y, 13 * scale, 0, col(mixHex(halo, 0xffffff, 0.3), 0.6, 0.8));
      if (ball.charges >= 3) b.spriteR(s.glowTight, x, y, 13 * scale, 0, col(0xffffff, 0.55, 1));
      // pierce: elongated body + bright leading edge
      const pierce = kind === KIND_MAIN && ball.pierceLeft > 0;
      const r = ball.r * scale * (ball.charges >= 2 ? 1.08 : 1);
      if (pierce) {
        b.sprite(s.disc, x, y, (r / 16) * 1.35, r / 16, ang, col(core, echo ? 0.75 : 1, 0.15));
        b.sprite(s.spark, x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9, 0.35, 2.2, ang + Math.PI / 2, col(0xffffff, 0.9, 0.5));
      } else b.spriteR(s.disc, x, y, r, 0, col(core, echo ? 0.75 : 1, 0.15));
      if (ei === 2) b.spriteR(s.star4, x, y, 10 * scale, time * 2 + ball.id, col(0xe8fdff, 0.55, 1));
      // homing reticle on target
      if (ball.target !== -1 && g.stats.homing && kind === KIND_MAIN && g.targetAlive(ball.target)) {
        const tx = g.targetX(ball.target);
        const ty = g.targetY(ball.target);
        b.spriteR(s.reticle, tx, ty, 12, time * 1.5, col(pal.homing, 0.55, 0.6));
      }
      // tutorial highlight
      if (this.highlightBall === ball.id) {
        const k = 0.5 + 0.5 * Math.sin(time * 10);
        b.spriteR(s.ring, x, y, 20 + k * 6, 0, col(0xffffff, 0.8, 0.5));
      }
    }
  }

  // ---------------------------------------------------------------------------------- core
  private drawPlayer(): void {
    const g = this.g;
    const b = this.b;
    const s = this.spr;
    const p = g.player;
    const time = this.time;
    const x = p.px + (p.x - p.px) * this.alpha;
    const yC = F.catchY;
    const pw = g.stats.paddleW;
    const tilt = Math.max(-1, Math.min(1, p.vx / 1400)) * ((10 * Math.PI) / 180);
    const sq = 1 - 0.2 * p.squash;
    const recoil = 2 * p.recoil;
    const blink = p.iFramesT > 0 && Math.sin(time * TAU * 12) < 0 ? 0.35 : 1;
    const hit = p.hitT > 0 ? p.hitT / 0.3 : 0;
    // ground light
    b.sprite(s.glow, x, F.floorY + 2, 2.4, 0.32, 0, col(0x8f7bff, 0.28, 1));
    // thrusters
    const speed = Math.min(1, Math.abs(p.vx) / 900);
    for (let k = -1; k <= 1; k += 2) {
      const tx = x + k * (pw * 0.3);
      const len = 0.9 + speed * 1.4 + (k * Math.sign(p.vx) < 0 ? speed * 0.8 : 0) + Math.sin(time * 40 + k) * 0.08;
      b.sprite(s.flame, tx, yC + 6 + recoil + 7 * len * 0.5, 0.9, len, Math.PI - tilt * 0.6, col(0x7fd8ff, 0.6 * blink, 1));
      b.sprite(s.flame, tx, yC + 5 + recoil + 4 * len * 0.5, 0.45, len * 0.6, Math.PI - tilt * 0.6, col(0xffffff, 0.6 * blink, 1));
    }
    // paddle
    b.sprite(s.paddleGlow, x, yC + recoil, (pw / 76) * 1.05, 1, tilt, col(0xb3a6ff, 0.5 * blink, 1));
    b.sprite(s.paddle, x, yC + recoil, (pw / 76) * (1 + 0.08 * p.squash), sq, tilt, col(0xffffff, blink, 0));
    if (hit > 0) b.sprite(s.paddle, x, yC + recoil, pw / 76, sq, tilt, col(pal.danger, hit, 0.6));
    // prism + breathing glow
    const px = x + Math.sin(tilt) * 14;
    const py = yC - 15 + recoil;
    const breath = 0.5 + 0.5 * Math.sin((time * TAU) / 2);
    b.spriteR(s.glow, px, py, 26, 0, col(0xcfc4ff, (0.22 + 0.18 * breath) * blink, 1));
    b.sprite(s.prism, px, py, 1, 1, tilt, col(0xffffff, blink, 0));
    if (hit > 0) b.sprite(s.prism, px, py, 1, 1, tilt, col(pal.danger, hit, 0.7));
    // tutorial T1: dashed guide line from the prism upward
    if (this.tutorialGuide > 0) {
      const off = (time * 48) % 18;
      for (let y = yC - 44 - off; y > 290; y -= 18) {
        const fa = Math.min(1, (y - 290) / 160) * this.tutorialGuide;
        b.rect(s.white, x - 0.8, y - 9, 1.6, 9, col(0x2ee6ff, 0.55 * fa, 0.5));
      }
    }
    // magazine dots above the paddle
    const mag = g.balls.magazine;
    const shown = Math.min(12, mag);
    const startX = x - ((shown - 1) * 6) / 2;
    const nextE = elementIndex(g.balls.peekElement());
    for (let i = 0; i < shown; i++) {
      b.spriteR(s.disc, startX + i * 6, 740 - 26 + recoil, 1.5, 0, col(i === 0 ? HALO[nextE]! : 0xe8e2ff, 0.85, 0.3));
    }
    if (mag > 12) drawNumber(b, s.text.numS, mag - 12, startX + 12 * 6 + 2, 740 - 26, 8, 0, col(0xe8e2ff, 0.8, 0), 0, 0, '+'.charCodeAt(0));
    // landing hints
    if (settings.landingHints && g.phase !== 'dying') this.drawLandingHints();
  }

  private drawLandingHints(): void {
    const g = this.g;
    const b = this.b;
    const s = this.spr;
    let total = 0;
    for (const ball of g.balls.pool) if (ball.alive && ball.kind === KIND_MAIN) total++;
    let shown = 0;
    for (const ball of g.balls.pool) {
      if (!ball.alive || ball.kind !== KIND_MAIN || shown >= 6) continue;
      if (ball.charges < 1 && total > 6) continue;
      if (!g.balls.predict(ball, this.pred) || this.pred.t > 0.8) continue;
      shown++;
      const n = 1 + Math.min(2, ball.charges);
      const sz = 0.8 + ball.charges * 0.15;
      const a = 0.35 + 0.6 * (1 - this.pred.t / 0.8);
      const c = col(HALO[elementIndex(ball.element)]!, a, 0.4);
      for (let k = 0; k < n; k++) {
        b.sprite(s.chevron, this.pred.x + (k - (n - 1) / 2) * 7 * sz, 764, sz, sz, 0, c);
      }
    }
  }

  // ---------------------------------------------------------------------------------- enemy fire
  private drawTelegraphs(): void {
    const g = this.g;
    const b = this.b;
    const s = this.spr;
    const f = g.formation;
    for (const tg of g.bulletsSys.tele) {
      if (!tg.alive) continue;
      const left = tg.dur - tg.t;
      const blink = left < 0.2 ? (Math.sin(this.time * TAU * 10) > 0 ? 1 : 0.2) : 1;
      const ramp = Math.min(1, tg.t / 0.15);
      if (tg.kind === TG_LINE) {
        b.line(s.white, tg.x1, tg.y1, tg.x2, tg.y2, 1, col(pal.danger, 0.75 * ramp * blink, 0.3));
        b.line(s.strip, tg.x1, tg.y1, tg.x2, tg.y2, 5, col(pal.danger, 0.2 * ramp * blink, 1));
      } else if (tg.kind === TG_COLUMN) {
        const w = tg.w;
        const y0 = tg.y1;
        const y1 = tg.y2;
        const a = 0.18 * ramp * blink;
        for (let y = y0; y < y1; y += 32) {
          const hgt = Math.min(32, y1 - y);
          b.sprite(s.hatch, tg.x1, y + hgt / 2, w / 32, hgt / 32, 0, col(pal.danger, a, 0.4));
        }
        b.rect(s.white, tg.x1 - w / 2, y0, 1.2, y1 - y0, col(pal.danger, 0.6 * ramp * blink, 0.3));
        b.rect(s.white, tg.x1 + w / 2 - 1.2, y0, 1.2, y1 - y0, col(pal.danger, 0.6 * ramp * blink, 0.3));
      } else if (tg.kind === TG_CELL) {
        const rowAbs = tg.x2;
        const c = tg.y2;
        const x = G.x0 + (c + 0.5) * G.cellW;
        const y = f.cellTop(rowAbs) + G.cellH / 2;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 18);
        b.sprite(s.brickEdge, x, y, 1, 1, 0, col(pal.danger, (0.5 + 0.4 * pulse) * ramp, 0.3));
        b.sprite(s.brickGlow, x, y, 1, 1, 0, col(pal.danger, 0.3 * ramp, 1));
      }
    }
  }

  private drawBullets(): void {
    const g = this.g;
    const b = this.b;
    const s = this.spr;
    const al = this.alpha;
    const bs = g.bulletsSys;
    for (const l of bs.lasers) {
      if (!l.alive) continue;
      const W = config.bosses.omega.laserW;
      if (l.warnT < l.warnDur) {
        const left = l.warnDur - l.warnT;
        const blink = left < 0.2 ? (Math.sin(this.time * TAU * 10) > 0 ? 1 : 0.2) : 1;
        const a = Math.min(1, l.warnT / 0.2) * blink;
        b.rect(s.white, l.x - 0.5, l.y0, 1, F.floorY - l.y0, col(pal.danger, 0.8 * a, 0.3));
        for (let y = l.y0; y < F.floorY; y += 32) {
          const hgt = Math.min(32, F.floorY - y);
          b.sprite(s.hatch, l.x, y + hgt / 2, W / 32, hgt / 32, 0, col(pal.danger, 0.12 * a, 0.4));
        }
      } else {
        const p = l.activeT / l.activeDur;
        const a = p < 0.1 ? p / 0.1 : 1 - Math.max(0, (p - 0.7) / 0.3);
        const wob = 1 + 0.08 * Math.sin(this.time * 70);
        b.rect(s.strip, l.x - (W * wob) / 2, l.y0, W * wob, F.floorY - l.y0, col(pal.danger, 0.75 * a, 1));
        b.rect(s.stripCore, l.x - 4, l.y0, 8, F.floorY - l.y0, col(0xffffff, a, 0.6));
        b.spriteR(s.glow, l.x, F.floorY, 40, 0, col(0xff8095, 0.6 * a, 1));
      }
    }
    for (const bl of bs.pool) {
      if (!bl.alive) continue;
      const x = bl.px + (bl.x - bl.px) * al;
      const y = bl.py + (bl.y - bl.py) * al;
      const sp = Math.sqrt(bl.vx * bl.vx + bl.vy * bl.vy) || 1;
      b.line(s.strip, x - (bl.vx / sp) * 16, y - (bl.vy / sp) * 16, x, y, bl.r * 1.6, col(pal.danger, 0.45, 1));
      b.spriteR(s.glow, x, y, bl.r * 2.6, 0, col(pal.danger, 0.75, 1));
      b.spriteR(s.disc, x, y, bl.r * 0.55, 0, col(0xffffff, 1, 0.2));
    }
  }

  private drawShock(): void {
    const g = this.g;
    if (g.shockR <= 0) return;
    const b = this.b;
    const s = this.spr;
    const p = Math.min(1, g.shockR / 900);
    const a = 1 - p;
    b.spriteR(s.ringSoft, g.bossDeathX, g.bossDeathY, g.shockR, 0, col(0xffffff, 0.8 * a, 1));
    b.spriteR(s.ring, g.bossDeathX, g.bossDeathY, g.shockR * 0.97, 0, col(0xffe6ff, 0.9 * a, 0.6));
  }
}
