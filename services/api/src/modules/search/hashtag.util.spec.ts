import { Prisma } from '@prisma/client';
import { extractHashtags, HASHTAG_MAX_TAG_LENGTH, recordPostHashtags } from './hashtag.util';

function txMock() {
  return {
    hashtag: { upsert: jest.fn().mockResolvedValue({ id: 'hashtag-1' }) },
    postHashtag: { create: jest.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe('extractHashtags', () => {
  it('extracts a single hashtag, lowercased', () => {
    expect(extractHashtags('Great match, #Chelsea won!')).toEqual(['chelsea']);
  });

  it('extracts multiple distinct hashtags in the order they first appear', () => {
    expect(extractHashtags('#EPL #Chelsea #epl')).toEqual(['epl', 'chelsea']);
  });

  it('de-duplicates case-insensitively — "#EPL" and "#epl" are the same tag', () => {
    expect(extractHashtags('#EPL news, more #epl talk')).toEqual(['epl']);
  });

  it('returns an empty array for text with no hashtags at all', () => {
    expect(extractHashtags('No tags in this post.')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });

  it('matches only \\w characters — a bare "#" with no following word character is not a hashtag', () => {
    expect(extractHashtags('Price is # 3, not a tag')).toEqual([]);
  });

  it('matches digits and underscores as part of a tag (\\w includes both)', () => {
    expect(extractHashtags('#world_cup_2026')).toEqual(['world_cup_2026']);
  });

  it('does not extract a non-Latin hashtag at all, and truncates an accented one at the first non-\\w character — \\w is ASCII-only (v1 simplification, disclosed)', () => {
    // "#日本" has no leading ASCII \w run at all, so it matches nothing.
    // "#café" matches only its ASCII-word-char prefix ("caf") — the
    // accented "é" simply isn't part of the match, the same truncation
    // any ASCII-only \w regex produces on accented text.
    expect(extractHashtags('#café #日本')).toEqual(['caf']);
  });

  it(`silently drops a tag longer than HASHTAG_MAX_TAG_LENGTH (${HASHTAG_MAX_TAG_LENGTH})`, () => {
    const longTag = 'a'.repeat(HASHTAG_MAX_TAG_LENGTH + 1);
    expect(extractHashtags(`#${longTag} #ok`)).toEqual(['ok']);
  });

  it(`keeps a tag exactly at HASHTAG_MAX_TAG_LENGTH (${HASHTAG_MAX_TAG_LENGTH})`, () => {
    const maxTag = 'a'.repeat(HASHTAG_MAX_TAG_LENGTH);
    expect(extractHashtags(`#${maxTag}`)).toEqual([maxTag]);
  });
});

describe('recordPostHashtags', () => {
  it('is a no-op for a post with no hashtags — no Prisma call at all', async () => {
    const tx = txMock();

    await recordPostHashtags(tx, 'post-1', 'No tags here', new Date());

    expect(tx.hashtag.upsert).not.toHaveBeenCalled();
    expect(tx.postHashtag.create).not.toHaveBeenCalled();
  });

  it('upserts the Hashtag (incrementing postCount) and creates one PostHashtag row per distinct tag, at the given occurredAt', async () => {
    const tx = txMock();
    const occurredAt = new Date('2026-08-09T10:00:00.000Z');
    (tx.hashtag.upsert as jest.Mock)
      .mockResolvedValueOnce({ id: 'hashtag-chelsea' })
      .mockResolvedValueOnce({ id: 'hashtag-epl' });

    await recordPostHashtags(tx, 'post-1', 'Big win for #Chelsea, more #epl talk', occurredAt);

    expect(tx.hashtag.upsert).toHaveBeenCalledTimes(2);
    expect(tx.hashtag.upsert).toHaveBeenNthCalledWith(1, {
      where: { tag: 'chelsea' },
      create: { tag: 'chelsea', postCount: 1 },
      update: { postCount: { increment: 1 } },
      select: { id: true },
    });
    expect(tx.hashtag.upsert).toHaveBeenNthCalledWith(2, {
      where: { tag: 'epl' },
      create: { tag: 'epl', postCount: 1 },
      update: { postCount: { increment: 1 } },
      select: { id: true },
    });

    expect(tx.postHashtag.create).toHaveBeenCalledTimes(2);
    expect(tx.postHashtag.create).toHaveBeenNthCalledWith(1, {
      data: { postId: 'post-1', hashtagId: 'hashtag-chelsea', createdAt: occurredAt },
    });
    expect(tx.postHashtag.create).toHaveBeenNthCalledWith(2, {
      data: { postId: 'post-1', hashtagId: 'hashtag-epl', createdAt: occurredAt },
    });
  });

  it('writes exactly one PostHashtag row for a tag repeated twice in the same post (dedupe, not a P2002 catch)', async () => {
    const tx = txMock();

    await recordPostHashtags(tx, 'post-1', '#epl news and more #epl talk', new Date());

    expect(tx.hashtag.upsert).toHaveBeenCalledTimes(1);
    expect(tx.postHashtag.create).toHaveBeenCalledTimes(1);
  });
});
