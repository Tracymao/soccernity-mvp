import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { PostMediaObjectsService, privateKeyFor, publicKeyFor, shouldBePublic } from './post-media-objects.service';

// backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2). The two prefixes and the moves
// between them, against an in-memory object store so what is (and is not) in each prefix can be asserted.

const NOW = new Date('2026-11-05T10:00:00Z');
const PRIV = 'private-media/u1/m1.jpg';
const PUB = 'post-media/u1/m1.jpg';

class FakeStore {
  objects = new Map<string, { size: number; contentType: string }>();
  failCopy = false;
  failDeleteFor = new Set<string>();
  corruptCopyTo: string | null = null;
  deleted: string[] = [];
  copied: Array<[string, string]> = [];

  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.size, contentType: o.contentType } : null;
  }
  async copyObject(src: string, dest: string, contentType: string) {
    if (this.failCopy) throw new Error('copy failed');
    const o = this.objects.get(src);
    if (!o) throw new Error('no such source');
    this.copied.push([src, dest]);
    this.objects.set(dest, { size: dest === this.corruptCopyTo ? o.size + 1 : o.size, contentType });
  }
  async delete(key: string) {
    if (this.failDeleteFor.has(key)) throw new Error(`delete of ${key} failed`);
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

interface Row {
  id: string;
  status: string;
  hiddenPendingReview: boolean;
  contentType: string | null;
  privateKey: string | null;
  publicKey: string | null;
  publishedAt: Date | null;
}

function build(row: Partial<Row> | null, store = new FakeStore()) {
  let current: Row | null = row
    ? { id: 'm1', status: 'pending', hiddenPendingReview: false, contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null, ...row }
    : null;
  const prisma = {
    postMedia: {
      findUnique: jest.fn(async () => (current ? { ...current } : null)),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!current) return { count: 0 };
        current = { ...current, ...(args.data as Partial<Row>) };
        return { count: 1 };
      }),
    },
  };
  const service = new PostMediaObjectsService(prisma as unknown as PrismaService, store as unknown as DirectUploadStorageService, { now: () => NOW });
  return { service, prisma, store, get row() { return current; } };
}

describe('key helpers', () => {
  it('the private and public keys differ only by prefix, and the private prefix does not start with the public one', () => {
    expect(privateKeyFor('u1', 'm1', 'jpg')).toBe(PRIV);
    expect(publicKeyFor('u1', 'm1', 'jpg')).toBe(PUB);
    // A path rule such as "post-media*" must not also match the private prefix.
    expect(PRIV.startsWith('post-media')).toBe(false);
    expect(PRIV.startsWith('post-media/')).toBe(false);
  });

  it('only an approved item that is not held by reports should be public', () => {
    expect(shouldBePublic({ status: 'approved', hiddenPendingReview: false })).toBe(true);
    expect(shouldBePublic({ status: 'approved', hiddenPendingReview: true })).toBe(false);
    expect(shouldBePublic({ status: 'pending', hiddenPendingReview: false })).toBe(false);
    expect(shouldBePublic({ status: 'rejected', hiddenPendingReview: false })).toBe(false);
  });
});

describe('PostMediaObjectsService.copyToPublic (PUBLISH, fails closed)', () => {
  it('copies the private object to the public key and verifies the size', async () => {
    const { service, store } = build({});
    store.objects.set(PRIV, { size: 100, contentType: 'image/jpeg' });
    await service.copyToPublic({ id: 'm1', contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null });
    expect(store.copied).toEqual([[PRIV, PUB]]);
    expect(store.objects.get(PUB)).toEqual({ size: 100, contentType: 'image/jpeg' });
    expect(store.objects.has(PRIV)).toBe(true); // the private original is NOT touched here
    expect(store.deleted).toEqual([]);
  });

  it('a copy that fails leaves NOTHING public and throws (the caller keeps the item pending)', async () => {
    const { service, store } = build({});
    store.objects.set(PRIV, { size: 100, contentType: 'image/jpeg' });
    store.failCopy = true;
    await expect(service.copyToPublic({ id: 'm1', contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null })).rejects.toThrow('copy failed');
    expect(store.objects.has(PUB)).toBe(false);
  });

  it('a copy that does not verify (size differs) is deleted again and throws', async () => {
    const { service, store } = build({});
    store.objects.set(PRIV, { size: 100, contentType: 'image/jpeg' });
    store.corruptCopyTo = PUB;
    await expect(service.copyToPublic({ id: 'm1', contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null })).rejects.toThrow(/does not match/);
    expect(store.objects.has(PUB)).toBe(false);
    expect(store.deleted).toEqual([PUB]);
  });

  it('a missing private original throws before anything is copied', async () => {
    const { service, store } = build({});
    await expect(service.copyToPublic({ id: 'm1', contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null })).rejects.toThrow(/missing/);
    expect(store.copied).toEqual([]);
  });

  it('a row with no private key (never confirmed, or already cleaned up) cannot be published', async () => {
    const { service } = build({});
    await expect(service.copyToPublic({ id: 'm1', contentType: 'image/jpeg', privateKey: null, publicKey: PUB, publishedAt: null })).rejects.toThrow(/no private file/);
  });

  it('an already published file is left alone', async () => {
    const { service, store } = build({});
    await service.copyToPublic({ id: 'm1', contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: NOW });
    expect(store.copied).toEqual([]);
  });
});

