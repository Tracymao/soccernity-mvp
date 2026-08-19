import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AccessTokenPayload } from '../auth/token/token.types';

describe('UsersController', () => {
  function buildController() {
    const usersService = {
      getOwnProfile: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Me' }),
      updateOwnProfile: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Updated' }),
      followUser: jest.fn().mockResolvedValue({ following: true }),
      unfollowUser: jest.fn().mockResolvedValue({ following: false }),
      getFollowers: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getFollowing: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
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

  describe('POST/DELETE /users/:id/follow', () => {
    it('follows using the caller (JWT sub) as follower and :id as followee — not self-scoped like GET/PATCH', async () => {
      const { controller, usersService } = buildController();
      const user: AccessTokenPayload = { sub: 'user-1', role: 'fan' };

      const result = await controller.follow('user-2', user);

      expect(usersService.followUser).toHaveBeenCalledWith('user-1', 'user-2');
      expect(result).toEqual({ following: true });
    });

    it('unfollows using the caller as follower and :id as followee', async () => {
      const { controller, usersService } = buildController();
      const user: AccessTokenPayload = { sub: 'user-1', role: 'fan' };

      const result = await controller.unfollow('user-2', user);

      expect(usersService.unfollowUser).toHaveBeenCalledWith('user-1', 'user-2');
      expect(result).toEqual({ following: false });
    });
  });

  describe('GET /users/:id/followers, GET /users/:id/following', () => {
    it('passes :id and the query straight through to UsersService.getFollowers — no self-scoping', async () => {
      const { controller, usersService } = buildController();

      await controller.followers('someone-elses-id', { cursor: 'abc', limit: 5 });

      expect(usersService.getFollowers).toHaveBeenCalledWith('someone-elses-id', { cursor: 'abc', limit: 5 });
    });

    it('passes :id and the query straight through to UsersService.getFollowing — no self-scoping', async () => {
      const { controller, usersService } = buildController();

      await controller.following('someone-elses-id', { cursor: 'abc', limit: 5 });

      expect(usersService.getFollowing).toHaveBeenCalledWith('someone-elses-id', { cursor: 'abc', limit: 5 });
    });
  });
});
