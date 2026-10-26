// Boss bodies (docs §4.2 boss palettes, §3.11): Monolith slab + orbiting plates, Pulsar star with dashed rings,
// Serpent hex chain, Omega black core with chromatic rim and prism cells.
import { config, pal } from '../config';
import type { Boss, BossPart } from '../game/bosses/boss';
import { PART_HEAD } from '../game/bosses/boss';
import type { Monolith } from '../game/bosses/monolith';
import type { Pulsar } from '../game/bosses/pulsar';
import type { Serpent } from '../game/bosses/serpent';
import type { Omega } from '../game/bosses/omega';
import type { Batcher } from './batcher';
import { col, mixHex } from './batcher';
import type { Sprites } from './sprites';

const TAU = Math.PI * 2;
const AURA = [0xff2850, 0x28ffa0, 0x3c78ff];
const CELL_HUES = [0xff4d6d, 0xffb84d, 0xfff04d, 0x6dff8a, 0x4dfff0, 0x4d9bff, 0xa64dff, 0xff4dd2, 0xffffff, 0xff8a4d];

function lerpPos(p: BossPart, a: number, out: { x: number; y: number }): void {
  out.x = p.px + (p.x - p.px) * a;
  out.y = p.py + (p.y - p.py) * a;
}
const P = { x: 0, y: 0 };

function flames(b: Batcher, s: Sprites, p: BossPart, x: number, y: number, t: number): void {
  if (p.burnStacks <= 0) return;
  const n = Math.min(5, p.burnStacks);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.45;
    const fx = x + Math.cos(a) * p.r * 0.8;
    const fy = y + Math.sin(a) * p.r * 0.8;
    const h = 1.2 + 0.25 * Math.sin(t * 23 + k * 2);
    b.sprite(s.flame, fx, fy - 4, 1.2, h, a + Math.PI / 2, col(pal.fire, 0.7, 1));
  }
}

function chillAura(b: Batcher, s: Sprites, boss: Boss, x: number, y: number, r: number): void {
  if (boss.chill <= 0) return;
  const k = Math.min(1, boss.chill / 6);
  b.spriteR(s.ringSoft, x, y, r * 1.15, 0, col(pal.ice, 0.35 * k, 1));
}

export function drawBoss(b: Batcher, s: Sprites, boss: Boss, t: number, a: number): void {
  if (boss.state === 'warn') return;
  switch (boss.kind) {
    case 'monolith':
      drawMonolith(b, s, boss as Monolith, t, a);
      break;
    case 'pulsar':
      drawPulsar(b, s, boss as Pulsar, t, a);
      break;
    case 'serpent':
      drawSerpent(b, s, boss as Serpent, t, a);
      break;
    case 'omega':
      drawOmega(b, s, boss as Omega, t, a);
      break;
  }
}

function drawMonolith(b: Batcher, s: Sprites, m: Monolith, t: number, a: number): void {
  const core = m.core;
  lerpPos(core, a, P);
  const x = P.x;
  const y = P.y;
  // aura + plates orbit ring
  b.spriteR(s.glow, x, y, 90, 0, col(pal.monolithPlate, 0.28, 1));
  b.spriteR(s.ringDash, x, y, config.bosses.monolith.plateOrbit, t * 0.2, col(pal.monolith, 0.18, 1));
  chillAura(b, s, m, x, y, 50);
  const fl = core.flashT > 0 ? core.flashT / 0.05 : 0;
  b.sprite(s.monolith, x, y, 1, 1, Math.sin(t * 0.8) * 0.02, col(0xffffff, 1, 0));
  if (fl > 0) b.sprite(s.monolith, x, y, 1, 1, 0, col(0xffffff, fl * 0.6, 0.6));
  // eye tracks the core
  const ex = x + m.eyeX * 6;
  const ey = y - 6;
  const p2 = m.phase >= 2 ? 1 : 0;
  b.spriteR(s.glow, ex, ey, 22 + p2 * 6, 0, col(pal.danger, 0.55 + 0.2 * Math.sin(t * 5), 1));
  b.sprite(s.eye, ex, ey, 0.85, 0.75 + 0.1 * Math.sin(t * 3), 0, col(mixHex(pal.danger, 0xffffff, 0.25), 1, 0.2));
  flames(b, s, core, x, y, t);
  // plates
  for (const p of m.plates) {
    if (!p.alive) continue;
    lerpPos(p, a, P);
    const gr = p.grow;
    const warn = p.warnT > 0 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
    const hc = mixHex(pal.monolithPlate, pal.danger, warn);
    b.spriteR(s.glow, P.x, P.y, 22 * gr, 0, col(hc, 0.45, 1));
    b.sprite(s.panelSq, P.x, P.y, (p.r / 32) * 1.25 * gr, (p.r / 32) * 1.25 * gr, p.angle + t * 0.5, col(mixHex(pal.monolithPlate, 0xcdb8ff, 0.3), 1, 0));
    const hitsFrac = p.hits / Math.max(1, p.maxHits);
    if (hitsFrac < 1) b.sprite(s.crack[0]!, P.x, P.y, 0.4 * gr, 0.6 * gr, p.angle, col(0xffffff, 0.55 * (1 - hitsFrac), 0.3));
    if (p.flashT > 0) b.spriteR(s.disc, P.x, P.y, p.r * gr, 0, col(0xffffff, (p.flashT / 0.05) * 0.7, 0.5));
  }
}

