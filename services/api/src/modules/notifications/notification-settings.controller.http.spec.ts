import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';

// backend/b062-notification-preferences: the real HTTP layer for GET and PATCH /notification-settings.
describe('NotificationSettingsController (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  const settings = { get: jest.fn(), update: jest.fn() };
  const STORED = { qualityFilter: false, muteNonFollowing: false, muteNonFollowers: false, muteNewAccounts: false };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationSettingsController],
      providers: [{ provide: NotificationSettingsService, useValue: settings }],
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  it('GET returns the settings of the token subject', async () => {
    settings.get.mockResolvedValue(STORED);
    const res = await request(app.getHttpServer()).get('/notification-settings').expect(200);
    expect(settings.get).toHaveBeenCalledWith('user-1');
    expect(res.body).toEqual(STORED);
  });

  it('PATCH passes a partial body through for the token subject', async () => {
    settings.update.mockResolvedValue({ ...STORED, muteNewAccounts: true });
    const res = await request(app.getHttpServer()).patch('/notification-settings').send({ muteNewAccounts: true }).expect(200);
    expect(settings.update).toHaveBeenCalledWith('user-1', { muteNewAccounts: true });
    expect(res.body.muteNewAccounts).toBe(true);
  });

  it('PATCH accepts all four booleans and false values', async () => {
    settings.update.mockResolvedValue(STORED);
    await request(app.getHttpServer())
      .patch('/notification-settings')
      .send({ qualityFilter: false, muteNonFollowing: true, muteNonFollowers: false, muteNewAccounts: true })
      .expect(200);
    expect(settings.update).toHaveBeenCalledWith('user-1', {
      qualityFilter: false,
      muteNonFollowing: true,
      muteNonFollowers: false,
      muteNewAccounts: true,
    });
  });

  it.each([
    [{ qualityFilter: 'yes' }],
    [{ muteNonFollowing: 1 }],
    [{ muteNonFollowers: null }],
    [{ muteNewAccounts: 'true' }],
    [{ somethingElse: true }],
    [{ userId: 'user-2' }],
  ])('PATCH rejects %j', async (body) => {
    await request(app.getHttpServer()).patch('/notification-settings').send(body).expect(400);
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('PATCH with an empty body is accepted and writes nothing new', async () => {
    settings.update.mockResolvedValue(STORED);
    await request(app.getHttpServer()).patch('/notification-settings').send({}).expect(200);
    expect(settings.update).toHaveBeenCalledWith('user-1', {});
  });
});
