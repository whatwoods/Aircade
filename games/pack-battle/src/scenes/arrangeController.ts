// 整理阶段交互状态机：拿起 / 拖拽（惯性摆动）/ 落位（弹性）/ 旋转 / 合成 / 出售 / 购买
import { sfx } from '../audio/sfx.ts';
import { BAG, INPUT } from '../config.ts';
import { input } from '../core/input.ts';
import { clock } from '../core/loop.ts';
import { Spring, Spring2 } from '../core/spring.ts';
import { canPlace, conflictCells, type Occ } from '../game/grid.ts';
import { buy, canMerge, find, move, quickBuyDest, rotateInPlace, sell, sellValue, type Dest, type OpResult } from '../game/run.ts';
import { shapeOf, type Cell } from '../game/shapes.ts';
import { computeSynergy } from '../game/synergy.ts';
import type { ItemId, ItemInst, Link, Lv, Placed, Rot } from '../game/types.ts';
import { emit } from '../render/fx/particles.ts';
import { popup } from '../render/fx/popups.ts';
import { tier, vibrate } from '../render/fx/shake.ts';
import { C, drawGoldCoin } from '../render/kit.ts';
import { inRect, type BagRect } from '../render/layout.ts';
import { drawItemAt } from '../render/sprites.ts';
import { LOGO, text } from '../render/text.ts';
import { drawStamp, showToast } from '../render/ui/widgets.ts';
import { drawMergeGlow, drawPlacement, drawPulseDots, type Placement } from '../render/views/bagView.ts';
import { drawLinkCurve, linkKey, linkMid } from '../render/views/linkView.ts';
import { describe } from './describe.ts';
import type { GameScene } from './gameScene.ts';
import { HALF_PI, ItemView, stashCell } from './itemView.ts';

const CARD_UID = 1_000_000;
const TWO_PI = Math.PI * 2;

type Src = { kind: 'bag' | 'stash'; uid: number } | { kind: 'card'; slot: number };

type Zone =
  | { kind: 'none' }
  | { kind: 'bag'; x: number; y: number; ok: boolean; conflict: Cell[]; reason: string }
  | { kind: 'merge'; uid: number }
  | { kind: 'stash'; slot: number }
  | { kind: 'sell'; price: number; full: boolean };

interface Drag {
  src: Src;
  id: ItemId;
  lv: Lv;
  rot: Rot;
  /** 抓取点（rot0 连续格坐标） */
  u0: number;
  v0: number;
  pos: Spring2;
  tilt: Spring;
  scale: Spring;
  ang: Spring;
  cell: Spring;
  px: number;
  py: number;
  lpx: number;
  vxf: number;
  lift: number;
  zone: Zone;
  zoneKey: string;
  prevKey: string;
  prev: Link[];
  prevNew: Set<number>;
  lastCloth: number;
}

interface Flyer {
  id: ItemId;
  lv: Lv;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ang: number;
  cell: number;
  t: number;
  dur: number;
  spin: number;
  kind: 'sell' | 'absorb';
  target: number;
  big: boolean;
}

interface Returner {
  id: ItemId;
  lv: Lv;
  slot: number;
  pos: Spring2;
  cell: Spring;
  ang: Spring;
  scale: Spring;
  t: number;
}

interface Cross {
  x: number;
  y: number;
  t: number;
}

const TMP = { x: 0, y: 0 };

/** 连续格坐标：rot r → rot0（逆时针还原 r 次） */
function toRot0(id: ItemId, rot: Rot, u: number, v: number): [number, number] {
  let x = u;
  let y = v;
  for (let k = rot; k > 0; k--) {
    const W = shapeOf(id, k as Rot).w;
    const nx = y;
    const ny = W - x;
    x = nx;
    y = ny;
  }
  return [x, y];
}

