// Bricks (per type), status overlays, prism core, crystals, boss bodies (docs §4.5).
import { pal } from '../../config';
import type { Atlas, Frame } from '../atlas';
import { drawDiamond } from './shapes';
import { bakeRng, hexCss, polygon, radialGlow, roundRect } from './util';
import type { C2D } from './util';

export interface EntitySprites {
  /** indexed by brickTypeIndex */
  brick: Frame[];
  brickGlow: Frame;
  eliteGlow: Frame;
  brickFlash: Frame;
  eliteFlash: Frame;
  brickEdge: Frame;
  eliteEdge: Frame;
  crack: Frame[];
  crackE: Frame[];
  shieldPat: Frame;
  shieldPatE: Frame;
  ice: Frame;
  iceE: Frame;
  crown: Frame;
  paddle: Frame;
  paddleGlow: Frame;
  prism: Frame;
  /** small, medium, large, heal */
  gem: Frame[];
  panelHex: Frame;
  panelCircle: Frame;
  panelSq: Frame;
  monolith: Frame;
  omegaCore: Frame;
  eye: Frame;
  segment: Frame;
}

const BW = 48;
const BH = 24;
const EW = 100;
const EH = 52;
const PAD = 2;

interface BrickStyle {
  stroke: number;
  body: number;
  hi: number;
}

const STYLES: BrickStyle[] = [
  { stroke: pal.basic, body: pal.basicBody, hi: 0x2a1a5e }, // basic
  { stroke: pal.armored, body: 0x0f1638, hi: 0x1e2c6e }, // armored
  { stroke: pal.volatile, body: 0x1c0812, hi: 0x3a0e22 }, // volatile
  { stroke: pal.prismBrick, body: pal.basicBody, hi: 0x2a1a5e }, // prism
  { stroke: pal.turret, body: 0x120b2b, hi: 0x251a55 }, // turret
  { stroke: pal.warden, body: 0x15122c, hi: 0x2c2856 }, // warden
  { stroke: pal.elite, body: 0x190e3c, hi: 0x30205f }, // elite
];

function brickBase(c: C2D, p: number, w: number, h: number, st: BrickStyle, strokeW: number): void {
  const x = PAD * p;
  const y = PAD * p;
  const W = w * p;
  const H = h * p;
  const r = 4 * p;
  // body
  roundRect(c, x, y, W, H, r);
  c.fillStyle = hexCss(st.body, 0.93);
  c.fill();
  // diagonal top-left sheen (30%)
  c.save();
  roundRect(c, x, y, W, H, r);
  c.clip();
  const g = c.createLinearGradient(x, y, x + W * 0.45, y + H * 1.1);
  g.addColorStop(0, hexCss(st.hi, 0.95));
  g.addColorStop(0.55, hexCss(st.hi, 0.35));
  g.addColorStop(0.56, hexCss(st.hi, 0));
  c.fillStyle = g;
  c.fillRect(x, y, W, H);
  // inner glow (3u fade from the stroke)
  c.shadowColor = hexCss(st.stroke, 0.9);
  c.shadowBlur = 3 * p;
  c.strokeStyle = hexCss(st.stroke, 0.55);
  c.lineWidth = 2 * p;
  roundRect(c, x - 1 * p, y - 1 * p, W + 2 * p, H + 2 * p, r + p);
  c.stroke();
  c.restore();
  // stroke
  roundRect(c, x + strokeW * p * 0.5, y + strokeW * p * 0.5, W - strokeW * p, H - strokeW * p, r - strokeW * p * 0.5);
  c.strokeStyle = hexCss(st.stroke);
  c.lineWidth = strokeW * p;
  c.stroke();
  // top highlight line
  c.beginPath();
  c.moveTo(x + r + p, y + strokeW * p + 0.8 * p);
  c.lineTo(x + W - r - p, y + strokeW * p + 0.8 * p);
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 1 * p;
  c.stroke();
}

