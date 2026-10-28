import { SetMetadata } from '@nestjs/common';
import { SKIP_GLOBAL_RATE_LIMIT_KEY, UPLOAD_RATE_LIMIT_KEY } from './global-rate-limit.constants';

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
