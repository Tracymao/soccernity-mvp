import { Logger } from '@nestjs/common';
import { collectPostMediaKeys, deletableKeys, deleteStoredObjects, deleteUserPostMedia } from './post-media-cleanup.util';

// backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2). A REJECTED file's private object
// is never deleted by a cleanup path (evidence handling is OPEN under counsel, B-206).

const row = (over: Record<string, unknown> = {}) => ({
  status: 'approved',
  publishedAt: new Date('2026-11-05T10:00:00Z') as Date | null,
  publicKey: 'post-media/u1/m1.jpg' as string | null,
  privateKey: null as string | null,
  quarantineKey: null as string | null,
  ...over,
});

describe('deletableKeys', () => {
  it('an approved, published file: only the public object', () => {
    expect(deletableKeys(row())).toEqual(['post-media/u1/m1.jpg']);
  });

  it('a pending file: its private object (and any quarantined original), no public key (nothing is there)', () => {
    expect(deletableKeys(row({ status: 'pending', publishedAt: null, privateKey: 'private-media/u1/m1.jpg', quarantineKey: 'quarantine/u1/m1' }))).toEqual([
      'private-media/u1/m1.jpg',
      'quarantine/u1/m1',
    ]);
  });

  it('a REJECTED file: its private object is NEVER listed', () => {
    expect(deletableKeys(row({ status: 'rejected', publishedAt: null, privateKey: 'private-media/u1/m1.jpg' }))).toEqual([]);
  });

  it('a rejected file that is (still) in the public prefix: the PUBLIC object is listed (it must not stay public), the private one still is not', () => {
    expect(deletableKeys(row({ status: 'rejected', privateKey: 'private-media/u1/m1.jpg' }))).toEqual(['post-media/u1/m1.jpg']);
  });

  it('a leftover quarantined original is always listed, whatever the status', () => {
    expect(deletableKeys(row({ status: 'rejected', publishedAt: null, quarantineKey: 'quarantine/u1/m1' }))).toEqual(['quarantine/u1/m1']);
  });

  it('a held (approved but reported) file moved private is deletable like a pending one', () => {
    expect(deletableKeys(row({ publishedAt: null, privateKey: 'private-media/u1/m1.jpg' }))).toEqual(['private-media/u1/m1.jpg']);
  });
});

describe('collectPostMediaKeys (post deletion)', () => {
  it('collects the deletable keys of the post\'s media and skips a rejected file\'s private object', async () => {
    const db = {
      postMedia: {
        findMany: jest.fn().mockResolvedValue([
          row(),
          row({ status: 'rejected', publishedAt: null, publicKey: 'post-media/u1/m2.jpg', privateKey: 'private-media/u1/m2.jpg' }),
          row({ status: 'pending', publishedAt: null, publicKey: 'post-media/u1/m3.jpg', privateKey: 'private-media/u1/m3.jpg' }),
        ]),
      },
    };
    const keys = await collectPostMediaKeys(db as never, 'p1');
    expect(keys).toEqual(['post-media/u1/m1.jpg', 'private-media/u1/m3.jpg']);
    expect(keys).not.toContain('private-media/u1/m2.jpg');
  });
});

describe('deleteUserPostMedia (anonymisation)', () => {
  it('deletes the rows but returns no key for a rejected file\'s private object', async () => {
    const tx = {
      postMedia: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', postId: 'p1', publicUrl: 'https://cdn/post-media/u1/a.jpg', ...row({ publicKey: 'post-media/u1/a.jpg' }) },
          { id: 'b', postId: null, publicUrl: null, ...row({ status: 'rejected', publishedAt: null, publicKey: null, privateKey: 'private-media/u1/b.jpg' }) },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const keys = await deleteUserPostMedia(tx as never, 'u1');
    expect(keys).toEqual(['post-media/u1/a.jpg']);
    expect(tx.postMedia.deleteMany).toHaveBeenCalledWith({ where: { uploaderId: 'u1' } });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // only the attached file's URL is removed from its post
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