function bakeBrick(a: Atlas, type: number): Frame {
  const elite = type === 6;
  const w = elite ? EW : BW;
  const h = elite ? EH : BH;
  const st = STYLES[type]!;
  return a.add(w + PAD * 2, h + PAD * 2, 3, h / 2 + PAD, (c, p) => {
    brickBase(c, p, w, h, st, elite ? 2.5 : 1.5);
    const x0 = PAD * p;
    const y0 = PAD * p;
    if (type === 1) {
      // armored: second inner frame
      roundRect(c, x0 + 3.2 * p, y0 + 3.2 * p, (w - 6.4) * p, (h - 6.4) * p, 2.5 * p);
      c.strokeStyle = hexCss(st.stroke, 0.85);
      c.lineWidth = 1 * p;
      c.stroke();
      // rivets
      c.fillStyle = hexCss(0x9fb4ff, 0.8);
      for (const [rx, ry] of [[5.5, 5.5], [w - 5.5, 5.5], [5.5, h - 5.5], [w - 5.5, h - 5.5]] as const) {
        c.beginPath();
        c.arc(x0 + rx * p, y0 + ry * p, 0.9 * p, 0, Math.PI * 2);
        c.fill();
      }
    } else if (type === 2) {
      // volatile: hazard stripes at 30%
      c.save();
      roundRect(c, x0 + 1.5 * p, y0 + 1.5 * p, (w - 3) * p, (h - 3) * p, 3 * p);
      c.clip();
      c.strokeStyle = 'rgba(255,51,85,0.3)';
      c.lineWidth = 3.5 * p;
      for (let i = -4; i < 12; i++) {
        c.beginPath();
        c.moveTo(x0 + i * 7 * p, y0 + h * p);
        c.lineTo(x0 + i * 7 * p + h * p, y0);
        c.stroke();
      }
      c.restore();
    } else if (type === 3) {
      // prism: inlaid gold crystal on the left
      const cx = x0 + 8.5 * p;
      const cy = y0 + h * 0.5 * p;
      radialGlow(c, cx, cy, 7 * p, '255,216,74', 0.5);
      drawDiamond(c, cx, cy, 3.6 * p, 5.6 * p);
      c.fillStyle = hexCss(pal.gem);
      c.fill();
      drawDiamond(c, cx - 0.9 * p, cy - 1.2 * p, 1.4 * p, 2.4 * p);
      c.fillStyle = hexCss(pal.gemHi);
      c.fill();
    } else if (type === 4) {
      // turret: eye socket on the left (the eye itself is animated at runtime)
      const cx = x0 + 9 * p;
      const cy = y0 + h * 0.5 * p;
      c.beginPath();
      c.arc(cx, cy, 5.2 * p, 0, Math.PI * 2);
      c.fillStyle = '#070310';
      c.fill();
      c.strokeStyle = hexCss(0xff3355, 0.7);
      c.lineWidth = 1 * p;
      c.stroke();
    } else if (type === 5) {
      // warden: hexagonal emitter on the left
      const cx = x0 + 9 * p;
      const cy = y0 + h * 0.5 * p;
      polygon(c, cx, cy, 5.5 * p, 6, Math.PI / 6);
      c.fillStyle = 'rgba(230,226,255,0.18)';
      c.fill();
      c.strokeStyle = hexCss(pal.warden);
      c.lineWidth = 1.1 * p;
      c.stroke();
      polygon(c, cx, cy, 2.2 * p, 6, Math.PI / 6);
      c.fillStyle = '#fff';
      c.fill();
    } else if (type === 6) {
      // elite: inner frame + flowing energy diagonals
      roundRect(c, x0 + 5 * p, y0 + 5 * p, (w - 10) * p, (h - 10) * p, 3 * p);
      c.strokeStyle = hexCss(pal.elite, 0.7);
      c.lineWidth = 1 * p;
      c.stroke();
      c.save();
      roundRect(c, x0 + 5 * p, y0 + 5 * p, (w - 10) * p, (h - 10) * p, 3 * p);
      c.clip();
      c.strokeStyle = 'rgba(176,124,255,0.16)';
      c.lineWidth = 2 * p;
      for (let i = -6; i < 16; i++) {
        c.beginPath();
        c.moveTo(x0 + i * 9 * p, y0 + h * p);
        c.lineTo(x0 + i * 9 * p + h * p, y0);
        c.stroke();
      }
      c.restore();
    }
  });
}

function rectGlow(a: Atlas, w: number, h: number, pad: number): Frame {
  return a.add(w + pad * 2, h + pad * 2, 1.5, h / 2 + pad, (c, p) => {
    c.shadowColor = '#fff';
    c.shadowBlur = pad * 0.9 * p;
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2.5 * p;
    roundRect(c, pad * p, pad * p, w * p, h * p, 4 * p);
    c.stroke();
    c.shadowBlur = pad * 0.5 * p;
    c.stroke();
  });
}

