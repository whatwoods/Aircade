import { describe, expect, it } from 'vitest';
import { slugifyUsername } from './slug';

describe('slugifyUsername', () => {
  it('keeps Chinese, letters and numbers while normalizing separators', () => {
    expect(slugifyUsername('猫猫_Arcade 42')).toBe('猫猫-arcade-42');
  });

  it('falls back to user when nothing slug-safe remains', () => {
    expect(slugifyUsername('!!!')).toBe('user');
  });
});
