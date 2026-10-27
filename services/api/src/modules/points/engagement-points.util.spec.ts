import {
  awardEngagementPoints,
  londonDayBounds,
  receivedRefId,
  revokeEngagementPoints,
  revokeEngagementPointsForAccount,
  revokeEngagementPointsForPost,
} from './engagement-points.util';

// backend/w12-points (B-093): the engine's rules against a small in-memory ledger. The real-Postgres
// behaviour (the unique key, the advisory lock, the rollup) is in test/points-engine.e2e-spec.ts.

interface Row {
  id: string;
  userId: string;
  source: string;
  refId: string;
  quarterPoints: number;
  postId: string | null;
  counterpartId: string | null;
  revokedAt: Date | null;
  clubId: string | null;
  occurredAt: Date;
}

const CAPS = { givenQuarters: 8, receivedQuarters: 3 }; // 2 points given a day; 3 quarters received
const NOON = new Date('2026-11-10T12:00:00.000Z'); // GMT in November

function build(users: Array<{ id: string; representedClubId?: string | null }> = [
  { id: 'giver', representedClubId: 'club-g' },
  { id: 'author', representedClubId: null },
]) {
  const rows: Row[] = [];
  let next = 1;
  const locks: string[] = [];
  const db = {
    user: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        users.filter((u) => where.id.in.includes(u.id)).map((u) => ({ id: u.id, representedClubId: u.representedClubId ?? null })),
      ),
    },
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(String(values[0]));
      return 1;
    }),
    pointsLedgerEntry: {
      findUnique: jest.fn(
        async ({ where }: { where: { source_refId_userId: { source: string; refId: string; userId: string } } }) => {
          const k = where.source_refId_userId;
          const r = rows.find((x) => x.source === k.source && x.refId === k.refId && x.userId === k.userId);
          return r ? { id: r.id, revokedAt: r.revokedAt } : null;
        },
      ),
      aggregate: jest.fn(
        async ({
          where,
        }: {
          where: { userId: string; source: { in: string[] }; revokedAt: null; occurredAt: { gte: Date; lt: Date } };
        }) => {
          const matching = rows.filter(
            (r) =>
              r.userId === where.userId &&
              where.source.in.includes(r.source) &&
              r.revokedAt === null &&
              r.occurredAt >= where.occurredAt.gte &&
              r.occurredAt < where.occurredAt.lt,
          );
          return { _sum: { quarterPoints: matching.length ? matching.reduce((a, r) => a + r.quarterPoints, 0) : null } };
        },
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        Object.assign(rows.find((r) => r.id === where.id)!, data);
        return {};
      }),
      createMany: jest.fn(async ({ data }: { data: Array<Omit<Row, 'id' | 'revokedAt'>> }) => {
        let count = 0;
        for (const d of data) {
          if (rows.some((r) => r.source === d.source && r.refId === d.refId && r.userId === d.userId)) continue;
          rows.push({ ...d, id: `row-${next++}`, revokedAt: null });
          count++;
        }
        return { count };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: { revokedAt: Date } }) => {
        const matches = (r: Row): boolean => {
          if (r.revokedAt !== null) return false;
          const or = where.OR as Array<Record<string, unknown>> | undefined;
          if (or) {
            if (!or.some((c) => Object.entries(c).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))) {
              return false;
            }
          }
          if (where.postId !== undefined && r.postId !== where.postId) return false;
          const src = where.source as { in: string[] } | undefined;
          if (src && !src.in.includes(r.source)) return false;
          return true;
        };
        const hit = rows.filter(matches);
        hit.forEach((r) => (r.revokedAt = data.revokedAt));
        return { count: hit.length };
      }),
    },
  };
  return { db: db as never, rows, locks, raw: db };
}

const like = { kind: 'like' as const, postId: 'post-1', postAuthorId: 'author', giverId: 'giver' };
const award = (db: never, over: Partial<Parameters<typeof awardEngagementPoints>[1]> = {}) =>
  awardEngagementPoints(db, { ...like, now: NOON, caps: CAPS, ...over });

