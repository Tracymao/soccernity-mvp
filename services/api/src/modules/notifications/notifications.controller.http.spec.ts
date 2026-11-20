import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Exercises the real HTTP layer: routing (that /unread-count and
// /read-all aren't shadowed by /:id/read), DTO validation, and guard
// wiring — following banter.controller.http.spec.ts / messaging's own
// conversations.controller equivalent. No GuardianConsentGuard anywhere
// in this module (nothing here is a "posting" action) — only JwtAuthGuard
// is overridden.
describe('NotificationsController (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };

  const notifications = {
    listNotifications: jest.fn(),
    getUnreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notifications }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /notifications', () => {
    it('delegates to listNotifications(caller, query)', async () => {
      notifications.listNotifications.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });

      const res = await request(app.getHttpServer()).get('/notifications').expect(200);

      expect(notifications.listNotifications).toHaveBeenCalledWith('user-1', {});
      expect(res.body).toEqual({ items: [], nextCursor: null, unreadCount: 0 });
    });

    it('passes cursor and limit through as query params', async () => {
      notifications.listNotifications.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });

      await request(app.getHttpServer()).get('/notifications?cursor=abc&limit=10').expect(200);

      expect(notifications.listNotifications).toHaveBeenCalledWith('user-1', { cursor: 'abc', limit: 10 });
    });

    it('rejects a limit above 50', async () => {
      await request(app.getHttpServer()).get('/notifications?limit=51').expect(400);
      expect(notifications.listNotifications).not.toHaveBeenCalled();
    });

    it('rejects an unknown query param (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer()).get('/notifications?bogus=1').expect(400);
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('is not shadowed by GET /notifications and delegates to getUnreadCount', async () => {
      notifications.getUnreadCount.mockResolvedValue(7);

      const res = await request(app.getHttpServer()).get('/notifications/unread-count').expect(200);

      expect(notifications.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(res.body).toEqual({ unreadCount: 7 });
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('is not shadowed by PATCH /notifications/:id/read and delegates to markAllRead', async () => {
      notifications.markAllRead.mockResolvedValue({ markedRead: 3 });

      const res = await request(app.getHttpServer()).patch('/notifications/read-all').expect(200);

      expect(notifications.markAllRead).toHaveBeenCalledWith('user-1');
      expect(notifications.markRead).not.toHaveBeenCalled();
      expect(res.body).toEqual({ markedRead: 3 });
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('delegates to markRead(caller, id)', async () => {
      notifications.markRead.mockResolvedValue({ id: 'n-1', read: true });

      const res = await request(app.getHttpServer()).patch('/notifications/n-1/read').expect(200);

      expect(notifications.markRead).toHaveBeenCalledWith('user-1', 'n-1');
      expect(res.body).toEqual({ id: 'n-1', read: true });
    });
  });
});
