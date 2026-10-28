import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerOptions } from '@nestjs/throttler';
import {
  GLOBAL_RATE_LIMIT_DEFAULTS as D,
  GLOBAL_THROTTLER,
  UPLOAD_RATE_LIMIT_KEY,
  WRITE_METHODS,
} from './global-rate-limit.constants';

export interface ConfigReader {
  get(key: string): string | undefined;
}

export interface GlobalRateLimitNumbers {
  userMax: number;
  userWindowMs: number;
  anonMax: number;
  anonWindowMs: number;
  writeMax: number;
  writeWindowMs: number;
  uploadMax: number;
  uploadWindowMs: number;
}

// A positive whole number, else the default. A blank, zero, negative or non-numeric value falls back
// to the default instead of silently disabling a limit.
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
}

// Every name is spelled out as a literal so src/env-completeness.spec.ts (B-018) can see it and fail
// the build if render.yaml or .env.example lacks one.
export function readGlobalRateLimitNumbers(config: ConfigReader): GlobalRateLimitNumbers {
  return {
    userMax: positiveInt(config.get('GLOBAL_RATE_LIMIT_USER_MAX'), D.userMax),
    userWindowMs: positiveInt(config.get('GLOBAL_RATE_LIMIT_USER_WINDOW_MS'), D.userWindowMs),
    anonMax: positiveInt(config.get('GLOBAL_RATE_LIMIT_ANON_MAX'), D.anonMax),
    anonWindowMs: positiveInt(config.get('GLOBAL_RATE_LIMIT_ANON_WINDOW_MS'), D.anonWindowMs),
    writeMax: positiveInt(config.get('GLOBAL_RATE_LIMIT_WRITE_MAX'), D.writeMax),
    writeWindowMs: positiveInt(config.get('GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS'), D.writeWindowMs),
    uploadMax: positiveInt(config.get('GLOBAL_RATE_LIMIT_UPLOAD_MAX'), D.uploadMax),
    uploadWindowMs: positiveInt(config.get('GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS'), D.uploadWindowMs),
  };
}

// Who a request is counted against.
export interface RequestIdentity {
  kind: 'user' | 'ip';
  tracker: string;
}

// Resolves the identity of a request. A bearer token that VERIFIES yields the user id; anything else
// (no header, malformed header, bad signature, expired token) falls back to the client IP. Must
// never throw. `verifyAccessToken` is TokenService.verifyAccessToken in production.
export function createIdentityResolver(
  verifyAccessToken: (token: string) => { sub?: string },
): (req: Record<string, any>) => RequestIdentity {
  const cache = new WeakMap<object, RequestIdentity>();
  return (req) => {
    const hit = cache.get(req);
    if (hit) return hit;
    let identity: RequestIdentity = { kind: 'ip', tracker: `ip:${req.ip ?? 'unknown'}` };
    try {
      const header = req.headers?.authorization;
      if (typeof header === 'string') {
        const [scheme, token] = header.split(' ');
        if (scheme === 'Bearer' && token) {
          const sub = verifyAccessToken(token)?.sub;
          if (typeof sub === 'string' && sub.length > 0) identity = { kind: 'user', tracker: `user:${sub}` };
        }
      }
    } catch {
      // An invalid or expired token is an anonymous request, not an error.
    }
    cache.set(req, identity);
    return identity;
  };
}

// Builds the four named throttlers. Each carries a skipIf that decides whether it applies to a given
// request, so a request is counted against exactly: ONE of {user, anon}, plus {writes} on a write
// method, plus {uploads} on a tagged upload route.
//
// generateKey drops the default class+handler from the key, so each limit is global PER CALLER, not
// per route (otherwise "120 per minute per user" would really be 120 per route).
export function buildGlobalThrottlerOptions(
  numbers: GlobalRateLimitNumbers,
  resolveIdentity: (req: Record<string, any>) => RequestIdentity,
): ThrottlerOptions[] {
  const reflector = new Reflector();
  const reqOf = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Record<string, any>>();
  const isUploadRoute = (ctx: ExecutionContext) =>
    reflector.getAllAndOverride<boolean>(UPLOAD_RATE_LIMIT_KEY, [ctx.getHandler(), ctx.getClass()]) === true;
  const common = {
    // Retry-After is set by GlobalThrottlerGuard; suffixed per-class headers would only add noise.
    setHeaders: false,
    getTracker: (req: Record<string, any>) => resolveIdentity(req).tracker,
    generateKey: (_ctx: ExecutionContext, tracker: string, name: string) => `${name}:${tracker}`,
  };
  return [
    {
      ...common,
      name: GLOBAL_THROTTLER.user,
      limit: numbers.userMax,
      ttl: numbers.userWindowMs,
      skipIf: (ctx) => resolveIdentity(reqOf(ctx)).kind !== 'user',
    },
    {
      ...common,
      name: GLOBAL_THROTTLER.anon,
      limit: numbers.anonMax,
      ttl: numbers.anonWindowMs,
      skipIf: (ctx) => resolveIdentity(reqOf(ctx)).kind !== 'ip',
    },
    {
      ...common,
      name: GLOBAL_THROTTLER.writes,
      limit: numbers.writeMax,
      ttl: numbers.writeWindowMs,
      skipIf: (ctx) => !WRITE_METHODS.has(String(reqOf(ctx).method ?? '').toUpperCase()),
    },
    {
      ...common,
      name: GLOBAL_THROTTLER.uploads,
      limit: numbers.uploadMax,
      ttl: numbers.uploadWindowMs,
      skipIf: (ctx) => !isUploadRoute(ctx),
    },
  ];
}
