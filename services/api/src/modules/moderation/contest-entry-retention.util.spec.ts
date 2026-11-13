import { Prisma } from '@prisma/client';
import { contestEntryStillCounts, ENTRY_CASCADE_TABLES } from './contest-entry-retention.util';

// B-307. The cascade list in contest-entry-retention.util.ts is a CLAIM about the schema. This spec checks the claim
// against the real Prisma data model, so a new relation to ContestEntry (or a changed onDelete) cannot slip in
// without someone analysing what the retention purge would now delete.

const models = Prisma.dmmf.datamodel.models;

describe('ContestEntry cascade list (pinned against schema.prisma)', () => {
  it('the models that reference ContestEntry are exactly ENTRY_CASCADE_TABLES', () => {
    const referencing = models
      .filter((m) => m.fields.some((f) => f.kind === 'object' && f.type === 'ContestEntry' && (f.relationFromFields?.length ?? 0) > 0))
      .map((m) => m.name)
      .sort();
    expect(referencing).toEqual([...ENTRY_CASCADE_TABLES].sort());
  });

  it('every one of them cascades when the entry is deleted', () => {
    for (const name of ENTRY_CASCADE_TABLES) {
      const model = models.find((m) => m.name === name);
      const rel = model?.fields.find((f) => f.kind === 'object' && f.type === 'ContestEntry' && (f.relationFromFields?.length ?? 0) > 0);
      expect({ model: name, onDelete: rel?.relationOnDelete }).toEqual({ model: name, onDelete: 'Cascade' });
    }
  });

  it('the entry cascades from its post, and nothing else in the schema references the entry by foreign key', () => {
    const post = models.find((m) => m.name === 'ContestEntry')?.fields.find((f) => f.name === 'post');
    expect(post?.relationOnDelete).toBe('Cascade');
    // PointsLedgerEntry / ContestVoteEvent / Notification carry plain string ids with no relation to ContestEntry:
    // they are unaffected by the purge (the ledger is an audit trail, deliberately not an FK).
    for (const name of ['PointsLedgerEntry', 'ContestVoteEvent', 'Notification', 'LeaderboardEntry', 'ContestStanding', 'ContestFinalist']) {
      const model = models.find((m) => m.name === name);
      expect({ name, hasEntryRelation: !!model?.fields.some((f) => f.type === 'ContestEntry') }).toEqual({ name, hasEntryRelation: false });
    }
  });
});

describe('contestEntryStillCounts', () => {
  const db = (rows: { status: string; winner: boolean }[]) =>
    ({
      contestEntry: {
        findMany: jest.fn(async () => rows.map((r, i) => ({ id: `e${i}`, cycle: { status: r.status }, winner: r.winner ? { id: 'w' } : null }))),
      },
    }) as never;

  it('no posts, or posts that are not contest entries: nothing counts', async () => {
    expect(await contestEntryStillCounts(db([]), [])).toBe(false);
    expect(await contestEntryStillCounts(db([]), ['p1'])).toBe(false);
  });

  it('a completed cycle and no winner row: nothing counts', async () => {
    expect(await contestEntryStillCounts(db([{ status: 'completed', winner: false }]), ['p1'])).toBe(false);
  });

  it.each(['active', 'final'])('a cycle that is %s: counts', async (status) => {
    expect(await contestEntryStillCounts(db([{ status, winner: false }]), ['p1'])).toBe(true);
  });

  it('a winner row: counts, even in a completed cycle', async () => {
    expect(await contestEntryStillCounts(db([{ status: 'completed', winner: true }]), ['p1'])).toBe(true);
  });

  it('does not query when there are no posts', async () => {
    const d = db([]);
    await contestEntryStillCounts(d, []);
    expect((d as unknown as { contestEntry: { findMany: jest.Mock } }).contestEntry.findMany).not.toHaveBeenCalled();
  });
});
