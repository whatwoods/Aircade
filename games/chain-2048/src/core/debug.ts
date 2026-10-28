/** ?debug=1：FPS 浮层与 window.__game（docs §8）。坐标一律返回 CSS 像素。非法调用返回 {ok:false, reason}。 */
import type { App } from '../app';
import { CONFIG } from '../config';
import type { BotKind } from '../game/bots';
import { report } from '../game/simulate';
import { MUZZLE } from '../game/shooter';
import { Bot, simulateLevels } from '../game/bots';
import { Rng } from './rng';
import { load, remove } from './storage';
import { toClient } from './stage';
import { templeName } from '../ui/hud';

type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });

export function installDebug(app: App): void {
  const el = document.getElementById('debug')!;
  el.classList.add('show');
  let acc = 0, frames = 0, fps = 60;
  const s = () => app.session;
  const levelOf = (v: number): number => Math.max(1, Math.round(Math.log2(Math.max(2, v))));
  const playing = (): Fail | null => (app.scene !== 'playing' ? fail('not playing') : null);
  const loop = (): void => {
    frames++;
    acc += app.loop.info.realDt;
    if (acc >= 0.5) {
      fps = frames / acc;
      acc = 0;
      frames = 0;
      const ss = s();
      let segs = 0;
      for (let i = 0; i < ss.chain.balls.length; i++) if (!ss.chain.connected(i)) segs++;
      el.textContent = `${fps.toFixed(0)}fps ${app.loop.frameMs.toFixed(1)}ms(p95 ${app.loop.p95().toFixed(1)}) | balls ${ss.chain.balls.length} seg ${segs} | pt ${app.renderer.particles.count()}/${app.renderer.particles.cap} | p ${ss.chain.headProgress().toFixed(2)} | Q:${['低', '中', '高'][app.quality]} | seed ${app.seed}`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const fx = (name: string): unknown => {
    const r = app.renderer;
    const ss = s();
    const b = ss.bus;
    const mid = ss.chain.balls[Math.floor(ss.chain.balls.length / 2)];
    const ball = mid ?? ss.chain.makeBall(3, ss.track.length * 0.4);
    switch (name) {
      case 'cascade5':
        for (let k = 1; k <= 5; k++) b.emit('merged', { ball, fromS: [ball.s + 40], level: Math.min(10, ball.level + k), cid: 999, step: k, triple: false });
        break;
      case 'triple':
        b.emit('merged', { ball, fromS: [ball.s + 40, ball.s + 80], level: ball.level + 2, cid: 998, step: 1, triple: true });
        break;
      case 'seal':
      case 'seal2048': {
        const lv = name === 'seal' ? ss.cfg.sealLevel : 11;
        b.emit('sealStart', { ball: { ...ball, level: lv }, cid: 997, step: 3, over: false });
        b.emit('sealed', { s: ball.s, level: lv, cid: 997, step: 3, over: false });
        break;
      }
      case 'wild':
        b.emit('wildEarned', { x: 0, y: 0 });
        break;
      case 'clear':
        b.emit('quotaReached', { stage: ss.stage });
        break;
      case 'fail':
        b.emit('failStart', {});
        break;
      case 'lifeLost':
        b.emit('lifeLost', { lives: ss.lives });
        break;
      case 'record':
        r.particles.gold(300, 280, 300, 330, 60);
        r.addTrauma(CONFIG.fx.trauma.heavy);
        break;
      default:
        return fail('unknown fx');
    }
    return { ok: true };
  };

  const api = {
    get seed(): number {
      return app.seed;
    },
    state() {
      const ss = s();
      let segs = 0;
      for (let i = 0; i < ss.chain.balls.length; i++) if (!ss.chain.connected(i)) segs++;
      return {
        scene: app.scene, sub: ss.phase, paused: app.paused, stage: ss.stage, temple: templeName(ss.stage), score: ss.score, best: app.best, lives: ss.lives,
        seals: ss.seals, quota: ss.cfg.quota, sealValue: 2 ** ss.cfg.sealLevel, headProgress: ss.chain.headProgress(), chain: ss.chain.values(), segments: segs,
        ammo: { current: 2 ** ss.ammo.current, next: 2 ** ss.ammo.next, wild: ss.ammo.wild, armed: ss.ammo.armed }, streak: ss.streak,
        tutorialStep: app.tutorial.index, tutorialDone: load('tutorialDone') === '1', fps,
      };
    },
    gotoStage(n: number) {
      const e = playing();
      if (e) return e;
      app.tutorial.stop();
      s().startStage(Math.max(1, Math.floor(n)), false);
      return { ok: true };
    },
    win() {
      const e = playing();
      if (e) return e;
      if (s().phase !== 'live' && s().phase !== 'intro') return fail(`phase ${s().phase}`);
      s().forceWin();
      return { ok: true };
    },
    lose() {
      const e = playing();
      if (e) return e;
      if (s().phase !== 'live' && s().phase !== 'intro') return fail(`phase ${s().phase}`);
      s().forceLose();
      return { ok: true };
    },
    addSeal(n = 1) {
      const e = playing();
      if (e) return e;
      const ss = s();
      for (let i = 0; i < n; i++) {
        const b = ss.chain.balls[0];
        ss.bus.emit('sealed', { s: b ? b.s : 600, level: ss.cfg.sealLevel, cid: -1, step: 1, over: false });
      }
      // 真正计数：走 session 的 sealed 处理路径
      for (let i = 0; i < n; i++) ss.debugSeal();
      return { ok: true, seals: ss.seals };
    },
    setChain(values: number[], headProgress?: number) {
      const e = playing();
      if (e) return e;
      if (!Array.isArray(values) || !values.length) return fail('values');
      const ss = s();
      const head = (headProgress ?? Math.max(0.3, ss.chain.headProgress())) * ss.track.length;
      ss.chain.setLevels(values.map(levelOf), head);
      if (ss.chain.mode === 'intro') ss.chain.mode = 'live';
      if (ss.phase === 'intro') ss.phase = 'live';
      return { ok: true };
    },
    setAmmo(current: number, next?: number) {
      const ss = s();
      ss.ammo.current = levelOf(current);
      if (next !== undefined) ss.ammo.next = levelOf(next);
      return { ok: true };
    },
    giveWild() {
      s().ammo.wild = Math.min(CONFIG.wild.maxHeld, s().ammo.wild + 1);
      return { ok: true };
    },
    ballPos(i: number) {
      const ss = s();
      const b = ss.chain.balls[i];
      if (!b) return null;
      const p = ss.track.posAt(b.s + b.rOff);
      return toClient(p.x, p.y);
    },
    aimPointFor(i: number, side: 0 | 1 = 1) {
      const ss = s();
      const a = ss.angleFor(i, side);
      if (a === null) return null;
      const d = MUZZLE + 60;
      return toClient(ss.totemX + Math.cos(a) * d, ss.totemY + Math.sin(a) * d);
    },
    findMerge() {
      const ss = s();
      const ch = ss.chain;
      let best: { x: number; y: number; index: number; side: number; steps: number } | null = null;
      for (let i = 0; i < ch.balls.length; i++) {
        for (const side of [0, 1] as const) {
          const st = ch.segStart(i), en = ch.segEnd(i);
          const arr: number[] = [];
          for (let k = st; k <= en; k++) arr.push(ch.balls[k]!.level);
          const j = i - st + side;
          arr.splice(j, 0, ss.ammo.current);
          const r = simulateLevels(arr, j, ss.cfg.sealLevel);
          if (r.steps <= 0 || (best && best.steps >= r.steps)) continue;
          const a = ss.angleFor(i, side);
          if (a === null) continue;
          const d = MUZZLE + 60;
          const c = toClient(ss.totemX + Math.cos(a) * d, ss.totemY + Math.sin(a) * d);
          best = { x: c.x, y: c.y, index: i, side, steps: r.steps };
        }
      }
      return best;
    },
    fireAt(x: number, y: number) {
      const sc = app.renderer;
      void sc;
      const st = document.getElementById('stage')!.getBoundingClientRect();
      const k = st.width / 390;
      const ok = app.fireAt((x - st.left) / k, (y - st.top) / k);
      return ok ? { ok: true } : fail('cannot fire now');
    },
    swap() {
      return s().swap() ? { ok: true } : fail('cannot swap');
    },
    armWild() {
      return s().armWild() ? { ok: true } : fail('no wild');
    },
    setSpeed(m: number) {
      s().chain.speedMul = m;
      return { ok: true };
    },
    freeze(on: boolean) {
      const ch = s().chain;
      if (on) ch.mode = 'frozenTutorial';
      else if (ch.mode === 'frozenTutorial') ch.mode = 'live';
      return { ok: true };
    },
    timeScale(x: number) {
      app.loop.timeScale = Math.max(0, Math.min(8, x));
      return { ok: true };
    },
    autoplay(bot: BotKind | false = 'careful') {
      app.setAutoplay(bot ? new Bot(bot, new Rng(app.seed ^ 0x5bd1)) : null);
      return { ok: true };
    },
    simulate(o: { bot?: BotKind; runs?: number; seed?: number; fromStage?: number; toStage?: number; lives?: number } = {}) {
      const r = report(o.bot ?? 'human', o.runs ?? 5, o.toStage ?? 20, o.seed ?? 1000, o.lives ?? CONFIG.run.lives, o.fromStage ?? 1);
      const stages: Record<number, unknown> = {};
      for (const [n, st] of r.stats) stages[n] = { tries: st.tries, clearRate: st.clears / st.tries, time: st.time, maxP: st.maxP, danger: st.danger, mergesPerShot: st.merges / Math.max(1, st.shots), cascades: st.casc };
      return { bot: r.kind, runs: r.runs, medianMinutes: r.medMin, medianStop: r.medStop, stages };
    },
    fx,
    showcase() {
      app.renderer.showcase = !app.renderer.showcase;
      return { ok: true, on: app.renderer.showcase };
    },
    skipTutorial() {
      if (!app.tutorial.active) return fail('no tutorial');
      app.tutorial.skip();
      return { ok: true };
    },
    resetTutorial() {
      remove('tutorialDone');
      return { ok: true };
    },
    resetTips() {
      remove('tips');
      app.tips = 0;
      return { ok: true };
    },
    pause(on = true) {
      app.setPaused(on);
      return { ok: true };
    },
    start(tutorial = false) {
      if (app.scene !== 'title') return fail('not on title');
      app.startGame(tutorial, true);
      return { ok: true };
    },
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
