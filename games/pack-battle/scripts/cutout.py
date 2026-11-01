"""把 Midjourney 出的立牌图（纯色底）抠成透明底，裁边、缩放后存 PNG。

用法：python3 scripts/cutout.py <输入.png> <输出.png> [目标高度=600]
底色是带渐变和投影的蓝：按"偏蓝程度" b − r 判断，和画面边缘连通的偏蓝像素算背景，
特别蓝的像素无论是否连通都算背景（处理翅膀间的空洞）。立牌的米色描边把角色和背景隔开。
"""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
target_h = int(sys.argv[3]) if len(sys.argv) > 3 else 600

img = Image.open(src).convert('RGB')
W, H = img.size
px = img.load()

# d = 离背景有多远：越不蓝越大
BLUE_BG, BLUE_EDGE = 30, 6  # 偏蓝 b − r ≥ BLUE_BG 全透明，BLUE_EDGE..BLUE_BG 半透明（投影是青灰色，所以比 r 不比 g）
T_SOFT, T_HARD = 0, BLUE_BG - BLUE_EDGE
d = [0] * (W * H)
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        d[y * W + x] = max(0, BLUE_BG - (b - r))

# 从边缘泛洪：距离 < T_HARD 的连通像素是背景候选
bgc = bytearray(W * H)
q = deque()
for x in range(W):
    for y in (0, H - 1):
        i = y * W + x
        if d[i] < T_HARD and not bgc[i]:
            bgc[i] = 1
            q.append(i)
for y in range(H):
    for x in (0, W - 1):
        i = y * W + x
        if d[i] < T_HARD and not bgc[i]:
            bgc[i] = 1
            q.append(i)
while q:
    i = q.popleft()
    x, y = i % W, i // W
    for j in (i - 1 if x > 0 else -1, i + 1 if x < W - 1 else -1, i - W if y > 0 else -1, i + W if y < H - 1 else -1):
        if j >= 0 and not bgc[j] and d[j] < T_HARD:
            bgc[j] = 1
            q.append(j)

# 半透明只留给紧贴角色的 2px：先把非背景区膨胀，背景连通区里膨胀不到的地方一律全透明
fgm = Image.frombytes('L', (W, H), bytes(0 if v else 255 for v in bgc)).filter(ImageFilter.MaxFilter(5))
near = fgm.tobytes()

out = Image.new('RGBA', (W, H))
op = out.load()
for y in range(H):
    for x in range(W):
        i = y * W + x
        r, g, b = px[x, y]
        di = d[i]
        if bgc[i]:
            a = 0 if not near[i] or di <= T_SOFT else int(255 * (di - T_SOFT) / (T_HARD - T_SOFT))
        elif di == 0 and px[x, y][2] - max(px[x, y][0], px[x, y][1]) > 80:
            a = 0  # 被包住的背景色空洞
        else:
            a = 255
        if a < 255:
            # 去蓝边：把偏向背景色的分量压回去
            m = max(r, g)
            if b > m:
                b = m + (b - m) * a // 255 // 3
        op[x, y] = (r, g, b, a)

box = out.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
if box:
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(W, box[2] + pad), min(H, box[3] + pad))
    out = out.crop(box)
if out.height > target_h:
    out = out.resize((round(out.width * target_h / out.height), target_h), Image.LANCZOS)
out.save(dst)
print(dst, out.size)
