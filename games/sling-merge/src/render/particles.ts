/**
 * 粒子与对象池（docs §5.5）：SoA 粒子 400、冲击波圆环 12、溅痕 24、融合残影 8、光芒组 2。
 * 池满时覆盖最旧元素；帧内不分配对象。
 */
import { CONFIG, fruitDef } from '../config';
import { rngFx } from '../core/rng';
import { drawSprite, type Sprite, type Sprites } from './sprites';

export const P_JUICE = 0;
export const P_STAR = 1;
export const P_HEART = 2;
export const P_SWEAT = 3;
export const P_BUBBLE = 4;
export const P_SEED = 5;
export const P_CONFETTI = 6;
export const P_SPARKLE = 7;
export const P_TEAR = 8;
export const P_ZZZ = 9;
export const P_STREAK = 10;
export const P_DUST = 11;

const CAP = 400;
const TAU = Math.PI * 2;

/** 调色板：0..10 = 各级果汁色；之后是固定色 */
export const PALETTE: string[] = [];
for (let l = 1; l <= 11; l++) PALETTE.push(fruitDef(l).colors.juice);
export const C_GOLD = PALETTE.push('#FFC93C') - 1;
export const C_WHITE = PALETTE.push('#FFFFFF') - 1;
export const C_PINK = PALETTE.push('#FF6F91') - 1;
export const C_MINT = PALETTE.push('#5FD3B3') - 1;
export const C_LEMON = PALETTE.push('#FFE15A') - 1;
export const C_VIOLET = PALETTE.push('#B07CFF') - 1;
export const C_ORANGE = PALETTE.push('#FFB13D') - 1;
export const C_BLUE = PALETTE.push('#7C86FF') - 1;
export const C_PLUM = PALETTE.push('#5B3A5E') - 1;
export const RAINBOW = [C_PINK, C_ORANGE, C_LEMON, C_MINT, C_BLUE, C_VIOLET];

export class Particles {
  kind = new Uint8Array(CAP);
  col = new Uint8Array(CAP);
  x = new Float32Array(CAP);
  y = new Float32Array(CAP);
  vx = new Float32Array(CAP);
  vy = new Float32Array(CAP);
  life = new Float32Array(CAP);
  max = new Float32Array(CAP);
  size = new Float32Array(CAP);
  rot = new Float32Array(CAP);
  vrot = new Float32Array(CAP);
  drag = new Float32Array(CAP);
  grav = new Float32Array(CAP);
  phase = new Float32Array(CAP);
  alive = new Uint8Array(CAP);
  private head = 0;
  count = 0;
  /** 质量档粒子倍率 */
  mul = 1;

  // 圆环
  ringX = new Float32Array(12);
  ringY = new Float32Array(12);
  ringR0 = new Float32Array(12);
  ringR1 = new Float32Array(12);
  ringT = new Float32Array(12);
  ringDur = new Float32Array(12);
  ringW = new Float32Array(12);
  ringCol = new Uint8Array(12);
  private ringHead = 0;

  // 溅痕
  splatX = new Float32Array(24);
  splatY = new Float32Array(24);
  splatLv = new Uint8Array(24);
  splatVar = new Uint8Array(24);
  splatT = new Float32Array(24);
  splatRot = new Float32Array(24);
  splatS = new Float32Array(24);
  private splatHead = 0;

  // 融合残影
  ghostLv = new Uint8Array(8);
  ghostX0 = new Float32Array(8);
  ghostY0 = new Float32Array(8);
  ghostX1 = new Float32Array(8);
  ghostY1 = new Float32Array(8);
  ghostT = new Float32Array(8);
  ghostDur = new Float32Array(8);
  private ghostHead = 0;

  // 光芒组
  rayX = new Float32Array(2);
  rayY = new Float32Array(2);
  rayN = new Uint8Array(2);
  rayT = new Float32Array(2);
  rayDur = new Float32Array(2);
  rayLen = new Float32Array(2);
  rayRainbow = new Uint8Array(2);
  private rayHead = 0;

  private cacheVer = -1;
  private dotS: (Sprite | null)[] = [];
  private starS: (Sprite | null)[] = [];
  private sparkS: (Sprite | null)[] = [];
  private fixedS: Sprite[] = [];

  private refreshCache(): void {
    const S = this.sprites;
    if (this.cacheVer === S.version) return;
    this.cacheVer = S.version;
    this.dotS = PALETTE.map(() => null);
    this.starS = PALETTE.map(() => null);
    this.sparkS = PALETTE.map(() => null);
    this.fixedS = [S.shape('bubble'), S.shape('heart', '#FF6F91'), S.shape('sweat'), S.shape('tear'), S.shape('seed')];
  }

