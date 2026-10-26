// window.__game (docs §8) — only installed with ?debug=1, loaded as a separate chunk. Every method is
// synchronous and returns void except state() and simulate().
import { config } from '../config';
import type { FxEventId } from '../config';
import { clearAll } from '../core/storage';
import type { App } from '../app';
import type { BossKind, BrickType, EvolutionId, QualityId, Snapshot, UpgradeId } from '../types';
import { BOSS_KINDS, EVOLUTION_IDS, UPGRADE_IDS, BRICK_TYPES } from '../types';
import { emptyLevels } from '../game/upgrades';
import { DMG_AOE } from '../game/bricks';
import { DebugOverlay } from './overlay';
import { simulate } from './sim';
import type { SimOptions, SimReport } from './sim';

export interface DebugApi {
  readonly seed: number;
  state(): Snapshot;
  startRun(opts?: { tutorial?: boolean; wave?: number }): void;
  setWave(n: number, opts?: { build?: 'keep' | 'auto' | 'none' }): void;
  nextWave(): void;
  addXp(n: number): void;
  levelUp(count?: number): void;
  pickCard(i: number): void;
  give(id: UpgradeId, level?: number): void;
  evolve(id: EvolutionId): void;
  spawnBoss(kind: BossKind): void;
  damageBoss(frac: number): void;
  killBoss(): void;
  spawnRow(types?: BrickType[]): void;
  clearBricks(): void;
  setHp(n: number): void;
  god(on?: boolean): void;
  setCombo(n: number): void;
  win(): void;
  lose(): void;
  timeScale(x: number): void;
  autoplay(on?: boolean): void;
  fx(event: FxEventId, x?: number, y?: number): void;
  pause(): void;
  resume(): void;
  setQuality(q: QualityId): void;
  skipTutorial(): void;
  resetSave(): void;
  simulate(opts: SimOptions): Promise<SimReport>;
}

/** expected level at the start of wave n (fit to autoplay runs) */
function expectedLevel(n: number): number {
  return Math.max(1, Math.round(1 + 1.75 * (n - 1)));
}

