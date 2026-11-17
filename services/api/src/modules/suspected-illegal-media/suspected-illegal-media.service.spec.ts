import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostMediaConfig } from '../post-media/post-media.config';
import { SuspectedIllegalMediaService } from './suspected-illegal-media.service';

// backend/suspected-illegal-imagery-path (B-206). The service with Prisma and its collaborators faked.
const NOW = new Date('2026-12-15T10:00:00Z');
const DAY = 24 * 3600 * 1000;
const MEDIA = '3b241101-e2bb-4255-8caf-4136c566a962';

function recordRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rec1',
    mediaId: MEDIA,
    uploaderId: 'u1',
    postId: 'p1',
    reportId: null,
    kind: 'image',
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
  minorItem?: boolean;
  itemExists?: boolean;
  existing?: boolean;
  days?: number;
}

function build(opts: Opts = {}) {
  const vetted = opts.vetted ?? true;
  const tx = {
    suspectedIllegalMedia: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ? { id: 'rec0' } : null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => recordRow(data)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(async () => recordRow({ status: 'filed' })),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ isMinor: true, derivedCountry: 'GB', declaredCountry: 'NG' }),
    },
    adminActionLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: vetted }) },
    postMedia: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.itemExists === false ? null : { uploader: { isMinor: opts.minorItem ?? false } }),
      findUnique: jest.fn().mockResolvedValue({ publishedAt: null, publicKey: null, privateKey: 'private-media/u1/m.jpg' }),
    },
    report: { findUnique: jest.fn().mockResolvedValue({ id: 'rep' }) },
    suspectedIllegalMedia: {
      findMany: jest.fn().mockResolvedValue([recordRow()]),
      findUnique: jest.fn().mockResolvedValue(recordRow()),
    },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const decisions = {
    rejectForSetAside: jest.fn().mockResolvedValue({
      changed: true,
      uploaderId: 'u1',
      postId: 'p1',
      kind: 'image',
      objectKey: 'private-media/u1/m.jpg',
    }),
    afterSetAside: jest.fn().mockResolvedValue(undefined),
  };
  const mediaReview = { viewLinkForObject: jest.fn().mockResolvedValue({ url: 'https://signed', expiresAt: NOW }) };
  const config = { suspectedMediaPreserveDays: opts.days ?? 365 } as PostMediaConfig;
  const service = new SuspectedIllegalMediaService(
    prisma as never,
    decisions as never,
    mediaReview as never,
    config,
    { now: () => NOW },
  );
  return { service, prisma, tx, decisions, mediaReview };
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

describe('SuspectedIllegalMediaService.setAside', () => {
  it('rejects the file, writes the record with preserveUntil = now + 365 days and the audit row, in ONE transaction', async () => {
    const h = build();
    const rec = await h.service.setAside(MEDIA, 'a1', { reason: 'why' });
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.decisions.rejectForSetAside).toHaveBeenCalledWith(h.tx, MEDIA, 'a1', NOW);
    const data = h.tx.suspectedIllegalMedia.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      mediaId: MEDIA,
      uploaderId: 'u1',
      postId: 'p1',
      status: 'set_aside',
      setAsideByAdminId: 'a1',
      uploaderCountry: 'GB',
      uploaderIsMinor: true,
    });
    expect(data.preserveUntil).toEqual(new Date(NOW.getTime() + 365 * DAY));
    expect(h.tx.adminActionLog.create).toHaveBeenCalledTimes(1);
    const audit = h.tx.adminActionLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      adminId: 'a1',
      action: 'media.suspected_illegal_set_aside',
      targetId: MEDIA,
    });
    expect(audit.notes).not.toContain('why');
    expect(h.decisions.afterSetAside).toHaveBeenCalledWith(MEDIA, 'u1', true);
    expect(rec.suggestedBodies.map((b) => b.key)).toEqual(expect.arrayContaining(['iwf', 'nca']));
  });

  it('uses the configured preservation period and falls back from derived to declared country', async () => {
    const h = build({ days: 30 });
    h.tx.user.findUnique.mockResolvedValue({ isMinor: false, derivedCountry: null, declaredCountry: 'US' });
    await h.service.setAside(MEDIA, 'a1', { reason: 'r' });
    const data = h.tx.suspectedIllegalMedia.create.mock.calls[0][0].data;
    expect(data.preserveUntil).toEqual(new Date(NOW.getTime() + 30 * DAY));
    expect(data.uploaderCountry).toBe('US');
  });

  it('a non-vetted admin: 404 for a minor item and a missing item, a coded 403 for an adult item; nothing written', async () => {
    const minor = build({ vetted: false, minorItem: true });
    expect(await outcome(minor.service.setAside(MEDIA, 'a1', { reason: 'r' }))).toEqual({
      status: 404,
      code: 'media_not_found',
    });
    const missing = build({ vetted: false, itemExists: false });
    expect((await outcome(missing.service.setAside(MEDIA, 'a1', { reason: 'r' }))).status).toBe(404);
    const adult = build({ vetted: false, minorItem: false });
    expect(await outcome(adult.service.setAside(MEDIA, 'a1', { reason: 'r' }))).toEqual({
      status: 403,
      code: 'child_safety_vetting_required',
    });
    for (const h of [minor, missing, adult]) expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404 for an unknown media id (vetted admin) and for a profile-picture id when the profile services are not wired (covered with them in the .profile spec)', async () => {
    const h = build();
    h.decisions.rejectForSetAside.mockRejectedValue(new HttpException({ code: 'media_not_found' }, 404));
    expect((await outcome(h.service.setAside(MEDIA, 'a1', { reason: 'r' }))).status).toBe(404);
    const p = build();
    expect((await outcome(p.service.setAside('avatar:u1:file.jpg', 'a1', { reason: 'r' }))).status).toBe(404);
    expect(p.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404 for an unknown reportId before anything is written', async () => {
    const h = build();
    h.prisma.report.findUnique.mockResolvedValue(null);
    expect(await outcome(h.service.setAside(MEDIA, 'a1', { reason: 'r', reportId: 'rep' }))).toEqual({
      status: 404,
      code: 'suspected_illegal_report_not_found',
    });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('409 when a record already exists, including the unique-constraint race', async () => {
    const dup = build({ existing: true });
    expect(await outcome(dup.service.setAside(MEDIA, 'a1', { reason: 'r' }))).toEqual({
      status: 409,
      code: 'suspected_illegal_already_recorded',
    });
    expect(dup.decisions.afterSetAside).not.toHaveBeenCalled();
    const race = build();
    race.tx.suspectedIllegalMedia.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 't' }),
    );
    expect(await outcome(race.service.setAside(MEDIA, 'a1', { reason: 'r' }))).toEqual({
      status: 409,
      code: 'suspected_illegal_already_recorded',
    });
  });
});

