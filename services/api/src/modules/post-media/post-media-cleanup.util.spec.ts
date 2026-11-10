import { Logger } from '@nestjs/common';
import {
  collectPostMediaKeys,
  deletableKeys,
  deleteStoredObjects,
  deleteUserPostMedia,
  evidenceKeyOf,
  keysToDeleteNow,
} from './post-media-cleanup.util';

// backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464). A REJECTED file's private object is
// now deleted on every path that removes its row, EXCEPT when the uploader is under an active admin hold or the
// post has a report that is not yet closed: then it is kept and a deferral record is written. (This replaces the
// B-257 / #430 item 2 rule that it was never deleted.)

const NOW = new Date('2026-11-05T10:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  uploaderId: 'u1',
  postId: 'p1' as string | null,
  status: 'approved',
  publishedAt: new Date('2026-11-05T10:00:00Z') as Date | null,
  publicKey: 'post-media/u1/m1.jpg' as string | null,
  privateKey: null as string | null,
  quarantineKey: null as string | null,
  ...over,
});

const rejected = (over: Record<string, unknown> = {}) =>
  row({ id: 'r1', status: 'rejected', publishedAt: null, publicKey: 'post-media/u1/r1.jpg', privateKey: 'private-media/u1/r1.jpg', ...over });

interface DbOpts {
  media?: unknown[];
  held?: boolean;
  reports?: Record<string, unknown>[];
}

function buildDb(opts: DbOpts = {}) {
  return {
    postMedia: { findMany: jest.fn().mockResolvedValue(opts.media ?? []), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    accountHold: {
      findMany: jest
        .fn()
        .mockResolvedValue(opts.held ? [{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }] : []),
    },
    report: { findMany: jest.fn().mockResolvedValue(opts.reports ?? []) },
    postMediaDeferredDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

const OPEN_REPORT = { targetId: 'p1', status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null };

describe('deletableKeys (the keys that need no protection check)', () => {
  it('an approved, published file: only the public object', () => {
    expect(deletableKeys(row())).toEqual(['post-media/u1/m1.jpg']);
  });

  it('a pending file: its private object (and any quarantined original), no public key (nothing is there)', () => {
    expect(deletableKeys(row({ status: 'pending', publishedAt: null, privateKey: 'private-media/u1/m1.jpg', quarantineKey: 'quarantine/u1/m1' }))).toEqual([
      'private-media/u1/m1.jpg',
      'quarantine/u1/m1',
    ]);
  });

  it('a REJECTED file: its private object is not in this list (it goes through the protection check instead)', () => {
    expect(deletableKeys(rejected())).toEqual([]);
  });

  it('a rejected file that is (still) in the public prefix: the PUBLIC object is listed (it must not stay public)', () => {
    expect(deletableKeys(rejected({ publishedAt: new Date('2026-11-05T10:00:00Z') }))).toEqual(['post-media/u1/r1.jpg']);
  });

  it('a leftover quarantined original is always listed, whatever the status', () => {
    expect(deletableKeys(rejected({ quarantineKey: 'quarantine/u1/r1' }))).toEqual(['quarantine/u1/r1']);
  });

  it('a held (approved but reported) file moved private is deletable like a pending one', () => {
    expect(deletableKeys(row({ publishedAt: null, privateKey: 'private-media/u1/m1.jpg' }))).toEqual(['private-media/u1/m1.jpg']);
  });
});

describe('evidenceKeyOf', () => {
  it('is the private object of a REJECTED file, and null otherwise', () => {
    expect(evidenceKeyOf(rejected())).toBe('private-media/u1/r1.jpg');
    expect(evidenceKeyOf(rejected({ privateKey: null }))).toBeNull();
    expect(evidenceKeyOf(row({ status: 'pending', privateKey: 'private-media/u1/m1.jpg' }))).toBeNull();
    expect(evidenceKeyOf(row({ status: 'approved', privateKey: 'private-media/u1/m1.jpg' }))).toBeNull();
  });
});

// backend/b290-removed-post-media (B-290; Decision Log #484): the private copy kept of a removed post's media is
// evidence until the removing report closes, so deleting the post (or the account) must not delete it with the row.
describe('a file whose post was removed by moderation (B-290)', () => {
  const removedPost = { removedByModerationAt: new Date('2026-11-04T10:00:00Z') };
  const kept = (over: Record<string, unknown> = {}) =>
    row({ status: 'approved', publishedAt: null, privateKey: 'private-media/u1/m1.jpg', post: removedPost, ...over });

  it('its private copy is the evidence key, and is not in the list that needs no protection check', () => {
    expect(evidenceKeyOf(kept())).toBe('private-media/u1/m1.jpg');
    expect(deletableKeys(kept())).toEqual([]);
  });

  it('the same file on a post that is NOT removed is an ordinary deletable file', () => {
    const ordinary = kept({ post: { removedByModerationAt: null } });
    expect(evidenceKeyOf(ordinary)).toBeNull();
    expect(deletableKeys(ordinary)).toEqual(['private-media/u1/m1.jpg']);
  });

  it('a leftover public object is still listed: it must not stay public', () => {
    expect(deletableKeys(kept({ publishedAt: new Date('2026-11-05T10:00:00Z') }))).toEqual(['post-media/u1/m1.jpg']);
  });

  it('while the removing report is open the copy is kept and deferred; once it is long closed it goes', async () => {
    const db = buildDb({ reports: [OPEN_REPORT] });
    expect(await keysToDeleteNow(db as never, [kept()], NOW)).toEqual([]);
    expect(db.postMediaDeferredDeletion.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: 'private-media/u1/m1.jpg', mediaId: 'm1', uploaderId: 'u1', postId: 'p1' }],
      skipDuplicates: true,
    });
    const closed = { ...OPEN_REPORT, status: 'reviewed', reviewedAt: new Date('2026-01-01T00:00:00Z') };
    expect(await keysToDeleteNow(buildDb({ reports: [closed] }) as never, [kept()], NOW)).toEqual(['private-media/u1/m1.jpg']);
  });
});

