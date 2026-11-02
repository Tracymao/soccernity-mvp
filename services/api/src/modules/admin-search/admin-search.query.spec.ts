import { BadRequestException } from '@nestjs/common';
import {
  ADMIN_SEARCH_MAX_LENGTH,
  ADMIN_SEARCH_MIN_LENGTH,
  ADMIN_SEARCH_QUERY_INVALID_CODE,
  ADMIN_SEARCH_QUERY_TOO_LONG_CODE,
  ADMIN_SEARCH_QUERY_TOO_SHORT_CODE,
} from './admin-search.constants';
import { escapeLike, isEmailShaped, parseAdminSearchQuery } from './admin-search.query';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return ((e as BadRequestException).getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('parseAdminSearchQuery', () => {
  it('trims the text', () => {
    expect(parseAdminSearchQuery('   nelson  ').text).toBe('nelson');
  });

  it.each([undefined, '', '   ', 'ab', '  ab  '])('rejects %p as too short, with a stable code', (q) => {
    expect(codeOf(() => parseAdminSearchQuery(q))).toBe(ADMIN_SEARCH_QUERY_TOO_SHORT_CODE);
  });

  it('counts the TRIMMED length: three characters pass, spaces around them do not help', () => {
    expect(() => parseAdminSearchQuery('abc')).not.toThrow();
    expect(codeOf(() => parseAdminSearchQuery(' ab '))).toBe(ADMIN_SEARCH_QUERY_TOO_SHORT_CODE);
    expect(ADMIN_SEARCH_MIN_LENGTH).toBe(3);
  });

  it('accepts exactly the maximum length and rejects one more', () => {
    expect(() => parseAdminSearchQuery('a'.repeat(ADMIN_SEARCH_MAX_LENGTH))).not.toThrow();
    expect(codeOf(() => parseAdminSearchQuery('a'.repeat(ADMIN_SEARCH_MAX_LENGTH + 1)))).toBe(ADMIN_SEARCH_QUERY_TOO_LONG_CODE);
  });

  it.each(['abc\u0000def', 'abc\u0007', 'ab\ncd', 'a\tbc', 'abc\u007f'])('rejects control characters (%j)', (q) => {
    expect(codeOf(() => parseAdminSearchQuery(q))).toBe(ADMIN_SEARCH_QUERY_INVALID_CODE);
  });

  it('classifies a uuid in any case and lowercases it', () => {
    const q = parseAdminSearchQuery('3F2504E0-4F89-41D3-9A0C-0305E82C3301');
    expect(q.isUuid).toBe(true);
    expect(q.lower).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(q.isUsernameShaped).toBe(false);
  });

  it('classifies only a whole address as an email, and a half-typed one as containing an @', () => {
    expect(parseAdminSearchQuery('Temi@Example.com').isEmail).toBe(true);
    for (const half of ['temi@', '@example.com', 'temi@example', 'te mi@example.com']) {
      const q = parseAdminSearchQuery(half);
      expect(q.isEmail).toBe(false);
      expect(q.containsAt).toBe(true);
    }
    expect(parseAdminSearchQuery('plain text').containsAt).toBe(false);
  });

  it('classifies a username-shaped prefix (letters, digits, underscore) and nothing else', () => {
    expect(parseAdminSearchQuery('nelson_ihe').isUsernameShaped).toBe(true);
    for (const not of ['nel son', 'nel-son', 'a@bcd', 'nelson%']) expect(parseAdminSearchQuery(not).isUsernameShaped).toBe(false);
  });
});

describe('escapeLike', () => {
  it('escapes the percent sign, the underscore and the backslash itself', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
  });

  it('leaves everything else alone', () => {
    expect(escapeLike('Nelson O. Iheagwam-1')).toBe('Nelson O. Iheagwam-1');
  });
});

describe('isEmailShaped', () => {
  it.each(['a@b.co', 'Temi@Example.com', 'first.last+tag@sub.example.co.uk'])('accepts %s', (v) => {
    expect(isEmailShaped(v)).toBe(true);
  });

  it.each(['', 'abc', '@b.co', 'a@', 'a@b', 'a@.co', 'a@b.', 'a@@b.co', 'a@b@c.co', 'a b@c.co', 'a@b .co', 'a@b.	co'])(
    'rejects %j',
    (v) => {
      expect(isEmailShaped(v)).toBe(false);
    },
  );

  it('stays fast on the input CodeQL named for the old regex (many repetitions of "!.")', () => {
    const hostile = '!@!.' + '!.'.repeat(120);
    const started = Date.now();
    isEmailShaped(hostile);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
