'use client';

import { useState } from 'react';

type HeartButtonProps = {
  workId: string;
  initialLiked: boolean;
  initialCount: number;
  size?: 'sm' | 'lg';
};

export function HeartButton({
  workId,
  initialLiked,
  initialCount,
  size = 'sm',
}: HeartButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [pop, setPop] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const prevLiked = liked;
    const prevCount = count;
    const next = !liked;

    // Optimistic update
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    setPop(true);
    setTimeout(() => setPop(false), 600);
    setPending(true);

    try {
      const res = await fetch(`/api/works/${workId}/like`, { method: 'POST' });

      if (res.status === 401) {
        setLiked(prevLiked);
        setCount(prevCount);
        window.location.href = '/login';
        return;
      }

      if (!res.ok) throw new Error('Failed');

      const data: { liked: boolean; likeCount: number } = await res.json();
      setLiked(data.liked);
      setCount(data.likeCount);
    } catch {
      // Revert optimistic update on error
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  };

  const isLg = size === 'lg';
  const dim = isLg ? 18 : 14;

  // Random sparkle offsets
  const sparkles = [
    { dx: 18, dy: -20, top: 4, left: 10, bg: undefined },
    { dx: -20, dy: -18, top: 4, left: 14, bg: '#FFB7C5' },
    { dx: 22, dy: 14, top: 14, left: 10, bg: '#9FE3C9' },
  ];

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      data-liked={liked}
      data-pop={pop}
      aria-label={liked ? '取消点赞' : '点赞'}
      className="ac-heart-btn"
      style={{
        padding: isLg ? '8px 16px' : '6px 12px',
        fontSize: isLg ? 14 : 12,
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
      {pop
        ? sparkles.map((s, i) => (
            <span
              key={i}
              className="ac-sparkle"
              style={
                {
                  ['--dx' as string]: `${s.dx}px`,
                  ['--dy' as string]: `${s.dy}px`,
                  top: s.top,
                  left: s.left,
                  ...(s.bg ? { background: s.bg } : {}),
                } as React.CSSProperties
              }
            />
          ))
        : null}
    </button>
  );
}
