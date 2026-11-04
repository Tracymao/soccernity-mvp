import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { UsernameReviewController } from './username-review.controller';
import { UsernameReviewService } from './username-review.service';

// HTTP layer of the user's two routes: routing, status codes, the DTO, and the guard set. The shared throttle is
// overridden here; its real behaviour is covered by auth-rate-limit.decorator.spec.ts and the e2e spec.
describe('UsernameReviewController (HTTP layer)', () => {
  let app: INestApplication;
  const service = { getStatus: jest.fn(), createRequest: jest.fn() };
  let signedIn = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsernameReviewController],
      providers: [{ provide: UsernameReviewService, useValue: service }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!signedIn) return false;
          ctx.switchToHttp().getRequest().user = { sub: 'user-1', role: 'user' };
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

  beforeEach(() => {
    signedIn = true;
    service.getStatus.mockResolvedValue({ state: 'none', requestableUntil: null });
    service.createRequest.mockResolvedValue({ state: 'pending', requestableUntil: null });
  });
  afterEach(() => jest.clearAllMocks());

  const url = '/users/me/username-review';

  it('GET returns the state for the signed-in caller only (the id comes from the token)', async () => {
    service.getStatus.mockResolvedValue({ state: 'can_request', requestableUntil: new Date('2026-12-04T00:00:00.000Z') });
    const res = await request(app.getHttpServer()).get(url).expect(200);
    expect(res.body).toEqual({ state: 'can_request', requestableUntil: '2026-12-04T00:00:00.000Z' });
    expect(service.getStatus).toHaveBeenCalledWith('user-1');
  });

  it('POST is a 201 with the new state and passes the message through', async () => {
    const res = await request(app.getHttpServer()).post(url).send({ message: 'Please look again' }).expect(201);
    expect(res.body).toEqual({ state: 'pending', requestableUntil: null });
    expect(service.createRequest).toHaveBeenCalledWith('user-1', 'Please look again');
  });

  it('POST needs no body at all (the message is optional)', async () => {
    await request(app.getHttpServer()).post(url).send({}).expect(201);
    expect(service.createRequest).toHaveBeenCalledWith('user-1', undefined);
  });

  it('POST refuses fields it does not know, and a message that is not a string', async () => {
    await request(app.getHttpServer()).post(url).send({ message: 'x', userId: 'someone-else' }).expect(400);
    await request(app.getHttpServer()).post(url).send({ message: 123 }).expect(400);
    expect(service.createRequest).not.toHaveBeenCalled();
  });

  it('both routes need a signed-in user', async () => {
    signedIn = false;
    await request(app.getHttpServer()).get(url).expect(403);
    await request(app.getHttpServer()).post(url).send({}).expect(403);
    expect(service.getStatus).not.toHaveBeenCalled();
    expect(service.createRequest).not.toHaveBeenCalled();
  });

  // The whole point of the route: the asker has no username and may be restricted-pending, so it must NOT sit behind
  // the consent, email or profile-complete guards (write-route-guards.spec.ts pins the same fact for the whole app).
  it('carries JwtAuthGuard and NONE of the consent / email-verified / profile-complete guards', () => {
    const guards = [
      ...((Reflect.getMetadata(GUARDS_METADATA, UsernameReviewController) as unknown[]) ?? []),
      ...((Reflect.getMetadata(GUARDS_METADATA, UsernameReviewController.prototype.create) as unknown[]) ?? []),
      ...((Reflect.getMetadata(GUARDS_METADATA, UsernameReviewController.prototype.status) as unknown[]) ?? []),
    ];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).not.toContain(GuardianConsentGuard);
    expect(guards).not.toContain(EmailVerifiedGuard);
    expect(guards).not.toContain(ProfileCompleteGuard);
  });

  it('the POST (only) carries the shared auth rate limiter', () => {
    const post = (Reflect.getMetadata(GUARDS_METADATA, UsernameReviewController.prototype.create) as unknown[]) ?? [];
    const get = (Reflect.getMetadata(GUARDS_METADATA, UsernameReviewController.prototype.status) as unknown[]) ?? [];
    expect(post).toContain(AuthThrottlerGuard);
    expect(get).not.toContain(AuthThrottlerGuard);
  });
});
