import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  USERNAME_REVIEW_ALREADY_REQUESTED_CODE,
  USERNAME_REVIEW_MESSAGE_INVALID_CODE,
  USERNAME_REVIEW_MESSAGE_MAX_LENGTH,
  USERNAME_REVIEW_NOT_AVAILABLE_CODE,
  USERNAME_REVIEW_WINDOW_CLOSED_CODE,
  UsernameReviewState,
} from './username-review.constants';
import { canAskForUsernameReview, usernameReviewDeadline } from './username-review-window.util';

export interface UsernameReviewStatus {
  state: UsernameReviewState;
  // The first instant at which asking stops being possible; non-null only for 'can_request'.
  requestableUntil: Date | null;
}

// backend/b139-username-review (B-139 part (c); Decision Log #467): the USER side of the review route -- what
// state a revoked user's request is in, and creating the request.
//
// WHICH REVOCATION: a user can hold several RevokedUsername records over time (revoked, chose another handle,
// revoked again). The review concerns the LATEST one (by revokedAt): it is the one that put the account in its
// current no-username state. An older record's request (if one was made) is left to the admins to decide.
//
// All wording that reaches the user (the error messages) is plain and functional and is
// [COPY PENDING LEGAL REVIEW]; the web client should branch on `code`, not on the English.
@Injectable()
export class UsernameReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string, now: Date = new Date()): Promise<UsernameReviewStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new NotFoundException('User not found');
    // Once the account has a username there is nothing to review.
    if (user.username !== null) return { state: 'none', requestableUntil: null };

    const revocation = await this.latestRevocation(userId);
    if (!revocation) return { state: 'none', requestableUntil: null };

    const request = revocation.reviewRequest;
    if (request) {
      if (request.status === 'pending') return { state: 'pending', requestableUntil: null };
      if (request.status === 'declined') return { state: 'declined', requestableUntil: null };
      if (request.status === 'reinstated') return { state: 'reinstated', requestableUntil: null };
    }
    if (canAskForUsernameReview(revocation.revokedAt, now)) {
      return { state: 'can_request', requestableUntil: usernameReviewDeadline(revocation.revokedAt) };
    }
    // No request and the time to ask has passed: nothing to offer (the web client shows no button).
    return { state: 'none', requestableUntil: null };
  }

  async createRequest(userId: string, rawMessage: string | undefined, now: Date = new Date()): Promise<UsernameReviewStatus> {
    const message = this.cleanMessage(rawMessage);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, accountStatus: true },
    });
    // A removed account behind a still-valid token, a closed account, or one that already has a username: nothing
    // to review. One code for all, so it does not say which.
    if (!user || user.accountStatus !== 'active' || user.username !== null) throw this.notAvailable();

    const revocation = await this.latestRevocation(userId);
    if (!revocation) throw this.notAvailable();
    if (revocation.reviewRequest) throw this.alreadyRequested();
    if (!canAskForUsernameReview(revocation.revokedAt, now)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: USERNAME_REVIEW_WINDOW_CLOSED_CODE,
        message: 'The time to ask for a review of this username removal has passed.',
      });
    }

    try {
      await this.prisma.usernameReviewRequest.create({
        data: { revokedUsernameId: revocation.id, userId, message },
        select: { id: true },
      });
    } catch (err) {
      // Two simultaneous requests: the unique index on revokedUsernameId lets exactly one through.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw this.alreadyRequested();
      throw err;
    }
    return { state: 'pending', requestableUntil: null };
  }

  private latestRevocation(userId: string) {
    return this.prisma.revokedUsername.findFirst({
      where: { userId },
      orderBy: [{ revokedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, revokedAt: true, reviewRequest: { select: { status: true } } },
    });
  }

  // Trimmed; nothing left = no message. The limit is judged after trimming.
  private cleanMessage(raw: string | undefined): string | null {
    if (raw === undefined || raw === null) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > USERNAME_REVIEW_MESSAGE_MAX_LENGTH) {
      throw new BadRequestException({
        message: `Your message must be at most ${USERNAME_REVIEW_MESSAGE_MAX_LENGTH} characters.`,
        code: USERNAME_REVIEW_MESSAGE_INVALID_CODE,
      });
    }
    return trimmed;
  }

  private notAvailable(): ForbiddenException {
    return new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: USERNAME_REVIEW_NOT_AVAILABLE_CODE,
      message: 'There is no username removal to ask a review of.',
    });
  }

  private alreadyRequested(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: USERNAME_REVIEW_ALREADY_REQUESTED_CODE,
      message: 'You have already asked for a review of this username removal.',
    });
  }
}
