// 宣传片镜头：每个镜头 = 摆局面 + 按帧排动作。坐标一律 CSS 像素（390×844 视口）。
// 素材镜头比成片里用到的长，入出点在 edit.json 里挑。
import type { Page } from 'playwright-core';

export interface Ctx {
  page: Page;
  g<A, R>(fn: (a: A) => R | Promise<R>, arg?: A): Promise<R>;
  /** 页面里执行一段代码；可用 G = window.__game、F = window.__film */
  game<R = unknown>(code: string): Promise<R>;
}

export interface Shot {
  name: string;
  seed?: number;
  /** 视口（CSS 像素），默认 390×844 */
  viewport?: { w: number; h: number };
  dpr?: number;
  run(c: Ctx): Promise<void>;
}

type R = { x: number; y: number; w: number; h: number };
interface ItemS {
  uid: number;
  id: string;
  lv: number;
  rot: number;
  x: number;
  y: number;
}

/** 形状按 rot 次顺时针旋转（与 src/game/shapes.ts 一致性由 grabCell 的实测校验兜底） */
function rotShape(shape: string[], rot: number): string[] {
  let g = shape.map((r) => r.split(''));
  for (let k = 0; k < rot; k++) {
    const h = g.length;
    const w = g[0].length;
    const n: string[][] = [];
    for (let x = 0; x < w; x++) {
      const row: string[] = [];
      for (let y = h - 1; y >= 0; y--) row.push(g[y][x]);
      n.push(row);
    }
    g = n;
  }
  return g.map((r) => r.join(''));
}

async function state(c: Ctx): Promise<{ bag: ItemS[]; stash: (ItemS | null)[]; phase: string; gold: number }> {
  return c.game(`return G.state();`);
}

/**
 * 把一件装备（背包或暂存里的 uid）拖到背包格 (tx, ty)：抓它形状里第一个实心格，
 * 松手点 = 目标格中心 + 触屏抬升。frames 是移动用的帧数。
 */
export async function dragItem(
  c: Ctx,
  uid: number,
  tx: number,
  ty: number,
  o: { frames?: number; arc?: number; hold?: number; after?: number; rotateAt?: number[]; grab?: [number, number]; land?: [number, number] } = {},
): Promise<void> {
  const st = await state(c);
  const it = [...st.bag, ...st.stash].find((x) => x && x.uid === uid) as ItemS | undefined;
  if (!it) throw new Error('没有装备 uid ' + uid);
  const items = await c.game<Record<string, { shape: string[] }>>(`return G.items();`);
  const sh = rotShape(items[it.id].shape, it.rot);
  const w = sh[0].length;
  const r = await c.game<R>(`return G.itemRect(${uid});`);
  const cw = r.w / w;
  let gc: [number, number] = o.grab ?? [0, 0];
  if (!o.grab) {
    outer: for (let y = 0; y < sh.length; y++)
      for (let x = 0; x < w; x++)
        if (sh[y][x] === '#') {
          gc = [x, y];
          break outer;
        }
  }
  const px = r.x + (gc[0] + 0.5) * cw;
  const py = r.y + (gc[1] + 0.5) * (r.h / sh.length);
  const land = o.land ?? gc;
  const cell = await c.game<R>(`return G.cell(${tx + land[0]}, ${ty + land[1]});`);
  const lift = 48 * (cell.w / cell.w); // 逻辑 48 = CSS 48（390 宽时 stage.s = 1）
  const qx = cell.x + cell.w / 2;
  const qy = cell.y + cell.h / 2 + lift;
  const frames = o.frames ?? 24;
  await c.game(`await F.press(${px}, ${py}, ${o.hold ?? 5});`);
  // 沿二次曲线分段走，在 rotateAt 的进度点各转一次
  const marks = [...(o.rotateAt ?? []), 1];
  let done = 0;
  let prev = 0;
  for (const m of marks) {
    const n = Math.round(frames * m) - done;
    const arc = (o.arc ?? 30) * (m - prev);
    await c.game(`await F.moveTo(${px + (qx - px) * m}, ${py + (qy - py) * m}, ${Math.max(1, n)}, ${arc});${m < 1 ? ' F.rotate();' : ''}`);
    done += n;
    prev = m;
  }
  await c.game(`await F.release(${o.after ?? 10});`);
}

