// No class-validator/class-transformer dependency exists in services/api
// yet (see package.json), and adding a global ValidationPipe would mean
// editing the shared main.ts that other Sprint 1 backend PRs (B2/B4/B6)
// are touching concurrently — so this PR validates by hand instead of
// pulling in a new cross-cutting dependency for two small DTOs. If a
// later PR adds class-validator for register/reset-password's stricter
// rules, these DTOs are small enough to convert then.
export interface LoginDto {
  email: string;
  password: string;
}

export function parseLoginDto(body: unknown): LoginDto {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be an object');
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new Error('email is required');
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('password is required');
  }
  return { email: email.trim().toLowerCase(), password };
}
