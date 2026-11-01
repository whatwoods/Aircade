/**
 * 主画布绘制（docs §2.4）：背景 → 轨道动态光 → 链条 → 前景（闸门/石桥）→ 弹丸 → 图腾 → 瞄准 → 粒子 → 跳字 → 放大镜。
 */
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { follow } from '../core/tween';
import type { Ball } from '../game/chain';
import type { Session } from '../game/session';
import { MUZZLE, type Hit } from '../game/shooter';
import type { Track } from '../game/track';
import { BALL_R, SPR, ballSprites, bakeBalls, getBakeScale, glowSprite, raysSprite, ringSprite } from './ballArt';
import { C, FONT_CN, FONT_NUM } from './palette';
import { Particles } from './particles';
import { Popups } from './popups';
import { bakeScene, serpentEyes, tracePath, type SceneLayers } from './scene';
import type { TitleScene } from './titleScene';

export interface AimView {
  active: boolean;
  angle: number;
  valid: boolean;
  cancel: boolean;
  touch: boolean;
  fx: number;
  fy: number;
  hit: Hit;
  /** 预测合成的邻珠 id（-1 无） */
  matchId: number;
  hover: boolean;
}

interface Ghost {
  alive: boolean;
  level: number;
  s0: number;
  targetId: number;
  t: number;
  dur: number;
}

/** 图腾眼窝里「下一个」的缩放与眼窝半径：4 位数也 ≥12.8 px（docs §11.7） */
const NEXT_K = 0.8;
const NEXT_R = 21;

const tmp = { x: 0, y: 0 };
const tmp2 = { x: 0, y: 0 };

