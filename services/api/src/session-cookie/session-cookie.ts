import { ForbiddenException } from '@nestjs/common';
import { buildCorsConfig, isOriginAllowed } from '../cors-options';
import { parse, serialize } from './cookie-lib';

// B-245 / Decision Log "Token storage" (Build Plan 5.7 stands; supersedes the
// interim body-token implementation). OPT-IN cookie session mode for the API.
//
// A request carrying `X-Auth-Mode: cookie` gets its refresh token as an httpOnly,
// Secure, SameSite=Strict, HOST-ONLY cookie (no Domain) instead of in the
// response body; the access token stays in the body. WITHOUT that header every
// route behaves exactly as before -- tokens in the body -- so apps/web, apps/admin
// (until B-246 / B-247), the native app and the e2e suites keep working, and
// the body tokens are NOT removed for browsers here (B-248 flips the default
// later). Staging on default onrender.com addresses cannot use cookie mode until
// same-site custom domains exist (B-249): the opt-in is what keeps staging working.

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

export function isCookieMode(req: HeaderReq | undefined): boolean {
  const raw = req?.headers?.[COOKIE_MODE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim().toLowerCase() === COOKIE_MODE_VALUE;
}

function originHeader(req: HeaderReq): string | undefined {
  const raw = req.headers?.origin;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
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

// Shapes a token-bearing response for the caller's mode. Not in cookie mode:
// returned untouched (the identical object). In cookie mode: the refresh token
// goes into the cookie and is OMITTED from the body; everything else stays.
export function applyCookieSession<T extends { refreshToken: string; refreshTokenExpiresAt: string }>(
  cfg: SessionCookieConfig,
  req: HeaderReq | undefined,
  res: AppendRes | undefined,
  body: T,
  persistent: boolean,
): T | Omit<T, 'refreshToken'> {
  if (!req || !res || !isCookieMode(req)) return body;
  setRefreshCookie(req, res, cfg, {
    token: body.refreshToken,
    expiresAt: new Date(body.refreshTokenExpiresAt),
    persistent,
  });
  const rest: Partial<T> = { ...body };
  delete rest.refreshToken;
  return rest as Omit<T, 'refreshToken'>;
}
