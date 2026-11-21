// 拍摄模式（?debug=1&film=1）：逐帧时钟 + WebCodecs 直接编码画布 + OfflineAudioContext 逐帧录音效。
// 由 scripts/trailer/shoot.ts 通过 Playwright 驱动；成片素材写回 Node（window.__filmWrite）。
import { initFilmAudio } from '../audio/audio.ts';
import { sfxHook } from '../audio/sfx.ts';
import { input, setInputScale } from '../core/input.ts';
import { clock, loopCtl, manualTick } from '../core/loop.ts';
import { filmClock } from '../platform/now.ts';
import { resizeStage, stage } from '../render/stage.ts';
import { ITEMS } from '../config.ts';
import { parseBag } from '../game/enemies.ts';
import type { ItemInst, Rot } from '../game/types.ts';
import { GameScene } from '../scenes/gameScene.ts';
import { factories, setScene, sm } from '../scenes/sceneManager.ts';
import { bannerSprite, logoSprite } from '../scenes/titleScene.ts';

const FPS = 60;
const SR = 48000;
const PID = 7;

type Write = (file: string, b64: string, append: boolean) => Promise<void>;

interface Shot {
  name: string;
  frame: number;
  enc: VideoEncoder;
  pending: Uint8Array[];
  pendingBytes: number;
  first: boolean;
  actx: OfflineAudioContext;
  rendered: Promise<AudioBuffer> | null;
  /** 音效时间轴：[秒, 名字] */
  log: [number, string][];
  /** 开录时的拍摄时钟（毫秒），镜头之间时间连续 */
  t0: number;
  error: string | null;
}

let shot: Shot | null = null;
/** 拍摄模式下走过的总帧数（录制和彩排都算） */
let ticks = 0;
/** 手指：屏幕 CSS 坐标；down=按着；fade=松开后的淡出 */
const finger = { x: 0, y: 0, down: false, fade: 0, ripple: 0, show: true };

