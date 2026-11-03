import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DirectUploadStorageService,
  ListedObject,
  StorageListNotPermittedError,
} from '../../storage/direct-upload-storage.service';
import { PostMediaConfig } from './post-media.config';
import { RejectedMediaSweepService, parseMediaKey } from './rejected-media-sweep.service';

// backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464). The deferred-deletion retry, the
// list-based stray sweep, and the purged-account cleanup.

const NOW = new Date('2026-11-10T04:00:00Z');
const DAY = 24 * 3600 * 1000;
const OLD = new Date(NOW.getTime() - 8 * DAY); // older than the 7-day minimum
const YOUNG = new Date(NOW.getTime() - 3 * DAY);

/** An object store held in a Map, with paging and a switch for "the key may not list". */
class FakeStore {
  readonly objects = new Map<string, Date | null>();
  listNotPermitted = false;
  unavailable = false;
  pageSize = 1000;
  failDeleteFor = new Set<string>();
  readonly listCalls: string[] = [];
  readonly deleted: string[] = [];

  add(key: string, modified: Date | null = OLD): void {
    this.objects.set(key, modified);
  }

  async listObjects(prefix: string, options: { continuationToken?: string | null } = {}) {
    this.listCalls.push(prefix);
    if (this.unavailable) throw new ServiceUnavailableException('Media storage is not configured yet');
    if (this.listNotPermitted) throw new StorageListNotPermittedError();
    // Like a real store, the continuation token is the last key of the previous page (not an index), so deleting
    // objects while paging does not skip any.
    const after = options.continuationToken ?? '';
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix) && k > after).sort();
    const slice = keys.slice(0, this.pageSize);
    const objects: ListedObject[] = slice.map((key) => ({ key, size: 1, lastModified: this.objects.get(key) ?? null }));
    return { objects, nextToken: keys.length > this.pageSize ? slice[slice.length - 1] : null };
  }

  async delete(key: string): Promise<void> {
    if (this.failDeleteFor.has(key)) throw new Error('delete failed');
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

interface Deferral {
  id: string;
  objectKey: string;
  mediaId: string;
  uploaderId: string;
  postId: string | null;
  createdAt: Date;
}

function build(env: Record<string, string> = {}) {
  const rows = new Set<string>(); // PostMedia ids that exist
  const deferrals: Deferral[] = [];
  const heldUploaders = new Set<string>();
  const reports: Record<string, unknown>[] = [];
  const prisma = {
    postMedia: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((id) => rows.has(id)).map((id) => ({ id }))),
    },
    postMediaDeferredDeletion: {
      findMany: jest.fn(async (args: { where?: { objectKey: { in: string[] } }; take?: number }) => {
        if (args.where) return deferrals.filter((d) => args.where!.objectKey.in.includes(d.objectKey)).map((d) => ({ objectKey: d.objectKey }));
        return [...deferrals].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(0, args.take);
      }),
      deleteMany: jest.fn(async ({ where }: { where: { id: string } }) => {
        const i = deferrals.findIndex((d) => d.id === where.id);
        if (i >= 0) deferrals.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      }),
    },
    accountHold: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        heldUploaders.has(where.userId) ? [{ id: 'h', type: 'legal_hold', reportId: null, expiresAt: null }] : [],
      ),
    },
    report: { findMany: jest.fn(async () => reports) },
  };
  const store = new FakeStore();
  const config = new PostMediaConfig(new ConfigService(env));
  const service = new RejectedMediaSweepService(
    prisma as unknown as PrismaService,
    config,
    store as unknown as DirectUploadStorageService,
    { now: () => NOW },
  );
  const defer = (id: string, key: string, over: Partial<Deferral> = {}) =>
    deferrals.push({ id, objectKey: key, mediaId: id, uploaderId: 'u1', postId: 'p1', createdAt: OLD, ...over });
  return { service, prisma, store, rows, deferrals, heldUploaders, reports, defer };
}

const OPEN_REPORT = { targetId: 'p1', status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null };
const CLOSED_REPORT = { targetId: 'p1', status: 'reviewed', appealStatus: null, reviewedAt: new Date('2026-01-01T00:00:00Z'), appealReviewedAt: null };

describe('parseMediaKey', () => {
  it('reads the uploader and media id from the pipeline key shapes', () => {
    expect(parseMediaKey('private-media/u1/m1.jpg')).toEqual({ uploaderId: 'u1', mediaId: 'm1' });
    expect(parseMediaKey('post-media/u1/m1.mp4')).toEqual({ uploaderId: 'u1', mediaId: 'm1' });
    expect(parseMediaKey('quarantine/u1/m1')).toEqual({ uploaderId: 'u1', mediaId: 'm1' });
  });
  it('is null for any other shape', () => {
    for (const k of ['private-media/u1', 'private-media/u1/a/b.jpg', 'private-media//m1.jpg', 'private-media/u1/', 'private-media/u1/.jpg', 'x']) {
      expect(parseMediaKey(k)).toBeNull();
    }
  });
});

