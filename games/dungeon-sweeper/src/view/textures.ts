import { Rng } from '../core/rng';
import { type Sprite, makeCanvas, noiseTile, applyGrain, radialBlob, rgba, roundRect, sprite } from './gfx';
import type { Layout } from './layout';
import { PAL } from './palette';

/**
 * 程序化贴图（文档 §4.4「贴图细节」）。全部在启动 / resize 时以设备像素烘焙，
 * 运行时只做 drawImage。
 */
export class Textures {
  cell = 0;
  dpr = 1;
  /** 单格设备像素 */
  px = 0;
  hidden: Sprite[] = [];
  floor: Sprite[] = [];
  decal: Sprite[] = [];
  stairs!: Sprite;
  candleBase!: Sprite;
  torch!: Sprite;
  tileShadow!: Sprite;
  /** 黑色圆角格遮罩（翻牌明暗、按压变暗） */
  mask!: Sprite;
  /** 金色描边（升级镀金、引导高亮） */
  goldEdge!: Sprite;
  lairBase!: Sprite;
  /** [档次][帧]：0 关 1 半开 2 全开 */
  chest: Sprite[][] = [];
  potion: Sprite[] = [];
  // 发光 / 粒子类（CSS 尺寸见 fxSize）
  flame!: Sprite;
  flameGlow!: Sprite;
  spark!: Sprite;
  ember!: Sprite;
  dust!: Sprite;
  smoke!: Sprite;
  chalkDot!: Sprite;
  coin!: Sprite;
  orb!: Sprite;
  pinkOrb!: Sprite;
  slash!: Sprite;
  ring!: Sprite;
  ringGold!: Sprite;
  rays!: Sprite;
  heart!: Sprite;
  hourglass!: Sprite;
  skull!: Sprite;
  skullWhite!: Sprite;
  bottle!: Sprite;
  shaft!: Sprite;
  shardGlow!: Sprite;
  redShock!: Sprite;
  // 背景缓存（整栏）
  wall!: HTMLCanvasElement;
  backdrop!: HTMLCanvasElement;
  vignette!: HTMLCanvasElement;
  redVignette!: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  private fxBaked = false;
  private fxDpr = 0;

  constructor() {
    this.grain = noiseTile(96, 0x5eed, 1);
  }

  /** 尺寸变化时重烘焙格子贴图 */
  bakeTiles(cell: number, dpr: number): void {
    if (cell === this.cell && dpr === this.dpr && this.hidden.length) return;
    this.cell = cell;
    this.dpr = dpr;
    this.px = Math.round(cell * dpr);
    const px = this.px;
    const u = px / 40;
    const rng = new Rng(9001);
    this.hidden = [];
    for (let v = 0; v < 4; v++) this.hidden.push(this.bakeHidden(px, u, rng, v));
    this.floor = [];
    for (let v = 0; v < 3; v++) this.floor.push(this.bakeFloor(px, u, rng));
    this.decal = [];
    for (let v = 0; v < 3; v++) this.decal.push(this.bakeDecal(px, u, rng));
    this.stairs = this.bakeStairs(px, u);
    this.candleBase = this.bakeCandle(u);
    this.torch = this.bakeTorch(u);
    this.tileShadow = sprite(px * 1.3, px * 1.3, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, w * 0.2, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.8)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.mask = sprite(px, px, (c) => {
      roundRect(c, u, u, px - 2 * u, px - 2 * u, 4 * u);
      c.fillStyle = '#000';
      c.fill();
    });
    this.goldEdge = sprite(px, px, (c) => {
      roundRect(c, 1.5 * u, 1.5 * u, px - 3 * u, px - 3 * u, 4 * u);
      c.strokeStyle = '#FFD27A';
      c.lineWidth = 1.6 * u;
      c.shadowColor = 'rgba(255,190,90,0.9)';
      c.shadowBlur = 4 * u;
      c.stroke();
    });
    this.lairBase = this.bakeLair(px * 3, u, rng);
    this.chest = [0, 1, 2].map((tier) => [0, 1, 2].map((f) => this.bakeChest(px, u, tier, f)));
    this.potion = [];
    for (let f = 0; f < 8; f++) this.potion.push(this.bakePotion(px, u, Math.sin((f / 8) * Math.PI * 2) * 0.22));
    this.bottle = this.potion[0];
    if (!this.fxBaked || this.fxDpr !== dpr) this.bakeFx(dpr);
  }

