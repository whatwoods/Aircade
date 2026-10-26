// 血条（主条 / 残影 / 回复前沿 / 护盾覆盖 / 首领华丽边框与 50% 刻痕）、状态标签、纸板立牌状态
import { Spring } from '../../core/spring.ts';
import { ease } from '../../core/tween.ts';
import type { PortraitId } from '../../game/types.ts';
import { C, cached } from '../kit.ts';
import type { Rect } from '../layout.ts';
import { PW, drawStandee, portraitScale, standeeHeight } from '../portraits.ts';
import { HAND, drawSprite, text } from '../text.ts';
import { rgba } from '../textures.ts';
import { regSpring } from '../ui/widgets.ts';

export class HpBar {
  max = 1;
  /** 目标值 */
  hp = 1;
  main = 1;
  private mainFrom = 1;
  private mainT = 1;
  private mainDur = 0.08;
  ghost = 1;
  private ghostFrom = 1;
  private ghostHold = 0;
  private ghostT = 1;
  /** 回复的绿色前沿 */
  edge = 1;
  shieldV = 0;
  shield = 0;
  private shieldFrom = 0;
  private shieldT = 1;
  shake = 0;
  /** 回复溢出：边缘闪白 */
  full = 0;
  shieldPop = 0;
  shieldBreak = 0;
  /** 首领：刻痕是否已碎 */
  notchBroken = false;
  notchT = 0;

  reset(max: number, hp: number, shield = 0): void {
    this.max = Math.max(1, max);
    this.hp = this.main = this.mainFrom = this.ghost = this.ghostFrom = this.edge = hp;
    this.mainT = this.ghostT = this.shieldT = 1;
    this.ghostHold = 0;
    this.shieldV = this.shield = this.shieldFrom = shield;
    this.shake = this.full = this.shieldPop = this.shieldBreak = 0;
    this.notchBroken = false;
    this.notchT = 0;
  }

  setHp(v: number): void {
    if (v === this.hp) return;
    if (v < this.hp) {
      // 主条 80ms 下降；残影停 300ms 后 450ms 跟上
      if (this.ghostT >= 1 && this.ghostHold <= 0) this.ghost = Math.max(this.ghost, this.main);
      this.mainFrom = this.main;
      this.mainDur = 0.08;
      this.mainT = 0;
      this.ghostHold = 0.3;
      this.ghostT = 1;
      this.edge = Math.min(this.edge, v);
    } else {
      // 回复：绿色前沿先到，主条 350ms 补满
      this.edge = v;
      this.mainFrom = this.main;
      this.mainDur = 0.35;
      this.mainT = 0;
      if (this.ghost < v) this.ghost = v;
    }
    this.hp = v;
  }

  setShield(v: number): void {
    if (v === this.shieldV) return;
    if (v > this.shieldV) this.shieldPop = 0.3;
    if (v === 0 && this.shieldV > 0) this.shieldBreak = 0.5;
    this.shieldFrom = this.shield;
    this.shieldV = v;
    this.shieldT = 0;
  }