describe('processDeferred', () => {
  it('deletes the object AND the record when the uploader is not held and the post has no unclosed report', async () => {
    const t = build();
    t.store.add('private-media/u1/d1.jpg');
    t.defer('d1', 'private-media/u1/d1.jpg');
    expect(await t.service.processDeferred(NOW)).toEqual({ deleted: 1, stillProtected: 0, failed: 0, capped: false });
    expect(t.store.deleted).toEqual(['private-media/u1/d1.jpg']);
    expect(t.deferrals).toHaveLength(0);
  });

  it('keeps the object and the record while the uploader is under an active hold, then deletes once the hold ends', async () => {
    const t = build();
    t.store.add('private-media/u1/d1.jpg');
    t.defer('d1', 'private-media/u1/d1.jpg');
    t.heldUploaders.add('u1');
    expect(await t.service.processDeferred(NOW)).toEqual({ deleted: 0, stillProtected: 1, failed: 0, capped: false });
    expect(t.store.deleted).toEqual([]);
    expect(t.deferrals).toHaveLength(1);

    t.heldUploaders.clear(); // the hold is lifted
    expect(await t.service.processDeferred(NOW)).toEqual({ deleted: 1, stillProtected: 0, failed: 0, capped: false });
    expect(t.store.deleted).toEqual(['private-media/u1/d1.jpg']);
    expect(t.deferrals).toHaveLength(0);
  });

  it('keeps the object while the post has an open report, and deletes once the report is long closed', async () => {
    const t = build();
    t.store.add('private-media/u1/d1.jpg');
    t.defer('d1', 'private-media/u1/d1.jpg');
    t.reports.push(OPEN_REPORT);
    expect((await t.service.processDeferred(NOW)).stillProtected).toBe(1);
    expect(t.store.deleted).toEqual([]);

    t.reports.length = 0;
    t.reports.push(CLOSED_REPORT);
    expect((await t.service.processDeferred(NOW)).deleted).toBe(1);
  });

  it('a record with no post (an unattached file) is only checked against the hold', async () => {
    const t = build();
    t.defer('d1', 'private-media/u1/d1.jpg', { postId: null });
    t.reports.push(OPEN_REPORT);
    expect((await t.service.processDeferred(NOW)).deleted).toBe(1);
  });

  it('a failed storage delete keeps the record so the next run retries; deleting an already-missing object is a success', async () => {
    const t = build();
    t.defer('d1', 'private-media/u1/d1.jpg');
    t.store.failDeleteFor.add('private-media/u1/d1.jpg');
    expect(await t.service.processDeferred(NOW)).toEqual({ deleted: 0, stillProtected: 0, failed: 1, capped: false });
    expect(t.deferrals).toHaveLength(1);

    t.store.failDeleteFor.clear(); // and the object is not even there any more
    expect((await t.service.processDeferred(NOW)).deleted).toBe(1);
    expect(t.deferrals).toHaveLength(0);
  });

  it('is idempotent: a second run with nothing recorded does nothing', async () => {
    const t = build();
    t.defer('d1', 'private-media/u1/d1.jpg');
    await t.service.processDeferred(NOW);
    expect(await t.service.processDeferred(NOW)).toEqual({ deleted: 0, stillProtected: 0, failed: 0, capped: false });
  });

  it('works at most POST_MEDIA_STRAY_SWEEP_MAX_DELETES records per run and says it was capped', async () => {
    const t = build({ POST_MEDIA_STRAY_SWEEP_MAX_DELETES: '2' });
    for (const n of ['a', 'b', 'c']) t.defer(n, `private-media/u1/${n}.jpg`);
    const r = await t.service.processDeferred(NOW);
    expect(r.deleted).toBe(2);
    expect(r.capped).toBe(true);
    expect(t.deferrals).toHaveLength(1);
  });
});