function rectFill(a: Atlas, w: number, h: number): Frame {
  return a.add(w + 2, h + 2, 2, h / 2 + 1, (c, p) => {
    roundRect(c, p, p, w * p, h * p, 4 * p);
    c.fillStyle = '#fff';
    c.fill();
  });
}

function rectEdge(a: Atlas, w: number, h: number): Frame {
  return a.add(w + PAD * 2, h + PAD * 2, 3, h / 2 + PAD, (c, p) => {
    roundRect(c, (PAD + 0.75) * p, (PAD + 0.75) * p, (w - 1.5) * p, (h - 1.5) * p, 3.5 * p);
    c.strokeStyle = '#fff';
    c.lineWidth = 1.6 * p;
    c.shadowColor = '#fff';
    c.shadowBlur = 1.5 * p;
    c.stroke();
  });
}

function crack(a: Atlas, w: number, h: number, seed: number, n: number): Frame {
  return a.add(w + PAD * 2, h + PAD * 2, 3, h / 2 + PAD, (c, p) => {
    const rnd = bakeRng(seed);
    c.strokeStyle = '#fff';
    c.lineWidth = 0.8 * p;
    c.lineJoin = 'round';
    c.shadowColor = 'rgba(255,255,255,0.6)';
    c.shadowBlur = 1 * p;
    for (let k = 0; k < n; k++) {
      let x = (PAD + w * (0.2 + rnd() * 0.6)) * p;
      let y = (PAD + h * (0.25 + rnd() * 0.5)) * p;
      const branches = 3;
      for (let b = 0; b < branches; b++) {
        let ang = rnd() * Math.PI * 2;
        let px = x;
        let py = y;
        c.beginPath();
        c.moveTo(px, py);
        const segs = 3 + Math.floor(rnd() * 3);
        for (let s = 0; s < segs; s++) {
          ang += (rnd() - 0.5) * 1.2;
          const len = (2.5 + rnd() * 4) * p * (w > 60 ? 1.6 : 1);
          px += Math.cos(ang) * len;
          py += Math.sin(ang) * len;
          c.lineTo(px, py);
        }
        c.stroke();
      }
      x += 1;
      y += 1;
    }
  });
}

function shieldPattern(a: Atlas, w: number, h: number): Frame {
  return a.add(w + PAD * 2, h + PAD * 2, 2, h / 2 + PAD, (c, p) => {
    c.save();
    roundRect(c, PAD * p, PAD * p, w * p, h * p, 4 * p);
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 0.8 * p;
    const r = 5;
    const dx = r * 1.732;
    for (let row = -1; row < h / (r * 1.5) + 1; row++) {
      for (let col = -1; col < w / dx + 1; col++) {
        const cx = (PAD + col * dx + (row % 2 ? dx / 2 : 0)) * p;
        const cy = (PAD + row * r * 1.5) * p;
        polygon(c, cx, cy, r * p, 6, Math.PI / 6);
        c.stroke();
      }
    }
    c.restore();
  });
}

function iceShell(a: Atlas, w: number, h: number): Frame {
  return a.add(w + PAD * 2 + 2, h + PAD * 2 + 2, 3, h / 2 + PAD + 1, (c, p) => {
    const x = (PAD + 0) * p;
    const y = (PAD + 0) * p;
    const W = (w + 2) * p;
    const H = (h + 2) * p;
    roundRect(c, x, y, W, H, 5 * p);
    const g = c.createLinearGradient(x, y, x + W, y + H);
    g.addColorStop(0, 'rgba(232,253,255,0.55)');
    g.addColorStop(0.5, 'rgba(120,230,255,0.28)');
    g.addColorStop(1, 'rgba(200,250,255,0.45)');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(232,253,255,0.95)';
    c.lineWidth = 1.3 * p;
    c.shadowColor = '#2ee6ff';
    c.shadowBlur = 3 * p;
    c.stroke();
    c.shadowBlur = 0;
    // faceted lines
    c.save();
    roundRect(c, x, y, W, H, 5 * p);
    c.clip();
    const rnd = bakeRng(w * 13 + h);
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 0.7 * p;
    const n = Math.round(w / 9);
    for (let i = 0; i < n; i++) {
      const px = x + rnd() * W;
      const py = y + rnd() * H;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + (rnd() - 0.5) * 14 * p, py + (rnd() - 0.5) * 14 * p);
      c.lineTo(px + (rnd() - 0.5) * 14 * p, py + (rnd() - 0.5) * 10 * p);
      c.stroke();
    }
    // gloss band
    const gg = c.createLinearGradient(x, y, x + W * 0.6, y + H);
    gg.addColorStop(0.25, 'rgba(255,255,255,0)');
    gg.addColorStop(0.32, 'rgba(255,255,255,0.35)');
    gg.addColorStop(0.4, 'rgba(255,255,255,0)');
    c.fillStyle = gg;
    c.fillRect(x, y, W, H);
    c.restore();
  });
}

