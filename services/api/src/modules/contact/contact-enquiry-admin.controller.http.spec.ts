import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { ContactEnquiryAdminController } from './contact-enquiry-admin.controller';
import { ContactEnquiryAdminService } from './contact-enquiry-admin.service';

// backend/w7-contact-enquiry-admin-escalate (B-046 part B). The four routes at the real HTTP layer: the REAL
// AdminRolesGuard and the REAL global ValidationPipe, with the service mocked. Only AdminJwtAuthGuard is replaced,
// by a stand-in that 401s when nobody is signed in, so "unauthenticated" is a real case.

const REASON = 'This looks like a safeguarding concern.';

describe('Contact enquiry admin routes (HTTP layer)', () => {
  let app: INestApplication;
  let currentAdmin: { sub: string; role: string; aud: string } | null;
  const service = { list: jest.fn(), getById: jest.fn(), setHandled: jest.fn(), escalate: jest.fn() };

  const as = (role: string) => (currentAdmin = { sub: 'admin-1', role, aud: 'admin-console' });

  beforeEach(async () => {
    Object.values(service).forEach((m) => m.mockReset());
    service.list.mockResolvedValue({ items: [], nextCursor: null });
    service.getById.mockResolvedValue({ id: 'e1' });
    service.setHandled.mockResolvedValue({ id: 'e1', status: 'handled' });
    service.escalate.mockResolvedValue({ enquiry: { id: 'e1' }, report: { id: 'r1' } });
    currentAdmin = null;

    const moduleRef = await Test.createTestingModule({
      controllers: [ContactEnquiryAdminController],
      providers: [{ provide: ContactEnquiryAdminService, useValue: service }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentAdmin) throw new UnauthorizedException();
          context.switchToHttp().getRequest().admin = currentAdmin;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const routes: Array<[string, string, string]> = [
    ['get', '/admin/contact-enquiries', 'list'],
    ['get', '/admin/contact-enquiries/e1', 'getById'],
    ['patch', '/admin/contact-enquiries/e1/handled', 'setHandled'],
    ['post', '/admin/contact-enquiries/e1/escalate', 'escalate'],
  ];

  describe.each(routes)('%s %s', (method, path, serviceMethod) => {
    const send = () => {
      const agent = request(app.getHttpServer()) as unknown as Record<string, (p: string) => request.Test>;
      return agent[method](path).send(
        method === 'patch' ? { handled: true } : method === 'post' ? { severity: 'low', concernsMinor: false, reason: REASON } : undefined,
      );
    };

    it('401s with no admin signed in', async () => {
      await send().expect(401);
      expect((service as Record<string, jest.Mock>)[serviceMethod]).not.toHaveBeenCalled();
    });

    it('403s an editor (moderator and superadmin only)', async () => {
      as('editor');
      await send().expect(403);
      expect((service as Record<string, jest.Mock>)[serviceMethod]).not.toHaveBeenCalled();
    });

    it.each(['moderator', 'superadmin'])('lets a %s through', async (role) => {
      as(role);
      await send().expect(method === 'post' ? 201 : 200);
      expect((service as Record<string, jest.Mock>)[serviceMethod]).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET list query', () => {
    it('passes status, category, cursor and a numeric limit through', async () => {
      as('moderator');
      await request(app.getHttpServer()).get('/admin/contact-enquiries?status=new&category=data&limit=5&cursor=abc').expect(200);
      expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'new', category: 'data', limit: 5, cursor: 'abc' }));
    });

    it.each(['status=archived', 'category=nope', 'category=livescores_issues', 'category=enquiries_feedback', 'limit=0', 'limit=51', 'limit=abc', 'extra=1'])('400s on %s', async (qs) => {
      as('moderator');
      await request(app.getHttpServer()).get(`/admin/contact-enquiries?${qs}`).expect(400);
    });
  });

  describe('PATCH :id/handled body', () => {
    it('passes the acting admin and the boolean', async () => {
      as('moderator');
      await request(app.getHttpServer()).patch('/admin/contact-enquiries/e1/handled').send({ handled: false }).expect(200);
      expect(service.setHandled).toHaveBeenCalledWith('e1', 'admin-1', false);
    });

    it.each([{}, { handled: 'yes' }, { handled: true, extra: 1 }])('400s on %j', async (body) => {
      as('moderator');
      await request(app.getHttpServer()).patch('/admin/contact-enquiries/e1/handled').send(body).expect(400);
    });
  });

  describe('POST :id/escalate body', () => {
    const post = (body: unknown) => request(app.getHttpServer()).post('/admin/contact-enquiries/e1/escalate').send(body as object);

    it('passes severity, concernsMinor and the reason, and answers 201', async () => {
      as('moderator');
      const res = await post({ severity: 'critical', concernsMinor: true, reason: REASON }).expect(201);
      expect(res.body).toEqual({ enquiry: { id: 'e1' }, report: { id: 'r1' } });
      expect(service.escalate).toHaveBeenCalledWith('e1', 'admin-1', expect.objectContaining({ severity: 'critical', concernsMinor: true, reason: REASON }));
    });

    it.each([
      ['missing severity', { concernsMinor: false, reason: REASON }],
      ['unknown severity', { severity: 'urgent', concernsMinor: false, reason: REASON }],
      ['missing concernsMinor', { severity: 'low', reason: REASON }],
      ['non-boolean concernsMinor', { severity: 'low', concernsMinor: 'no', reason: REASON }],
      ['missing reason', { severity: 'low', concernsMinor: false }],
      ['reason under 10 characters', { severity: 'low', concernsMinor: false, reason: 'too short' }],
      ['reason over 500 characters', { severity: 'low', concernsMinor: false, reason: 'x'.repeat(501) }],
      ['an extra field', { severity: 'low', concernsMinor: false, reason: REASON, targetType: 'user' }],
    ])('400s on %s', async (_label, body) => {
      as('moderator');
      await post(body).expect(400);
      expect(service.escalate).not.toHaveBeenCalled();
    });

    it('accepts a reason of exactly 10 and exactly 500 characters', async () => {
      as('moderator');
      await post({ severity: 'low', concernsMinor: false, reason: 'x'.repeat(10) }).expect(201);
      await post({ severity: 'low', concernsMinor: false, reason: 'x'.repeat(500) }).expect(201);
    });
  });
});
