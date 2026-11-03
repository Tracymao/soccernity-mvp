import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS } from './admin-action-log.constants';
import { ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS } from './admin-action-log-read.constants';
import { AdminActionLogReadService } from './admin-action-log-read.service';

// Mocked-Prisma unit test. What the SQL actually DOES against Postgres (scope, the child-safety exclusion, ties in
// pagination) is proven in test/admin-action-log-read.e2e-spec.ts; here: that the query the service builds carries the
// conditions it must, and how rows map to the response.
const EDITOR = { sub: '22222222-2222-4222-8222-222222222222', role: 'editor' };
const SUPER = { sub: '11111111-1111-4111-8111-111111111111', role: 'superadmin' };
const OTHER = '44444444-4444-4444-8444-444444444444';

function build(opts: { vetted: boolean; rows?: unknown[] }) {
  const queryRaw = jest.fn().mockResolvedValue(opts.rows ?? []);
  const prisma = {
    $queryRaw: queryRaw,
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted }) },
  } as unknown as PrismaService;
  return { service: new AdminActionLogReadService(prisma), queryRaw, prisma };
}

function sqlOf(queryRaw: jest.Mock): Prisma.Sql {
  return queryRaw.mock.calls[0][0] as Prisma.Sql;
}

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `log-${n}`,
  createdAt: new Date(Date.UTC(2026, 10, 2, 12, 0, 60 - n)),
  adminId: 'a1',
  fullName: 'Ada Admin',
  action: ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
  targetType: 'report',
  targetId: `report-${n}`,
  notes: `note ${n}`,
  ...over,
});

describe('AdminActionLogReadService', () => {
  it('maps rows to { id, createdAt, actor { id, displayName }, action, targetType, targetId, notes }, notes untouched', async () => {
    const { service } = build({ vetted: true, rows: [row(1, { notes: '  exactly as stored \n' }), row(2, { notes: null })] });
    const page = await service.list({}, SUPER);
    expect(page.items).toEqual([
      {
        id: 'log-1',
        createdAt: row(1).createdAt,
        actor: { id: 'a1', displayName: 'Ada Admin' },
        action: 'report.actioned',
        targetType: 'report',
        targetId: 'report-1',
        notes: '  exactly as stored \n',
      },
      expect.objectContaining({ id: 'log-2', notes: null }),
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('an empty log is an empty page with no cursor', async () => {
    const { service } = build({ vetted: true, rows: [] });
    expect(await service.list({}, SUPER)).toEqual({ items: [], nextCursor: null });
  });

  it('reads one extra row to know there is a next page, never returns it, and cursors off the last RETURNED row', async () => {
    const rows = [row(1), row(2), row(3)];
    const { service, queryRaw } = build({ vetted: true, rows });
    const page = await service.list({ limit: '2' }, SUPER);
    expect(page.items.map((i) => i.id)).toEqual(['log-1', 'log-2']);
    expect(page.nextCursor).not.toBeNull();
    // LIMIT is limit + 1 (a bound parameter)
    expect(sqlOf(queryRaw).values).toContain(3);
    const second = build({ vetted: true, rows: [row(3)] });
    await second.service.list({ limit: '2', cursor: page.nextCursor as string }, SUPER);
    expect(sqlOf(second.queryRaw).sql).toContain('(l."createdAt", l."id") <');
  });

  describe('scope', () => {
    it('a non-superadmin query ALWAYS carries adminId = the token subject', async () => {
      const { service, queryRaw } = build({ vetted: true });
      await service.list({}, EDITOR);
      const q = sqlOf(queryRaw);
      expect(q.sql).toContain('l."adminId" =');
      expect(q.values).toContain(EDITOR.sub);
    });

    it('a non-superadmin cannot pass adminId: the request is refused before any query runs', async () => {
      const { service, queryRaw } = build({ vetted: true });
      await expect(service.list({ adminId: OTHER }, EDITOR)).rejects.toMatchObject({ status: 400 });
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('a superadmin with no adminId has no adminId condition; with one, the condition carries it', async () => {
      const all = build({ vetted: true });
      await all.service.list({}, SUPER);
      expect(sqlOf(all.queryRaw).sql).not.toContain('l."adminId" =');

      const one = build({ vetted: true });
      await one.service.list({ adminId: OTHER }, SUPER);
      expect(sqlOf(one.queryRaw).sql).toContain('l."adminId" =');
      expect(sqlOf(one.queryRaw).values).toContain(OTHER);
    });
  });

  describe('child-safety rule', () => {
    it('a vetted reader gets no child-safety conditions', async () => {
      const { service, queryRaw } = build({ vetted: true });
      await service.list({}, EDITOR);
      const q = sqlOf(queryRaw);
      expect(q.sql).not.toContain('"isMinor"');
      expect(q.sql).not.toContain('"concernsMinor"');
      expect(q.sql).not.toContain('<> ALL');
    });

    it('an unvetted reader excludes the child-safety actions and every minor-target kind in the QUERY', async () => {
      const { service, queryRaw } = build({ vetted: false });
      await service.list({}, EDITOR);
      const q = sqlOf(queryRaw);
      expect(q.sql).toContain('<> ALL');
      expect(q.values).toContainEqual([...ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS]);
      expect(q.sql).toContain('"User" u');
      expect(q.sql).toContain('"Report" r');
      expect(q.sql).toContain('"PostMedia" m');
      expect(q.sql).toContain('"ContactEnquiry" ce');
      expect(q.sql).toContain('"concernsMinor" = false');
      expect(q.sql).toContain('"concernsMinor" = true');
    });

    it('the vetting read is fresh, by the token subject, regardless of role', async () => {
      const { service, prisma } = build({ vetted: false });
      await service.list({}, SUPER);
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({ where: { id: SUPER.sub }, select: { childSafetyVetted: true } });
    });

    it('the child-safety action list names guardian-notice and date-of-birth actions', () => {
      expect(ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS).toEqual(
        expect.arrayContaining([
          'user.guardian_notices_withheld',
          'user.guardian_notices_cleared',
          'user.guardian_notices_reviewed',
          'user.dob_viewed',
          'user.dob_corrected',
        ]),
      );
    });
  });

  describe('filters', () => {
    it('action, from and to become bound conditions', async () => {
      const { service, queryRaw } = build({ vetted: true });
      await service.list({ action: 'report.actioned', from: '2026-11-01', to: '2026-11-02' }, SUPER);
      const q = sqlOf(queryRaw);
      expect(q.sql).toContain('l."action" =');
      expect(q.sql).toContain('l."createdAt" >=');
      expect(q.sql).toContain('l."createdAt" <');
      expect(q.values).toContain('report.actioned');
    });

    it('a bad filter value is a 400 with a stable code and runs no query', async () => {
      const { service, queryRaw } = build({ vetted: true });
      await expect(service.list({ action: 'nope' }, SUPER)).rejects.toMatchObject({
        response: { code: 'admin_action_log_action_invalid' },
      });
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  it('reading writes nothing: only $queryRaw and one adminUser read are used', async () => {
    const { service, prisma } = build({ vetted: true });
    await service.list({}, SUPER);
    expect((prisma as unknown as { adminActionLog?: unknown }).adminActionLog).toBeUndefined();
  });
});