function drawPulsar(b: Batcher, s: Sprites, ps: Pulsar, t: number, a: number): void {
  for (const st of ps.stars) {
    const p = st.part;
    if (!p.alive) continue;
    lerpPos(p, a, P);
    const r = p.r;
    const contract = p.warnT > 0 ? 1 - 0.18 * Math.sin((1 - p.warnT / config.bosses.pulsar.fanWarn) * Math.PI) : 1;
    const beat = 1 + 0.06 * Math.sin(t * TAU * 2);
    const rr = r * contract * beat;
    b.spriteR(s.glow, P.x, P.y, rr * 3.2, 0, col(pal.pulsar, 0.45, 1));
    chillAura(b, s, ps, P.x, P.y, rr);
    b.spriteR(s.ringDash, P.x, P.y, rr * 1.55, t * 0.9, col(pal.pulsar, 0.7, 0.6));
    b.spriteR(s.ringDash, P.x, P.y, rr * 1.25, -t * 1.4, col(0xffffff, 0.55, 0.6));
    b.spriteR(s.ringDash, P.x, P.y, rr * 1.85, t * 0.5 + 1, col(pal.pulsar, 0.35, 0.8));
    b.spriteR(s.disc, P.x, P.y, rr, 0, col(0x2a0610, 1, 0));
    b.spriteR(s.star4, P.x, P.y, rr * 1.1, t * 0.6, col(pal.pulsar, 0.9, 0.5));
    b.spriteR(s.glowTight, P.x, P.y, rr * 0.75, 0, col(0xffffff, 0.9, 0.6));
    b.spriteR(s.disc, P.x, P.y, rr * 0.34, 0, col(0xffffff, 1, 0.2));
    if (st.state === 'hover') b.spriteR(s.ring, P.x, P.y, rr * 1.1, 0, col(0xffffff, 0.5 + 0.4 * Math.sin(t * 16), 0.5));
    if (p.flashT > 0) b.spriteR(s.disc, P.x, P.y, rr, 0, col(0xffffff, (p.flashT / 0.05) * 0.6, 0.5));
    flames(b, s, p, P.x, P.y, t);
  }
}

function drawSerpent(b: Batcher, s: Sprites, sp: Serpent, t: number, a: number): void {
  // draw tails first so heads sit on top
  for (let i = sp.parts.length - 1; i >= 0; i--) {
    const p = sp.parts[i]!;
    if (!p.alive) continue;
    const sn = sp.snakes[p.snake];
    if (sn && sn.teleT > 0 && Math.sin(t * 60 + i) > 0) continue;
    lerpPos(p, a, P);
    // segments still above the ceiling (entering from the top) materialise as they cross it instead of
    // painting under the HUD band
    const v = P.y >= 72 ? 1 : (P.y - 44) / 28;
    if (v <= 0) continue;
    const head = p.kind === PART_HEAD;
    const fl = p.flashT > 0 ? p.flashT / 0.05 : 0;
    const wig = Math.sin(t * 8 + i * 0.7) * 0.15;
    if (head) {
      b.spriteR(s.glow, P.x, P.y, p.r * 3, 0, col(pal.serpent, 0.5 * v, 1));
      b.sprite(s.panelHex, P.x, P.y, p.r / 32 * 1.1, p.r / 32 * 1.1, wig, col(mixHex(pal.serpent, 0xffffff, 0.15), v, 0));
      const dir = sn ? sn.dir : 1;
      const dropping = sn ? sn.dropping : false;
      const fx = dropping ? 0 : dir;
      const fy = dropping ? 1 : 0;
      for (let k = -1; k <= 1; k += 2) {
        const ex = P.x + fx * p.r * 0.35 + -fy * k * p.r * 0.32 + (fy ? 0 : 0);
        const ey = P.y + fy * p.r * 0.35 + fx * k * p.r * 0.32 * 0.9 - (fy ? 0 : 2);
        b.spriteR(s.glow, ex, ey, 6, 0, col(pal.danger, 0.8 * v, 1));
        b.spriteR(s.disc, ex, ey, 2.2, 0, col(0xffd0d8, v, 0.2));
      }
    } else {
      b.spriteR(s.glow, P.x, P.y, p.r * 2.2, 0, col(pal.serpent, 0.3 * v, 1));
      b.sprite(s.segment, P.x, P.y, p.r / 16, p.r / 16, wig + i * 0.3, col(mixHex(pal.serpent, 0xffffff, 0.2), v, 0));
      const hpF = p.maxHp > 0 ? p.hp / p.maxHp : 1;
      b.spriteR(s.disc, P.x, P.y, 2.5 + 2 * hpF, 0, col(mixHex(pal.danger, 0xffffff, 0.3), 0.85 * v, 0.4));
    }
    if (fl > 0) b.spriteR(s.disc, P.x, P.y, p.r, 0, col(0xffffff, fl * 0.6 * v, 0.5));
    flames(b, s, p, P.x, P.y, t);
  }
  if (sp.chill > 0) {
    const h = sp.parts[sp.snakes[0]?.head ?? 0];
    if (h && h.alive) chillAura(b, s, sp, h.x, h.y, h.r * 1.4);
  }
}

