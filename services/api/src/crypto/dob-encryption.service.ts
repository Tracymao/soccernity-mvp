import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptDob, decryptDobString, DobKeyRing, encryptDob, encryptDobString, parseDobKeyRing } from './dob-crypto';

// Why a service called explicitly (not a Prisma middleware/$extends):
// the column is now TEXT, so the generated Prisma type is `string | null`.
// A middleware would make that type lie (runtime Date, static string), and
// $extends would change the type of the injected PrismaService everywhere.
// With an explicit service, the type change makes `tsc` flag every site
// that touches the column -- there are only a handful (registration write,
// own-profile read, login/register response, age sweep) -- so none can be
// missed. The key is read from ConfigService the same way JWT_SECRET is
// (env var, no code default, placeholder rejected) and lazily on first use,
// so the app still boots for work that never touches a DOB.
//
// Key rotation (docs/dob-encryption-rollback.md): the service holds a key RING, not one key. Writes always use the
// current key (DOB_ENCRYPTION_KEY, version DOB_ENCRYPTION_KEY_VERSION, default 1); reads use whichever key the stored
// value's own "v<N>:" prefix names (the current key, or DOB_ENCRYPTION_KEY_PREVIOUS for version N-1). Unset
// version/previous = exactly the old single-key behaviour. The public method names and signatures are unchanged.
@Injectable()
export class DobEncryptionService {
  private ring?: DobKeyRing;

  constructor(private readonly config: ConfigService) {}

  private getKey(): DobKeyRing {
    if (!this.ring) {
      this.ring = parseDobKeyRing({
        DOB_ENCRYPTION_KEY: this.config.get<string>('DOB_ENCRYPTION_KEY'),
        DOB_ENCRYPTION_KEY_VERSION: this.config.get<string>('DOB_ENCRYPTION_KEY_VERSION'),
        DOB_ENCRYPTION_KEY_PREVIOUS: this.config.get<string>('DOB_ENCRYPTION_KEY_PREVIOUS'),
      });
    }
    return this.ring;
  }

  encrypt(dob: Date): string {
    return encryptDob(dob, this.getKey());
  }

  decrypt(value: string): Date {
    return decryptDob(value, this.getKey());
  }

  decryptNullable(value: string | null): Date | null {
    return value === null ? null : this.decrypt(value);
  }

  // backend/b086-two-factor (Decision Log #405 item 8): the TOTP secrets are encrypted with THIS key, by THIS code
  // (AES-256-GCM, "v<N>:<iv>:<tag>:<ct>"), so one DOB_ENCRYPTION_KEY protects both. Generic string variants over the
  // existing exported functions; the date-of-birth methods above and their stored format are unchanged. Losing the
  // key makes the stored secrets unrecoverable too; rotating it re-encrypts both together (docs/dob-encryption-rollback.md).
  encryptString(plaintext: string): string {
    return encryptDobString(plaintext, this.getKey());
  }

  decryptString(value: string): string {
    return decryptDobString(value, this.getKey());
  }
}
