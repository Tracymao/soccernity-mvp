import { Request } from 'express';
import { AdminAccessTokenPayload } from '../token/admin-token.types';

// The shape of `request` after AdminJwtAuthGuard has run successfully.
// Mirrors services/api/src/modules/auth/guards/authenticated-request.ts's
// AuthenticatedRequest exactly, but deliberately its own type, attached
// under `request.admin` (not `request.user`) — a second, cheap layer of
// separation at the request-object level itself, on top of the two
// isolation layers AdminTokenService's header comment already describes.
export interface AuthenticatedAdminRequest extends Request {
  admin: AdminAccessTokenPayload;
}
