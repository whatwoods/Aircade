import { themeForKey } from './cover-themes';

type CoverProps = {
  /** Stable key used to pick a gradient theme (and emoji) when no coverUrl. */
  seed: string;
  /** Optional real cover image; takes precedence over the themed gradient. */
  coverUrl?: string | null;
  /** Tag printed in the corner, e.g. "W3 · game" */
  label?: string;
  /** CSS aspect-ratio string, default "4 / 3". */
  ratio?: string;
  /** Hide emoji glyph — useful for thumbnails. */
  hideEmoji?: boolean;
  className?: string;
};

export function Cover({
  seed,
  coverUrl,
  label,
  ratio = '4 / 3',
  hideEmoji,
  className,
}: CoverProps) {
  const theme = themeForKey(seed);

  // If a real cover is provided, use it as the layer above the gradient fallback.
  const bgStyle: React.CSSProperties = {
    ['--c-from' as string]: theme.from,
    ['--c-via' as string]: theme.via,
    ['--c-to' as string]: theme.to,
    aspectRatio: ratio,
  };

  return (
    <div className={`ac-cover ${className ?? ''}`} style={bgStyle}>
      <div className="ac-cover-grad" />
      {coverUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      ) : (
        <>
          <div className="ac-cover-stripes" />
          {!hideEmoji ? (
            <div className="ac-cover-emoji">{theme.emoji}</div>
          ) : null}
        </>
      )}
      {label ? <div className="ac-cover-mono">{label}</div> : null}
    </div>
  );
}
