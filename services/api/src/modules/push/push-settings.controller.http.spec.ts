import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushSettingsController } from './push-settings.controller';
import { PushService } from './push.service';

// backend/b285-web-push: the real HTTP layer (routes, validation, status codes) for the three push settings routes.
describe('PushSettingsController (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  const push = { getStatus: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() };
  const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
  const BODY = { endpoint: ENDPOINT, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PushSettingsController],
      providers: [{ provide: PushService, useValue: push }],
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

  it('GET returns the availability and the public key', async () => {
    push.getStatus.mockReturnValue({ available: true, publicKey: 'PUBLIC' });
    const res = await request(app.getHttpServer()).get('/notification-settings/push').expect(200);
    expect(res.body).toEqual({ available: true, publicKey: 'PUBLIC' });
  });

  it('GET reports unavailable without a key', async () => {
    push.getStatus.mockReturnValue({ available: false });
    const res = await request(app.getHttpServer()).get('/notification-settings/push').expect(200);
    expect(res.body).toEqual({ available: false });
  });

  it('POST subscription passes the body and the token subject to the service (200, idempotent)', async () => {
    push.subscribe.mockResolvedValue({ subscribed: true });
    const res = await request(app.getHttpServer()).post('/notification-settings/push/subscription').send(BODY).expect(200);
    expect(push.subscribe).toHaveBeenCalledWith('user-1', BODY);
    expect(res.body).toEqual({ subscribed: true });
  });

  it('POST subscription rejects an extra key such as userId with 400', async () => {
    await request(app.getHttpServer())
      .post('/notification-settings/push/subscription')
      .send({ ...BODY, userId: 'user-2' })
      .expect(400);
    expect(push.subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', {}],
    ['a non-https endpoint', { ...BODY, endpoint: 'http://fcm.googleapis.com/x' }],
    ['a non-url endpoint', { ...BODY, endpoint: 'nope' }],
    ['a too-long endpoint', { ...BODY, endpoint: `https://fcm.googleapis.com/${'a'.repeat(2100)}` }],
    ['missing keys', { endpoint: ENDPOINT }],
    ['an empty p256dh', { endpoint: ENDPOINT, keys: { p256dh: '', auth: 'a' } }],
    ['a missing auth', { endpoint: ENDPOINT, keys: { p256dh: 'p' } }],
    ['a non-string auth', { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 5 } }],
    ['an oversize key', { endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(300), auth: 'a' } }],
  ])('POST subscription rejects %s with 400', async (_name, body) => {
    await request(app.getHttpServer()).post('/notification-settings/push/subscription').send(body).expect(400);
    expect(push.subscribe).not.toHaveBeenCalled();
  });

  it('DELETE subscription removes by endpoint for the token subject (204)', async () => {
    push.unsubscribe.mockResolvedValue(undefined);
    await request(app.getHttpServer()).delete('/notification-settings/push/subscription').send({ endpoint: ENDPOINT }).expect(204);
    expect(push.unsubscribe).toHaveBeenCalledWith('user-1', ENDPOINT);
  });

  it('DELETE subscription rejects a missing or bad endpoint with 400', async () => {
    await request(app.getHttpServer()).delete('/notification-settings/push/subscription').send({}).expect(400);
    await request(app.getHttpServer()).delete('/notification-settings/push/subscription').send({ endpoint: 'nope' }).expect(400);
    expect(push.unsubscribe).not.toHaveBeenCalled();
  });
});
