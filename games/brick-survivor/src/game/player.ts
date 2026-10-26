// Prism core: follow movement, keyboard drive, i-frames, breach barrier (docs §3.3, §3.10.2 aegis).
import { config } from '../config';
import type { Game } from './game';

const P = config.player;
const F = config.field;
const I = config.input;

export class Player {
  x = 195;
  px = 195;
  vx = 0;
  targetX = 195;
  keyAxis = 0;
  keyVel = 0;
  hp: number = P.maxHp;
  iFramesT = 0;
  barrierReady = false;
  barrierT = 0;
  alive = true;
  movedTotal = 0;
  // presentation impulses
  recoil = 0;
  squash = 0;
  hitT = 0;
  constructor(private g: Game) {}

  reset(): void {
    this.x = this.px = this.targetX = 195;
    this.vx = 0;
    this.keyAxis = 0;
    this.keyVel = 0;
    this.hp = this.g.stats.maxHp;
    this.iFramesT = 0;
    this.barrierReady = false;
    this.barrierT = 0;
    this.alive = true;
    this.movedTotal = 0;
    this.recoil = 0;
    this.squash = 0;
    this.hitT = 0;
  }

  half(): number {
    return this.g.stats.paddleW * 0.5;
  }

  update(dt: number): void {
    const g = this.g;
    this.px = this.x;
    const half = this.half();
    const lo = F.wallL + half;
    const hi = F.wallR - half;
    // keyboard: accelerate target velocity
    const want = this.keyAxis * I.keySpeed;
    const dv = want - this.keyVel;
    const maxDv = I.keyAccel * dt;
    this.keyVel += Math.max(-maxDv, Math.min(maxDv, dv));
    if (this.keyAxis === 0 && Math.abs(this.keyVel) < 1) this.keyVel = 0;
    if (this.keyVel !== 0) this.targetX += this.keyVel * dt;
    this.targetX = Math.max(lo, Math.min(hi, this.targetX));
    if (this.alive) {
      let step = (this.targetX - this.x) * (1 - Math.exp(-P.follow * dt));
      const maxStep = P.maxSpeed * dt;
      if (step > maxStep) step = maxStep;
      else if (step < -maxStep) step = -maxStep;
      this.x = Math.max(lo, Math.min(hi, this.x + step));
    }
    const inst = (this.x - this.px) / dt;
    this.vx += (inst - this.vx) * Math.min(1, dt * 40);
    this.movedTotal += Math.abs(this.x - this.px);
    if (this.iFramesT > 0) this.iFramesT -= dt;
    if (this.hitT > 0) this.hitT -= dt;
    // barrier
    const cd = g.stats.barrierCd;
    if (cd > 0 && !this.barrierReady) {
      this.barrierT += dt;
      if (this.barrierT >= cd) {
        this.barrierReady = true;
        this.barrierT = 0;
        g.sink.emit('barrierReady', 195, F.dangerY, 0, 0);
      }
    }
  }

  useBarrier(): void {
    this.barrierReady = false;
    this.barrierT = 0;
  }
}