export function installDebug(app: App): void {
  const g = app.g;
  const ensureRun = (): void => {
    if (!app.ready) throw new Error('assets still baking');
    if (app.mode !== 'run') app.startRun(false);
    if (app.paused) app.resumeNow();
  };

  const autoBuild = (n: number): void => {
    g.levels = emptyLevels();
    g.evolutions.clear();
    g.elementCycle = [];
    g.recomputeStats();
    const target = expectedLevel(n);
    g.level = 1;
    for (let i = 1; i < target; i++) {
      g.level++;
      g.pendingLevelUps = 1;
      const cards = g.rollOffer();
      const pick = g.autoplay.pickCard(g, cards);
      g.applyCard(cards[pick]!);
    }
    g.pendingLevelUps = 0;
    g.xp = 0;
    g.player.hp = g.stats.maxHp;
  };

  const jumpTo = (n: number, build: 'keep' | 'auto' | 'none'): void => {
    ensureRun();
    n = Math.max(1, Math.min(99, Math.floor(n)));
    if (g.tut) app.skipTutorial();
    const f = g.formation;
    for (const b of f.bricks) if (b.alive) f.remove(b);
    f.reset();
    g.bulletsSys.clearAll();
    g.gemsSys.reset();
    g.boss = null;
    g.shockR = -1;
    if (build === 'auto') autoBuild(n);
    else if (build === 'none') {
      g.levels = emptyLevels();
      g.evolutions.clear();
      g.elementCycle = [];
      g.recomputeStats();
    }
    g.endless = n > 20;
    g.phase = 'wave';
    app.banners.clear();
    if (g.isBossWave(n)) {
      g.startBossWave(n);
    } else {
      g.beginWave(n);
      f.quickSteps = n === 1 ? config.advance.prefillRows : config.advance.prefillAfterBoss;
      f.stepTimer = 0;
    }
  };

  const api: DebugApi = {
    get seed() {
      return g.seed;
    },
    state: () => g.snapshot(app.scene, app.quality, app.fps),
    startRun: (opts) => {
      if (!app.ready) throw new Error('assets still baking');
      app.startRun(opts?.tutorial ?? false);
      if (opts?.wave && opts.wave > 1) jumpTo(opts.wave, 'auto');
    },
    setWave: (n, opts) => jumpTo(n, opts?.build ?? 'keep'),
    nextWave: () => jumpTo(g.wave + 1, 'keep'),
    addXp: (n) => {
      ensureRun();
      g.addXp(Math.max(0, n));
    },
    levelUp: (count = 1) => {
      ensureRun();
      for (let i = 0; i < Math.max(1, Math.floor(count)); i++) g.addXp(Math.max(0, g.xpToNext() - g.xp) + 1e-3);
    },
    pickCard: (i) => app.pickCard(Math.max(0, Math.min(2, Math.floor(i)))),
    give: (id, level = 5) => {
      if (!UPGRADE_IDS.includes(id)) throw new Error('unknown upgrade ' + id);
      ensureRun();
      g.setLevel(id, Math.max(0, Math.min(5, Math.floor(level))));
    },
    evolve: (id) => {
      if (!EVOLUTION_IDS.includes(id)) throw new Error('unknown evolution ' + id);
      ensureRun();
      g.evolve(id);
    },
    spawnBoss: (kind) => {
      if (!BOSS_KINDS.includes(kind)) throw new Error('unknown boss ' + kind);
      ensureRun();
      if (g.tut) app.skipTutorial();
      if (g.phase !== 'wave' && g.phase !== 'boss' && g.phase !== 'bossIntro') g.phase = 'wave';
      app.banners.clear();
      g.spawnBoss(kind);
    },
    damageBoss: (frac) => {
      const b = g.boss;
      if (!b) return;
      b.setHpFrac(b.hpFrac() - Math.max(0, Math.min(1, frac)));
    },
    killBoss: () => {
      const b = g.boss;
      if (!b) return;
      if (b.state === 'fight') b.setHpFrac(0);
      if (g.boss === b && b.state !== 'dead') {
        b.hp = 0;
        b.state = 'dead';
        g.onBossDefeated(b);
      }
    },
    spawnRow: (types) => {
      ensureRun();
      const f = g.formation;
      const r = f.slideBaseRow() - 1;
      const hp = g.waves.baseHp(g.wave);
      for (let c = 0; c < config.grid.cols; c++) {
        const t = types?.[c] ?? 'basic';
        if (!BRICK_TYPES.includes(t)) continue;
        if (f.occupied(c, r)) continue;
        f.spawn(t, c, r, hp * config.bricks[t].hp);
      }
      f.recomputeShields();
      f.refreshWarnings();
    },
    clearBricks: () => {
      const f = g.formation;
      for (const b of f.bricks) if (b.alive) g.bricksSys.damage(b, b.hp + 1, DMG_AOE);
    },
    setHp: (n) => {
      ensureRun();
      g.player.hp = Math.max(0, Math.min(g.stats.maxHp, Math.round(n)));
      if (g.player.hp <= 0) g.die();
    },
    god: (on = true) => {
      g.god = on;
    },
    setCombo: (n) => {
      ensureRun();
      n = Math.max(0, Math.floor(n));
      if (n === 0) {
        g.breakCombo(false);
        return;
      }
      g.combo = Math.max(0, n - 1);
      g.comboTier = -1;
      for (let i = 0; i < config.combo.tiers.length; i++) if (g.combo >= config.combo.tiers[i]!) g.comboTier = i;
      g.addCombo(1);
    },
    win: () => {
      ensureRun();
      if (g.tut) app.skipTutorial();
      g.wave = 20;
      g.endless = false;
      g.phase = 'wave';
      g.spawnBoss('omega');
      app.banners.clear();
      const b = g.boss;
      if (b) {
        b.x = 195;
        b.y = 220;
        b.hp = 0;
        b.state = 'dead';
        g.onBossDefeated(b);
      }
    },
    lose: () => {
      ensureRun();
      g.god = false;
      g.die();
    },
    timeScale: (x) => {
      app.debugMul = Math.max(0.1, Math.min(8, Number(x) || 1));
    },
    autoplay: (on = true) => {
      g.autoplay.enabled = on;
    },
    fx: (event, x = 195, y = 400) => {
      app.fx.emit(event, x, y, 1, 0);
    },
    pause: () => app.openPause(),
    resume: () => app.resumeNow(),
    setQuality: (q) => app.setQuality(q),
    skipTutorial: () => app.skipTutorial(),
    resetSave: () => clearAll(),
    simulate: (opts) => simulate(opts),
  };
  Object.defineProperty(api, 'app', { value: app, enumerable: false });
  (window as unknown as { __game: DebugApi }).__game = api;
  const ov = new DebugOverlay(app);
  app.debugHook = (dt) => ov.update(dt);
  // ?wave=n starts straight into that wave with a matching build
  if (app.params.wave !== null) {
    const n = app.params.wave;
    const go = (): void => {
      if (!app.ready) {
        window.setTimeout(go, 50);
        return;
      }
      api.startRun({ wave: n });
    };
    go();
  }
}
