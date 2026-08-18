import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../rate-limit/auth-throttler.guard';
import { FORGOT_PASSWORD_GENERIC_MESSAGE, PasswordResetService } from './password-reset.service';
import { PasswordResetController } from './password-reset.controller';

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with PasswordResetService mocked out,
// mirroring registration/registration.controller.spec.ts's pattern --
// this is the HTTP-layer coverage for ForgotPasswordDto/ResetPasswordDto
// now that they're class-validator classes validated by main.ts's global
// ValidationPipe rather than the controller's own hand-rolled checks.
describe('PasswordResetController (HTTP layer)', () => {
  let app: INestApplication;
  const passwordResetService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PasswordResetController],
      providers: [{ provide: PasswordResetService, useValue: passwordResetService }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
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

  describe('POST /auth/forgot-password', () => {
    it('returns 200 with the generic message on success', async () => {
      passwordResetService.forgotPassword.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'player@example.com' })
        .expect(200);

      expect(response.body).toEqual({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
      expect(passwordResetService.forgotPassword).toHaveBeenCalledWith('player@example.com');
    });

    it('rejects a body missing the email field with 400', async () => {
      await request(app.getHttpServer()).post('/auth/forgot-password').send({}).expect(400);

      expect(passwordResetService.forgotPassword).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type email field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 12345 })
        .expect(400);

      expect(passwordResetService.forgotPassword).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'player@example.com', role: 'admin' })
        .expect(400);

      expect(passwordResetService.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/reset-password', () => {
    it('returns 200 with a success message on success', async () => {
      passwordResetService.resetPassword.mockResolvedValueOnce(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'reset-id.secret', newPassword: 'a-new-password' })
        .expect(200);

      expect(response.body).toEqual({ message: 'Password has been reset successfully.' });
      expect(passwordResetService.resetPassword).toHaveBeenCalledWith('reset-id.secret', 'a-new-password');
    });

    it('rejects a body missing newPassword with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'reset-id.secret' })
        .expect(400);

      expect(passwordResetService.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type token field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 12345, newPassword: 'a-new-password' })
        .expect(400);

      expect(passwordResetService.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects a newPassword shorter than 8 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'reset-id.secret', newPassword: 'short' })
        .expect(400);

      expect(passwordResetService.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'reset-id.secret', newPassword: 'a-new-password', role: 'admin' })
        .expect(400);

      expect(passwordResetService.resetPassword).not.toHaveBeenCalled();
    });
  });
});
