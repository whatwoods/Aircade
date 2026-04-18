export type CoverTheme = {
  from: string;
  via: string;
  to: string;
  emoji: string;
};

// 12 aesthetic themes synthesized from the Aircade warm palette + accents.
// Inspired by the design bundle's placeholder covers so we never ship broken
// gradients when a work doesn't have a coverUrl yet.
export const coverThemes: CoverTheme[] = [
  { from: '#FF9F6B', via: '#FFB7C5', to: '#FFE9B8', emoji: '🕹️' },
  { from: '#9FE3C9', via: '#FFE9B8', to: '#FF9F6B', emoji: '🌱' },
  { from: '#FFB7C5', via: '#FF9F6B', to: '#FFE9B8', emoji: '💌' },
  { from: '#FFE9B8', via: '#9FE3C9', to: '#FFB7C5', emoji: '🎲' },
  { from: '#3D2E1F', via: '#FF9F6B', to: '#FFE9B8', emoji: '⚡' },
  { from: '#9FE3C9', via: '#FFB7C5', to: '#FFE9B8', emoji: '🧃' },
  { from: '#FF9F6B', via: '#FFE9B8', to: '#9FE3C9', emoji: '🎮' },
  { from: '#FFB7C5', via: '#FFE9B8', to: '#9FE3C9', emoji: '🐾' },
  { from: '#FFE9B8', via: '#FF9F6B', to: '#FFB7C5', emoji: '🍜' },
  { from: '#9FE3C9', via: '#FF9F6B', to: '#3D2E1F', emoji: '🧩' },
  { from: '#FFB7C5', via: '#9FE3C9', to: '#FFE9B8', emoji: '🌙' },
  { from: '#FF9F6B', via: '#3D2E1F', to: '#FFB7C5', emoji: '🛠' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function themeForKey(key: string | number): CoverTheme {
  const idx = typeof key === 'number' ? key : hashString(key);
  return coverThemes[idx % coverThemes.length]!;
}

export function hueForKey(key: string): number {
  return hashString(key) % 360;
}