function write(): Write {
  const w = (window as unknown as { __filmWrite?: Write }).__filmWrite;
  if (!w) throw new Error('缺少 __filmWrite（需由 shoot.ts 注入）');
  return w;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

async function flushVideo(force: boolean): Promise<void> {
  const s = shot!;
  if (!s.pending.length || (!force && s.pendingBytes < 4e6)) return;
  const all = new Uint8Array(s.pendingBytes);
  let o = 0;
  for (const p of s.pending) {
    all.set(p, o);
    o += p.length;
  }
  s.pending = [];
  s.pendingBytes = 0;
  await write()(s.name + '.h264', b64(all), !s.first);
  s.first = false;
}

function drawFinger(): void {
  if (!finger.show) return;
  const a = finger.down ? 1 : finger.fade;
  if (a <= 0.01 && finger.ripple <= 0) return;
  const ctx = stage.ctx;
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  ctx.save();
  if (a > 0.01) {
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(finger.x, finger.y, finger.down ? 19 : 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85 * a;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  if (finger.ripple > 0) {
    const k = 1 - finger.ripple;
    ctx.globalAlpha = finger.ripple * 0.7;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(finger.x, finger.y, 20 + k * 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 推进一帧：音频卡到这一帧 → 游戏走一帧 → 叠手指 → 编码 */
async function stepOne(): Promise<void> {
  ticks++;
  const s = shot;
  if (!s) {
    // 没在录：空转一帧（彩排）
    filmClock.ms += 1000 / FPS;
    manualTick(filmClock.ms + 1000);
    if (!finger.down) finger.fade = Math.max(0, finger.fade - 1 / 12);
    return;
  }
  const i = s.frame;
  if (i > 0) {
    const p = s.actx.suspend(i / FPS);
    if (!s.rendered) s.rendered = s.actx.startRendering();
    else void s.actx.resume();
    await p;
  }
  filmClock.ms = s.t0 + (i * 1000) / FPS;
  manualTick(filmClock.ms + 1000);
  if (!finger.down) finger.fade = Math.max(0, finger.fade - 1 / 12);
  if (finger.ripple > 0) finger.ripple = Math.max(0, finger.ripple - 1 / 14);
  drawFinger();
  const vf = new VideoFrame(stage.canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
  s.enc.encode(vf, { keyFrame: i % 30 === 0 });
  vf.close();
  s.frame++;
  while (s.enc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 2));
  if (s.error) throw new Error(s.error);
  await flushVideo(false);
}

function ptr(type: string, x: number, y: number): void {
  const buttons = type === 'pointerup' ? 0 : 1;
  stage.canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId: PID, pointerType: 'touch', isPrimary: true, button: 0, buttons, bubbles: true, cancelable: true }),
  );
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const film = {
  /** 切到拍摄模式（停 rAF、按 dpr 渲染）；整个页面生命周期只进不出 */
  async enter(dpr: number): Promise<{ w: number; h: number }> {
    if (!loopCtl.manual) {
      loopCtl.manual = true;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      filmClock.on = true;
      clock.timeScale = 1;
    }
    stage.film = true;
    stage.dprCap = dpr;
    resizeStage();
    setInputScale(stage.s);
    stage.version++;
    return { w: stage.canvas.width, h: stage.canvas.height };
  },

  /** 不录制，只让游戏空转 n 帧（布局面、等动画落定） */
  async idle(n: number): Promise<void> {
    for (let k = 0; k < n; k++) {
      filmClock.ms += 1000 / FPS;
      manualTick(filmClock.ms + 1000);
    }
    await new Promise((r) => setTimeout(r, 0));
  },

  async begin(name: string, maxSec = 20, bitrate = 80e6): Promise<string> {
    if (shot) throw new Error('上一个镜头还没 end');
    const w = stage.canvas.width;
    const h = stage.canvas.height;
    const s = { name, log: [], t0: filmClock.ms + 1000 / FPS, frame: 0, pending: [], pendingBytes: 0, first: true, rendered: null, error: null } as unknown as Shot;
    const enc = new VideoEncoder({
      output: (chunk) => {
        const b = new Uint8Array(chunk.byteLength);
        chunk.copyTo(b);
        s.pending.push(b);
        s.pendingBytes += b.length;
      },
      error: (e) => {
        s.error = String(e);
      },
    });
    const cfg: VideoEncoderConfig = {
      codec: 'avc1.640034', width: w, height: h, bitrate, framerate: FPS, latencyMode: 'quality', avc: { format: 'annexb' },
    };
    const sup = await VideoEncoder.isConfigSupported(cfg);
    if (!sup.supported) throw new Error('编码器不支持 ' + w + '×' + h);
    enc.configure(cfg);
    s.enc = enc;
    s.actx = new OfflineAudioContext(2, Math.ceil(maxSec * SR), SR);
    initFilmAudio(s.actx);
    shot = s;
    sfxHook.fn = (n, delay) => s.log.push([+((s.frame) / FPS + delay).toFixed(3), n]);
    // 等拨弦音色等异步准备
    await new Promise((r) => setTimeout(r, 30));
    return `${w}x${h}`;
  },

  async step(n = 1): Promise<number> {
    for (let k = 0; k < n; k++) await stepOne();
    return shot ? shot.frame : -1;
  },

  get frame(): number {
    return shot ? shot.frame : -1;
  },

  /** 整个背包按 ASCII 布局换掉（同 balance-builds 的写法） */
  setBag(layout: string[], legend: Record<string, string>): number {
    const g = sm.cur;
    if (!(g instanceof GameScene)) throw new Error('不在游戏中');
    const run = g.run;
    run.bag.length = 0;
    for (const p of parseBag(layout, legend, run.nextUid)) {
      const inst: ItemInst = {
        uid: run.nextUid++, id: p.id, lv: p.lv, rot: p.rot, zone: 'bag', x: p.x, y: p.y, slot: 0,
        value: ITEMS[p.id].price * (p.lv === 1 ? 1 : p.lv === 2 ? 2 : 4), boughtStamp: 0,
      };
      run.bag.push(inst);
    }
    g.rebuild();
    return run.bag.length;
  },

  /** 改一件装备的朝向（暂存里的也行） */
  setRot(uid: number, rot: Rot): void {
    const g = sm.cur;
    if (!(g instanceof GameScene)) throw new Error('不在游戏中');
    const it = [...g.run.bag, ...g.run.stash].find((x) => x && x.uid === uid);
    if (!it) throw new Error('没有 uid ' + uid);
    it.rot = rot;
    g.rebuild();
  },

  get ticks(): number {
    return ticks;
  },

  /** 当前画面存成 PNG（不叠手指） */
  async snap(name: string): Promise<{ w: number; h: number }> {
    const url = stage.canvas.toDataURL('image/png');
    await write()(name + '.png', url.split(',')[1], false);
    return { w: stage.canvas.width, h: stage.canvas.height };
  },

  /** 标题横幅 + 字标，透明 PNG（分辨率跟当前画布 DPR） */
  async logo(name: string): Promise<{ w: number; h: number }> {
    const b = bannerSprite();
    const l = logoSprite(0);
    const c = document.createElement('canvas');
    c.width = b.c.width;
    c.height = b.c.height;
    const g = c.getContext('2d')!;
    g.drawImage(b.c, 0, 0);
    g.drawImage(l.c, 0, 0);
    await write()(name + '.png', c.toDataURL('image/png').split(',')[1], false);
    return { w: c.width, h: c.height };
  },

  /** 回到标题页 */
  title(): void {
    setScene(factories.title());
  },

  async end(): Promise<{ frames: number; sec: number }> {
    const s = shot!;
    await s.enc.flush();
    s.enc.close();
    await flushVideo(true);
    let buf: AudioBuffer;
    if (s.rendered) {
      void s.actx.resume();
      buf = await s.rendered;
    } else buf = await s.actx.startRendering();
    const n = Math.min(buf.length, Math.round((s.frame / FPS) * SR));
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const wav = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o: number, t: string): void => {
      for (let i = 0; i < t.length; i++) wav.setUint8(o + i, t.charCodeAt(i));
    };
    str(0, 'RIFF');
    wav.setUint32(4, 36 + n * 4, true);
    str(8, 'WAVEfmt ');
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, 2, true);
    wav.setUint32(24, SR, true);
    wav.setUint32(28, SR * 4, true);
    wav.setUint16(32, 4, true);
    wav.setUint16(34, 16, true);
    str(36, 'data');
    wav.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    await write()(s.name + '.wav', b64(new Uint8Array(wav.buffer)), false);
    sfxHook.fn = null;
    await write()(s.name + '.events.json', btoa(unescape(encodeURIComponent(JSON.stringify(s.log)))), false);
    shot = null;
    return { frames: s.frame, sec: s.frame / FPS };
  },

  // —— 手指（CSS 坐标），每个动作都按帧推进 ——
  showFinger(on: boolean): void {
    finger.show = on;
  },

  async press(x: number, y: number, hold = 6): Promise<void> {
    finger.x = x;
    finger.y = y;
    finger.down = true;
    finger.ripple = 1;
    ptr('pointerdown', x, y);
    await film.step(hold);
  },

  async moveTo(x: number, y: number, frames: number, arc = 0): Promise<void> {
    const x0 = finger.x;
    const y0 = finger.y;
    // 二次贝塞尔：控制点在中垂线上偏 arc 像素，路径带一点弧度更像手
    const mx = (x0 + x) / 2;
    const my = (y0 + y) / 2;
    const len = Math.hypot(x - x0, y - y0) || 1;
    const cx = mx + (-(y - y0) / len) * arc;
    const cy = my + ((x - x0) / len) * arc;
    for (let k = 1; k <= frames; k++) {
      const t = ease(k / frames);
      const u = 1 - t;
      finger.x = u * u * x0 + 2 * u * t * cx + t * t * x;
      finger.y = u * u * y0 + 2 * u * t * cy + t * t * y;
      if (finger.down) ptr('pointermove', finger.x, finger.y);
      await film.step(1);
    }
  },

  async release(hold = 0): Promise<void> {
    finger.down = false;
    finger.fade = 1;
    ptr('pointerup', finger.x, finger.y);
    if (hold) await film.step(hold);
  },

  async tap(x: number, y: number, after = 8): Promise<void> {
    await film.press(x, y, 3);
    await film.release(after);
  },

  /** 拖拽中旋转（等同 R 键） */
  rotate(): void {
    input.handler?.rotate();
  },
};

export function installFilm(): void {
  (window as unknown as { __film: typeof film }).__film = film;
}
