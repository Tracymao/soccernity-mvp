import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

// Mirrors what main.ts's global ValidationPipe ({ whitelist: true,
// forbidNonWhitelisted: true, transform: true }) does to an incoming
// PATCH /users/:id body, without needing a live HTTP server — proves the
// DTO-level half of the safeguarding-field allowlist independently of
// UsersService's own allowlist (see users.service.spec.ts for that half).
describe('UpdateUserDto', () => {
  it('accepts displayName and phone', async () => {
    const dto = plainToInstance(UpdateUserDto, { displayName: 'New Name', phone: '+441234567890' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial update (only one field)', async () => {
    const dto = plainToInstance(UpdateUserDto, { displayName: 'New Name' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('forbidNonWhitelisted (as configured in main.ts) rejects a body containing isMinor/role/verificationStatus', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      displayName: 'New Name',
      isMinor: true,
      role: 'admin',
      verificationStatus: 'verified',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
    const rejectedProperties = errors.map((e) => e.property);
    expect(rejectedProperties).toEqual(
      expect.arrayContaining(['isMinor', 'role', 'verificationStatus']),
    );
  });

  it('rejects an invalid phone value', async () => {
    const dto = plainToInstance(UpdateUserDto, { phone: 'not-a-phone-number!!' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('phone');
  });

  describe('username', () => {
    const validate_ = async (body: object) => validate(plainToInstance(UpdateUserDto, body), { whitelist: true, forbidNonWhitelisted: true });

    it.each(['abc', 'goalie_9', 'Goalie_9', 'a'.repeat(30), '___', '123'])('accepts %s', async (username) => {
      expect(await validate_({ username })).toHaveLength(0);
    });

    it.each(['ab', 'a'.repeat(31), 'has space', 'dash-ed', 'émile', 'name!', '@goalie'])('rejects %s', async (username) => {
      const errors = await validate_({ username });
      expect(errors.map((e) => e.property)).toContain('username');
    });

    it('accepts null (clears the username)', async () => {
      expect(await validate_({ username: null })).toHaveLength(0);
    });

    it('rejects a non-string username', async () => {
      const errors = await validate_({ username: 12345 });
      expect(errors.map((e) => e.property)).toContain('username');
    });
  });

  // backend/w5-profile-block (B-038)
  describe('profile content fields', () => {
    const opts = { whitelist: true, forbidNonWhitelisted: true };

    it('accepts bio, preferredClub and profileCountry, and null to clear each', async () => {
      for (const body of [
        { bio: 'Left back', preferredClub: 'Ikoyi Rovers', profileCountry: 'NG' },
        { bio: null, preferredClub: null, profileCountry: null },
      ]) {
        expect(await validate(plainToInstance(UpdateUserDto, body), opts)).toHaveLength(0);
      }
    });

    it('bio is capped at 160 characters, preferredClub at 80, profileCountry at 2', async () => {
      expect((await validate(plainToInstance(UpdateUserDto, { bio: 'x'.repeat(160) }), opts))).toHaveLength(0);
      expect((await validate(plainToInstance(UpdateUserDto, { bio: 'x'.repeat(161) }), opts)).map((e) => e.property)).toEqual(['bio']);
      expect((await validate(plainToInstance(UpdateUserDto, { preferredClub: 'x'.repeat(81) }), opts)).map((e) => e.property)).toEqual(['preferredClub']);
      expect((await validate(plainToInstance(UpdateUserDto, { profileCountry: 'NGA' }), opts)).map((e) => e.property)).toEqual(['profileCountry']);
    });

    it('still refuses the safeguarding country and avatar columns (no client may write them here)', async () => {
      const errors = await validate(
        plainToInstance(UpdateUserDto, { declaredCountry: 'US', derivedCountry: 'US', avatarUrl: 'x', avatarStatus: 'approved' }),
        opts,
      );
      expect(errors.map((e) => e.property).sort()).toEqual(['avatarStatus', 'avatarUrl', 'declaredCountry', 'derivedCountry']);
    });
  });
});
