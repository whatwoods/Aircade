import cinzelUrl from '@fontsource-variable/cinzel/files/cinzel-latin-wght-normal.woff2?url';
import decoUrl from '@fontsource/cinzel-decorative/files/cinzel-decorative-latin-700-normal.woff2?url';
import './ui/styles.css';
import { App } from './app';
import { validateConfig } from './config';

function param(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/** FontFace 加载（带超时）；迟到时回调重烘字形 */
function loadFonts(onLate: () => void): Promise<void> {
  const faces: FontFace[] = [];
  try {
    faces.push(new FontFace('Cinzel', `url(${cinzelUrl}) format('woff2')`, { weight: '400 900', display: 'swap' }));
    faces.push(new FontFace('Cinzel Decorative', `url(${decoUrl}) format('woff2')`, { weight: '700', display: 'swap' }));
  } catch {
    return Promise.resolve();
  }
  let timedOut = false;
  const all = Promise.all(
    faces.map((f) =>
      f.load().then(
        (ff) => {
          document.fonts.add(ff);
        },
        () => undefined,
      ),
    ),
  ).then(() => {
    if (timedOut) onLate();
  });
  const timeout = new Promise<void>((res) =>
    window.setTimeout(() => {
      timedOut = true;
      res();
    }, 1500),
  );
  return Promise.race([all, timeout]);
}

async function boot(): Promise<void> {
  const seedP = param('seed');
  const tut = param('tutorial');
  const debug = param('debug') === '1';
  const opts = {
    seed: seedP !== null && /^-?\d+$/.test(seedP) ? (parseInt(seedP, 10) >>> 0) : null,
    debug,
    tutorial: tut === '1' ? true : tut === '0' ? false : null,
    mute: param('mute') === '1',
    fast: param('fast') === '1',
  };
  let app: App | null = null;
  await loadFonts(() => app?.rebakeGlyphs());
  app = new App(opts);
  if (debug) {
    const errs = validateConfig();
    if (errs.length) console.info('[config]', errs.join('; '));
    const m = await import('./debug/debug');
    m.installDebug(app);
  }
}

void boot();
