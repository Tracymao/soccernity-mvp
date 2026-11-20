import { ConflictException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsernamePolicyService } from './username-policy.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-17T12:00:00Z');

function build(opts: { revocations?: Array<{ userId: string; holdUntil: Date }>; clubMatch?: boolean } = {}) {
  const prisma = {
    revokedUsername: { findMany: jest.fn(async () => opts.revocations ?? []) },
    $queryRaw: jest.fn(async () => (opts.clubMatch ? [{ one: 1 }] : [])),
  } as unknown as PrismaService;
  return { service: new UsernamePolicyService(prisma), prisma };
}

const base = { userId: 'u-1', candidate: 'fresh_name', current: null as string | null, usernameChangedAt: null as Date | null, owner: {} };

async function code(p: Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    await p;
  } catch (e) {
    const err = e as HttpException;
    return { status: err.getStatus(), body: err.getResponse() as Record<string, unknown> };
  }
  throw new Error('expected a refusal');
}

describe('UsernamePolicyService (B-032)', () => {
  it('allows a clean handle', async () => {
    const { service } = build();
    await expect(service.assertAssignable(base, NOW)).resolves.toBeUndefined();
  });

  it('refuses a rule failure with 400 username_not_allowed and a generic message that does not name the rule', async () => {
    const { service, prisma } = build();
    const r = await code(service.assertAssignable({ ...base, candidate: 'admin' }, NOW));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'username_not_allowed', message: 'That username is not available. Please choose another.' });
    // cheap rules first: no database work for a handle the pure rules already refuse
    expect((prisma.revokedUsername.findMany as jest.Mock)).not.toHaveBeenCalled();
    expect((prisma.$queryRaw as jest.Mock)).not.toHaveBeenCalled();
  });

  it('names the reason only for personal data (it is about the user own details)', async () => {
    const { service } = build();
    const r = await code(
      service.assertAssignable({ ...base, candidate: 'ada_obi', owner: { displayName: 'Ada Obi' } }, NOW),
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('username_not_allowed');
    expect(String(r.body.message)).toContain("can't include your name");
  });

  it('refuses a handle that is a club name, as impersonation', async () => {
    const { service } = build({ clubMatch: true });
    const r = await code(service.assertAssignable({ ...base, candidate: 'chelsea_fc' }, NOW));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('username_not_allowed');
  });

  it('skips the club query for a very short comparable form', async () => {
    const { service, prisma } = build();
    await service.assertAssignable({ ...base, candidate: 'fc_ab' }, NOW);
    expect(prisma.$queryRaw as jest.Mock).not.toHaveBeenCalled();
  });

  describe('revoked handles (#398 D3, #402 item 3)', () => {
    it('a handle revoked FROM THIS USER is refused for ever, even after the 30-day hold has ended', async () => {
      const { service } = build({ revocations: [{ userId: 'u-1', holdUntil: new Date(NOW.getTime() - 400 * DAY) }] });
      const r = await code(service.assertAssignable(base, NOW));
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('username_not_allowed');
    });

    it('a handle revoked from someone else is held for EVERYONE until holdUntil, and then looks like a taken name', async () => {
      const { service } = build({ revocations: [{ userId: 'other', holdUntil: new Date(NOW.getTime() + 5 * DAY) }] });
      const err = await service.assertAssignable(base, NOW).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('That username is already taken');
    });

    it('is free again for everyone else once the hold has ended', async () => {
      const { service } = build({ revocations: [{ userId: 'other', holdUntil: new Date(NOW.getTime() - 1) }] });
      await expect(service.assertAssignable(base, NOW)).resolves.toBeUndefined();
    });

    it('the hold ends exactly at holdUntil (not before)', async () => {
      const { service } = build({ revocations: [{ userId: 'other', holdUntil: new Date(NOW.getTime() + 1) }] });
      await expect(service.assertAssignable(base, NOW)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('change cooldown', () => {
    const changed = (daysAgo: number) => ({
      ...base,
      candidate: 'next_name',
      current: 'old_name',
      usernameChangedAt: new Date(NOW.getTime() - daysAgo * DAY),
    });

    it('refuses a second change inside 30 days with 429, a code and the date it opens', async () => {
      const { service } = build();
      const r = await code(service.assertAssignable(changed(10), NOW));
      expect(r.status).toBe(429);
      expect(r.body.code).toBe('username_change_cooldown');
      expect(r.body.availableAt).toBe(new Date(NOW.getTime() + 20 * DAY).toISOString());
    });

    it('allows a change once 30 days have passed', async () => {
      const { service } = build();
      await expect(service.assertAssignable(changed(30), NOW)).resolves.toBeUndefined();
    });

    it('never applies to a first choice (no current username), whatever the stored timestamp', async () => {
      const { service } = build();
      await expect(
        service.assertAssignable({ ...base, usernameChangedAt: new Date(NOW.getTime() - DAY) }, NOW),
      ).resolves.toBeUndefined();
    });

    it('never applies to a user who has changed nothing yet (the free first correction)', async () => {
      const { service } = build();
      await expect(
        service.assertAssignable({ ...base, candidate: 'next_name', current: 'old_name', usernameChangedAt: null }, NOW),
      ).resolves.toBeUndefined();
    });
  });
});
