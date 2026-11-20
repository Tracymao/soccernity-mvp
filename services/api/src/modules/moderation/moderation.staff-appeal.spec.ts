import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { reportClosedAt } from '../account-hold/account-hold.rules';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import {
  APPEAL_RECORDER_CANNOT_DECIDE_CODE,
  APPEAL_WINDOW_CLOSED_CODE,
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  REPORTED_ACCOUNT_UNAVAILABLE_CODE,
  STAFF_APPEAL_NOT_APPLICABLE_CODE,
} from './moderation.constants';
import { ModerationService } from './moderation.service';

// backend/b292-staff-recorded-appeal (B-292, Decision Log #485 (f), #492). Staff record an appeal on the reported
// person's behalf; the recorder may not decide it. Mocked Prisma.

const DAY = 24 * 60 * 60 * 1000;

function build(opts: {
  report?: Record<string, unknown> | null;
  vetted?: boolean;
  reportedUser?: { accountStatus: string } | null;
  postAuthor?: string | null;
  updateCount?: number;
} = {}) {
  const report =
    opts.report === null
      ? null
      : {
          id: 'report-1',
          reporterId: 'u-reporter',
          targetType: 'post',
          targetId: 'post-1',
          status: 'actioned',
          actionTaken: 'user_suspended',
          concernsMinor: false,
          appealStatus: null,
          appealRecordedByAdminId: null,
          reviewedByAdminId: 'admin-actioner',
          reviewedAt: new Date(Date.now() - DAY),
          ...opts.report,
        };
  const record = jest.fn().mockResolvedValue(undefined);
  const notifyInBackground = jest.fn();
  const sendAppealDecisionEmail = jest.fn();
  const prisma = {
    report: {
      findUnique: jest.fn().mockResolvedValue(report),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
      update: jest.fn(),
    },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? false, id: 'admin-recorder', fullName: 'Rae Recorder' }) },
    post: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.postAuthor === null ? null : { authorId: opts.postAuthor ?? 'u-author' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.reportedUser === undefined ? { accountStatus: 'suspended' } : opts.reportedUser),
    },
    notification: { create: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService & {
    report: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    adminUser: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  const service = new ModerationService(
    prisma,
    { sendAppealDecisionEmail, sendReportActionedEmail: jest.fn() } as never,
    { record } as never,
    { setRoomStatus: jest.fn() } as never,
    { notifyInBackground } as never,
    { applyReinstatementInTx: jest.fn(), completeReinstatement: jest.fn() } as never,
  );
  return { prisma, service, record, notifyInBackground, sendAppealDecisionEmail };
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

const dto = { reason: 'They asked us by email to appeal the suspension.' };

describe('ModerationService.recordAppealOnBehalf (B-292)', () => {
  it('writes pending, the reason, the time and the recorder in one guarded update, and audits without the reason', async () => {
    const { service, prisma, record, notifyInBackground, sendAppealDecisionEmail } = build();
    // The read after the write returns the recorded row.
    const original = prisma.report.findUnique.getMockImplementation()!;
    prisma.report.findUnique
      .mockImplementationOnce(original)
      .mockResolvedValueOnce({ id: 'report-1', appealRecordedByAdminId: 'admin-recorder', targetType: 'post' });

    const result = await service.recordAppealOnBehalf('report-1', 'admin-recorder', dto);

    expect(prisma.report.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.report.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'report-1', status: 'actioned', appealStatus: null });
    expect(call.data).toEqual({
      appealStatus: 'pending',
      appealReason: dto.reason,
      appealedAt: expect.any(Date),
      appealRecordedByAdminId: 'admin-recorder',
    });
    expect(record).toHaveBeenCalledWith(
      'admin-recorder',
      ADMIN_ACTION_LOG_ACTIONS.REPORT_APPEAL_RECORDED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      'report-1',
      'pending',
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain(dto.reason);
    expect(result).toMatchObject({ appealRecordedByStaff: true });
    // Nothing is sent to the reported person.
    expect(notifyInBackground).not.toHaveBeenCalled();
    expect(sendAppealDecisionEmail).not.toHaveBeenCalled();
    expect((prisma as unknown as { notification: { create: jest.Mock } }).notification.create).not.toHaveBeenCalled();
  });

  it('404s for a missing report before anything else', async () => {
    const { service, prisma } = build({ report: null });
    expect(await caught(service.recordAppealOnBehalf('nope', 'admin-recorder', dto))).toBeInstanceOf(NotFoundException);
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('a concernsMinor report needs a vetted admin (checked before every status rule)', async () => {
    const { service, prisma } = build({ report: { concernsMinor: true, status: 'open' } });
    const err = await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: CHILD_SAFETY_VETTING_REQUIRED_CODE });
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('a vetted admin may record on a concernsMinor report', async () => {
    const { service, prisma } = build({ report: { concernsMinor: true }, vetted: true });
    await service.recordAppealOnBehalf('report-1', 'admin-recorder', dto);
    expect(prisma.report.updateMany).toHaveBeenCalled();
  });

  it('403s when the report is not actioned (same message as appealReport)', async () => {
    const { service } = build({ report: { status: 'open' } });
    const err = await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe('Only an actioned report may be appealed');
  });

  it.each(['content_removed', 'warning_issued', 'room_deactivated'])('400 staff_appeal_not_applicable for %s', async (action) => {
    const { service, prisma } = build({ report: { actionTaken: action } });
    const err = await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto));
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ code: STAFF_APPEAL_NOT_APPLICABLE_CODE });
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it.each(['pending', 'upheld'])('409s when an appeal already exists (%s)', async (appealStatus) => {
    const { service } = build({ report: { appealStatus } });
    expect(await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto))).toBeInstanceOf(ConflictException);
  });

  it.each([
    ['no reported account behind the target', { postAuthor: null }],
    ['the reported account row is gone', { reportedUser: null }],
    ['the reported account is anonymised', { reportedUser: { accountStatus: 'deleted' } }],
  ])('409 reported_account_unavailable when %s', async (_label, opts) => {
    const { service, prisma } = build(opts as never);
    const err = await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto));
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: REPORTED_ACCOUNT_UNAVAILABLE_CODE });
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('403 appeal_window_closed once the window has lapsed, with the same message as appealReport', async () => {
    const { service, prisma } = build({ report: { reviewedAt: new Date(Date.now() - 400 * DAY) } });
    const err = await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: APPEAL_WINDOW_CLOSED_CODE,
      message: 'The time allowed for appealing this report has passed.',
    });
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('a lost race (another admin recorded first) is the same 409, and nothing is audited', async () => {
    const { service, record } = build({ updateCount: 0 });
    expect(await caught(service.recordAppealOnBehalf('report-1', 'admin-recorder', dto))).toBeInstanceOf(ConflictException);
    expect(record).not.toHaveBeenCalled();
  });
});

