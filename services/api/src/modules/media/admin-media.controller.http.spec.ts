import { BadRequestException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminMediaController } from './admin-media.controller';
import { MediaService } from './media.service';

// Exercises the real HTTP layer: routing, DTO validation, the REAL
// FileInterceptor/multer multipart parsing (a real supertest `.attach()`
// upload, not a mocked file object), AND the REAL AdminRolesGuard — same
// convention as admin-articles.controller.http.spec.ts /
// admin-users.controller.http.spec.ts. A real 50MB-boundary 413 test is
// deliberately NOT included here — that would mean allocating a >50MB
// buffer in a unit test purely to re-prove multer's own already-trusted
// `limits.fileSize` behaviour (a framework guarantee, not this
// controller's own logic) — see media.service.ts's own comment on why
// no redundant size check exists in this codebase's code either.
describe('AdminMediaController (HTTP layer)', () => {
  let app: INestApplication;
  const mediaService = {
    listMedia: jest.fn(),
    uploadMedia: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMediaController],
      providers: [{ provide: MediaService, useValue: mediaService }, AdminRolesGuard],
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

  describe('role gating (editor/superadmin only, not moderator)', () => {
    it('rejects a moderator with 403 on GET /admin/media', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/media').expect(403);
      expect(mediaService.listMedia).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on POST /admin/media/upload', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer())
        .post('/admin/media/upload')
        .attach('file', Buffer.from('fake-bytes'), { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(403);
      expect(mediaService.uploadMedia).not.toHaveBeenCalled();
    });

    it('allows an editor through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      mediaService.listMedia.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/media').expect(200);
      expect(mediaService.listMedia).toHaveBeenCalledTimes(1);
    });

    it('allows a superadmin through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      mediaService.listMedia.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/media').expect(200);
      expect(mediaService.listMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/media', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    });

    it('passes the query through to the service', async () => {
      mediaService.listMedia.mockResolvedValue({ items: [{ id: 'media-1' }], nextCursor: null });

      const res = await request(app.getHttpServer()).get('/admin/media').query({ type: 'video', limit: 10 }).expect(200);

      expect(mediaService.listMedia).toHaveBeenCalledWith({ type: 'video', limit: 10 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an invalid type filter', async () => {
      await request(app.getHttpServer()).get('/admin/media').query({ type: 'bogus' }).expect(400);
    });
  });

  describe('POST /admin/media/upload', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    });

    it('uploads a real multipart file and forwards the acting admin id', async () => {
      mediaService.uploadMedia.mockResolvedValue({ id: 'media-1', type: 'image' });

      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .attach('file', Buffer.from('fake-bytes'), { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(mediaService.uploadMedia).toHaveBeenCalledTimes(1);
      const [uploaderId, file] = mediaService.uploadMedia.mock.calls[0];
      expect(uploaderId).toBe('admin-1');
      expect(file.mimetype).toBe('image/jpeg');
      expect(file.originalname).toBe('photo.jpg');
      expect(Buffer.isBuffer(file.buffer)).toBe(true);
      expect(res.body.id).toBe('media-1');
    });

    it('reaches the service with no file when none is attached, letting it reject that case', async () => {
      mediaService.uploadMedia.mockImplementation(() => {
        throw new BadRequestException('No file was attached to this upload.');
      });

      await request(app.getHttpServer()).post('/admin/media/upload').expect(400);
      expect(mediaService.uploadMedia).toHaveBeenCalledWith('admin-1', undefined);
    });
  });
});
