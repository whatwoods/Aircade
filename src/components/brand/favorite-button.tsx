'use client';

import { useState } from 'react';

type FavoriteButtonProps = {
  workId: string;
  initialFavorited: boolean;
  size?: 'sm' | 'lg';
};

export function FavoriteButton({
  workId,
  initialFavorited,
  size = 'sm',
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const prevFavorited = favorited;
    const next = !favorited;

    // Optimistic update
    setFavorited(next);
    setPending(true);

    try {
      const res = await fetch(`/api/works/${workId}/favorite`, {
        method: 'POST',
      });

      if (res.status === 401) {
        setFavorited(prevFavorited);
        window.location.href = '/login';
        return;
      }

      if (!res.ok) throw new Error('Failed');

      const data: { favorited: boolean } = await res.json();
      setFavorited(data.favorited);
    } catch {
      // Revert optimistic update on error
      setFavorited(prevFavorited);
    } finally {
      setPending(false);
    }
  };

  const isLg = size === 'lg';
  const dim = isLg ? 18 : 14;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      data-favorited={favorited}
      aria-label={favorited ? '取消收藏' : '收藏'}
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
          fill={favorited ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <span>收藏</span>
    </button>
  );
}
