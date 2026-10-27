import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import * as engine from '../points/engagement-points.util';
import * as contestUtil from '../contest/contest-engagement.util';
import { MAX_BEATS_PER_MINUTE, ViewQualificationService } from './view-qualification.service';

// backend/w12-points (B-093): the heartbeat flow with a fake Redis, a fake clock and mocked Prisma. Whether
// Redis, Postgres and the engine agree end to end is test/points-engine.e2e-spec.ts.

jest.mock('../points/engagement-points.util', () => ({
  awardEngagementPoints: jest.fn().mockResolvedValue({ giver: 'awarded', receiver: 'awarded' }),
}));
jest.mock('../contest/contest-engagement.util', () => ({
  ...jest.requireActual('../contest/contest-engagement.util'),
  loadContestEntryForPost: jest.fn().mockResolvedValue(null),
  recordQualifiedView: jest.fn().mockResolvedValue(undefined),
}));

class FakeRedis {
  store = new Map<string, string>();
  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    if (args.includes('NX') && this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK';
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }
  async incr(key: string) {
    const n = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(n));
    return n;
  }
  async expire() {
    return 1;
  }
}

const SESSION = '22222222-2222-4222-8222-222222222222';
const CAPS = { givenQuarters: 160, receivedQuarters: 80 };

