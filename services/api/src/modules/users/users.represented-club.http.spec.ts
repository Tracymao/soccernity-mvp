import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const CLUB_ID = '11111111-1111-4111-8111-111111111111';

// PATCH /users/:id/represented-club — assertSelf + DTO validation at the
// HTTP layer. The service's own membership check is covered in
// users.represented-club.spec.ts.
describe('PATCH /users/:id/represented-club (HTTP layer)', () => {
  let app: INestApplication;
  const usersService = { setRepresentedClub: jest.fn() };
  const caller = { sub: 'user-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = caller;
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards a valid club id from the verified token subject', async () => {
    usersService.setRepresentedClub.mockResolvedValue({ representedClub: { id: CLUB_ID, name: 'X' } });

    const res = await request(app.getHttpServer())
      .patch('/users/user-1/represented-club')
      .send({ clubId: CLUB_ID })
      .expect(200);

    expect(usersService.setRepresentedClub).toHaveBeenCalledWith('user-1', CLUB_ID);
    expect(res.body).toEqual({ representedClub: { id: CLUB_ID, name: 'X' } });
  });

  it('accepts an explicit null to unrepresent the club', async () => {
    usersService.setRepresentedClub.mockResolvedValue({ representedClub: null });

    await request(app.getHttpServer()).patch('/users/user-1/represented-club').send({ clubId: null }).expect(200);

    expect(usersService.setRepresentedClub).toHaveBeenCalledWith('user-1', null);
  });

  it('403s when :id is not the caller, before reaching the service', async () => {
    await request(app.getHttpServer())
      .patch('/users/someone-else/represented-club')
      .send({ clubId: CLUB_ID })
      .expect(403);

    expect(usersService.setRepresentedClub).not.toHaveBeenCalled();
  });

  it('400s a missing clubId key (not the same as an explicit null)', async () => {
    await request(app.getHttpServer()).patch('/users/user-1/represented-club').send({}).expect(400);
    expect(usersService.setRepresentedClub).not.toHaveBeenCalled();
  });

  it('400s a non-UUID clubId', async () => {
    await request(app.getHttpServer()).patch('/users/user-1/represented-club').send({ clubId: 'not-a-uuid' }).expect(400);
    expect(usersService.setRepresentedClub).not.toHaveBeenCalled();
  });

  it('400s an unexpected extra field (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .patch('/users/user-1/represented-club')
      .send({ clubId: CLUB_ID, role: 'admin' })
      .expect(400);
    expect(usersService.setRepresentedClub).not.toHaveBeenCalled();
  });
});
