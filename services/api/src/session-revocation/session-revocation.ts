import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

// B-305 (Decision Log #500): revoking a user's or an admin's sessions used to delete refresh tokens only, so an
// access token already issued kept working for up to its whole lifetime (JWT_ACCESS_TTL_SECONDS /
// ADMIN_JWT_ACCESS_TTL_SECONDS, 15 minutes by default). The two revoke methods now also write a per-subject
// "sessions revoked at" marker in Redis, and the three access-token guards refuse a token issued before it.
// This file holds the pieces both sides (user and admin) share. Nothing here is in the token itself: the check
// uses the standard `iat` claim that jsonwebtoken puts in every token it signs.

// The marker lives as long as any access token issued before the revocation can still be valid (the access-token
// lifetime), plus this margin for clock skew and the second `iat` is rounded down to. A marker that has expired
// can no longer matter: every token it could have refused has expired by itself.
export const SESSION_REVOCATION_MARKER_MARGIN_SECONDS = 60;

export function revocationMarkerTtlMs(accessTokenTtlSeconds: number): number {
  return (accessTokenTtlSeconds + SESSION_REVOCATION_MARKER_MARGIN_SECONDS) * 1000;
}

// `iat` is whole seconds, so the marker is too (same clock source as the signing: the server's real clock).
export function wholeSecondsNow(): number {
  return Math.floor(Date.now() / 1000);
}

// ACCEPTED EDGE (documented in the auth, admin and token READMEs): because both numbers are whole seconds, a
// token issued in the SAME second as a revocation, but just before it, is NOT refused (iat === marker). The
// rule is strictly "issued before the revocation second": a token issued at or after it is accepted. A token
// with no readable `iat` (never produced by this server) is treated as issued at 0, so it is refused.
export function isIssuedBeforeRevocation(issuedAt: number | undefined, markerSeconds: number | null): boolean {
  if (markerSeconds === null) return false;
  const iat = typeof issuedAt === 'number' && Number.isFinite(issuedAt) ? issuedAt : 0;
  return iat < markerSeconds;
}

// A marker that is not a positive whole number is ignored (never trusted, never thrown on).
export function parseRevocationMarker(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export type SessionRevocationScope = 'user' | 'admin';

const logger = new Logger('SessionRevocation');
const lastReportedAt: Record<SessionRevocationScope, number> = { user: 0, admin: 0 };
const REPORT_INTERVAL_MS = 60 * 1000;

// FAIL OPEN: when Redis cannot be read the guards accept the token (a Redis blip must not sign every user and
// admin out), and say so loudly. At most one log line AND one Sentry event a minute per scope, so a Redis outage
// does not do both on every request. The Sentry event is tagged session_revocation=<user|admin>, the way the
// rate limiters tag rate_limiter=<...>. Sentry is a no-op until SENTRY_DSN is real. This function never throws.
export function reportRevocationCheckFailure(scope: SessionRevocationScope, err: unknown, now = Date.now()): void {
  if (now - lastReportedAt[scope] < REPORT_INTERVAL_MS) return;
  lastReportedAt[scope] = now;
  try {
    logger.warn(
      `Could not read the ${scope} session-revocation marker; accepting the access token (fail open): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    Sentry.captureException(err, { tags: { session_revocation: scope } });
  } catch {
    // Reporting must never break a request.
  }
}

// Test helper: clears the once-a-minute throttle.
export function resetRevocationReportThrottle(): void {
  lastReportedAt.user = 0;
  lastReportedAt.admin = 0;
}
