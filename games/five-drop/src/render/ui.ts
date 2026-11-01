// 画在 Canvas 里的控件：按钮、面板、开关；记录可点区域供输入与 __game.ui() 使用
import { C, fCn, fNum } from './theme.ts';
import { roundRect } from './scenery.ts';
import { easeOutBack } from '../util/ease.ts';

export interface Hit { id: string; x: number; y: number; w: number; h: number; enabled: boolean; onPress: () => void; circle?: boolean }

export class UI {
  hits: Hit[] = [];
  private next: Hit[] = [];
  /** 按下态：id → 时间 */
  pressT = new Map<string, number>();
  private downId = new Map<number, string>();
  time = 0;

  begin(): void { this.next = []; }
  end(): void { this.hits = this.next; }
  add(h: Hit): void { this.next.push(h); }

  find(x: number, y: number): Hit | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  }
  /** 按下即触发（底部操作按钮）或抬起触发（菜单按钮） */
  down(x: number, y: number, pid: number): boolean {
    const h = this.find(x, y);
    if (!h) return false;
    if (!h.enabled) return true;
    this.pressT.set(h.id, this.time);
    this.downId.set(pid, h.id);
    if (h.id.startsWith('btn.') && ACT_ON_DOWN.has(h.id)) h.onPress();
    return true;
  }
  up(x: number, y: number, pid: number): void {
    const id = this.downId.get(pid);
    this.downId.delete(pid);
    if (!id) return;
    if (ACT_ON_DOWN.has(id)) return;
    const h = this.find(x, y);
    if (h && h.id === id && h.enabled) h.onPress();
  }
  pressAmount(id: string): number {
    const t = this.pressT.get(id);
    if (t === undefined) return 0;
    const dt = this.time - t;
    if (dt < 0.06) return dt / 0.06;
    if (dt < 0.24) return 1 - easeOutBack((dt - 0.06) / 0.18);
    this.pressT.delete(id);
    return 0;
  }
}

/** 这些按钮在 pointerdown 时立即触发（游戏操作要快） */
export const ACT_ON_DOWN = new Set(['btn.hold', 'btn.ccw', 'btn.invert', 'btn.cw', 'btn.drop']);

export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(46,57,69,0.97)';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= alpha;
  const gr = ctx.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, 'rgba(255,255,255,0.06)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = C.panelLine;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

export function drawButton(ctx: CanvasRenderingContext2D, ui: UI, id: string, x: number, y: number, w: number, h: number, label: string, primary: boolean, onPress: () => void, opts: { enabled?: boolean; glow?: number; alpha?: number; sub?: string } = {}): void {
  const enabled = opts.enabled ?? true;
  ui.add({ id, x, y, w, h, enabled, onPress });
  const p = ui.pressAmount(id);
  const s = 1 - 0.06 * p;
  ctx.save();
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  if (primary) {
    if (opts.glow) {
      ctx.save();
      ctx.shadowColor = `rgba(127,219,255,${0.45 * opts.glow})`;
      ctx.shadowBlur = 26;
      ctx.fillStyle = C.text1;
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = p > 0 ? '#FFFFFF' : C.text1;
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#1B232B';
  } else {
    ctx.fillStyle = p > 0 ? 'rgba(127,219,255,0.16)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(ctx, -w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, h / 2);
    ctx.stroke();
    ctx.fillStyle = enabled ? C.text1 : C.text3;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fCn(600, 17);
  ctx.fillText(label, 0, opts.sub ? -6 : 1);
  if (opts.sub) {
    ctx.font = fNum(600, 10);
    ctx.globalAlpha *= 0.6;
    ctx.fillText(opts.sub, 0, 12);
  }
  ctx.restore();
}

export function drawToggle(ctx: CanvasRenderingContext2D, x: number, y: number, on: number): void {
  // on: 0..1 补间值
  const w = 44, h = 26;
  ctx.fillStyle = `rgba(${Math.round(255 - 128 * on)},${Math.round(255 - 36 * on)},255,${0.12 + 0.5 * on})`;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = on > 0.5 ? '#FFFFFF' : C.text2;
  ctx.beginPath();
  ctx.arc(x + h / 2 + (w - h) * on, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
}

/** 避头尾：断点 cut 之后不以闭合标点开头、之前不以开引号结尾 */
const NO_START = '」』）)。，、；：！？…';
const NO_END = '「『（(';
export function kinsokuCut(s: string, cut: number): number {
  let c = cut;
  while (c < s.length && NO_START.includes(s[c])) c++;
  while (c > 1 && NO_END.includes(s[c - 1])) c--;
  return c <= 0 || c >= s.length ? cut : c;
}

/** 按宽度逐字折行（中文），带避头尾 */
export function wrapText(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length && ctx.measureText(rest).width > maxW) {
    let n = 1;
    while (n < rest.length && ctx.measureText(rest.slice(0, n + 1)).width <= maxW) n++;
    // 避头：下一行不以闭合标点开头（允许挤进一个标点）；避尾：本行不以开引号结尾
    if (n < rest.length && NO_START.includes(rest[n])) n++;
    while (n > 1 && NO_END.includes(rest[n - 1])) n--;
    out.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  if (rest.length) out.push(rest);
  return out;
}