function gemSprite(a: Atlas, hw: number, hh: number, large: boolean): Frame {
  return a.add(hw * 2 + 6, hh * 2 + 6, 3, hh, (c, p, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    radialGlow(c, cx, cy, (hh + 3) * p, '255,216,74', 0.45);
    drawDiamond(c, cx, cy, hw * p, hh * p);
    const g = c.createLinearGradient(cx - hw * p, cy - hh * p, cx + hw * p, cy + hh * p);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.45, '#ffd84a');
    g.addColorStop(1, '#e79a1c');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255,250,220,0.9)';
    c.lineWidth = 0.7 * p;
    c.stroke();
    // facets
    c.beginPath();
    c.moveTo(cx, cy - hh * p);
    c.lineTo(cx - hw * 0.35 * p, cy);
    c.lineTo(cx, cy + hh * p);
    c.moveTo(cx - hw * p, cy);
    c.lineTo(cx + hw * p, cy);
    c.strokeStyle = 'rgba(255,243,176,0.7)';
    c.lineWidth = 0.6 * p;
    c.stroke();
    drawDiamond(c, cx - hw * 0.35 * p, cy - hh * 0.35 * p, hw * 0.28 * p, hh * 0.3 * p);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fill();
    if (large) {
      c.beginPath();
      c.ellipse(cx, cy, hw * 1.25 * p, hh * 0.32 * p, 0, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,243,176,0.8)';
      c.lineWidth = 0.8 * p;
      c.stroke();
    }
  });
}

