// 图标：标题页的手绘行囊（src/assets/title/bag.webp）+ 木桌纹理（开发服务器打开 /scripts/icon/?size=512）
// pnpm icons 用无头 Chrome 截下来存到 public/icons/ 和快手的 yoola-assets/icon.png
import bagUrl from '../../src/assets/title/bag.webp?url';
import { initKit } from '../../src/render/kit.ts';
import { stage } from '../../src/render/stage.ts';
import { woodField } from '../../src/render/textures.ts';

const q = new URLSearchParams(location.search);
const size = Number(q.get('size') ?? 512);
/** bare：透明底、行囊撑满（favicon 太小，木纹只会糊成一片） */
const bare = q.get('bare') === '1';

const canvas = document.getElementById('icon') as HTMLCanvasElement;
canvas.width = canvas.height = size;
canvas.style.width = canvas.style.height = size + 'px';
const ctx = canvas.getContext('2d')!;

const bagW = size * (bare ? 1 : 0.84);
stage.dpr = 1;
stage.s = size / 390;
initKit();

ctx.imageSmoothingQuality = 'high';
if (!bare) {
  ctx.drawImage(woodField(size, size, 11, 0, size / 512), 0, 0, size, size);
  // 暖光 + 暗角
  const g = ctx.createRadialGradient(size / 2, size * 0.42, size * 0.05, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, 'rgba(255,200,120,0.34)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20,10,4,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

const bag = new Image();
bag.src = bagUrl;
await bag.decode();
const w = bagW;
const h = (bag.naturalHeight / bag.naturalWidth) * w;
const x = (size - w) / 2;
// 包身视觉重心偏下（上面露出剑柄和弓梢），整体略上移
const y = (size - h) / 2 + (bare ? 0 : size * 0.02);
if (!bare) {
  // 接触阴影：黑色剪影模糊
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.filter = `brightness(0) blur(${Math.round(size / 40)}px)`;
  ctx.drawImage(bag, x + size * 0.01, y + size * 0.04, w, h);
  ctx.restore();
}
ctx.drawImage(bag, x, y, w, h);
document.title = 'ready';
