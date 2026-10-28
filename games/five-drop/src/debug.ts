// ?debug=1：FPS 浮层与 window.__game（第 7.4 节）。坐标一律返回 CSS 像素
import type { App } from './main.ts';
import { cloneConfig } from './config.ts';
import type { FullRowMode } from './config.ts';
import { Piece, pieceFromSpec } from './core/pieces.ts';
import type { PieceSpec } from './core/pieces.ts';
import type { ShapeId } from './config.ts';
import { runGame, summarize } from './ai/sim.ts';
import type { PersonaId } from './ai/bot.ts';
import { remove, save } from './util/storage.ts';
import { audio } from './audio/audio.ts';

type Spec = { shape: ShapeId; colors: string; rot?: number };
type R = { ok: true; [k: string]: unknown } | { ok: false; reason: string };

const DEMOS: Record<string, { board: string[]; piece: Spec; col: number }> = {
  five: { board: ['.BBBB....'], piece: { shape: 'I3', colors: 'BBB', rot: 1 }, col: 5 },
  six: { board: ['BBB.BB...'], piece: { shape: 'I3', colors: 'BBB', rot: 1 }, col: 3 },
  cross: { board: ['BB.BB....', 'WWBWW....', 'WWBWW....'], piece: { shape: 'I3', colors: 'BBB', rot: 1 }, col: 2 },
  x: { board: ['..B...B..', '..WB.BW..', '..WW.WW..', '..WBWBW..', '..BWWWB..'], piece: { shape: 'D2', colors: 'BB', rot: 1 }, col: 4 },
  chain3: { board: ['.BBBB....', '.WWWW....', '.BBBBW...'], piece: { shape: 'I3', colors: 'WBB', rot: 1 }, col: 0 },
  crystal: { board: ['.BXBB....'], piece: { shape: 'I3', colors: 'BBB', rot: 1 }, col: 0 },
  fullrow: { board: ['BBBWBBWB.'], piece: { shape: 'I3', colors: 'WWW', rot: 1 }, col: 8 },
  perfect: { board: ['BB.......'], piece: { shape: 'I3', colors: 'BBB', rot: 0 }, col: 2 },
};

