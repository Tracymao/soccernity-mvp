import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// Build Plan Section 5.7: "Password hashing: argon2id. Via node-argon2,
// OWASP's current recommended default."
//
// argon2 (npm package "argon2", GitHub repo node-argon2) defaults
// argon2.hash() to the Argon2id variant with the library's own current
// OWASP-aligned parameters (see the package README's Usage section,
// verified against v0.45.1 on the npm registry before adding this
// dependency) — there is nothing to configure to get argon2id, it is the
// default, not an option we're choosing not to set.
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword);
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      // argon2.verify rejects (rather than resolving false) when given a
      // malformed or foreign hash string. Normalize that into a boolean
      // so callers get a simple pass/fail without needing to know this
      // library's throw behavior.
      return false;
    }
  }
}