  private colored(arr: (Sprite | null)[], kind: 'dot' | 'star' | 'sparkle', c: number): Sprite {
    let s = arr[c];
    if (!s) {
      s = this.sprites.shape(kind, PALETTE[c]!);
      arr[c] = s;
    }
    return s;
  }

  private sprites: Sprites;

  constructor(sprites: Sprites) {
    this.sprites = sprites;
    this.ringT.fill(99);
    this.ringDur.fill(1);
    this.splatT.fill(99);
    this.ghostT.fill(99);
    this.ghostDur.fill(1);
    this.rayT.fill(99);
    this.rayDur.fill(1);
  }

  clear(): void {
    this.alive.fill(0);
    this.count = 0;
    this.ringT.fill(99);
    this.splatT.fill(99);
    this.ghostT.fill(99);
    this.rayT.fill(99);
  }

  /** 预算倍率后能否继续发射（用于 n 个的批量发射） */
  budget(n: number): number {
    return Math.max(1, Math.round(n * this.mul));
  }

  spawn(kind: number, col: number, x: number, y: number, vx: number, vy: number, life: number, size: number, drag = 3, grav = -120): number {
    let i = this.head;
    this.head = (this.head + 1) % CAP;
    if (!this.alive[i]) this.count++;
    this.alive[i] = 1;
    this.kind[i] = kind;
    this.col[i] = col;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.rot[i] = rngFx.next() * TAU;
    this.vrot[i] = (rngFx.next() - 0.5) * 8;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.phase[i] = rngFx.next() * TAU;
    return i;
  }

  /** 径向爆发 */
  burst(kind: number, col: number, x: number, y: number, n: number, spMin: number, spMax: number, lifeMin: number, lifeMax: number, sMin: number, sMax: number, drag = 4, grav = -200, spread = 0): void {
    const m = this.budget(n);
    for (let k = 0; k < m; k++) {
      const a = rngFx.next() * TAU;
      const sp = spMin + rngFx.next() * (spMax - spMin);
      const d = spread * rngFx.next();
      this.spawn(
        kind, col, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * sp, Math.sin(a) * sp,
        lifeMin + rngFx.next() * (lifeMax - lifeMin), sMin + rngFx.next() * (sMax - sMin), drag, grav,
      );
    }
  }

  ring(x: number, y: number, r0: number, r1: number, dur: number, w: number, col: number, delay = 0): void {
    const i = this.ringHead;
    this.ringHead = (this.ringHead + 1) % 12;
    this.ringX[i] = x;
    this.ringY[i] = y;
    this.ringR0[i] = r0;
    this.ringR1[i] = r1;
    this.ringT[i] = -delay;
    this.ringDur[i] = dur;
    this.ringW[i] = w;
    this.ringCol[i] = col;
  }

  splat(level: number, x: number, y: number, scale: number): void {
    const i = this.splatHead;
    this.splatHead = (this.splatHead + 1) % 24;
    this.splatX[i] = x;
    this.splatY[i] = y;
    this.splatLv[i] = level;
    this.splatVar[i] = rngFx.next() < 0.5 ? 0 : 1;
    this.splatT[i] = 0;
    this.splatRot[i] = rngFx.next() * TAU;
    this.splatS[i] = scale;
  }

  ghost(level: number, x0: number, y0: number, x1: number, y1: number, dur: number): void {
    const i = this.ghostHead;
    this.ghostHead = (this.ghostHead + 1) % 8;
    this.ghostLv[i] = level;
    this.ghostX0[i] = x0;
    this.ghostY0[i] = y0;
    this.ghostX1[i] = x1;
    this.ghostY1[i] = y1;
    this.ghostT[i] = 0;
    this.ghostDur[i] = dur;
  }

  rays(x: number, y: number, n: number, len: number, dur: number, rainbow: boolean): void {
    const i = this.rayHead;
    this.rayHead = (this.rayHead + 1) % 2;
    this.rayX[i] = x;
    this.rayY[i] = y;
    this.rayN[i] = n;
    this.rayT[i] = 0;
    this.rayDur[i] = dur;
    this.rayLen[i] = len;
    this.rayRainbow[i] = rainbow ? 1 : 0;
  }

