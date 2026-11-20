import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostMediaConfig } from '../post-media/post-media.config';
import { SuspectedIllegalMediaService } from './suspected-illegal-media.service';

// backend/suspected-illegal-profile-images (B-206): the profile picture / cover branch of setAside, and the profile
// kinds in get(). Prisma and the collaborators are faked; the real rejection and the real deletion paths are covered
// against Postgres in test/suspected-illegal-profile-images.e2e-spec.ts.
const NOW = new Date('2026-12-15T10:00:00Z');
const DAY = 24 * 3600 * 1000;
const USER = '3b241101-e2bb-4255-8caf-4136c566a962';
const FILE = 'f1.jpg';
const ID = `avatar:${USER}:${FILE}`;
const PRIVATE = `private-profile/${USER}/${FILE}`;

function recordRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rec1',
    mediaId: ID,
    uploaderId: USER,
    postId: null,
    reportId: null,
    kind: 'profile_avatar',
    reason: 'r',
    uploaderCountry: 'GB',
    uploaderIsMinor: true,
    status: 'set_aside',
    setAsideByAdminId: 'a1',
    setAsideAt: NOW,
    preserveUntil: new Date(NOW.getTime() + 365 * DAY),
    decidedByAdminId: null,
    decidedAt: null,
    bodyKey: null,
    bodyOther: null,
    reference: null,
    filedAt: null,
    note: null,
    notFiledReason: null,
    ...over,
  };
}

interface Opts {
  vetted?: boolean;
  isMinor?: boolean;
  status?: 'pending' | 'approved' | 'rejected';
  kind?: 'avatar' | 'cover';
  existing?: boolean;
  liveKey?: string | null;
  liveStatus?: string | null;
  locateError?: Error;
  rejectError?: Error;
}

function build(opts: Opts = {}) {
  const kind = opts.kind ?? 'avatar';
  const tx = {
    suspectedIllegalMedia: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => recordRow(data)),
    },
    user: {
      findUnique: jest.fn().mockImplementation(async (args: { select: Record<string, boolean> }) =>
        args.select.avatarKey
          ? {
              avatarKey: opts.liveKey === undefined ? PRIVATE : opts.liveKey,
              avatarStatus: opts.liveStatus === undefined ? 'rejected' : opts.liveStatus,
              coverKey: null,
              coverStatus: null,
            }
          : { isMinor: true, derivedCountry: 'GB', declaredCountry: 'NG' },
      ),
    },
    adminActionLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? true }) },
    report: { findUnique: jest.fn().mockResolvedValue({ id: 'rep' }) },
    suspectedIllegalMedia: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ? { id: 'rec0' } : null),
      findMany: jest.fn().mockResolvedValue([recordRow()]),
    },
    postMedia: { findFirst: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const profileImages = {
    locate: jest.fn(async () => {
      if (opts.locateError) throw opts.locateError;
      return {
        kind,
        userId: USER,
        key: PRIVATE,
        status: opts.status ?? 'pending',
        uploadedAt: NOW,
        isMinor: opts.isMinor ?? true,
      };
    }),
  };
  const profileRejections = {
    rejectProfileImage: jest.fn(
      async (
        _u: string,
        _k: string,
        _reason: string,
        _expected: string | undefined,
        options: { inTransaction?: (t: unknown, endKey: string) => Promise<void> },
      ) => {
        if (opts.rejectError) throw opts.rejectError;
        await prisma.$transaction(async (t) => {
          await options.inTransaction?.(t, PRIVATE);
        });
        return { userId: USER, kind, status: 'rejected' };
      },
    ),
  };
  const mediaReview = { viewLinkForObject: jest.fn().mockResolvedValue({ url: 'https://signed', expiresAt: NOW }) };
  const service = new SuspectedIllegalMediaService(
    prisma as never,
    { rejectForSetAside: jest.fn(), afterSetAside: jest.fn() } as never,
    mediaReview as never,
    { suspectedMediaPreserveDays: 365 } as PostMediaConfig,
    { now: () => NOW },
    profileImages as never,
    profileRejections as never,
  );
  return { service, prisma, tx, profileImages, profileRejections, mediaReview };
}

