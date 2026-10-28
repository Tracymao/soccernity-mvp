import { ForbiddenException } from '@nestjs/common';
import {
  ADMIN_SESSION_COOKIE,
  USER_SESSION_COOKIE,
  applyCookieSession,
  assertAllowedCookieOrigin,
  clearRefreshCookie,
  isCookieMode,
  readRefreshCookie,
  setRefreshCookie,
  shouldBeSecure,
} from './session-cookie';

// B-245: attribute-level checks on the Set-Cookie strings, no HTTP needed.

const WEB = 'https://app.soccernity.com';
const PROD = { NODE_ENV: 'production', WEB_APP_BASE_URL: WEB, ADMIN_APP_BASE_URL: 'https://admin.soccernity.com' };

function req(headers: Record<string, string | undefined> = {}) {
  return { headers };
}
function fakeRes() {
  const set: string[] = [];
  return { set, append: (_: string, v: string) => void set.push(v) };
}
const in30Days = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
function attrs(setCookie: string): string[] {
  return setCookie.split(';').map((p) => p.trim());
}

describe('isCookieMode', () => {
  it('is on only for X-Auth-Mode: cookie (case-insensitive)', () => {
    expect(isCookieMode(req({ 'x-auth-mode': 'cookie' }))).toBe(true);
    expect(isCookieMode(req({ 'x-auth-mode': ' Cookie ' }))).toBe(true);
    expect(isCookieMode(req({ 'x-auth-mode': 'body' }))).toBe(false);
    expect(isCookieMode(req({}))).toBe(false);
    expect(isCookieMode(undefined)).toBe(false);
  });
});

describe('setRefreshCookie attributes', () => {
  it('user cookie: httpOnly, Secure, SameSite=Strict, host-only (no Domain), Path=/auth', () => {
    const res = fakeRes();
    setRefreshCookie(req({ origin: WEB }), res, USER_SESSION_COOKIE, { token: 'id.secret', expiresAt: in30Days(), persistent: true }, PROD);
    const a = attrs(res.set[0]);
    expect(a[0]).toBe('sn_rt=id.secret');
    expect(a).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']));
    expect(a.some((x) => x.toLowerCase().startsWith('domain'))).toBe(false);
  });

  it('admin cookie: a different name and path (sn_admin_rt, /admin/auth)', () => {
    const res = fakeRes();
    setRefreshCookie(req({ origin: WEB }), res, ADMIN_SESSION_COOKIE, { token: 'a.b', expiresAt: in30Days(), persistent: false }, PROD);
    const a = attrs(res.set[0]);
    expect(a[0]).toBe('sn_admin_rt=a.b');
    expect(a).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/admin/auth']));
  });

  it('persistent -> Max-Age equals the remaining refresh TTL; session cookie -> no Max-Age / Expires', () => {
    const p = fakeRes();
    setRefreshCookie(req({ origin: WEB }), p, USER_SESSION_COOKIE, { token: 't.t', expiresAt: in30Days(), persistent: true }, PROD);
    const maxAge = Number(attrs(p.set[0]).find((x) => x.startsWith('Max-Age='))!.split('=')[1]);
    expect(maxAge).toBeGreaterThan(30 * 24 * 60 * 60 - 5);
    expect(maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60);

    const s = fakeRes();
    setRefreshCookie(req({ origin: WEB }), s, USER_SESSION_COOKIE, { token: 't.t', expiresAt: in30Days(), persistent: false }, PROD);
    expect(s.set[0]).not.toMatch(/Max-Age/i);
    expect(s.set[0]).not.toMatch(/Expires/i);
  });
});