describe('keysToDeleteNow', () => {
  it('a rejected file with no hold and no report: its private object IS listed, and nothing is deferred', async () => {
    const db = buildDb();
    const keys = await keysToDeleteNow(db as never, [rejected()], NOW);
    expect(keys).toEqual(['private-media/u1/r1.jpg']);
    expect(db.postMediaDeferredDeletion.createMany).not.toHaveBeenCalled();
  });

  it('the uploader under an active hold: the rejected object is NOT listed, and a deferral record is written', async () => {
    const db = buildDb({ held: true });
    const keys = await keysToDeleteNow(db as never, [rejected(), row({ id: 'p', status: 'pending', publishedAt: null, publicKey: null, privateKey: 'private-media/u1/p.jpg' })], NOW);
    expect(keys).toEqual(['private-media/u1/p.jpg']); // the pending file is not evidence; it still goes
    expect(db.postMediaDeferredDeletion.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: 'private-media/u1/r1.jpg', mediaId: 'r1', uploaderId: 'u1', postId: 'p1' }],
      skipDuplicates: true,
    });
  });

  it('the post has an OPEN report: the rejected object is kept and deferred', async () => {
    const db = buildDb({ reports: [OPEN_REPORT] });
    expect(await keysToDeleteNow(db as never, [rejected()], NOW)).toEqual([]);
    expect(db.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetType: 'post', targetId: { in: ['p1'] } } }));
    expect(db.postMediaDeferredDeletion.createMany).toHaveBeenCalledTimes(1);
  });

  it('a report with an appeal pending, or one actioned inside its appeal window, still protects; a long-closed report does not', async () => {
    const appealPending = { ...OPEN_REPORT, status: 'actioned', appealStatus: 'pending', reviewedAt: new Date('2026-01-01T00:00:00Z') };
    const inWindow = { ...OPEN_REPORT, status: 'actioned', appealStatus: null, reviewedAt: new Date('2026-11-01T00:00:00Z') };
    const closed = { ...OPEN_REPORT, status: 'reviewed', reviewedAt: new Date('2026-01-01T00:00:00Z') };
    expect(await keysToDeleteNow(buildDb({ reports: [appealPending] }) as never, [rejected()], NOW)).toEqual([]);
    expect(await keysToDeleteNow(buildDb({ reports: [inWindow] }) as never, [rejected()], NOW)).toEqual([]);
    expect(await keysToDeleteNow(buildDb({ reports: [closed] }) as never, [rejected()], NOW)).toEqual(['private-media/u1/r1.jpg']);
  });

  it('a report on a DIFFERENT post does not protect this one', async () => {
    const db = buildDb({ reports: [{ ...OPEN_REPORT, targetId: 'other' }] });
    expect(await keysToDeleteNow(db as never, [rejected()], NOW)).toEqual(['private-media/u1/r1.jpg']);
  });

  it('an unattached rejected file (no post): only the hold rule applies, and no report lookup is made', async () => {
    const db = buildDb({ reports: [OPEN_REPORT] });
    expect(await keysToDeleteNow(db as never, [rejected({ postId: null })], NOW)).toEqual(['private-media/u1/r1.jpg']);
    expect(db.report.findMany).not.toHaveBeenCalled();
  });
});

