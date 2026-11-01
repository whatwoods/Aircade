/** 入口（docs §7）：字体注册、舞台布局、启动 app。 */
import './ui/styles.css';
import bsd800 from '@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2?url';
import bungee400 from '@fontsource/bungee/files/bungee-latin-400-normal.woff2?url';
import { App } from './app';
import { layoutStage, stageInfo } from './core/stage';
import { bakeBalls } from './render/ballArt';

const stageEl = document.getElementById('stage')!;
layoutStage(stageEl);
bakeBalls(stageInfo.scale * stageInfo.dpr);

const app = new App();

function loadFonts(): void {
  try {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const faces = [
      new FontFace('Big Shoulders Display', `url(${bsd800}) format("woff2")`, { weight: '800', display: 'swap' }),
      new FontFace('Bungee', `url(${bungee400}) format("woff2")`, { weight: '400', display: 'swap' }),
    ];
    const loads = faces.map((f) => {
      document.fonts.add(f);
      return f.load();
    });
    Promise.all(loads)
      .then(() => app.fontsReady())
      .catch(() => undefined);
  } catch {
    /* 回退字体栈 */
  }
}
loadFonts();

let raf = 0;
const relayout = (): void => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => layoutStage(stageEl));
};
window.addEventListener('resize', relayout);
window.visualViewport?.addEventListener('resize', relayout);
window.addEventListener('orientationchange', relayout);

app.boot();
layoutStage(stageEl);
// 调试工具（含模拟器与机器人）按需加载，不进首包
if (app.debug) void import('./core/debug').then((m) => m.installDebug(app));
