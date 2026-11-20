// Plain Error subclasses (not NestJS HttpExceptions) — these are thrown by
// HighlightlyClient/SportsDataBudgetService and caught INSIDE sports.service.ts, which decides the
// actual HTTP response (serve a stale cached row if one exists; 503 only when there's truly nothing
// to fall back on). Mirrors this codebase's established convention of plain-Error upstream/
// infrastructure failures vs. NestJS exceptions for the final HTTP-facing decision (e.g.
// InvalidRefreshTokenError/RefreshTokenReuseDetectedError in modules/auth/token/token.errors.ts).

// Thrown by SportsDataBudgetService when the configured daily request budget
// (HIGHLIGHTLY_DAILY_REQUEST_BUDGET, default 100 — the confirmed free-tier limit) has already been
// spent for the current UTC day. See sports-data-budget.service.ts's own header comment for why the
// real paid-tier budget is a Decision Log candidate, not assumed unlimited.
export class SportsDataBudgetExhaustedError extends Error {
  constructor(message = 'Daily sports-data request budget exhausted') {
    super(message);
    this.name = 'SportsDataBudgetExhaustedError';
  }
}

// Thrown by HighlightlyClient for any non-2xx response other than a genuine 404 (network failure,
// 5xx, malformed JSON, an unconfigured/placeholder API key) — see SportsDataNotFoundError in
// sports-data-client.ts for the 404 case, which is deliberately a DIFFERENT type since
// sports.service.ts treats "upstream said this genuinely doesn't exist" differently from "upstream
// is unreachable/erroring right now."
export class SportsDataUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SportsDataUpstreamError';
  }
}
