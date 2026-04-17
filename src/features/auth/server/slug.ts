export function slugifyUsername(value: string): string {
  const compact = value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_\s]+/gu, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = compact.slice(0, 40).replace(/-+$/g, '');

  return trimmed || 'user';
}
