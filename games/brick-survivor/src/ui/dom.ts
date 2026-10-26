// Tiny DOM helpers: element creation, cached text writes, tap handling with press feedback.
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error('missing #' + id);
  return e as T;
}

/** text node writer that only touches the DOM when the value changes */
export class TextSlot {
  private v: string | number | null = null;
  constructor(private e: HTMLElement) {}
  set(v: string | number): void {
    if (v === this.v) return;
    this.v = v;
    this.e.textContent = String(v);
  }
}

let uiSound: (() => void) | null = null;
/** global hook for button press sfx/haptics (set by the app) */
export function setUiSound(fn: () => void): void {
  uiSound = fn;
}

/**
 * Tap handler: requires a pointerdown *and* pointerup on the element (no drag-release misfires),
 * keyboard activation via click. `guard` can veto (input locks).
 */
export function onTap(e: HTMLElement, fn: (ev: Event) => void, guard?: () => boolean): void {
  let downId = -1;
  let fired = false;
  e.addEventListener('pointerdown', (ev) => {
    downId = ev.pointerId;
    fired = false;
    e.classList.add('down');
  });
  const clear = (): void => {
    downId = -1;
    e.classList.remove('down');
  };
  e.addEventListener('pointerup', (ev) => {
    const ok = downId === ev.pointerId;
    clear();
    if (!ok) return;
    if (guard && !guard()) return;
    fired = true;
    uiSound?.();
    fn(ev);
  });
  e.addEventListener('pointercancel', clear);
  e.addEventListener('pointerleave', clear);
  e.addEventListener('click', (ev) => {
    // keyboard (Enter/Space) or synthetic clicks without a pointer sequence
    if (fired) {
      fired = false;
      return;
    }
    if ((ev as MouseEvent).detail > 0 && downId !== -1) return;
    if ((ev as MouseEvent).detail > 0) return;
    if (guard && !guard()) return;
    uiSound?.();
    fn(ev);
  });
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export function setScene(s: string): void {
  if (document.body.dataset.scene !== s) document.body.dataset.scene = s;
}
