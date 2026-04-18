'use client';

import { useState } from 'react';

type HeartButtonProps = {
  initial?: number;
  likedDefault?: boolean;
  size?: 'sm' | 'lg';
};

export function HeartButton({
  initial = 0,
  likedDefault = false,
  size = 'sm',
}: HeartButtonProps) {
  const [liked, setLiked] = useState(likedDefault);
  const [count, setCount] = useState(initial);
  const [pop, setPop] = useState(false);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    setPop(true);
    setTimeout(() => setPop(false), 600);
  };

  const dim = size === 'lg' ? 18 : 14;

  return (
    <button
      type="button"
      onClick={toggle}
      data-liked={liked}
      data-pop={pop}
      className="ac-heart-btn"
      style={{
        padding: size === 'lg' ? '10px 16px' : '6px 12px',
        fontSize: size === 'lg' ? 14 : 12,
      }}
    >
      <span className="ac-heart-icon inline-block">
        <svg
          width={dim}
          height={dim}
          viewBox="0 0 24 24"
          fill={liked ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </span>
      <span>{count}</span>
      {pop ? (
        <>
          <span
            className="ac-sparkle"
            style={
              {
                ['--dx' as string]: '18px',
                ['--dy' as string]: '-20px',
                top: 4,
                left: 10,
              } as React.CSSProperties
            }
          />
          <span
            className="ac-sparkle"
            style={
              {
                ['--dx' as string]: '-20px',
                ['--dy' as string]: '-18px',
                top: 4,
                left: 14,
                background: '#FFB7C5',
              } as React.CSSProperties
            }
          />
          <span
            className="ac-sparkle"
            style={
              {
                ['--dx' as string]: '22px',
                ['--dy' as string]: '14px',
                top: 14,
                left: 10,
                background: '#9FE3C9',
              } as React.CSSProperties
            }
          />
        </>
      ) : null}
    </button>
  );
}
