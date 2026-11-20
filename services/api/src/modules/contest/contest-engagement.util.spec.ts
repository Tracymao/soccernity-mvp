import { ForbiddenException } from '@nestjs/common';
import {
  assertFinalEntryUnlocked,
  CONTEST_FINAL_LOCKED_CODE,
  commentCountsForContest,
  ContestEntryContext,
  countingWindowFor,
  finalEntryRevealAt,
  groupEngagementRows,
  loadContestEntryForPost,
  recordEntryEngagement,
  recordQualifiedView,
  removeEntryEngagement,
  syncCommentEngagement,
} from './contest-engagement.util';

// backend/w7-contest (B-091). The contest's side of a like / comment: which engagement is recorded,
// where the counting window is, and the final entry's pre-reveal lock.

const weekly = (over: Partial<ContestEntryContext> = {}): ContestEntryContext => ({
  entryId: 'entry-1',
  weekNumber: 1,
  authorId: 'author-1',
  submittedAt: new Date('2026-06-02T09:00:00Z'),
  monthKey: '2026-06',
  ...over,
});
const final = (over: Partial<ContestEntryContext> = {}) =>
  weekly({ weekNumber: 4, submittedAt: new Date('2026-06-22T10:00:00Z'), ...over });

function buildDb(followRow: unknown = null) {
  return {
    contestEngagement: { createMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    follow: { findUnique: jest.fn().mockResolvedValue(followRow) },
    comment: { count: jest.fn() },
    contestEntry: { findUnique: jest.fn() },
  };
}
type Db = ReturnType<typeof buildDb>;
const asTx = (db: Db) => db as never;

describe('countingWindowFor', () => {
  // June 2026 is BST: Phase 1 of week 1 ends 00:00 on 5 June = 23:00Z on 4 June.
  it('weeks 1-3: from the entry\'s submission to the end of Phase 1', () => {
    expect(countingWindowFor(weekly())).toEqual({
      from: new Date('2026-06-02T09:00:00Z'),
      before: new Date('2026-06-04T23:00:00Z'),
    });
    expect(countingWindowFor(weekly({ weekNumber: 3 }))?.before).toEqual(new Date('2026-06-18T23:00:00Z'));
  });

  it('the final: from the reveal (00:00 day 25) to the end of the month', () => {
    expect(countingWindowFor(final())).toEqual({
      from: new Date('2026-06-24T23:00:00Z'),
      before: new Date('2026-06-30T23:00:00Z'),
    });
  });

  it('a legacy cycle (no month key) has no counting window, so nothing is ever recorded', () => {
    expect(countingWindowFor(weekly({ monthKey: null }))).toBeNull();
    expect(countingWindowFor(weekly({ monthKey: 'garbage' }))).toBeNull();
  });
});

describe('recordEntryEngagement', () => {
  const during = new Date('2026-06-03T12:00:00Z');

  it('records nothing for a post that is not a contest entry', async () => {
    const db = buildDb();
    await recordEntryEngagement(asTx(db), null, { giverId: 'u', kind: 'like', now: during });
    expect(db.contestEngagement.createMany).not.toHaveBeenCalled();
  });

  it('records a like inside the window, with the follow snapshot taken now and skipDuplicates', async () => {
    const db = buildDb({ id: 'f' });
    await recordEntryEngagement(asTx(db), weekly(), { giverId: 'u', kind: 'like', now: during });
    expect(db.follow.findUnique).toHaveBeenCalledWith({
      where: { followerId_followeeId: { followerId: 'u', followeeId: 'author-1' } },
      select: { id: true },
    });
    expect(db.contestEngagement.createMany).toHaveBeenCalledWith({
      data: [{ entryId: 'entry-1', userId: 'u', kind: 'like', followedAtEngagement: true, occurredAt: during }],
      skipDuplicates: true,
    });
  });

  it('the author\'s own engagement is recorded as a non-follower with no follow lookup (nobody follows themselves)', async () => {
    const db = buildDb({ id: 'f' });
    await recordEntryEngagement(asTx(db), weekly(), { giverId: 'author-1', kind: 'like', now: during });
    expect(db.follow.findUnique).not.toHaveBeenCalled();
    expect(db.contestEngagement.createMany.mock.calls[0][0].data[0].followedAtEngagement).toBe(false);
  });

  it('weeks 1-3: not recorded before the submission, nor at or after the end of Phase 1', async () => {
    const db = buildDb();
    const submitted = weekly().submittedAt;
    await recordEntryEngagement(asTx(db), weekly(), { giverId: 'u', kind: 'like', now: new Date(submitted.getTime() - 1) });
    await recordEntryEngagement(asTx(db), weekly(), { giverId: 'u', kind: 'like', now: new Date('2026-06-04T23:00:00.000Z') });
    expect(db.contestEngagement.createMany).not.toHaveBeenCalled();
    await recordEntryEngagement(asTx(db), weekly(), { giverId: 'u', kind: 'like', now: submitted });
    await recordEntryEngagement(asTx(db), weekly(), { giverId: 'u', kind: 'like', now: new Date('2026-06-04T22:59:59.999Z') });
    expect(db.contestEngagement.createMany).toHaveBeenCalledTimes(2);
  });

  it('the final: nothing before the reveal, recorded from 00:00 day 25, nothing from the end of the month', async () => {
    const db = buildDb();
    for (const iso of ['2026-06-24T22:59:59.999Z', '2026-06-30T23:00:00.000Z', '2026-07-02T00:00:00Z']) {
      await recordEntryEngagement(asTx(db), final(), { giverId: 'u', kind: 'like', now: new Date(iso) });
    }
    expect(db.contestEngagement.createMany).not.toHaveBeenCalled();
    await recordEntryEngagement(asTx(db), final(), { giverId: 'u', kind: 'like', now: new Date('2026-06-24T23:00:00.000Z') });
    await recordEntryEngagement(asTx(db), final(), { giverId: 'u', kind: 'comment', now: new Date('2026-06-30T22:59:59.999Z') });
    expect(db.contestEngagement.createMany).toHaveBeenCalledTimes(2);
  });
});

describe('removeEntryEngagement / syncCommentEngagement', () => {
  it('an unlike deletes that account\'s like row for the entry, and only that kind', async () => {
    const db = buildDb();
    await removeEntryEngagement(asTx(db), weekly(), { giverId: 'u', kind: 'like' });
    expect(db.contestEngagement.deleteMany).toHaveBeenCalledWith({ where: { entryId: 'entry-1', userId: 'u', kind: 'like' } });
    await removeEntryEngagement(asTx(db), null, { giverId: 'u', kind: 'like' });
    expect(db.contestEngagement.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('removing a comment keeps the account\'s one comment point while a visible comment remains', async () => {
    const db = buildDb();
    db.comment.count.mockResolvedValue(1);
    await syncCommentEngagement(asTx(db), weekly(), { postId: 'p', commentAuthorId: 'u' });
    expect(db.comment.count).toHaveBeenCalledWith({ where: { postId: 'p', authorId: 'u', hidden: false } });
    expect(db.contestEngagement.deleteMany).not.toHaveBeenCalled();
  });

  it('removing the last visible comment removes the point', async () => {
    const db = buildDb();
    db.comment.count.mockResolvedValue(0);
    await syncCommentEngagement(asTx(db), weekly(), { postId: 'p', commentAuthorId: 'u' });
    expect(db.contestEngagement.deleteMany).toHaveBeenCalledWith({ where: { entryId: 'entry-1', userId: 'u', kind: 'comment' } });
  });

  it('is a no-op for a post that is not an entry', async () => {
    const db = buildDb();
    await syncCommentEngagement(asTx(db), null, { postId: 'p', commentAuthorId: 'u' });
    expect(db.comment.count).not.toHaveBeenCalled();
  });
});

describe('the final entry is locked until the reveal', () => {
  it('refuses engagement before the reveal with a coded 403 (even the author\'s)', () => {
    const before = new Date('2026-06-24T22:59:59.999Z');
    try {
      assertFinalEntryUnlocked(final(), before);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({ code: CONTEST_FINAL_LOCKED_CODE });
    }
  });

  it('allows it from 00:00 on day 25, and always for a weekly entry or a non-entry', () => {
    expect(() => assertFinalEntryUnlocked(final(), new Date('2026-06-24T23:00:00.000Z'))).not.toThrow();
    expect(() => assertFinalEntryUnlocked(weekly(), new Date('2026-06-01T00:00:00Z'))).not.toThrow();
    expect(() => assertFinalEntryUnlocked(null, new Date('2026-06-01T00:00:00Z'))).not.toThrow();
  });

  it('finalEntryRevealAt is the reveal for a final entry and null otherwise', () => {
    expect(finalEntryRevealAt(final())).toEqual(new Date('2026-06-24T23:00:00Z'));
    expect(finalEntryRevealAt(weekly())).toBeNull();
    expect(finalEntryRevealAt(null)).toBeNull();
    expect(finalEntryRevealAt(final({ monthKey: null }))).toBeNull();
  });

  it('the reveal is the BST midnight in October (the clocks go back the next day)', () => {
    expect(finalEntryRevealAt(final({ monthKey: '2026-10' }))).toEqual(new Date('2026-10-24T23:00:00Z'));
  });
});

describe('recordQualifiedView (the seam for B-093\'s heartbeats)', () => {
  it('records a view on a weekly entry, never on a final (views are not counted in the final)', async () => {
    const db = buildDb();
    const now = new Date('2026-06-03T12:00:00Z');
    await recordQualifiedView(asTx(db), weekly(), { viewerId: 'v', now });
    expect(db.contestEngagement.createMany.mock.calls[0][0].data[0]).toMatchObject({ kind: 'view', userId: 'v' });
    await recordQualifiedView(asTx(db), final(), { viewerId: 'v', now: new Date('2026-06-26T12:00:00Z') });
    await recordQualifiedView(asTx(db), null, { viewerId: 'v', now });
    expect(db.contestEngagement.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('loadContestEntryForPost / helpers', () => {
  it('maps the entry, its week and its cycle\'s month key; null when the post is not an entry', async () => {
    const db = buildDb();
    db.contestEntry.findUnique.mockResolvedValueOnce({
      id: 'e',
      userId: 'a',
      submittedAt: new Date('2026-06-02T09:00:00Z'),
      round: { weekNumber: 2 },
      cycle: { monthKey: '2026-06' },
    });
    expect(await loadContestEntryForPost(asTx(db), 'p')).toEqual({
      entryId: 'e',
      weekNumber: 2,
      authorId: 'a',
      submittedAt: new Date('2026-06-02T09:00:00Z'),
      monthKey: '2026-06',
    });
    expect(db.contestEntry.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { postId: 'p' } }));
    db.contestEntry.findUnique.mockResolvedValueOnce(null);
    expect(await loadContestEntryForPost(asTx(db), 'q')).toBeNull();
  });

  it('comment screening is a seam that always passes today (no comment screening exists)', () => {
    expect(commentCountsForContest('anything')).toBe(true);
  });

  it('groups engagement rows into per-entry event lists', () => {
    const t = new Date('2026-06-03T12:00:00Z');
    const grouped = groupEngagementRows([
      { entryId: 'a', userId: 'u1', kind: 'like', followedAtEngagement: false, occurredAt: t },
      { entryId: 'a', userId: 'u2', kind: 'comment', followedAtEngagement: true, occurredAt: t },
      { entryId: 'b', userId: 'u1', kind: 'view', followedAtEngagement: false, occurredAt: t },
    ]);
    expect(grouped.get('a')).toHaveLength(2);
    expect(grouped.get('b')).toEqual([{ userId: 'u1', kind: 'view', followedAtEngagement: false, occurredAt: t }]);
  });
});