/** 拖一张商店卡到背包格 (tx, ty)（只支持 rot 0） */
export async function dragCard(c: Ctx, slot: number, tx: number, ty: number, o: { frames?: number; arc?: number; after?: number } = {}): Promise<void> {
  const r = await c.game<R>(`return G.shopSlot(${slot});`);
  const px = r.x + r.w / 2;
  const py = r.y + r.h * 0.42;
  const cell = await c.game<R>(`return G.cell(${tx}, ${ty});`);
  await c.game(`await F.press(${px}, ${py}, 5);`);
  await c.game(`await F.moveTo(${cell.x + cell.w / 2}, ${cell.y + cell.h / 2 + 48}, ${o.frames ?? 24}, ${o.arc ?? 30});`);
  await c.game(`await F.release(${o.after ?? 10});`);
}

export async function uidOf(c: Ctx, id: string, zone: 'bag' | 'stash' = 'stash'): Promise<number> {
  const st = await state(c);
  const list = zone === 'bag' ? st.bag : st.stash;
  const it = list.find((x) => x && x.id === id);
  if (!it) throw new Error(`${zone} 里没有 ${id}`);
  return it.uid;
}

export async function report(c: Ctx, tag: string): Promise<void> {
  const st = await state(c);
  console.log(`  [${tag}] phase=${st.phase} gold=${st.gold} bag=` + st.bag.map((i) => `${i.id}${'★'.repeat(i.lv)}@${i.x},${i.y}r${i.rot}`).join(' '));
}

/** 点一个界面按钮（G.ui() 里的 id） */
async function tapUi(c: Ctx, id: string, after = 8): Promise<void> {
  const r = await c.game<R | undefined>(`return G.ui().find((u) => u.id === ${JSON.stringify(id)});`);
  if (!r) throw new Error('没有按钮 ' + id);
  await c.game(`await F.tap(${r.x + r.w / 2}, ${r.y + r.h / 2}, ${after});`);
}

/** 点开战 → 战斗开始后切倍速 → 录到结算后 tail 帧（或到 maxSec 为止） */
async function fight(c: Ctx, o: { speed?: number; tail?: number; maxFrames?: number } = {}): Promise<void> {
  await tapUi(c, 'btn.fight', 2);
  let set = false;
  for (let f = 0; f < (o.maxFrames ?? 1500); f += 6) {
    const ph = await c.game<string>(`await F.step(6); return G.state().phase;`);
    if (!set && ph === 'battle') {
      await c.game(`G.speed(${o.speed ?? 2});`);
      set = true;
    }
    if (ph === 'result') break;
  }
  await c.game(`await F.step(${o.tail ?? 60});`);
}

const SHOP_FILL = `G.setShop(['axe', 'potion', 'moonstone', 'kris', 'cauldron']);`;

/** 镜头 1–2、10–11：第 10 轮古龙，龙炎打到见底 → 凤凰复活 → 反杀（scripts/trailer/find-boss.ts 挑的背包） */
const BOSS_BAG = {
  layout: ['.SWWAA', 'DSWWA.', 'GSM.AF', 'GLLLIF', 'PPLOIF'],
  legend: {
    S: 'sword:3', W: 'buckler:2', A: 'axe:2', D: 'dagger:2', G: 'glove:2', M: 'whetstone:3', L: 'leather',
    I: 'helmet', O: 'moonstone', P: 'potion:2', F: 'phoenix',
  },
};