function panel(a: Atlas, shape: 'hex' | 'circle' | 'sq'): Frame {
  return a.add(72, 72, 3, 32, (c, p, w) => {
    const cx = w / 2;
    const r = 31 * p;
    const path = (): void => {
      if (shape === 'hex') polygon(c, cx, cx, r, 6, Math.PI / 6);
      else if (shape === 'circle') {
        c.beginPath();
        c.arc(cx, cx, r, 0, Math.PI * 2);
      } else roundRect(c, cx - r * 0.9, cx - r * 0.9, r * 1.8, r * 1.8, 6 * p);
    };
    path();
    c.fillStyle = 'rgba(30,24,48,0.94)';
    c.fill();
    c.save();
    path();
    c.clip();
    const g = c.createLinearGradient(cx - r, cx - r, cx + r * 0.2, cx + r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    g.addColorStop(0.51, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
    c.shadowColor = '#fff';
    c.shadowBlur = 5 * p;
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 3 * p;
    path();
    c.stroke();
    c.restore();
    path();
    c.strokeStyle = '#fff';
    c.lineWidth = 2 * p;
    c.stroke();
  });
}

export function bakeEntities(a: Atlas): EntitySprites {
  const brick: Frame[] = [];
  for (let t = 0; t < 7; t++) brick.push(bakeBrick(a, t));
  const brickGlow = rectGlow(a, BW, BH, 8);
  const eliteGlow = rectGlow(a, EW, EH, 10);
  const brickFlash = rectFill(a, BW, BH);
  const eliteFlash = rectFill(a, EW, EH);
  const brickEdge = rectEdge(a, BW, BH);
  const eliteEdge = rectEdge(a, EW, EH);
  const cracks = [crack(a, BW, BH, 11, 1), crack(a, BW, BH, 23, 2)];
  const crackE = [crack(a, EW, EH, 37, 2), crack(a, EW, EH, 51, 4)];
  const shieldPat = shieldPattern(a, BW, BH);
  const shieldPatE = shieldPattern(a, EW, EH);
  const ice = iceShell(a, BW, BH);
  const iceE = iceShell(a, EW, EH);
  const crown = a.add(18, 12, 3, 6, (c, p, w, h) => {
    c.beginPath();
    c.moveTo(2 * p, h - 2 * p);
    c.lineTo(2.5 * p, 3 * p);
    c.lineTo(6 * p, 6.5 * p);
    c.lineTo(w / 2, 1.5 * p);
    c.lineTo(w - 6 * p, 6.5 * p);
    c.lineTo(w - 2.5 * p, 3 * p);
    c.lineTo(w - 2 * p, h - 2 * p);
    c.closePath();
    c.fillStyle = hexCss(pal.gold);
    c.shadowColor = hexCss(pal.gold);
    c.shadowBlur = 2 * p;
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#fff6d0';
    c.fillRect(2.5 * p, h - 4 * p, w - 5 * p, 1.2 * p);
  });
  // paddle 76×8, white centre → lavender ends
  const paddle = a.add(80, 12, 3, 6, (c, p, w, h) => {
    const x = 2 * p;
    const y = 2 * p;
    const W = w - 4 * p;
    const H = h - 4 * p;
    const g = c.createLinearGradient(x, 0, x + W, 0);
    g.addColorStop(0, hexCss(pal.paddleEnd));
    g.addColorStop(0.3, '#ffffff');
    g.addColorStop(0.7, '#ffffff');
    g.addColorStop(1, hexCss(pal.paddleEnd));
    roundRect(c, x, y, W, H, 4 * p);
    c.fillStyle = g;
    c.shadowColor = hexCss(pal.paddleEnd);
    c.shadowBlur = 1.5 * p;
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(120,100,200,0.35)';
    c.fillRect(x + 4 * p, y + H * 0.62, W - 8 * p, H * 0.3);
  });
  const paddleGlow = a.add(110, 34, 1, 17, (c, p, w, h) => {
    c.shadowColor = '#fff';
    c.shadowBlur = 9 * p;
    roundRect(c, 15 * p, 13 * p, w - 30 * p, h - 26 * p, 4 * p);
    c.fillStyle = '#fff';
    c.fill();
    c.fill();
  });
  // prism: equilateral-ish triangle 24×20 with RGB refraction edges
  const prism = a.add(32, 28, 3, 10, (c, p, w, h) => {
    const cx = w / 2;
    const top = (h - 20 * p) / 2;
    const bot = top + 20 * p;
    const tri = (dx: number, dy: number): void => {
      c.beginPath();
      c.moveTo(cx + dx, top + dy);
      c.lineTo(cx + 12 * p + dx, bot + dy);
      c.lineTo(cx - 12 * p + dx, bot + dy);
      c.closePath();
    };
    c.lineWidth = 1 * p;
    c.lineJoin = 'round';
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(46,230,255,0.9)';
    tri(-1 * p, 0);
    c.stroke();
    c.strokeStyle = 'rgba(255,47,208,0.9)';
    tri(1 * p, 0.5 * p);
    c.stroke();
    c.strokeStyle = 'rgba(255,216,74,0.85)';
    tri(0, 1 * p);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    tri(0, 0);
    const g = c.createLinearGradient(cx - 12 * p, top, cx + 12 * p, bot);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#e8e2ff');
    g.addColorStop(1, '#bfb3ff');
    c.fillStyle = g;
    c.fill();
    // inner faces
    c.beginPath();
    c.moveTo(cx, top + 1 * p);
    c.lineTo(cx, bot - 1 * p);
    c.moveTo(cx, top + 12 * p);
    c.lineTo(cx - 10 * p, bot - 0.5 * p);
    c.moveTo(cx, top + 12 * p);
    c.lineTo(cx + 10 * p, bot - 0.5 * p);
    c.strokeStyle = 'rgba(140,120,220,0.55)';
    c.lineWidth = 0.7 * p;
    c.stroke();
  });
  const gem = [gemSprite(a, 3.6, 5.6, false), gemSprite(a, 5.5, 8.2, false), gemSprite(a, 8, 11.5, true)];
  gem.push(
    a.add(22, 22, 3, 9, (c, p, w) => {
      const cx = w / 2;
      radialGlow(c, cx, cx, 11 * p, '107,255,184', 0.9);
      c.beginPath();
      c.arc(cx, cx, 7 * p, 0, Math.PI * 2);
      c.fillStyle = 'rgba(10,40,30,0.85)';
      c.fill();
      c.strokeStyle = hexCss(pal.heal);
      c.lineWidth = 1.2 * p;
      c.stroke();
      c.fillStyle = '#fff';
      c.fillRect(cx - 1.3 * p, cx - 4.5 * p, 2.6 * p, 9 * p);
      c.fillRect(cx - 4.5 * p, cx - 1.3 * p, 9 * p, 2.6 * p);
    }),
  );
  const panelHex = panel(a, 'hex');
  const panelCircle = panel(a, 'circle');
  const panelSq = panel(a, 'sq');
  // monolith: tall obelisk slab (fits the r40 core), coloured
  const monolith = a.add(76, 100, 3, 44, (c, p, w, h) => {
    const cx = w / 2;
    const top = 6 * p;
    const bot = h - 6 * p;
    const path = (inset: number): void => {
      const i = inset * p;
      c.beginPath();
      c.moveTo(cx, top + i);
      c.lineTo(cx + 28 * p - i, top + 16 * p + i * 0.5);
      c.lineTo(cx + 30 * p - i, bot - 10 * p);
      c.lineTo(cx + 18 * p - i * 0.6, bot - i);
      c.lineTo(cx - 18 * p + i * 0.6, bot - i);
      c.lineTo(cx - 30 * p + i, bot - 10 * p);
      c.lineTo(cx - 28 * p + i, top + 16 * p + i * 0.5);
      c.closePath();
    };
    path(0);
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#2a1d5e');
    g.addColorStop(1, '#0d0824');
    c.fillStyle = g;
    c.shadowColor = hexCss(pal.monolith);
    c.shadowBlur = 6 * p;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = hexCss(pal.monolith);
    c.lineWidth = 2 * p;
    c.stroke();
    path(6);
    c.strokeStyle = hexCss(pal.monolithPlate, 0.9);
    c.lineWidth = 1.2 * p;
    c.stroke();
    // runes
    c.strokeStyle = hexCss(pal.monolith, 0.45);
    c.lineWidth = 1 * p;
    for (let i = 0; i < 4; i++) {
      const y = top + (58 + i * 7) * p;
      c.beginPath();
      c.moveTo(cx - (14 - i * 2) * p, y);
      c.lineTo(cx + (14 - i * 2) * p, y);
      c.stroke();
    }
    // eye socket
    c.beginPath();
    c.ellipse(cx, top + 38 * p, 13 * p, 7.5 * p, 0, 0, Math.PI * 2);
    c.fillStyle = '#05020c';
    c.fill();
    c.strokeStyle = hexCss(pal.monolith, 0.8);
    c.lineWidth = 1 * p;
    c.stroke();
  });
  const omegaCore = a.add(112, 112, 3, 48, (c, p, w) => {
    const cx = w / 2;
    const r = 48 * p;
    c.globalCompositeOperation = 'lighter';
    const rims: [string, number][] = [['rgba(255,40,80,0.8)', -1.5], ['rgba(40,255,160,0.7)', 0], ['rgba(60,120,255,0.8)', 1.5]];
    for (const [cl, off] of rims) {
      c.beginPath();
      c.arc(cx + off * p, cx, r + 1.5 * p, 0, Math.PI * 2);
      c.strokeStyle = cl;
      c.lineWidth = 2 * p;
      c.shadowColor = cl;
      c.shadowBlur = 4 * p;
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(cx, cx, r, 0, Math.PI * 2);
    c.fillStyle = '#000';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 2 * p;
    c.stroke();
    const g = c.createRadialGradient(cx, cx, r * 0.5, cx, cx, r);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.18)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cx, r, 0, Math.PI * 2);
    c.fill();
  });
  const eye = a.add(28, 16, 3, 7, (c, p, w, h) => {
    c.beginPath();
    c.moveTo(1 * p, h / 2);
    c.quadraticCurveTo(w / 2, -2 * p, w - 1 * p, h / 2);
    c.quadraticCurveTo(w / 2, h + 2 * p, 1 * p, h / 2);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fill();
    c.beginPath();
    c.arc(w / 2, h / 2, 4 * p, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = 3 * p;
    c.fill();
  });
  const segment = a.add(36, 36, 3, 16, (c, p, w) => {
    const cx = w / 2;
    polygon(c, cx, cx, 15 * p, 6, 0);
    c.fillStyle = 'rgba(28,20,52,0.95)';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.6 * p;
    c.shadowColor = '#fff';
    c.shadowBlur = 3 * p;
    c.stroke();
    c.shadowBlur = 0;
    polygon(c, cx, cx, 6 * p, 6, 0);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 1 * p;
    c.stroke();
  });
  return {
    brick, brickGlow, eliteGlow, brickFlash, eliteFlash, brickEdge, eliteEdge, crack: cracks, crackE, shieldPat, shieldPatE,
    ice, iceE, crown, paddle, paddleGlow, prism, gem, panelHex, panelCircle, panelSq, monolith, omegaCore, eye, segment,
  };
}