  update(dt: number): void {
    if (this.mainT < 1) {
      this.mainT = Math.min(1, this.mainT + dt / this.mainDur);
      const e = this.mainDur > 0.1 ? ease.outCubic(this.mainT) : this.mainT;
      this.main = this.mainFrom + (this.hp - this.mainFrom) * e;
    }
    if (this.ghostHold > 0) {
      this.ghostHold -= dt;
      if (this.ghostHold <= 0) {
        this.ghostFrom = this.ghost;
        this.ghostT = 0;
      }
    } else if (this.ghostT < 1) {
      this.ghostT = Math.min(1, this.ghostT + dt / 0.45);
      this.ghost = this.ghostFrom + (this.hp - this.ghostFrom) * ease.inOutQuad(this.ghostT);
    } else if (this.ghost < this.hp) this.ghost = this.hp;
    if (this.shieldT < 1) {
      this.shieldT = Math.min(1, this.shieldT + dt / 0.2);
      this.shield = this.shieldFrom + (this.shieldV - this.shieldFrom) * ease.outCubic(this.shieldT);
    }
    if (this.edge < this.main) this.edge = this.main;
    if (this.mainT >= 1 && this.edge > this.hp) this.edge = this.hp;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.full > 0) this.full = Math.max(0, this.full - dt);
    if (this.shieldPop > 0) this.shieldPop = Math.max(0, this.shieldPop - dt);
    if (this.shieldBreak > 0) this.shieldBreak = Math.max(0, this.shieldBreak - dt);
    if (this.notchBroken && this.notchT < 1) this.notchT = Math.min(1, this.notchT + dt / 0.5);
  }

  draw(ctx: CanvasRenderingContext2D, r: Rect, o: { boss: boolean; showNum: boolean; time: number; low: boolean }): void {
    let x = r.x;
    const y = r.y;
    if (this.shake > 0) x += Math.sin(this.shake * 70) * 3 * (this.shake / 0.25);
    const w = r.w;
    const h = r.h;
    const m = this.max;
    ctx.save();
    if (o.boss) drawBossFrame(ctx, x, y, w, h);
    drawSprite(ctx, barBack(w, h), x, y);
    const iw = w - 4;
    const ih = h - 4;
    const ix = x + 2;
    const iy = y + 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, ih / 2.6);
    ctx.clip();
    const fx = (v: number): number => (iw * Math.max(0, Math.min(m, v))) / m;
    // 残影
    if (this.ghost > this.main + 0.01) {
      ctx.fillStyle = C.ghost;
      ctx.fillRect(ix, iy, fx(this.ghost), ih);
    }
    // 回复前沿
    if (this.edge > this.main + 0.01) {
      ctx.fillStyle = C.healLight;
      ctx.fillRect(ix, iy, fx(this.edge), ih);
    }
    // 主条
    let hpCol = C.hp;
    if (o.low && Math.sin(o.time * Math.PI * 4) > 0) hpCol = '#e2604a';
    const mw = fx(this.main);
    ctx.fillStyle = hpCol;
    ctx.fillRect(ix, iy, mw, ih);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(ix, iy + 1, mw, ih * 0.32);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(ix, iy + ih * 0.72, mw, ih * 0.28);
    // 护盾覆盖（斜线纹）
    if (this.shield > 0.5) {
      const sw = Math.min(iw, fx(this.shield));
      ctx.fillStyle = rgba(C.shield, 0.6);
      ctx.fillRect(ix, iy, sw, ih);
      ctx.strokeStyle = rgba(C.shieldLight, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let d = -ih; d < sw; d += 7) {
        ctx.moveTo(ix + d, iy + ih);
        ctx.lineTo(ix + d + ih, iy);
      }
      ctx.stroke();
    }
    if (this.full > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(this.full / 0.3) * 0.6})`;
      ctx.fillRect(ix + mw - 6, iy, 6, ih);
    }
    ctx.restore();
    // 首领 50% 刻痕
    if (o.boss) {
      const nx = ix + iw * 0.5;
      if (!this.notchBroken) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(nx, y - 4);
        ctx.lineTo(nx, y + h + 4);
        ctx.stroke();
        ctx.fillStyle = C.brassLight;
        ctx.beginPath();
        ctx.moveTo(nx - 4, y - 6);
        ctx.lineTo(nx + 4, y - 6);
        ctx.lineTo(nx, y - 1);
        ctx.fill();
      } else if (this.notchT < 1) {
        const k = this.notchT;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = C.brassLight;
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(nx + (i - 1.5) * 6 * (1 + k * 3), y - 4 + k * k * 40 + i * 3, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (o.showNum) {
      text(ctx, `${Math.max(0, Math.round(this.hp))} / ${m}`, x + w / 2, y + h / 2 + 1, { size: Math.min(17, h - 4), family: HAND, color: '#fff8ea', stroke: C.ink, strokeW: 3 });
    }
    // 护盾数字徽章
    if (this.shieldV > 0 || this.shieldBreak > 0) {
      const bx = x + w - 4;
      const by = y + h / 2;
      const s = 1 + (this.shieldPop > 0 ? 0.35 * Math.sin((this.shieldPop / 0.3) * Math.PI) : 0);
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(s, s);
      if (this.shieldV > 0) {
        drawSprite(ctx, shieldBadge(), -14, -15);
        text(ctx, String(Math.round(this.shieldV)), 0, 0, { size: 14, family: HAND, color: '#ffffff', stroke: C.ink, strokeW: 3 });
      } else {
        const k = 1 - this.shieldBreak / 0.5;
        ctx.globalAlpha = 1 - k;
        for (const sd of [-1, 1]) {
          ctx.save();
          ctx.translate(sd * k * 10, k * 8);
          ctx.rotate(sd * k * 0.8);
          ctx.beginPath();
          ctx.rect(sd < 0 ? -16 : 0, -16, 16, 32);
          ctx.clip();
          drawSprite(ctx, shieldBadge(), -14, -15);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

function barBack(w: number, h: number) {
  return cached('hpback|' + w + 'x' + h, w, h, 4, (ctx) => {
    ctx.fillStyle = 'rgba(12,6,2,0.4)';
    ctx.beginPath();
    ctx.roundRect(1, 2.5, w, h, h / 2.4);
    ctx.fill();
    ctx.fillStyle = '#2a170c';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2.4);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, w - 3, h - 3, h / 2.6);
    ctx.stroke();
  });
}

function shieldBadge() {
  return cached('shieldbadge', 28, 30, 4, (ctx) => {
    const p = (): void => {
      ctx.beginPath();
      ctx.moveTo(14, 1);
      ctx.lineTo(26, 5);
      ctx.quadraticCurveTo(26, 21, 14, 29);
      ctx.quadraticCurveTo(2, 21, 2, 5);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(1, 2);
    p();
    ctx.fillStyle = 'rgba(12,6,2,0.35)';
    ctx.fill();
    ctx.restore();
    p();
    const g = ctx.createLinearGradient(0, 0, 28, 30);
    g.addColorStop(0, '#8fb3d3');
    g.addColorStop(1, '#3d6488');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  });
}

function drawBossFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawSprite(ctx, bossFrame(w, h), x, y);
}

function bossFrame(w: number, h: number) {
  return cached('bossframe|' + w + 'x' + h, w, h, 20, (ctx) => {
    ctx.strokeStyle = C.brass;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-4, -4, w + 8, h + 8, h / 2 + 3);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-5.5, -5.5, w + 11, h + 11, h / 2 + 4);
    ctx.stroke();
    // 两端兽角
    for (const sd of [-1, 1]) {
      const cx = sd < 0 ? -2 : w + 2;
      ctx.save();
      ctx.translate(cx, h / 2);
      ctx.scale(sd, 1);
      ctx.beginPath();
      ctx.moveTo(0, -h / 2 - 2);
      ctx.quadraticCurveTo(-16, -h / 2 - 6, -18, -h / 2 - 16);
      ctx.quadraticCurveTo(-8, -h / 2 - 2, -2, 0);
      ctx.quadraticCurveTo(-8, h / 2 + 2, -18, h / 2 + 16);
      ctx.quadraticCurveTo(-16, h / 2 + 6, 0, h / 2 + 2);
      ctx.closePath();
      const g = ctx.createLinearGradient(-18, 0, 0, 0);
      g.addColorStop(0, '#f3e6c8');
      g.addColorStop(1, '#bfa77a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }
  });
}

// ---------- 状态标签 ----------

export interface StatusState {
  poison: number;
  poisonPop: number;
  stun: boolean;
  enraged: boolean;
}

/** 右对齐，从 (x,y) 往左排 */
export function drawStatus(ctx: CanvasRenderingContext2D, x: number, y: number, s: StatusState, time: number): void {
  let cx = x;
  if (s.enraged) {
    cx -= 44;
    drawSprite(ctx, statusTag(42, '#9f2a22'), cx, y - 9);
    text(ctx, '狂暴', cx + 21, y, { size: 11, weight: 900, color: '#fff2e6' });
    cx -= 4;
  }
  if (s.stun) {
    cx -= 40;
    drawSprite(ctx, statusTag(38, '#c9a227'), cx, y - 9);
    text(ctx, '眩晕', cx + 19, y + Math.sin(time * 12) * 0.8, { size: 11, weight: 900, color: C.ink });
    cx -= 4;
  }
  if (s.poison > 0) {
    const k = s.poisonPop > 0 ? 1 + 0.3 * Math.sin((s.poisonPop / 0.3) * Math.PI) : 1;
    cx -= 44;
    ctx.save();
    ctx.translate(cx + 21, y);
    ctx.scale(k, k);
    drawSprite(ctx, statusTag(42, C.poison), -21, -9);
    text(ctx, '☠' + s.poison, 0, 0.5, { size: 13, family: HAND, color: '#f6ecff', stroke: C.ink, strokeW: 2.5 });
    ctx.restore();
  }
}

function statusTag(w: number, color: string) {
  return cached('status|' + w + color, w, 18, 3, (ctx) => {
    ctx.fillStyle = 'rgba(12,6,2,0.35)';
    ctx.beginPath();
    ctx.roundRect(1, 2, w, 18, 9);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, 18, 9);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  });
}

// ---------- 纸板立牌 ----------

export class StandeeView {
  id: PortraitId = 'slime';
  /** 弹起（scaleY） */
  pop = regSpring(new Spring(16, 0.38, 0));
  lean = regSpring(new Spring(16, 0.3, 0));
  roar = regSpring(new Spring(14, 0.3, 1));
  flash = 0;
  red = 0;
  fallen = false;
  fallT = 0;
  gloat = false;
  visible = false;

  reset(id: PortraitId): void {
    this.id = id;
    this.pop.snap(0);
    this.lean.snap(0);
    this.roar.snap(1);
    this.flash = 0;
    this.red = 0;
    this.fallen = false;
    this.fallT = 0;
    this.gloat = false;
    this.visible = false;
  }

  popUp(): void {
    this.visible = true;
    this.pop.x = 0;
    this.pop.target = 1;
    this.pop.v = 0;
  }

  hit(big: boolean): void {
    this.flash = 0.09;
    this.lean.v -= big ? 9 : 5;
  }

  fire(): void {
    this.lean.v += 3.2;
  }

  fall(): void {
    this.fallen = true;
    this.fallT = 0;
  }

  update(dt: number): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.fallen) this.fallT = Math.min(1, this.fallT + dt / 0.55);
  }

  scaleFor(r: Rect): number {
    return Math.min((r.h - 4) / standeeHeight(this.id, 1), (r.w + 16) / (PW * portraitScale(this.id)));
  }

  draw(ctx: CanvasRenderingContext2D, r: Rect, time: number): void {
    if (!this.visible) return;
    const bx = r.x + r.w / 2;
    const by = r.y + r.h;
    const sc = this.scaleFor(r);
    let sy = Math.max(0, this.pop.x);
    let lean = this.lean.x * 0.02 + Math.sin(time * 1.6) * 0.012;
    let s = sc * this.roar.x;
    if (this.gloat) lean += Math.sin(time * 5) * 0.06;
    if (this.fallen) {
      // 向后倒下：scaleY → 0.08 并带一次回弹
      const k = this.fallT;
      const e = k < 0.7 ? ease.inQuad(k / 0.7) : 1 - Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.08;
      sy *= 1 - 0.92 * e;
      lean = -0.1 * e;
    }
    const bob = this.fallen ? 0 : Math.sin(time * 2.2) * 0.012;
    s *= 1;
    drawStandee(ctx, this.id, bx, by, s, sy * (1 + bob), lean, this.fallen && this.fallT > 0.35 ? 'back' : 'main');
    if (this.red > 0.01) {
      ctx.save();
      ctx.globalAlpha *= this.red * (0.22 + 0.08 * Math.sin(time * 6));
      drawStandee(ctx, this.id, bx, by, s, sy * (1 + bob), lean, 'red');
      ctx.restore();
    }
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, this.flash / 0.05) * 0.85;
      drawStandee(ctx, this.id, bx, by, s, sy * (1 + bob), lean, 'white');
      ctx.restore();
    }
  }

  /** 受击点（立牌中上部） */
  center(r: Rect, out: { x: number; y: number }): void {
    out.x = r.x + r.w / 2;
    out.y = r.y + r.h * 0.42;
  }
}
