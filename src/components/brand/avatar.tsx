import { hueForKey } from './cover-themes';

type AvatarProps = {
  name: string;
  seed?: string;
  size?: number;
  className?: string;
};

export function Avatar({ name, seed, size = 36, className }: AvatarProps) {
  const hue = hueForKey(seed ?? name);
  const initial = name.trim().slice(0, 1) || 'A';

  return (
    <div
      aria-label={name}
      className={`flex shrink-0 items-center justify-center rounded-full text-brand-coffee shadow-[0_4px_10px_rgba(61,46,31,0.12)] ring-2 ring-white ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        background: `conic-gradient(from 200deg, hsl(${hue} 80% 78%), hsl(${(hue + 60) % 360} 75% 70%), hsl(${hue} 80% 78%))`,
      }}
    >
      {initial}
    </div>
  );
}