describe('awardEngagementPoints (spec 9a, 9b)', () => {
  it('gives the giver 1 point (4 units) and the creator 0.25 (1 unit)', async () => {
    const { db, rows } = build();
    const result = await award(db);
    expect(result).toEqual({ giver: 'awarded', receiver: 'awarded' });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === 'giver')).toMatchObject({
      source: 'engagement_like_given',
      refId: 'post-1',
      quarterPoints: 4,
      postId: 'post-1',
      counterpartId: null,
      clubId: 'club-g',
      occurredAt: NOON,
    });
    expect(rows.find((r) => r.userId === 'author')).toMatchObject({
      source: 'engagement_like_received',
      refId: receivedRefId('post-1', 'giver'),
      quarterPoints: 1,
      postId: 'post-1',
      counterpartId: 'giver',
    });
  });

  it('each kind (view, like, comment) has its own given and received source', async () => {
    const { db, rows } = build();
    for (const kind of ['view', 'like', 'comment'] as const) {
      await award(db, { kind, caps: { givenQuarters: 100, receivedQuarters: 100 } });
    }
    expect(rows.map((r) => r.source).sort()).toEqual([
      'engagement_comment_given',
      'engagement_comment_received',
      'engagement_like_given',
      'engagement_like_received',
      'engagement_view_given',
      'engagement_view_received',
    ]);
  });

  it('is idempotent: a second award for the same (kind, post, giver) writes nothing', async () => {
    const { db, rows } = build();
    await award(db);
    expect(await award(db)).toEqual({ giver: 'duplicate', receiver: 'duplicate' });
    expect(rows).toHaveLength(2);
  });

  it('the creator earns one quarter point per unique ACCOUNT per post', async () => {
    const { db, rows } = build([
      { id: 'giver' },
      { id: 'giver-2' },
      { id: 'author' },
    ]);
    await award(db);
    await award(db, { giverId: 'giver-2' });
    expect(rows.filter((r) => r.userId === 'author').map((r) => r.refId).sort()).toEqual([
      'post-1:giver',
      'post-1:giver-2',
    ]);
  });

  it('SELF-ENGAGEMENT is exempt: a creator liking their own post earns nothing and nothing is read', async () => {
    const { db, rows, raw } = build();
    expect(await award(db, { giverId: 'author' })).toEqual({ giver: 'self', receiver: 'self' });
    expect(rows).toHaveLength(0);
    expect(raw.user.findMany).not.toHaveBeenCalled();
  });

  it('an INELIGIBLE giver (unverified / restricted / inactive) earns nothing and earns the creator nothing', async () => {
    // user.findMany applies the eligibility filter: an ineligible giver is simply not returned.
    const { db, rows } = build([{ id: 'author' }]);
    expect(await award(db)).toEqual({ giver: 'ineligible', receiver: 'ineligible' });
    expect(rows).toHaveLength(0);
  });

  it('an ineligible CREATOR earns nothing, but the giver still earns (the engagement was genuine)', async () => {
    const { db, rows } = build([{ id: 'giver' }]);
    expect(await award(db)).toEqual({ giver: 'awarded', receiver: 'ineligible' });
    expect(rows.map((r) => r.userId)).toEqual(['giver']);
  });

  it('asks the database for the eligibility test the contest uses (active, verified email, adult or consented minor)', async () => {
    const { db, raw } = build();
    await award(db);
    const where = raw.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ accountStatus: 'active', verificationStatus: 'verified' });
    expect(JSON.stringify(where)).toContain('confirmed');
  });

  describe('daily caps (Europe/London calendar day)', () => {
    it('stops the GIVER at the cap: 2 points a day here, the third like earns the giver nothing', async () => {
      const { db, rows } = build();
      await award(db, { postId: 'p1' });
      await award(db, { postId: 'p2' });
      const third = await award(db, { postId: 'p3' });
      expect(third.giver).toBe('capped');
      expect(rows.filter((r) => r.source === 'engagement_like_given')).toHaveLength(2);
    });

    it('caps the two directions independently: a capped giver still earns the creator their quarter point', async () => {
      const { db, rows } = build();
      await award(db, { postId: 'p1' });
      await award(db, { postId: 'p2' });
      const third = await award(db, { postId: 'p3' });
      expect(third).toEqual({ giver: 'capped', receiver: 'awarded' });
      expect(rows.filter((r) => r.source === 'engagement_like_received')).toHaveLength(3);
    });

    it('stops the CREATOR at the receive cap (3 quarters here); the giver still earns', async () => {
      const users = ['g1', 'g2', 'g3', 'g4', 'author'].map((id) => ({ id }));
      const { db, rows } = build(users);
      for (const giverId of ['g1', 'g2', 'g3']) await award(db, { giverId });
      const fourth = await award(db, { giverId: 'g4' });
      expect(fourth).toEqual({ giver: 'awarded', receiver: 'capped' });
      expect(rows.filter((r) => r.userId === 'author')).toHaveLength(3);
    });

    it('a capped engagement is NOT queued: it leaves no row to be paid later', async () => {
      const { db, rows } = build();
      await award(db, { postId: 'p1' });
      await award(db, { postId: 'p2' });
      await award(db, { postId: 'p3' });
      expect(rows.some((r) => r.refId === 'p3')).toBe(false);
    });

    it('a new London day starts a fresh cap; the day boundary is London midnight, not UTC midnight', async () => {
      const { db } = build();
      // 2026-07-10 is BST (UTC+1): 23:30 UTC on the 10th is already 00:30 on the 11th in London.
      const lateJulyUtc = new Date('2026-07-10T22:30:00.000Z'); // 23:30 London on the 10th
      const afterMidnightLondon = new Date('2026-07-10T23:30:00.000Z'); // 00:30 London on the 11th
      await award(db, { postId: 'p1', now: lateJulyUtc });
      await award(db, { postId: 'p2', now: lateJulyUtc });
      expect((await award(db, { postId: 'p3', now: lateJulyUtc })).giver).toBe('capped');
      expect((await award(db, { postId: 'p3', now: afterMidnightLondon })).giver).toBe('awarded');
    });

    it('takes a lock per (side, account, London day), in sorted order', async () => {
      const { db, locks } = build();
      await award(db);
      expect(locks).toEqual([
        'points-cap:given:giver:2026-11-10',
        'points-cap:received:author:2026-11-10',
      ]);
      expect([...locks].sort()).toEqual(locks);
    });
  });

  describe('revocation and restore', () => {
    it('an unlike revokes both rows, and a re-like restores them: the engagement earns its point ONCE', async () => {
      const { db, rows } = build();
      await award(db);
      await revokeEngagementPoints(db, { ...like, now: NOON });
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

      const later = new Date(NOON.getTime() + 3_600_000);
      expect(await award(db, { now: later })).toEqual({ giver: 'restored', receiver: 'restored' });
      expect(rows).toHaveLength(2); // no third or fourth row
      expect(rows.every((r) => r.revokedAt === null)).toBe(true);
      expect(rows.find((r) => r.userId === 'giver')!.occurredAt).toEqual(later);
      expect(rows.find((r) => r.userId === 'giver')!.quarterPoints).toBe(4);
    });

    it('revoking frees that day\'s cap ("revocation also reduces that day\'s cap counter")', async () => {
      const { db } = build();
      await award(db, { postId: 'p1' });
      await award(db, { postId: 'p2' });
      expect((await award(db, { postId: 'p3' })).giver).toBe('capped');
      await revokeEngagementPoints(db, { ...like, postId: 'p1', now: NOON });
      expect((await award(db, { postId: 'p3' })).giver).toBe('awarded');
    });

    it('a restore is itself subject to the cap', async () => {
      const { db, rows } = build();
      await award(db, { postId: 'p1' });
      await revokeEngagementPoints(db, { ...like, postId: 'p1', now: NOON });
      await award(db, { postId: 'p2' });
      await award(db, { postId: 'p3' });
      expect((await award(db, { postId: 'p1' })).giver).toBe('capped');
      expect(rows.find((r) => r.refId === 'p1' && r.userId === 'giver')!.revokedAt).not.toBeNull();
    });

    it('revoking something never earned (capped, ineligible) is a harmless no-op', async () => {
      const { db, rows } = build();
      await expect(revokeEngagementPoints(db, { ...like, now: NOON })).resolves.toBeUndefined();
      expect(rows).toHaveLength(0);
    });

    it('revoking one kind leaves the other kinds on the same post alone', async () => {
      const { db, rows } = build();
      await award(db, { kind: 'like' });
      await award(db, { kind: 'comment' });
      await revokeEngagementPoints(db, { ...like, kind: 'like', now: NOON });
      expect(rows.filter((r) => r.revokedAt === null).map((r) => r.source).sort()).toEqual([
        'engagement_comment_given',
        'engagement_comment_received',
      ]);
    });

    it('a removed post revokes every baseline row on it, by anyone, and no other post', async () => {
      const { db, rows } = build([{ id: 'giver' }, { id: 'giver-2' }, { id: 'author' }]);
      await award(db, { postId: 'p1' });
      await award(db, { postId: 'p1', giverId: 'giver-2', kind: 'comment' });
      await award(db, { postId: 'p2' });
      const n = await revokeEngagementPointsForPost(db, 'p1', NOON);
      expect(n).toBe(4);
      expect(rows.filter((r) => r.postId === 'p2').every((r) => r.revokedAt === null)).toBe(true);
    });

    it('an account later restricted loses what it earned AND what it earned others', async () => {
      const { db, rows } = build([{ id: 'giver' }, { id: 'giver-2' }, { id: 'author' }]);
      await award(db, { postId: 'p1' }); // giver -> author
      await award(db, { postId: 'p2', giverId: 'giver-2' }); // someone else -> author
      const n = await revokeEngagementPointsForAccount(db, 'giver', NOON);
      expect(n).toBe(2); // giver's own row, and the author's received row that giver earned
      const live = rows.filter((r) => r.revokedAt === null);
      expect(live.map((r) => `${r.userId}:${r.refId}`).sort()).toEqual(['author:p2:giver-2', 'giver-2:p2']);
    });

    it('placement prizes are never touched by a revocation', async () => {
      const { db, rows } = build();
      rows.push({
        id: 'prize',
        userId: 'giver',
        source: 'contest_weekly_win',
        refId: 'round-1',
        quarterPoints: 2000,
        postId: null,
        counterpartId: null,
        revokedAt: null,
        clubId: null,
        occurredAt: NOON,
      });
      await revokeEngagementPointsForAccount(db, 'giver', NOON);
      expect(rows.find((r) => r.id === 'prize')!.revokedAt).toBeNull();
    });
  });
});