  /** 游戏时钟推进（hitstop 时 dt = 0 即冻结） */
  update(dt: number, realDt: number): void {
    if (dt > 0) {
      const top = CONFIG.layout.jar.inner.T;
      for (let i = 0; i < CAP; i++) {
        if (!this.alive[i]) continue;
        let l = this.life[i]! - dt;
        const k = this.kind[i]!;
        if (k === P_BUBBLE && this.y[i]! < top + 6) l = Math.min(l, 0.05);
        if (l <= 0) {
          this.alive[i] = 0;
          this.count--;
          continue;
        }
        this.life[i] = l;
        const dk = 1 / (1 + this.drag[i]! * dt);
        let vx = this.vx[i]! * dk;
        let vy = this.vy[i]! * dk + this.grav[i]! * dt;
        if (k === P_CONFETTI || k === P_BUBBLE || k === P_ZZZ) {
          this.phase[i] = this.phase[i]! + dt * (k === P_CONFETTI ? 9 : 3);
          vx += Math.sin(this.phase[i]!) * (k === P_CONFETTI ? 160 : 40) * dt;
        }
        this.vx[i] = vx;
        this.vy[i] = vy;
        this.x[i] = this.x[i]! + vx * dt;
        this.y[i] = this.y[i]! + vy * dt;
        this.rot[i] = this.rot[i]! + this.vrot[i]! * dt;
      }
      for (let i = 0; i < 12; i++) if (this.ringT[i]! < this.ringDur[i]! + 0.01) this.ringT[i] = this.ringT[i]! + dt;
      for (let i = 0; i < 8; i++) if (this.ghostT[i]! < this.ghostDur[i]!) this.ghostT[i] = this.ghostT[i]! + dt;
      for (let i = 0; i < 2; i++) if (this.rayT[i]! < this.rayDur[i]!) this.rayT[i] = this.rayT[i]! + dt;
    }
    // 溅痕按真实时间淡出并上滑
    for (let i = 0; i < 24; i++) {
      if (this.splatT[i]! < 2.5) {
        this.splatT[i] = this.splatT[i]! + realDt;
        this.splatY[i] = this.splatY[i]! - 8 * realDt;
      }
    }
  }

