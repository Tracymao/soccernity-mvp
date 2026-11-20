import { SetMetadata } from '@nestjs/common';
import {
  REFRESH_RATE_LIMIT_KEY,
  SKIP_GLOBAL_RATE_LIMIT_KEY,
  SKIP_GLOBAL_WRITE_LIMIT_KEY,
  UPLOAD_RATE_LIMIT_KEY,
} from './global-rate-limit.constants';

// Exempts a handler (or a whole controller) from EVERY global limit. Use only where the route
// already has its own, stricter limiter or must stay reachable by infrastructure:
//   - GET /health (load-balancer / uptime probes)
//   - POST /media/uploads (its own per-user POST_MEDIA_UPLOAD_RATE_LIMIT_* limit)
// A route that merely carries @AuthRateLimit() or its own throttler does NOT need this: the global
// limits are far looser, so the route's own limit always trips first.
export const SkipGlobalRateLimit = () => SetMetadata(SKIP_GLOBAL_RATE_LIMIT_KEY, true);

// Marks a route that passes file BYTES through the API (a multer FileInterceptor route). It joins
// the 'global-uploads' class (10 per 10 minutes by default) on top of the ordinary write limit.
// Browser uploads to the post-media bucket go straight to storage and never reach the API, so they
// are not tagged. global-rate-limit.coverage.spec.ts fails the build if a FileInterceptor route is
// added without this decorator.
export const UploadRateLimit = () => SetMetadata(UPLOAD_RATE_LIMIT_KEY, true);

// Exempts a handler from the 'global-writes' class (30 per 60 s) ONLY. The user/anonymous class and the
// uploads class still apply. For a signed-out caller the writes key is the IP, so without this a class of
// children behind one school IP shared 30 sign-ins and sign-ups a minute before the stricter, purpose-built
// limiter on those routes (B-256) was ever reached. Used on every handler that carries @AuthLimit(),
// @AuthRateLimit() or the guardian-withdrawal throttle (each already has its own, stricter limiter), plus
// POST /auth/refresh (which has @RefreshRateLimit() instead). global-rate-limit.coverage.spec.ts fails the
// build if a handler with one of those limiters lacks the tag, or any other handler carries it.
export const SkipGlobalWriteLimit = () => SetMetadata(SKIP_GLOBAL_WRITE_LIMIT_KEY, true);

// POST /auth/refresh only. Adds two in-memory classes on top of the ordinary global ones: per client IP and
// per presented refresh token (by SHA-256; the raw token is never a key or a log value). The admin refresh
// route is deliberately NOT tagged.
export const RefreshRateLimit = () => SetMetadata(REFRESH_RATE_LIMIT_KEY, true);
