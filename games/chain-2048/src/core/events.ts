/** 极简类型安全事件总线 */
export class Bus<M extends { [K in keyof M]: unknown }> {
  private map = new Map<keyof M, Array<(p: never) => void>>();

  on<K extends keyof M>(k: K, fn: (p: M[K]) => void): () => void {
    let arr = this.map.get(k);
    if (!arr) {
      arr = [];
      this.map.set(k, arr);
    }
    arr.push(fn as (p: never) => void);
    return () => {
      const a = this.map.get(k);
      if (!a) return;
      const i = a.indexOf(fn as (p: never) => void);
      if (i >= 0) a.splice(i, 1);
    };
  }

  emit<K extends keyof M>(k: K, p: M[K]): void {
    const arr = this.map.get(k);
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) (arr[i] as (p: M[K]) => void)(p);
  }
}
