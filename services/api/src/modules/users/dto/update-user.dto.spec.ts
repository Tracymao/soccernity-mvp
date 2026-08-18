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
});
