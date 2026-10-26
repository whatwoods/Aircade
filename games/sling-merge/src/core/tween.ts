import { ease, type EaseName } from './math';

/** 一维弹簧（半隐式欧拉） */
export class Spring {
  value: number;
  target: number;
  vel = 0;
  freq: number;
  damping: number;

  constructor(value: number, freq = 4, damping = 0.5) {
    this.value = value;
    this.target = value;
    this.freq = freq;
    this.damping = damping;
  }

  update(dt: number): number {
    if (dt <= 0) return this.value;
    const w = 2 * Math.PI * this.freq;
    const steps = Math.min(16, Math.max(1, Math.ceil(dt * w * 2.5)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = w * w * (this.target - this.value) - 2 * this.damping * w * this.vel;
      this.vel += acc * h;
      this.value += this.vel * h;
    }
    return this.value;
  }

  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.vel = 0;
  }

  kick(v: number): void {
    this.vel += v;
  }
}

interface TweenSlot {
  active: boolean;
  t: number;
  dur: number;
  delay: number;
  from: number;
  to: number;
  ease: (t: number) => number;
  onUpdate: ((v: number) => void) | null;
  onDone: (() => void) | null;
  tag: number;
}

/** 补间池（固定容量，不在帧内分配槽位） */
export class Tweens {
  private slots: TweenSlot[] = [];

  constructor(cap = 96) {
    for (let i = 0; i < cap; i++) {
      this.slots.push({ active: false, t: 0, dur: 1, delay: 0, from: 0, to: 1, ease: ease.linear, onUpdate: null, onDone: null, tag: 0 });
    }
  }

  add(
    from: number,
    to: number,
    dur: number,
    easeName: EaseName,
    onUpdate: (v: number) => void,
    onDone: (() => void) | null = null,
    delay = 0,
    tag = 0,
  ): void {
    let slot: TweenSlot | null = null;
    for (const s of this.slots) {
      if (!s.active) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      slot = { active: false, t: 0, dur: 1, delay: 0, from: 0, to: 1, ease: ease.linear, onUpdate: null, onDone: null, tag: 0 };
      this.slots.push(slot);
    }
    slot.active = true;
    slot.t = 0;
    slot.dur = Math.max(0.0001, dur);
    slot.delay = delay;
    slot.from = from;
    slot.to = to;
    slot.ease = ease[easeName];
    slot.onUpdate = onUpdate;
    slot.onDone = onDone;
    slot.tag = tag;
    if (delay <= 0) onUpdate(from);
  }

  cancelTag(tag: number): void {
    for (const s of this.slots) if (s.active && s.tag === tag) s.active = false;
  }

  clear(): void {
    for (const s of this.slots) s.active = false;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      let h = dt;
      if (s.delay > 0) {
        s.delay -= dt;
        if (s.delay > 0) continue;
        h = -s.delay;
        s.delay = 0;
      }
      s.t += h;
      const k = s.t >= s.dur ? 1 : s.t / s.dur;
      const v = s.from + (s.to - s.from) * s.ease(k);
      s.onUpdate?.(v);
      if (k >= 1) {
        s.active = false;
        const done = s.onDone;
        s.onDone = null;
        s.onUpdate = null;
        done?.();
      }
    }
  }
}