describe('londonDayBounds', () => {
  it('is a 24-hour day in winter and starts at UTC midnight', () => {
    const d = londonDayBounds(new Date('2026-11-10T12:00:00Z'));
    expect(d.key).toBe('2026-11-10');
    expect(d.start.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(d.end.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('starts an hour before UTC midnight in summer (BST)', () => {
    const d = londonDayBounds(new Date('2026-07-10T12:00:00Z'));
    expect(d.start.toISOString()).toBe('2026-07-09T23:00:00.000Z');
    expect(d.end.toISOString()).toBe('2026-07-10T23:00:00.000Z');
  });

  it('is 25 hours on the day the clocks go back and 23 when they go forward', () => {
    const back = londonDayBounds(new Date('2026-10-25T12:00:00Z')); // BST ends 2026-10-25
    expect((back.end.getTime() - back.start.getTime()) / 3_600_000).toBe(25);
    const forward = londonDayBounds(new Date('2027-03-28T12:00:00Z')); // BST starts 2027-03-28
    expect((forward.end.getTime() - forward.start.getTime()) / 3_600_000).toBe(23);
  });

  it('rolls over a month and a year end', () => {
    expect(londonDayBounds(new Date('2026-12-31T12:00:00Z')).end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(londonDayBounds(new Date('2026-02-28T12:00:00Z')).end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});