describe('PostMediaObjectsService.finishPublish', () => {
  it('deletes the private original of an approved, published item and clears the key', async () => {
    const t = build({ status: 'approved', publishedAt: NOW });
    t.store.objects.set(PRIV, { size: 1, contentType: 'image/jpeg' });
    await t.service.finishPublish('m1');
    expect(t.store.deleted).toEqual([PRIV]);
    expect(t.row?.privateKey).toBeNull();
  });

  it.each([
    ['a pending item', { status: 'pending' }],
    ['a REJECTED item (kept: evidence handling is OPEN under counsel)', { status: 'rejected', publishedAt: NOW }],
    ['an approved item held by reports', { status: 'approved', hiddenPendingReview: true, publishedAt: NOW }],
    ['an approved item that is not published yet', { status: 'approved', publishedAt: null }],
  ])('never deletes the private object of %s', async (_name, over) => {
    const t = build(over);
    t.store.objects.set(PRIV, { size: 1, contentType: 'image/jpeg' });
    await t.service.finishPublish('m1');
    expect(t.store.deleted).toEqual([]);
    expect(t.store.objects.has(PRIV)).toBe(true);
  });

  it('a failed delete is swallowed and leaves the key for the reconciler', async () => {
    const t = build({ status: 'approved', publishedAt: NOW });
    t.store.failDeleteFor.add(PRIV);
    await expect(t.service.finishPublish('m1')).resolves.toBeUndefined();
    expect(t.row?.privateKey).toBe(PRIV);
  });
});

describe('PostMediaObjectsService.discardUnrecordedCopy', () => {
  it('keeps the copy when the item turns out to be approved (it IS the live file)', async () => {
    const t = build({ status: 'approved' });
    t.store.objects.set(PUB, { size: 1, contentType: 'image/jpeg' });
    await t.service.discardUnrecordedCopy('m1', PUB);
    expect(t.store.objects.has(PUB)).toBe(true);
  });

  it.each([
    ['rejected', { status: 'rejected' }],
    ['still pending', { status: 'pending' }],
    ['gone', null],
  ])('deletes the copy when the item is %s', async (_n, row) => {
    const t = build(row);
    t.store.objects.set(PUB, { size: 1, contentType: 'image/jpeg' });
    await t.service.discardUnrecordedCopy('m1', PUB);
    expect(t.store.objects.has(PUB)).toBe(false);
  });
});

describe('PostMediaObjectsService.withdraw (public -> private)', () => {
  it('moves a REJECTED published file back: private copy verified, marker cleared, public object deleted, rejected file KEPT', async () => {
    const t = build({ status: 'rejected', publishedAt: NOW, privateKey: null });
    t.store.objects.set(PUB, { size: 50, contentType: 'image/jpeg' });
    expect(await t.service.withdraw('m1')).toBe('withdrawn');
    expect(t.store.objects.has(PUB)).toBe(false);
    expect(t.store.objects.get(PRIV)).toEqual({ size: 50, contentType: 'image/jpeg' });
    expect(t.row).toMatchObject({ privateKey: PRIV, publishedAt: null });
    expect(t.store.deleted).toEqual([PUB]); // only the PUBLIC object was ever deleted
  });

  it('moves a file held by reports back the same way', async () => {
    const t = build({ status: 'approved', hiddenPendingReview: true, publishedAt: NOW, privateKey: null });
    t.store.objects.set(PUB, { size: 7, contentType: 'image/jpeg' });
    expect(await t.service.withdraw('m1')).toBe('withdrawn');
    expect(t.store.objects.has(PRIV)).toBe(true);
    expect(t.store.objects.has(PUB)).toBe(false);
  });

  it('reuses an existing private copy instead of copying again', async () => {
    const t = build({ status: 'rejected', publishedAt: NOW, privateKey: PRIV });
    t.store.objects.set(PRIV, { size: 5, contentType: 'image/jpeg' });
    t.store.objects.set(PUB, { size: 5, contentType: 'image/jpeg' });
    await t.service.withdraw('m1');
    expect(t.store.copied).toEqual([]);
    expect(t.store.objects.has(PUB)).toBe(false);
  });

  it('does nothing to an approved, visible item (it should be public)', async () => {
    const t = build({ status: 'approved', publishedAt: NOW });
    t.store.objects.set(PUB, { size: 1, contentType: 'image/jpeg' });
    expect(await t.service.withdraw('m1')).toBe('noop');
    expect(t.store.objects.has(PUB)).toBe(true);
    expect(t.store.deleted).toEqual([]);
  });

  it('does nothing to an item that is not published, or does not exist', async () => {
    expect(await build({ status: 'rejected', publishedAt: null }).service.withdraw('m1')).toBe('noop');
    expect(await build(null).service.withdraw('m1')).toBe('noop');
  });

  it('if the private copy cannot be made it changes nothing and reports failed (the DB gate already hides the item)', async () => {
    const t = build({ status: 'rejected', publishedAt: NOW, privateKey: null });
    t.store.objects.set(PUB, { size: 5, contentType: 'image/jpeg' });
    t.store.failCopy = true;
    expect(await t.service.withdraw('m1')).toBe('failed');
    expect(t.store.objects.has(PUB)).toBe(true); // nothing is deleted before a private copy exists
    expect(t.row?.publishedAt).toEqual(NOW);
  });

  it('if the public delete fails the marker is put back so the reconciler retries', async () => {
    const t = build({ status: 'rejected', publishedAt: NOW, privateKey: null });
    t.store.objects.set(PUB, { size: 5, contentType: 'image/jpeg' });
    t.store.failDeleteFor.add(PUB);
    expect(await t.service.withdraw('m1')).toBe('failed');
    expect(t.row?.publishedAt).not.toBeNull();
    expect(t.store.objects.has(PRIV)).toBe(true); // the private copy exists either way
  });
});

