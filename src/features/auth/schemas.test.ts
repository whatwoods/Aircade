import { describe, expect, it } from 'vitest';
import {
  loginInputSchema,
  normalizeSeedInviteCode,
  normalizeSeedUsername,
} from './schemas';

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
    expect(normalizeSeedInviteCode(' aircade-dev-001 ')).toBe(
      'AIRCADE-DEV-001'
    );
    expect(normalizeSeedUsername(' 管理员_01 ')).toEqual({
      username: '管理员_01',
      displayName: '管理员_01',
    });
  });
});
