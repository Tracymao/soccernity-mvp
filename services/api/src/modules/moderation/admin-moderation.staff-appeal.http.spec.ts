import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AccountSuspensionService } from '../account-suspension/account-suspension.service';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { BanterService } from '../banter/banter.service';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import { AdminModerationController } from './admin-moderation.controller';
import { ModerationHoldsService } from './moderation-holds.service';
import { ModerationService } from './moderation.service';

// B-292: POST /admin/moderation/reports/:id/appeal through the real controller, the real AdminRolesGuard and the real
// ModerationService over a fake Prisma. Body validation, role gate, and the success shape.
describe('AdminModerationController: staff-recorded appeal (HTTP layer)', () => {
  let app: INestApplication;
  let role = 'moderator';
  const actioned = {
    id: 'report-1',
    reporterId: 'u-reporter',
    targetType: 'user',
    targetId: 'u-target',
    status: 'actioned',
    actionTaken: 'user_suspended',
    concernsMinor: false,
    appealStatus: null,
    appealRecordedByAdminId: null,
    reviewedByAdminId: 'admin-actioner',
    reviewedAt: new Date(),
  };
  const prisma = {
    report: { findUnique: jest.fn(), updateMany: jest.fn() },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: false }) },
    user: { findUnique: jest.fn() },
  };
  const record = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminModerationController],
      providers: [
        ModerationService,
        AdminRolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: RegistrationEmailService, useValue: {} },
        { provide: AdminActionLogService, useValue: { record } },
        { provide: BanterService, useValue: {} },
        { provide: GuardianSecurityNoticeService, useValue: { notifyInBackground: jest.fn() } },
        { provide: AccountSuspensionService, useValue: {} },
        { provide: ModerationHoldsService, useValue: { listActiveHoldsForReport: jest.fn() } },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = { sub: 'admin-recorder', role, aud: 'admin-console' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    role = 'moderator';
    record.mockReset();
    prisma.report.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.report.findUnique
      .mockReset()
      .mockResolvedValueOnce(actioned)
      .mockResolvedValueOnce({ ...actioned, appealStatus: 'pending', appealRecordedByAdminId: 'admin-recorder' });
    // resolveReportedUserId, then the status lookup
    prisma.user.findUnique.mockReset().mockResolvedValueOnce({ id: 'u-target' }).mockResolvedValueOnce({ accountStatus: 'suspended' });
  });

  it('201 with the pending appeal and appealRecordedByStaff', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/moderation/reports/report-1/appeal')
      .send({ reason: 'Asked by email' })
      .expect(201);
    expect(res.body).toMatchObject({ appealStatus: 'pending', appealRecordedByAdminId: 'admin-recorder', appealRecordedByStaff: true });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing reason', {}],
    ['empty reason', { reason: '' }],
    ['501-character reason', { reason: 'x'.repeat(501) }],
    ['an extra field', { reason: 'ok', appealRecordedByAdminId: 'someone-else' }],
  ])('400 for %s and nothing is written', async (_label, body) => {
    await request(app.getHttpServer()).post('/admin/moderation/reports/report-1/appeal').send(body).expect(400);
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('accepts a 500-character reason', async () => {
    await request(app.getHttpServer())
      .post('/admin/moderation/reports/report-1/appeal')
      .send({ reason: 'x'.repeat(500) })
      .expect(201);
  });

  it('an editor gets 403 and nothing is written', async () => {
    role = 'editor';
    await request(app.getHttpServer()).post('/admin/moderation/reports/report-1/appeal').send({ reason: 'ok' }).expect(403);
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });
});
