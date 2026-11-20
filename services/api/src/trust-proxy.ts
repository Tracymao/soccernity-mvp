import type { INestApplication } from '@nestjs/common';

// B-024 (Decision Log #368). Behind Render's load balancer every request's TCP
// peer is the proxy, so `req.ip` would be the proxy's address for EVERY user:
// GeoLite2 could never see the real client IP, and the per-IP auth rate limit
// (AuthThrottlerGuard keys on req.ip) would throttle all users as one.
//
// Express resolves the client IP from X-Forwarded-For only when told how many
// proxy hops to trust. That number is deployment-specific and getting it
// wrong is unsafe in BOTH directions (too few: req.ip is a proxy's address;
// too many: a client can forge the header), so it is NOT guessed: it comes
// from TRUST_PROXY_HOPS, and when unset NO proxy is trusted. Unset is the
// fail-safe state -- req.ip is then the socket peer (a private or loopback
// address that never resolves to a country), which makes the country lookup
// "unresolved" and applies the stronger safeguarding control.
//
// Returns the hop count to trust, or null when none should be.
export function parseTrustProxyHops(raw: string | undefined | null): number | null {
  const v = raw?.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 10 ? n : null;
}

export function applyTrustProxy(app: INestApplication, raw: string | undefined | null): number | null {
  const hops = parseTrustProxyHops(raw);
  if (hops !== null) {
    // Nest's HTTP adapter exposes the underlying Express app.
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', hops);
  }
  return hops;
}