function foe(round: number): Shot {
  return {
    name: 'foe' + round,
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(${round}, 'mid'); await F.idle(90);`);
      await c.game(`await F.begin('foe${round}', 40);`);
      await c.game(`await F.step(6);`);
      await fight(c, { speed: 2, tail: 30, maxFrames: 1200 });
      await c.game(`return await F.end();`);
    },
  };
}

export const SHOTS: Shot[] = [
  {
    // 镜头 3–5：只有一把铁剑 → 磨刀石卡到剑旁亮流光 → 皮甲转两下填 T 形、木盾、月光石、手套
    name: 'arrange',
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(3, 'none'); ${SHOP_FILL} G.setGold(0);
        G.place('sword', 1, 0, 0, 1);
        G.give('whetstone', 1, 'stash'); G.give('leather', 1, 'stash'); G.give('buckler', 1, 'stash'); G.give('moonstone', 1, 'stash'); G.give('glove', 1, 'stash');`);
      await c.game(`F.setRot(${await uidOf(c, 'leather')}, 2); await F.idle(90);`);
      await c.game(`await F.begin('arrange', 20);`);
      await c.game(`await F.step(12);`);
      await dragItem(c, await uidOf(c, 'whetstone'), 2, 2, { frames: 24, after: 36 });
      // 倒 T（rot 2）抓顶上那格，转两次后它在正 T 的底部中间 (1,1)
      await dragItem(c, await uidOf(c, 'leather'), 1, 3, { frames: 28, after: 12, rotateAt: [0.3, 0.6], land: [1, 1] });
      await dragItem(c, await uidOf(c, 'buckler'), 2, 0, { frames: 16, after: 12 });
      await dragItem(c, await uidOf(c, 'moonstone'), 1, 4, { frames: 15, after: 12 });
      await dragItem(c, await uidOf(c, 'glove'), 0, 2, { frames: 15, after: 40 });
      await report(c, 'arrange');
      await c.game(`return await F.end();`);
    },
  },
  {
    // 镜头 6：商店铁剑拖到包里铁剑上 → ★★；暂存的 ★★ 再叠上去 → ★★★
    name: 'merge',
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(4, 'none');
        F.setBag(['.SWW..', '.SWW..', 'GSM...', 'GLLL..', '.OL...'], { S: 'sword', W: 'buckler', G: 'glove', M: 'whetstone', L: 'leather', O: 'moonstone' });
        G.setShop(['sword', 'potion', 'moonstone', 'kris', 'cauldron']); G.setGold(4); G.give('sword', 2, 'stash');
        await F.idle(90);`);
      await c.game(`await F.begin('merge', 20);`);
      await c.game(`await F.step(10);`);
      await dragCard(c, 0, 1, 1, { frames: 26, after: 40 });
      await report(c, 'merge1');
      await dragItem(c, await uidOf(c, 'sword', 'stash'), 1, 0, { frames: 22, after: 70 });
      await report(c, 'merge2');
      await c.game(`return await F.end();`);
    },
  },
  {
    // 镜头 7：第 1 → 10 轮的背包，每轮几帧
    name: 'rounds',
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(1, 'mid'); await F.idle(60);`);
      await c.game(`await F.begin('rounds', 20);`);
      for (let n = 1; n <= 10; n++) {
        await c.game(`G.gotoRound(${n}, 'mid'); await F.idle(50); await F.step(${n === 10 ? 40 : 8});`);
      }
      await c.game(`return await F.end();`);
    },
  },
  {
    // 镜头 8：拍下火漆「开战」，切到战斗（第 7 轮）
    name: 'fight',
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(7, 'mid'); await F.idle(90);`);
      await c.game(`await F.begin('fight', 20);`);
      await c.game(`await F.step(20);`);
      await tapUi(c, 'btn.fight', 150);
      await c.game(`return await F.end();`);
    },
  },
  foe(3),
  foe(4),
  foe(5),
  foe(6),
  foe(8),
  {
    name: 'boss',
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(10, 'none'); F.setBag(${JSON.stringify(BOSS_BAG.layout)}, ${JSON.stringify(BOSS_BAG.legend)}); await F.idle(90);`);
      console.log('  sim', JSON.stringify(await c.game(`return G.simulate();`)));
      await c.game(`await F.begin('boss', 40);`);
      await c.game(`await F.step(10);`);
      await fight(c, { speed: 2, tail: 120, maxFrames: 1800 });
      await c.game(`return await F.end();`);
    },
  },
  {
    // 3:4 封面底图：同一场龙战按 600×800 视口重演，停在复活前血条 9/102（boss 镜头开录后第 621 帧）+ 透明字标
    name: 'cover34',
    viewport: { w: 600, h: 800 },
    dpr: 3.6,
    async run(c) {
      await c.game(`G.skipTutorial(); G.gotoRound(10, 'none'); F.setBag(${JSON.stringify(BOSS_BAG.layout)}, ${JSON.stringify(BOSS_BAG.legend)}); await F.idle(90);`);
      const t0 = await c.game<number>(`return F.ticks;`);
      // 与 boss 镜头完全相同的操作序列（fight() 的轮询节奏也一样），保证同一帧画面一致
      await c.game(`await F.step(10);`);
      await tapUi(c, 'btn.fight', 2);
      let set = false;
      const TARGET = 621;
      for (;;) {
        const done = (await c.game<number>(`return F.ticks;`)) - t0;
        const n = Math.min(6, TARGET - done);
        if (n <= 0) break;
        const ph = await c.game<string>(`await F.step(${n}); return G.state().phase;`);
        if (!set && ph === 'battle') {
          await c.game(`G.speed(2);`);
          set = true;
        }
      }
      for (const k of [-4, 0, 4]) {
        if (k > 0) await c.game(`await F.step(${k});`);
        if (k === -4) continue;
        console.log('  snap', k, JSON.stringify(await c.game(`return F.snap('cover34_${k}');`)));
      }
      console.log('  logo', JSON.stringify(await c.game(`return F.logo('logo');`)));
    },
  },
  {
    // 镜头 12：标题页字标
    name: 'title',
    async run(c) {
      await c.game(`F.title(); await F.idle(2);`);
      await c.game(`await F.begin('title', 10);`);
      await c.game(`await F.step(240);`);
      await c.game(`return await F.end();`);
    },
  },
];
