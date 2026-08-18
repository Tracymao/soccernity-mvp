import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AccessTokenPayload } from '../auth/token/token.types';

describe('UsersController', () => {
  function buildController() {
    const usersService = {
      getOwnProfile: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Me' }),
      updateOwnProfile: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Updated' }),
    } as unknown as UsersService;
    const controller = new UsersController(usersService);
    return { controller, usersService };
  }

  describe('GET /users/:id', () => {
    it('returns the profile when :id matches the authenticated user', async () => {
      const { controller, usersService } = buildController();
      const user: AccessTokenPayload = { sub: 'user-1', role: 'fan' };

      const result = await controller.getById('user-1', user);

      expect(usersService.getOwnProfile).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ id: 'user-1', displayName: 'Me' });
    });

    it('throws ForbiddenException (not the target user\'s data) when :id does not match the authenticated user', async () => {
      const { controller, usersService } = buildController();
      const user: AccessTokenPayload = { sub: 'user-1', role: 'fan' };

      await expect(controller.getById('someone-elses-id', user)).rejects.toThrow(ForbiddenException);
      expect(usersService.getOwnProfile).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates the profile when :id matches the authenticated user', async () => {
      const { controller, usersService } = buildController();
      const user: AccessTokenPayload = { sub: 'user-1', role: 'fan' };

      const result = await controller.updateById('user-1', user, { displayName: 'Updated' });

      expect(usersService.updateOwnProfile).toHaveBeenCalledWith('user-1', { displayName: 'Updated' });
      expect(result).toEqual({ id: 'user-1', displayName: 'Updated' });
    });

    it('throws ForbiddenException and never calls the service when :id does not match the authenticated user, even with a safeguarding-field payload', async () => {
      const { controller, usersService } = buildController();
      const user: AccessTokenPayload = { sub: 'user-1', role: 'fan' };

      await expect(
        controller.updateById('someone-elses-id', user, { displayName: 'Hijacked' }),
      ).rejects.toThrow(ForbiddenException);
      expect(usersService.updateOwnProfile).not.toHaveBeenCalled();
    });
  });
});
