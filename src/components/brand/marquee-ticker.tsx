const defaultItems = [
  '★ INSERT COIN TO START ★',
  '◆ 群友 × AI × 街机 ◆',
  '▲ 15+ 作品等你点赞 ▲',
  '● 邀请码制 · 群里自取 ●',
  '◇ MADE WITH CAFFEINE ◇',
];

export function MarqueeTicker({ items = defaultItems }: { items?: string[] }) {
  return (
    <div
      className="ac-marquee py-3"
      style={{
        borderTop: '1px solid var(--ac-border)',
        borderBottom: '1px solid var(--ac-border)',
        background: 'var(--ac-bg-tint)',
      }}
    >
      <div
        className="ac-marquee-inner ac-micro"
        style={{ color: 'var(--ac-fg-soft)' }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="inline-flex" style={{ gap: 40 }}>
            {items.map((text, j) => (
              <span key={j}>{text}</span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
