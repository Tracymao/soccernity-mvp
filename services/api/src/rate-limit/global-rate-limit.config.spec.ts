import { createIdentityResolver, readGlobalRateLimitNumbers } from './global-rate-limit.config';
import { GLOBAL_RATE_LIMIT_DEFAULTS } from './global-rate-limit.constants';

const reader = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] });

describe('readGlobalRateLimitNumbers', () => {
  it('uses the founder-specified defaults when nothing is configured', () => {
    expect(readGlobalRateLimitNumbers(reader({}))).toEqual({
      userMax: 120,
      userWindowMs: 60_000,
      anonMax: 600,
      anonWindowMs: 60_000,
      writeMax: 30,
      writeWindowMs: 60_000,
      uploadMax: 10,
      uploadWindowMs: 600_000,
    });
    expect(GLOBAL_RATE_LIMIT_DEFAULTS.uploadWindowMs).toBe(10 * 60 * 1000);
  });

  it('reads every number from configuration', () => {
    const n = readGlobalRateLimitNumbers(
      reader({
        GLOBAL_RATE_LIMIT_USER_MAX: '7',
        GLOBAL_RATE_LIMIT_USER_WINDOW_MS: '1000',
        GLOBAL_RATE_LIMIT_ANON_MAX: '8',
        GLOBAL_RATE_LIMIT_ANON_WINDOW_MS: '2000',
        GLOBAL_RATE_LIMIT_WRITE_MAX: '9',
        GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS: '3000',
        GLOBAL_RATE_LIMIT_UPLOAD_MAX: '2',
        GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS: '4000',
      }),
    );
    expect(n).toEqual({
      userMax: 7,
      userWindowMs: 1000,
      anonMax: 8,
      anonWindowMs: 2000,
      writeMax: 9,
      writeWindowMs: 3000,
      uploadMax: 2,
      uploadWindowMs: 4000,
    });
  });

  it.each(['', '  ', '0', '-5', '2.5', 'abc', 'NaN', 'Infinity'])(
    'falls back to the default (never disables a limit) for %p',
    (bad) => {
      const n = readGlobalRateLimitNumbers(
        reader({
          GLOBAL_RATE_LIMIT_USER_MAX: bad,
          GLOBAL_RATE_LIMIT_ANON_MAX: bad,
          GLOBAL_RATE_LIMIT_WRITE_MAX: bad,
          GLOBAL_RATE_LIMIT_UPLOAD_MAX: bad,
          GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS: bad,
        }),
      );
      expect(n.userMax).toBe(120);
      expect(n.anonMax).toBe(600);
      expect(n.writeMax).toBe(30);
      expect(n.uploadMax).toBe(10);
      expect(n.uploadWindowMs).toBe(600_000);
    },
  );

  it('does not reuse the POST_MEDIA_UPLOAD_RATE_LIMIT_* names', () => {
    const asked: string[] = [];
    readGlobalRateLimitNumbers({ get: (k) => (asked.push(k), undefined) });
    expect(asked).toHaveLength(8);
    expect(asked.filter((k) => !k.startsWith('GLOBAL_RATE_LIMIT_'))).toEqual([]);
  });
});

describe('createIdentityResolver', () => {
  const verify = (token: string) => {
    if (token === 'good') return { sub: 'user-1' };
    if (token === 'nosub') return {};
    throw new Error('invalid');
  };
  const resolve = createIdentityResolver(verify);

  it('identifies a request by user id when the bearer token verifies', () => {
    expect(resolve({ ip: '1.2.3.4', headers: { authorization: 'Bearer good' } })).toEqual({
      kind: 'user',
      tracker: 'user:user-1',
    });
  });

  it.each([
    ['no header', {}],
    ['a non-bearer scheme', { authorization: 'Basic good' }],
    ['a bearer header with no token', { authorization: 'Bearer' }],
    ['a token that does not verify', { authorization: 'Bearer bad' }],
    ['a verified token with no subject', { authorization: 'Bearer nosub' }],
    ['a non-string header value', { authorization: ['Bearer good'] }],
  ])('falls back to the IP for %s', (_label, headers) => {
    expect(resolve({ ip: '1.2.3.4', headers })).toEqual({ kind: 'ip', tracker: 'ip:1.2.3.4' });
  });

  it('never throws, even without headers or an ip', () => {
    expect(() => resolve({})).not.toThrow();
    expect(resolve({})).toEqual({ kind: 'ip', tracker: 'ip:unknown' });
  });

  it('verifies a token once per request (the answer is cached on the request)', () => {
    const spy = jest.fn(() => ({ sub: 'u' }));
    const r = createIdentityResolver(spy);
    const req = { ip: '1.1.1.1', headers: { authorization: 'Bearer t' } };
    r(req);
    r(req);
    r(req);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