function drawOmega(b: Batcher, s: Sprites, o: Omega, t: number, a: number): void {
  const core = o.core;
  lerpPos(core, a, P);
  const x = P.x;
  const y = P.y;
  const glitch = o.glitch > 0 || (o.phase === 3 && Math.sin(t * 13.7) > 0.93);
  // rainbow aura
  for (let i = 0; i < 3; i++) {
    const hue = AURA[i]!;
    const off = Math.sin(t * 2 + i * 2.1) * 3 + (glitch ? (i - 1) * 6 : 0);
    b.spriteR(s.glow, x + off, y, 120, 0, col(hue, 0.18, 1));
  }
  b.spriteR(s.ringDash, x, y, config.bosses.omega.orbit, -t * 0.25, col(0xffffff, 0.15, 1));
  chillAura(b, s, o, x, y, 56);
  if (glitch) {
    b.sprite(s.omegaCore, x - 4, y, 1, 1, 0, col(0xff2850, 0.5, 1));
    b.sprite(s.omegaCore, x + 4, y, 1, 1, 0, col(0x3c78ff, 0.5, 1));
  }
  b.sprite(s.omegaCore, x, y, 1, 1, 0, col(0xffffff, 1, 0));
  // inner eye: white iris that pulses with phase
  const ph = o.phase;
  const pulse = 0.5 + 0.5 * Math.sin(t * (2 + ph));
  b.spriteR(s.glowTight, x, y, 22 + 6 * pulse, 0, col(0xffffff, 0.5 + 0.2 * ph * 0.3, 1));
  b.spriteR(s.ring, x, y, 18 + 3 * pulse, t, col(0xffffff, 0.7, 0.5));
  b.spriteR(s.disc, x, y, 6 + ph, 0, col(0xffffff, 1, 0.2));
  if (core.flashT > 0) {
    // hit flash lights the rim and only tints the fill: under sustained fire a full white fill reads as a grey disc
    const k = core.flashT / 0.05;
    b.spriteR(s.ring, x, y, core.r * 1.02, 0, col(0xffffff, 0.85 * k, 1));
    b.spriteR(s.disc, x, y, core.r * 0.92, 0, col(0xffffff, 0.1 * k, 1));
  }
  flames(b, s, core, x, y, t);
  for (let i = 0; i < o.cells.length; i++) {
    const c = o.cells[i]!;
    if (!c.alive) continue;
    lerpPos(c, a, P);
    const gr = c.grow;
    const hue = CELL_HUES[i % 10]!;
    b.spriteR(s.glow, P.x, P.y, 20 * gr, 0, col(hue, 0.4, 1));
    b.sprite(s.panelHex, P.x, P.y, (c.r / 32) * 1.2 * gr, (c.r / 32) * 1.2 * gr, c.angle, col(mixHex(hue, 0xffffff, 0.4), 1, 0));
    const hitsFrac = c.hits / Math.max(1, c.maxHits);
    if (hitsFrac < 1) b.sprite(s.crack[1]!, P.x, P.y, 0.4 * gr, 0.7 * gr, c.angle, col(0xffffff, 0.6 * (1 - hitsFrac), 0.3));
    if (c.flashT > 0) b.spriteR(s.disc, P.x, P.y, c.r * gr, 0, col(0xffffff, (c.flashT / 0.05) * 0.7, 0.5));
  }
}
