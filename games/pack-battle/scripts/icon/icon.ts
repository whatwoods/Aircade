// 图标：用标题页的合着的行囊 + 木桌纹理画出来（开发服务器打开 /scripts/icon/?size=512）
// pnpm icons 用无头 Chrome 截下来存到 public/icons/
import { initKit } from '../../src/render/kit.ts';
import { stage } from '../../src/render/stage.ts';
import { woodField } from '../../src/render/textures.ts';
import { closedBag } from '../../src/scenes/titleScene.ts';

const q = new URLSearchParams(location.search);
const size = Number(q.get('size') ?? 512);
/** bare：透明底、行囊撑满（favicon 太小，木纹只会糊成一片） */
const bare = q.get('bare') === '1';

const canvas = document.getElementById('icon') as HTMLCanvasElement;
canvas.width = canvas.height = size;
canvas.style.width = canvas.style.height = size + 'px';
const ctx = canvas.getContext('2d')!;

// 行囊精灵逻辑 260×230（含 16 边距）；按目标宽度反推内部分辨率，保证不糊
const bagW = size * (bare ? 0.98 : 0.78);
stage.dpr = 1;
stage.s = (bagW / 260) * 1.5;
initKit();

ctx.imageSmoothingQuality = 'high';
if (!bare) {
  ctx.drawImage(woodField(size, size, 11, 0, size / 512), 0, 0, size, size);
  // 暖光 + 暗角
  const g = ctx.createRadialGradient(size / 2, size * 0.46, size * 0.05, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, 'rgba(255,214,140,0.28)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20,10,4,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

const bag = closedBag();
const k = bagW / bag.w;
const w = (bag.w + bag.pad * 2) * k;
const h = (bag.h + bag.pad * 2) * k;
// 包身视觉重心偏下（上面露出剑柄和弓梢），整体略上移
const x = (size - w) / 2;
const y = (size - h) / 2 + size * 0.02;
// 投影：黑色剪影模糊
const sh = document.createElement('canvas');
sh.width = bag.c.width;
sh.height = bag.c.height;
const sc = sh.getContext('2d')!;
sc.drawImage(bag.c, 0, 0);
sc.globalCompositeOperation = 'source-in';
sc.fillStyle = '#140a04';
sc.fillRect(0, 0, sh.width, sh.height);
ctx.save();
ctx.globalAlpha = bare ? 0 : 0.5;
ctx.filter = `blur(${Math.round(size / 48)}px)`;
ctx.drawImage(sh, x + size * 0.01, y + size * 0.035, w, h);
ctx.restore();
ctx.drawImage(bag.c, x, y, w, h);
document.title = 'ready';
