import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext, GoneException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';

// HTTP layer of "Download my data": routing, status codes, the DTO, the download headers, the id pipe, the guards.
describe('DataExportController (HTTP layer)', () => {
  let app: INestApplication;
  const service = {
    requestExport: jest.fn(),
    getLatest: jest.fn(),
    openDownload: jest.fn(),
  };
  let signedIn = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [{ provide: DataExportService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!signedIn) return false;
          ctx.switchToHttp().getRequest().user = { sub: 'user-1', role: 'fan' };
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
    service.requestExport.mockResolvedValue({ id: 'req-1', status: 'preparing' });
    service.getLatest.mockResolvedValue({ status: 'none' });
    service.openDownload.mockResolvedValue({ stream: Readable.from(['{"a":1}']), fileName: 'soccernity-data-export.json' });
  });
  afterEach(() => jest.clearAllMocks());

  const base = '/users/me/data-export';
  const id = '0b2b1d1e-6f0e-4d57-9a43-1c3b3f6d9a10';

  describe('POST', () => {
    it('is a 202 with the id and status, and takes the account from the token (never from the body)', async () => {
      const res = await request(app.getHttpServer()).post(base).send({ password: 'pw' }).expect(202);
      expect(res.body).toEqual({ id: 'req-1', status: 'preparing' });
      expect(service.requestExport).toHaveBeenCalledWith('user-1', 'pw');
    });

    it('needs a password string, and refuses fields it does not know', async () => {
      await request(app.getHttpServer()).post(base).send({}).expect(400);
      await request(app.getHttpServer()).post(base).send({ password: '' }).expect(400);
      await request(app.getHttpServer()).post(base).send({ password: 123 }).expect(400);
      await request(app.getHttpServer()).post(base).send({ password: 'pw', userId: 'someone-else' }).expect(400);
      expect(service.requestExport).not.toHaveBeenCalled();
    });
  });

  describe('GET latest', () => {
    it('returns the status for the signed-in account', async () => {
      service.getLatest.mockResolvedValue({ status: 'ready', id, requestedAt: 'x', expiresAt: 'y' });
      const res = await request(app.getHttpServer()).get(`${base}/latest`).expect(200);
      expect(res.body).toEqual({ status: 'ready', id, requestedAt: 'x', expiresAt: 'y' });
      expect(service.getLatest).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET :id/download', () => {
    it('streams the file as an attachment and is never cached', async () => {
      const res = await request(app.getHttpServer()).get(`${base}/${id}/download`).expect(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['content-disposition']).toBe('attachment; filename="soccernity-data-export.json"');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toBe('{"a":1}');
      expect(service.openDownload).toHaveBeenCalledWith('user-1', id);
    });

    it('passes the owner (from the token) to the service, so another account\'s id can only be a 404', async () => {
      service.openDownload.mockRejectedValue(new NotFoundException({ code: 'data_export_not_found' }));
      const res = await request(app.getHttpServer()).get(`${base}/${id}/download`).expect(404);
      expect(res.body.code).toBe('data_export_not_found');
    });

    it('an expired download is a 410', async () => {
      service.openDownload.mockRejectedValue(new GoneException({ code: 'data_export_expired' }));
      await request(app.getHttpServer()).get(`${base}/${id}/download`).expect(410);
    });

    it('an id that is not a UUID is a 400 and the service is not asked', async () => {
      await request(app.getHttpServer()).get(`${base}/not-a-uuid/download`).expect(400);
      expect(service.openDownload).not.toHaveBeenCalled();
    });
  });

  it('every route needs a signed-in user', async () => {
    signedIn = false;
    await request(app.getHttpServer()).post(base).send({ password: 'pw' }).expect(403);
    await request(app.getHttpServer()).get(`${base}/latest`).expect(403);
    await request(app.getHttpServer()).get(`${base}/${id}/download`).expect(403);
    expect(service.requestExport).not.toHaveBeenCalled();
    expect(service.getLatest).not.toHaveBeenCalled();
    expect(service.openDownload).not.toHaveBeenCalled();
  });

  it('carries JwtAuthGuard and NONE of the write-gate guards (it is the person\'s own data, open to every signed-in account)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, DataExportController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    for (const handler of ['request', 'latest', 'download']) {
      const own = (Reflect.getMetadata(GUARDS_METADATA, (DataExportController.prototype as unknown as Record<string, object>)[handler]) ?? []) as unknown[];
      for (const g of [GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard]) {
        expect(guards).not.toContain(g);
        expect(own).not.toContain(g);
      }
    }
  });
});