describe('ModerationService.decideAppeal: the recorder may not decide (B-292)', () => {
  const pending = { status: 'actioned', appealStatus: 'pending', appealRecordedByAdminId: 'admin-recorder' };

  it('403 appeal_recorder_cannot_decide for the admin who recorded the appeal', async () => {
    const { service, prisma } = build({ report: pending });
    const err = await caught(service.decideAppeal('report-1', 'admin-recorder', { decision: 'upheld' } as never));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: APPEAL_RECORDER_CANNOT_DECIDE_CODE });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the original actioner is still refused (#138 unchanged)', async () => {
    const { service } = build({ report: pending });
    const err = await caught(service.decideAppeal('report-1', 'admin-actioner', { decision: 'upheld' } as never));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe('The admin who actioned this report may not also review its appeal');
  });

  it('a third admin passes both rules and reaches the decision transaction', async () => {
    const { service, prisma } = build({ report: pending });
    (prisma.$transaction as jest.Mock).mockResolvedValue({ id: 'report-1' });
    await service.decideAppeal('report-1', 'admin-third', { decision: 'upheld' } as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('getReportById / listReports surface appealRecordedByStaff (B-292)', () => {
  it('the detail carries the boolean and the recording admin id and name', async () => {
    const { service, prisma } = build({ report: { appealStatus: 'pending', appealRecordedByAdminId: 'admin-recorder' } });
    const detail = await service.getReportById('report-1', 'admin-x');
    expect(detail.appealRecordedByStaff).toBe(true);
    expect(detail.appealRecordedBy).toMatchObject({ id: 'admin-recorder', fullName: 'Rae Recorder' });
    expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-recorder' },
      select: { id: true, fullName: true },
    });
  });

  it('a self-filed appeal is false with a null recorder and no admin lookup for it', async () => {
    const { service, prisma } = build({ report: { appealStatus: 'pending' } });
    const detail = await service.getReportById('report-1', 'admin-x');
    expect(detail.appealRecordedByStaff).toBe(false);
    expect(detail.appealRecordedBy).toBeNull();
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('each queue row carries the boolean', async () => {
    const { service, prisma } = build({ vetted: true });
    (prisma.report as unknown as { findMany: jest.Mock }).findMany = jest.fn().mockResolvedValue([
      { id: 'a', targetType: 'post', createdAt: new Date(), appealRecordedByAdminId: 'admin-recorder' },
      { id: 'b', targetType: 'post', createdAt: new Date(), appealRecordedByAdminId: null },
    ]);
    const page = await service.listReports({} as never, 'admin-x');
    expect(page.items.map((i) => i.appealRecordedByStaff)).toEqual([true, false]);
  });
});

describe('a pending staff-recorded appeal pauses the closure clock (B-292)', () => {
  it('reportClosedAt is null while the appeal is pending, so the retention sweep never sees it as due', () => {
    const reviewedAt = new Date('2026-01-01T00:00:00Z');
    const base = { status: 'actioned', reviewedAt, appealReviewedAt: null };
    expect(reportClosedAt({ ...base, appealStatus: null } as never, 30)).not.toBeNull();
    expect(reportClosedAt({ ...base, appealStatus: 'pending' } as never, 30)).toBeNull();
  });
});
