import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE, FeedQueryDto } from '../feed/dto/feed-query.dto';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';
import { decodeBlockCursor, encodeBlockCursor } from './block.cursor';
import { BlockUserDto } from './dto/block-user.dto';

export interface BlockResult {
  userId: string;
  blocked: boolean;
}

// One entry of the blocker's own list. Deliberately NO date (#404 item 8) and
// no field of the blocked user beyond their public name; the reason is the
// blocker's own text, returned to the blocker only (this endpoint is self-scoped).
export interface BlockedUserEntry {
  id: string;
  publicName: string;
  reason: string | null;
}

export interface BlockedUserPage {
  items: BlockedUserEntry[];
  nextCursor: string | null;
}

// backend/w5-profile-block (B-039; Decision Log #396, #402 item 4, #404 items 8
// and 11, #406 item 12). The write side of Block: create, remove, and the
// blocker's own list. The READ-side enforcement (feeds, comments, search,
// rosters, follows, messages, profile) lives where each of those is served and
// shares block.util.ts; see block/README.md for the full table.
@Injectable()
export class BlockService {
  constructor(private readonly prisma: PrismaService) {}

  // POST /users/:id/block. Idempotent: blocking someone you already blocked is a
  // 200 that changes nothing, in particular it does NOT overwrite the stored
  // reason -- "the reason is not editable (unblock and re-block to change it)"
  // (#404 item 8).
  //
  // The target must be a profile the blocker could see at all: a non-active
  // account or a restricted-pending minor is a 404, exactly like
  // GET /users/:id/public-profile, so this endpoint cannot be used to learn that
  // such an account exists.
  //
  // In ONE transaction the block row is written and the follows between the two
  // users are removed in BOTH directions (#396 C2). They are NOT restored by an
  // unblock (#402 item 4). Counts (likeCount, commentCount, memberCount) are
  // untouched, and no Notification is created for the blocked user (they are not
  // told, #402 item 4).
  async blockUser(blockerId: string, targetId: string, dto: BlockUserDto): Promise<BlockResult> {
    if (blockerId === targetId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, isMinor: true, accountStatus: true, guardian: { select: { consentStatus: true } } },
    });
    if (
      !target ||
      target.accountStatus !== 'active' ||
      (target.isMinor && target.guardian?.consentStatus !== 'confirmed')
    ) {
      throw new NotFoundException('User not found');
    }

    const reason = dto.reason?.trim() ? dto.reason.trim() : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.block.create({ data: { blockerId, blockedId: targetId, reason } });
        await tx.follow.deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followeeId: targetId },
              { followerId: targetId, followeeId: blockerId },
            ],
          },
        });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already blocked: idempotent success, the first block's reason stands.
    }

    return { userId: targetId, blocked: true };
  }

  // DELETE /users/:id/block. Symmetric idempotency to unfollow/unlike: not
  // blocked is a 200 no-op, never a 404 (and never an existence signal). Follows
  // removed by the original block are NOT restored.
  async unblockUser(blockerId: string, targetId: string): Promise<BlockResult> {
    if (blockerId === targetId) {
      throw new BadRequestException('You cannot unblock yourself');
    }
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId: targetId } });
    return { userId: targetId, blocked: false };
  }

  // GET /users/:id/blocks -- the blocker's own list, most recently blocked first
  // (by the monotonic sequence; no date is exposed and none is in the cursor).
  // Self-scoped by the controller. A blocked account that has since been
  // anonymized loses its Block row (anonymizeUser), so it simply stops appearing;
  // one that is merely deactivated stays listed so it can still be unblocked.
  async listBlocked(blockerId: string, query: FeedQueryDto): Promise<BlockedUserPage> {
    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const where: Prisma.BlockWhereInput = query.cursor
      ? { blockerId, sequence: { lt: decodeBlockCursor(query.cursor) } }
      : { blockerId };

    const rows = await this.prisma.block.findMany({
      where,
      orderBy: { sequence: 'desc' },
      take: limit + 1,
      select: {
        sequence: true,
        reason: true,
        blocked: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        id: row.blocked.id,
        publicName: resolvePublicName(row.blocked),
        reason: row.reason,
      })),
      nextCursor: hasMore && last ? encodeBlockCursor(last.sequence) : null,
    };
  }
}
