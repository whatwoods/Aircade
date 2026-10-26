// 轻量事件总线：规则/交互层 → 表现层（音效、特效）
type Fn = (a?: unknown) => void;
const map = new Map<string, Fn[]>();

export const bus = {
  on(name: string, fn: Fn): void {
    let l = map.get(name);
    if (!l) map.set(name, (l = []));
    l.push(fn);
  },
  emit(name: string, a?: unknown): void {
    const l = map.get(name);
    if (l) for (let i = 0; i < l.length; i++) l[i](a);
  },
};
