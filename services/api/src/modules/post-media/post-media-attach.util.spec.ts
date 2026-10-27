import { attachMediaToPost, loadAttachableMedia } from './post-media-attach.util';
import { POST_MEDIA_ALL_APPROVED, postMediaVisibleTo } from './post-media-visibility.util';

type Row = { id: string; kind: string; publicUrl: string };
const db = (rows: Row[], updated = rows.length) =>
  ({
    postMedia: {
      findMany: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: updated }),
    },
  }) as never as Parameters<typeof loadAttachableMedia>[0] & { postMedia: { findMany: jest.Mock; updateMany: jest.Mock } };

const R = (id: string, kind = 'image'): Row => ({ id, kind, publicUrl: `https://cdn.test/${id}` });

describe('loadAttachableMedia', () => {
  it('returns no media for no ids without touching the database', async () => {
    const d = db([]);
    expect(await loadAttachableMedia(d, 'u1', [])).toEqual([]);
    expect(d.postMedia.findMany).not.toHaveBeenCalled();
  });

  it('asks only for the caller\'s, unattached, verified, not-rejected uploads', async () => {
    const d = db([R('a')]);
    await loadAttachableMedia(d, 'u1', ['a']);
    expect(d.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['a'] }, uploaderId: 'u1', postId: null, uploadState: 'ready', status: { not: 'rejected' } },
      }),
    );
  });

  it('returns the files in the order the caller listed them, not database order', async () => {
    const d = db([R('b'), R('a'), R('c')]);
    const out = await loadAttachableMedia(d, 'u1', ['a', 'b', 'c']);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('a missing, foreign, attached or rejected id (the query returns fewer rows) is the SAME 400 code and message', async () => {
    const unknown = loadAttachableMedia(db([R('a')]), 'u1', ['a', 'zzz']);
    await expect(unknown).rejects.toMatchObject({ status: 400, response: { code: 'media_not_attachable' } });
    const dupe = loadAttachableMedia(db([R('a')]), 'u1', ['a', 'a']);
    await expect(dupe).rejects.toMatchObject({ status: 400, response: { code: 'media_not_attachable' } });
    const m1 = await unknown.catch((e) => e.response.message);
    const m2 = await dupe.catch((e) => e.response.message);
    expect(m1).toBe(m2);
  });

  it('refuses more than the configured number of files', async () => {
    await expect(loadAttachableMedia(db([]), 'u1', ['a', 'b', 'c'], { maxPerPost: 2 })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses two videos in one post', async () => {
    await expect(loadAttachableMedia(db([R('a', 'video'), R('b', 'video')]), 'u1', ['a', 'b'])).rejects.toMatchObject({
      response: { code: 'too_many_videos' },
    });
    await expect(loadAttachableMedia(db([R('a', 'video'), R('b')]), 'u1', ['a', 'b'])).resolves.toHaveLength(2);
  });

  describe('singleVideoOnly (the contest final entry)', () => {
    it('needs exactly one file, and it must be a video', async () => {
      const rules = { singleVideoOnly: true };
      await expect(loadAttachableMedia(db([]), 'u1', [], rules)).rejects.toMatchObject({ response: { code: 'final_entry_needs_one_video' } });
      await expect(loadAttachableMedia(db([R('a', 'video'), R('b', 'video')]), 'u1', ['a', 'b'], rules)).rejects.toMatchObject({
        response: { code: 'final_entry_needs_one_video' },
      });
      await expect(loadAttachableMedia(db([R('a', 'image')]), 'u1', ['a'], rules)).rejects.toMatchObject({
        response: { code: 'final_entry_needs_one_video' },
      });
      await expect(loadAttachableMedia(db([R('a', 'video')]), 'u1', ['a'], rules)).resolves.toEqual([
        { id: 'a', kind: 'video', publicUrl: 'https://cdn.test/a' },
      ]);
    });
  });
});

describe('attachMediaToPost', () => {
  it('does nothing for no media', async () => {
    const d = db([]);
    await attachMediaToPost(d, 'p1', 'u1', []);
    expect(d.postMedia.updateMany).not.toHaveBeenCalled();
  });

  it('points the files at the post with a guarded update (still the caller\'s, unattached, ready, not rejected)', async () => {
    const d = db([], 2);
    await attachMediaToPost(d, 'p1', 'u1', ['a', 'b']);
    expect(d.postMedia.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, uploaderId: 'u1', postId: null, uploadState: 'ready', status: { not: 'rejected' } },
      data: { postId: 'p1' },
    });
  });

  it('throws (so the post\'s whole transaction rolls back) when another post took a file first', async () => {
    await expect(attachMediaToPost(db([], 1), 'p1', 'u1', ['a', 'b'])).rejects.toMatchObject({
      status: 400,
      response: { code: 'media_not_attachable' },
    });
  });
});

describe('post media visibility fragment', () => {
  it('hides a post that has ANY media which is not approved', () => {
    expect(POST_MEDIA_ALL_APPROVED).toEqual({ media: { none: { status: { not: 'approved' } } } });
  });

  it('lets the author through, and anonymous callers need every file approved', () => {
    expect(postMediaVisibleTo('me')).toEqual({ OR: [{ authorId: 'me' }, POST_MEDIA_ALL_APPROVED] });
    expect(postMediaVisibleTo()).toBe(POST_MEDIA_ALL_APPROVED);
  });
});
