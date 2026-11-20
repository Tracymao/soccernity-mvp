import { createIdentityResolver, readGlobalRateLimitNumbers, refreshTokenTracker } from './global-rate-limit.config';
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
      refreshIpMax: 240,
      refreshIpWindowMs: 60_000,
      refreshTokenMax: 10,
      refreshTokenWindowMs: 60_000,
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
        GLOBAL_RATE_LIMIT_REFRESH_IP_MAX: '11',
        GLOBAL_RATE_LIMIT_REFRESH_IP_WINDOW_MS: '5000',
        GLOBAL_RATE_LIMIT_REFRESH_TOKEN_MAX: '3',
        GLOBAL_RATE_LIMIT_REFRESH_TOKEN_WINDOW_MS: '6000',
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
      refreshIpMax: 11,
      refreshIpWindowMs: 5000,
      refreshTokenMax: 3,
      refreshTokenWindowMs: 6000,
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
          GLOBAL_RATE_LIMIT_REFRESH_IP_MAX: bad,
          GLOBAL_RATE_LIMIT_REFRESH_TOKEN_MAX: bad,
        }),
      );
      expect(n.userMax).toBe(120);
      expect(n.anonMax).toBe(600);
      expect(n.writeMax).toBe(30);
      expect(n.uploadMax).toBe(10);
      expect(n.uploadWindowMs).toBe(600_000);
      expect(n.refreshIpMax).toBe(240);
      expect(n.refreshTokenMax).toBe(10);
    },
  );

  it('does not reuse the POST_MEDIA_UPLOAD_RATE_LIMIT_* names', () => {
    const asked: string[] = [];
    readGlobalRateLimitNumbers({ get: (k) => (asked.push(k), undefined) });
    expect(asked).toHaveLength(12);
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

describe('refreshTokenTracker', () => {
  const sha = (t: string) => require('crypto').createHash('sha256').update(t).digest('hex');

  it('hashes the body refresh token and never returns the raw token', () => {
    const tracker = refreshTokenTracker({ headers: {}, body: { refreshToken: 'raw-secret-token' } });
    expect(tracker).toBe(`refresh-token:${sha('raw-secret-token')}`);
    expect(tracker).not.toContain('raw-secret-token');
  });

  it('reads the sn_rt cookie in cookie mode and counts it exactly like the same body token', () => {
    const cookieReq = { headers: { 'x-auth-mode': 'cookie', cookie: 'sn_rt=raw-secret-token' }, body: {} };
    const bodyReq = { headers: {}, body: { refreshToken: 'raw-secret-token' } };
    expect(refreshTokenTracker(cookieReq)).toBe(refreshTokenTracker(bodyReq));
  });

  it('ignores the body in cookie mode (the route does the same)', () => {
    const req = { headers: { 'x-auth-mode': 'cookie' }, body: { refreshToken: 'from-body' } };
    expect(refreshTokenTracker(req)).toBeUndefined();
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: 42 }, undefined])('returns undefined for no usable token (%p)', (body) => {
    expect(refreshTokenTracker({ headers: {}, body })).toBeUndefined();
  });

  it('never throws on a malformed request', () => {
    expect(refreshTokenTracker({} as any)).toBeUndefined();
  });
});
