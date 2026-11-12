import { restoreEngagementPointsForRemoval, revokeEngagementPointsForRemoval } from './engagement-points.util';
import { BASELINE_ENGAGEMENT_SOURCES } from './points.constants';

// backend/b300-contest-entry-removal (Decision Log #488): the marker design. The real-Postgres proof is in
// test/contest-removal.e2e-spec.ts; this pins the queries.

const NOW = new Date('2026-11-12T10:00:00.000Z');

describe('revokeEngagementPointsForRemoval', () => {
  it('revokes the still-live baseline rows on the post and stamps the marker on exactly those', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const n = await revokeEngagementPointsForRemoval({ pointsLedgerEntry: { updateMany } } as never, 'post-1', NOW);
    expect(n).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', source: { in: [...BASELINE_ENGAGEMENT_SOURCES] }, revokedAt: null },
      data: { revokedAt: NOW, revokedForRemovalAt: NOW },
    });
  });

  it('never touches placement prizes (the source list is baseline only)', () => {
    expect(BASELINE_ENGAGEMENT_SOURCES).not.toContain('contest_weekly_win');
    expect(BASELINE_ENGAGEMENT_SOURCES).not.toContain('contest_monthly_crown');
  });
});

describe('restoreEngagementPointsForRemoval', () => {
  function build(rows: { id: string; userId: string; counterpartId: string | null; source: string }[], eligible: string[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const updateMany = jest.fn().mockImplementation(({ where }) => Promise.resolve({ count: where.id.in.length }));
    const userFindMany = jest.fn().mockResolvedValue(eligible.map((id) => ({ id })));
    return {
      db: { pointsLedgerEntry: { findMany, updateMany }, user: { findMany: userFindMany } } as never,
      findMany,
      updateMany,
    };
  }

  it('only looks at rows the removal itself revoked (marker set AND revoked)', async () => {
    const { db, findMany } = build([], []);
    await restoreEngagementPointsForRemoval(db, 'post-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          postId: 'post-1',
          source: { in: [...BASELINE_ENGAGEMENT_SOURCES] },
          revokedForRemovalAt: { not: null },
          revokedAt: { not: null },
        },
      }),
    );
  });

  it('clears revokedAt and the marker together, and returns how many came back', async () => {
    const rows = [
      { id: 'r1', userId: 'giver', counterpartId: null, source: 'engagement_like_given' },
      { id: 'r2', userId: 'author', counterpartId: 'giver', source: 'engagement_like_received' },
    ];
    const { db, updateMany } = build(rows, ['giver', 'author']);
    expect(await restoreEngagementPointsForRemoval(db, 'post-1')).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'r2'] }, revokedForRemovalAt: { not: null } },
      data: { revokedAt: null, revokedForRemovalAt: null },
    });
  });

  it('leaves a row revoked when its giver is no longer eligible (given and received alike)', async () => {
    const rows = [
      { id: 'r1', userId: 'giver', counterpartId: null, source: 'engagement_like_given' },
      { id: 'r2', userId: 'author', counterpartId: 'giver', source: 'engagement_like_received' },
      { id: 'r3', userId: 'other', counterpartId: null, source: 'engagement_view_given' },
    ];
    const { db, updateMany } = build(rows, ['author', 'other']); // giver became ineligible
    expect(await restoreEngagementPointsForRemoval(db, 'post-1')).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['r3'] } }) }));
  });

  it('does nothing when there is nothing to bring back', async () => {
    const { db, updateMany } = build([], []);
    expect(await restoreEngagementPointsForRemoval(db, 'post-1')).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