function setup(
  post: { authorId?: string; mediaUrls?: string[] } | null = { authorId: 'author', mediaUrls: [] },
  startIso = '2026-11-10T12:00:00.000Z',
) {
  let nowMs = Date.parse(startIso);
  const clock = { now: () => new Date(nowMs) };
  const redis = new FakeRedis();
  const tx = {};
  const prisma = {
    post: {
      findUnique: jest.fn().mockResolvedValue(post ? { id: 'post-1', authorId: 'author', mediaUrls: [], ...post } : null),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const service = new ViewQualificationService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    clock,
    { caps: CAPS } as never,
  );
  return {
    service,
    redis,
    prisma,
    tx,
    advance: (seconds: number) => {
      nowMs += seconds * 1000;
    },
  };
}

const beat = (over: Record<string, unknown> = {}) => ({ sessionId: SESSION, active: true, ...over });
const award = engine.awardEngagementPoints as jest.Mock;
const recordView = contestUtil.recordQualifiedView as jest.Mock;
const loadEntry = contestUtil.loadContestEntryForPost as jest.Mock;

beforeEach(() => {
  award.mockClear();
  recordView.mockClear();
  loadEntry.mockReset().mockResolvedValue(null);
});

describe('ViewQualificationService (B-093, spec 9c)', () => {
  it('a photo qualifies after 3 server-measured seconds and awards the baseline point once', async () => {
    const { service, advance } = setup();
    expect(await service.heartbeat('viewer', 'post-1', beat())).toEqual({ done: false });
    advance(1.5);
    expect(await service.heartbeat('viewer', 'post-1', beat())).toEqual({ done: false });
    expect(award).not.toHaveBeenCalled();
    advance(1.5);
    expect(await service.heartbeat('viewer', 'post-1', beat())).toEqual({ done: true });
    expect(award).toHaveBeenCalledTimes(1);
    expect(award).toHaveBeenCalledWith(expect.anything(), {
      kind: 'view',
      postId: 'post-1',
      postAuthorId: 'author',
      giverId: 'viewer',
      now: new Date('2026-11-10T12:00:03.000Z'),
      caps: CAPS,
    });
  });

  it('keeps the clock itself: ten beats in one instant earn nothing, whatever the client says', async () => {
    const { service } = setup();
    for (let i = 0; i < 10; i++) await service.heartbeat('viewer', 'post-1', beat());
    expect(award).not.toHaveBeenCalled();
  });

  it('fires the outcome ONCE per session: further beats after qualifying do not award again', async () => {
    const { service, advance } = setup();
    await service.heartbeat('viewer', 'post-1', beat());
    advance(3);
    await service.heartbeat('viewer', 'post-1', beat());
    advance(3);
    await service.heartbeat('viewer', 'post-1', beat());
    expect(award).toHaveBeenCalledTimes(1);
  });

  it('a different session of the same viewer starts again from zero', async () => {
    const { service, advance } = setup();
    await service.heartbeat('viewer', 'post-1', beat());
    advance(3);
    await service.heartbeat('viewer', 'post-1', beat());
    expect(award).toHaveBeenCalledTimes(1);
    await service.heartbeat('viewer', 'post-1', beat({ sessionId: '33333333-3333-4333-8333-333333333333' }));
    expect(award).toHaveBeenCalledTimes(1); // a first beat of a new session credits nothing
  });

  it('a session id cannot be borrowed by another viewer or another post (the key binds all three)', async () => {
    const { service, advance, redis } = setup();
    await service.heartbeat('viewer', 'post-1', beat());
    advance(3);
    await service.heartbeat('mallory', 'post-1', beat()); // same session id, another account
    expect(award).not.toHaveBeenCalled();
    expect([...redis.store.keys()].filter((k) => k.startsWith('viewhb:s:'))).toEqual([
      `viewhb:s:viewer:post-1:${SESSION}`,
      `viewhb:s:mallory:post-1:${SESSION}`,
    ]);
  });

  it('a creator viewing their own post earns no baseline point (self-engagement is exempt) and the session is settled', async () => {
    const { service, advance } = setup({ authorId: 'author' });
    expect(await service.heartbeat('author', 'post-1', beat())).toEqual({ done: true });
    advance(5);
    await service.heartbeat('author', 'post-1', beat());
    expect(award).not.toHaveBeenCalled();
  });

  it('a video needs its playhead, and its required time is the full length when shorter than 60 seconds', async () => {
    const { service, advance } = setup({ authorId: 'author', mediaUrls: ['https://x.test/clip.mp4'] });
    await expect(service.heartbeat('viewer', 'post-1', beat({ durationSeconds: 10 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.heartbeat('viewer', 'post-1', beat({ positionSeconds: 0, durationSeconds: 10 }));
    for (let i = 1; i <= 3; i++) {
      advance(3);
      await service.heartbeat('viewer', 'post-1', beat({ positionSeconds: i * 3, durationSeconds: 10 }));
    }
    expect(award).not.toHaveBeenCalled(); // 9 s of a 10 s video
    advance(1);
    await service.heartbeat('viewer', 'post-1', beat({ positionSeconds: 10, durationSeconds: 10 }));
    expect(award).toHaveBeenCalledTimes(1);
  });

  it('a skipped-ahead video earns no credit for the skip', async () => {
    const { service, advance } = setup({ authorId: 'author', mediaUrls: ['https://x.test/clip.mp4'] });
    await service.heartbeat('viewer', 'post-1', beat({ positionSeconds: 0, durationSeconds: 100 }));
    advance(3);
    await service.heartbeat('viewer', 'post-1', beat({ positionSeconds: 90, durationSeconds: 100 }));
    advance(3);
    await service.heartbeat('viewer', 'post-1', beat({ positionSeconds: 93, durationSeconds: 100 }));
    expect(award).not.toHaveBeenCalled();
  });

  it('is a 404 for a post this viewer may not see (a block, or a hidden final entry)', async () => {
    const { service } = setup(null);
    await expect(service.heartbeat('viewer', 'post-1', beat())).rejects.toBeInstanceOf(NotFoundException);
    expect(award).not.toHaveBeenCalled();
  });

  it('asks Prisma for the post with the block and hidden-final-entry filters', async () => {
    const { service, prisma } = setup();
    await service.heartbeat('viewer', 'post-1', beat());
    const where = prisma.post.findUnique.mock.calls[0][0].where;
    expect(where.id).toBe('post-1');
    expect(where.author).toBeDefined(); // notBlockedWith(viewer)
    expect(JSON.stringify(where.AND)).toContain('visibleFrom');
  });

  it('is rate limited per viewer per minute', async () => {
    const { service, redis } = setup();
    redis.store.set('viewhb:rate:viewer', String(MAX_BEATS_PER_MINUTE));
    await expect(service.heartbeat('viewer', 'post-1', beat())).rejects.toBeInstanceOf(HttpException);
    expect(award).not.toHaveBeenCalled();
  });

  it('ignores a simultaneous beat for the same session (it would be credited the same gap twice)', async () => {
    const { service, redis } = setup();
    redis.store.set(`viewhb:lock:viewhb:s:viewer:post-1:${SESSION}`, '1');
    expect(await service.heartbeat('viewer', 'post-1', beat())).toEqual({ done: false });
    expect(redis.store.has(`viewhb:s:viewer:post-1:${SESSION}`)).toBe(false);
  });

  it('always releases the session lock, even when the write fails', async () => {
    const { service, redis, prisma, advance } = setup();
    await service.heartbeat('viewer', 'post-1', beat());
    advance(3);
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(service.heartbeat('viewer', 'post-1', beat())).rejects.toThrow('db down');
    expect(redis.store.has(`viewhb:lock:viewhb:s:viewer:post-1:${SESSION}`)).toBe(false);
  });

  it('a failed write does not mark the outcome done, so the next beat retries it', async () => {
    const { service, prisma, advance } = setup();
    await service.heartbeat('viewer', 'post-1', beat());
    advance(3);
    prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2034', clientVersion: '5' }));
    await expect(service.heartbeat('viewer', 'post-1', beat())).rejects.toBeDefined();
    advance(1);
    await service.heartbeat('viewer', 'post-1', beat());
    expect(award).toHaveBeenCalledTimes(1);
  });

  describe('contest entries (weeks 1-3)', () => {
    // Window: 2026-11-02 09:00 submission .. Phase 1 ends 2026-11-05 00:00 London (GMT)
    const PHASE_1 = '2026-11-03T12:00:00.000Z';
    const entry = (over: Record<string, unknown> = {}) => ({
      entryId: 'entry-1',
      weekNumber: 1,
      authorId: 'author',
      submittedAt: new Date('2026-11-02T09:00:00.000Z'),
      monthKey: '2026-11',
      viewWatchLimitSeconds: 30,
      ...over,
    });

    it('records the contest view at the contest threshold (photo: 5 s), after the baseline point (3 s)', async () => {
      loadEntry.mockResolvedValue(entry());
      const { service, advance } = setup(undefined, PHASE_1);
      await service.heartbeat('viewer', 'post-1', beat());
      advance(3);
      expect(await service.heartbeat('viewer', 'post-1', beat())).toEqual({ done: false });
      expect(award).toHaveBeenCalledTimes(1);
      expect(recordView).not.toHaveBeenCalled();
      advance(2);
      expect(await service.heartbeat('viewer', 'post-1', beat())).toEqual({ done: true });
      expect(recordView).toHaveBeenCalledTimes(1);
      expect(recordView).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entryId: 'entry-1' }), {
        viewerId: 'viewer',
        now: new Date('2026-11-03T12:00:05.000Z'),
      });
      expect(award).toHaveBeenCalledTimes(1);
    });

    it('does not record a contest view for a week-4 final entry (views are not counted in the final)', async () => {
      loadEntry.mockResolvedValue(entry({ weekNumber: 4, viewWatchLimitSeconds: null }));
      const { service, advance } = setup(undefined, PHASE_1);
      await service.heartbeat('viewer', 'post-1', beat());
      advance(6);
      await service.heartbeat('viewer', 'post-1', beat());
      advance(6);
      await service.heartbeat('viewer', 'post-1', beat());
      expect(recordView).not.toHaveBeenCalled();
    });

    it('does not record a contest view once the entry\'s counting window has closed', async () => {
      loadEntry.mockResolvedValue(entry()); // the clock (2026-11-10) is after Phase 1 ended
      const { service, advance } = setup();
      await service.heartbeat('viewer', 'post-1', beat());
      advance(3);
      await service.heartbeat('viewer', 'post-1', beat());
      advance(3);
      await service.heartbeat('viewer', 'post-1', beat());
      expect(recordView).not.toHaveBeenCalled();
      expect(award).toHaveBeenCalledTimes(1); // the everyday point still applies
    });

    it('the author\'s own view of their entry COUNTS in the contest tally but earns no baseline point', async () => {
      loadEntry.mockResolvedValue(entry());
      const { service, advance } = setup(undefined, PHASE_1);
      await service.heartbeat('author', 'post-1', beat());
      advance(5);
      expect(await service.heartbeat('author', 'post-1', beat())).toEqual({ done: true });
      expect(recordView).toHaveBeenCalledTimes(1);
      expect(award).not.toHaveBeenCalled();
    });
  });
});