describe('PostMediaObjectsService.reconcile', () => {
  it('asks for (1) published items that should not be, (2) approved unpublished items with a private file, (3) approved published items with a private original', async () => {
    const { service, prisma } = build({});
    await service.reconcile();
    const wheres = prisma.postMedia.findMany.mock.calls.map((c) => (c[0] as { where: unknown }).where);
    expect(wheres[0]).toEqual({ publishedAt: { not: null }, OR: [{ status: { not: 'approved' } }, { hiddenPendingReview: true }] });
    expect(wheres[1]).toEqual({ status: 'approved', hiddenPendingReview: false, publishedAt: null, privateKey: { not: null }, uploadState: 'ready' });
    expect(wheres[2]).toEqual({ status: 'approved', hiddenPendingReview: false, publishedAt: { not: null }, privateKey: { not: null } });
  });

  // The rule that matters most: no reconciliation query can ever select a rejected, pending or held item
  // for PRIVATE-object deletion. Only step (3) deletes a private object and it requires status 'approved'
  // and not held.
  it('only the step that deletes private originals is restricted to approved, un-held items (a rejected file can never be selected)', async () => {
    const { service, prisma } = build({});
    await service.reconcile();
    const deleting = (prisma.postMedia.findMany.mock.calls[2][0] as { where: Record<string, unknown> }).where;
    expect(deleting.status).toBe('approved');
    expect(deleting.hiddenPendingReview).toBe(false);
  });

  it('withdraws a rejected item that is still public, and reports it', async () => {
    const t = build({ status: 'rejected', publishedAt: NOW, privateKey: null });
    t.store.objects.set(PUB, { size: 3, contentType: 'image/jpeg' });
    t.prisma.postMedia.findMany.mockResolvedValueOnce([{ id: 'm1' }]).mockResolvedValue([]);
    expect(await t.service.reconcile()).toEqual({ withdrawn: 1, published: 0, cleaned: 0 });
    expect(t.store.objects.has(PUB)).toBe(false);
    expect(t.store.objects.has(PRIV)).toBe(true);
  });

  it('heals an approved item whose public object is missing, from the retained private copy', async () => {
    const t = build({ status: 'approved', publishedAt: null, privateKey: PRIV });
    t.store.objects.set(PRIV, { size: 9, contentType: 'image/jpeg' });
    t.prisma.postMedia.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'm1', status: 'approved', hiddenPendingReview: false, contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null }])
      .mockResolvedValue([]);
    const r = await t.service.reconcile();
    expect(r.published).toBe(1);
    expect(t.store.objects.has(PUB)).toBe(true);
  });

  it('cleans the private original of an approved published item', async () => {
    const t = build({ status: 'approved', publishedAt: NOW, privateKey: PRIV });
    t.store.objects.set(PRIV, { size: 9, contentType: 'image/jpeg' });
    t.prisma.postMedia.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'm1' }]);
    expect((await t.service.reconcile()).cleaned).toBe(1);
    expect(t.store.deleted).toEqual([PRIV]);
  });

  it('a failure on one item does not stop the rest of the pass', async () => {
    const t = build({ status: 'approved', publishedAt: null, privateKey: PRIV });
    t.store.failCopy = true;
    t.store.objects.set(PRIV, { size: 9, contentType: 'image/jpeg' });
    t.prisma.postMedia.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'm1', status: 'approved', hiddenPendingReview: false, contentType: 'image/jpeg', privateKey: PRIV, publicKey: PUB, publishedAt: null }])
      .mockResolvedValue([]);
    await expect(t.service.reconcile()).resolves.toEqual({ withdrawn: 0, published: 0, cleaned: 0 });
  });
});
