// 标题页行囊的手绘图（GPT Image，透明底）；没加载好之前标题页不画行囊，到手后再播落下动画
import { kw } from '../platform/yoola/kwai.ts';
import { TITLE_BAG_URL } from './artUrls.ts';

let bag: HTMLImageElement | null = null;

if (__YOOLA__) {
  // 快手端不能 new Image
  kw().KwaiRender.loadImage({ src: TITLE_BAG_URL, onSuccess: (img) => (bag = img) });
} else {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => (bag = img);
  img.src = TITLE_BAG_URL;
}

export function titleBagArt(): HTMLImageElement | null {
  return bag;
}