  // ------------------------------------------------------------------ tiles
  private bakeHidden(px: number, u: number, rng: Rng, v: number): Sprite {
    return sprite(px, px, (c) => {
      const i = u;
      const s = px - 2 * i;
      roundRect(c, i, i, s, s, 4 * u);
      const g = c.createLinearGradient(0, 0, px, px);
      const lift = (v - 1.5) * 0.03;
      g.addColorStop(0, shade('#3E475A', lift));
      g.addColorStop(1, shade('#2B3243', lift));
      c.fillStyle = g;
      c.fill();
      c.save();
      roundRect(c, i, i, s, s, 4 * u);
      c.clip();
      applyGrain(c, this.grain, 0, 0, px, px, 0.7);
      // 斑驳
      for (let k = 0; k < 5; k++) {
        c.fillStyle = rgba(rng.chance(0.5) ? '#5A667E' : '#262D3C', 0.18);
        c.beginPath();
        c.ellipse(rng.range(4, 36) * u, rng.range(4, 36) * u, rng.range(2, 6) * u, rng.range(1.5, 4) * u, rng.range(0, 3), 0, Math.PI * 2);
        c.fill();
      }
      // 裂纹
      const cracks = 1 + rng.int(2);
      for (let k = 0; k < cracks; k++) {
        let x = rng.range(6, 34) * u;
        let y = rng.range(6, 34) * u;
        let a = rng.range(0, Math.PI * 2);
        c.beginPath();
        c.moveTo(x, y);
        const steps = 4 + rng.int(4);
        for (let t = 0; t < steps; t++) {
          a += rng.range(-0.9, 0.9);
          x += Math.cos(a) * 3 * u;
          y += Math.sin(a) * 3 * u;
          c.lineTo(x, y);
        }
        c.strokeStyle = rgba(PAL.slateLo, 0.85);
        c.lineWidth = 0.9 * u;
        c.stroke();
        c.translate(0.7 * u, 0.7 * u);
        c.strokeStyle = rgba('#6E7C96', 0.18);
        c.stroke();
        c.setTransform(1, 0, 0, 1, 0, 0);
      }
      // 苔痕
      if (rng.chance(0.3) || v === 2) {
        const cx = rng.chance(0.5) ? 4 * u : 36 * u;
        const cy = rng.chance(0.5) ? 4 * u : 36 * u;
        const mg = c.createRadialGradient(cx, cy, 0, cx, cy, 11 * u);
        mg.addColorStop(0, 'rgba(60,90,58,0.38)');
        mg.addColorStop(1, 'rgba(60,90,58,0)');
        c.fillStyle = mg;
        c.fillRect(0, 0, px, px);
      }
      c.restore();
      // 倒角：左上高光、右下阴影
      c.lineWidth = 2 * u;
      c.strokeStyle = rgba('#6E7C96', 0.34);
      c.beginPath();
      c.moveTo(i + 2 * u, px - i - 4 * u);
      c.lineTo(i + 1 * u, i + 4 * u);
      c.quadraticCurveTo(i + 1 * u, i + 1 * u, i + 4 * u, i + 1 * u);
      c.lineTo(px - i - 3 * u, i + 1 * u);
      c.stroke();
      c.strokeStyle = rgba(PAL.slateLo, 0.95);
      c.beginPath();
      c.moveTo(px - i - 1 * u, i + 4 * u);
      c.lineTo(px - i - 1 * u, px - i - 4 * u);
      c.quadraticCurveTo(px - i - 1 * u, px - i - 1 * u, px - i - 4 * u, px - i - 1 * u);
      c.lineTo(i + 3 * u, px - i - 1 * u);
      c.stroke();
    });
  }

