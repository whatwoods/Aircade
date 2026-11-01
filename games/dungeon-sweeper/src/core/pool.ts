/** 通用对象池：预分配，acquire / release 不产生垃圾 */
export class Pool<T> {
  private free: T[] = [];
  private make: () => T;
  constructor(make: () => T, prealloc = 0) {
    this.make = make;
    for (let i = 0; i < prealloc; i++) this.free.push(make());
  }
  acquire(): T {
    return this.free.pop() ?? this.make();
  }
  release(o: T): void {
    this.free.push(o);
  }
  get available(): number {
    return this.free.length;
  }
}
