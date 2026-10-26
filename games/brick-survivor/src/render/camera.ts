// Trauma shake (offset 9u·t², rotation 1°·t², 18 Hz seeded value noise), zoom focus, advance nudge.
import { juiceRules } from '../config';
import { settings } from '../core/settings';

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i + seed) * (1 - u) + hash(i + 1 + seed) * u) * 2 - 1;
}

export class Camera {
  trauma = 0;
  /** small-tier contributions accumulated this frame (capped) */
  private smallThisFrame = 0;
  t = 0;
  ox = 0;
  oy = 0;
  rot = 0;
  zoom = 1;
  zoomTarget = 1;
  focusX = 195;
  focusY = 422;
  nudge = 0;

  addTrauma(v: number, tier: number): void {
    if (!settings.shake || v <= 0) return;
    if (tier <= 2) {
      const room = juiceRules.smallTierCapPerFrame - this.smallThisFrame;
      if (room <= 0) return;
      v = Math.min(v, room);
      this.smallThisFrame += v;
    }
    this.trauma = Math.min(1, this.trauma + v);
  }

  update(realDt: number): void {
    this.smallThisFrame = 0;
    this.t += realDt;
    this.trauma = Math.max(0, this.trauma - juiceRules.traumaDecay * realDt);
    const s = settings.shake ? this.trauma * this.trauma : 0;
    const f = this.t * juiceRules.traumaFreq;
    this.ox = juiceRules.traumaOffset * s * noise1(f, 1.3);
    this.oy = juiceRules.traumaOffset * s * noise1(f, 7.9);
    this.rot = ((juiceRules.traumaRotDeg * Math.PI) / 180) * s * noise1(f, 4.1);
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-6 * realDt));
    this.nudge *= Math.exp(-14 * realDt);
  }

  reset(): void {
    this.trauma = 0;
    this.zoom = this.zoomTarget = 1;
    this.nudge = 0;
  }
}
