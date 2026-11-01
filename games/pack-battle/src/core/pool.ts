// 泛型对象池：热路径零分配
export class Pool<T> {
  private free: T[] = [];
  readonly live: T[] = [];
  private make: () => T;
  readonly cap: number;
  constructor(make: () => T, cap: number, prefill = 0) {
    this.make = make;
    this.cap = cap;
    for (let i = 0; i < prefill; i++) this.free.push(make());
  }
  /** 取出一个对象；超过上限时复用最老的 */
  get(): T {
    let o: T;
    if (this.live.length >= this.cap) {
      o = this.live.shift()!;
    } else o = this.free.pop() ?? this.make();
    this.live.push(o);
    return o;
  }
  /** 按下标释放（交换删除，O(1)） */
  releaseAt(i: number): void {
    const o = this.live[i];
    const last = this.live.length - 1;
    if (i !== last) this.live[i] = this.live[last];
    this.live.length = last;
    this.free.push(o);
  }
  clear(): void {
    for (const o of this.live) this.free.push(o);
    this.live.length = 0;
  }
  get size(): number {
    return this.live.length;
  }
}
