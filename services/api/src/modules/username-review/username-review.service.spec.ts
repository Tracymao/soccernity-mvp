import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  USERNAME_REVIEW_ALREADY_REQUESTED_CODE,
  USERNAME_REVIEW_MESSAGE_INVALID_CODE,
  USERNAME_REVIEW_NOT_AVAILABLE_CODE,
  USERNAME_REVIEW_WINDOW_CLOSED_CODE,
} from './username-review.constants';
import { UsernameReviewService } from './username-review.service';

const REVOKED_AT = new Date('2026-11-03T10:00:00.000Z');
const INSIDE = new Date('2026-12-03T23:59:59.999Z'); // the last moment of the last day
const OUTSIDE = new Date('2026-12-04T00:00:00.000Z');

interface Opts {
  user?: { username: string | null; accountStatus: string } | null;
  revocation?: { id: string; revokedAt: Date; reviewRequest: { status: string } | null } | null;
  createError?: unknown;
}

function build(opts: Opts = {}) {
  const user = opts.user === undefined ? { username: null, accountStatus: 'active' } : opts.user;
  const revocation =
    opts.revocation === undefined ? { id: 'rv-1', revokedAt: REVOKED_AT, reviewRequest: null } : opts.revocation;
  const prisma = {
    user: { findUnique: jest.fn(async () => user) },
    revokedUsername: { findFirst: jest.fn(async () => revocation) },
    usernameReviewRequest: {
      create: jest.fn(async () => {
        if (opts.createError) throw opts.createError;
        return { id: 'req-1' };
      }),
    },
  };
  return { service: new UsernameReviewService(prisma as never), prisma };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { getResponse: () => { code?: string } }).getResponse().code;
  }
  return undefined;
};