  private bakeFloor(px: number, u: number, rng: Rng): Sprite {
    return sprite(px, px, (c) => {
      const i = u;
      const s = px - 2 * i;
      roundRect(c, i, i, s, s, 3 * u);
      const g = c.createLinearGradient(0, 0, px, px);
      g.addColorStop(0, '#46372B');
      g.addColorStop(1, '#55432F');
      c.fillStyle = g;
      c.fill();
      c.save();
      roundRect(c, i, i, s, s, 3 * u);
      c.clip();
      for (let k = 0; k < 26; k++) {
        c.fillStyle = rgba(rng.chance(0.5) ? '#6A5240' : '#2E231A', rng.range(0.15, 0.35));
        c.beginPath();
        c.arc(rng.range(2, 38) * u, rng.range(2, 38) * u, rng.range(0.4, 1.6) * u, 0, Math.PI * 2);
        c.fill();
      }
      // 偶尔的石子
      if (rng.chance(0.6)) {
        const x = rng.range(8, 32) * u;
        const y = rng.range(8, 32) * u;
        c.fillStyle = '#2A2019';
        c.beginPath();
        c.ellipse(x + 0.6 * u, y + 0.8 * u, 2.2 * u, 1.5 * u, 0.3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#7A6450';
        c.beginPath();
        c.ellipse(x, y, 2 * u, 1.3 * u, 0.3, 0, Math.PI * 2);
        c.fill();
      }
      // 地砖接缝（斜向浅刻线）
      c.strokeStyle = rgba(PAL.grout, 0.4);
      c.lineWidth = 0.8 * u;
      c.beginPath();
      const sy = rng.range(14, 26) * u;
      c.moveTo(0, sy);
      c.lineTo(px, sy + rng.range(-3, 3) * u);
      c.stroke();
      applyGrain(c, this.grain, 0, 0, px, px, 0.75);
      // 内阴影（凹槽感）
      const ig = c.createLinearGradient(0, 0, 0, 5 * u);
      ig.addColorStop(0, 'rgba(14,9,6,0.75)');
      ig.addColorStop(1, 'rgba(14,9,6,0)');
      c.fillStyle = ig;
      c.fillRect(0, 0, px, 5 * u);
      const ig2 = c.createLinearGradient(0, 0, 5 * u, 0);
      ig2.addColorStop(0, 'rgba(14,9,6,0.65)');
      ig2.addColorStop(1, 'rgba(14,9,6,0)');
      c.fillStyle = ig2;
      c.fillRect(0, 0, 5 * u, px);
      c.restore();
      c.strokeStyle = rgba('#8A6C52', 0.25);
      c.lineWidth = 1 * u;
      c.beginPath();
      c.moveTo(px - i - 0.5 * u, i + 3 * u);
      c.lineTo(px - i - 0.5 * u, px - i - 0.5 * u);
      c.lineTo(i + 3 * u, px - i - 0.5 * u);
      c.stroke();
    });
  }

  private bakeDecal(px: number, u: number, rng: Rng): Sprite {
    return sprite(px, px, (c) => {
      const m = px / 2;
      const g = c.createRadialGradient(m, m, 0, m, m, m * 0.95);
      g.addColorStop(0, 'rgba(8,5,4,0.7)');
      g.addColorStop(0.55, 'rgba(12,8,5,0.4)');
      g.addColorStop(1, 'rgba(12,8,5,0)');
      c.fillStyle = g;
      c.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const r = m * (0.75 + rng.range(-0.12, 0.18));
        if (k === 0) c.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
        else c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      c.fill();
      const bones = 2 + rng.int(2);
      for (let k = 0; k < bones; k++) {
        const x = m + rng.range(-9, 9) * u;
        const y = m + rng.range(-7, 9) * u;
        const a = rng.range(0, Math.PI);
        const len = rng.range(5, 9) * u;
        c.save();
        c.translate(x, y);
        c.rotate(a);
        c.fillStyle = rgba('#CDBFA8', 0.55);
        c.fillRect(-len / 2, -0.8 * u, len, 1.6 * u);
        for (const sx of [-len / 2, len / 2]) {
          c.beginPath();
          c.arc(sx, -0.9 * u, 1.2 * u, 0, Math.PI * 2);
          c.arc(sx, 0.9 * u, 1.2 * u, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
      // 小骷髅（1/3 概率）
      if (rng.chance(0.4)) {
        const x = m + rng.range(-6, 6) * u;
        const y = m + rng.range(-4, 4) * u;
        c.fillStyle = rgba('#CDBFA8', 0.5);
        c.beginPath();
        c.arc(x, y, 3.2 * u, 0, Math.PI * 2);
        c.fill();
        c.fillRect(x - 1.8 * u, y + 1.5 * u, 3.6 * u, 2.4 * u);
        c.fillStyle = 'rgba(10,6,4,0.8)';
        c.beginPath();
        c.arc(x - 1.2 * u, y, 0.9 * u, 0, Math.PI * 2);
        c.arc(x + 1.2 * u, y, 0.9 * u, 0, Math.PI * 2);
        c.fill();
      }
    });
  }

  private bakeStairs(px: number, u: number): Sprite {
    return sprite(px, px, (c) => {
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const w = (32 - k * 4.2) * u;
        const h = 6.2 * u;
        const x = (px - w) / 2;
        const y = (5 + k * 6.4) * u;
        const shadeV = 1 - t * 0.85;
        c.fillStyle = rgba('#120C08', 0.9);
        c.fillRect(x - 0.5 * u, y - 0.5 * u, w + u, h + u);
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, mixRgb('#7A6450', '#140E0A', 1 - shadeV));
        g.addColorStop(0.35, mixRgb('#5A4636', '#0E0906', 1 - shadeV));
        g.addColorStop(1, mixRgb('#2A1E16', '#060403', 1 - shadeV));
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        c.fillStyle = rgba('#B89A78', 0.35 * shadeV);
        c.fillRect(x, y, w, 0.9 * u);
      }
      const dg = c.createLinearGradient(0, 26 * u, 0, 38 * u);
      dg.addColorStop(0, 'rgba(4,3,2,0)');
      dg.addColorStop(1, 'rgba(4,3,2,0.85)');
      c.fillStyle = dg;
      c.fillRect(0, 26 * u, px, 13 * u);
    });
  }

  /** 小烛台（8×12 设计像素，画在格子左下角） */
  private bakeCandle(u: number): Sprite {
    return sprite(14 * u, 18 * u, (c, w, h) => {
      const cx = w / 2;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.beginPath();
      c.ellipse(cx, h - 2 * u, 6 * u, 1.8 * u, 0, 0, Math.PI * 2);
      c.fill();
      // 托盘
      const g = c.createLinearGradient(0, h - 5 * u, 0, h - 2 * u);
      g.addColorStop(0, '#B08448');
      g.addColorStop(1, '#4A3018');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, h - 3.5 * u, 5.5 * u, 1.8 * u, 0, 0, Math.PI * 2);
      c.fill();
      // 蜡烛
      const cg = c.createLinearGradient(cx - 2.2 * u, 0, cx + 2.2 * u, 0);
      cg.addColorStop(0, '#F4E8CC');
      cg.addColorStop(1, '#A8987A');
      c.fillStyle = cg;
      c.fillRect(cx - 2.2 * u, h - 13 * u, 4.4 * u, 9.5 * u);
      // 蜡泪
      c.fillStyle = '#FFF4DC';
      c.beginPath();
      c.ellipse(cx, h - 13 * u, 2.2 * u, 0.9 * u, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(cx - 2.2 * u, h - 13 * u, 1 * u, 4 * u);
      // 烛芯
      c.strokeStyle = '#1A120C';
      c.lineWidth = 0.7 * u;
      c.beginPath();
      c.moveTo(cx, h - 13 * u);
      c.lineTo(cx + 0.3 * u, h - 15 * u);
      c.stroke();
    });
  }

  /** 入口壁挂火把（铁托架 + 木柄 + 火盆） */
  private bakeTorch(u: number): Sprite {
    return sprite(14 * u, 22 * u, (c, w) => {
      const cx = w / 2;
      c.strokeStyle = '#2A2C33';
      c.lineWidth = 1.6 * u;
      c.beginPath();
      c.moveTo(cx, 20 * u);
      c.lineTo(cx, 12 * u);
      c.moveTo(cx - 4 * u, 21 * u);
      c.lineTo(cx + 4 * u, 21 * u);
      c.stroke();
      const g = c.createLinearGradient(cx - 2 * u, 0, cx + 2 * u, 0);
      g.addColorStop(0, '#6B4A2C');
      g.addColorStop(1, '#2E1E12');
      c.fillStyle = g;
      c.fillRect(cx - 1.6 * u, 8 * u, 3.2 * u, 9 * u);
      const bg = c.createLinearGradient(0, 4 * u, 0, 9 * u);
      bg.addColorStop(0, '#5A5E68');
      bg.addColorStop(1, '#1E2026');
      c.fillStyle = bg;
      c.beginPath();
      c.moveTo(cx - 5 * u, 4.5 * u);
      c.lineTo(cx + 5 * u, 4.5 * u);
      c.lineTo(cx + 2.6 * u, 9.5 * u);
      c.lineTo(cx - 2.6 * u, 9.5 * u);
      c.closePath();
      c.fill();
      c.fillStyle = '#FF7A1A';
      c.fillRect(cx - 4 * u, 4 * u, 8 * u, 1.2 * u);
    });
  }

  private bakeLair(size: number, u: number, rng: Rng): Sprite {
    return sprite(size, size, (c) => {
      const m = size / 2;
      roundRect(c, u, u, size - 2 * u, size - 2 * u, 6 * u);
      const g = c.createRadialGradient(m, m * 1.05, 0, m, m, m * 1.1);
      g.addColorStop(0, '#2A1A14');
      g.addColorStop(0.6, '#160F0C');
      g.addColorStop(1, '#0B0807');
      c.fillStyle = g;
      c.fill();
      c.save();
      roundRect(c, u, u, size - 2 * u, size - 2 * u, 6 * u);
      c.clip();
      // 焦黑石板缝
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 1.2 * u;
      for (let k = 0; k < 9; k++) {
        c.beginPath();
        let x = rng.range(0, size);
        let y = rng.range(0, size);
        c.moveTo(x, y);
        for (let t = 0; t < 6; t++) {
          x += rng.range(-14, 14) * u;
          y += rng.range(-14, 14) * u;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      // 宝藏：零星金币
      for (let k = 0; k < 34; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0.55, 0.95) * m;
        const x = m + Math.cos(a) * r;
        const y = m + Math.sin(a) * r * 0.9 + 6 * u;
        c.fillStyle = rgba(rng.chance(0.5) ? '#E8B04B' : '#A8782C', rng.range(0.45, 0.8));
        c.beginPath();
        c.ellipse(x, y, 2.2 * u, 1.3 * u, rng.range(0, 3), 0, Math.PI * 2);
        c.fill();
        if (rng.chance(0.3)) {
          c.fillStyle = 'rgba(255,233,170,0.6)';
          c.fillRect(x - 0.6 * u, y - 0.8 * u, 1.2 * u, 0.6 * u);
        }
      }
      applyGrain(c, this.grain, 0, 0, size, size, 0.6);
      c.restore();
      c.strokeStyle = 'rgba(110,40,20,0.35)';
      c.lineWidth = 1.5 * u;
      roundRect(c, 1.5 * u, 1.5 * u, size - 3 * u, size - 3 * u, 6 * u);
      c.stroke();
    });
  }

  /** tier 0 木 / 1 铁 / 2 金；frame 0 关 1 半开 2 全开 */
  private bakeChest(px: number, u: number, tier: number, frame: number): Sprite {
    return sprite(px, px, (c) => {
      const body = tier === 1 ? '#4A505C' : '#6B3F22';
      const bodyLo = tier === 1 ? '#2A2E36' : '#3A2010';
      const band = tier === 0 ? '#3A3A40' : tier === 1 ? '#9AA3B3' : '#E8B04B';
      const bx = 7 * u;
      const bw = 26 * u;
      const by = 19 * u;
      const bh = 14 * u;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.beginPath();
      c.ellipse(20 * u, 34 * u, 15 * u, 3 * u, 0, 0, Math.PI * 2);
      c.fill();
      // 打开后内部金光
      if (frame > 0) {
        const gg = c.createRadialGradient(20 * u, by, 0, 20 * u, by, 14 * u);
        gg.addColorStop(0, rgba('#FFE9A8', frame === 2 ? 0.95 : 0.6));
        gg.addColorStop(1, 'rgba(255,200,90,0)');
        c.fillStyle = gg;
        c.fillRect(0, 0, px, px);
      }
      // 箱体
      const g = c.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, body);
      g.addColorStop(1, bodyLo);
      c.fillStyle = g;
      roundRect(c, bx, by, bw, bh, 2 * u);
      c.fill();
      // 木纹
      if (tier !== 1) {
        c.strokeStyle = 'rgba(20,10,4,0.45)';
        c.lineWidth = 0.6 * u;
        for (let k = 1; k < 3; k++) {
          c.beginPath();
          c.moveTo(bx, by + (bh * k) / 3);
          c.lineTo(bx + bw, by + (bh * k) / 3);
          c.stroke();
        }
      }
      // 箍
      c.fillStyle = band;
      c.fillRect(bx + 3.5 * u, by, 2.6 * u, bh);
      c.fillRect(bx + bw - 6.1 * u, by, 2.6 * u, bh);
      c.fillRect(bx, by, bw, 1.4 * u);
      // 盖
      const lidH = 8 * u;
      c.save();
      c.translate(bx, by);
      const ang = frame === 0 ? 0 : frame === 1 ? -0.55 : -1.25;
      c.rotate(ang);
      const lg = c.createLinearGradient(0, -lidH, 0, 0);
      lg.addColorStop(0, shade(body, 0.12));
      lg.addColorStop(1, body);
      c.fillStyle = lg;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -lidH * 0.55);
      c.quadraticCurveTo(bw / 2, -lidH * 1.35, bw, -lidH * 0.55);
      c.lineTo(bw, 0);
      c.closePath();
      c.fill();
      c.fillStyle = band;
      c.fillRect(3.5 * u, -lidH * 0.95, 2.6 * u, lidH * 0.95);
      c.fillRect(bw - 6.1 * u, -lidH * 0.95, 2.6 * u, lidH * 0.95);
      c.fillRect(0, -1.2 * u, bw, 1.2 * u);
      c.restore();
      // 锁扣
      if (frame === 0) {
        c.fillStyle = tier === 2 ? '#FFE29A' : band === '#3A3A40' ? '#B08448' : band;
        roundRect(c, 17.5 * u, by - 1.5 * u, 5 * u, 6 * u, 1 * u);
        c.fill();
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(19.6 * u, by + 1 * u, 0.8 * u, 2 * u);
      }
      if (tier === 1) {
        c.fillStyle = '#C8D0DC';
        for (const rx of [bx + 4.8 * u, bx + bw - 4.8 * u])
          for (const ry of [by + 4 * u, by + bh - 3 * u]) {
            c.beginPath();
            c.arc(rx, ry, 0.8 * u, 0, Math.PI * 2);
            c.fill();
          }
      }
      if (tier === 2) {
        c.fillStyle = '#E0315A';
        c.beginPath();
        c.arc(20 * u, by + bh * 0.6, 1.8 * u, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,220,230,0.8)';
        c.fillRect(19.2 * u, by + bh * 0.6 - 1.2 * u, 0.8 * u, 0.8 * u);
      }
      // 高光边
      c.strokeStyle = 'rgba(255,220,170,0.25)';
      c.lineWidth = 0.8 * u;
      c.beginPath();
      c.moveTo(bx + 0.5 * u, by + bh - 1 * u);
      c.lineTo(bx + 0.5 * u, by + 1 * u);
      c.stroke();
    });
  }

  private bakePotion(px: number, u: number, tilt: number): Sprite {
    return sprite(px, px, (c) => {
      const cx = 20 * u;
      const cy = 25 * u;
      const r = 9.5 * u;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.beginPath();
      c.ellipse(cx, 35.5 * u, 10 * u, 2.4 * u, 0, 0, Math.PI * 2);
      c.fill();
      const flask = new Path2D();
      flask.arc(cx, cy, r, -Math.PI / 2 + 0.42, -Math.PI / 2 - 0.42 + Math.PI * 2);
      flask.lineTo(cx - 3 * u, 10 * u);
      flask.lineTo(cx + 3 * u, 10 * u);
      flask.closePath();
      // 玻璃底
      c.fillStyle = 'rgba(40,20,36,0.85)';
      c.fill(flask);
      // 液体
      c.save();
      c.clip(flask);
      c.translate(cx, cy);
      c.rotate(tilt);
      const lg = c.createLinearGradient(0, -2 * u, 0, r);
      lg.addColorStop(0, '#FF5A7E');
      lg.addColorStop(1, '#9A1838');
      c.fillStyle = lg;
      c.fillRect(-r * 2, -1.5 * u, r * 4, r * 3);
      c.fillStyle = rgba(PAL.potionHi, 0.85);
      c.fillRect(-r * 2, -1.5 * u, r * 4, 1.1 * u);
      c.restore();
      // 气泡
      c.fillStyle = 'rgba(255,200,215,0.6)';
      c.beginPath();
      c.arc(cx + 3 * u, cy + 4 * u, 1 * u, 0, Math.PI * 2);
      c.arc(cx - 2 * u, cy + 6 * u, 0.7 * u, 0, Math.PI * 2);
      c.fill();
      // 玻璃高光
      c.strokeStyle = 'rgba(255,230,240,0.55)';
      c.lineWidth = 1.2 * u;
      c.beginPath();
      c.arc(cx, cy, r - 2.2 * u, Math.PI * 1.05, Math.PI * 1.45);
      c.stroke();
      c.strokeStyle = 'rgba(255,190,210,0.35)';
      c.lineWidth = 0.8 * u;
      c.stroke(flask);
      // 瓶塞
      c.fillStyle = '#8A6040';
      roundRect(c, cx - 3.4 * u, 6.5 * u, 6.8 * u, 4.2 * u, 1 * u);
      c.fill();
      c.fillStyle = 'rgba(255,220,180,0.3)';
      c.fillRect(cx - 3 * u, 7 * u, 6 * u, 0.8 * u);
    });
  }

  // ------------------------------------------------------------------ fx sprites
  private bakeFx(dpr: number): void {
    this.fxBaked = true;
    this.fxDpr = dpr;
    const d = dpr;
    this.flame = sprite(16 * d, 30 * d, (c, w, h) => {
      const path = (sc: number) => {
        const p = new Path2D();
        const cx = w / 2;
        const b = h * 0.96;
        p.moveTo(cx, h * (1 - 0.96 * sc));
        p.bezierCurveTo(cx + w * 0.42 * sc, h * 0.45, cx + w * 0.48 * sc, b - h * 0.12 * sc, cx, b);
        p.bezierCurveTo(cx - w * 0.48 * sc, b - h * 0.12 * sc, cx - w * 0.42 * sc, h * 0.45, cx, h * (1 - 0.96 * sc));
        return p;
      };
      c.shadowColor = 'rgba(255,122,26,0.9)';
      c.shadowBlur = 4 * d;
      c.fillStyle = '#FF7A1A';
      c.fill(path(1));
      c.shadowBlur = 0;
      c.fillStyle = '#FFB54A';
      c.fill(path(0.72));
      c.fillStyle = '#FFE9C2';
      c.fill(path(0.42));
    });
    this.flameGlow = radialBlob(64 * d, '#FFB54A', 0, 1.6);
    this.spark = sprite(10 * d, 10 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,250,230,1)');
      g.addColorStop(0.3, 'rgba(255,210,122,0.9)');
      g.addColorStop(1, 'rgba(255,150,40,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.ember = sprite(8 * d, 8 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,220,150,1)');
      g.addColorStop(0.35, 'rgba(255,122,26,0.9)');
      g.addColorStop(1, 'rgba(255,60,20,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.dust = radialBlob(8 * d, '#8C7A66', 0.25, 1.2);
    this.smoke = radialBlob(32 * d, '#14121A', 0.1, 1.3);
    this.chalkDot = radialBlob(4 * d, '#E8EEF4', 0.4, 1);
    this.coin = sprite(12 * d, 12 * d, (c, w) => {
      const r = w / 2 - d * 0.5;
      const g = c.createLinearGradient(0, 0, w, w);
      g.addColorStop(0, '#FFE9A0');
      g.addColorStop(0.5, '#E8B04B');
      g.addColorStop(1, '#8A5A1A');
      c.fillStyle = g;
      c.beginPath();
      c.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(90,50,10,0.8)';
      c.lineWidth = d;
      c.beginPath();
      c.arc(w / 2, w / 2, r * 0.62, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(255,255,230,0.9)';
      c.fillRect(w * 0.3, w * 0.25, w * 0.18, w * 0.1);
    });
    this.orb = sprite(18 * d, 18 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.25, 'rgba(255,226,140,1)');
      g.addColorStop(0.55, 'rgba(255,190,70,0.45)');
      g.addColorStop(1, 'rgba(255,160,40,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.pinkOrb = sprite(18 * d, 18 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,240,245,1)');
      g.addColorStop(0.3, 'rgba(255,140,170,0.9)');
      g.addColorStop(1, 'rgba(224,49,90,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    // 新月刀光：宽 96、高 40（CSS）
    this.slash = sprite(96 * d, 40 * d, (c, w, h) => {
      const p = new Path2D();
      p.moveTo(0, h * 0.62);
      p.quadraticCurveTo(w * 0.5, -h * 0.25, w, h * 0.62);
      p.quadraticCurveTo(w * 0.5, h * 0.3, 0, h * 0.62);
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,210,122,0)');
      g.addColorStop(0.35, 'rgba(255,233,190,0.9)');
      g.addColorStop(0.6, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,233,190,0)');
      c.shadowColor = 'rgba(255,190,90,0.9)';
      c.shadowBlur = 6 * d;
      c.fillStyle = g;
      c.fill(p);
    });
    this.ring = sprite(128 * d, 128 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, w * 0.36, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.ringGold = sprite(128 * d, 128 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,210,122,0)');
      g.addColorStop(0.6, 'rgba(255,210,122,0.85)');
      g.addColorStop(1, 'rgba(255,180,74,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.redShock = sprite(96 * d, 96 * d, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, w * 0.1, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(200,40,60,0)');
      g.addColorStop(0.6, 'rgba(200,40,60,0.55)');
      g.addColorStop(1, 'rgba(110,15,30,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.rays = sprite(200 * d, 200 * d, (c, w) => {
      const m = w / 2;
      const n = 14;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const da = 0.07 + (k % 2) * 0.04;
        const g = c.createRadialGradient(m, m, 0, m, m, m);
        g.addColorStop(0, 'rgba(255,240,200,0.9)');
        g.addColorStop(0.4, 'rgba(255,210,122,0.45)');
        g.addColorStop(1, 'rgba(255,180,74,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(m, m);
        c.arc(m, m, m * (k % 2 ? 0.8 : 1), a - da, a + da);
        c.closePath();
        c.fill();
      }
      const g = c.createRadialGradient(m, m, 0, m, m, m * 0.35);
      g.addColorStop(0, 'rgba(255,250,230,0.9)');
      g.addColorStop(1, 'rgba(255,210,122,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    this.heart = sprite(24 * d, 24 * d, (c, w) => {
      const s = w / 24;
      const p = new Path2D();
      p.moveTo(12 * s, 21 * s);
      p.bezierCurveTo(2 * s, 14 * s, 1 * s, 8 * s, 4 * s, 5 * s);
      p.bezierCurveTo(7 * s, 2 * s, 11 * s, 3 * s, 12 * s, 7 * s);
      p.bezierCurveTo(13 * s, 3 * s, 17 * s, 2 * s, 20 * s, 5 * s);
      p.bezierCurveTo(23 * s, 8 * s, 22 * s, 14 * s, 12 * s, 21 * s);
      c.fillStyle = '#1A0608';
      c.translate(0, 1.2 * s);
      c.fill(p);
      c.setTransform(1, 0, 0, 1, 0, 0);
      const g = c.createLinearGradient(0, 3 * s, 0, 21 * s);
      g.addColorStop(0, '#FF5A6E');
      g.addColorStop(1, '#8E1426');
      c.fillStyle = g;
      c.fill(p);
      c.strokeStyle = 'rgba(255,210,122,0.85)';
      c.lineWidth = 1.2 * s;
      c.stroke(p);
      c.fillStyle = 'rgba(255,230,235,0.8)';
      c.beginPath();
      c.ellipse(7.5 * s, 7.5 * s, 2 * s, 1.3 * s, -0.6, 0, Math.PI * 2);
      c.fill();
    });
    this.hourglass = sprite(14 * d, 16 * d, (c, w, h) => {
      c.strokeStyle = PAL.ash;
      c.lineWidth = 1.3 * d;
      c.beginPath();
      c.moveTo(2 * d, 1.5 * d);
      c.lineTo(w - 2 * d, 1.5 * d);
      c.moveTo(2 * d, h - 1.5 * d);
      c.lineTo(w - 2 * d, h - 1.5 * d);
      c.moveTo(3.5 * d, 2 * d);
      c.lineTo(w - 3.5 * d, h - 2 * d);
      c.moveTo(w - 3.5 * d, 2 * d);
      c.lineTo(3.5 * d, h - 2 * d);
      c.stroke();
      c.fillStyle = rgba(PAL.gold, 0.8);
      c.beginPath();
      c.moveTo(w / 2 - 2.5 * d, h - 2.5 * d);
      c.lineTo(w / 2 + 2.5 * d, h - 2.5 * d);
      c.lineTo(w / 2, h - 6 * d);
      c.fill();
    });
    const skull = (col: string) =>
      sprite(12 * d, 12 * d, (c, w) => {
        const s = w / 12;
        c.fillStyle = col;
        c.beginPath();
        c.arc(6 * s, 5 * s, 4.2 * s, 0, Math.PI * 2);
        c.fill();
        c.fillRect(3.6 * s, 7.5 * s, 4.8 * s, 3 * s);
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.arc(4.4 * s, 5.2 * s, 1.3 * s, 0, Math.PI * 2);
        c.arc(7.6 * s, 5.2 * s, 1.3 * s, 0, Math.PI * 2);
        c.fill();
        c.fillRect(5.6 * s, 8.6 * s, 0.8 * s, 2 * s);
      });
    this.skull = skull(PAL.lethal);
    this.skullWhite = skull(PAL.chalk);
    this.shardGlow = radialBlob(24 * d, '#FFD27A', 0.1, 1.4);
    // 体积光柱：宽 140、长 1000（CSS），沿长轴是线性渐变，横向柔边
    this.shaft = sprite(70, 400, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,181,74,0)');
      g.addColorStop(0.5, 'rgba(255,190,100,1)');
      g.addColorStop(1, 'rgba(255,181,74,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'destination-in';
      const g2 = c.createLinearGradient(0, 0, 0, h);
      g2.addColorStop(0, 'rgba(0,0,0,1)');
      g2.addColorStop(0.7, 'rgba(0,0,0,0.4)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g2;
      c.fillRect(0, 0, w, h);
    });
  }

  // ------------------------------------------------------------------ backdrops
  /** 整栏石墙（标题页也用） */
  bakeWall(L: Layout): void {
    const d = L.dpr;
    const [c, ctx] = makeCanvas(L.colW * d, L.vh * d);
    drawWall(ctx, c.width, c.height, d, 7, this.grain, 1);
    this.wall = c;
    // 暗角（1/4 分辨率）
    const vw = Math.max(8, Math.ceil(L.colW / 4));
    const vh = Math.max(8, Math.ceil(L.vh / 4));
    const [v, vc] = makeCanvas(vw, vh);
    const r = Math.hypot(vw, vh) / 2;
    const g = vc.createRadialGradient(vw / 2, vh * 0.48, r * 0.42, vw / 2, vh * 0.5, r);
    g.addColorStop(0, 'rgba(7,8,13,0)');
    g.addColorStop(0.7, 'rgba(7,8,13,0.45)');
    g.addColorStop(1, 'rgba(7,8,13,0.78)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, vw, vh);
    this.vignette = v;
    const [rv, rc] = makeCanvas(vw, vh);
    const g2 = rc.createRadialGradient(vw / 2, vh / 2, r * 0.5, vw / 2, vh / 2, r);
    g2.addColorStop(0, 'rgba(200,40,60,0)');
    g2.addColorStop(1, 'rgba(200,24,40,1)');
    rc.fillStyle = g2;
    rc.fillRect(0, 0, vw, vh);
    this.redVignette = rv;
  }

  /** 游戏中的背景：墙 + 拱门 + HUD 底板 + 棋盘外框 + 图鉴槽 */
  bakeBackdrop(L: Layout): void {
    const d = L.dpr;
    const [c, ctx] = makeCanvas(L.colW * d, L.vh * d);
    ctx.drawImage(this.wall, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const s = L.s;
    // 顶部拱门装饰
    const archBottom = L.hudTop - 2;
    if (archBottom > 18 && !L.landscape) {
      const ag = ctx.createLinearGradient(0, 0, 0, archBottom);
      ag.addColorStop(0, 'rgba(5,6,10,0.85)');
      ag.addColorStop(1, 'rgba(5,6,10,0.25)');
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L.colW, 0);
      ctx.lineTo(L.colW, archBottom);
      ctx.quadraticCurveTo(L.colW / 2, archBottom - Math.min(46, archBottom * 0.9), 0, archBottom);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(PAL.slate, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, archBottom);
      ctx.quadraticCurveTo(L.colW / 2, archBottom - Math.min(46, archBottom * 0.9), L.colW, archBottom);
      ctx.stroke();
      // 拱心石
      const kx = L.colW / 2;
      const ky = archBottom - Math.min(46, archBottom * 0.9) / 2 - 4;
      ctx.fillStyle = '#1C212D';
      ctx.beginPath();
      ctx.moveTo(kx - 13, ky - 14);
      ctx.lineTo(kx + 13, ky - 14);
      ctx.lineTo(kx + 9, ky + 10);
      ctx.lineTo(kx - 9, ky + 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(PAL.amber, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(kx, ky - 2, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // HUD 底板
    const hb = L.hudPlate;
    roundRect(ctx, hb.x, hb.y, hb.w, hb.h, 10 * s);
    ctx.fillStyle = 'rgba(9,10,15,0.62)';
    ctx.fill();
    ctx.strokeStyle = rgba('#2A3242', 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    // 棋盘外框
    const o = L.boardOuter;
    const f = L.frame;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, o.x - 3, o.y - 1, o.w + 6, o.h + 8, 8);
    ctx.fill();
    const fg = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    fg.addColorStop(0, '#4A556B');
    fg.addColorStop(0.5, '#2C3343');
    fg.addColorStop(1, '#1A1F2B');
    ctx.fillStyle = fg;
    roundRect(ctx, o.x, o.y, o.w, o.h, 5);
    ctx.fill();
    // 刻花：沿框的小刻痕
    ctx.strokeStyle = 'rgba(10,12,18,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = o.x + 14; x < o.x + o.w - 10; x += 12) {
      ctx.moveTo(x, o.y + 1.5);
      ctx.lineTo(x + 3, o.y + f - 1.5);
      ctx.moveTo(x, o.y + o.h - f + 1.5);
      ctx.lineTo(x + 3, o.y + o.h - 1.5);
    }
    for (let y = o.y + 14; y < o.y + o.h - 10; y += 12) {
      ctx.moveTo(o.x + 1.5, y);
      ctx.lineTo(o.x + f - 1.5, y + 3);
      ctx.moveTo(o.x + o.w - f + 1.5, y);
      ctx.lineTo(o.x + o.w - 1.5, y + 3);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba('#8090AA', 0.45);
    ctx.beginPath();
    ctx.moveTo(o.x + 0.5, o.y + o.h - 4);
    ctx.lineTo(o.x + 0.5, o.y + 0.5);
    ctx.lineTo(o.x + o.w - 4, o.y + 0.5);
    ctx.stroke();
    applyGrain(ctx, this.grain, o.x, o.y, o.w, o.h, 0.5);
    // 坑底
    const b = L.board;
    ctx.fillStyle = '#06070B';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    // 四角铜钉
    for (const [x, y] of [
      [o.x + f / 2, o.y + f / 2],
      [o.x + o.w - f / 2, o.y + f / 2],
      [o.x + f / 2, o.y + o.h - f / 2],
      [o.x + o.w - f / 2, o.y + o.h - f / 2],
    ]) {
      const r = Math.max(4, f * 0.95);
      const sg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      sg.addColorStop(0, '#F0C080');
      sg.addColorStop(0.45, '#B07A3A');
      sg.addColorStop(1, '#3A240E');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 图鉴槽
    const R = L.roster;
    const slotW = R.w / 10;
    for (let k = 0; k < 10; k++) {
      const x = R.x + k * slotW + 1.5;
      const w = slotW - 3;
      roundRect(ctx, x, R.y, w, R.h, 5 * s);
      ctx.fillStyle = k === 9 ? '#1A0E10' : '#0F1117';
      ctx.fill();
      ctx.strokeStyle = k === 9 ? '#4A2228' : '#2A3242';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 2, R.y + 1, w - 4, 3 * s);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.backdrop = c;
  }
}

/** 石砖墙（整块烘焙） */
export function drawWall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: number,
  seed: number,
  grain: HTMLCanvasElement,
  brightness: number,
): void {
  const rng = new Rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade('#151821', (brightness - 1) * 0.5));
  g.addColorStop(1, shade('#0C0E14', (brightness - 1) * 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const bh = 44 * d;
  let row = 0;
  for (let y = -rng.range(0, bh); y < h; y += bh, row++) {
    let x = -rng.range(0, 80 * d) - (row % 2) * 30 * d;
    while (x < w) {
      const bw = rng.range(64, 96) * d;
      const v = rng.range(-0.06, 0.05) * brightness;
      const t = y / h;
      const base = shade(t < 0.5 ? '#1A1E28' : '#12151D', v + (brightness - 1) * 0.4);
      ctx.fillStyle = base;
      roundRect(ctx, x + 1.5 * d, y + 1.5 * d, bw - 3 * d, bh - 3 * d, 3 * d);
      ctx.fill();
      ctx.fillStyle = 'rgba(110,124,150,0.07)';
      ctx.fillRect(x + 2 * d, y + 2 * d, bw - 4 * d, 1.5 * d);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 2 * d, y + bh - 4 * d, bw - 4 * d, 2 * d);
      if (rng.chance(0.18)) {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1 * d;
        ctx.beginPath();
        let cx = x + rng.range(0.2, 0.8) * bw;
        let cy = y + 4 * d;
        ctx.moveTo(cx, cy);
        for (let k = 0; k < 5; k++) {
          cx += rng.range(-6, 6) * d;
          cy += rng.range(4, 9) * d;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      if (rng.chance(0.1)) {
        const mx = x + rng.range(0, bw);
        const mg = ctx.createRadialGradient(mx, y + bh, 0, mx, y + bh, 22 * d);
        mg.addColorStop(0, 'rgba(50,72,50,0.22)');
        mg.addColorStop(1, 'rgba(50,72,50,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(mx - 22 * d, y + bh - 22 * d, 44 * d, 44 * d);
      }
      x += bw;
    }
  }
  applyGrain(ctx, grain, 0, 0, w, h, 0.55);
}

/** 调亮/调暗十六进制色，返回 rgb() */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function mixRgb(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const m = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
