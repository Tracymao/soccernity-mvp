import { ProfileImagePublishService } from './profile-image-publish.service';
import { isProfileFileProtected, profileKeysToDeleteNow } from './profile-image-evidence.util';

// backend/suspected-illegal-profile-images (B-206): the one evidence rule as applied to profile pictures and covers,
// and the publish step's private-original delete (the race with a moderator set-aside).
const NOW = new Date('2026-12-15T10:00:00Z');
const USER = 'u1';

function db(protectedIds: string[] = []) {
  return {
    suspectedIllegalMedia: {
      findMany: jest.fn(async (args: { where: { mediaId: { in: string[] } } }) =>
        args.where.mediaId.in.filter((id) => protectedIds.includes(id)).map((mediaId) => ({ mediaId })),
      ),
    },
    postMediaDeferredDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe('profileKeysToDeleteNow', () => {
  it('with no record every key is free and nothing is deferred', async () => {
    const d = db();
    const free = await profileKeysToDeleteNow(
      d as never,
      [
        { kind: 'avatar', userId: USER, key: `private-profile/${USER}/a.jpg` },
        { kind: 'cover', userId: USER, key: `profile-media/${USER}/c.jpg` },
      ],
      NOW,
    );
    expect(free).toEqual([`private-profile/${USER}/a.jpg`, `profile-media/${USER}/c.jpg`]);
    expect(d.postMediaDeferredDeletion.createMany).not.toHaveBeenCalled();
  });

  it('a protected file is held back and a deferral is written for exactly that object; the other is free', async () => {
    const d = db([`avatar:${USER}:a.jpg`]);
    const free = await profileKeysToDeleteNow(
      d as never,
      [
        { kind: 'avatar', userId: USER, key: `private-profile/${USER}/a.jpg` },
        { kind: 'cover', userId: USER, key: `profile-media/${USER}/c.jpg` },
      ],
      NOW,
    );
    expect(free).toEqual([`profile-media/${USER}/c.jpg`]);
    expect(d.postMediaDeferredDeletion.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: `private-profile/${USER}/a.jpg`, mediaId: `avatar:${USER}:a.jpg`, uploaderId: USER, postId: null }],
      skipDuplicates: true,
    });
  });

  it('the same file is protected at its private AND its public key (the id names the file)', async () => {
    const d = db([`avatar:${USER}:a.jpg`]);
    const free = await profileKeysToDeleteNow(
      d as never,
      [{ kind: 'avatar', userId: USER, key: `profile-media/${USER}/a.jpg` }],
      NOW,
    );
    expect(free).toEqual([]);
  });

  it('empty input touches no table', async () => {
    const d = db();
    expect(await profileKeysToDeleteNow(d as never, [], NOW)).toEqual([]);
    expect(d.suspectedIllegalMedia.findMany).not.toHaveBeenCalled();
  });

  it('asks about the record with the "set aside or before preserveUntil" test at the given instant', async () => {
    const d = db();
    await profileKeysToDeleteNow(d as never, [{ kind: 'cover', userId: USER, key: `private-profile/${USER}/c.jpg` }], NOW);
    expect(d.suspectedIllegalMedia.findMany).toHaveBeenCalledWith({
      where: { mediaId: { in: [`cover:${USER}:c.jpg`] }, OR: [{ status: 'set_aside' }, { preserveUntil: { gt: NOW } }] },
      select: { mediaId: true },
    });
  });

  it('a failed lookup rejects (callers fail closed)', async () => {
    const d = db();
    d.suspectedIllegalMedia.findMany.mockRejectedValue(new Error('down'));
    await expect(
      profileKeysToDeleteNow(d as never, [{ kind: 'avatar', userId: USER, key: `private-profile/${USER}/a.jpg` }], NOW),
    ).rejects.toThrow('down');
  });
});

describe('isProfileFileProtected', () => {
  it('true only when a record protects the file', async () => {
    const ref = { kind: 'avatar' as const, userId: USER, key: `private-profile/${USER}/a.jpg` };
    expect(await isProfileFileProtected(db([`avatar:${USER}:a.jpg`]) as never, ref, NOW)).toBe(true);
    expect(await isProfileFileProtected(db() as never, ref, NOW)).toBe(false);
  });
});

describe('ProfileImagePublishService: the private original after publishing', () => {
  const KEY = `private-profile/${USER}/a.jpg`;
  const PUBLIC = `profile-media/${USER}/a.jpg`;

  function build(opts: { liveKey?: string | null; protectedIds?: string[]; lookupFails?: boolean } = {}) {
    const d = db(opts.protectedIds);
    if (opts.lookupFails) d.suspectedIllegalMedia.findMany.mockRejectedValue(new Error('down'));
    const prisma = {
      ...d,
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          avatarKey: opts.liveKey === undefined ? PUBLIC : opts.liveKey,
          coverKey: null,
        }),
      },
    };
    const storage = {
      head: jest.fn().mockResolvedValue({ size: 10, contentType: 'image/jpeg' }),
      copyObject: jest.fn().mockResolvedValue(undefined),
      publicUrlFor: jest.fn().mockReturnValue('https://media/x.jpg'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new ProfileImagePublishService(prisma as never, storage as never), prisma, storage, d };
  }

  it('deletes the private original when nothing protects it (behaviour unchanged)', async () => {
    const h = build();
    expect(await h.service.publish({ userId: USER, kind: 'avatar', key: KEY })).toBe(true);
    expect(h.storage.delete).toHaveBeenCalledWith(KEY);
    expect(h.d.postMediaDeferredDeletion.createMany).not.toHaveBeenCalled();
  });

  it('keeps it, and defers it, when a set-aside record protects the file', async () => {
    const h = build({ protectedIds: [`avatar:${USER}:a.jpg`] });
    expect(await h.service.publish({ userId: USER, kind: 'avatar', key: KEY })).toBe(true);
    expect(h.storage.delete).not.toHaveBeenCalledWith(KEY);
    expect(h.d.postMediaDeferredDeletion.createMany).toHaveBeenCalledTimes(1);
  });

  it('keeps it when a moderator withdrew the picture back to this same private key (the row points at it again)', async () => {
    const h = build({ liveKey: KEY });
    expect(await h.service.publish({ userId: USER, kind: 'avatar', key: KEY })).toBe(true);
    expect(h.storage.delete).not.toHaveBeenCalledWith(KEY);
  });

  it('fails closed: if the protection check cannot run, the file is kept', async () => {
    const h = build({ lookupFails: true });
    expect(await h.service.publish({ userId: USER, kind: 'avatar', key: KEY })).toBe(true);
    expect(h.storage.delete).not.toHaveBeenCalledWith(KEY);
  });
});
