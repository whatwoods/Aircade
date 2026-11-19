"""标题毛笔字子集：从 @fontsource/ma-shan-zheng（马善政，OFL-1.1）里只取标题用到的字。

fontsource 按 unicode-range 把中文拆成上百个 woff2 分片，标题的字散在几个分片里：
找到包含这些字的分片 → 合并 → 子集化，输出网页用的 woff2 和快手用的 ttf。

用法（在 games/pack-battle 下）：python3 scripts/title-font.py
需要 fontTools 和 brotli（pip install fonttools brotli）。
"""
import re
import sys
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

TEXT = '行囊对决'
PKG = Path('node_modules/@fontsource/ma-shan-zheng')
OUT_WEB = Path('src/assets/fonts/title-brush.woff2')
OUT_KWAI = Path('yoola/package/res/fonts/title-brush.ttf')


def chunks_for(text: str) -> list[Path]:
    css = (PKG / '400.css').read_text()
    found: list[Path] = []
    for block in css.split('@font-face')[1:]:
        rng = re.search(r'unicode-range:\s*([^;]+);', block)
        url = re.search(r'url\(\./files/([^)]+\.woff2)\)', block)
        if not rng or not url:
            continue
        spans = []
        for part in rng.group(1).split(','):
            part = part.strip().replace('U+', '')
            a, _, b = part.partition('-')
            spans.append((int(a, 16), int(b or a, 16)))
        if any(lo <= ord(ch) <= hi for ch in text for lo, hi in spans):
            found.append(PKG / 'files' / url.group(1))
    return sorted(set(found))


def main() -> None:
    files = chunks_for(TEXT)
    if not files:
        sys.exit('找不到包含标题字的分片')
    tmp = []
    work = Path(tempfile.mkdtemp(prefix='title-font-'))
    for i, f in enumerate(files):
        font = TTFont(f)
        font.flavor = None
        p = work / f'chunk-{i}.ttf'
        font.save(p)
        tmp.append(str(p))
    merged = Merger().merge(tmp) if len(tmp) > 1 else TTFont(tmp[0])
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=TEXT)
    sub.subset(merged)
    # 家族名统一，网页 @font-face 和快手 loadFont 都用别名，不依赖这里
    OUT_KWAI.parent.mkdir(parents=True, exist_ok=True)
    OUT_WEB.parent.mkdir(parents=True, exist_ok=True)
    merged.flavor = None
    merged.save(OUT_KWAI)
    merged.flavor = 'woff2'
    merged.save(OUT_WEB)
    missing = [ch for ch in TEXT if ord(ch) not in merged.getBestCmap()]
    if missing:
        sys.exit('子集缺字：' + ''.join(missing))
    print(f'✓ {OUT_WEB} {OUT_WEB.stat().st_size} B，{OUT_KWAI} {OUT_KWAI.stat().st_size} B（{len(files)} 个分片）')


if __name__ == '__main__':
    main()
