export interface LogoutDto {
  refreshToken: string;
  /**
   * Logout-everywhere (Build Plan Section 8.4's admin/appeals context, and
   * the README's "single-session and admin-triggered logout-everywhere").
   * Requires a still-valid access token in the Authorization header — see
   * auth.service.ts for why.
   */
  allSessions?: boolean;
}

export function parseLogoutDto(body: unknown): LogoutDto {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be an object');
  }
  const { refreshToken, allSessions } = body as Record<string, unknown>;
  if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    throw new Error('refreshToken is required');
  }
  if (allSessions !== undefined && typeof allSessions !== 'boolean') {
    throw new Error('allSessions must be a boolean when provided');
  }
  return { refreshToken, allSessions: allSessions === true };
}
