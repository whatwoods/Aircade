/**
 * ?debug=1（§9.1）：左下角 FPS / 帧时间浮层、window.__game、调试快捷键 W/L/I/N/S。
 */
import { CONFIG } from './config.ts';
import { BASE_MAP, RECIPE_MAP, zoneFor, resolveMerge } from './core/recipes.ts';
import type { Tile, Zone } from './core/types.ts';
import { BASES, RECIPES } from './data/hanzi.ts';
import { LEVELS } from './data/levels.ts';
import { inSubset, setGlyphCheck } from './render/glyphs.ts';
import { resetSave, save, saveAtlas, saveProgress } from './save.ts';
import type { App } from './main.ts';

const ZONES: Zone[] = ['left', 'right', 'top', 'bottom', 'center'];
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function installDebug(app: App): void {
  setGlyphCheck(true);
  const play = app.play;

  // ───────── FPS 浮层 ─────────
  const el = document.createElement('div');
  el.id = 'fps';
  document.body.appendChild(el);
  let frames = 0;
  let acc = 0;
  let worst = 0;
  let msAcc = 0;
  app.onFrame = (dt, ms) => {
    frames++;
    acc += dt;
    msAcc += ms;
    if (ms > worst) worst = ms;
    if (acc >= 0.5) {
      el.textContent = `${Math.round(frames / acc)} fps  ${(msAcc / frames).toFixed(1)} ms (max ${worst.toFixed(1)})\nparticles ${play.particles.count()}  fx ${play.fx.activeCount()}  dpr ${app.stage.dpr.toFixed(2)}`;
      frames = 0;
      acc = 0;
      msAcc = 0;
      worst = 0;
    }
  };

  const need = () => {
    if (!play.game) throw new Error('not in a level');
    return play.s;
  };
  const mkTile = (spec: string): Tile => {
    const s = need();
    const id = s.nextId++;
    if (spec.includes('+')) {
      const parts = spec.split('+');
      return { id, kind: 'pending', ch: parts.join(''), parts };
    }
    if (BASE_MAP.has(spec)) return { id, kind: 'base', ch: spec };
    if (RECIPE_MAP.has(spec)) return { id, kind: 'char', ch: spec };
    throw new Error(`unknown char ${spec}`);
  };
  const bestZone = (a: Tile, b: Tile): Zone => {
    for (const z of ZONES) {
      const r = resolveMerge(a, b, z);
      if (r.kind === 'char' && r.recipe.parts.includes(a.ch)) {
        if (z === zoneFor(a.ch, r.recipe.c)) return z;
      }
    }
    return 'center';
  };
  const empty = (): number[] => {
    const s = need();
    const out: number[] = [];
    for (let i = 0; i < s.board.length; i++) if (!s.board[i]) out.push(i);
    return out;
  };
  /** 在 cell 处摆出 ch 的合成：返回 [拖动格, 目标格, 方位] */
  const stage = (ch: string, cell: number): [number, number, Zone] => {
    const r = RECIPE_MAP.get(ch);
    if (!r) throw new Error(`no recipe ${ch}`);
    const s = need();
    s.board[cell] = null;
    const free = empty().filter((i) => i !== cell);
    const W = CONFIG.board.cols;
    const other = free.find((i) => Math.abs((i % W) - (cell % W)) + Math.abs(Math.floor(i / W) - Math.floor(cell / W)) <= 2) ?? free[0];
    if (other === undefined) throw new Error('board full');
    if (r.parts.length === 3) {
      s.board[cell] = mkTile(`${r.parts[0]}+${r.parts[1]}`);
      s.board[other] = mkTile(r.parts[2]);
      return [other, cell, 'center'];
    }
    s.board[cell] = mkTile(r.parts[0]);
    s.board[other] = mkTile(r.parts[1]);
    return [other, cell, zoneFor(r.parts[1], ch)];
  };

  const api = {
    state: () => ({ scene: app.scene, ...(play.snapshot() as object | null ?? {}) }),
    gotoLevel: (n: number, o: { seed?: number } = {}) => app.startLevel(Math.max(1, Math.min(LEVELS.length, n)), false, o.seed),
    endless: (o: { stage?: number; seed?: number } = {}) => app.startEndless(o.stage ?? 1, o.seed),
    win: () => play.debugWin(),
    lose: () => play.debugLose(),
    addInk: (n: number) => {
      need().ink = Math.max(0, need().ink + n);
    },
    setInk: (n: number) => {
      need().ink = Math.max(0, n);
    },
    setRack: (chars: string[]) => {
      const s = need();
      for (let i = 0; i < chars.length && i < s.rack.length; i++) s.rack[i] = chars[i];
    },
    place: (ch: string, cell: number) => {
      need().board[cell] = mkTile(ch);
    },
    fillBoard: (chars: string[] | 'random') => {
      const s = need();
      for (let i = 0; i < s.board.length; i++) {
        const c = chars === 'random' ? BASES[Math.floor(Math.random() * 40)].c : chars[i % chars.length];
        s.board[i] = c ? mkTile(c) : null;
      }
    },
    merge: (from: number, to: number, zone?: Zone) => {
      const s = need();
      const a = s.board[from];
      const b = s.board[to];
      if (!a || !b) return [];
      return play.act({ t: 'drop', from, cell: to, zone: zone ?? bestZone(a, b) });
    },
    drop: (cell: number, zone?: Zone) => {
      const s = need();
      const b = s.board[cell];
      const a: Tile = { id: -1, kind: 'base', ch: s.rack[0] };
      return play.act({ t: 'drop', from: 'rack', cell, zone: zone ?? (b ? bestZone(a, b) : 'center') });
    },
    deliver: (ch: string) => {
      const free = empty();
      const cell = free.includes(CONFIG.board.focus) ? CONFIG.board.focus : free[0];
      const [f, t, z] = stage(ch, cell);
      return play.act({ t: 'drop', from: f, cell: t, zone: z });
    },
    showCard: (ch: string) => app.card.show(ch, '', () => undefined, true),
    playMerge: (ch: string, o: { first?: boolean } = {}) => {
      if (o.first) save.atlas.delete(ch);
      else if (!save.atlas.has(ch)) {
        save.atlas.add(ch);
        saveAtlas();
      }
      const [f, t, z] = stage(ch, CONFIG.board.focus);
      return play.act({ t: 'drop', from: f, cell: t, zone: z });
    },
    showcase: async (chapter?: number, gapMs = 900) => {
      const list = RECIPES.filter((r) => !chapter || r.tier === chapter).map((r) => r.c);
      for (const ch of list) {
        if (!play.game || play.over) break;
        const s = need();
        s.board.fill(null);
        api.playMerge(ch);
        await wait(gapMs / Math.max(0.1, play.timeScale));
      }
      return list.length;
    },
    unlockAll: () => {
      save.progress.unlocked = LEVELS.length;
      for (const r of RECIPES) save.atlas.add(r.c);
      saveProgress();
      saveAtlas();
      app.screens.unlockedAll = true;
    },
    resetSave: () => resetSave(),
    tutorial: (step = 1) => {
      if (app.scene !== 'play' || !play.game || play.def.id !== 1) {
        app.enterPlay();
        play.startLevel(1, undefined, true);
      }
      play.tutorialStep(step);
    },
    simulate: async (o: { levels?: number[]; seeds?: number; bots?: ('novice' | 'diligent' | 'oracle')[] } = {}) => {
      const m = await import('./sim/runner.ts');
      const rep = m.simulate({ seeds: 40, ...o });
      console.table(rep.map((r) => ({ level: r.id, bot: r.bot, clear: r.clear, inkP50: r.inkP50 })));
      return rep;
    },
    timeScale: (v: number) => {
      play.timeScale = Math.max(0.1, Math.min(4, v));
    },
    config: CONFIG,
    /** 字库审计：DOM 里所有用打包字体显示的字是否都在子集里（§2.3） */
    fontAudit: () => {
      const missing = new Set<string>();
      document.querySelectorAll<HTMLElement>('.kai, .logo').forEach((e) => {
        const font = e.classList.contains('logo') ? 'logo' : 'kai';
        for (const ch of e.textContent ?? '') {
          if (/[㐀-鿿豈-﫿]/.test(ch) && !inSubset(ch, font)) missing.add(ch);
        }
      });
      return [...missing];
    },
  };
  (window as unknown as { __game: typeof api }).__game = api;

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (app.scene !== 'play' || !play.game) return;
    if (k === 'w') api.win();
    else if (k === 'l') api.lose();
    else if (k === 'i') api.addInk(10);
    else if (k === 'n') api.gotoLevel(play.def.id + 1);
    else if (k === 's') void api.showcase(play.def.chapter);
  });
}
