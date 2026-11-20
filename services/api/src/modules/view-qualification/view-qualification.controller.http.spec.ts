import { ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewQualificationController } from './view-qualification.controller';
import { ViewQualificationService } from './view-qualification.service';

// HTTP-layer coverage for POST /posts/:id/view-heartbeat (B-093): DTO validation and wiring. The
// credit rules are in view-session.util.spec.ts, the service flow in view-qualification.service.spec.ts.
describe('ViewQualificationController (HTTP layer)', () => {
  let app: INestApplication;
  const views = { heartbeat: jest.fn() };
  const CALLER = { sub: 'viewer-1', role: 'fan' };
  const SESSION = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ViewQualificationController],
      providers: [{ provide: ViewQualificationService, useValue: views }],
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

  beforeEach(() => {
    views.heartbeat.mockReset().mockResolvedValue({ done: false });
  });

  it('passes the authenticated viewer, the post and the validated body to the service, and answers 200', async () => {
    await request(app.getHttpServer())
      .post('/posts/post-1/view-heartbeat')
      .send({ sessionId: SESSION, active: true, positionSeconds: 4.5, durationSeconds: 30 })
      .expect(200, { done: false });
    expect(views.heartbeat).toHaveBeenCalledWith('viewer-1', 'post-1', {
      sessionId: SESSION,
      active: true,
      positionSeconds: 4.5,
      durationSeconds: 30,
    });
  });

  it('accepts a photo beat with no playhead', async () => {
    await request(app.getHttpServer())
      .post('/posts/post-1/view-heartbeat')
      .send({ sessionId: SESSION, active: false })
      .expect(200);
  });

  it.each([
    ['a missing sessionId', { active: true }],
    ['a sessionId that is not a UUID', { sessionId: 'abc', active: true }],
    ['a missing active flag', { sessionId: SESSION }],
    ['an active flag that is not a boolean', { sessionId: SESSION, active: 'yes' }],
    ['a negative playhead', { sessionId: SESSION, active: true, positionSeconds: -1 }],
    ['an absurd playhead', { sessionId: SESSION, active: true, positionSeconds: 10 ** 9 }],
    ['a duration below half a second', { sessionId: SESSION, active: true, durationSeconds: 0.1 }],
    ['a client-claimed "watched seconds" (the server keeps the clock)', { sessionId: SESSION, active: true, watchedSeconds: 60 }],
  ])('rejects %s with a 400 and never reaches the service', async (_label, body) => {
    await request(app.getHttpServer()).post('/posts/post-1/view-heartbeat').send(body).expect(400);
    expect(views.heartbeat).not.toHaveBeenCalled();
  });

  it('surfaces the service\'s 404 (a post this viewer may not see)', async () => {
    views.heartbeat.mockRejectedValue(new NotFoundException('Post not found'));
    await request(app.getHttpServer())
      .post('/posts/nope/view-heartbeat')
      .send({ sessionId: SESSION, active: true })
      .expect(404);
  });

  it('carries only JwtAuthGuard: looking at a post is not a social write, so no consent / email guard', () => {
    const guards: unknown[] = Reflect.getMetadata(
      '__guards__',
      ViewQualificationController.prototype.heartbeat,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).not.toContain(GuardianConsentGuard);
    expect(guards).not.toContain(EmailVerifiedGuard);
  });
});
