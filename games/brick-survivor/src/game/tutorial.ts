// First-run tutorial director (~30 s, taught in play) — docs §6.3.
import { config } from '../config';
import type { Game } from './game';

const T = config.tutorial;

export type TutHint = 't0' | 't1' | 't2' | 't3' | 't3miss' | 't4' | 't5' | 'ready' | '';

export class Tutorial {
  step = 0;
  t = 0;
  hint: TutHint = 't0';
  done = false;
  misses = 0;
  missHinted = false;
  gemsAt = 0;
  levelGranted = false;
  breached = false;
  checkPulse = 0;
  constructor(private g: Game) {}

  start(): void {
    const g = this.g;
    this.step = 0;
    this.t = 0;
    this.hint = 't0';
    g.balls.canFire = false;
    g.formation.mode = 'hold';
    g.player.movedTotal = 0;
  }

  private go(step: number, hint: TutHint): void {
    this.step = step;
    this.t = 0;
    this.hint = hint;
    this.checkPulse = 1;
    this.g.sink.emit('uiPress', 195, 600, 1, 0);
  }

  onCatch(): void {
    if (this.step === 3) this.go(4, 't4');
  }
  onMiss(): void {
    if (this.step === 3) this.misses++;
  }
  onBreach(): void {
    this.breached = true;
  }

  update(dt: number): void {
    const g = this.g;
    const f = g.formation;
    this.t += dt;
    if (this.checkPulse > 0) this.checkPulse = Math.max(0, this.checkPulse - dt * 2);
    switch (this.step) {
      case 0:
        if (g.player.movedTotal >= T.dragNeed) {
          this.go(1, 't1');
          const r = f.rowAbsForDisplay(Math.round((T.brickRowY - config.field.ceilY) / config.grid.cellH));
          for (const c of [1, 3, 5]) f.spawn('basic', c, r, T.brickHp);
          g.balls.canFire = true;
        }
        break;
      case 1:
        if (f.aliveCount === 0 && this.t > 0.3) {
          this.go(2, 't2');
          this.gemsAt = g.runStats.gems;
        }
        break;
      case 2:
        if (g.runStats.gems - this.gemsAt >= T.gemNeed || this.t >= T.gemTimeout) {
          this.go(3, 't3');
          this.misses = 0;
          this.missHinted = false;
        }
        break;
      case 3:
        if (this.misses >= 2 && !this.missHinted) {
          this.missHinted = true;
          this.hint = 't3miss';
          this.t = 0;
        }
        if (this.missHinted && this.t > 1.8) this.go(4, 't4');
        break;
      case 4:
        if (!this.levelGranted) {
          this.levelGranted = true;
          g.forcedCards = ['multi', 'fire', 'ice'];
          g.addXp(Math.max(0, g.xpToNext() - g.xp) + 0.01);
        } else if (g.pendingLevelUps === 0 && g.levelUpsTaken > 0 && this.t > 0.2) {
          this.go(5, 't5');
          const k = Math.round((600 - config.field.ceilY) / config.grid.cellH);
          const r = f.rowAbsForDisplay(k);
          for (let c = 0; c < config.grid.cols; c++) f.spawn('basic', c, r, T.brickHp * 2);
          f.mode = 'fixed';
          f.fixedBeats = T.rowBeats;
          f.stepTimer = 0;
          f.armed = false;
          f.refreshWarnings();
          this.breached = false;
        }
        break;
      case 5:
        if ((f.aliveCount === 0 || this.breached) && !f.sliding) {
          f.mode = 'hold';
          this.go(6, 'ready');
        }
        break;
      case 6:
        if (this.t >= T.readyTime) {
          this.done = true;
          this.step = 7;
          this.hint = '';
          g.finishTutorial();
        }
        break;
    }
  }
}
