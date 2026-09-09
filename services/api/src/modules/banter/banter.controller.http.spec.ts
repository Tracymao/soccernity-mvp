import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BanterController } from './banter.controller';
import { BanterService } from './banter.service';

// Exercises the real HTTP layer: routing (incl. that /search and /mine
// aren't shadowed by /:id), DTO validation, and guard wiring — following
// clubs.controller.http.spec.ts / grassroots.controller.http.spec.ts.
// Both guards are overridden; the consent guard counts its invocations
// so we can assert it's on exactly the four write routes.
describe('BanterController (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  let consentGuardCalls = 0;

  const banter = {
    createRoom: jest.fn(),
    listRooms: jest.fn(),
    getMyRooms: jest.fn(),
    getRoomById: jest.fn(),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    assertRoomExists: jest.fn(),
    getRoomFeed: jest.fn(),
    postToRoom: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BanterController],
      providers: [{ provide: BanterService, useValue: banter }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .overrideGuard(GuardianConsentGuard)
      .useValue({
        canActivate: () => {
          consentGuardCalls += 1;
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
    consentGuardCalls = 0;
  });

  describe('POST /banter-rooms', () => {
    it('creates a room, delegating to createRoom(caller, dto) — consent guard ran', async () => {
      banter.createRoom.mockResolvedValue({ id: 'r-1' });
      await request(app.getHttpServer())
        .post('/banter-rooms')
        .send({ name: 'Gooners Only', scopeType: 'club' })
        .expect(201);

      expect(banter.createRoom).toHaveBeenCalledWith('user-1', {
        name: 'Gooners Only',
        scopeType: 'club',
      });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects an unknown scopeType with 400', async () => {
      await request(app.getHttpServer())
        .post('/banter-rooms')
        .send({ name: 'A B', scopeType: 'stadium' })
        .expect(400);
      expect(banter.createRoom).not.toHaveBeenCalled();
    });

    it('rejects a missing name with 400', async () => {
      await request(app.getHttpServer())
        .post('/banter-rooms')
        .send({ scopeType: 'topic' })
        .expect(400);
    });

    it('strips an attempt to set createdBy / memberCount via the body (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/banter-rooms')
        .send({ name: 'A B', scopeType: 'topic', createdBy: 'someone-else', memberCount: 99 })
        .expect(400);
    });
  });

  describe('GET /banter-rooms + /search + /mine routing', () => {
    it('GET /banter-rooms passes scopeType/q/cursor/limit through and does NOT run the consent guard', async () => {
      banter.listRooms.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer())
        .get('/banter-rooms?scopeType=league&q=derby&limit=5')
        .expect(200);
      expect(banter.listRooms).toHaveBeenCalledWith(
        expect.objectContaining({ scopeType: 'league', q: 'derby', limit: 5 }),
        'user-1',
      );
      expect(consentGuardCalls).toBe(0);
    });

    it('GET /banter-rooms/search hits listRooms, NOT getRoomById (literal segment beats :id)', async () => {
      banter.listRooms.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/banter-rooms/search?q=x').expect(200);
      expect(banter.listRooms).toHaveBeenCalled();
      expect(banter.getRoomById).not.toHaveBeenCalled();
    });

    it('GET /banter-rooms/mine hits getMyRooms, NOT getRoomById', async () => {
      banter.getMyRooms.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/banter-rooms/mine').expect(200);
      expect(banter.getMyRooms).toHaveBeenCalledWith('user-1', expect.any(Object));
      expect(banter.getRoomById).not.toHaveBeenCalled();
    });

    it('rejects an unknown scopeType query filter with 400', async () => {
      await request(app.getHttpServer()).get('/banter-rooms?scopeType=nope').expect(400);
    });

    it('GET /banter-rooms/:id delegates to getRoomById', async () => {
      banter.getRoomById.mockResolvedValue({ id: 'r-1', joined: false });
      await request(app.getHttpServer()).get('/banter-rooms/r-1').expect(200);
      expect(banter.getRoomById).toHaveBeenCalledWith('r-1', 'user-1');
    });
  });

  describe('join / leave', () => {
    it('POST /banter-rooms/:id/join returns 200 and runs the consent guard', async () => {
      banter.joinRoom.mockResolvedValue({ roomId: 'r-1', joined: true, memberCount: 1 });
      await request(app.getHttpServer()).post('/banter-rooms/r-1/join').expect(200);
      expect(banter.joinRoom).toHaveBeenCalledWith('user-1', 'r-1');
      expect(consentGuardCalls).toBe(1);
    });

    it('DELETE /banter-rooms/:id/join returns 200 and runs the consent guard', async () => {
      banter.leaveRoom.mockResolvedValue({ roomId: 'r-1', joined: false, memberCount: 0 });
      await request(app.getHttpServer()).delete('/banter-rooms/r-1/join').expect(200);
      expect(banter.leaveRoom).toHaveBeenCalledWith('user-1', 'r-1');
      expect(consentGuardCalls).toBe(1);
    });
  });

  describe('room posts', () => {
    it('GET /banter-rooms/:id/posts asserts existence then delegates the feed read (no consent guard)', async () => {
      banter.assertRoomExists.mockResolvedValue(undefined);
      banter.getRoomFeed.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/banter-rooms/r-1/posts?limit=10').expect(200);
      expect(banter.assertRoomExists).toHaveBeenCalledWith('r-1');
      expect(banter.getRoomFeed).toHaveBeenCalledWith('r-1', 'user-1', expect.objectContaining({ limit: 10 }));
      expect(consentGuardCalls).toBe(0);
    });

    it('POST /banter-rooms/:id/posts delegates to postToRoom and runs the consent guard', async () => {
      banter.postToRoom.mockResolvedValue({ id: 'post-1' });
      await request(app.getHttpServer())
        .post('/banter-rooms/r-1/posts')
        .send({ contentText: 'up the arse' })
        .expect(201);
      expect(banter.postToRoom).toHaveBeenCalledWith('user-1', 'r-1', { contentText: 'up the arse' });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects a room post with an empty contentText (400) and one with 11 mediaUrls (400)', async () => {
      await request(app.getHttpServer())
        .post('/banter-rooms/r-1/posts')
        .send({ contentText: '' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/banter-rooms/r-1/posts')
        .send({
          contentText: 'x',
          mediaUrls: Array.from({ length: 11 }, (_, i) => `https://cdn.example.com/${i}.jpg`),
        })
        .expect(400);
    });

    it('strips a banterRoomId smuggled into the post body (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/banter-rooms/r-1/posts')
        .send({ contentText: 'x', banterRoomId: 'a-different-room' })
        .expect(400);
    });
  });
});
