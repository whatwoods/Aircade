/** DOM 小工具 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function btn(cls: string, text: string, onClick: () => void, label = ''): HTMLButtonElement {
  const b = h('button', 'btn ' + cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export const $ = (id: string): HTMLElement => document.getElementById(id)!;
