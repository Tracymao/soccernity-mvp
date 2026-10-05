import { ConfigService } from '@nestjs/config';
import { DobEncryptionService } from './dob-encryption.service';

// Real (not mocked) DobEncryptionService with a fixed throwaway key, for
// unit specs that construct services by hand.
export const TEST_DOB_KEY = Buffer.from('unit-test-only-dob-key-32-bytes!').toString('base64');
export function buildTestDobEncryption(): DobEncryptionService {
  return new DobEncryptionService({ get: () => TEST_DOB_KEY } as unknown as ConfigService);
}
