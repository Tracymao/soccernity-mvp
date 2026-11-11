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
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from './moderation.constants';
import { ModerationService } from './moderation.service';

// B-297 (Decision Log #491): the REAL ModerationService behind the real controller and the real AdminRolesGuard, over
// a fake Prisma. An unvetted moderator acting on a message report whose sender is under 18 gets the coded 403 on both
// PATCH routes, and nothing is written.
describe('AdminModerationController: vetting to act on a child-involved message report (HTTP layer)', () => {
  let app: INestApplication;
  const report = {
    id: 'report-1',
    reporterId: 'u-reporter',
    targetType: 'message',
    targetId: '11111111-1111-4111-8111-111111111111',
    status: 'open',
    concernsMinor: false,
    appealStatus: 'pending',
    reviewedByAdminId: 'admin-original',
  };
  const prisma = {
    report: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: false }) },
    message: {
      findUnique: jest.fn().mockResolvedValue({ senderId: 'u-sender', conversation: { participantIds: ['u-reporter', 'u-sender'] } }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u-reporter', isMinor: false },
        { id: 'u-sender', isMinor: true },
      ]),
    },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminModerationController],
      providers: [
        ModerationService,
        AdminRolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: RegistrationEmailService, useValue: {} },
        { provide: AdminActionLogService, useValue: { record: jest.fn() } },
        { provide: BanterService, useValue: {} },
        { provide: GuardianSecurityNoticeService, useValue: { notifyInBackground: jest.fn() } },
        { provide: AccountSuspensionService, useValue: {} },
        { provide: ModerationHoldsService, useValue: { listActiveHoldsForReport: jest.fn() } },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
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
    prisma.report.findUnique.mockReset().mockResolvedValue(report);
    prisma.$transaction.mockReset();
    prisma.report.update.mockReset();
  });

  it('PATCH /admin/moderation/reports/:id is a 403 with the vetting code and writes nothing', async () => {
    const res = await request(app.getHttpServer())
      .patch('/admin/moderation/reports/report-1')
      .send({ action: 'user_suspended' })
      .expect(403);
    expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.report.update).not.toHaveBeenCalled();
  });

  it('PATCH /admin/moderation/reports/:id/appeal is a 403 with the vetting code and writes nothing', async () => {
    const res = await request(app.getHttpServer())
      .patch('/admin/moderation/reports/report-1/appeal')
      .send({ decision: 'overturned' })
      .expect(403);
    expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.report.update).not.toHaveBeenCalled();
  });
});
