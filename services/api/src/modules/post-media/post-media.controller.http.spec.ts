import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PostMediaController } from './post-media.controller';
import { PostMediaService } from './post-media.service';

describe('PostMediaController (HTTP layer, B-041)', () => {
  let app: INestApplication;
  const media = { createUpload: jest.fn(), confirmUpload: jest.fn(), getOwnUpload: jest.fn(), deleteOwnUpload: jest.fn() };
  const CALLER = { sub: 'me', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PostMediaController],
      providers: [{ provide: PostMediaService, useValue: media }],
    })
      // Guard behaviour: write-route-guards.spec.ts pins which guards sit on each route.
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  it('POST /media/uploads passes the TOKEN subject and the declared type and size', async () => {
    media.createUpload.mockResolvedValue({ id: 'u1' });
    const res = await request(app.getHttpServer()).post('/media/uploads').send({ contentType: 'video/mp4', size: 5000 }).expect(201);
    expect(res.body).toEqual({ id: 'u1' });
    expect(media.createUpload).toHaveBeenCalledWith('me', { contentType: 'video/mp4', size: 5000 });
  });

  it.each([
    ['a GIF', { contentType: 'image/gif', size: 10 }],
    ['an unknown type', { contentType: 'application/pdf', size: 10 }],
    ['a missing size', { contentType: 'image/png' }],
    ['a zero size', { contentType: 'image/png', size: 0 }],
    ['a fractional size', { contentType: 'image/png', size: 10.5 }],
    ['a string size', { contentType: 'image/png', size: '10' }],
    ['a caller-chosen owner', { contentType: 'image/png', size: 10, uploaderId: 'someone-else' }],
    ['a caller-chosen key', { contentType: 'image/png', size: 10, quarantineKey: 'x' }],
    ['a caller-chosen status', { contentType: 'image/png', size: 10, status: 'approved' }],
  ])('POST /media/uploads rejects %s with 400', async (_n, body) => {
    await request(app.getHttpServer()).post('/media/uploads').send(body).expect(400);
    expect(media.createUpload).not.toHaveBeenCalled();
  });

  it('POST /media/uploads/:id/confirm is a 200 for the caller', async () => {
    media.confirmUpload.mockResolvedValue({ id: 'u1', uploadState: 'ready' });
    await request(app.getHttpServer()).post('/media/uploads/u1/confirm').expect(200);
    expect(media.confirmUpload).toHaveBeenCalledWith('me', 'u1');
  });

  it('GET /media/uploads/:id returns the caller\'s own view', async () => {
    media.getOwnUpload.mockResolvedValue({ id: 'u1', status: 'pending' });
    const res = await request(app.getHttpServer()).get('/media/uploads/u1').expect(200);
    expect(res.body).toEqual({ id: 'u1', status: 'pending' });
    expect(media.getOwnUpload).toHaveBeenCalledWith('me', 'u1');
  });

  it('DELETE /media/uploads/:id is a 204 for the caller', async () => {
    media.deleteOwnUpload.mockResolvedValue(undefined);
    await request(app.getHttpServer()).delete('/media/uploads/u1').expect(204);
    expect(media.deleteOwnUpload).toHaveBeenCalledWith('me', 'u1');
  });
});
