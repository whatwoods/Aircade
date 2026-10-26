import { type Ease, clamp01, linear } from './ease';

/** 数值通道：tween 的目标，避免用字符串属性名反射 */
export class Channel {
  v: number;
  constructor(v = 0) {
    this.v = v;
  }
}

interface TweenSlot {
  ch: Channel | null;
  from: number;
  to: number;
  start: number;
  dur: number;
  ease: Ease;
}

/**
 * 池化 tween（上限 256，文档 §2/§9）：只驱动 Channel.v，每帧零分配。
 * 同一 Channel 新的 tween 会覆盖旧的。
 */
export class Tweens {
  private slots: TweenSlot[] = [];
  private active = 0;
  constructor(cap = 256) {
    for (let i = 0; i < cap; i++) this.slots.push({ ch: null, from: 0, to: 0, start: 0, dur: 1, ease: linear });
  }

  to(ch: Channel, to: number, dur: number, now: number, ease: Ease = linear, delay = 0): void {
    // 覆盖已有
    for (let i = 0; i < this.active; i++) {
      const s = this.slots[i];
      if (s.ch === ch) {
        s.from = ch.v;
        s.to = to;
        s.start = now + delay;
        s.dur = Math.max(1, dur);
        s.ease = ease;
        return;
      }
    }
    if (this.active >= this.slots.length) {
      ch.v = to;
      return;
    }
    const s = this.slots[this.active++];
    s.ch = ch;
    s.from = ch.v;
    s.to = to;
    s.start = now + delay;
    s.dur = Math.max(1, dur);
    s.ease = ease;
  }

  set(ch: Channel, v: number): void {
    this.kill(ch);
    ch.v = v;
  }

  kill(ch: Channel): void {
    for (let i = 0; i < this.active; i++) {
      if (this.slots[i].ch === ch) {
        this.removeAt(i);
        return;
      }
    }
  }

  private removeAt(i: number): void {
    const last = this.active - 1;
    const tmp = this.slots[i];
    this.slots[i] = this.slots[last];
    this.slots[last] = tmp;
    tmp.ch = null;
    this.active--;
  }

  update(now: number): void {
    for (let i = 0; i < this.active; i++) {
      const s = this.slots[i];
      if (now < s.start) continue;
      const t = clamp01((now - s.start) / s.dur);
      s.ch!.v = s.from + (s.to - s.from) * s.ease(t);
      if (t >= 1) {
        this.removeAt(i);
        i--;
      }
    }
  }

  get count(): number {
    return this.active;
  }

  clear(): void {
    for (let i = 0; i < this.active; i++) this.slots[i].ch = null;
    this.active = 0;
  }
}
