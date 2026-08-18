import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with GuardianConsentService mocked out,
// mirroring registration/registration.controller.spec.ts's and
// password-reset/password-reset.controller.spec.ts's pattern. No guard
// override needed here — unlike /auth/login or /auth/forgot-password,
// this route carries neither @AuthRateLimit() nor JwtAuthGuard.
describe('GuardianConsentController (HTTP layer)', () => {
  let app: INestApplication;
  const guardianConsentService = {
    confirmConsent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GuardianConsentController],
      providers: [{ provide: GuardianConsentService, useValue: guardianConsentService }],
    }).compile();

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

  describe('POST /auth/guardian-consent', () => {
    it('returns 200 on a valid, unused token', async () => {
      guardianConsentService.confirmConsent.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({ message: 'Guardian consent confirmed.' });
      expect(guardianConsentService.confirmConsent).toHaveBeenCalledWith('a-real-token');
    });

    it('returns 200 idempotently when the same token is submitted again', async () => {
      guardianConsentService.confirmConsent.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token' })
        .expect(200);

      expect(response.body).toEqual({ message: 'Guardian consent confirmed.' });
      expect(guardianConsentService.confirmConsent).toHaveBeenCalledTimes(2);
    });

    it('maps an invalid-token BadRequestException to 400', async () => {
      guardianConsentService.confirmConsent.mockRejectedValueOnce(
        new BadRequestException('Invalid or expired consent token'),
      );

      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'not-a-real-token' })
        .expect(400);
    });

    it('rejects a body missing consentToken with 400', async () => {
      await request(app.getHttpServer()).post('/auth/guardian-consent').send({}).expect(400);

      expect(guardianConsentService.confirmConsent).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type consentToken field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 12345 })
        .expect(400);

      expect(guardianConsentService.confirmConsent).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/guardian-consent')
        .send({ consentToken: 'a-real-token', role: 'admin' })
        .expect(400);

      expect(guardianConsentService.confirmConsent).not.toHaveBeenCalled();
    });
  });
});
