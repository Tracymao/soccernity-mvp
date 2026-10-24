import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeSearchClubCursor, encodeSearchPostCursor } from './cursor.util';
import { encodeUserNameCursor, USER_NAME_ORDER_BY } from '../users/user-name-keyset.util';
import { SearchService } from './search.service';

// Mocked-Prisma unit tests, following blog.service.spec.ts /
// community-groups.service.spec.ts. No e2e spec accompanies this module
// — every method here is a plain findMany against User/ClubPage/Post's
// already-existing columns and FKs, no raw SQL, no transaction, no novel
// Prisma relation or constraint (see test/README.md's own three
// e2e-add triggers, none of which apply here — the same conclusion
// blog/README.md and admin-content/README.md each already reached for
// their own analogous plain-read modules).

function buildPrismaMock() {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    clubPage: { findMany: jest.fn().mockResolvedValue([]) },
    post: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  return prisma;
}

function userRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'user-1', username: null as string | null, displayName: 'Chelsea Fan', ...overrides };
}

function clubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'club-1',
    name: 'Chelsea FC',
    league: 'Premier League',
    country: 'England',
    logoUrl: null,
    memberCount: 10,
    ...overrides,
  };
}

function postRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    contentText: 'Chelsea won again',
    author: { id: 'user-1', username: null, displayName: 'Chelsea Fan' },
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    likeCount: 3,
    commentCount: 1,
    ...overrides,
  };
}

