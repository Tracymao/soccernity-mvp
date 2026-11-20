import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminContentService } from './admin-content.service';

describe('AdminCategoriesController (HTTP layer)', () => {
  let app: INestApplication;
  const adminContentService = {
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCategoriesController],
      providers: [{ provide: AdminContentService, useValue: adminContentService }, AdminRolesGuard],
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
    it('rejects a moderator with 403 on GET /admin/categories', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/categories').expect(403);
      expect(adminContentService.listCategories).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on POST /admin/categories', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer()).post('/admin/categories').send({ name: 'La Liga' }).expect(403);
      expect(adminContentService.createCategory).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on PATCH /admin/categories/:id', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/categories/category-1')
        .send({ status: 'inactive' })
        .expect(403);
      expect(adminContentService.updateCategory).not.toHaveBeenCalled();
    });

    it('allows an editor through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      adminContentService.listCategories.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/categories').expect(200);
      expect(adminContentService.listCategories).toHaveBeenCalledTimes(1);
    });

    it('allows a superadmin through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      adminContentService.listCategories.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/categories').expect(200);
      expect(adminContentService.listCategories).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/categories', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    });

    it('passes the query through to the service', async () => {
      adminContentService.listCategories.mockResolvedValue({ items: [{ id: 'category-1' }], nextCursor: null });

      const res = await request(app.getHttpServer())
        .get('/admin/categories')
        .query({ status: 'active', limit: 10 })
        .expect(200);

      expect(adminContentService.listCategories).toHaveBeenCalledWith({ status: 'active', limit: 10 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an invalid status filter', async () => {
      await request(app.getHttpServer()).get('/admin/categories').query({ status: 'bogus' }).expect(400);
    });
  });

  describe('POST /admin/categories', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    });

    it('creates a category', async () => {
      adminContentService.createCategory.mockResolvedValue({ id: 'category-1', name: 'La Liga', slug: 'la-liga' });

      const res = await request(app.getHttpServer()).post('/admin/categories').send({ name: 'La Liga' }).expect(201);

      expect(adminContentService.createCategory).toHaveBeenCalledWith({ name: 'La Liga' });
      expect(res.body.slug).toBe('la-liga');
    });

    it('rejects a missing name', async () => {
      await request(app.getHttpServer()).post('/admin/categories').send({}).expect(400);
    });

    it('rejects a client-supplied slug (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/admin/categories')
        .send({ name: 'La Liga', slug: 'not-trusted' })
        .expect(400);
    });
  });

  describe('PATCH /admin/categories/:id', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
    });

    it('toggles a category status', async () => {
      adminContentService.updateCategory.mockResolvedValue({ id: 'category-1', status: 'inactive' });

      const res = await request(app.getHttpServer())
        .patch('/admin/categories/category-1')
        .send({ status: 'inactive' })
        .expect(200);

      expect(adminContentService.updateCategory).toHaveBeenCalledWith('category-1', { status: 'inactive' });
      expect(res.body.status).toBe('inactive');
    });

    it('rejects an invalid status value', async () => {
      await request(app.getHttpServer())
        .patch('/admin/categories/category-1')
        .send({ status: 'archived' })
        .expect(400);
    });
  });
});
