export interface RefreshDto {
  refreshToken: string;
}

export function parseRefreshDto(body: unknown): RefreshDto {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be an object');
  }
  const { refreshToken } = body as Record<string, unknown>;
  if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    throw new Error('refreshToken is required');
  }
  return { refreshToken };
}
