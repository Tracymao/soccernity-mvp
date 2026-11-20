import { ConfigService } from '@nestjs/config';
import { DobEncryptionService } from './dob-encryption.service';

// Real (not mocked) DobEncryptionService with a fixed throwaway key, for
// unit specs that construct services by hand.
export const TEST_DOB_KEY = Buffer.from('unit-test-only-dob-key-32-bytes!').toString('base64');
// Only the named variables exist; every other name reads as unset (a blanket `get: () => key` would also answer
// DOB_ENCRYPTION_KEY_VERSION and DOB_ENCRYPTION_KEY_PREVIOUS with the key).
export function buildDobEncryptionWith(vars: Record<string, string>): DobEncryptionService {
  return new DobEncryptionService({ get: (name: string) => vars[name] } as unknown as ConfigService);
}

export function buildTestDobEncryption(): DobEncryptionService {
  return buildDobEncryptionWith({ DOB_ENCRYPTION_KEY: TEST_DOB_KEY });
}
