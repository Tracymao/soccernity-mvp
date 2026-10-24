import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlockController } from './block.controller';
import { BlockService } from './block.service';

describe('BlockController (HTTP layer, B-039)', () => {
  let app: INestApplication;
  const blocks = { blockUser: jest.fn(), unblockUser: jest.fn(), listBlocked: jest.fn() };
  const CALLER = { sub: 'me', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BlockController],
      providers: [{ provide: BlockService, useValue: blocks }],
    })
      // Guard behaviour: write-route-guards.spec.ts pins which guards sit on each route.
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
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

  it('POST /users/:id/block is a 200 and passes the TOKEN subject, the target and the reason', async () => {
    blocks.blockUser.mockResolvedValue({ userId: 't', blocked: true });
    const res = await request(app.getHttpServer()).post('/users/t/block').send({ reason: 'rude' }).expect(200);
    expect(res.body).toEqual({ userId: 't', blocked: true });
    expect(blocks.blockUser).toHaveBeenCalledWith('me', 't', { reason: 'rude' });
  });

  it('POST without a body is valid (the reason is optional)', async () => {
    blocks.blockUser.mockResolvedValue({ userId: 't', blocked: true });
    await request(app.getHttpServer()).post('/users/t/block').expect(200);
  });

  it('rejects a reason over 500 characters and any unknown field with 400', async () => {
    await request(app.getHttpServer()).post('/users/t/block').send({ reason: 'x'.repeat(501) }).expect(400);
    await request(app.getHttpServer()).post('/users/t/block').send({ blockerId: 'someone-else' }).expect(400);
    expect(blocks.blockUser).not.toHaveBeenCalled();
  });

  it('DELETE /users/:id/block unblocks for the caller', async () => {
    blocks.unblockUser.mockResolvedValue({ userId: 't', blocked: false });
    const res = await request(app.getHttpServer()).delete('/users/t/block').expect(200);
    expect(res.body).toEqual({ userId: 't', blocked: false });
    expect(blocks.unblockUser).toHaveBeenCalledWith('me', 't');
  });

  it('GET /users/:id/blocks is self-only: your own id works, another id is 403', async () => {
    blocks.listBlocked.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/users/me/blocks?limit=5').expect(200);
    expect(blocks.listBlocked).toHaveBeenCalledWith('me', { limit: 5 });
    await request(app.getHttpServer()).get('/users/someone-else/blocks').expect(403);
    expect(blocks.listBlocked).toHaveBeenCalledTimes(1);
  });

  it('rejects a limit above the page ceiling with 400', async () => {
    await request(app.getHttpServer()).get('/users/me/blocks?limit=999').expect(400);
  });
});