describe('SuspectedIllegalMediaService filing records', () => {
  it('every read and decision needs a vetted admin (coded 403)', async () => {
    const h = build({ vetted: false });
    for (const p of [
      h.service.list({}, 'a1'),
      h.service.get('rec1', 'a1'),
      h.service.recordFiled('rec1', 'a1', { bodyKey: 'iwf', reference: 'x' }),
      h.service.recordNotFiled('rec1', 'a1', { reason: 'a long enough reason' }),
    ]) {
      expect(await outcome(p)).toEqual({ status: 403, code: 'child_safety_vetting_required' });
    }
  });

  it('list pages by setAsideAt/id and returns suggestions; detail adds the signed link', async () => {
    const h = build();
    const page = await h.service.list({ limit: 1 }, 'a1');
    expect(page.items[0].suggestedBodies.length).toBeGreaterThan(0);
    const d = await h.service.get('rec1', 'a1');
    expect(d.viewUrl).toBe('https://signed');
    expect(h.mediaReview.viewLinkForObject).toHaveBeenCalledWith('private-media/u1/m.jpg');
  });

  it('filed: guarded update on status=set_aside, audit row without the reference or note', async () => {
    const h = build();
    await h.service.recordFiled('rec1', 'a1', { bodyKey: 'iwf', reference: 'SECRET-REF', note: 'secret note' });
    expect(h.tx.suspectedIllegalMedia.updateMany.mock.calls[0][0].where).toEqual({ id: 'rec1', status: 'set_aside' });
    const audit = h.tx.adminActionLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('media.suspected_illegal_filed');
    expect(JSON.stringify(audit)).not.toMatch(/SECRET-REF|secret note/);
  });

  it("filed: 'other' needs a body name, and a future filing time is refused", async () => {
    const h = build();
    expect(await outcome(h.service.recordFiled('rec1', 'a1', { bodyKey: 'other', reference: 'x' }))).toEqual({
      status: 400,
      code: 'suspected_illegal_body_other_required',
    });
    expect(
      await outcome(
        h.service.recordFiled('rec1', 'a1', {
          bodyKey: 'iwf',
          reference: 'x',
          filedAt: new Date(NOW.getTime() + DAY).toISOString(),
        }),
      ),
    ).toEqual({ status: 400, code: 'suspected_illegal_filed_at_invalid' });
  });

  it('409 when already decided, 404 when unknown', async () => {
    const decided = build();
    decided.tx.suspectedIllegalMedia.updateMany.mockResolvedValue({ count: 0 });
    decided.tx.suspectedIllegalMedia.findUnique.mockResolvedValue({ id: 'rec1' });
    expect(
      await outcome(decided.service.recordNotFiled('rec1', 'a1', { reason: 'a long enough reason' })),
    ).toEqual({ status: 409, code: 'suspected_illegal_already_decided' });
    const gone = build();
    gone.tx.suspectedIllegalMedia.updateMany.mockResolvedValue({ count: 0 });
    gone.tx.suspectedIllegalMedia.findUnique.mockResolvedValue(null);
    expect((await outcome(gone.service.recordFiled('nope', 'a1', { bodyKey: 'iwf', reference: 'x' }))).status).toBe(404);
  });

  it('not-filed records the reason on the record and an audit row without the text', async () => {
    const h = build();
    await h.service.recordNotFiled('rec1', 'a1', { reason: 'the reason text here' });
    expect(h.tx.suspectedIllegalMedia.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'not_filed',
      notFiledReason: 'the reason text here',
      decidedByAdminId: 'a1',
    });
    expect(JSON.stringify(h.tx.adminActionLog.create.mock.calls[0][0].data)).not.toContain('the reason text here');
  });
});