describe('sweepStrays', () => {
  it('deletes an OLD object that has no database row', async () => {
    const t = build();
    t.store.add('private-media/u1/stray.jpg', OLD);
    const r = await t.service.sweepStrays(NOW);
    expect(r).toMatchObject({ outcome: 'ok', deleted: 1, scanned: 1, wouldDelete: 0, dryRun: false });
    expect(t.store.deleted).toEqual(['private-media/u1/stray.jpg']);
  });

  it('a YOUNG stray is not touched, and is deleted only once it is older than the minimum age', async () => {
    const t = build();
    t.store.add('private-media/u1/stray.jpg', YOUNG);
    const first = await t.service.sweepStrays(NOW);
    expect(first).toMatchObject({ deleted: 0, skippedTooYoung: 1 });
    expect(t.store.objects.has('private-media/u1/stray.jpg')).toBe(true);

    const later = new Date(NOW.getTime() + 5 * DAY); // now 8 days old
    const second = await t.service.sweepStrays(later);
    expect(second.deleted).toBe(1);
    expect(t.store.objects.has('private-media/u1/stray.jpg')).toBe(false);
  });

  it('the minimum age is exactly the configured number of days (POST_MEDIA_STRAY_MIN_AGE_DAYS), default 7', async () => {
    const edge = build();
    edge.store.add('private-media/u1/a.jpg', new Date(NOW.getTime() - 7 * DAY)); // exactly 7 days: old enough
    edge.store.add('private-media/u1/b.jpg', new Date(NOW.getTime() - 7 * DAY + 1)); // a millisecond short
    const r = await edge.service.sweepStrays(NOW);
    expect(r.deleted).toBe(1);
    expect(edge.store.deleted).toEqual(['private-media/u1/a.jpg']);

    const two = build({ POST_MEDIA_STRAY_MIN_AGE_DAYS: '2' });
    two.store.add('private-media/u1/a.jpg', new Date(NOW.getTime() - 3 * DAY));
    expect((await two.service.sweepStrays(NOW)).deleted).toBe(1);
  });

  it('an object with no last-modified time is treated as young (never deleted on a guess)', async () => {
    const t = build();
    t.store.add('private-media/u1/stray.jpg', null);
    expect(await t.service.sweepStrays(NOW)).toMatchObject({ deleted: 0, skippedTooYoung: 1 });
  });

  it('an object that HAS a PostMedia row is never touched, whatever its age or the row status', async () => {
    const t = build();
    t.store.add('private-media/u1/withrow.jpg', OLD);
    t.store.add('post-media/u1/withrow2.jpg', OLD);
    t.rows.add('withrow');
    t.rows.add('withrow2');
    const r = await t.service.sweepStrays(NOW);
    expect(r).toMatchObject({ deleted: 0, skippedHasRow: 2 });
    expect(t.store.deleted).toEqual([]);
  });

  it('an object with a deferral record is left to the deferred-deletion step', async () => {
    const t = build();
    t.store.add('private-media/u1/d1.jpg', OLD);
    t.defer('d1', 'private-media/u1/d1.jpg');
    expect(await t.service.sweepStrays(NOW)).toMatchObject({ deleted: 0, skippedDeferred: 1 });
  });

  it("an object whose uploader is under an active hold is never deleted (the key names the uploader)", async () => {
    const t = build();
    t.heldUploaders.add('u1');
    t.store.add('private-media/u1/stray.jpg', OLD);
    t.store.add('private-media/u2/stray.jpg', OLD);
    const r = await t.service.sweepStrays(NOW);
    expect(r).toMatchObject({ deleted: 1, skippedUploaderHeld: 1 });
    expect(t.store.deleted).toEqual(['private-media/u2/stray.jpg']);
  });

  it('an unrecognised key shape is counted, never deleted', async () => {
    const t = build();
    t.store.add('private-media/oddfile.txt', OLD);
    t.store.add('private-media/u1/a/b.jpg', OLD);
    expect(await t.service.sweepStrays(NOW)).toMatchObject({ deleted: 0, unrecognised: 2 });
  });

  it('scans the private, public and quarantine prefixes, and only those', async () => {
    const t = build();
    t.store.add('avatars/u1/x.jpg', OLD);
    t.store.add('quarantine/u1/q1', OLD);
    t.store.add('post-media/u1/p1.jpg', OLD);
    t.store.add('private-media/u1/r1.jpg', OLD);
    const r = await t.service.sweepStrays(NOW);
    expect(t.store.listCalls).toEqual(['private-media/', 'post-media/', 'quarantine/']);
    expect(r.deleted).toBe(3);
    expect(t.store.objects.has('avatars/u1/x.jpg')).toBe(true);
  });

  it('follows the pagination across pages', async () => {
    const t = build();
    t.store.pageSize = 2;
    for (let i = 0; i < 5; i += 1) t.store.add(`private-media/u1/s${i}.jpg`, OLD);
    const r = await t.service.sweepStrays(NOW);
    expect(r.scanned).toBe(5);
    expect(r.deleted).toBe(5);
  });

  it('a missing LIST permission is reported plainly: nothing deleted, nothing thrown', async () => {
    const t = build();
    t.store.add('private-media/u1/stray.jpg', OLD);
    t.store.listNotPermitted = true;
    const r = await t.service.sweepStrays(NOW);
    expect(r.outcome).toBe('list_not_permitted');
    expect(r.deleted).toBe(0);
    expect(t.store.deleted).toEqual([]);
  });

  it('no object store configured: a clear outcome, nothing thrown', async () => {
    const t = build();
    t.store.unavailable = true;
    expect((await t.service.sweepStrays(NOW)).outcome).toBe('storage_unavailable');
  });

  it('DRY RUN counts what it would delete and deletes nothing', async () => {
    const t = build({ POST_MEDIA_STRAY_SWEEP_DRY_RUN: 'true' });
    t.store.add('private-media/u1/a.jpg', OLD);
    t.store.add('private-media/u1/b.jpg', OLD);
    const r = await t.service.sweepStrays(NOW);
    expect(r).toMatchObject({ dryRun: true, deleted: 0, wouldDelete: 2 });
    expect(t.store.deleted).toEqual([]);
    expect(t.store.objects.size).toBe(2);
  });

  it('stops at the per-run delete cap and says so; the rest wait for the next run', async () => {
    const t = build({ POST_MEDIA_STRAY_SWEEP_MAX_DELETES: '2' });
    for (let i = 0; i < 5; i += 1) t.store.add(`private-media/u1/s${i}.jpg`, OLD);
    const r = await t.service.sweepStrays(NOW);
    expect(r).toMatchObject({ deleted: 2, capped: true });
    expect(t.store.objects.size).toBe(3);
  });

  it('a failed delete is counted and the rest of the page still goes; the stray stays for the next run', async () => {
    const t = build();
    t.store.add('private-media/u1/a.jpg', OLD);
    t.store.add('private-media/u1/b.jpg', OLD);
    t.store.failDeleteFor.add('private-media/u1/a.jpg');
    const r = await t.service.sweepStrays(NOW);
    expect(r).toMatchObject({ deleted: 1, failed: 1 });
    expect(t.store.objects.has('private-media/u1/a.jpg')).toBe(true);
  });

  it('is idempotent: running it again after it has cleared everything deletes nothing', async () => {
    const t = build();
    t.store.add('private-media/u1/a.jpg', OLD);
    t.store.add('post-media/u1/b.jpg', OLD);
    expect((await t.service.sweepStrays(NOW)).deleted).toBe(2);
    expect(await t.service.sweepStrays(NOW)).toMatchObject({ deleted: 0, scanned: 0 });
  });
});

