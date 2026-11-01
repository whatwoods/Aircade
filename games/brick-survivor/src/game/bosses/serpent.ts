// Boss 3 · SERPENT — Centipede lanes, splitting chains, wreck bricks, line reach teleport (docs §3.11).
import { config } from '../../config';
import type { Game } from '../game';
import { Boss, PART_HEAD, PART_SEG } from './boss';
import type { BossPart } from './boss';

const S = config.bosses.serpent;
const F = config.field;
const G = config.grid;

class Snake {
  head = -1;
  dir = 1;
  lane = 0;
  dropping = false;
  dropT = 0;
  dropFrom = 0;
  spitT = 0;
  teleT = 0;
  alive = true;
  len = 0;
}

function laneY(k: number): number {
  return F.ceilY + k * G.cellH + G.cellH / 2;
}

export class Serpent extends Boss {
  readonly kind = 'serpent' as const;
  readonly name = '霓蛇';
  readonly en = 'SERPENT';
  override crushes = false;
  snakes: Snake[] = [];
  wiggle = 0;

  constructor(g: Game, hpMult: number) {
    super(g);
    this.hpMult = hpMult;
    this.maxHp = this.hp = S.hp * hpMult;
    const segHp = ((S.hp - S.headHp) / (S.segments - 1)) * hpMult;
    for (let i = 0; i < S.segments; i++) {
      const p = this.addPart(i === 0 ? PART_HEAD : PART_SEG, i === 0 ? S.headR : S.segR, i === 0 ? S.headHp * hpMult : segHp);
      p.prev = i - 1;
      p.next = i < S.segments - 1 ? i + 1 : -1;
      p.snake = 0;
    }
    const sn = new Snake();
    sn.head = 0;
    sn.lane = S.startRow;
    sn.len = S.segments;
    this.snakes.push(sn);
    this.homeY = laneY(S.startRow);
  }

  protected placeIntro(p: number): void {
    const x = F.wallL + S.headR + 4;
    this.x = x;
    this.y = config.bosses.intro.startY + (laneY(S.startRow) - config.bosses.intro.startY) * p;
    for (const part of this.parts) {
      part.x = x;
      part.y = this.y - part.index * S.spacing;
    }
  }

  beginFight(): void {
    this.g.formation.mode = 'hold';
  }

  private speedOf(sn: Snake): number {
    return Math.min(S.speedMax, S.speed + S.speedPerLost * (S.segments - sn.len));
  }