/** 角度取模到 (−π, π]，任意大小都是 O(1) */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private scale = 1;
  private scene: SceneLayers | null = null;
  private sceneTrack: Track | null = null;
  readonly particles = new Particles();
  readonly popups = new Popups();
  private ghosts: Ghost[] = [];
  private rayCanvas: HTMLCanvasElement | null = null;
  private motes = new Float32Array(60 * 4);
  private flies = new Float32Array(8 * 4);
  // 镜头
  trauma = 0;
  shakeMul = 1;
  private zoom = 1;
  zoomTarget = 1;
  private zoomCx = 195;
  private zoomCy = 450;
  flash = 0;
  /** 闪屏颜色（r,g,b） */
  flashRgb = '255,240,200';
  /** 危险程度 0..1（平滑） */
  private danger = 0;
  /** 连锁徽章 */
  badgeN = 0;
  badgeT = 0;
  private badgeBump = 0;
  /** 图腾状态 */
  private totemAngle = -Math.PI / 2;
  private totemAngV = 0;
  private recoil = 0;
  swapT = 1;
  rerollT = 1;
  rerollWhich = 0;
  loadT = 1;
  /** 金印冲击/定身微光 */
  freezeGlow = 0;
  private time = 0;
  private sealReadyPulse = 0;
  showcase = false;
  loupe = true;
  /** 收官时闸门落下 */
  gateDrop = 0;
  /** 合成吸回提示（链尾后方的回缩箭头），衰减 */
  pullGlow = 0;
  /** 引导：高亮的珠子 id */
  hintId = -1;
  hintTotem = false;
  /** 引导 T4：金蛇口闪烁 */
  mouthFlash = 0;
  /** 低画质：关光尘与 god rays */
  lowFx = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    for (let i = 0; i < 12; i++) this.ghosts.push({ alive: false, level: 1, s0: 0, targetId: 0, t: 0, dur: 0.11 });
    const r = new Rng(9);
    for (let i = 0; i < 60; i++) {
      this.motes[i * 4] = r.next() * 390;
      this.motes[i * 4 + 1] = r.next() * 844;
      this.motes[i * 4 + 2] = r.next() * Math.PI * 2;
      this.motes[i * 4 + 3] = 0.4 + r.next() * 0.8;
    }
    for (let i = 0; i < 8; i++) {
      this.flies[i * 4] = r.next() * 390;
      this.flies[i * 4 + 1] = 100 + r.next() * 640;
      this.flies[i * 4 + 2] = r.next() * 10;
      this.flies[i * 4 + 3] = r.next() * 10;
    }
  }

  resize(scale: number, dpr: number): void {
    const s = Math.min(4, scale * dpr);
    this.scale = s;
    this.canvas.width = Math.round(390 * s);
    this.canvas.height = Math.round(844 * s);
    if (Math.abs(getBakeScale() - s) > 0.01) bakeBalls(s);
    this.rayCanvas = bakeRay(s);
    if (this.sceneTrack) this.scene = bakeScene(this.sceneTrack, s, 31 + this.sceneTrack.length);
  }

  setTrack(t: Track): void {
    if (this.sceneTrack === t && this.scene) return;
    this.sceneTrack = t;
    this.scene = bakeScene(t, this.scale, 31 + t.length);
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(CONFIG.fx.traumaMax, Math.max(this.trauma, v));
  }

  ghost(level: number, s0: number, targetId: number): void {
    const gh = this.ghosts.find((q) => !q.alive);
    if (!gh) return;
    gh.alive = true;
    gh.level = level;
    gh.s0 = s0;
    gh.targetId = targetId;
    gh.t = 0;
  }

  tag(text: string, x: number, y: number, color = C.goldHi, size = 16): void {
    // 统一走跳字池的避让与同屏上限（docs §5.5）
    this.popups.label(text, x, y, color, size);
  }

  recoilKick(): void {
    this.recoil = 1;
  }

  zoomPulse(z: number, x: number, y: number): void {
    this.zoomTarget = Math.max(this.zoomTarget, z);
    this.zoomCx = x;
    this.zoomCy = y;
  }

  update(dt: number, s: Session | null, aim: AimView): void {
    this.time += dt;
    this.particles.update(dt);
    this.popups.update(dt);
    this.trauma = Math.max(0, this.trauma - CONFIG.fx.traumaDecay * dt);
    this.zoom = follow(this.zoom, this.zoomTarget, 12, dt);
    this.zoomTarget = follow(this.zoomTarget, 1, 3.5, dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.badgeBump = Math.max(0, this.badgeBump - dt * 5);
    if (this.badgeT > 0) this.badgeT -= dt;
    this.swapT = Math.min(1, this.swapT + dt / CONFIG.ammo.swapDur);
    this.rerollT = Math.min(1, this.rerollT + dt / CONFIG.ammo.rerollDur);
    this.loadT = Math.min(1, this.loadT + dt / 0.16);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.freezeGlow = Math.max(0, this.freezeGlow - dt);
    this.mouthFlash = Math.max(0, this.mouthFlash - dt);
    this.pullGlow = Math.max(0, this.pullGlow - dt * 1.6);
    this.sealReadyPulse += dt;
    for (const gh of this.ghosts) if (gh.alive && (gh.t += dt) >= gh.dur) gh.alive = false;
    if (s) {
      const p = s.phase === 'live' ? s.chain.headProgress() : 0;
      const target = p < CONFIG.danger.warn ? 0 : (p - CONFIG.danger.warn) / (1 - CONFIG.danger.warn);
      this.danger = follow(this.danger, Math.min(1, target), 3, dt);
      // 图腾跟随瞄准角（弹簧）
      const want = aim.active || aim.hover ? aim.angle : this.totemAngle;
      const w = 28;
      // 自适应子步（每步 dt·ω ≤ 0.4，稳定域内），取模归一化，非有限值兜底
      const n = Math.min(16, Math.max(1, Math.ceil(dt * w * 2.5)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const d = wrapAngle(want - this.totemAngle);
        this.totemAngV += (w * w * d - 2 * 0.8 * w * this.totemAngV) * h;
        this.totemAngle += this.totemAngV * h;
      }
      this.totemAngle = wrapAngle(this.totemAngle);
      if (!Number.isFinite(this.totemAngle) || !Number.isFinite(this.totemAngV)) {
        this.totemAngle = Number.isFinite(want) ? want : -Math.PI / 2;
        this.totemAngV = 0;
      }
    }
    // 光尘
    for (let i = 0; i < 60; i++) {
      const k = i * 4;
      this.motes[k]! += Math.cos(this.time * 0.3 + this.motes[k + 2]!) * 6 * dt - 4 * dt;
      this.motes[k + 1]! += (Math.sin(this.time * 0.4 + this.motes[k + 2]!) * 5 + 3) * dt;
      if (this.motes[k + 1]! > 860) this.motes[k + 1] = -10;
      if (this.motes[k]! < -10) this.motes[k] = 400;
    }
  }

  draw(s: Session | null, aim: AimView, paused: boolean): void {
    const g = this.g;
    const sc = this.scale;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    // 镜头
    const tr = this.trauma * this.trauma * this.shakeMul;
    const t = this.time;
    const ox = CONFIG.fx.shakeMaxPx * tr * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 91.7) * 0.4);
    const oy = CONFIG.fx.shakeMaxPx * tr * (Math.cos(t * 53.1) * 0.6 + Math.sin(t * 77.9) * 0.4);
    const rot = ((CONFIG.fx.shakeMaxDeg * Math.PI) / 180) * tr * Math.sin(t * 39.7);
    g.translate(195 + ox, 422 + oy);
    g.rotate(rot);
    const z = this.zoom;
    g.translate(-195, -422);
    if (z !== 1) {
      g.translate(this.zoomCx, this.zoomCy);
      g.scale(z, z);
      g.translate(-this.zoomCx, -this.zoomCy);
    }
    if (this.scene) g.drawImage(this.scene.back, -4, -4, 398, 852);
    else {
      g.fillStyle = C.mossDeep;
      g.fillRect(0, 0, 390, 844);
    }
    this.drawRays(g);
    if (s && this.scene) {
      this.drawTrackFx(g, s);
      this.drawChain(g, s, false);
      // 前景：闸门、石桥（闸门落下时更暗）
      g.drawImage(this.scene.front, -4, -4, 398, 852);
      this.drawChain(g, s, true);
      this.drawEyes(g, s.track);
      this.drawProjectiles(g, s);
      this.drawTotem(g, s, aim);
      if (!paused) this.drawAim(g, s, aim);
    }
    this.particles.draw(g, glowSprite());
    this.drawMotes(g);
    this.popups.draw(g);
    if (s) this.drawBadge(g, s);
    if (s && aim.active && aim.touch && aim.valid && !paused && this.loupe) this.drawLoupe(g, s, aim);
    if (this.showcase) this.drawShowcase([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // 危险暗角
    g.setTransform(sc, 0, 0, sc, 0, 0);
    if (this.danger > 0.01) {
      const pulse = this.danger > 0.6 ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 0.7) : 1;
      const a = (0.08 + 0.08 * this.danger) * (0.7 + 0.3 * pulse) * Math.min(1, this.danger * 3);
      const vg = g.createRadialGradient(195, 422, 260, 195, 422, 560);
      vg.addColorStop(0, 'rgba(226,70,58,0)');
      vg.addColorStop(1, `rgba(226,70,58,${a.toFixed(3)})`);
      g.fillStyle = vg;
      g.fillRect(0, 0, 390, 844);
    }
    if (this.flash > 0) {
      g.fillStyle = `rgba(${this.flashRgb},${(this.flash * 0.35).toFixed(3)})`;
      g.fillRect(0, 0, 390, 844);
    }
  }

  get pixelScale(): number {
    return this.scale;
  }

  /** 标题待机画面 */
  drawTitle(ts: TitleScene): void {
    const g = this.g;
    const sc = this.scale;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    ts.bake(sc);
    ts.draw(g, (l, x, y, roll, s) => this.drawBall(g, l, x, y, roll, s));
    this.drawRays(g);
    this.particles.draw(g, glowSprite());
    this.drawMotes(g);
  }

  private drawRays(g: CanvasRenderingContext2D): void {
    if (!this.rayCanvas || this.lowFx) return;
    const t = this.time;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = 0.62 + i * 0.16 + Math.sin(t / (9 + i * 2.5) + i) * 0.04;
      g.globalAlpha = 0.16 + 0.07 * Math.sin(t / (6 + i) + i * 2);
      g.save();
      g.translate(420, -40);
      g.rotate(a + Math.PI / 2);
      g.drawImage(this.rayCanvas, -50 - i * 10, 0, 100 + i * 30, 1000);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawMotes(g: CanvasRenderingContext2D): void {
    if (this.lowFx) return;
    const glow = glowSprite();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const k = i * 4;
      const x = this.motes[k]!, y = this.motes[k + 1]!;
      // 光束里的更亮
      const inRay = Math.max(0, 1 - Math.abs((390 - x) * 0.55 - (y + 40) * 0.42) / 160);
      const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + this.motes[k + 2]!);
      g.globalAlpha = (0.12 + 0.4 * inRay) * tw;
      const s = 3 * this.motes[k + 3]!;
      g.drawImage(glow, x - s, y - s, s * 2, s * 2);
    }
    // 萤火虫
    for (let i = 0; i < 8; i++) {
      const k = i * 4;
      const x = this.flies[k]! + Math.sin(this.time * 0.37 + this.flies[k + 2]!) * 30;
      const y = this.flies[k + 1]! + Math.cos(this.time * 0.29 + this.flies[k + 3]!) * 24;
      const blink = Math.max(0, Math.sin(this.time * 1.3 + this.flies[k + 2]! * 3));
      g.globalAlpha = 0.5 * blink;
      g.drawImage(glow, x - 7, y - 7, 14, 14);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawTrackFx(g: CanvasRenderingContext2D, s: Session): void {
    const ch = s.chain;
    const tr = s.track;
    const L = tr.length;
    if (this.pullGlow > 0.02) this.drawPull(g, s);
    // 危险红光：从蛇口往回到链头
    if (this.danger > 0.01 && ch.balls.length) {
      const head = Math.min(L, ch.balls[0]!.s + ch.balls[0]!.rOff);
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 6);
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      tracePath(g, tr, Math.max(0, head - 30), L, 8);
      g.strokeStyle = `rgba(226,70,58,${(0.22 * this.danger * pulse).toFixed(3)})`;
      g.lineWidth = 54;
      g.stroke();
      g.strokeStyle = `rgba(255,120,90,${(0.5 * this.danger * pulse).toFixed(3)})`;
      g.lineWidth = 3;
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    // 缺口：槽底暖光 + 引力线
    const D = CONFIG.ball.D;
    for (let i = 0; i < ch.balls.length - 1; i++) {
      const a = ch.balls[i]!, b = ch.balls[i + 1]!;
      if (a.s - b.s <= D + 1) continue;
      const pa = tr.posAt(a.s + a.rOff, tmp);
      const ax = pa.x, ay = pa.y;
      const pb = tr.posAt(b.s + b.rOff, tmp2);
      const mid = tr.posAt((a.s + b.s) / 2);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35;
      const gl = glowSprite();
      g.drawImage(gl, mid.x - 26, mid.y - 26, 52, 52);
      g.globalAlpha = 1;
      if (a.level === b.level) {
        g.strokeStyle = `rgba(255,220,120,${(0.5 + 0.4 * Math.sin(this.time * 14)).toFixed(3)})`;
        g.lineWidth = 2;
        g.setLineDash([4, 5]);
        g.lineDashOffset = -this.time * 40;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(pb.x, pb.y);
        g.stroke();
        g.setLineDash([]);
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  private ballPos(s: Session, b: Ball, out: { x: number; y: number }): { x: number; y: number } {
    const p = s.track.posAt(b.s + b.rOff, out);
    if (b.insT > 0) {
      const k = b.insT / 0.09;
      const e = k * k;
      out.x = p.x + (b.fromX - p.x) * e;
      out.y = p.y + (b.fromY - p.y) * e;
    }
    return out;
  }

  drawBall(g: CanvasRenderingContext2D, level: number, x: number, y: number, roll: number, scale = 1, alpha = 1): void {
    const sp = ballSprites(level);
    const h = (SPR / 2) * scale;
    g.globalAlpha = alpha;
    if (level === 11) {
      // 日轮外圈旋转光芒
      g.save();
      g.translate(x, y);
      g.rotate(this.time * 0.6);
      g.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(this.time * 3));
      const rs = 32 * scale;
      g.drawImage(raysSprite(), -rs, -rs, rs * 2, rs * 2);
      g.restore();
      g.globalAlpha = alpha;
    }
    if (roll !== 0) {
      g.save();
      g.translate(x, y);
      g.rotate(roll);
      g.drawImage(sp.body, -h, -h, h * 2, h * 2);
      g.restore();
    } else g.drawImage(sp.body, x - h, y - h, h * 2, h * 2);
    g.drawImage(sp.shade, x - h, y - h, h * 2, h * 2);
    if (level === 10) {
      // 鎏金流光
      const k = ((this.time / 3) % 1) * 2 - 0.5;
      g.save();
      g.beginPath();
      g.arc(x, y, BALL_R * scale, 0, Math.PI * 2);
      g.clip();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,240,200,0.35)';
      g.translate(x + (k - 0.5) * 50 * scale, y);
      g.rotate(0.5);
      g.fillRect(-4 * scale, -30 * scale, 8 * scale, 60 * scale);
      g.restore();
    }
    g.drawImage(sp.num, x - h, y - h, h * 2, h * 2);
    g.globalAlpha = 1;
  }

  private drawChain(g: CanvasRenderingContext2D, s: Session, tunnelPass: boolean): void {
    const ch = s.chain;
    const tr = s.track;
    const sealL = s.cfg.sealLevel;
    const glow = glowSprite();
    const ring = ringSprite();
    // 合成吸入的幽灵珠
    if (!tunnelPass) {
      for (const gh of this.ghosts) {
        if (!gh.alive) continue;
        const idx = ch.indexOf(gh.targetId);
        if (idx < 0) continue;
        const tb = ch.balls[idx]!;
        const p0 = tr.posAt(gh.s0, tmp);
        const x0 = p0.x, y0 = p0.y;
        const p1 = tr.posAt(tb.s + tb.rOff, tmp2);
        const k = gh.t / gh.dur;
        const e = k * k;
        this.drawBall(g, gh.level, x0 + (p1.x - x0) * e, y0 + (p1.y - y0) * e, 0, 1 - 0.15 * k, 1 - k * 0.5);
      }
    }
    for (let i = ch.balls.length - 1; i >= 0; i--) {
      const b = ch.balls[i]!;
      const sv = b.s + b.rOff;
      const inT = tr.inTunnel(sv);
      if (tunnelPass !== inT) continue;
      // 闸门石拱中线之前的珠子不画：读作「从拱门里滚出来」（docs §4.4）
      if (sv < tr.visStart + tr.gateLen * 0.5) continue;
      const p = this.ballPos(s, b, tmp);
      let x = p.x, y = p.y;
      if (i === 0 && this.danger > 0.6 && s.phase === 'live') {
        x += Math.sin(this.time * 61) * 1;
        y += Math.cos(this.time * 53) * 1;
      }
      let scale = 1 + 0.22 * b.pop * b.pop;
      if (b.sealT > 0) {
        const k = 1 - b.sealT / CONFIG.seal.holdBeforeBurst;
        scale = 1 + 0.25 * Math.min(1, k * 2);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.6 + 0.4 * k;
        g.drawImage(glow, x - 46, y - 46, 92, 92);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      const alpha = tunnelPass ? 0.32 : 1;
      this.drawBall(g, b.level, x, y, sv / BALL_R, scale, alpha);
      if (b.sealT > 0) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.5;
        g.drawImage(glow, x - 26, y - 26, 52, 52);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      if (!tunnelPass && b.level === sealL - 1 && b.sealT <= 0) {
        g.globalAlpha = 0.45 + 0.4 * Math.sin(this.sealReadyPulse * (Math.PI * 2) / 1.2);
        g.drawImage(ring, x - 30, y - 30, 60, 60);
        g.globalAlpha = 1;
      }
      if (this.freezeGlow > 0 && !tunnelPass) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.18 * Math.min(1, this.freezeGlow * 2);
        g.drawImage(glow, x - 22, y - 22, 44, 44);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      if (b.id === this.hintId) {
        g.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 6);
        g.drawImage(ring, x - 32, y - 32, 64, 64);
        g.globalAlpha = 1;
      }
    }
  }

  private drawEyes(g: CanvasRenderingContext2D, t: Track): void {
    const eyes = serpentEyes(t);
    const glow = glowSprite();
    const mf = this.mouthFlash > 0 ? Math.max(0, Math.sin(this.mouthFlash * Math.PI * 3.3)) : 0;
    const k = Math.min(1.6, 0.25 + this.danger * 0.75 + mf * 1.2);
    for (const e of eyes) {
      g.fillStyle = '#7A1A12';
      g.beginPath();
      g.arc(e.x, e.y, 4.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.danger;
      g.beginPath();
      g.arc(e.x, e.y, 3, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = k * (0.7 + 0.3 * Math.sin(this.time * 5));
      g.drawImage(glow, e.x - 12, e.y - 12, 24, 24);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#FFE7D0';
      g.fillRect(e.x - 1.6, e.y - 1.8, 1.2, 1.2);
    }
  }

  private drawProjectiles(g: CanvasRenderingContext2D, s: Session): void {
    for (const p of s.projectiles) {
      if (!p.alive) continue;
      const sp = Math.hypot(p.vx, p.vy);
      const dx = p.vx / sp, dy = p.vy / sp;
      // 拖尾
      const lv = p.wild ? 4 : p.level;
      g.globalCompositeOperation = 'lighter';
      for (let k = 1; k <= 8; k++) {
        g.globalAlpha = 0.28 * (1 - k / 9);
        const r = BALL_R * (1 - k * 0.07);
        g.drawImage(glowSprite(), p.x - dx * k * 9 - r, p.y - dy * k * 9 - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      if (p.wild) this.drawWild(g, p.x, p.y, 1);
      else this.drawBall(g, lv, p.x, p.y, p.age * 20, 1);
    }
  }

  drawWild(g: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    const glow = glowSprite();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.7;
    g.drawImage(glow, x - 30 * scale, y - 30 * scale, 60 * scale, 60 * scale);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const r = BALL_R * scale;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 1, x, y, r);
    gr.addColorStop(0, '#E8FFF2');
    gr.addColorStop(0.4, '#5FD69C');
    gr.addColorStop(1, '#0E5A3A');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = C.goldHi;
    g.lineWidth = 1.5;
    g.stroke();
    g.save();
    g.translate(x, y);
    g.rotate(this.time * 1.5);
    g.strokeStyle = 'rgba(255,255,230,0.8)';
    g.lineWidth = 1.4 * scale;
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -r * 0.25);
      g.lineTo(0, -r * 0.7);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#F7FFF9';
    g.font = `800 ${Math.round(17 * scale)}px ${FONT_NUM}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', x, y + 0.5);
  }

  private drawTotem(g: CanvasRenderingContext2D, s: Session, aim: AimView): void {
    const cx = s.totemX, cy = s.totemY;
    const a = this.totemAngle;
    const glow = glowSprite();
    // 阴影
    g.fillStyle = 'rgba(5,15,10,0.45)';
    g.beginPath();
    g.ellipse(cx + 3, cy + 7, 46, 44, 0, 0, Math.PI * 2);
    g.fill();
    // 蛇首（朝瞄准方向）
    const rc = this.recoil * 4;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.translate(-rc, 0);
    const hg = g.createLinearGradient(0, -14, 0, 14);
    hg.addColorStop(0, C.goldHi);
    hg.addColorStop(0.5, C.gold);
    hg.addColorStop(1, C.bronze);
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(26, -17);
    g.quadraticCurveTo(52, -20, 66, -9);
    g.lineTo(70, 0);
    g.lineTo(66, 9);
    g.quadraticCurveTo(52, 20, 26, 17);
    g.closePath();
    g.fill();
    g.strokeStyle = C.bronze;
    g.lineWidth = 1.5;
    g.stroke();
    // 鳞纹
    g.strokeStyle = 'rgba(120,70,20,0.55)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(34 + i * 7, 0, 10, -1, 1);
      g.stroke();
    }
    g.restore();
    // 石盘
    const sg = g.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 42);
    sg.addColorStop(0, '#C9C2A0');
    sg.addColorStop(0.6, C.stone);
    sg.addColorStop(1, '#4F5342');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(cx, cy, 40, 0, Math.PI * 2);
    g.fill();
    // 金环 + 阶梯纹
    g.strokeStyle = C.bronze;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, 37, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = C.gold;
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(60,40,10,0.7)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const aa = (i / 12) * Math.PI * 2 + 0.13;
      g.beginPath();
      g.moveTo(cx + Math.cos(aa) * 35, cy + Math.sin(aa) * 35);
      g.lineTo(cx + Math.cos(aa) * 39, cy + Math.sin(aa) * 39);
      g.stroke();
    }
    g.strokeStyle = 'rgba(40,40,30,0.4)';
    g.beginPath();
    g.arc(cx, cy, 27, 0, Math.PI * 2);
    g.stroke();
    // 翡翠眼窝（下一个）
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    const eg = g.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, NEXT_R);
    eg.addColorStop(0, `rgba(190,255,220,${(0.75 + 0.2 * breathe).toFixed(3)})`);
    eg.addColorStop(0.5, '#2E9E68');
    eg.addColorStop(1, '#0E3F2A');
    g.fillStyle = eg;
    g.beginPath();
    g.arc(cx, cy, NEXT_R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = C.gold;
    g.lineWidth = 1.5;
    g.stroke();
    const am = s.ammo;
    // 「下个」小字：放在瞄准方向的反侧，永远不被蛇首挡住
    if (s.phase !== 'over' && this.swapT >= 1) {
      const la = a + Math.PI;
      const lx = cx + Math.cos(la) * 31, ly = cy + Math.sin(la) * 31;
      g.font = `700 12px ${FONT_CN}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(11,35,28,0.85)';
      g.strokeText('下个', lx, ly);
      g.fillStyle = C.uiText;
      g.fillText('下个', lx, ly);
    }
    // 交换动画：两颗球沿内弧对换
    const sw = this.swapT;
    const e = sw < 1 ? sw * sw * (3 - 2 * sw) : 1;
    const mx = cx + Math.cos(a) * MUZZLE, my = cy + Math.sin(a) * MUZZLE;
    const nextPos = { x: cx, y: cy };
    const curPos = { x: mx, y: my };
    const rerollScale = (w: number) => (this.rerollT < 1 && this.rerollWhich & w ? Math.abs(Math.cos(this.rerollT * Math.PI)) : 1);
    if (sw < 1) {
      const perp = a + Math.PI / 2;
      const arc = Math.sin(e * Math.PI) * 22;
      const ncx = mx + (cx - mx) * e + Math.cos(perp) * arc, ncy = my + (cy - my) * e + Math.sin(perp) * arc;
      const ccx = cx + (mx - cx) * e - Math.cos(perp) * arc, ccy = cy + (my - cy) * e - Math.sin(perp) * arc;
      nextPos.x = ncx; nextPos.y = ncy;
      curPos.x = ccx; curPos.y = ccy;
    }
    // 下一个（缩小）
    if (s.phase !== 'over') {
      const ns = (sw < 1 ? NEXT_K + (1 - NEXT_K) * (1 - e) : NEXT_K) * rerollScale(2);
      g.save();
      g.translate(nextPos.x, nextPos.y);
      g.scale(Math.max(0.05, ns), ns);
      this.drawBall(g, am.next, 0, 0, 0, 1);
      g.restore();
      // 当前（在蛇口）
      const load = this.loadT < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - this.loadT, 3)) : 1;
      const cs = (sw < 1 ? NEXT_K + (1 - NEXT_K) * e : 1) * load * rerollScale(1);
      if (am.armed && am.wild > 0) this.drawWild(g, mx, my, 1);
      else {
        // 当前球：金色呼吸环，明确「这颗会射出去」
        if (sw >= 1 && load >= 1) {
          const pr = 0.5 + 0.5 * Math.sin(this.time * 4);
          g.strokeStyle = `rgba(255,231,163,${(0.55 + 0.35 * pr).toFixed(3)})`;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(curPos.x, curPos.y, 23.5 + pr * 1.5, 0, Math.PI * 2);
          g.stroke();
        }
        g.save();
        g.translate(curPos.x, curPos.y);
        g.scale(Math.max(0.05, cs), cs);
        this.drawBall(g, am.current, 0, 0, 0, 1);
        g.restore();
      }
    }
    if (this.hintTotem) {
      g.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 6);
      g.strokeStyle = C.goldHi;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, 48 + 4 * Math.sin(this.time * 6), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    if (aim.active && aim.cancel) {
      g.fillStyle = 'rgba(11,35,28,0.75)';
      g.beginPath();
      g.arc(cx, cy, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.uiText;
      g.font = `700 14px ${FONT_CN}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('取消', cx, cy);
    }
    void glow;
  }

  private drawAim(g: CanvasRenderingContext2D, s: Session, aim: AimView): void {
    if (!aim.active && !aim.hover) return;
    const a = aim.angle;
    const m = { x: s.totemX + Math.cos(a) * (MUZZLE + 22), y: s.totemY + Math.sin(a) * (MUZZLE + 22) };
    const h = aim.hit;
    const endT = Math.max(0, h.t - 22);
    const merge = aim.matchId >= 0;
    const col = aim.cancel ? 'rgba(180,180,170,0.5)' : merge ? C.goldHi : 'rgba(247,239,216,0.75)';
    const dx = Math.cos(a), dy = Math.sin(a);
    const alpha = aim.active ? 1 : 0.55;
    g.globalAlpha = alpha;
    g.fillStyle = col;
    const off = (this.time * 60) % 16;
    for (let d = off; d < endT; d += 16) {
      // 被手指遮挡的那段也照画（手指在目标前方时可见）
      const r = 2.2 + (merge ? 0.6 : 0);
      g.beginPath();
      g.arc(m.x + dx * d, m.y + dy * d, r, 0, Math.PI * 2);
      g.fill();
    }
    if (aim.valid && h.id >= 0 && !aim.cancel) {
      // 幽灵珠
      const lv = s.ammo.armed && s.ammo.wild > 0 ? -1 : s.ammo.current;
      if (lv > 0) this.drawBall(g, lv, h.x, h.y, 0, 0.92, 0.55 * alpha);
      else this.drawWild(g, h.x, h.y, 0.9);
      if (merge) {
        const idx = s.chain.indexOf(aim.matchId);
        if (idx >= 0) {
          const mb = s.chain.balls[idx]!;
          const p = s.track.posAt(mb.s + mb.rOff, tmp);
          g.globalAlpha = alpha;
          g.drawImage(ringSprite(), p.x - 30, p.y - 30, 60, 60);
          // ＝ 记号
          const ex = (p.x + h.x) / 2, ey = (p.y + h.y) / 2;
          g.fillStyle = 'rgba(11,35,28,0.85)';
          g.beginPath();
          g.arc(ex, ey, 7.5, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = C.goldHi;
          g.lineWidth = 1.2;
          g.stroke();
          g.fillStyle = C.goldHi;
          g.fillRect(ex - 3.5, ey - 2.6, 7, 1.6);
          g.fillRect(ex - 3.5, ey + 1, 7, 1.6);
        }
      }
    }
    g.globalAlpha = 1;
  }

  private drawLoupe(g: CanvasRenderingContext2D, s: Session, aim: AimView): void {
    const h = aim.hit;
    if (h.id < 0) return;
    if (Math.hypot(h.x - aim.fx, h.y - aim.fy) > CONFIG.input.loupeTrigger) return;
    const R = CONFIG.input.loupeRadius, Z = CONFIG.input.loupeZoom;
    // 候选落点：上方 → 远离中线的一侧 → 另一侧 → 下方；不得压住图腾（含蛇首与当前球）和目标珠
    const off = CONFIG.input.loupeOffset;
    const side = aim.fx < 195 ? 1 : -1;
    const cands = aim.fy < 220
      ? [[side * 110, 0], [-side * 110, 0], [0, off]]
      : [[0, -off], [side * 120, -30], [-side * 120, -30], [side * 120, 30], [-side * 120, 30], [0, off]];
    let lx = 0, ly = 0, best = -Infinity;
    for (const [dx, dy] of cands) {
      const cx = Math.max(R + 6, Math.min(390 - R - 6, aim.fx + dx!));
      const cy = Math.max(R + 100, Math.min(760 - R, aim.fy + dy!));
      const dT = Math.hypot(cx - s.totemX, cy - s.totemY) - (R + 70);
      const dH = Math.hypot(cx - h.x, cy - h.y) - (R + 22);
      const dF = Math.hypot(cx - aim.fx, cy - aim.fy) - (R + 24);
      const score = Math.min(dT, dH, dF);
      if (score >= 0) {
        lx = cx;
        ly = cy;
        best = score;
        break;
      }
      if (score > best) {
        best = score;
        lx = cx;
        ly = cy;
      }
    }
    g.save();
    g.beginPath();
    g.arc(lx, ly, R, 0, Math.PI * 2);
    g.clip();
    g.translate(lx, ly);
    g.scale(Z, Z);
    g.translate(-h.x, -h.y);
    if (this.scene) g.drawImage(this.scene.back, -4, -4, 398, 852);
    const ch = s.chain;
    for (let i = ch.balls.length - 1; i >= 0; i--) {
      const b = ch.balls[i]!;
      const p = this.ballPos(s, b, tmp);
      if (Math.abs(p.x - h.x) > 70 || Math.abs(p.y - h.y) > 70) continue;
      this.drawBall(g, b.level, p.x, p.y, 0, 1);
      if (b.id === aim.matchId) g.drawImage(ringSprite(), p.x - 30, p.y - 30, 60, 60);
    }
    const lv = s.ammo.armed && s.ammo.wild > 0 ? -1 : s.ammo.current;
    if (lv > 0) this.drawBall(g, lv, h.x, h.y, 0, 0.92, 0.6);
    else this.drawWild(g, h.x, h.y, 0.9);
    g.restore();
    g.strokeStyle = C.bronze;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(lx, ly, R, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = C.gold;
    g.lineWidth = 2.5;
    g.stroke();
  }

  /** 合成吸回：链尾后方 3 个向闸门的箭头，沿轨道流动 */
  private drawPull(g: CanvasRenderingContext2D, s: Session): void {
    const ch = s.chain;
    const tr = s.track;
    let tail = -1;
    for (let i = ch.balls.length - 1; i >= 0; i--) {
      const b = ch.balls[i]!;
      if (b.s + b.rOff > 10) {
        tail = b.s + b.rOff;
        break;
      }
    }
    if (tail < 0) return;
    const a = Math.min(1, this.pullGlow);
    const flow = (this.time * 90) % 26;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 3.5;
    for (let k = 0; k < 3; k++) {
      const ss = tail - 30 - k * 26 - flow;
      if (ss < 4 || tr.inTunnel(ss)) continue;
      const p = tr.posAt(ss);
      const ang = tr.angleAt(ss) + Math.PI; // 指向闸门（s 减小方向）
      const fade = a * (1 - k * 0.28);
      g.strokeStyle = `rgba(168,230,200,${fade.toFixed(3)})`;
      g.beginPath();
      g.moveTo(p.x + Math.cos(ang + 2.4) * 9, p.y + Math.sin(ang + 2.4) * 9);
      g.lineTo(p.x + Math.cos(ang) * 4, p.y + Math.sin(ang) * 4);
      g.lineTo(p.x + Math.cos(ang - 2.4) * 9, p.y + Math.sin(ang - 2.4) * 9);
      g.stroke();
    }
    g.restore();
  }

  bumpBadge(n: number): void {
    this.badgeN = n;
    this.badgeT = 1.1;
    this.badgeBump = 1;
  }

  private drawBadge(g: CanvasRenderingContext2D, s: Session): void {
    if (this.badgeT <= 0 || this.badgeN < 3) return;
    const a = Math.min(1, this.badgeT / 0.3);
    const x = s.totemX, y = Math.max(126, s.totemY - 78);
    const sc = 1 + this.badgeBump * 0.25;
    g.globalAlpha = a;
    g.save();
    g.translate(x, y);
    g.scale(sc, sc);
    g.fillStyle = 'rgba(20,40,32,0.88)';
    g.beginPath();
    g.moveTo(-50, -15);
    g.lineTo(50, -15);
    g.lineTo(56, 0);
    g.lineTo(50, 15);
    g.lineTo(-50, 15);
    g.lineTo(-56, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = C.gold;
    g.lineWidth = 1.5;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = C.uiText;
    g.font = `800 13px ${FONT_CN}`;
    g.fillText('连锁', -16, 0.5);
    g.fillStyle = C.goldHi;
    g.font = `800 22px ${FONT_NUM}`;
    g.fillText(`×${this.badgeN}`, 22, 1);
    g.restore();
    g.globalAlpha = 1;
  }

  /** 引导/展示：在给定位置画一列等级（showcase） */
  drawShowcase(levels: number[]): void {
    const g = this.g;
    const sc = this.scale;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.fillStyle = 'rgba(11,35,28,0.7)';
    g.fillRect(20, 300, 350, 200);
    levels.forEach((l, i) => {
      const x = 52 + (i % 6) * 57, y = 350 + Math.floor(i / 6) * 90;
      this.drawBall(g, l, x, y, 0, 1);
      if (l === 6) g.drawImage(ringSprite(), x - 30, y - 30, 60, 60);
    });
  }
}

function bakeRay(scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(100 * Math.min(scale, 1));
  c.height = Math.ceil(1000 * Math.min(scale, 1));
  const g = c.getContext('2d')!;
  g.scale(c.width / 100, c.height / 1000);
  const gr = g.createLinearGradient(0, 0, 0, 1000);
  gr.addColorStop(0, 'rgba(255,190,120,0.9)');
  gr.addColorStop(0.6, 'rgba(255,190,120,0.25)');
  gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(60, 0);
  g.lineTo(100, 1000);
  g.lineTo(0, 1000);
  g.closePath();
  g.fill();
  const hz = g.createLinearGradient(0, 0, 100, 0);
  hz.addColorStop(0, 'rgba(0,0,0,1)');
  hz.addColorStop(0.5, 'rgba(0,0,0,0)');
  hz.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = hz;
  g.fillRect(0, 0, 100, 1000);
  return c;
}
