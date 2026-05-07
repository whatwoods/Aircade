'use client';

import { cn } from '@/lib/utils';

type TagChipProps = {
  tag: string;
  active?: boolean;
  onClick?: () => void;
  as?: 'button' | 'span';
  className?: string;
};

export function TagChip({
  tag,
  active,
  onClick,
  as = onClick ? 'button' : 'span',
  className,
}: TagChipProps) {
  const style: React.CSSProperties = active
    ? {
        background:
          'color-mix(in oklch, var(--ac-primary) 18%, var(--ac-surface))',
        color: 'var(--ac-primary)',
        borderColor:
          'color-mix(in oklch, var(--ac-primary) 44%, var(--ac-border))',
      }
    : {
        background: 'var(--ac-surface-soft)',
        color: 'var(--ac-fg-soft)',
        borderColor: 'var(--ac-border)',
      };

  if (as === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'ac-pill cursor-pointer transition-colors hover:opacity-90',
          className
        )}
        style={style}
      >
        #{tag}
      </button>
    );
  }

  return (
    <span className={cn('ac-pill transition-colors', className)} style={style}>
      #{tag}
    </span>
  );
}
