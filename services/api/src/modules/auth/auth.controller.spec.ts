import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function buildController(authService: Partial<AuthService>) {
  return new AuthController(authService as AuthService);
}

describe('AuthController', () => {
  describe('login', () => {
    it('rejects a body missing password with a 400, before ever calling AuthService', async () => {
      const login = jest.fn();
      const controller = buildController({ login });

      await expect(controller.login({ email: 'a@example.com' })).rejects.toThrow(BadRequestException);
      expect(login).not.toHaveBeenCalled();
    });

    it('normalizes and forwards email/password to AuthService.login', async () => {
      const login = jest.fn().mockResolvedValue({
        accessToken: 'a',
        accessTokenExpiresIn: 900,
        refreshToken: 'r',
        refreshTokenExpiresAt: new Date().toISOString(),
      });
      const controller = buildController({ login });

      await controller.login({ email: '  Player@Example.com ', password: 'pw' });

      expect(login).toHaveBeenCalledWith('player@example.com', 'pw');
    });
  });

  describe('refresh', () => {
    it('rejects a body missing refreshToken with a 400', async () => {
      const refresh = jest.fn();
      const controller = buildController({ refresh });

      await expect(controller.refresh({})).rejects.toThrow(BadRequestException);
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('extracts the bearer token from the Authorization header for allSessions logout', async () => {
      const logout = jest.fn().mockResolvedValue(undefined);
      const controller = buildController({ logout });

      await controller.logout({ refreshToken: 'r', allSessions: true }, 'Bearer abc.def.ghi');

      expect(logout).toHaveBeenCalledWith('r', true, 'abc.def.ghi');
    });

    it('passes undefined access token when no Authorization header is present', async () => {
      const logout = jest.fn().mockResolvedValue(undefined);
      const controller = buildController({ logout });

      await controller.logout({ refreshToken: 'r' }, undefined);

      expect(logout).toHaveBeenCalledWith('r', false, undefined);
    });

    it('rejects a body missing refreshToken with a 400', async () => {
      const logout = jest.fn();
      const controller = buildController({ logout });

      await expect(controller.logout({})).rejects.toThrow(BadRequestException);
      expect(logout).not.toHaveBeenCalled();
    });
  });
});
