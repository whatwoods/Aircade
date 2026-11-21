// 快手运行时冒烟测试：在只有 ECMAScript 内置对象的 vm 里按 game.js 的 require 顺序执行整个包，
// 用最小的 ks 桩代替平台；没有 DOM、URLSearchParams、structuredClone、fetch 等浏览器全局。
// 跑若干帧并点一下「开始冒险」，任何未捕获异常或 console.error 都算失败；再静态检查包里用到的全局名。
// 用法：node scripts/yoola/smoke.mjs [package 目录]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PKG = path.resolve(process.argv[2] || 'yoola/package');
const W = 414, H = 896, DPR = 3; // 与 H5 预览同尺寸，点位比例可直接从预览截图量
const problems = [];

// 任意属性、任意调用都成立的空对象（2D 上下文、渐变等）；then 必须是 undefined，免得被当成 Promise
const drawn = new Set();
const CTX_DEFAULTS = {
  globalAlpha: 1, lineWidth: 1, miterLimit: 10, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, lineDashOffset: 0,
  fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
  globalCompositeOperation: 'source-over', lineCap: 'butt', lineJoin: 'miter', filter: 'none', imageSmoothingEnabled: true,
};
function anyObj(name) {
  const fn = function () {};
  const store = Object.create(null);
  return new Proxy(fn, {
    get(_t, k) {
      if (k === 'then' || k === Symbol.toPrimitive || k === Symbol.iterator) return undefined;
      if (typeof k === 'string' && k in store) return store[k];
      if (typeof k === 'string' && k in CTX_DEFAULTS) return CTX_DEFAULTS[k];
      // 假设快手 2D 没有 roundRect：只认游戏自己补上的那个（补在原型或实例上）
      if (k === 'roundRect') return store.roundRect || Object.getPrototypeOf(fn).roundRect;
      if (k === 'getLineDash') return () => [];
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === 'canvas') return undefined;
      if (k === 'fillText') return (t) => { drawn.add(String(t)); };
      return anyObj(name + '.' + String(k));
    },
    set(_t, k, v) { if (typeof k === 'string') store[k] = v; return true; },
    apply() { return anyObj(name + '()'); },
  });
}

// ks-adapter 会改写 canvas.__proto__.__proto__，所以画布要有自己的原型链
class CanvasBase {}
class KsCanvas extends CanvasBase {}
function makeCanvas(main) {
  const c = Object.assign(new KsCanvas(), {
    width: main ? W * DPR : 300, height: main ? H * DPR : 150, style: {},
    getContext(type) {
      if (type !== '2d') return null; // 模拟「一块画布只有一种上下文」：只给 2d
      return this._ctx || (this._ctx = anyObj('ctx2d'));
    },
    getBoundingClientRect: () => ({ top: 0, left: 0, width: W, height: H }),
    addEventListener() {}, removeEventListener() {},
    toTempFilePathSync: () => 'tmp.png',
  });
  return c;
}

let canvasCount = 0;
let mainCanvas = null;
const touchHandlers = { start: [], move: [], end: [], cancel: [] };
const timers = [];
let rafQueue = [];
let clock = 0;

const storage = new Map();
const ks = {
  env: { USER_DATA_PATH: 'ksfile://usr' },
  createCanvas: () => {
    const c = makeCanvas(canvasCount++ === 0);
    mainCanvas ??= c;
    return c;
  },
  createImage() {
    const img = { width: 64, height: 64, onload: null, onerror: null };
    let src = '';
    Object.defineProperty(img, 'src', {
      get: () => src,
      set(v) {
        src = v;
        const p = path.join(PKG, String(v));
        timers.push({ at: clock, fn: () => (fs.existsSync(p) ? img.onload?.() : (problems.push('图片不存在: ' + v), img.onerror?.(new Error(v)))) });
      },
    });
    return img;
  },
  getSystemInfoSync: () => ({
    windowWidth: W, windowHeight: H, screenWidth: W, screenHeight: H, pixelRatio: DPR,
    platform: 'android', system: 'Android 14', safeArea: { top: 0, bottom: H, left: 0, right: W, width: W, height: H },
    statusBarHeight: 0,
  }),
  getPerformance: () => ({ now: () => clock * 1000 }), // 真机返回微秒
  getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 82, left: W - 100, right: W - 10, width: 90, height: 32 }),
  loadFont: (p) => (fs.existsSync(path.join(PKG, p)) ? 'KsFont-' + path.basename(p) : (problems.push('字体不存在: ' + p), null)),
  onTouchStart: (f) => touchHandlers.start.push(f), onTouchMove: (f) => touchHandlers.move.push(f),
  onTouchEnd: (f) => touchHandlers.end.push(f), onTouchCancel: (f) => touchHandlers.cancel.push(f),
  offTouchStart() {}, offTouchMove() {}, offTouchEnd() {}, offTouchCancel() {},
  onShow() {}, onHide() {}, offShow() {}, offHide() {},
  setStorageSync: (k, v) => storage.set(k, v), getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  removeStorageSync: (k) => storage.delete(k), getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  createInnerAudioContext() {
    const a = anyObj('audio');
    return a;
  },
  getFileSystemManager: () => anyObj('fs'),
  setPreferredFramesPerSecond() {},
  vibrateShort() {}, vibrateLong() {},
  createRewardedVideoAd: () => anyObj('ad'),
  shareAppMessage() {},
  login: (o) => o && o.success && o.success({ code: 'x' }),
  onMemoryWarning() {}, onError() {}, onUnhandledRejection() {},
};
const ksProxy = new Proxy(ks, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'string') problems.push('用到未模拟的 ks.' + k + '（只是提示）');
    return undefined;
  },
});