export function installDebug(app: App, sp: URLSearchParams): void {
  const el = document.createElement('div');
  el.id = 'debug';
  document.body.appendChild(el);
  let acc = 0, winMax = 0, shownMax = 0;
  const hist = { frames: 0, over4: 0, over8: 0, over16: 0, max: 0, sum: 0 };
  app.onFrame = () => {
    acc++;
    const ms = app.frameMs;
    hist.frames++; hist.sum += ms; if (ms > hist.max) hist.max = ms;
    if (ms > 4) hist.over4++; if (ms > 8) hist.over8++; if (ms > 16) hist.over16++;
    if (ms > winMax) winMax = ms;
    if (acc % 60 === 0) { shownMax = winMax; winMax = 0; }
    if (acc % 15 !== 0) return;
    const g = app.play.game;
    const fx = app.play.view.fx.count() + app.title.fx.count() + app.results.fx.count();
    el.textContent = `FPS ${app.fps.toFixed(0)} · ${app.frameMs.toFixed(2)} ms (max ${shownMax.toFixed(1)}) · seed ${g ? g.seed : app.seed}\n` +
      `LV ${g ? g.level : '-'} · t ${g ? g.time.toFixed(1) : '-'} · fx ${fx} · ${app.scene}/${app.overlay}/${g ? g.phase : '-'}`;
  };

  const live = (): R | null => {
    if (app.scene !== 'play' || !app.play.game) return { ok: false, reason: 'not in play' };
    return null;
  };
  const css = (x: number, y: number, w: number, h: number) => {
    const a = app.toCss(x, y), b = app.toCss(x + w, y + h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  };

  const api = {
    get seed() { return app.play.game ? app.play.game.seed : app.seed; },
    get config() { return cloneConfig(); },
    state() {
      const g = app.play.game;
      if (!g) return { ok: true, scene: app.scene, overlay: app.overlay, phase: 'idle' };
      const p = g.active;
      return {
        ok: true, scene: app.scene, overlay: app.overlay, tutorial: app.tutorial.active ? app.tutorial.step + 1 : 0,
        phase: g.phase, score: g.score, level: g.level, time: g.time, combo: g.combo,
        grid: g.grid.toAscii(false),
        active: p ? { shape: p.shape, rot: p.rot, colors: p.colorString(), x: p.x, y: p.y - g.grid.hidden, minCol: p.x + p.minX(), maxCol: p.x + p.maxX() } : null,
        ghost: p ? { y: g.ghostY() - g.grid.hidden } : null,
        preview: g.preview(),
        hold: g.holdPiece ? { shape: g.holdPiece.shape, colors: g.holdPiece.colorString(), used: g.holdUsed } : null,
        next: g.nextSpecs(), danger: g.danger, garbageIn: g.garbageRemaining(), stats: { ...g.stats }, best: app.best,
      };
    },
    ui() {
      const out = app.ui.hits.filter(h => !h.id.startsWith('settings.backdrop')).map(h => ({ id: h.id, enabled: h.enabled, ...css(h.x, h.y, h.w, h.h) }));
      if (app.scene === 'play') { const b = app.L.board; out.push({ id: 'board', enabled: true, ...css(b.x, b.y, b.w, b.h) }); }
      return out;
    },
    cell(c: number, r: number) { const b = app.L.board; return css(b.x + c * b.cell, b.y + r * b.cell, b.cell, b.cell); },
    setLevel(n: number): R { const e = live(); if (e) return e; app.play.game.setLevel(n); return { ok: true }; },
    setTime(sec: number): R { const e = live(); if (e) return e; const g = app.play.game; g.time = Math.max(0, sec); g.advanceTime(0); return { ok: true }; },
    setBoard(rows: string[]): R { const e = live(); if (e) return e; app.play.game.grid.setAscii(rows); return { ok: true }; },
    clearBoard(): R { const e = live(); if (e) return e; app.play.game.grid.clear(); return { ok: true }; },
    setPiece(spec: Spec): R {
      const e = live(); if (e) return e;
      const g = app.play.game;
      if (g.phase !== 'play') return { ok: false, reason: `phase ${g.phase}` };
      return g.setActive(pieceFromSpec(spec)) ? { ok: true } : { ok: false, reason: 'blocked' };
    },
    setNext(specs: Spec[]): R { const e = live(); if (e) return e; app.play.game.setScript(specs.map(s => pieceFromSpec(s).spec() as PieceSpec)); return { ok: true }; },
    place(col: number, rot = 0, invert = false): R {
      const e = live(); if (e) return e;
      const g = app.play.game, p = g.active;
      if (!p || g.phase !== 'play') return { ok: false, reason: `phase ${g.phase}` };
      const tmp = new Piece(p.shape, p.colors, rot);
      return g.placeAt(col - tmp.minX(), rot, invert) ? { ok: true } : { ok: false, reason: 'blocked' };
    },
    demo(name: string): R {
      const e = live(); if (e) return e;
      const g = app.play.game;
      if (name === 'garbage') { g.grid.setAscii(['BW.WB.WBW']); app.pending = { t: 0.3, fn: () => { for (let i = 0; i < 3; i++) app.play.game.pushGarbage(); } }; return { ok: true }; }
      const d = DEMOS[name === 'chain' ? 'chain3' : name];
      if (!d) return { ok: false, reason: 'unknown demo' };
      if (g.phase !== 'play') return { ok: false, reason: `phase ${g.phase}` };
      g.grid.setAscii(d.board);
      g.setActive(pieceFromSpec(d.piece));
      app.pending = { t: 0.45, fn: () => { api.place(d.col, d.piece.rot ?? 0, false); } };
      return { ok: true };
    },
    garbage(n = 1): R { const e = live(); if (e) return e; for (let i = 0; i < n; i++) if (!app.play.game.pushGarbage()) break; return { ok: true }; },
    addScore(n: number): R { const e = live(); if (e) return e; app.play.game.addPoints(n); return { ok: true }; },
    danger(): R {
      const e = live(); if (e) return e;
      const g = app.play.game;
      g.grid.clear();
      for (let i = 0; i < 13; i++) g.pushGarbage();
      return { ok: true };
    },
    lose(): R { const e = live(); if (e) return e; app.play.game.forceGameOver('forced'); return { ok: true }; },
    autoplay(p: PersonaId | null): R { app.autoplay = p; return { ok: true }; },
    simulate(o: { persona?: PersonaId; games?: number; seed?: number; maxMinutes?: number; fullRowMode?: FullRowMode } = {}) {
      const cfg = cloneConfig();
      if (o.fullRowMode) cfg.fullRow.mode = o.fullRowMode;
      const rs = [];
      for (let i = 0; i < (o.games ?? 8); i++) rs.push(runGame(cfg, o.persona ?? 'serious', (o.seed ?? 1) + i, o.maxMinutes ?? 20));
      return { ok: true, ...summarize(rs) };
    },
    timeScale(x: number): R { app.timeScale = Math.max(0, Math.min(8, x)); return { ok: true }; },
    fx(name: string): R {
      const P = app.play;
      switch (name) {
        case 'shake1': P.trauma.add(0.06); break;
        case 'shake2': P.trauma.add(0.22); break;
        case 'shake3': P.trauma.add(0.45); break;
        case 'five': return api.demo('five');
        case 'cross': return api.demo('cross');
        case 'chain': return api.demo('chain3');
        case 'levelup': P.view.onLevelUp(); audio.levelUp(); P.showToast('LV ' + (P.game ? P.game.level : 1), '', 1.2, 3, 22); break;
        case 'record': audio.record(); P.view.fx.ring(195, 160, 170, 0.8); break;
        case 'gameover': return api.lose();
        default: return { ok: false, reason: 'unknown fx' };
      }
      return { ok: true };
    },
    pause(): R { if (app.scene !== 'play') return { ok: false, reason: 'not in play' }; app.openPause(); return { ok: true }; },
    resume(): R { app.resumeNow(); return { ok: true }; },
    skipTutorial(): R { save('tutorialDone', '1'); if (app.tutorial.active) app.tutorial.skip(); return { ok: true }; },
    resetTutorial(): R { remove('tutorialDone'); return { ok: true }; },
    resetHints(): R { app.play.resetHints(); return { ok: true }; },
    /** 帧耗时统计（update + render，毫秒）；reset=true 时清零 */
    perf(reset = false) {
      const r = { ok: true, frames: hist.frames, avg: hist.frames ? hist.sum / hist.frames : 0, max: hist.max, over4: hist.over4, over8: hist.over8, over16: hist.over16 };
      if (reset) { hist.frames = 0; hist.over4 = 0; hist.over8 = 0; hist.over16 = 0; hist.max = 0; hist.sum = 0; }
      return r;
    },
    /** 便捷：直接开局（跳过标题） */
    start(): R { app.startGame(); return { ok: true }; },
  };
  (window as unknown as { __game: typeof api }).__game = api;

  if (sp.get('notut') === '1') save('tutorialDone', '1');
  const lv = Number(sp.get('level'));
  if (lv > 1) app.startLevel = Math.min(15, Math.floor(lv));
  const ap = sp.get('autoplay') as PersonaId | null;
  if (ap) { save('tutorialDone', '1'); app.autoplay = ap; app.startGame(); }
  else if (lv > 1) app.startGame();
}
