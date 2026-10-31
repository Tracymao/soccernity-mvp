import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '../auth/password/password.service';
import { InMemoryRedisFake } from '../auth/token/test-support/in-memory-redis.fake';
import { ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE } from '../two-factor/two-factor.constants';
import { AdminAuthService } from './admin-auth.service';
import { AdminRefreshTokenStore } from './token/admin-refresh-token.store';
import { AdminTokenService } from './token/admin-token.service';

// backend/b086-two-factor-followups: the refresh gate. With ADMIN_2FA_ENFORCED "true", an admin with no two-factor
// cannot keep refreshing a session that predates the switch: the refresh is a coded 401 and every session of that
// admin ends. The REAL token service and refresh-token store run here (so "no usable refresh token is left" is
// observed, not assumed); only Postgres and the enforcement switch are stubs.
function build(opts: { enforced: boolean; totpEnabledAt?: Date | null; rowExists?: boolean }) {
  const store = new AdminRefreshTokenStore(new InMemoryRedisFake());
  const tokens = new AdminTokenService(new JwtService({ secret: 'unit-test-admin-secret' }), store, new ConfigService({}));
  const findUnique = jest.fn(async (args: { where: { id: string } }) =>
    opts.rowExists === false ? null : { id: args.where.id, totpEnabledAt: opts.totpEnabledAt ?? null },
  );
  const twoFactor = { isAdminEnforced: jest.fn(() => opts.enforced) };
  const service = new AdminAuthService(
    { adminUser: { findUnique } } as never,
    new PasswordService(),
    tokens,
    twoFactor as never,
  );
  return { service, tokens, findUnique, twoFactor };
}

const expectCoded401 = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getResponse()).toEqual({
    statusCode: 401,
    error: 'Unauthorized',
    code: ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE,
    message: 'Two-factor enrolment is required.',
  });
};

describe('AdminAuthService.refreshSession: enrolment gate', () => {
  it('enforcement ON, no two-factor: coded 401, and ALL of that admin\'s sessions end, including the one just rotated', async () => {
    const { service, tokens } = build({ enforced: true });
    const sessionA = await tokens.issueTokenPair('admin-1', 'editor');
    const sessionB = await tokens.issueTokenPair('admin-1', 'editor');

    await expectCoded401(service.refreshSession(sessionA.refreshToken.token));

    // The other live session of the same admin is dead...
    await expect(service.refreshSession(sessionB.refreshToken.token)).rejects.toThrow('Invalid or expired refresh token');
    // ...and so is the presented one (it was consumed): presenting it again is reuse, not a new pair.
    await expect(service.refreshSession(sessionA.refreshToken.token)).rejects.toThrow(UnauthorizedException);
  });

  it('enforcement ON, no two-factor: no token pair is returned to the caller (the rejection carries no tokens)', async () => {
    const { service, tokens } = build({ enforced: true });
    const session = await tokens.issueTokenPair('admin-1', 'editor');
    const result = await service.refreshSession(session.refreshToken.token).then(
      (value) => ({ value }),
      (error: UnauthorizedException) => ({ error }),
    );
    expect(result).not.toHaveProperty('value');
    expect(JSON.stringify((result as { error: UnauthorizedException }).error.getResponse())).not.toMatch(/token/i);
  });

  it('enforcement ON, no two-factor: another admin\'s session is untouched', async () => {
    const { service, tokens } = build({ enforced: true });
    const mine = await tokens.issueTokenPair('admin-1', 'editor');
    const theirs = await tokens.issueTokenPair('admin-2', 'editor');
    await expectCoded401(service.refreshSession(mine.refreshToken.token));
    // revokeAllSessionsForAdmin is scoped to one admin: admin-2's token is still a live token in the store.
    await expect(tokens.rotateRefreshToken(theirs.refreshToken.token)).resolves.toBeDefined();
  });

  it('enforcement ON, admin WITH two-factor: refreshes normally and the new pair is returned', async () => {
    const { service, tokens, findUnique } = build({ enforced: true, totpEnabledAt: new Date('2026-10-01T00:00:00.000Z') });
    const session = await tokens.issueTokenPair('admin-1', 'moderator', true);
    const { response, persistent } = await service.refreshSession(session.refreshToken.token);
    expect(response.refreshToken).toEqual(expect.any(String));
    expect(response.refreshToken).not.toBe(session.refreshToken.token);
    expect(persistent).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { totpEnabledAt: true } });
    // The rotated token is a live session.
    await expect(service.refreshSession(response.refreshToken)).resolves.toBeDefined();
  });

  it('enforcement OFF: an admin with no two-factor refreshes as before, with no extra database read', async () => {
    const { service, tokens, findUnique } = build({ enforced: false });
    const session = await tokens.issueTokenPair('admin-1', 'editor');
    const { response } = await service.refreshSession(session.refreshToken.token);
    expect(response.refreshToken).toEqual(expect.any(String));
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('enforcement ON, but the admin row no longer exists: unchanged behaviour (nothing to gate)', async () => {
    const { service, tokens } = build({ enforced: true, rowExists: false });
    const session = await tokens.issueTokenPair('admin-1', 'editor');
    await expect(service.refreshSession(session.refreshToken.token)).resolves.toBeDefined();
  });

  it('an invalid refresh token is the ordinary 401 and touches nothing: no lookup, no revocation', async () => {
    const { service, tokens, findUnique } = build({ enforced: true });
    const live = await tokens.issueTokenPair('admin-1', 'editor');
    await expect(service.refreshSession('not-a-real-token')).rejects.toThrow('Invalid or expired refresh token');
    expect(findUnique).not.toHaveBeenCalled();
    await expect(tokens.rotateRefreshToken(live.refreshToken.token)).resolves.toBeDefined(); // untouched
  });

  it('refresh() (body mode) goes through the same gate', async () => {
    const { service, tokens } = build({ enforced: true });
    const session = await tokens.issueTokenPair('admin-1', 'editor');
    await expectCoded401(service.refresh(session.refreshToken.token));
  });
});
