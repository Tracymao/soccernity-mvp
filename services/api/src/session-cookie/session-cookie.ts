import { ForbiddenException } from '@nestjs/common';
import { buildCorsConfig, isOriginAllowed } from '../cors-options';
import { parse, serialize } from './cookie-lib';

// B-245 / B-248 / Decision Log "Token storage" (Build Plan 5.7 stands; supersedes the
// interim body-token implementation). COOKIE SESSION MODE is the DEFAULT FOR BROWSERS.
//
// A request is in cookie mode when EITHER
//   (a) it carries `X-Auth-Mode: cookie`, or
//   (b) it carries an `Origin` header that is on the exact-origin allowlist the CORS layer uses
//       (WEB_APP_BASE_URL, ADMIN_APP_BASE_URL, plus localhost outside production).
// In cookie mode the refresh token is an httpOnly, Secure, SameSite=Strict, HOST-ONLY cookie (no
// Domain) and is OMITTED from the response body; the access token stays in the body. So a browser
// on an allowed origin is never handed a refresh token in a body, whether or not its code
// remembers to send the header (B-248).
//
// A request with NO Origin, or an Origin that is not on the allowlist, and without the header stays
// in body mode: that is the contract for native clients (apps/mobile, scripts, API-level test
// helpers) -- they send no Origin and receive body tokens as before. A foreign browser origin
// cannot read the response anyway (CORS), and gets body mode, never a cookie.
//
// apps/web and apps/admin STILL send the header on the five session routes: with it, an Origin
// missing from WEB_APP_BASE_URL / ADMIN_APP_BASE_URL (a deployment mistake) fails loudly with a 403
// on refresh/logout instead of silently falling back to body tokens.
//
// Staging on default onrender.com addresses cannot use cookie mode until same-site custom domains
// exist (B-249; Decision Log #437).

export const COOKIE_MODE_HEADER = 'x-auth-mode';
export const COOKIE_MODE_VALUE = 'cookie';

export interface SessionCookieConfig {
  name: string;
  // Narrowest path that still covers that audience's refresh/logout routes, so
  // the browser does not attach the cookie to anything else.
  path: string;
}

// User and admin cookies are different names AND different paths, and each
// controller only ever reads its own, so one audience's cookie can never be
// accepted by the other's endpoints (proven in admin-auth-isolation.e2e-spec.ts).
export const USER_SESSION_COOKIE: SessionCookieConfig = { name: 'sn_rt', path: '/auth' };
export const ADMIN_SESSION_COOKIE: SessionCookieConfig = { name: 'sn_admin_rt', path: '/admin/auth' };

// Minimal structural shapes, so Express's Request/Response satisfy them and a unit test can pass plain objects.
export interface HeaderReq {
  headers?: Record<string, string | string[] | undefined>;
}
// What the helpers read from the environment (process.env satisfies it).
export type EnvLike = Record<string, string | undefined>;

export interface AppendRes {
  append(name: string, value: string): unknown;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function originHeader(req: HeaderReq): string | undefined {
  const raw = req.headers?.origin;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

// The single switch every cookie-aware caller uses (auth, registration, admin auth, the global
// rate-limit refresh tracker, applyCookieSession). See the header comment for the rule.
// `isOriginAllowed(undefined, ...)` is true (a non-CORS request), so an absent Origin is handled
// explicitly here: no Origin never means cookie mode on its own.
export function isCookieMode(req: HeaderReq | undefined, env: EnvLike = process.env): boolean {
  const raw = req?.headers?.[COOKIE_MODE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.trim().toLowerCase() === COOKIE_MODE_VALUE) return true;
  if (!req) return false;
  const origin = originHeader(req);
  return origin !== undefined && isOriginAllowed(origin, buildCorsConfig(env));
}

// `Secure` is required in production. Outside production it is dropped ONLY when
// the browser is talking from an http://localhost-style origin (local dev); any
// other case, including a request with no Origin, stays Secure.
export function shouldBeSecure(req: HeaderReq, env: EnvLike = process.env): boolean {
  if (env.NODE_ENV === 'production') return true;
  const origin = originHeader(req);
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname.toLowerCase()));
  } catch {
    return true;
  }
}

// Refresh and logout in cookie mode are the two routes a cross-site page could
// forge (the browser attaches the cookie on its own), so they require an Origin
// that is on the same exact-origin allowlist CORS uses. Missing or foreign -> 403.
export function assertAllowedCookieOrigin(
  req: HeaderReq,
  env: EnvLike = process.env,
): void {
  const origin = originHeader(req);
  if (!origin || !isOriginAllowed(origin, buildCorsConfig(env))) {
    throw new ForbiddenException('Origin not allowed');
  }
}

export function readRefreshCookie(req: HeaderReq, cfg: SessionCookieConfig): string | undefined {
  const header = req.headers?.cookie;
  if (typeof header !== 'string' || header === '') return undefined;
  const value = parse(header)[cfg.name];
  return value ? value : undefined;
}

export interface RefreshCookieInput {
  token: string;
  expiresAt: Date;
  // "Stay signed in": true -> persistent cookie, Max-Age = the refresh TTL;
  // false -> session cookie (no Max-Age / Expires), gone when the browser closes.
  persistent: boolean;
}

function appendSetCookie(res: AppendRes, value: string): void {
  res.append('Set-Cookie', value);
}

export function setRefreshCookie(
  req: HeaderReq,
  res: AppendRes,
  cfg: SessionCookieConfig,
  input: RefreshCookieInput,
  env: EnvLike = process.env,
): void {
  const maxAgeSeconds = Math.max(0, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000));
  appendSetCookie(
    res,
    serialize(cfg.name, input.token, {
      httpOnly: true,
      secure: shouldBeSecure(req, env),
      sameSite: 'strict',
      path: cfg.path,
      // No `domain`: host-only.
      ...(input.persistent ? { maxAge: maxAgeSeconds } : {}),
    }),
  );
}

export function clearRefreshCookie(
  req: HeaderReq,
  res: AppendRes,
  cfg: SessionCookieConfig,
  env: EnvLike = process.env,
): void {
  appendSetCookie(
    res,
    serialize(cfg.name, '', {
      httpOnly: true,
      secure: shouldBeSecure(req, env),
      sameSite: 'strict',
      path: cfg.path,
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

// Shapes a token-bearing response for the caller's mode. Not in cookie mode (native client):
// returned untouched (the identical object). In cookie mode: the refresh token
// goes into the cookie and is OMITTED from the body; everything else stays.
export function applyCookieSession<T extends { refreshToken: string; refreshTokenExpiresAt: string }>(
  cfg: SessionCookieConfig,
  req: HeaderReq | undefined,
  res: AppendRes | undefined,
  body: T,
  persistent: boolean,
  env: EnvLike = process.env,
): T | Omit<T, 'refreshToken'> {
  if (!req || !res || !isCookieMode(req, env)) return body;
  setRefreshCookie(req, res, cfg, {
    token: body.refreshToken,
    expiresAt: new Date(body.refreshTokenExpiresAt),
    persistent,
  }, env);
  const rest: Partial<T> = { ...body };
  delete rest.refreshToken;
  return rest as Omit<T, 'refreshToken'>;
}
