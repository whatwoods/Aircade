import { Track } from '../src/game/track.ts';
import { TRACKS } from '../src/game/tracks.ts';
for (const def of TRACKS) {
  const t = new Track(def);
  let minSep = 1e9, at = '';
  let minTotem = 1e9;
  const pts: Array<[number, number, number]> = [];
  for (let s = t.gateLen; s <= t.length; s += 4) { const p = t.posAt(s); pts.push([s, p.x, p.y]); }
  for (let i = 0; i < pts.length; i++) {
    const [s1, x1, y1] = pts[i]!;
    minTotem = Math.min(minTotem, Math.hypot(x1 - t.totemX, y1 - t.totemY));
    for (let j = i + 1; j < pts.length; j++) {
      const [s2, x2, y2] = pts[j]!;
      if (s2 - s1 < 160) continue;
      const d = Math.hypot(x1 - x2, y1 - y2);
      if (d < minSep) { minSep = d; at = `${s1.toFixed(0)}/${s2.toFixed(0)} (${x1.toFixed(0)},${y1.toFixed(0)})`; }
    }
  }
  console.log(def.name, 'len', t.length.toFixed(0), 'balls', (t.length / 40).toFixed(1), 'minSep', minSep.toFixed(1), at, 'totemClear', minTotem.toFixed(1));
}