describe('UsernameReviewService.getStatus (B-139 part (c))', () => {
  it('none when the user has a username (nothing to review)', async () => {
    const { service, prisma } = build({ user: { username: 'ada_obi', accountStatus: 'active' } });
    await expect(service.getStatus('u-1', INSIDE)).resolves.toEqual({ state: 'none', requestableUntil: null });
    expect(prisma.revokedUsername.findFirst).not.toHaveBeenCalled();
  });

  it('none when the user was never revoked', async () => {
    const { service } = build({ revocation: null });
    await expect(service.getStatus('u-1', INSIDE)).resolves.toEqual({ state: 'none', requestableUntil: null });
  });

  it('can_request inside the window, with the first instant asking stops', async () => {
    const { service } = build();
    await expect(service.getStatus('u-1', INSIDE)).resolves.toEqual({
      state: 'can_request',
      requestableUntil: new Date('2026-12-04T00:00:00.000Z'),
    });
  });

  it('none once the window has closed with no request', async () => {
    const { service } = build();
    await expect(service.getStatus('u-1', OUTSIDE)).resolves.toEqual({ state: 'none', requestableUntil: null });
  });

  it.each([
    ['pending', 'pending'],
    ['declined', 'declined'],
    ['reinstated', 'reinstated'],
  ])('a %s request reads as %s, even after the window has closed', async (status, state) => {
    const { service } = build({ revocation: { id: 'rv-1', revokedAt: REVOKED_AT, reviewRequest: { status } } });
    await expect(service.getStatus('u-1', OUTSIDE)).resolves.toEqual({ state, requestableUntil: null });
  });

  it('looks at the LATEST revocation', async () => {
    const { service, prisma } = build();
    await service.getStatus('u-1', INSIDE);
    expect(prisma.revokedUsername.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-1' }, orderBy: [{ revokedAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('a missing account behind a token is a 404', async () => {
    const { service } = build({ user: null });
    await expect(service.getStatus('u-1', INSIDE)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsernameReviewService.createRequest (B-139 part (c))', () => {
  it('creates the request tied to the latest revocation and reports pending', async () => {
    const { service, prisma } = build();
    await expect(service.createRequest('u-1', 'Please look again', INSIDE)).resolves.toEqual({
      state: 'pending',
      requestableUntil: null,
    });
    expect(prisma.usernameReviewRequest.create).toHaveBeenCalledWith({
      data: { revokedUsernameId: 'rv-1', userId: 'u-1', message: 'Please look again' },
      select: { id: true },
    });
  });

  it('the message is optional: omitted, empty and spaces all store NULL', async () => {
    for (const message of [undefined, '', '   \n  ']) {
      const { service, prisma } = build();
      await service.createRequest('u-1', message, INSIDE);
      expect(prisma.usernameReviewRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedUsernameId: 'rv-1', userId: 'u-1', message: null } }),
      );
    }
  });

  it('trims the message, and the 500-character limit is judged after trimming', async () => {
    const { service, prisma } = build();
    await service.createRequest('u-1', `  ${'a'.repeat(500)}  `, INSIDE);
    expect(prisma.usernameReviewRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ message: 'a'.repeat(500) }) }),
    );
  });

  it('501 characters is a coded 400 and nothing is read or written', async () => {
    const { service, prisma } = build();
    const p = service.createRequest('u-1', 'a'.repeat(501), INSIDE);
    await expect(p).rejects.toBeInstanceOf(BadRequestException);
    expect(await code(service.createRequest('u-1', 'a'.repeat(501), INSIDE))).toBe(USERNAME_REVIEW_MESSAGE_INVALID_CODE);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.usernameReviewRequest.create).not.toHaveBeenCalled();
  });

  describe('not available (403 username_review_not_available): the same code for every reason', () => {
    it.each([
      ['the user already has a username', { user: { username: 'ada_obi', accountStatus: 'active' } }],
      ['the account is not active', { user: { username: null, accountStatus: 'deactivated' } }],
      ['the account is pending deletion', { user: { username: null, accountStatus: 'pending_deletion' } }],
      ['the account no longer exists', { user: null }],
      ['the user was never revoked', { revocation: null }],
    ] as Array<[string, Opts]>)('%s', async (_label, opts) => {
      const { service, prisma } = build(opts);
      const p = service.createRequest('u-1', undefined, INSIDE);
      await expect(p).rejects.toBeInstanceOf(ForbiddenException);
      expect(await code(service.createRequest('u-1', undefined, INSIDE))).toBe(USERNAME_REVIEW_NOT_AVAILABLE_CODE);
      expect(prisma.usernameReviewRequest.create).not.toHaveBeenCalled();
    });
  });

  it('a request already exists for this revocation: 409, whatever its status', async () => {
    for (const status of ['pending', 'declined', 'reinstated']) {
      const { service, prisma } = build({ revocation: { id: 'rv-1', revokedAt: REVOKED_AT, reviewRequest: { status } } });
      const p = service.createRequest('u-1', undefined, INSIDE);
      await expect(p).rejects.toBeInstanceOf(ConflictException);
      expect(await code(service.createRequest('u-1', undefined, INSIDE))).toBe(USERNAME_REVIEW_ALREADY_REQUESTED_CODE);
      expect(prisma.usernameReviewRequest.create).not.toHaveBeenCalled();
    }
  });

  it('after the window: 403 username_review_window_closed; the last moment of the last day still works', async () => {
    const closed = build();
    await expect(closed.service.createRequest('u-1', undefined, OUTSIDE)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await code(build().service.createRequest('u-1', undefined, OUTSIDE))).toBe(USERNAME_REVIEW_WINDOW_CLOSED_CODE);
    expect(closed.prisma.usernameReviewRequest.create).not.toHaveBeenCalled();

    const open = build();
    await expect(open.service.createRequest('u-1', undefined, INSIDE)).resolves.toMatchObject({ state: 'pending' });
  });

  it('two simultaneous requests: the unique index lets one through and the loser gets the same 409', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
    const { service } = build({ createError: dup });
    expect(await code(service.createRequest('u-1', undefined, INSIDE))).toBe(USERNAME_REVIEW_ALREADY_REQUESTED_CODE);
  });

  it('any other database error is not turned into a 409', async () => {
    const { service } = build({ createError: new Error('connection lost') });
    await expect(service.createRequest('u-1', undefined, INSIDE)).rejects.toThrow('connection lost');
  });
});