describe('Secure rule', () => {
  it('production: always Secure, even for a localhost origin', () => {
    expect(shouldBeSecure(req({ origin: 'http://localhost:5173' }), { NODE_ENV: 'production' })).toBe(true);
    expect(shouldBeSecure(req({}), { NODE_ENV: 'production' })).toBe(true);
  });
  it('development: non-Secure ONLY for an http://localhost-style origin', () => {
    const dev = { NODE_ENV: 'development' };
    expect(shouldBeSecure(req({ origin: 'http://localhost:5173' }), dev)).toBe(false);
    expect(shouldBeSecure(req({ origin: 'http://127.0.0.1:5173' }), dev)).toBe(false);
    expect(shouldBeSecure(req({ origin: 'https://localhost:5173' }), dev)).toBe(true);
    expect(shouldBeSecure(req({ origin: 'http://staging.example.org' }), dev)).toBe(true);
    expect(shouldBeSecure(req({}), dev)).toBe(true);
    expect(shouldBeSecure(req({ origin: 'not a url' }), dev)).toBe(true);
  });
});

describe('clearRefreshCookie', () => {
  it('expires the cookie with Max-Age=0 and the same name / path / flags', () => {
    const res = fakeRes();
    clearRefreshCookie(req({ origin: WEB }), res, USER_SESSION_COOKIE, PROD);
    const a = attrs(res.set[0]);
    expect(a[0]).toBe('sn_rt=');
    expect(a).toEqual(expect.arrayContaining(['Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/auth']));
  });
});

describe('readRefreshCookie', () => {
  it('reads only its own cookie name', () => {
    const header = 'a=1; sn_rt=user.token; sn_admin_rt=admin.token';
    expect(readRefreshCookie(req({ cookie: header }), USER_SESSION_COOKIE)).toBe('user.token');
    expect(readRefreshCookie(req({ cookie: header }), ADMIN_SESSION_COOKIE)).toBe('admin.token');
    expect(readRefreshCookie(req({ cookie: 'sn_admin_rt=admin.token' }), USER_SESSION_COOKIE)).toBeUndefined();
    expect(readRefreshCookie(req({}), USER_SESSION_COOKIE)).toBeUndefined();
    expect(readRefreshCookie(req({ cookie: 'sn_rt=' }), USER_SESSION_COOKIE)).toBeUndefined();
  });
});

describe('assertAllowedCookieOrigin', () => {
  it('passes for an allowlisted origin', () => {
    expect(() => assertAllowedCookieOrigin(req({ origin: WEB }), PROD)).not.toThrow();
    expect(() => assertAllowedCookieOrigin(req({ origin: 'https://admin.soccernity.com' }), PROD)).not.toThrow();
  });
  it('403s on a missing Origin, a foreign Origin, and localhost in production', () => {
    for (const headers of [{}, { origin: 'https://evil.example.com' }, { origin: 'http://localhost:5173' }, { origin: 'null' }]) {
      expect(() => assertAllowedCookieOrigin(req(headers), PROD)).toThrow(ForbiddenException);
    }
  });
});

describe('applyCookieSession', () => {
  const body = {
    accessToken: 'jwt',
    accessTokenExpiresIn: 900,
    refreshToken: 'id.secret',
    refreshTokenExpiresAt: in30Days().toISOString(),
    user: { id: 'u' },
  };

  it('outside cookie mode returns the SAME object untouched and sets no cookie', () => {
    const res = fakeRes();
    expect(applyCookieSession(USER_SESSION_COOKIE, req({}), res, body, true)).toBe(body);
    expect(res.set).toHaveLength(0);
  });

  it('in cookie mode omits refreshToken from the body, keeps the rest, and sets the cookie', () => {
    const res = fakeRes();
    const out = applyCookieSession(USER_SESSION_COOKIE, req({ 'x-auth-mode': 'cookie', origin: WEB }), res, body, false) as Record<string, unknown>;
    expect(out).not.toHaveProperty('refreshToken');
    expect(out.accessToken).toBe('jwt');
    expect(out.user).toEqual({ id: 'u' });
    expect(res.set).toHaveLength(1);
    expect(res.set[0]).toContain('sn_rt=id.secret');
  });
});