describe('collectPostMediaKeys (post deletion)', () => {
  it("collects the post's keys, INCLUDING a rejected file's private object when nothing protects it", async () => {
    const db = buildDb({
      media: [row(), rejected({ id: 'm2', publicKey: 'post-media/u1/m2.jpg', privateKey: 'private-media/u1/m2.jpg' }), row({ id: 'm3', status: 'pending', publishedAt: null, publicKey: 'post-media/u1/m3.jpg', privateKey: 'private-media/u1/m3.jpg' })],
    });
    const keys = await collectPostMediaKeys(db as never, 'p1', NOW);
    expect(keys).toEqual(['post-media/u1/m1.jpg', 'private-media/u1/m3.jpg', 'private-media/u1/m2.jpg']);
  });

  it('with an open report on the post, the rejected object is held back (deferred) and the others still go', async () => {
    const db = buildDb({ media: [row(), rejected({ id: 'm2', privateKey: 'private-media/u1/m2.jpg' })], reports: [OPEN_REPORT] });
    const keys = await collectPostMediaKeys(db as never, 'p1', NOW);
    expect(keys).toEqual(['post-media/u1/m1.jpg']);
    expect(db.postMediaDeferredDeletion.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('deleteUserPostMedia (anonymisation)', () => {
  const tx = (opts: DbOpts) => {
    const base = buildDb({
      ...opts,
      media: [
        { ...row({ id: 'a', publicKey: 'post-media/u1/a.jpg' }), publicUrl: 'https://cdn/post-media/u1/a.jpg' },
        { ...rejected({ id: 'b', postId: null, privateKey: 'private-media/u1/b.jpg' }), publicUrl: null },
      ],
    });
    return base;
  };

  it("deletes the rows and returns the rejected file's private object too", async () => {
    const db = tx({});
    const keys = await deleteUserPostMedia(db as never, 'u1', NOW);
    expect(keys).toEqual(['post-media/u1/a.jpg', 'private-media/u1/b.jpg']);
    expect(db.postMedia.deleteMany).toHaveBeenCalledWith({ where: { uploaderId: 'u1' } });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1); // only the attached file's URL is removed from its post
  });

  it('an uploader under an active hold: the rows go, the rejected object is deferred, not returned', async () => {
    const db = tx({ held: true });
    const keys = await deleteUserPostMedia(db as never, 'u1', NOW);
    expect(keys).toEqual(['post-media/u1/a.jpg']);
    expect(db.postMediaDeferredDeletion.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: 'private-media/u1/b.jpg', mediaId: 'b', uploaderId: 'u1', postId: null }],
      skipDuplicates: true,
    });
  });
});

describe('deleteStoredObjects', () => {
  it('only ever deletes the keys it is given, and never throws on a storage failure', async () => {
    const storage = { delete: jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined) };
    const logger = { warn: jest.fn() } as unknown as Logger;
    await expect(deleteStoredObjects(storage as never, logger, ['a', 'b'], 'ctx')).resolves.toBeUndefined();
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain('a');
  });
});
