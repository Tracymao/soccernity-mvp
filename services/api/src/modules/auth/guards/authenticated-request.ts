import { Request } from 'express';
import { AccessTokenPayload } from '../token/token.types';

// The shape of `request` after JwtAuthGuard has run successfully.
// Handlers/decorators that only make sense on a guarded route (e.g.
// @CurrentUser()) should type against this rather than the bare Express
// Request, so `request.user` doesn't need an `| undefined` check at every
// call site.
export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}
