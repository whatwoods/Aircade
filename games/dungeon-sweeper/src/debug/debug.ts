import type { App } from '../app';
import { maxHpForLevel } from '../config';
import { clearAll } from '../core/storage';
import { COLS, N, ROWS, cx, cy, idx } from '../game/board';
import { Kind } from '../game/types';
import { P } from '../view/fx';

/** ?debug=1：FPS 浮层 + window.__game（文档 §8） */
export function installDebug(app: App): void {
  const el = document.createElement('div');
  el.id = 'debug';
  document.body.appendChild(el);
  let frames = 0;
  let acc = 0;
  let fps = 0;
  app.onFrame = (dt) => {
    frames++;
    acc += dt;
    if (acc < 250) return;
    fps = (frames * 1000) / acc;
    frames = 0;
    acc = 0;
    let sum = 0;
    let max = 0;
    for (const v of app.perfBuf) {
      sum += v;
      if (v > max) max = v;
    }
    el.textContent = `FPS ${fps.toFixed(0)}  frame ${(sum / app.perfBuf.length).toFixed(2)}/${max.toFixed(1)}ms\nparticles ${app.fx.pCount}  draws ${app.renderer.calls}\nseed #${app.game.seed}${app.game.b.regen ? ` (重抽 ${app.game.b.regen})` : ''}  q${app.quality}  ${app.state}`;
  };

  const resync = () => {
    const p = app.game.player;
    app.hud.sync(p.level, p.hp, p.xp, app.game.score, app.game.alive);
  };
  const play = (ev: ReturnType<App['game']['tap']>) => app.playEvents(ev);
  const ensurePlaying = () => {
    if (app.state === 'title') app.startFromTitle();
  };

  const api = {
    state() {
      const g = app.game;
      const alive: Record<number, number> = {};
      for (let l = 1; l <= 9; l++) alive[l] = g.alive[l];
      return {
        phase: g.phase,
        appState: app.state,
        seed: g.seed,
        hp: g.player.hp,
        maxHp: g.player.maxHp,
        level: g.player.level,
        xp: g.player.xp,
        xpToNext: g.xpToNext,
        score: g.score,
        gold: g.gold,
        timeMs: g.timeMs,
        revealed: g.revealedCount(),
        alive,
        dragonAwake: g.dragonAwake,
        isTutorial: g.isTutorial,
        tutorialStep: app.tut.active ? app.tut.cur?.id : null,
        busy: app.director.busy,
      };
    },
    board() {
      const g = app.game;
      const out = [];
      for (let y = 0; y < ROWS; y++) {
        const row = [];
        for (let x = 0; x < COLS; x++) {
          const i = idx(x, y);
          const k = g.b.kind[i];
          row.push({
            x,
            y,
            kind: ['empty', 'monster', 'chest', 'potion', 'lair'][k],
            level: g.b.level[i],
            revealed: !!g.revealed[i],
            dead: k === Kind.Monster && !!g.revealed[i],
            mark: g.mark[i],
            number: g.number[i],
          });
        }
        out.push(row);
      }
      return out;
    },
    cellCenter(x: number, y: number) {
      const L = app.L;
      const r = app.canvas.getBoundingClientRect();
      return { x: r.left + L.board.x + x * L.cell + L.cell / 2, y: r.top + L.board.y + y * L.cell + L.cell / 2 };
    },
    /** 轮盘第 k 个槽位（RADIAL_VALUES 下标）的 client 坐标；未打开返回 null */
    radialSlot(k: number) {
      if (!app.radial.open) return null;
      const r = app.canvas.getBoundingClientRect();
      const [sx, sy] = app.radial.slotPos(k);
      return { x: r.left + sx, y: r.top + sy };
    },
    radialOpen() {
      return app.radial.open ? app.radial.mode : null;
    },
    tap(x: number, y: number) {
      app.tapCell(idx(x, y));
    },
    longPress(x: number, y: number) {
      app.longPressCell(idx(x, y), 'tap');
    },
    mark(x: number, y: number, m: number) {
      app.applyMark(idx(x, y), m);
    },
    revealSafe() {
      play(app.game.debugRevealSafe());
    },
    xray(on = true) {
      app.ov.xray = on;
    },
    addXp(n: number) {
      play(app.game.debugAddXp(n));
    },
    setHp(n: number) {
      app.game.debugSetHp(n);
      resync();
    },
    setLevel(n: number) {
      play(app.game.debugSetLevel(n));
      resync();
    },
    heal() {
      app.game.player.hp = app.game.player.maxHp;
      resync();
    },
    killAll() {
      const s = app.clock.scale;
      app.clock.scale = Math.max(s, 3);
      play(app.game.debugKillAll());
      const p = app.game.player;
      p.maxHp = Math.max(p.maxHp, maxHpForLevel(p.level));
      window.setTimeout(() => (app.clock.scale = s), 2500);
    },
    dragonReady() {
      if (app.game.player.maxHp < 14) play(app.game.debugSetLevel(10));
      app.game.player.hp = app.game.player.maxHp;
      resync();
    },
    fightDragon() {
      api.dragonReady();
      play(app.game.tap(app.game.lairCell(), true));
    },
    win() {
      ensurePlaying();
      play(app.game.debugFinish(true));
    },
    lose() {
      ensurePlaying();
      play(app.game.debugFinish(false));
    },
    newGame(seed?: number) {
      if (seed !== undefined) app.opts.seed = seed >>> 0;
      if (app.state === 'title') app.startFromTitle();
      else app.newGame(false, true);
    },
    restart() {
      app.newGame(false, true);
    },
    startTutorial() {
      if (app.state === 'title') app.startFromTitle(true);
      else app.newGame(true, true);
    },
    skipTutorial() {
      app.finishTutorial();
    },
    timeScale(s: number) {
      app.clock.scale = s;
    },
    fx(name: string) {
      const L = app.L;
      const x = L.board.x + L.board.w / 2;
      const y = L.board.y + L.board.h / 2;
      switch (name) {
        case 'levelup': {
          const p = app.game.player;
          app.director.levelUpFx({ from: p.level, to: p.level + 1, maxHpFrom: p.maxHp, maxHpTo: p.maxHp + 1, awake: false });
          break;
        }
        case 'shatter':
          app.fx.shatter(9, x, y, 1, false, 1.3);
          app.sfx.shatter(9);
          break;
        case 'shake':
          app.cam.add(0.6);
          break;
        case 'fullclear':
          app.ov.clearT0 = app.clock.real;
          app.sfx.bell();
          break;
        case 'record':
          for (let k = 0; k < 40; k++) app.fx.spawn(P.GoldDust, x, y, app.fx.rr(-220, 220), app.fx.rr(-260, -40), 1400, 7, 2, 300, 0.4, 1);
          app.sfx.record();
          break;
        case 'death':
          app.ov.deathT0 = app.clock.real;
          break;
      }
    },
    idle(): Promise<void> {
      return new Promise((res) => {
        const chk = () => {
          if (!app.director.busy && app.fx.sCount === 0) res();
          else window.setTimeout(chk, 50);
        };
        chk();
      });
    },
    clearSave() {
      clearAll();
    },
    perf() {
      const a = Array.from(app.perfBuf).filter((v) => v > 0);
      a.sort((p, q) => p - q);
      const avg = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
      return { frames: a.length, avg, p50: a[Math.floor(a.length * 0.5)] ?? 0, p95: a[Math.floor(a.length * 0.95)] ?? 0, max: a[a.length - 1] ?? 0, particles: app.fx.pCount, draws: app.renderer.calls };
    },
    app,
    N,
    cx,
    cy,
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