async function outcome(p: Promise<unknown>): Promise<{ status: number; code?: string }> {
  try {
    await p;
    return { status: 200 };
  } catch (e) {
    if (e instanceof HttpException) {
      return { status: e.getStatus(), code: (e.getResponse() as { code?: string }).code };
    }
    throw e;
  }
}

describe('SuspectedIllegalMediaService.setAside: profile pictures and covers', () => {
  it('rejects through the generic path with the file the moderator was shown, and writes the record + audit in the rejection transaction', async () => {
    const h = build();
    const rec = await h.service.setAside(ID, 'a1', { reason: 'why' });

    expect(h.profileRejections.rejectProfileImage).toHaveBeenCalledWith(
      USER,
      'avatar',
      expect.any(String), // the existing generic reason, never the moderator's text
      PRIVATE,
      expect.objectContaining({ keepWithdrawnCopyOnFailure: true, inTransaction: expect.any(Function) }),
    );
    const reasonSent = h.profileRejections.rejectProfileImage.mock.calls[0][2];
    expect(reasonSent).not.toContain('why');

    const data = h.tx.suspectedIllegalMedia.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      mediaId: ID,
      uploaderId: USER,
      postId: null,
      kind: 'profile_avatar',
      objectKey: PRIVATE,
      status: 'set_aside',
      setAsideByAdminId: 'a1',
    });
    expect(data.preserveUntil).toEqual(new Date(NOW.getTime() + 365 * DAY));
    // ONE audit row, no reason text, target type profile_image and target the PERSON
    expect(h.tx.adminActionLog.create).toHaveBeenCalledTimes(1);
    const audit = h.tx.adminActionLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      adminId: 'a1',
      action: 'media.suspected_illegal_set_aside',
      targetType: 'profile_image',
      targetId: USER,
    });
    expect(audit.notes).not.toContain('why');
    expect(rec.suggestedBodies.map((b) => b.key)).toEqual(expect.arrayContaining(['iwf', 'nca']));
  });

  it('a cover is recorded with kind profile_cover', async () => {
    const h = build({ kind: 'cover' });
    await h.service.setAside(`cover:${USER}:${FILE}`, 'a1', { reason: 'r' });
    expect(h.tx.suspectedIllegalMedia.create.mock.calls[0][0].data.kind).toBe('profile_cover');
  });

  it('an already-rejected picture gets the record only: no second rejection, no second notification', async () => {
    const h = build({ status: 'rejected' });
    await h.service.setAside(ID, 'a1', { reason: 'r' });
    expect(h.profileRejections.rejectProfileImage).not.toHaveBeenCalled();
    expect(h.tx.suspectedIllegalMedia.create).toHaveBeenCalledTimes(1);
    expect(h.tx.adminActionLog.create).toHaveBeenCalledTimes(1);
    expect(h.tx.suspectedIllegalMedia.create.mock.calls[0][0].data.objectKey).toBe(PRIVATE);
  });

  it('an already-rejected picture that was replaced meanwhile is a 404 and nothing is recorded', async () => {
    const h = build({ status: 'rejected', liveKey: `private-profile/${USER}/NEW.jpg` });
    expect((await outcome(h.service.setAside(ID, 'a1', { reason: 'r' }))).status).toBe(404);
    expect(h.tx.suspectedIllegalMedia.create).not.toHaveBeenCalled();
  });

  it('a non-vetted admin: 404 for a minor picture, a coded 403 for an adult picture; nothing is rejected or written', async () => {
    const minor = build({ vetted: false, isMinor: true });
    expect(await outcome(minor.service.setAside(ID, 'a1', { reason: 'r' }))).toEqual({ status: 404, code: 'media_not_found' });
    const adult = build({ vetted: false, isMinor: false });
    expect(await outcome(adult.service.setAside(ID, 'a1', { reason: 'r' }))).toEqual({
      status: 403,
      code: 'child_safety_vetting_required',
    });
    for (const h of [minor, adult]) {
      expect(h.profileRejections.rejectProfileImage).not.toHaveBeenCalled();
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it('a stale or unknown id is a 404 and nothing is rejected', async () => {
    const h = build({ locateError: new NotFoundException() });
    expect((await outcome(h.service.setAside(ID, 'a1', { reason: 'r' }))).status).toBe(404);
    expect(h.profileRejections.rejectProfileImage).not.toHaveBeenCalled();
  });

  it('a re-upload between the page load and the click (the rejection finds another file) is a 404 and no record exists', async () => {
    const h = build({ rejectError: new NotFoundException() });
    expect(await outcome(h.service.setAside(ID, 'a1', { reason: 'r' }))).toEqual({ status: 404, code: 'media_not_found' });
    expect(h.tx.suspectedIllegalMedia.create).not.toHaveBeenCalled();
  });

  it('a picture that became rejected between locate and reject (409 from the rejection) reads as stale: 404', async () => {
    const h = build({ rejectError: new ConflictException() });
    expect((await outcome(h.service.setAside(ID, 'a1', { reason: 'r' }))).status).toBe(404);
  });

  it('a 503 while withdrawing a published file is passed through, and nothing is recorded', async () => {
    const h = build({ rejectError: new HttpException({ code: 'media_publish_failed' }, 503) });
    expect(await outcome(h.service.setAside(ID, 'a1', { reason: 'r' }))).toEqual({ status: 503, code: 'media_publish_failed' });
    expect(h.tx.suspectedIllegalMedia.create).not.toHaveBeenCalled();
  });

  it('409 when a record already exists (pre-check) and on the unique-constraint race', async () => {
    const dup = build({ existing: true });
    expect(await outcome(dup.service.setAside(ID, 'a1', { reason: 'r' }))).toEqual({
      status: 409,
      code: 'suspected_illegal_already_recorded',
    });
    expect(dup.profileRejections.rejectProfileImage).not.toHaveBeenCalled();
    const race = build();
    race.tx.suspectedIllegalMedia.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 't' }),
    );
    expect(await outcome(race.service.setAside(ID, 'a1', { reason: 'r' }))).toEqual({
      status: 409,
      code: 'suspected_illegal_already_recorded',
    });
  });

  it('404 for an unknown reportId before anything is touched', async () => {
    const h = build();
    h.prisma.report.findUnique.mockResolvedValue(null);
    expect(await outcome(h.service.setAside(ID, 'a1', { reason: 'r', reportId: 'rep' }))).toEqual({
      status: 404,
      code: 'suspected_illegal_report_not_found',
    });
    expect(h.profileRejections.rejectProfileImage).not.toHaveBeenCalled();
  });

  it('without the profile collaborators wired it is a 404, never a crash', async () => {
    const service = new SuspectedIllegalMediaService(
      {} as never,
      {} as never,
      {} as never,
      { suspectedMediaPreserveDays: 365 } as PostMediaConfig,
      { now: () => NOW },
    );
    expect((await outcome(service.setAside(ID, 'a1', { reason: 'r' }))).status).toBe(404);
  });
});

describe('SuspectedIllegalMediaService.get: profile records', () => {
  it('signs the view link from the record objectKey (no PostMedia lookup)', async () => {
    const h = build();
    h.prisma.suspectedIllegalMedia.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
      args.select.objectKey ? { objectKey: PRIVATE } : recordRow(),
    );
    const detail = await h.service.get('rec1', 'a1');
    expect(h.mediaReview.viewLinkForObject).toHaveBeenCalledWith(PRIVATE);
    expect(h.prisma.postMedia.findUnique).not.toHaveBeenCalled();
    expect(detail).toMatchObject({ kind: 'profile_avatar', mediaId: ID, postId: null, viewUrl: 'https://signed' });
  });

  it('no stored key means no link, not a failure', async () => {
    const h = build();
    h.prisma.suspectedIllegalMedia.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
      args.select.objectKey ? { objectKey: null } : recordRow(),
    );
    await h.service.get('rec1', 'a1');
    expect(h.mediaReview.viewLinkForObject).toHaveBeenCalledWith(null);
  });
});
