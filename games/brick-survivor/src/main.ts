// Entry: styles, fonts (≤ 1.5 s wait, late arrival re-bakes glyphs), WebGL probe (no-WebGL screen), atlas bake in
// idle chunks, the app, and the debug module on ?debug=1 (docs §2.7, §8, §10.2).
import './ui/styles.css';
import orb700 from '@fontsource/orbitron/files/orbitron-latin-700-normal.woff2?url';
import orb900 from '@fontsource/orbitron/files/orbitron-latin-900-normal.woff2?url';
import raj600 from '@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2?url';
import raj700 from '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url';
import { GLContext } from './render/gl';
import { bakeAll } from './render/sprites';
import type { Atlas } from './render/atlas';
import type { Sprites } from './render/sprites';
import { App } from './app';
import type { AppParams } from './app';
import type { QualityId } from './types';

function readParams(): AppParams {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(window.location.search);
  } catch {
    q = new URLSearchParams();
  }
  const int = (k: string): number | null => {
    const v = q.get(k);
    if (v === null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const qual = q.get('quality');
  const tut = q.get('tutorial');
  const debug = q.get('debug') === '1';
  const wave = int('wave');
  return {
    debug,
    seed: int('seed') !== null ? (int('seed')! >>> 0) : null,
    wave: debug && wave !== null && wave >= 1 ? Math.min(99, wave) : null,
    autoplay: debug && q.get('autoplay') === '1',
    quality: qual === 'high' || qual === 'mid' || qual === 'low' ? (qual as QualityId) : null,
    tutorial: tut === '1' ? true : tut === '0' ? false : null,
  };
}

/** register the four faces; resolves true when loaded, false on timeout / failure. `late` fires if they land later */
function loadFonts(late: () => void): Promise<boolean> {
  if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve(false);
  const faces = [
    new FontFace('Orbitron', `url(${orb700}) format('woff2')`, { weight: '700', display: 'swap' }),
    new FontFace('Orbitron', `url(${orb900}) format('woff2')`, { weight: '900', display: 'swap' }),
    new FontFace('Rajdhani', `url(${raj600}) format('woff2')`, { weight: '600', display: 'swap' }),
    new FontFace('Rajdhani', `url(${raj700}) format('woff2')`, { weight: '700', display: 'swap' }),
  ];
  for (const f of faces) document.fonts.add(f);
  let timedOut = false;
  const all = Promise.all(faces.map((f) => f.load())).then(
    () => {
      if (timedOut) late();
      return true;
    },
    () => false,
  );
  const timeout = new Promise<boolean>((res) =>
    window.setTimeout(() => {
      timedOut = true;
      res(false);
    }, 1500),
  );
  return Promise.race([all, timeout]);
}

function blockBrowserGestures(): void {
  const stop = (e: Event): void => e.preventDefault();
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dblclick', stop);
  document.addEventListener('gesturestart', stop);
  document.addEventListener('selectstart', stop);
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

function showNoGl(): void {
  document.body.dataset.scene = 'nogl';
  const t = document.getElementById('title');
  if (t) t.classList.add('hidden');
  const d = document.createElement('div');
  d.id = 'nogl';
  d.className = 'on';
  d.innerHTML =
    '<div class="logo">BRICK <span>SURVIVOR</span></div>' +
    '<div class="t">需要 WebGL</div>' +
    '<div class="s">当前浏览器无法创建 WebGL 画布（可能被禁用或不受支持）。<br>请在系统设置中开启硬件加速，或换用最新版 Chrome / Safari / Edge / Firefox。</div>';
  document.body.appendChild(d);
}

async function boot(): Promise<void> {
  blockBrowserGestures();
  const params = readParams();
  const ctx = GLContext.create();
  if (!ctx) {
    showNoGl();
    return;
  }
  let atlasRef: Atlas | null = null;
  const fonts = loadFonts(() => atlasRef?.rebake('font'));
  const bake: Promise<{ atlas: Atlas; spr: Sprites }> = fonts.then(() => bakeAll()).then((r) => {
    atlasRef = r.atlas;
    return r;
  });
  const app = new App(ctx, params, bake);
  if (params.debug) {
    const dbg = await import('./debug/debug');
    dbg.installDebug(app);
  }
}

void boot();
