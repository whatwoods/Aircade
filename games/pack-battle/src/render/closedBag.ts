// 合着的行囊：应用图标用（scripts/icon/icon.ts）；标题页改成了打开的行囊小场景
import { ellipsePts, inkStroke, rectPts, type Pts } from './ink.ts';
import { C, cached, pat, rivet } from './kit.ts';
import type { Sprite } from './text.ts';

/** 合着的行囊：皮革包身 + 翻盖 + 黄铜扣 + 露出的剑柄和弓梢（中心在 (130, 205-?)） */
export function closedBag(): Sprite {
  return cached('title.bag', 260, 230, 16, (ctx, r) => {
    const T = (p: Pts): Pts => p;
    // 弓梢（在包后面）
    ctx.save();
    ctx.strokeStyle = '#7a4a24';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(196, 70);
    ctx.quadraticCurveTo(214, 30, 196, 0);
    ctx.stroke();
    ctx.strokeStyle = '#e9d8b0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(196, 2);
    ctx.lineTo(192, 70);
    ctx.stroke();
    inkStroke(ctx, [196, 70, 210, 40, 204, 16, 196, 0], false, 1.6, C.ink, 9, { unit: 1, jitter: 0.3, dry: false });
    ctx.restore();
    // 剑柄（在包后面）
    ctx.save();
    ctx.translate(74, 0);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(-5, 14, 10, 44);
    ctx.strokeStyle = '#3a2213';
    ctx.lineWidth = 1;
    for (let y = 18; y < 56; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-5, y);
      ctx.lineTo(5, y + 3);
      ctx.stroke();
    }
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.roundRect(-22, 56, 44, 9, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 10, 7, 0, Math.PI * 2);
    ctx.fill();
    inkStroke(ctx, rectPts(-22, 56, 44, 9, 4), true, 1.4, C.ink, 3, { unit: 1, jitter: 0.3, dry: false });
    inkStroke(ctx, ellipsePts(0, 10, 7, 7, 14), true, 1.4, C.ink, 4, { unit: 1, jitter: 0.3, dry: false });
    ctx.restore();
    // 包身
    const body = T(rectPts(14, 62, 232, 160, 26));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(14, 62, 232, 160, 26);
    ctx.fillStyle = C.leather;
    ctx.fill();
    ctx.fillStyle = pat(ctx, 'leather', r);
    ctx.fill();
    const sh = ctx.createLinearGradient(0, 62, 0, 222);
    sh.addColorStop(0, 'rgba(255,220,170,0.12)');
    sh.addColorStop(1, 'rgba(20,8,2,0.35)');
    ctx.fillStyle = sh;
    ctx.fill();
    ctx.restore();
    // 缝线
    ctx.save();
    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.roundRect(24, 72, 212, 140, 20);
    ctx.stroke();
    ctx.restore();
    inkStroke(ctx, body, true, 2.4, C.ink, 11, { unit: 1, jitter: 0.5, dry: false });
    // 侧带
    for (const x of [44, 202]) {
      ctx.fillStyle = C.leatherDark;
      ctx.fillRect(x, 58, 14, 166);
      inkStroke(ctx, rectPts(x, 58, 14, 166, 3), true, 1.4, C.ink, x, { unit: 1, jitter: 0.3, dry: false });
      rivet(ctx, x + 7, 200, 3.5);
    }
    // 翻盖
    const flap: Pts = [];
    flap.push(10, 60);
    flap.push(250, 60);
    flap.push(246, 120);
    flap.push(170, 146);
    flap.push(130, 150);
    flap.push(90, 146);
    flap.push(14, 120);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(flap[0], flap[1]);
    for (let i = 2; i < flap.length; i += 2) ctx.lineTo(flap[i], flap[i + 1]);
    ctx.closePath();
    ctx.fillStyle = C.leatherDark;
    ctx.fill();
    ctx.fillStyle = pat(ctx, 'leatherDark', r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = C.stitch;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, 68);
    ctx.lineTo(240, 68);
    ctx.lineTo(237, 114);
    ctx.lineTo(130, 141);
    ctx.lineTo(23, 114);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    inkStroke(ctx, flap, true, 2.2, C.ink, 13, { unit: 1, jitter: 0.5, dry: false });
    // 黄铜扣
    ctx.save();
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.roundRect(116, 126, 28, 34, 6);
    ctx.fill();
    ctx.fillStyle = C.brassLight;
    ctx.fillRect(121, 131, 18, 4);
    ctx.fillStyle = '#3a2213';
    ctx.beginPath();
    ctx.roundRect(126, 142, 8, 12, 3);
    ctx.fill();
    ctx.restore();
    inkStroke(ctx, rectPts(116, 126, 28, 34, 6), true, 1.6, C.ink, 17, { unit: 1, jitter: 0.3, dry: false });
  });
}
