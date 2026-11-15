import { ConflictException, ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminBanterRoomsController } from './admin-banter-rooms.controller';
import { BanterRoomReactivationService } from './banter-room-reactivation.service';

// backend/room-staff-reactivation (Decision Log #515). The REAL AdminRolesGuard and the REAL global ValidationPipe;
// only AdminJwtAuthGuard is stubbed (same approach as admin-moderation.controller.http.spec.ts).
describe('AdminBanterRoomsController (HTTP layer)', () => {
  let app: INestApplication;
  const reactivation = { reactivate: jest.fn() };
  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminBanterRoomsController],
      providers: [{ provide: BanterRoomReactivationService, useValue: reactivation }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = currentAdmin;
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

  it('rejects an editor with 403 and calls nothing', async () => {
    currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    await request(app.getHttpServer()).post('/admin/banter-rooms/room-1/reactivate').send({}).expect(403);
    expect(reactivation.reactivate).not.toHaveBeenCalled();
  });

  it.each(['moderator', 'superadmin'])('lets a %s through with 200 (not 201) and forwards room, admin id and body', async (role) => {
    currentAdmin = { sub: 'admin-7', role, aud: 'admin-console' };
    reactivation.reactivate.mockResolvedValue({ id: 'room-1', status: 'active' });

    const res = await request(app.getHttpServer())
      .post('/admin/banter-rooms/room-1/reactivate')
      .send({ note: 'Reported in error' })
      .expect(200);

    expect(res.body).toEqual({ id: 'room-1', status: 'active' });
    expect(reactivation.reactivate).toHaveBeenCalledWith('room-1', 'admin-7', { note: 'Reported in error' });
  });

  it('the note is optional (an empty body is fine)', async () => {
    currentAdmin = { sub: 'admin-7', role: 'moderator', aud: 'admin-console' };
    reactivation.reactivate.mockResolvedValue({ id: 'room-1', status: 'active' });
    await request(app.getHttpServer()).post('/admin/banter-rooms/room-1/reactivate').send({}).expect(200);
  });

  it('a note over 500 characters is a 400, and an unknown key is a 400', async () => {
    currentAdmin = { sub: 'admin-7', role: 'moderator', aud: 'admin-console' };
    await request(app.getHttpServer())
      .post('/admin/banter-rooms/room-1/reactivate')
      .send({ note: 'x'.repeat(501) })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/banter-rooms/room-1/reactivate')
      .send({ status: 'active' })
      .expect(400);
    expect(reactivation.reactivate).not.toHaveBeenCalled();
  });

  it('passes the service 404 and 409 through', async () => {
    currentAdmin = { sub: 'admin-7', role: 'moderator', aud: 'admin-console' };
    reactivation.reactivate.mockRejectedValueOnce(new NotFoundException('Banter Room not found'));
    await request(app.getHttpServer()).post('/admin/banter-rooms/nope/reactivate').send({}).expect(404);
    reactivation.reactivate.mockRejectedValueOnce(
      new ConflictException({ statusCode: 409, code: 'banter_room_already_active' }),
    );
    const res = await request(app.getHttpServer()).post('/admin/banter-rooms/room-1/reactivate').send({}).expect(409);
    expect(res.body.code).toBe('banter_room_already_active');
  });
});