const sandbox = {
  ks: ksProxy,
  console: {
    log() {}, info() {}, debug() {},
    warn: (...a) => { if (process.env.VERBOSE) console.warn('[warn]', ...a); },
    error: (...a) => {
      const msg = a.map((x) => (x && x.stack) || String(x)).join(' ');
      if (/WebGL not supported/.test(msg)) return; // 2D 方案下预期出现，文档说明可忽略
      problems.push('console.error: ' + msg);
    },
  },
  setTimeout: (fn, ms = 0) => { timers.push({ at: clock + ms / 1000, fn }); return timers.length; },
  clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame() {},
};
sandbox.window = sandbox;
sandbox.GameGlobal = sandbox;
sandbox.__clockMs = () => 1.7e12 + clock * 1000;
const ctx = vm.createContext(sandbox);
// Date.now 跟着模拟时钟走，否则 _now 的单位校准会拿真实时间和模拟时间比
vm.runInContext('Date.now = function () { return __clockMs(); };', ctx);

// 快手侧 CommonJS：路径相对包根
const cache = new Map();
function req(p) {
  const rel = p.replace(/^\.\//, '');
  const full = path.join(PKG, rel.endsWith('.js') ? rel : rel + '.js');
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} };
  cache.set(full, module);
  const code = fs.readFileSync(full, 'utf8');
  const wrapped = vm.runInContext('(function (require, module, exports) {' + code + '\n})', ctx, { filename: rel });
  wrapped(req, module, module.exports);
  return module.exports;
}

function step(n) {
  for (let i = 0; i < n; i++) {
    clock += 1 / 60;
    for (let j = 0; j < timers.length; j++) {
      if (timers[j] && timers[j].at <= clock) { const t = timers[j]; timers[j] = null; t.fn(); }
    }
    const q = rafQueue; rafQueue = [];
    for (const f of q) f(clock * 1000);
  }
}

function tap(x, y) {
  const t = { identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y };
  const ev = { touches: [t], changedTouches: [t], timeStamp: clock * 1000 };
  touchHandlers.start.forEach((f) => f(ev));
  step(3);
  const ev2 = { touches: [], changedTouches: [t], timeStamp: clock * 1000 };
  touchHandlers.end.forEach((f) => f(ev2));
  step(3);
}

// 静态检查：只带 ES 标准库给包类型检查，"找不到名字"的就是要靠运行时提供的全局；
// 快手运行时（经 ks-adapter）有的才放行，其余一律算错（URLSearchParams、structuredClone、DOMMatrix 都栽在这）
const RUNTIME_GLOBALS = new Set(['window', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'document', 'matchMedia']);
async function freeGlobals(file) {
  const { createRequire } = await import('node:module');
  const ts = createRequire(import.meta.url)('typescript');
  const prog = ts.createProgram([file], { allowJs: true, checkJs: true, noEmit: true, lib: ['lib.es2020.d.ts'], types: [], target: ts.ScriptTarget.ES5 });
  const names = new Set();
  for (const d of ts.getPreEmitDiagnostics(prog)) {
    if (![2304, 2552, 2580, 2582, 2583, 2584].includes(d.code)) continue;
    const m = /'([^']+)'/.exec(ts.flattenDiagnosticMessageText(d.messageText, ' '));
    if (m) names.add(m[1]);
  }
  return [...names].filter((n) => !RUNTIME_GLOBALS.has(n));
}

const ARRANGE_MARK = '行商摊位';
let crashed = null;
let reachedArrange = false;
try {
  req('game.js');
  step(120);
  if (!drawn.has('开始冒险')) problems.push('标题页没画出来');
  // 桩里的 getSystemInfoSync 故意只给 pixelRatio（部分快手版本就是这样），画布仍要按 3 倍渲染
  if (mainCanvas && mainCanvas.width !== W * DPR) problems.push(`主画布宽 ${mainCanvas.width}，应为 ${W * DPR}（DPR 没取到，画面会发糊）`);
  drawn.clear();
  tap(W / 2, H * 0.796); // 开始冒险（比例按 414×896 预览量的）
  step(120);
  reachedArrange = drawn.has(ARRANGE_MARK);
  if (!reachedArrange) problems.push('点「开始冒险」后没进整理背包');
} catch (e) {
  crashed = e;
}
for (const n of await freeGlobals(path.join(PKG, 'gameplay/pack-battle.js'))) problems.push('用到快手运行时没有的全局: ' + n);

const hints = problems.filter((p) => p.includes('只是提示'));
const errors = problems.filter((p) => !p.includes('只是提示'));
if (process.env.VERBOSE) for (const h of [...new Set(hints)]) console.log('提示 ' + h);
if (crashed) console.log('✗ 崩溃 ' + (crashed.stack || crashed));
for (const e of errors) console.log('✗ ' + e);
if (!crashed && !errors.length) console.log('✓ 快手运行时冒烟：加载、标题页、进入整理背包都正常；全局 API 检查通过');
process.exit(crashed || errors.length ? 1 : 0);