describe('SearchService', () => {
  describe('normalizeQuery / trimming', () => {
    it('the individual scope methods do NOT trim — they use whatever string they are given verbatim', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      // Calling searchClubs() directly (bypassing search()'s own
      // normalizeQuery step) proves trimming is centralised in one place
      // (search()), not duplicated into every scope method.
      await service.searchClubs('  chelsea  ', undefined, 20);

      const call = (prisma.clubPage.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ name: { contains: '  chelsea  ', mode: 'insensitive' } });
    });

    it('rejects a query that trims to fewer than 2 characters', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await expect(service.search({ q: '  a ' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.clubPage.findMany).not.toHaveBeenCalled();
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('search() passes the TRIMMED query through to each scope method', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.search({ q: '  chelsea  ', scope: 'clubs' });

      const call = (prisma.clubPage.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ name: { contains: 'chelsea', mode: 'insensitive' } });
    });
  });

  describe('search() dispatch', () => {
    it('returns all three groups when scope is omitted', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      const result = await service.search({ q: 'chelsea' });

      expect(result).toEqual({
        users: { items: [], nextCursor: null },
        clubs: { items: [], nextCursor: null },
        posts: { items: [], nextCursor: null },
      });
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.clubPage.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
    });

    it('rejects a cursor supplied without a scope', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await expect(service.search({ q: 'chelsea', cursor: 'abc' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.clubPage.findMany).not.toHaveBeenCalled();
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('only queries the requested table when scope is "users"', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      const result = await service.search({ q: 'chelsea', scope: 'users' });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.clubPage.findMany).not.toHaveBeenCalled();
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('only queries the requested table when scope is "posts"', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.search({ q: 'chelsea', scope: 'posts' });

      expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.clubPage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('searchUsers', () => {
    it('filters to active accountStatus and (non-minor OR confirmed-consent minor)', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchUsers('chelsea', undefined, 20);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          {
            accountStatus: 'active',
            OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
          },
        ]),
      );
    });

    it('applies a case-insensitive contains filter on the username only (B-027: no real-name or placeholder matching)', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchUsers('chelsea', undefined, 20);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [{ username: { contains: 'chelsea', mode: 'insensitive' } }],
          },
        ]),
      );
      expect(call.orderBy).toEqual(USER_NAME_ORDER_BY);
      expect(JSON.stringify(call.orderBy)).not.toContain('displayName');
    });

    it('never selects isMinor, accountStatus, or any other field beyond id/displayName', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchUsers('chelsea', undefined, 20);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.select).toEqual({ id: true, username: true, displayName: true });
    });

    it('applies the cursor as an additional AND condition on username/id, ascending, admitting the no-username group (B-034)', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);
      const cursor = encodeUserNameCursor({ username: 'ade_9', id: 'user-0' });

      await service.searchUsers('chelsea', cursor, 5);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(6);
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          { OR: [{ username: { gt: 'ade_9' } }, { username: 'ade_9', id: { gt: 'user-0' } }, { username: null }] },
        ]),
      );
    });

    it('returns nextCursor only when a further page exists', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) => userRow({ id: `user-${i}`, displayName: `Name ${i}` }));
      (prisma.user.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new SearchService(prisma);

      const page = await service.searchUsers('chelsea', undefined, 2);

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it('the nextCursor carries the username (or null) and the id, never the real displayName (B-034)', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        userRow({ id: 'user-0', username: 'chelsea_9', displayName: 'Real Person' }),
        userRow({ id: 'user-1', displayName: 'Other Person' }),
      ]);
      const page = await new SearchService(prisma).searchUsers('chelsea', undefined, 1);
      expect(page.nextCursor).toBe(encodeUserNameCursor({ username: 'chelsea_9', id: 'user-0' }));
      expect(Buffer.from(page.nextCursor as string, 'base64url').toString('utf8')).not.toContain('Real');
    });

    it('rejects a legacy displayName-keyed cursor with a 400', async () => {
      const legacy = Buffer.from(JSON.stringify({ displayName: 'Ade', id: 'user-0' })).toString('base64url');
      await expect(new SearchService(buildPrismaMock()).searchUsers('chelsea', legacy, 5)).rejects.toThrow(
        'Invalid pagination cursor',
      );
    });

    it('shapes each result to exactly {id, publicName}', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([userRow()]);
      const service = new SearchService(prisma);

      const page = await service.searchUsers('chelsea', undefined, 20);

      expect(page.items[0]).toEqual({ id: 'user-1', publicName: 'Soccernity member' });
    });

    it('shows the username as publicName when set, and never returns the real displayName', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([userRow({ username: 'blue_9' })]);
      const service = new SearchService(prisma);

      const page = await service.searchUsers('blue', undefined, 20);

      expect(page.items[0]).toEqual({ id: 'user-1', publicName: 'blue_9' });
      expect(JSON.stringify(page)).not.toContain('Chelsea Fan');
    });
  });

  describe('searchClubs', () => {
    it('applies a case-insensitive contains filter on name, no other exclusion', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchClubs('chelsea', undefined, 20);

      const call = (prisma.clubPage.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual([{ name: { contains: 'chelsea', mode: 'insensitive' } }]);
      expect(call.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    });

    it('applies the cursor as an additional AND condition on name/id, ascending', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);
      const cursor = encodeSearchClubCursor({ name: 'Arsenal', id: 'club-0' });

      await service.searchClubs('chelsea', cursor, 20);

      const call = (prisma.clubPage.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          { OR: [{ name: { gt: 'Arsenal' } }, { name: 'Arsenal', id: { gt: 'club-0' } }] },
        ]),
      );
    });

    it('returns nextCursor only when a further page exists', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) => clubRow({ id: `club-${i}`, name: `Club ${i}` }));
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new SearchService(prisma);

      const page = await service.searchClubs('chelsea', undefined, 2);

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });
  });

  describe('searchPosts', () => {
    it('excludes posts by a non-active (and non-deleted/anonymized) author', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchPosts('chelsea', undefined, 20);

      const call = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ author: { accountStatus: { in: ['active', 'deleted'] } } }]),
      );
    });

    it('applies a case-insensitive contains filter on contentText, newest-first', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchPosts('chelsea', undefined, 20);

      const call = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ contentText: { contains: 'chelsea', mode: 'insensitive' } }]),
      );
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('never selects an author field beyond id/displayName', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchPosts('chelsea', undefined, 20);

      const call = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(call.select.author).toEqual({ select: { id: true, username: true, displayName: true } });
    });

    it('applies the cursor as an additional AND condition on createdAt/id, descending', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);
      const cursor = encodeSearchPostCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'post-0' });

      await service.searchPosts('chelsea', cursor, 20);

      const call = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { createdAt: { lt: new Date('2026-09-01T00:00:00.000Z') } },
              { createdAt: new Date('2026-09-01T00:00:00.000Z'), id: { lt: 'post-0' } },
            ],
          },
        ]),
      );
    });

    it('returns nextCursor only when a further page exists', async () => {
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) => postRow({ id: `post-${i}` }));
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new SearchService(prisma);

      const page = await service.searchPosts('chelsea', undefined, 2);

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it('shapes each result with the embedded author and denormalized counts', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([postRow()]);
      const service = new SearchService(prisma);

      const page = await service.searchPosts('chelsea', undefined, 20);

      expect(page.items[0]).toEqual({
        id: 'post-1',
        contentText: 'Chelsea won again',
        author: { id: 'user-1', publicName: 'Soccernity member' },
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        likeCount: 3,
        commentCount: 1,
      });
    });
  });

  // B-039 (Block, Decision Log #396, #402 item 4): a logged-in viewer's blocks (either
  // direction) hide people and posts; an anonymous caller has none.
  describe('Block filter', () => {
    const notBlocked = { blockedBy: { none: { blockerId: 'viewer-1' } }, blocksMade: { none: { blockedId: 'viewer-1' } } };

    it('people search ANDs the not-blocked filter for a viewer', async () => {
      const prisma = buildPrismaMock();
      await new SearchService(prisma).searchUsers('chelsea', undefined, 20, 'viewer-1');
      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(expect.arrayContaining([notBlocked]));
    });

    it('post search ANDs the not-blocked author filter for a viewer', async () => {
      const prisma = buildPrismaMock();
      await new SearchService(prisma).searchPosts('chelsea', undefined, 20, 'viewer-1');
      const call = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(expect.arrayContaining([{ author: { is: notBlocked } }]));
    });

    it('anonymous callers get no block clause at all', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);
      await service.searchUsers('chelsea', undefined, 20);
      await service.searchPosts('chelsea', undefined, 20);
      expect(JSON.stringify((prisma.user.findMany as jest.Mock).mock.calls[0][0])).not.toContain('blockedBy');
      expect(JSON.stringify((prisma.post.findMany as jest.Mock).mock.calls[0][0])).not.toContain('blockedBy');
    });

    it('search() passes the viewer to users and posts but clubs have no per-user rule', async () => {
      const prisma = buildPrismaMock();
      await new SearchService(prisma).search({ q: 'chelsea' }, 'viewer-1');
      expect(JSON.stringify((prisma.user.findMany as jest.Mock).mock.calls[0][0])).toContain('blockedBy');
      expect(JSON.stringify((prisma.post.findMany as jest.Mock).mock.calls[0][0])).toContain('blockedBy');
      expect(JSON.stringify((prisma.clubPage.findMany as jest.Mock).mock.calls[0][0])).not.toContain('blockedBy');
    });
  });
});
