import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Reusable guard for the not-yet-built /auth/login and /auth/register
// routes (Build Plan Section 5.7). Currently a thin subclass of
// @nestjs/throttler's default IP-based guard — the hook point is here
// (e.g. to override getTracker to also key on the submitted email, to
// slow down credential-stuffing across many IPs against one account) if
// B2/B3 need something stricter than plain per-IP limiting.
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {}
