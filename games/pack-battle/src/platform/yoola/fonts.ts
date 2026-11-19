// 快手端字体：ttf 走 KwaiRender.loadFont（快手同步加载并返回 family；H5 预览走 FontFace 异步，family 就是别名）
import { stage } from '../../render/stage.ts';
import { kw } from './kwai.ts';

const FONTS = {
  hand: { alias: 'pb-hand', path: 'res/fonts/patrick-hand-regular.ttf' },
  logo: { alias: 'pb-logo', path: 'res/fonts/kalam-bold.ttf' },
  brush: { alias: 'pb-brush', path: 'res/fonts/title-brush.ttf' },
} as const;

const cache: Record<string, string> = {};

/** 返回带引号的 family；加载失败时仍返回别名，文字回落到后面的中文字体栈 */
export function yoolaFamily(key: keyof typeof FONTS): string {
  const hit = cache[key];
  if (hit) return hit;
  const f = FONTS[key];
  const fam = kw().KwaiRender.loadFont(
    f.path,
    f.alias,
    () => {
      // 异步就绪（H5 预览）：让文本缓存失效；启动前（stage 还没建）不用
      if (stage.canvas) stage.version++;
    },
    () => undefined,
  );
  return (cache[key] = '"' + (fam || f.alias) + '"');
}
