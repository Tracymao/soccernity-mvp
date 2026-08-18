import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// DTO validation (missing/wrong-type/extra fields -> 400) is now handled
// by main.ts's global ValidationPipe before these methods are ever
// invoked, so it's covered at the HTTP layer in
// auth.controller.http.spec.ts, not here — calling these methods
// directly bypasses the pipe entirely. This file covers only the
// bearer-token-extraction logic that lives in the controller itself.
function buildController(authService: Partial<AuthService>) {
  return new AuthController(authService as AuthService);
}

describe('AuthController', () => {
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
  });
});
