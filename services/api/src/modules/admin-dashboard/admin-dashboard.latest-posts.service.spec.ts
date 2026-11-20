import { PrismaService } from '../../prisma/prisma.service';
import { PageViewService } from '../page-views/page-view.service';
import { AdminDashboardService } from './admin-dashboard.service';

const NOW = new Date('2026-11-07T12:00:00.000Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    createdAt: new Date('2026-11-07T10:00:00.000Z'),
    contentText: 'hello world',
    mediaUrls: [],
    likeCount: 3,
    commentCount: 2,
    media: [],
    author: { username: 'ada', displayName: 'Ada Lovelace' },
    ...over,
  };
}

function build(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { post: { findMany } } as unknown as PrismaService;
  const service = new AdminDashboardService(prisma, {} as unknown as PageViewService, { now: () => NOW });
  return { service, findMany };
}

describe('AdminDashboardService.getLatestPosts', () => {
  it('orders newest first with the monotonic sequence as tiebreaker, default limit 5', async () => {
    const { service, findMany } = build();
    await service.getLatestPosts();
    const arg = findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { sequence: 'desc' }]);
    expect(arg.take).toBe(5);
  });

  it('passes the requested limit through', async () => {
    const { service, findMany } = build();
    await service.getLatestPosts(2);
    expect(findMany.mock.calls[0][0].take).toBe(2);
  });

  it('filters: active, non-minor, non-under-16 authors only', async () => {
    const { service, findMany } = build();
    await service.getLatestPosts();
    expect(findMany.mock.calls[0][0].where.author).toEqual({
      accountStatus: 'active',
      isMinor: false,
      isUnder16: false,
    });
  });

  it('filters: hides a not-yet-revealed entry (visibleFrom) and any non-approved media', async () => {
    const { service, findMany } = build();
    await service.getLatestPosts();
    const and = findMany.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual({ OR: [{ visibleFrom: null }, { visibleFrom: { lte: NOW } }] });
    expect(JSON.stringify(and[1])).toContain('"not":"approved"');
    expect(JSON.stringify(and[1])).toContain('hiddenPendingReview');
  });

  it('maps each field of the item', async () => {
    const { service } = build([row({ contentText: 'x'.repeat(200), media: [{ kind: 'image' }, { kind: 'video' }] })]);
    const [item] = await service.getLatestPosts();
    expect(item).toEqual({
      id: 'p1',
      createdAt: new Date('2026-11-07T10:00:00.000Z'),
      mediaType: 'video',
      excerpt: 'x'.repeat(140),
      author: { publicName: 'ada' },
      likeCount: 3,
      commentCount: 2,
    });
  });

  it('exposes only the public name: no real name, email or id of the author can appear', async () => {
    const { service, findMany } = build([
      row({ author: { username: null, displayName: 'Ada Lovelace', email: 'ada@example.com', id: 'u1' } }),
    ]);
    const items = await service.getLatestPosts();
    const json = JSON.stringify(items);
    expect(json).not.toContain('Ada Lovelace');
    expect(json).not.toContain('ada@example.com');
    expect(json).not.toContain('u1');
    expect(items[0].author).toEqual({ publicName: 'Soccernity member' });
    expect(Object.keys(items[0].author)).toEqual(['publicName']);
    // and the query never even asks for the email
    const select = findMany.mock.calls[0][0].select;
    expect(select.author).toEqual({ select: { username: true, displayName: true } });
    expect(JSON.stringify(select)).not.toContain('email');
  });

  it('mediaType is null with no media, photo for a legacy non-video url', async () => {
    const { service } = build([row({ id: 'a' }), row({ id: 'b', mediaUrls: ['https://x/a.jpg'] })]);
    const items = await service.getLatestPosts();
    expect(items.map((i) => i.mediaType)).toEqual([null, 'photo']);
  });
});
