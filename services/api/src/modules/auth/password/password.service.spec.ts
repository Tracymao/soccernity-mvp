import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('hashes a password as an argon2id PHC string', async () => {
    const hash = await service.hash('correct horse battery staple');

    // PHC string format: $argon2id$v=...$m=...,t=...,p=...$salt$hash
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces a different hash for the same password each time (unique salt)', async () => {
    const [first, second] = await Promise.all([
      service.hash('same-password'),
      service.hash('same-password'),
    ]);

    expect(first).not.toEqual(second);
  });

  it('verifies successfully with the correct password', async () => {
    const hash = await service.hash('a-real-password-123');

    await expect(service.verify(hash, 'a-real-password-123')).resolves.toBe(true);
  });

  it('fails verification with an incorrect password', async () => {
    const hash = await service.hash('a-real-password-123');

    await expect(service.verify(hash, 'the-wrong-password')).resolves.toBe(false);
  });

  it('fails verification (rather than throwing) against a malformed hash', async () => {
    await expect(service.verify('not-a-real-argon2-hash', 'anything')).resolves.toBe(false);
  });
});