  protected fight(dt: number): void {
    const g = this.g;
    const f = g.formation;
    const sm = this.speedMult();
    this.wiggle += dt;
    for (const sn of this.snakes) {
      if (!sn.alive) continue;
      const head = this.parts[sn.head]!;
      if (sn.teleT > 0) {
        sn.teleT -= dt;
        if (sn.teleT <= 0) this.relocate(sn);
        continue;
      }
      const sp = this.speedOf(sn) * sm;
      if (sn.dropping) {
        sn.dropT += dt * sm;
        const p = Math.min(1, sn.dropT / S.dropTime);
        head.y = sn.dropFrom + (laneY(sn.lane) - sn.dropFrom) * p;
        if (p >= 1) {
          sn.dropping = false;
          sn.dir = -sn.dir;
        }
      } else {
        head.x += sn.dir * sp * dt;
        head.y = laneY(sn.lane);
        const ahead = head.x + sn.dir * (head.r + 3);
        const wall = ahead <= F.wallL || ahead >= F.wallR;
        let blocked = false;
        if (!wall) {
          const col = f.colAtX(ahead);
          const row = f.rowAtY(head.y);
          blocked = f.occupied(col, row);
        }
        if (wall || blocked) {
          head.x = Math.max(F.wallL + head.r, Math.min(F.wallR - head.r, head.x));
          sn.dropping = true;
          sn.dropT = 0;
          sn.dropFrom = head.y;
          sn.lane++;
        }
      }
      // reach the line
      if (head.y + head.r >= F.dangerY) {
        g.damagePlayer(S.reachDmg, 'serpent', head.x, F.dangerY);
        g.sink.emit('slam', head.x, F.dangerY, 1, 0);
        sn.teleT = S.teleport;
        continue;
      }
      // spit
      if (this.attacking() && head.y > S.spitMinY) {
        sn.spitT += dt * sm;
        if (sn.spitT >= S.spitEvery) {
          sn.spitT = 0;
          g.bulletsSys.fan(head.x, head.y, g.player.x, F.catchY, S.spitCount, 22, S.spitSpeed);
          g.sink.emit('enemyShot', head.x, head.y, 4, 0);
        }
      }
      // followers (rope)
      let prev = head;
      let idx = head.next;
      while (idx >= 0) {
        const p = this.parts[idx]!;
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > S.spacing) {
          const k = S.spacing / d;
          p.x = prev.x + dx * k;
          p.y = prev.y + dy * k;
        } else if (d < 0.01) {
          p.x = prev.x - sn.dir * 0.5;
        }
        prev = p;
        idx = p.next;
      }
    }
    for (const sn of this.snakes) {
      if (!sn.alive) continue;
      const h = this.parts[sn.head]!;
      this.x = h.x;
      this.y = h.y;
      break;
    }
  }

  private relocate(sn: Snake): void {
    const g = this.g;
    const head = this.parts[sn.head]!;
    sn.lane = 0;
    sn.dropping = false;
    sn.dir = g.player.x < 195 ? -1 : 1;
    head.x = sn.dir > 0 ? F.wallL + head.r + 2 : F.wallR - head.r - 2;
    head.y = laneY(0);
    let idx = head.next;
    while (idx >= 0) {
      const p = this.parts[idx]!;
      p.x = head.x - sn.dir * 0.5;
      p.y = head.y;
      p.px = p.x;
      p.py = p.y;
      idx = p.next;
    }
    head.px = head.x;
    head.py = head.y;
    g.sink.emit('bossArrive', head.x, head.y, 3, 0);
  }

  protected override onDamaged(p: BossPart): void {
    if (p.hp > 0 || !p.alive) return;
    const g = this.g;
    const f = g.formation;
    p.alive = false;
    g.sink.emit('bossShieldBreak', p.x, p.y, 2, 0);
    // wreck brick
    const col = f.colAtX(p.x);
    const k = Math.round((p.y - F.ceilY - G.cellH / 2) / G.cellH);
    if (col >= 0 && col < G.cols && k >= 0 && k < G.visibleRows - 1) {
      const r = f.rowAbsForDisplay(k);
      if (!f.occupied(col, r)) {
        const b = f.spawn('basic', col, r, S.wreckHp * this.hpMult);
        if (b) b.spawnT = 0.15;
      }
    }
    const sn = this.snakes[p.snake]!;
    const prevIdx = p.prev;
    const nextIdx = p.next;
    if (prevIdx >= 0) this.parts[prevIdx]!.next = -1;
    if (nextIdx >= 0) this.parts[nextIdx]!.prev = -1;
    if (prevIdx < 0) {
      // head died: next becomes head of the same snake
      if (nextIdx >= 0) {
        const nh = this.parts[nextIdx]!;
        nh.kind = PART_HEAD;
        nh.r = S.headR * 0.9;
        sn.head = nextIdx;
        sn.lane = Math.max(0, Math.round((nh.y - F.ceilY - G.cellH / 2) / G.cellH));
        sn.dropping = false;
      } else sn.alive = false;
    } else if (nextIdx >= 0) {
      // split: rear part becomes a new snake moving the other way
      const nh = this.parts[nextIdx]!;
      nh.kind = PART_HEAD;
      nh.r = S.headR * 0.9;
      const ns = new Snake();
      ns.head = nextIdx;
      ns.dir = -sn.dir;
      ns.lane = Math.max(0, Math.round((nh.y - F.ceilY - G.cellH / 2) / G.cellH));
      ns.spitT = sn.spitT * 0.5;
      const id = this.snakes.length;
      this.snakes.push(ns);
      let i = nextIdx;
      while (i >= 0) {
        this.parts[i]!.snake = id;
        i = this.parts[i]!.next;
      }
    }
    for (const s of this.snakes) {
      if (!s.alive) continue;
      let n = 0;
      let i = s.head;
      while (i >= 0) {
        if (this.parts[i]!.alive) n++;
        i = this.parts[i]!.next;
      }
      s.len = n;
      if (n === 0) s.alive = false;
    }
  }
}
