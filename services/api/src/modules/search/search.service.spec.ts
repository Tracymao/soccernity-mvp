import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeSearchClubCursor, encodeSearchPostCursor, encodeSearchUserCursor } from './cursor.util';
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
  return { id: 'user-1', displayName: 'Chelsea Fan', ...overrides };
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
    author: { id: 'user-1', displayName: 'Chelsea Fan' },
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

    it('applies a case-insensitive contains filter on displayName', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchUsers('chelsea', undefined, 20);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toEqual(
        expect.arrayContaining([{ displayName: { contains: 'chelsea', mode: 'insensitive' } }]),
      );
      expect(call.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
    });

    it('never selects isMinor, accountStatus, or any other field beyond id/displayName', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);

      await service.searchUsers('chelsea', undefined, 20);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.select).toEqual({ id: true, displayName: true });
    });

    it('applies the cursor as an additional AND condition on displayName/id, ascending', async () => {
      const prisma = buildPrismaMock();
      const service = new SearchService(prisma);
      const cursor = encodeSearchUserCursor({ displayName: 'Ade', id: 'user-0' });

      await service.searchUsers('chelsea', cursor, 5);

      const call = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(6);
      expect(call.where.AND).toEqual(
        expect.arrayContaining([
          { OR: [{ displayName: { gt: 'Ade' } }, { displayName: 'Ade', id: { gt: 'user-0' } }] },
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

    it('shapes each result to exactly {id, displayName}', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([userRow()]);
      const service = new SearchService(prisma);

      const page = await service.searchUsers('chelsea', undefined, 20);

      expect(page.items[0]).toEqual({ id: 'user-1', displayName: 'Chelsea Fan' });
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
      expect(call.select.author).toEqual({ select: { id: true, displayName: true } });
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
        author: { id: 'user-1', displayName: 'Chelsea Fan' },
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        likeCount: 3,
        commentCount: 1,
      });
    });
  });
});
