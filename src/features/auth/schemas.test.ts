import { describe, expect, it } from 'vitest';
import { loginInputSchema, normalizeSeedUsername } from './schemas';

describe('auth schemas', () => {
  it('normalizes username to lower-case NFKC form', () => {
    expect(
      loginInputSchema.parse({ username: ' Ｗay_猫 ', password: 'x' })
    ).toEqual({
      username: 'way_猫',
      password: 'x',
    });
  });

  it('normalizes seed helpers', () => {
    expect(normalizeSeedUsername(' 管理员_01 ')).toEqual({
      username: '管理员_01',
      displayName: '管理员_01',
    });
  });
});