  /** 背层：溅痕（贴在玻璃上） */
  drawSplats(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < 24; i++) {
      const t = this.splatT[i]!;
      if (t >= 2.5) continue;
      const a = t < 0.08 ? t / 0.08 : 1 - Math.max(0, (t - 0.6) / 1.9);
      const sp = this.sprites.splat(this.splatLv[i]!, this.splatVar[i]!);
      const s = this.splatS[i]! * (t < 0.12 ? 0.6 + (t / 0.12) * 0.4 : 1);
      ctx.globalAlpha = a * 0.8;
      const x = this.splatX[i]!;
      const y = this.splatY[i]!;
      const rot = this.splatRot[i]!;
      ctx.translate(x, y);
      ctx.rotate(rot);
      drawSprite(ctx, sp, 0, 0, s);
      ctx.rotate(-rot);
      ctx.translate(-x, -y);
    }
    ctx.globalAlpha = 1;
  }

  /** 光芒组（画在水果后面） */
  drawRays(ctx: CanvasRenderingContext2D, time: number): void {
    const ray = this.sprites.ray();
    for (let i = 0; i < 2; i++) {
      const t = this.rayT[i]!;
      const dur = this.rayDur[i]!;
      if (t >= dur) continue;
      const k = t / dur;
      const grow = Math.min(1, t / 0.18);
      const a = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) * 0.55;
      const n = this.rayN[i]!;
      const len = this.rayLen[i]! * (0.4 + 0.6 * grow);
      const x = this.rayX[i]!;
      const y = this.rayY[i]!;
      const rb = this.rayRainbow[i] === 1;
      ctx.translate(x, y);
      for (let j = 0; j < n; j++) {
        const ang = time * 0.6 + (j * TAU) / n;
        ctx.rotate(ang);
        ctx.globalAlpha = a * (j % 2 === 0 ? 1 : 0.7);
        if (rb) {
          ctx.fillStyle = PALETTE[RAINBOW[j % 6]!]!;
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(len, -len * 0.09);
          ctx.lineTo(len, len * 0.09);
          ctx.lineTo(0, 4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.drawImage(ray.c, 0, -ray.ay * (len / ray.w), len, ray.h * (len / ray.w));
        }
        ctx.rotate(-ang);
      }
      ctx.translate(-x, -y);
    }
    ctx.globalAlpha = 1;
  }

  /** 冲击波圆环 + 融合残影（水果层之上） */
  drawRings(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < 12; i++) {
      const t = this.ringT[i]!;
      const dur = this.ringDur[i]!;
      if (t < 0 || t >= dur) continue;
      const k = t / dur;
      const e = 1 - Math.pow(1 - k, 3);
      const r = this.ringR0[i]! + (this.ringR1[i]! - this.ringR0[i]!) * e;
      const w = this.ringW[i]! * (1 - k);
      if (w < 0.2) continue;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.strokeStyle = PALETTE[this.ringCol[i]!]!;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(this.ringX[i]!, this.ringY[i]!, r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** 融合残影：0.09 s 内滑向中心并缩小（^ ^ 表情由调用者画） */
  forEachGhost(cb: (level: number, x: number, y: number, s: number, a: number) => void): void {
    for (let i = 0; i < 8; i++) {
      const t = this.ghostT[i]!;
      const dur = this.ghostDur[i]!;
      if (t >= dur) continue;
      const k = t / dur;
      const e = k * k;
      cb(this.ghostLv[i]!, this.ghostX0[i]! + (this.ghostX1[i]! - this.ghostX0[i]!) * e, this.ghostY0[i]! + (this.ghostY1[i]! - this.ghostY0[i]!) * e, 1 - 0.45 * e, 1 - e * 0.5);
    }
  }

  /** 粒子（最上层） */
  draw(ctx: CanvasRenderingContext2D): void {
    this.refreshCache();
    const fx = this.fixedS;
    for (let i = 0; i < CAP; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i]!;
      const life = this.life[i]!;
      const max = this.max[i]!;
      const f = life / max;
      let a = f < 0.3 ? f / 0.3 : 1;
      const born = max - life;
      if (born < 0.05) a *= born / 0.05 + 0.2;
      const x = this.x[i]!;
      const y = this.y[i]!;
      const s = this.size[i]!;
      const ci = this.col[i]!;
      ctx.globalAlpha = Math.min(1, a);
      switch (k) {
        case P_JUICE:
          drawSprite(ctx, this.colored(this.dotS, 'dot', ci), x, y, s / 12);
          break;
        case P_BUBBLE:
          ctx.globalAlpha = Math.min(1, a) * 0.85;
          drawSprite(ctx, fx[0]!, x, y, s / 13);
          break;
        case P_STAR:
        case P_SPARKLE:
        case P_DUST: {
          const sp = k === P_STAR ? this.colored(this.starS, 'star', ci) : this.colored(this.sparkS, 'sparkle', ci);
          const rot = this.rot[i]!;
          const sc = (s / 13) * (k === P_DUST ? 0.6 + 0.4 * Math.sin(born * 30) : 1);
          ctx.translate(x, y);
          ctx.rotate(rot);
          drawSprite(ctx, sp, 0, 0, sc);
          ctx.rotate(-rot);
          ctx.translate(-x, -y);
          break;
        }
        case P_HEART: {
          const pop = born < 0.15 ? 0.4 + (born / 0.15) * 0.75 : 1.15 - Math.min(0.15, (born - 0.15) * 0.6);
          drawSprite(ctx, fx[1]!, x, y, (s / 12) * pop);
          break;
        }
        case P_SWEAT:
          drawSprite(ctx, fx[2]!, x, y, s / 9);
          break;
        case P_TEAR:
          drawSprite(ctx, fx[3]!, x, y, s / 9);
          break;
        case P_SEED: {
          const rot = this.rot[i]!;
          ctx.translate(x, y);
          ctx.rotate(rot);
          drawSprite(ctx, fx[4]!, 0, 0, s / 8);
          ctx.rotate(-rot);
          ctx.translate(-x, -y);
          break;
        }
        case P_CONFETTI: {
          const rot = this.rot[i]!;
          const flip = Math.cos(this.phase[i]! * 1.3);
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.fillStyle = PALETTE[ci]!;
          ctx.fillRect(-s, -s * 0.55 * flip, s * 2, s * 1.1 * flip);
          ctx.rotate(-rot);
          ctx.translate(-x, -y);
          break;
        }
        case P_ZZZ:
          ctx.fillStyle = '#9C7A9E';
          ctx.font = ZFONT;
          ctx.fillText('z', x, y);
          break;
        case P_STREAK: {
          const vx = this.vx[i]!;
          const vy = this.vy[i]!;
          const sp = Math.sqrt(vx * vx + vy * vy) || 1;
          const len = s;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - (vx / sp) * len, y - (vy / sp) * len);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

const ZFONT = '700 14px Fredoka, "PingFang SC", sans-serif';
