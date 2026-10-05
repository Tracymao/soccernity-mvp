import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptDob, encryptDob, parseDobKey } from './dob-crypto';

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
@Injectable()
export class DobEncryptionService {
  private key?: Buffer;

  constructor(private readonly config: ConfigService) {}

  private getKey(): Buffer {
    if (!this.key) this.key = parseDobKey(this.config.get<string>('DOB_ENCRYPTION_KEY'));
    return this.key;
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
}
