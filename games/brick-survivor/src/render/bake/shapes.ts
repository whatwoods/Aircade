// Generic glow shapes: halos, discs, rings, sparks, debris, stars, strips, vignette, sun, hatch.
import type { Atlas, Frame } from '../atlas';
import { bakeRng, polygon, radialGlow, star } from './util';
import type { C2D } from './util';

export interface ShapeSprites {
  white: Frame;
  glow: Frame;
  glowTight: Frame;
  disc: Frame;
  ring: Frame;
  ringSoft: Frame;
  ringDash: Frame;
  spark: Frame;
  tri: Frame;
  hex: Frame;
  hexFill: Frame;
  star4: Frame;
  strip: Frame;
  stripCore: Frame;
  vignette: Frame;
  sun: Frame;
  flame: Frame;
  reticle: Frame;
  frost: Frame;
  cross: Frame;
  chevron: Frame;
  hatch: Frame;
  smoke: Frame;
  diamond: Frame;
  square: Frame;
}

export function bakeShapes(a: Atlas): ShapeSprites {
  const white = a.add(2, 2, 2, 1, (c, _p, w, h) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
  });
  // soft halo: reference radius = full radius
  const glow = a.add(64, 64, 1, 32, (c, _p, w) => radialGlow(c, w / 2, w / 2, w / 2));
  const glowTight = a.add(32, 32, 2, 16, (c, _p, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
  // hard disc with 1px soft edge, unit = 16
  const disc = a.add(34, 34, 3, 16, (c, p, w) => {
    c.fillStyle = '#fff';
    c.shadowColor = 'rgba(255,255,255,0.6)';
    c.shadowBlur = p * 1;
    c.beginPath();
    c.arc(w / 2, w / 2, 16 * p, 0, Math.PI * 2);
    c.fill();
  });
  const ring = a.add(68, 68, 3, 32, (c, p, w) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 2 * p;
    c.shadowColor = '#fff';
    c.shadowBlur = 1.5 * p;
    c.beginPath();
    c.arc(w / 2, w / 2, 31 * p, 0, Math.PI * 2);
    c.stroke();
  });
  const ringSoft = a.add(80, 80, 1.5, 32, (c, p, w) => {
    const r0 = 26 * p;
    const r1 = 32 * p;
    const r2 = 38 * p;
    const g = c.createRadialGradient(w / 2, w / 2, r0 - 6 * p, w / 2, w / 2, r2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop((r1 - (r0 - 6 * p)) / (r2 - (r0 - 6 * p)), 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(w / 2, w / 2, r2, 0, Math.PI * 2);
    c.arc(w / 2, w / 2, Math.max(0, r0 - 6 * p), 0, Math.PI * 2, true);
    c.fill();
  });
  const ringDash = a.add(68, 68, 3, 32, (c, p, w) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 1.6 * p;
    c.shadowColor = '#fff';
    c.shadowBlur = 2 * p;
    c.setLineDash([7 * p, 5 * p]);
    c.beginPath();
    c.arc(w / 2, w / 2, 31 * p, 0, Math.PI * 2);
    c.stroke();
  });
  // streak along +x, unit = half length 16
  const spark = a.add(36, 8, 3, 16, (c, p, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.9, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.shadowColor = '#fff';
    c.shadowBlur = 1.5 * p;
    c.beginPath();
    c.ellipse(w / 2, h / 2, w / 2 - 2 * p, 1.4 * p, 0, 0, Math.PI * 2);
    c.fill();
  });
  // debris triangle: white face with brighter edge, unit 4
  const tri = a.add(10, 10, 3, 4, (c, p, w) => {
    const cx = w / 2;
    c.beginPath();
    c.moveTo(cx, cx - 4 * p);
    c.lineTo(cx + 3.8 * p, cx + 3 * p);
    c.lineTo(cx - 3.6 * p, cx + 2.4 * p);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 0.9 * p;
    c.lineJoin = 'round';
    c.stroke();
  });
  const hex = a.add(28, 28, 3, 12, (c, p, w) => {
    polygon(c, w / 2, w / 2, 11.5 * p, 6, Math.PI / 6);
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5 * p;
    c.shadowColor = '#fff';
    c.shadowBlur = 2 * p;
    c.stroke();
  });
  const hexFill = a.add(28, 28, 3, 12, (c, p, w) => {
    polygon(c, w / 2, w / 2, 11.5 * p, 6, Math.PI / 6);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.2 * p;
    c.stroke();
    c.beginPath();
    c.moveTo(w / 2, w / 2 - 11 * p);
    c.lineTo(w / 2, w / 2 + 11 * p);
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 0.7 * p;
    c.stroke();
  });
  const star4 = a.add(36, 36, 2, 16, (c, p, w) => {
    radialGlow(c, w / 2, w / 2, 9 * p, '255,255,255', 0.7);
    star(c, w / 2, w / 2, 16 * p, 2.2 * p, 4);
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = 3 * p;
    c.fill();
  });
  // trail cross-section along u (full width), constant along v
  const strip = a.add(16, 4, 2, 8, (c, _p, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  const stripCore = a.add(8, 4, 2, 4, (c, _p, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  // vignette: transparent centre → opaque black edge (used stretched over the screen on mid/low)
  const vignette = a.add(128, 128, 1, 64, (c, _p, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, w * 0.28, w / 2, w / 2, w * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
  // synthwave sun, coloured (purple → magenta, cut by horizontal stripes)
  const sun = a.add(244, 244, 1, 120, (c, p, w) => {
    const r = 120 * p;
    const cx = w / 2;
    const g = c.createLinearGradient(0, cx - r, 0, cx + r);
    g.addColorStop(0, '#ffd36e');
    g.addColorStop(0.35, '#ff5fb8');
    g.addColorStop(0.75, '#a43cff');
    g.addColorStop(1, '#5a1cff');
    c.save();
    c.beginPath();
    c.arc(cx, cx, r, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = cx + r * (0.05 + i * 0.11);
      const hh = 1.2 * p + i * 1.1 * p;
      c.fillRect(0, y, w, hh);
    }
    c.restore();
  });
  // flame tongue, tip up, unit = half height 7
  const flame = a.add(10, 16, 3, 7, (c, p, w, h) => {
    const cx = w / 2;
    const g = c.createRadialGradient(cx, h * 0.72, 0, cx, h * 0.6, h * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx, 0.5 * p);
    c.bezierCurveTo(cx + 4.5 * p, h * 0.45, cx + 4.6 * p, h - 1.5 * p, cx, h - 0.5 * p);
    c.bezierCurveTo(cx - 4.6 * p, h - 1.5 * p, cx - 4.5 * p, h * 0.45, cx, 0.5 * p);
    c.fill();
  });
  const reticle = a.add(32, 32, 3, 14, (c, p, w) => {
    const cx = w / 2;
    c.strokeStyle = '#fff';
    c.lineWidth = 1.3 * p;
    c.shadowColor = '#fff';
    c.shadowBlur = 2 * p;
    c.beginPath();
    c.arc(cx, cx, 10 * p, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const an = (i * Math.PI) / 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(an) * 6 * p, cx + Math.sin(an) * 6 * p);
      c.lineTo(cx + Math.cos(an) * 14 * p, cx + Math.sin(an) * 14 * p);
      c.stroke();
    }
  });
  const frost = a.add(12, 12, 3, 5, (c, p, w) => {
    const cx = w / 2;
    c.strokeStyle = '#fff';
    c.lineWidth = 0.9 * p;
    c.shadowColor = '#bff7ff';
    c.shadowBlur = 1.5 * p;
    for (let i = 0; i < 3; i++) {
      const an = (i * Math.PI) / 3;
      c.beginPath();
      c.moveTo(cx - Math.cos(an) * 5 * p, cx - Math.sin(an) * 5 * p);
      c.lineTo(cx + Math.cos(an) * 5 * p, cx + Math.sin(an) * 5 * p);
      c.stroke();
    }
  });
  const cross = a.add(14, 14, 3, 6, (c, p, w) => {
    const cx = w / 2;
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = 1.5 * p;
    c.fillRect(cx - 1.6 * p, cx - 5.5 * p, 3.2 * p, 11 * p);
    c.fillRect(cx - 5.5 * p, cx - 1.6 * p, 11 * p, 3.2 * p);
  });
  const chevron = a.add(12, 10, 3, 4, (c, p, w, h) => {
    c.beginPath();
    c.moveTo(w / 2, 1.5 * p);
    c.lineTo(w - 1.5 * p, h - 1.5 * p);
    c.lineTo(1.5 * p, h - 1.5 * p);
    c.closePath();
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = 1.5 * p;
    c.fill();
  });
  const hatch = a.add(32, 32, 2, 16, (c, p, w) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 4 * p;
    for (let i = -2; i < 4; i++) {
      c.beginPath();
      c.moveTo(i * 16 * p, w);
      c.lineTo(i * 16 * p + w, 0);
      c.stroke();
    }
  });
  const smoke = a.add(32, 32, 1, 16, (c, p, w) => {
    const rnd = bakeRng(7);
    for (let i = 0; i < 7; i++) {
      const x = w / 2 + (rnd() - 0.5) * 12 * p;
      const y = w / 2 + (rnd() - 0.5) * 12 * p;
      radialGlow(c, x, y, (7 + rnd() * 5) * p, '255,255,255', 0.35);
    }
  });
  const diamond = a.add(12, 16, 3, 7, (c, p, w, h) => {
    drawDiamond(c, w / 2, h / 2, 5 * p, 7 * p);
    c.fillStyle = '#fff';
    c.fill();
  });
  const square = a.add(12, 12, 3, 5, (c, p, w) => {
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.strokeStyle = '#fff';
    c.lineWidth = 1 * p;
    c.fillRect(w / 2 - 4.5 * p, w / 2 - 4.5 * p, 9 * p, 9 * p);
    c.strokeRect(w / 2 - 4.5 * p, w / 2 - 4.5 * p, 9 * p, 9 * p);
  });
  return {
    white, glow, glowTight, disc, ring, ringSoft, ringDash, spark, tri, hex, hexFill, star4, strip, stripCore,
    vignette, sun, flame, reticle, frost, cross, chevron, hatch, smoke, diamond, square,
  };
}

export function drawDiamond(c: C2D, cx: number, cy: number, hw: number, hh: number): void {
  c.beginPath();
  c.moveTo(cx, cy - hh);
  c.lineTo(cx + hw, cy);
  c.lineTo(cx, cy + hh);
  c.lineTo(cx - hw, cy);
  c.closePath();
}