describe('deleteUploaderObjects (account purge)', () => {
  it("removes whatever is left under the purged user's prefixes, and nothing under another user's", async () => {
    const t = build();
    t.store.add('private-media/u1/a.jpg', YOUNG); // no age limit: the account is gone
    t.store.add('post-media/u1/b.jpg', YOUNG);
    t.store.add('quarantine/u1/c', YOUNG);
    t.store.add('private-media/u2/other.jpg', OLD);
    const r = await t.service.deleteUploaderObjects('u1');
    expect(r).toEqual({ outcome: 'ok', deleted: 3, failed: 0 });
    expect(t.store.objects.has('private-media/u2/other.jpg')).toBe(true);
  });

  it('skips an object that still has a row, or a deferral record (a protected one)', async () => {
    const t = build();
    t.store.add('private-media/u1/hasrow.jpg');
    t.store.add('private-media/u1/d1.jpg');
    t.store.add('private-media/u1/free.jpg');
    t.rows.add('hasrow');
    t.defer('d1', 'private-media/u1/d1.jpg');
    const r = await t.service.deleteUploaderObjects('u1');
    expect(r.deleted).toBe(1);
    expect(t.store.deleted).toEqual(['private-media/u1/free.jpg']);
  });

  it('a missing LIST permission is reported, never thrown', async () => {
    const t = build();
    t.store.listNotPermitted = true;
    await expect(t.service.deleteUploaderObjects('u1')).resolves.toEqual({ outcome: 'list_not_permitted', deleted: 0, failed: 0 });
  });
});

describe('runDaily', () => {
  it('runs both phases and never throws, even when the store refuses the list', async () => {
    const t = build();
    t.defer('d1', 'private-media/u1/d1.jpg');
    t.store.listNotPermitted = true;
    await expect(t.service.runDaily()).resolves.toBeUndefined();
    expect(t.deferrals).toHaveLength(0); // the deferred step still ran
  });
});