/** 连续格坐标：rot0 → rot r（顺时针 r 次） */
function fromRot0(id: ItemId, rot: Rot, u: number, v: number): [number, number] {
  let x = u;
  let y = v;
  for (let k = 0; k < rot; k++) {
    const h = shapeOf(id, k as Rot).h;
    const nx = h - y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return [x, y];
}

/** 在 cur 附近找与 rot 对应的连续角度（最短路径） */
function nearAngle(cur: number, rot: Rot): number {
  const want = rot * HALF_PI;
  let d = (want - cur) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return cur + d;
}

export class ArrangeController {
  gs: GameScene;
  drag: Drag | null = null;
  private press: { src: Src | null; x: number; y: number } | null = null;
  private flyers: Flyer[] = [];
  private returners: Returner[] = [];
  private crosses: Cross[] = [];
  selected = 0;
  hoverCard = -1;
  private hoverKey = '';
  private hoverSince = 0;
  private lastTick = 0;

  constructor(gs: GameScene) {
    this.gs = gs;
  }

  // ---------- 查询 ----------

  isDragging(uid: number): boolean {
    const d = this.drag;
    return !!d && d.src.kind !== 'card' && d.src.uid === uid;
  }

  hiddenUid(): number {
    const d = this.drag;
    return d && d.src.kind !== 'card' ? d.src.uid : 0;
  }

  busy(): boolean {
    return !!this.drag || this.flyers.some((f) => f.kind === 'absorb');
  }

  previewing(): boolean {
    const z = this.drag?.zone;
    return !!z && z.kind === 'bag' && z.ok;
  }

  sellInfo(): { price: number; full: boolean } | null {
    const z = this.drag?.zone;
    return z && z.kind === 'sell' ? { price: z.price, full: z.full } : null;
  }

  stashHi(): number {
    const z = this.drag?.zone;
    return z && z.kind === 'stash' ? z.slot : -1;
  }

  selectedBow(): number {
    if (this.drag || !this.selected) return 0;
    const it = find(this.gs.run, this.selected);
    return it && it.zone === 'bag' && it.id === 'bow' ? it.uid : 0;
  }

  /** 逻辑坐标下的可拿起对象 */
  private srcAt(x: number, y: number): Src | null {
    const gs = this.gs;
    const L = gs.L;
    const g = L.bag;
    const cx = Math.floor((x - g.gx) / g.cell);
    const cy = Math.floor((y - g.gy) / g.cell);
    const occ: Occ = gs.syn.occ;
    const u = occ.get(cx, cy);
    if (u > 0) return { kind: 'bag', uid: u };
    for (let i = 0; i < L.stash.length; i++) {
      const it = gs.run.stash[i];
      if (it && inRect(L.stash[i], x, y, 3)) return { kind: 'stash', uid: it.uid };
    }
    const ci = gs.shopV.cardAt(L, x, y);
    if (ci >= 0 && gs.run.shop[ci]?.id) return { kind: 'card', slot: ci };
    return null;
  }

  pickableAt(x: number, y: number): boolean {
    return !!this.srcAt(x, y);
  }

  private srcId(s: Src): ItemId | null {
    if (s.kind === 'card') return this.gs.run.shop[s.slot]?.id ?? null;
    return find(this.gs.run, s.uid)?.id ?? null;
  }

  /** 引导门槛 */
  private allowed(s: Src): boolean {
    const t = this.gs.tut;
    if (!t.arranging) return true;
    const id = this.srcId(s);
    if (t.step === 1) return id === 'sword';
    if (t.step === 2) return id === 'whetstone';
    if (t.step === 3) return s.kind === 'bag';
    return true;
  }

  // ---------- 输入 ----------

  down(x: number, y: number): void {
    if (this.gs.tut.step === 6) this.gs.tut.stop();
    const s = this.srcAt(x, y);
    this.press = { src: s && this.allowed(s) ? s : null, x, y };
    if (!s) this.selected = 0;
  }

  cancelPress(): void {
    this.press = null;
  }

  long(x: number, y: number): void {
    const p = this.press;
    if (!p || !p.src) return;
    this.openDetailFor(p.src, x, y, true);
  }

  dragStart(_x: number, _y: number): void {
    const p = this.press;
    if (!p || !p.src || this.drag) return;
    const gs = this.gs;
    const run = gs.run;
    const L = gs.L;
    const s = p.src;
    const x0 = input.x0;
    const y0 = input.y0;
    let id: ItemId;
    let lv: Lv;
    let rot: Rot;
    let cell0: number;
    let gu: number;
    let gv: number;
    let ang0: number;
    let ox: number;
    let oy: number;
    if (s.kind === 'card') {
      const slot = run.shop[s.slot];
      if (!slot || !slot.id) return;
      if (run.gold < slot.price) {
        gs.shopV.shakeCard(s.slot);
        gs.gold.flash = -0.45;
        sfx('noGold');
        gs.showHint('sell');
        this.press = null;
        return;
      }
      id = slot.id;
      lv = 1;
      rot = 0;
      const box = gs.shopV.itemBox(L, s.slot, id);
      const sh = shapeOf(id, 0);
      cell0 = box.cell;
      ox = box.cx - (sh.w * cell0) / 2;
      oy = box.cy - (sh.h * cell0) / 2;
      gu = Math.max(0.3, Math.min(sh.w - 0.3, (x0 - ox) / cell0));
      gv = Math.max(0.3, Math.min(sh.h - 0.3, (y0 - oy) / cell0));
      ang0 = 0;
      gs.shopV.cards[s.slot].lifted = true;
      gs.shopV.bump(s.slot, 0.6);
    } else {
      const it = find(run, s.uid);
      const v = gs.views.get(s.uid);
      if (!it || !v) return;
      id = it.id;
      lv = it.lv;
      rot = it.rot;
      const sh = shapeOf(id, rot);
      if (it.zone === 'bag') {
        const g = gs.bagRect();
        cell0 = g.cell;
        ox = g.gx + v.pos.x * cell0;
        oy = g.gy + v.pos.y * cell0;
      } else {
        cell0 = v.cell.x;
        ox = v.pos.x - (sh.w * cell0) / 2;
        oy = v.pos.y - (sh.h * cell0) / 2;
      }
      gu = Math.max(0.15, Math.min(sh.w - 0.15, (x0 - ox) / cell0));
      gv = Math.max(0.15, Math.min(sh.h - 0.15, (y0 - oy) / cell0));
      ang0 = v.ang.x;
      v.hidden = true;
      this.selected = it.uid;
    }
    const [u0, v0] = toRot0(id, rot, gu, gv);
    const lift = input.touch ? INPUT.touchLift : 0;
    const gx0 = ox + gu * cell0;
    const gy0 = oy + gv * cell0;
    const d: Drag = {
      src: s, id, lv, rot, u0, v0,
      pos: new Spring2(45, 0.85, gx0, gy0),
      tilt: new Spring(13, 0.32, 0),
      scale: new Spring(22, 0.5, 1),
      ang: new Spring(28, 0.55, ang0),
      cell: new Spring(22, 0.7, cell0),
      px: input.x, py: input.y, lpx: input.x, vxf: 0, lift,
      zone: { kind: 'none' }, zoneKey: '', prevKey: '', prev: [], prevNew: new Set(), lastCloth: 0,
    };
    d.ang.target = nearAngle(ang0, rot);
    d.scale.target = 1.1;
    d.cell.target = L.bag.cell;
    d.pos.tx = input.x;
    d.pos.ty = input.y - lift;
    this.drag = d;
    sfx('pickup');
    vibrate(4);
    if (gs.tut.step === 6) gs.tut.stop();
    this.evalZone();
    this.showDragDetail();
  }

  dragMove(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    d.px = x;
    d.py = y;
    d.pos.tx = x;
    d.pos.ty = y - d.lift;
    this.evalZone();
  }

  up(x: number, y: number, tap: boolean): void {
    if (this.drag) {
      this.drop();
      this.press = null;
      return;
    }
    const p = this.press;
    this.press = null;
    if (!p || !tap || !p.src) return;
    const s = p.src;
    if (s.kind === 'card') this.openDetailFor(s, x, y, false);
    else this.tapRotate(s.uid);
  }

  /** 失焦 / pointercancel：拖拽弹回 */
  cancel(): void {
    this.press = null;
    if (this.drag) this.flyBack(false);
  }

  /** 第二指 / R / 右键 / 滚轮 */
  rotate(): void {
    const d = this.drag;
    if (d) {
      d.rot = ((d.rot + 1) % 4) as Rot;
      d.ang.target += HALF_PI;
      d.scale.v += 1.2;
      sfx('rotate');
      vibrate(4);
      this.evalZone();
      return;
    }
    if (input.touch) return;
    const s = this.srcAt(input.hx, input.hy);
    if (s && s.kind !== 'card' && this.allowed(s)) this.tapRotate(s.uid);
  }

  hover(x: number, y: number): void {
    const gs = this.gs;
    this.hoverCard = gs.shopV.cardAt(gs.L, x, y);
    if (this.hoverCard >= 0 && !gs.run.shop[this.hoverCard]?.id) this.hoverCard = -1;
    const s = this.srcAt(x, y);
    const key = s ? (s.kind === 'card' ? 'c' + s.slot : 'u' + s.uid) : '';
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.hoverSince = clock.real;
    }
  }

  // ---------- 操作 ----------

  private tapRotate(uid: number): void {
    const gs = this.gs;
    const v = gs.views.get(uid);
    const r = rotateInPlace(gs.run, uid);
    const it = find(gs.run, uid);
    if (!v || !it) return;
    this.selected = uid;
    if (r.ok) {
      v.rot = it.rot;
      v.ang.target += HALF_PI;
      v.scale.v += 1.4;
      if (it.zone === 'stash') v.cell.target = stashCell(it.id, it.rot);
      sfx('rotate');
      vibrate(4);
      gs.syncViews(false);
      gs.recompute(true);
      if (gs.tut.step === 3) gs.tut.go(4);
    } else {
      v.shakeT = 0.18;
      sfx('rotateFail');
      const g = gs.bagRect();
      v.center(g, TMP);
      showToast('放不下', TMP.x, TMP.y - 40, C.bad);
    }
    gs.showDetail(gs.detailFor(it), 2);
  }

  private openDetailFor(s: Src, x: number, y: number, peek: boolean): void {
    const gs = this.gs;
    const run = gs.run;
    if (s.kind === 'card') {
      const slot = run.shop[s.slot];
      if (!slot || !slot.id) return;
      const canM = !!this.mergeTargetForCard(slot.id);
      gs.openDetail({
        id: slot.id, lv: 1, d: null, shop: { slot: s.slot, price: slot.price, canMerge: canM, afford: run.gold >= slot.price },
        peek, fx: x, fy: y,
      });
    } else {
      const it = find(run, s.uid);
      if (!it) return;
      const d = it.zone === 'bag' ? gs.syn.derived.get(it.uid) ?? null : null;
      gs.openDetail({ id: it.id, lv: it.lv, d, sell: sellValue(run, it), peek, fx: x, fy: y });
    }
    sfx('page');
    vibrate(4);
  }

  private mergeTargetForCard(id: ItemId): ItemInst | null {
    const run = this.gs.run;
    for (const it of run.bag) if (it.id === id && it.lv === 1) return it;
    for (const it of run.stash) if (it && it.id === id && it.lv === 1) return it;
    return null;
  }

  /** 详情卡里的「购买」/「购买并合成」 */
  quickBuy(slot: number, merge: boolean): void {
    const gs = this.gs;
    const run = gs.run;
    const s = run.shop[slot];
    if (!s || !s.id) return;
    if (run.gold < s.price) {
      gs.shopV.shakeCard(slot);
      gs.gold.flash = -0.45;
      sfx('noGold');
      gs.showHint('sell');
      return;
    }
    const dest = quickBuyDest(run, slot, merge);
    if (!dest) {
      showToast('桌边已满', 195, gs.L.stashArea.y - 6, C.bad);
      sfx('noGold');
      gs.showHint('sell');
      return;
    }
    const id = s.id;
    const price = s.price;
    const box = gs.shopV.itemBox(gs.L, slot, id);
    const r = buy(run, slot, dest);
    if (!r.ok) {
      showToast(r.reason, 195, gs.L.stashArea.y - 6, C.bad);
      return;
    }
    this.afterBuy(slot, price, box.cx, box.cy);
    if (dest.zone === 'merge') {
      this.flyers.push({
        id, lv: 1, x0: box.cx, y0: box.cy, x1: 0, y1: 0, ang: 0, cell: box.cell, t: 0, dur: 0.22, spin: 0, kind: 'absorb', target: r.uid, big: false,
      });
      gs.syncViews(false);
      gs.recompute(true);
    } else {
      const it = find(run, r.uid)!;
      const v = new ItemView(it);
      gs.views.set(it.uid, v);
      v.pos.snap(box.cx, box.cy);
      v.cell.snap(box.cell);
      v.squashPending = true;
      gs.syncViews(false);
      sfx('drop', 0, 0.2);
    }
    this.markStashHint(dest);
  }

  private afterBuy(slot: number, price: number, cx: number, cy: number): void {
    const gs = this.gs;
    gs.setGold(gs.run.gold);
    gs.shopV.bump(slot, 1);
    gs.shopV.cards[slot].lifted = false;
    sfx('buy');
    tier('T1', false);
    const gr = gs.L.gold;
    popup('−' + price, gr.x + gr.w - 20, gr.y + gr.h / 2, '#ffb4a0', 20, { ui: true, life: 0.9, vy: -26 });
    gs.flyCoins(cx, cy, 2, false);
    emit('coin', cx, cy, 2, { speed: 90, life: 0.5 });
  }

  private markStashHint(dest: Dest): void {
    if (dest.zone === 'stash') this.gs.showHint('stash');
    if (this.gs.run.stash.every((x) => x)) this.gs.showHint('sell');
  }

  // ---------- 区域判定 ----------

  /** 拖拽件（rot 方向）抓取点 */
  private grab(d: Drag): [number, number] {
    return fromRot0(d.id, d.rot, d.u0, d.v0);
  }

  private evalZone(): void {
    const d = this.drag;
    if (!d) return;
    const gs = this.gs;
    const run = gs.run;
    const L = gs.L;
    const g = L.bag;
    const px = d.pos.tx;
    const py = d.pos.ty;
    const owned = d.src.kind !== 'card';
    const dragUid = d.src.kind === 'card' ? 0 : d.src.uid;
    let z: Zone = { kind: 'none' };
    const tutLock = gs.tut.arranging && gs.tut.step < 4;
    if (inRect(L.shop, px, py) && !inRect(L.stashArea, px, py)) {
      if (owned && !tutLock) {
        const it = find(run, dragUid);
        if (it) {
          const price = sellValue(run, it);
          z = { kind: 'sell', price, full: price >= it.value };
        }
      }
    } else if (inRect(g, px, py, g.cell * 0.35)) {
      const cx = Math.floor((px - g.gx) / g.cell);
      const cy = Math.floor((py - g.gy) / g.cell);
      const under = gs.syn.occ.get(cx, cy);
      let reason = '';
      let merged = false;
      if (under > 0 && under !== dragUid) {
        const tgt = find(run, under);
        if (tgt && tgt.id === d.id) {
          const m = canMerge({ id: d.id, lv: d.lv }, tgt);
          if (m === 'ok') {
            z = { kind: 'merge', uid: under };
            merged = true;
          } else reason = m === 'max' ? '已满级' : '需要同等级';
        }
      }
      if (!merged) {
        const [gu, gv] = this.grab(d);
        const tx = Math.round((px - g.gx) / g.cell - gu);
        const ty = Math.round((py - g.gy) / g.cell - gv);
        const occ = gs.syn.occ;
        const ok = canPlace(occ, d.id, d.rot, tx, ty, dragUid);
        z = { kind: 'bag', x: tx, y: ty, ok, conflict: ok ? [] : conflictCells(occ, d.id, d.rot, tx, ty, dragUid), reason };
      }
    } else if (inRect(L.stashArea, px, py)) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < L.stash.length; i++) {
        const r = L.stash[i];
        const dd = Math.abs(r.x + r.w / 2 - px);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      const occ = run.stash[best];
      if (!occ || occ.uid === dragUid) z = { kind: 'stash', slot: best };
      else if (occ.id === d.id && canMerge({ id: d.id, lv: d.lv }, occ) === 'ok') z = { kind: 'merge', uid: occ.uid };
      else if (d.src.kind === 'stash') z = { kind: 'stash', slot: best };
      else {
        const free = run.stash.findIndex((x) => x === null);
        z = free >= 0 ? { kind: 'stash', slot: free } : { kind: 'none' };
      }
    }
    const key = z.kind === 'bag' ? `b${z.x},${z.y},${d.rot},${z.ok ? 1 : 0}` : z.kind === 'merge' ? 'm' + z.uid : z.kind === 'stash' ? 's' + z.slot : z.kind;
    if (key !== d.zoneKey) {
      const prevKind = d.zone.kind;
      d.zoneKey = key;
      d.zone = z;
      const now = clock.real;
      if (z.kind === 'bag' && z.ok && now - this.lastTick > 0.08) {
        sfx('tick');
        this.lastTick = now;
      } else if (z.kind === 'merge') {
        sfx('mergeHover');
        const v = gs.views.get(z.uid);
        if (v) {
          v.center(gs.bagRect(), TMP);
          emit('star', TMP.x, TMP.y - 10, 3, { color: C.goldLight, speed: 50, life: 0.6 });
        }
      } else if (z.kind === 'sell' && prevKind !== 'sell') {
        sfx('sellHover');
      } else if (z.kind === 'stash' && now - this.lastTick > 0.08) {
        sfx('tick');
        this.lastTick = now;
      }
      this.updatePreview();
    }
  }

  /** 假设放在这里：重算连线（只有格子或朝向变化时） */
  private updatePreview(): void {
    const d = this.drag;
    if (!d) return;
    const z = d.zone;
    if (z.kind !== 'bag' || !z.ok) {
      d.prev = [];
      d.prevKey = '';
      return;
    }
    const k = `${z.x},${z.y},${d.rot}`;
    if (k === d.prevKey) return;
    d.prevKey = k;
    const gs = this.gs;
    const dragUid = d.src.kind === 'card' ? CARD_UID : d.src.uid;
    const items: Placed[] = [];
    for (const it of gs.run.bag) if (it.uid !== dragUid) items.push(it);
    items.push({ uid: dragUid, id: d.id, lv: d.lv, rot: d.rot, x: z.x, y: z.y });
    const syn = computeSynergy(items, BAG.cols, BAG.rows);
    const cur = new Set<string>();
    for (const l of gs.syn.links) cur.add(linkKey(l));
    d.prev = syn.links.filter((l) => l.from === dragUid || l.to === dragUid);
    d.prevNew = new Set(d.prev.filter((l) => !cur.has(linkKey(l))).map((l) => l.id));
  }

  // ---------- 落下 ----------

  /** 拖拽件的视觉中心（逻辑像素） */
  private dragCenter(d: Drag, out: { x: number; y: number }): void {
    const s0 = shapeOf(d.id, 0);
    const cell = d.cell.x * d.scale.x;
    const ox = (s0.w / 2 - d.u0) * cell;
    const oy = (s0.h / 2 - d.v0) * cell;
    const a = d.ang.x + d.tilt.x;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.x = d.pos.x + ox * c - oy * s;
    out.y = d.pos.y + ox * s + oy * c;
  }

  /** 把拖拽表现交接给装备视图，保证位置 / 角度 / 倾斜 / 缩放连续 */
  private handOff(d: Drag, v: ItemView, it: ItemInst, flyBack: boolean): void {
    const gs = this.gs;
    this.dragCenter(d, TMP);
    v.hidden = false;
    v.id = it.id;
    v.lv = it.lv;
    v.rot = it.rot;
    v.zone = it.zone;
    const sh = shapeOf(it.id, it.rot);
    if (it.zone === 'bag') {
      const g = gs.bagRect();
      v.pos.x = (TMP.x - g.gx) / g.cell - sh.w / 2;
      v.pos.y = (TMP.y - g.gy) / g.cell - sh.h / 2;
      v.pos.tx = it.x;
      v.pos.ty = it.y;
      v.cell.snap(g.cell);
    } else {
      const r = gs.L.stash[it.slot];
      v.pos.x = TMP.x;
      v.pos.y = TMP.y;
      v.pos.tx = r.x + r.w / 2;
      v.pos.ty = r.y + r.h / 2;
      v.cell.x = d.cell.x;
      v.cell.v = 0;
      v.cell.target = stashCell(it.id, it.rot);
    }
    v.pos.vx = 0;
    v.pos.vy = 0;
    if (flyBack) v.pos.set(18, 0.75);
    else v.pos.set(26, 0.42);
    v.ang.x = d.ang.x;
    v.ang.v = d.ang.v;
    v.ang.target = nearAngle(d.ang.target, it.rot);
    v.tilt.x = d.tilt.x;
    v.tilt.v = d.tilt.v;
    v.tilt.target = 0;
    v.scale.x = d.scale.x;
    v.scale.v = 0;
    v.scale.target = 1;
    v.squashPending = !flyBack;
  }

  private drop(): void {
    const d = this.drag;
    if (!d) return;
    const gs = this.gs;
    const run = gs.run;
    const z = d.zone;
    const isCard = d.src.kind === 'card';
    const slot = d.src.kind === 'card' ? d.src.slot : -1;
    const price = isCard ? run.shop[slot]?.price ?? 0 : 0;
    const box = isCard ? gs.shopV.itemBox(gs.L, slot, d.id) : null;
    let dest: Dest | null = null;
    if (z.kind === 'bag' && z.ok) dest = { zone: 'bag', x: z.x, y: z.y, rot: d.rot };
    else if (z.kind === 'stash') dest = { zone: 'stash', slot: z.slot, rot: d.rot };
    else if (z.kind === 'merge') dest = { zone: 'merge', uid: z.uid };
    if (z.kind === 'sell' && d.src.kind !== 'card') {
      this.doSell(d, d.src.uid);
      return;
    }
    if (!dest) {
      if (z.kind === 'bag') {
        const g = gs.bagRect();
        const sh = shapeOf(d.id, d.rot);
        this.crosses.push({ x: g.gx + (z.x + sh.w / 2) * g.cell, y: g.gy + (z.y + sh.h / 2) * g.cell, t: 0 });
        if (z.reason) showToast(z.reason, 195, g.y - 4, C.bad);
        if (gs.tut.step === 2 && d.id === 'whetstone') gs.tut.wrong = true;
      }
      this.flyBack(true);
      return;
    }
    let r: OpResult;
    if (d.src.kind === 'card') r = buy(run, slot, dest);
    else r = move(run, d.src.uid, dest);
    if (!r.ok) {
      showToast(r.reason, 195, gs.L.bag.y - 4, C.bad);
      this.flyBack(true);
      return;
    }
    this.drag = null;
    if (isCard && box) this.afterBuy(slot, price, box.cx, box.cy);
    if (dest.zone === 'merge') {
      this.dragCenter(d, TMP);
      if (d.src.kind !== 'card') gs.views.delete(d.src.uid);
      this.flyers.push({
        id: d.id, lv: d.lv, x0: TMP.x, y0: TMP.y, x1: 0, y1: 0, ang: d.ang.x, cell: d.cell.x * d.scale.x, t: 0, dur: 0.14, spin: 0, kind: 'absorb', target: r.uid, big: false,
      });
      gs.syncViews(false);
      gs.recompute(true);
      this.afterAction(d.id, dest);
      return;
    }
    const it = find(run, r.uid)!;
    let v = gs.views.get(it.uid);
    if (!v) {
      v = new ItemView(it);
      gs.views.set(it.uid, v);
    }
    this.handOff(d, v, it, false);
    gs.syncViews(false);
    gs.recompute(true);
    sfx('drop');
    tier('T1', false);
    vibrate(8);
    if (it.zone === 'bag') {
      const g = gs.bagRect();
      const sh = shapeOf(it.id, it.rot);
      const bx = g.gx + it.x * g.cell;
      const by = g.gy + (it.y + sh.h) * g.cell;
      emit('dust', bx + 4, by - 2, 3, { speed: 40, life: 0.5, angle: -Math.PI * 0.75, spread: 0.6 });
      emit('dust', bx + sh.w * g.cell - 4, by - 2, 3, { speed: 40, life: 0.5, angle: -Math.PI * 0.25, spread: 0.6 });
    }
    this.afterAction(d.id, dest);
  }

  /** 引导推进 / 情境提示 */
  private afterAction(id: ItemId, dest: Dest): void {
    const gs = this.gs;
    const t = gs.tut;
    if (t.step === 1 && id === 'sword' && dest.zone === 'bag') t.go(2);
    else if (t.step === 2 && id === 'whetstone') {
      if (dest.zone === 'bag') {
        const sword = gs.run.bag.find((x) => x.id === 'sword');
        const ws = gs.run.bag.find((x) => x.id === 'whetstone');
        const linked = !!sword && !!ws && gs.syn.links.some((l) => l.from === ws.uid && l.to === sword.uid);
        if (linked) {
          t.wrong = false;
          t.praise = 1.4;
        } else t.wrong = true;
      } else t.wrong = true;
    }
    this.markStashHint(dest);
  }

  private doSell(d: Drag, uid: number): void {
    const gs = this.gs;
    const rec = sell(gs.run, uid, clock.real);
    this.drag = null;
    if (!rec) {
      this.flyBack(true);
      return;
    }
    this.dragCenter(d, TMP);
    const L = gs.L;
    const tx = L.shop.x + L.shop.w / 2;
    const ty = L.shop.y + 40;
    this.flyers.push({
      id: d.id, lv: d.lv, x0: TMP.x, y0: TMP.y, x1: tx, y1: ty, ang: d.ang.x, cell: d.cell.x * d.scale.x, t: 0, dur: 0.32, spin: TWO_PI, kind: 'sell', target: 0, big: false,
    });
    gs.views.delete(uid);
    if (this.selected === uid) this.selected = 0;
    gs.syncViews(false);
    gs.recompute(true);
    gs.setGold(gs.run.gold);
    gs.sellRecord(rec);
    popup('+' + rec.price + ' 金', tx, ty - 10, C.goldLight, 24, { cn: true, life: 1, vy: -50, delay: 0.25 });
    gs.flyCoins(tx, ty, Math.min(5, Math.max(1, rec.price)), true);
    sfx('sell');
    tier('T1', false);
    vibrate(6);
  }

  /** 弹回原处（卡片回到摊位） */
  private flyBack(withSound: boolean): void {
    const d = this.drag;
    if (!d) return;
    const gs = this.gs;
    this.drag = null;
    if (withSound) sfx('cancel');
    if (d.src.kind === 'card') {
      const box = gs.shopV.itemBox(gs.L, d.src.slot, d.id);
      this.dragCenter(d, TMP);
      const r: Returner = {
        id: d.id, lv: d.lv, slot: d.src.slot,
        pos: new Spring2(18, 0.75, TMP.x, TMP.y),
        cell: new Spring(18, 0.75, d.cell.x),
        ang: new Spring(18, 0.75, d.ang.x),
        scale: new Spring(18, 0.75, d.scale.x),
        t: 0,
      };
      r.pos.tx = box.cx;
      r.pos.ty = box.cy;
      r.cell.target = box.cell;
      r.ang.target = nearAngle(d.ang.x, 0);
      r.scale.target = 1;
      this.returners.push(r);
      return;
    }
    const it = find(gs.run, d.src.uid);
    const v = gs.views.get(d.src.uid);
    if (it && v) this.handOff(d, v, it, true);
  }

  // ---------- 更新 / 物理 ----------

  update(dt: number): void {
    const gs = this.gs;
    const d = this.drag;
    if (d) {
      // 50ms 低通的水平速度
      const vx = dt > 0 ? (d.px - d.lpx) / dt : 0;
      d.lpx = d.px;
      d.vxf += (vx - d.vxf) * (1 - Math.exp(-dt / 0.05));
      d.tilt.target = Math.max(-0.32, Math.min(0.32, d.vxf * 0.0011));
      const z = d.zone;
      d.cell.target = z.kind === 'stash' ? stashCell(d.id, d.rot) : gs.L.bag.cell;
      if (Math.abs(d.vxf) > 900 && clock.real - d.lastCloth > 0.35) {
        d.lastCloth = clock.real;
        sfx('cloth');
      }
      if (gs.detail) gs.detail.until = clock.real + 0.5;
    } else if (!input.touch && this.hoverKey && clock.real - this.hoverSince > 0.3 && !gs.ov.active) {
      // 鼠标悬停 300ms：详情条
      const s = this.srcAt(input.hx, input.hy);
      if (s) {
        if (s.kind === 'card') {
          const id = gs.run.shop[s.slot]?.id;
          if (id) gs.showDetail(describe(id, 1), 0.4);
        } else {
          const it = find(gs.run, s.uid);
          if (it) gs.showDetail(gs.detailFor(it), 0.4);
        }
      }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt / f.dur;
      if (f.t >= 1) {
        this.flyers.splice(i, 1);
        if (f.kind === 'absorb') this.mergeFx(f.target);
      }
    }
    for (let i = this.returners.length - 1; i >= 0; i--) {
      const r = this.returners[i];
      r.t += dt;
      if (r.t > 0.7 || (r.t > 0.15 && r.pos.settled(0.8))) {
        this.returners.splice(i, 1);
        const c = gs.shopV.cards[r.slot];
        if (c) c.lifted = false;
        gs.shopV.bump(r.slot, 0.5);
      }
    }
    for (let i = this.crosses.length - 1; i >= 0; i--) {
      this.crosses[i].t += dt;
      if (this.crosses[i].t > 0.55) this.crosses.splice(i, 1);
    }
  }

  step(h: number): void {
    const d = this.drag;
    if (d) {
      d.pos.step(h);
      d.tilt.step(h);
      d.scale.step(h);
      d.ang.step(h);
      d.cell.step(h);
    }
    for (const r of this.returners) {
      r.pos.step(h);
      r.cell.step(h);
      r.ang.step(h);
      r.scale.step(h);
    }
  }

  /** 合成落定：目标压扁弹回 + 白闪 + 星级印章 */
  private mergeFx(uid: number): void {
    const gs = this.gs;
    const v = gs.views.get(uid);
    const it = find(gs.run, uid);
    if (!v || !it) return;
    v.lv = it.lv;
    v.scale.x = 0.85;
    v.scale.v = 9;
    v.scale.target = 1;
    v.flash = 0.12;
    v.center(it.zone === 'bag' ? gs.bagRect() : null, TMP);
    const three = it.lv >= 3;
    popup(three ? '★★★' : '★★', TMP.x, TMP.y - 18, three ? C.goldLight : '#fff3c4', three ? 34 : 28, { life: 1.1, vy: -36 });
    emit('star', TMP.x, TMP.y, three ? 14 : 8, { color: C.goldLight, speed: 150, life: 0.7 });
    emit('confetti', TMP.x, TMP.y, three ? 16 : 10, { color: three ? C.gold : undefined, speed: 160, life: 0.9 });
    sfx(three ? 'merge3' : 'merge2');
    tier(three ? 'T3' : 'T2', false);
    gs.recompute(true, false);
    gs.showDetail(gs.detailFor(it), 2);
  }

  private showDragDetail(): void {
    const d = this.drag;
    if (!d) return;
    const gs = this.gs;
    if (d.src.kind === 'card') gs.showDetail(describe(d.id, 1), 1);
    else {
      const it = find(gs.run, d.src.uid);
      if (it) gs.showDetail(gs.detailFor(it), 1);
    }
  }

  reset(): void {
    const d = this.drag;
    if (d) {
      if (d.src.kind === 'card') {
        const c = this.gs.shopV.cards[d.src.slot];
        if (c) c.lifted = false;
      } else {
        const v = this.gs.views.get(d.src.uid);
        if (v) v.hidden = false;
      }
    }
    for (const r of this.returners) {
      const c = this.gs.shopV.cards[r.slot];
      if (c) c.lifted = false;
    }
    for (const f of this.flyers) if (f.kind === 'absorb') this.mergeFx(f.target);
    this.drag = null;
    this.press = null;
    this.flyers.length = 0;
    this.returners.length = 0;
    this.crosses.length = 0;
    this.selected = 0;
  }

  // ---------- 绘制 ----------

  /** 背包内、装备下方：落点预览 */
  drawUnder(ctx: CanvasRenderingContext2D, g: BagRect, time: number): void {
    const d = this.drag;
    const gs = this.gs;
    // 引导第 2 步：剑周围的相邻空格
    if (gs.tut.step === 2 && gs.tut.praise <= 0) {
      const sword = gs.run.bag.find((x) => x.id === 'sword');
      if (sword) drawPulseDots(ctx, g, emptyAround(sword, gs.syn.occ), time);
    }
    if (!d) return;
    const z = d.zone;
    if (z.kind === 'bag') {
      const p: Placement = { id: d.id, rot: d.rot, x: z.x, y: z.y, ok: z.ok, conflict: z.conflict };
      drawPlacement(ctx, g, p, time);
    }
  }

  /** 拖拽预览连线（虚线、呼吸） */
  drawPreviewLinks(ctx: CanvasRenderingContext2D, g: BagRect, time: number): void {
    const d = this.drag;
    if (!d) return;
    this.gs.links.draw(ctx, g, time, 1, this.hiddenUid());
    const breath = 0.5 + 0.18 * Math.sin(time * 6);
    for (const l of d.prev) {
      drawLinkCurve(ctx, g, l, time, breath, 1, 1, true, false);
      if (d.prevNew.has(l.id)) {
        linkMid(g, l, TMP);
        text(ctx, l.label, TMP.x, TMP.y - 12, { size: 12, weight: 900, color: '#fff3c4', stroke: 'rgba(43,29,20,0.85)', strokeW: 3 });
      }
    }
  }

  /** 最上层：合成目标高亮、拖拽件、飞行件、红叉 */
  drawTop(ctx: CanvasRenderingContext2D, time: number): void {
    const gs = this.gs;
    const g = gs.bagRect();
    const d = this.drag;
    for (const c of this.crosses) drawCross(ctx, c.x, c.y, c.t);
    for (const r of this.returners) {
      ctx.save();
      ctx.translate(r.pos.x, r.pos.y);
      ctx.scale(r.scale.x, r.scale.x);
      drawItemAt(ctx, r.id, r.lv, r.ang.x, 0, 0, r.cell.x, 'tile', r.cell.x < 40);
      ctx.restore();
    }
    for (const f of this.flyers) {
      let x1 = f.x1;
      let y1 = f.y1;
      if (f.kind === 'absorb') {
        const v = gs.views.get(f.target);
        const it = find(gs.run, f.target);
        if (v && it) {
          v.center(it.zone === 'bag' ? g : null, TMP);
          x1 = TMP.x;
          y1 = TMP.y;
        }
      }
      const k = f.kind === 'sell' ? f.t * f.t * f.t : f.t * f.t;
      const x = f.x0 + (x1 - f.x0) * k;
      const y = f.y0 + (y1 - f.y0) * k - (f.kind === 'sell' ? Math.sin(f.t * Math.PI) * 40 : 0);
      const s = 1 - 0.8 * f.t;
      ctx.save();
      ctx.globalAlpha *= f.kind === 'sell' ? 1 - f.t * 0.5 : 1;
      ctx.translate(x, y);
      ctx.scale(s, s);
      drawItemAt(ctx, f.id, f.lv, f.ang + f.spin * f.t, 0, 0, f.cell, 'tile', f.cell < 40);
      ctx.restore();
    }
    if (d) {
      this.drawDrag(ctx, d);
      this.drawDragCues(ctx, d, g, time);
    }
  }

  /** 拖拽件的视觉中心与顶边（考虑旋转、倾斜和缩放） */
  private dragBox(d: Drag): { cx: number; cy: number; top: number } {
    const s0 = shapeOf(d.id, 0);
    const cell = d.cell.x;
    const ox = (s0.w / 2 - d.u0) * cell;
    const oy = (s0.h / 2 - d.v0) * cell;
    const a = d.ang.x + d.tilt.x;
    const sc = d.scale.x;
    const cx = d.pos.x + (Math.cos(a) * ox - Math.sin(a) * oy) * sc;
    const cy = d.pos.y + (Math.sin(a) * ox + Math.cos(a) * oy) * sc;
    const sh = shapeOf(d.id, d.rot);
    return { cx, cy, top: cy - (sh.h * cell * sc) / 2 };
  }

  /** 落点反馈画在拖拽件之上：触屏上抬后拖拽件正好盖住吸附格 */
  private drawDragCues(ctx: CanvasRenderingContext2D, d: Drag, g: BagRect, time: number): void {
    const z = d.zone;
    const gs = this.gs;
    if (z.kind === 'bag') {
      ctx.save();
      ctx.globalAlpha *= 0.9;
      drawPlacement(ctx, g, { id: d.id, rot: d.rot, x: z.x, y: z.y, ok: z.ok, conflict: z.conflict }, time);
      ctx.restore();
      if (!z.ok) {
        const b = this.dragBox(d);
        const sh = shapeOf(d.id, d.rot);
        const out = z.x < 0 || z.y < 0 || z.x + sh.w > BAG.cols || z.y + sh.h > BAG.rows;
        this.drawCueTag(ctx, b.cx, b.top - 8, '✕ ' + (z.reason || (out ? '超出背包 · 松手飞回' : '位置被占 · 松手飞回')), '#c2402c');
      }
    } else if (z.kind === 'merge') {
      const it = find(gs.run, z.uid);
      if (it) {
        if (it.zone === 'bag') drawMergeGlow(ctx, g, it, time);
        const b = this.dragBox(d);
        drawStamp(ctx, it.lv >= 2 ? '合成 ★★★' : '合成 ★★', b.cx, Math.max(30, b.top - 22), 16, C.wax, -0.08, 1, 1 + 0.04 * Math.sin(time * 9));
      }
    }
  }

  private drawCueTag(ctx: CanvasRenderingContext2D, cx: number, by: number, label: string, color: string): void {
    ctx.save();
    let tw = 0;
    for (const ch of label) tw += ch.charCodeAt(0) > 255 ? 13 : 7;
    const w = Math.min(300, tw + 24);
    const h = 26;
    const x = Math.max(8, Math.min(382 - w, cx - w / 2));
    const y = Math.max(8, by - h);
    ctx.fillStyle = 'rgba(43,29,20,0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, label, x + w / 2, y + h / 2 + 1, { size: 13, weight: 900, color: '#ffb59e' });
  }

  private drawDrag(ctx: CanvasRenderingContext2D, d: Drag): void {
    const s0 = shapeOf(d.id, 0);
    const cell = d.cell.x;
    const ox = (s0.w / 2 - d.u0) * cell;
    const oy = (s0.h / 2 - d.v0) * cell;
    const small = cell < 40;
    const lift = Math.max(0, d.scale.x - 1) * 10;
    // 阴影：拿起越高越远越淡
    ctx.save();
    ctx.globalAlpha *= 0.38;
    ctx.translate(d.pos.x + 4 + lift * 6, d.pos.y + 8 + lift * 9);
    ctx.rotate(d.tilt.x);
    ctx.scale(d.scale.x * 1.02, d.scale.x * 1.02);
    ctx.rotate(d.ang.x);
    drawItemAt(ctx, d.id, d.lv, 0, ox, oy, cell, 'shadow');
    ctx.restore();
    ctx.save();
    ctx.translate(d.pos.x, d.pos.y);
    ctx.rotate(d.tilt.x);
    ctx.scale(d.scale.x, d.scale.x);
    ctx.rotate(d.ang.x);
    // 有落点时拖拽件半透明，露出下面的格子
    const over = d.zone.kind === 'bag' || d.zone.kind === 'merge';
    if (over) ctx.globalAlpha *= 0.72;
    drawItemAt(ctx, d.id, d.lv, 0, ox, oy, cell, 'tile', small);
    if (over) ctx.globalAlpha /= 0.72;
    if (d.zone.kind === 'sell') {
      ctx.globalAlpha *= 0.35;
      drawItemAt(ctx, d.id, d.lv, 0, ox, oy, cell, 'gray');
    }
    ctx.restore();
    if (d.zone.kind === 'sell') this.drawSellTag(ctx, d, ox, oy, d.zone.price, d.zone.full);
  }

  /** 出售价签：挂在拖拽件正上方，永远不被手指和装备挡住 */
  private drawSellTag(ctx: CanvasRenderingContext2D, d: Drag, ox: number, oy: number, price: number, full: boolean): void {
    const a = d.ang.x + d.tilt.x;
    const sc = d.scale.x;
    const cx = d.pos.x + (Math.cos(a) * ox - Math.sin(a) * oy) * sc;
    const cy = d.pos.y + (Math.sin(a) * ox + Math.cos(a) * oy) * sc;
    const sh = shapeOf(d.id, d.rot);
    const w = 128;
    const h = full ? 52 : 40;
    const x = Math.max(8, Math.min(382 - w, cx - w / 2));
    const y = Math.max(this.gs.L.shop.y - 60, cy - (sh.h * d.cell.x * sc) / 2 - h - 10);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-0.03);
    ctx.fillStyle = 'rgba(43,29,20,0.9)';
    ctx.strokeStyle = '#ff9a80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    const ty = full ? -6 : 0;
    text(ctx, '出售', -30, ty - 1, { size: 18, weight: 900, color: C.paper });
    drawGoldCoin(ctx, 4, ty - 1, 9);
    text(ctx, '+' + price, 17, ty + 1, { size: 24, family: LOGO, color: C.goldLight, align: 'left' });
    if (full) text(ctx, '刚买的 · 全额退款', 0, ty + 21, { size: 10, weight: 700, color: C.chalk });
    ctx.restore();
  }
}

function emptyAround(it: Placed, occ: Occ): Cell[] {
  const s = shapeOf(it.id, it.rot);
  const out: Cell[] = [];
  const seen = new Set<number>();
  for (const [cx, cy] of s.cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = it.x + cx + dx;
      const y = it.y + cy + dy;
      if (occ.get(x, y) !== 0) continue;
      const k = y * 100 + x;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([x, y]);
    }
  }
  return out;
}

function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const a = t < 0.1 ? t / 0.1 : Math.max(0, 1 - (t - 0.25) / 0.3);
  const s = 14 * (t < 0.1 ? 0.6 + 4 * t : 1);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.strokeStyle = '#c2402c';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.9);
  ctx.lineTo(x + s * 0.95, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s * 0.9, y + s * 0.95);
  ctx.stroke();
  ctx.restore();
}

