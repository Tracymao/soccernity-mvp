import { ConfigService } from '@nestjs/config';
import { RegistrationEmailService } from './registration-email.service';

function configWithKey(value: string | undefined): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

describe('RegistrationEmailService', () => {
  it('is "wired but inactive" — resolves without throwing when the .env.example placeholder is unset', async () => {
    const service = new RegistrationEmailService(configWithKey(undefined));

    await expect(service.sendVerificationEmail('minor@example.com', 'tok-1')).resolves.toBeUndefined();
  });

  it('is "wired but inactive" when EMAIL_PROVIDER_API_KEY is still the literal placeholder', async () => {
    const service = new RegistrationEmailService(configWithKey('replace-me'));

    await expect(
      service.sendGuardianConsentEmail('guardian@example.com', 'consent-tok', 'Minor Name'),
    ).resolves.toBeUndefined();
  });

  it('never fakes real delivery — throws loudly if a real key is set without a real provider wired up', async () => {
    const service = new RegistrationEmailService(configWithKey('a-real-looking-key'));

    await expect(service.sendVerificationEmail('minor@example.com', 'tok-1')).rejects.toThrow(
      /no email provider integration exists yet/,
    );
  });
});
